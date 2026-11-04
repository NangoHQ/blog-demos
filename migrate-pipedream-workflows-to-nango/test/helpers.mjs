import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

export const route = JSON.parse(readFileSync(new URL('../fixtures/routes.synthetic.json', import.meta.url), 'utf8'))[0];
const fixture = JSON.parse(readFileSync(new URL('../fixtures/issue-opened.synthetic.json', import.meta.url), 'utf8'));
export const signingKey = 'synthetic-fixture-signing-key';
export const event = () => structuredClone(fixture);
export function signed(body = event(), delivery = 'delivery-1', overrides = {}) {
    const raw = Buffer.from(JSON.stringify(body));
    return {
        raw,
        signingKey,
        headers: {
            'x-nango-hmac-sha256': createHmac('sha256', signingKey).update(raw).digest('hex'),
            'x-github-event': 'issues', 'x-github-delivery': delivery, ...overrides
        }
    };
}
export const sent = { status: 'sent', channel: route.slackChannelId, ts: '1793527200.000001' };
