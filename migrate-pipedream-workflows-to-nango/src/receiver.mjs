import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const actions = new Set(['opened', 'closed', 'reopened']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => Number.isSafeInteger(value) && value > 0 ? String(value)
    : typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) ? value : null;
const identifier = value => typeof value === 'string' && /^[\w.:-]{1,200}$/.test(value);

export function receive({ store, signingKey, raw, headers, now = Date.now() }) {
    if (!signingKey) throw new Error('NANGO_WEBHOOK_SIGNING_KEY is required');
    const signature = headers['x-nango-hmac-sha256'];
    const expected = createHmac('sha256', signingKey).update(raw).digest();
    if (typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature) ||
        !timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
        return { code: 401, body: { status: 'invalid_signature' } };
    }
    let body;
    try { body = JSON.parse(raw.toString('utf8')); }
    catch { return { code: 400, body: { status: 'invalid_json' } }; }
    const quarantine = reason => ({ code: 202, body: store.quarantine(raw, reason, now) });
    if (!object(body)) return quarantine('invalid_envelope');
    if (String(headers['x-nango-webhook-unverified']).toLowerCase() === 'true' || body.unverified === true) {
        return quarantine('unverified_provider');
    }
    // This example does not provision tenants from auth callbacks. Keep them separate.
    if (['auth', 'sync', 'async'].includes(body.type)) return { code: 200, body: { status: 'ignored' } };
    if (body.type !== 'forward' || !identifier(body.providerConfigKey) || !identifier(body.connectionId) || !object(body.payload)) {
        return quarantine('unattributed_or_invalid_envelope');
    }
    if (headers['x-github-event'] === 'ping') return { code: 200, body: { status: 'ignored' } };
    if (headers['x-github-event'] !== 'issues') return quarantine('unexpected_event_type');
    if (!identifier(headers['x-github-delivery'])) return quarantine('missing_delivery_id');
    if (typeof body.payload.action !== 'string') return quarantine('invalid_action');
    if (!actions.has(body.payload.action)) return { code: 200, body: { status: 'ignored' } };
    const { issue, repository, action } = body.payload;
    if (!object(issue) || !object(repository) || !id(repository.id) || !id(issue.id) ||
        !Number.isSafeInteger(issue.number) || issue.number <= 0 ||
        typeof issue.title !== 'string' || issue.title.length > 1024 ||
        !['open', 'closed'].includes(issue.state) ||
        issue.state !== (action === 'closed' ? 'closed' : 'open') ||
        typeof issue.updated_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(issue.updated_at) ||
        !Number.isFinite(Date.parse(issue.updated_at)) ||
        new Date(issue.updated_at).toISOString().replace('.000Z', 'Z') !== issue.updated_at) {
        return quarantine('invalid_issue');
    }
    const result = store.accept({
        integrationId: body.providerConfigKey, connectionId: body.connectionId,
        deliveryId: headers['x-github-delivery'], repositoryId: id(repository.id), issueId: id(issue.id),
        number: issue.number, title: issue.title, state: issue.state, updatedAt: Date.parse(issue.updated_at), action
    }, raw, now);
    return { code: result.status === 'quarantined' ? 202 : 200, body: result };
}

export function createReceiver({ store, signingKey, maxBytes = 1024 * 1024 }) {
    if (!signingKey) throw new Error('NANGO_WEBHOOK_SIGNING_KEY is required');
    const server = createServer(async (req, res) => {
        const reply = (code, body) => {
            res.writeHead(code, { 'content-type': 'application/json' });
            res.end(JSON.stringify(body));
        };
        if (req.method === 'GET' && req.url === '/health') return reply(200, { status: 'ok' });
        if (req.method !== 'POST' || req.url !== '/webhooks/nango') return reply(404, { status: 'not_found' });
        try {
            let size = 0;
            const chunks = [];
            for await (const chunk of req) {
                size += chunk.length;
                if (size > maxBytes) { reply(413, { status: 'payload_too_large' }); return; }
                chunks.push(chunk);
            }
            const result = receive({ store, signingKey, raw: Buffer.concat(chunks), headers: req.headers });
            reply(result.code, result.body);
        } catch {
            // A persistence failure must cause a retry, not a false acknowledgment.
            reply(503, { status: 'temporarily_unavailable' });
        }
    });
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    return server;
}
