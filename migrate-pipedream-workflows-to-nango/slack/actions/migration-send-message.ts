import { createAction } from 'nango';
import { z } from 'zod';

const output = z.discriminatedUnion('status', [
    z.object({ status: z.literal('sent'), channel: z.string(), ts: z.string() }),
    z.object({ status: z.literal('rate_limited'), retryAfterSeconds: z.number().int().min(1).max(86400) }),
    z.object({ status: z.literal('rejected'), error: z.string() }),
    z.object({ status: z.literal('uncertain'), error: z.string() })
]);

// Only explicit, known rejections are eligible for a later operator-approved retry.
const rejectedErrors = new Set([
    'invalid_auth', 'not_authed', 'token_revoked', 'token_expired', 'account_inactive',
    'missing_scope', 'channel_not_found', 'not_in_channel', 'is_archived',
    'restricted_action', 'restricted_action_read_only_channel', 'no_text', 'msg_too_long'
]);

export default createAction({
    description: 'Post one migration notification, preserving definite rejections and uncertain outcomes.',
    version: '1.0.0',
    scopes: ['chat:write'],
    input: z.object({ channel_id: z.string().regex(/^[CG][A-Z0-9]+$/), text: z.string().min(1).max(4000) }),
    output,
    exec: async (nango, input): Promise<z.infer<typeof output>> => {
        let response;
        try {
            response = await nango.post({
                endpoint: 'chat.postMessage',
                retries: 0,
                data: {
                    channel: input.channel_id, text: input.text,
                    mrkdwn: false, parse: 'none', unfurl_links: false, unfurl_media: false
                }
            });
        } catch (error: unknown) {
            const rejection = (error as { response?: { status?: number; headers?: Record<string, unknown> } })?.response;
            if (rejection?.status === 429) {
                const seconds = Number(rejection.headers?.['retry-after']);
                if (Number.isInteger(seconds) && seconds >= 1 && seconds <= 86400) {
                    return { status: 'rate_limited', retryAfterSeconds: seconds };
                }
            }
            return { status: 'uncertain', error: 'provider_response_unconfirmed' };
        }
        const body = response.data;
        if (body?.ok === true && body.channel === input.channel_id && typeof body.ts === 'string' && /^\d+\.\d+$/.test(body.ts)) {
            return { status: 'sent', channel: body.channel, ts: body.ts };
        }
        if (body?.ok === false && typeof body.error === 'string' && rejectedErrors.has(body.error)) {
            return { status: 'rejected', error: body.error };
        }
        return { status: 'uncertain', error: 'provider_response_unconfirmed' };
    }
});
