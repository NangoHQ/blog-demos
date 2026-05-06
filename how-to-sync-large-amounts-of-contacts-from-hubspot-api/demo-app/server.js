import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadEnv({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT) || 3000;
const NANGO_HOST = process.env.NANGO_HOST || 'https://api.nango.dev';
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY || process.env.NANGO_SECRET_KEY_DEV;
// Falls back to the secret key (matches the Node SDK's verifyIncomingWebhookRequest behavior).
const NANGO_WEBHOOK_SIGNING_KEY = process.env.NANGO_WEBHOOK_SIGNING_KEY || NANGO_SECRET_KEY;
const PROVIDER_CONFIG_KEY = 'hubspot';
const MODEL = 'HubspotContact';
const SYNC_NAME = 'fetch-contacts';
const PAGE_LIMIT = 100;
const WEBHOOK_HISTORY_LIMIT = 25;

if (!NANGO_SECRET_KEY) {
    console.error('Missing NANGO_SECRET_KEY (or NANGO_SECRET_KEY_DEV). Copy .env.example to .env and fill it in.');
    process.exit(1);
}

const app = express();
app.use(
    express.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf.toString('utf8');
        }
    })
);
app.use(express.static(path.join(__dirname, 'public')));

// Per-connection in-memory cache.
const connectionStates = new Map();

function getState(connectionId) {
    let state = connectionStates.get(connectionId);
    if (!state) {
        state = {
            records: new Map(),
            lastCursor: null,
            totalCount: 0,
            webhookHistory: [],
            sseClients: new Set(),
            initialized: false,
            initializing: null
        };
        connectionStates.set(connectionId, state);
    }
    return state;
}

app.get('/api/config', (_req, res) => {
    res.json({
        providerConfigKey: PROVIDER_CONFIG_KEY,
        model: MODEL,
        syncName: SYNC_NAME
    });
});

app.post('/api/connect/session', async (req, res) => {
    const endUser = req.body?.endUser ?? {
        id: `demo-user-${Date.now()}`,
        display_name: 'Demo User'
    };
    await proxyToNango(res, '/connect/sessions', {
        method: 'POST',
        body: JSON.stringify({
            end_user: endUser,
            allowed_integrations: [PROVIDER_CONFIG_KEY]
        })
    });
});

app.get('/api/state', async (req, res) => {
    const connectionId = String(req.query.connection_id ?? '');
    if (!connectionId) {
        return res.status(400).json({ error: 'connection_id query param is required' });
    }
    try {
        const state = await ensureInitialized(connectionId);
        res.json(snapshot(state));
    } catch (err) {
        res.status(502).json({ error: 'Failed to load records', detail: String(err.message ?? err) });
    }
});

app.post('/api/sync/trigger', async (req, res) => {
    const connectionId = req.body?.connection_id;
    if (!connectionId) {
        return res.status(400).json({ error: 'connection_id is required' });
    }
    await proxyToNango(res, '/sync/trigger', {
        method: 'POST',
        body: JSON.stringify({
            syncs: [SYNC_NAME],
            provider_config_key: PROVIDER_CONFIG_KEY,
            connection_id: connectionId
        })
    });
});

app.get('/api/events', (req, res) => {
    const connectionId = String(req.query.connection_id ?? '');
    if (!connectionId) {
        return res.status(400).json({ error: 'connection_id query param is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const state = getState(connectionId);
    state.sseClients.add(res);
    sendSse(res, 'hello', { connectionId });

    const heartbeat = setInterval(() => {
        try {
            res.write(': keepalive\n\n');
        } catch {
            /* client gone */
        }
    }, 25_000);

    req.on('close', () => {
        clearInterval(heartbeat);
        state.sseClients.delete(res);
    });
});

app.post('/api/webhooks/nango', async (req, res) => {
    const signatureHeader = req.headers['x-nango-hmac-sha256'];
    const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});

    if (!verifySignature(rawBody, signatureHeader)) {
        console.warn('[webhook] signature mismatch — rejecting');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = req.body;
    res.status(200).json({ received: true });

    if (!payload || typeof payload !== 'object') return;

    const receivedAt = new Date().toISOString();
    const event = { ...payload, receivedAt };

    if (payload.type !== 'sync') {
        // We only act on sync events for this demo, but log everything to the webhook panel.
        if (payload.connectionId) {
            const state = getState(payload.connectionId);
            recordWebhook(state, event);
        }
        return;
    }

    const connectionId = payload.connectionId;
    if (!connectionId) return;

    const state = getState(connectionId);
    recordWebhook(state, event);

    if (payload.success === false) {
        broadcast(state, { type: 'sync-error', payload: event });
        return;
    }

    try {
        const changed = await fetchChanges(connectionId, state);
        applyChanges(state, changed);
        broadcast(state, {
            type: 'records-changed',
            records: changed.map((r) => stripped(r)),
            totalCount: state.totalCount,
            webhookId: receivedAt
        });
    } catch (err) {
        console.error('[webhook] failed to fetch changed records', err);
        broadcast(state, {
            type: 'fetch-error',
            message: String(err.message ?? err),
            webhookId: receivedAt
        });
    }
});

function recordWebhook(state, event) {
    state.webhookHistory.unshift(event);
    if (state.webhookHistory.length > WEBHOOK_HISTORY_LIMIT) {
        state.webhookHistory.length = WEBHOOK_HISTORY_LIMIT;
    }
    broadcast(state, { type: 'webhook', payload: event });
}

function verifySignature(rawBody, signatureHeader) {
    if (typeof signatureHeader !== 'string' || !signatureHeader) return false;
    const expected = crypto
        .createHmac('sha256', NANGO_WEBHOOK_SIGNING_KEY)
        .update(rawBody)
        .digest('hex');
    if (expected.length !== signatureHeader.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
    } catch {
        return false;
    }
}

async function ensureInitialized(connectionId) {
    const state = getState(connectionId);
    if (state.initialized) return state;
    if (state.initializing) return state.initializing;

    state.initializing = (async () => {
        const records = await fetchAll(connectionId, null);
        for (const record of records) {
            applyRecord(state, record);
        }
        state.initialized = true;
        return state;
    })();

    try {
        await state.initializing;
    } finally {
        state.initializing = null;
    }
    return state;
}

async function fetchChanges(connectionId, state) {
    return fetchAll(connectionId, state.lastCursor);
}

async function fetchAll(connectionId, startCursor) {
    let cursor = startCursor;
    const results = [];
    let safety = 0;
    while (safety++ < 200) {
        const params = new URLSearchParams({ model: MODEL, limit: String(PAGE_LIMIT) });
        if (cursor) params.set('cursor', cursor);

        const url = `${NANGO_HOST}/records/?${params.toString()}`;
        const upstream = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${NANGO_SECRET_KEY}`,
                Accept: 'application/json',
                'Connection-Id': connectionId,
                'Provider-Config-Key': PROVIDER_CONFIG_KEY
            }
        });

        if (!upstream.ok) {
            const text = await upstream.text();
            throw new Error(`Nango records API returned ${upstream.status}: ${text.slice(0, 200)}`);
        }

        const data = await upstream.json();
        const batch = data.records ?? [];
        results.push(...batch);
        if (!data.next_cursor || batch.length === 0 || data.next_cursor === cursor) break;
        cursor = data.next_cursor;
    }
    if (cursor) {
        const state = connectionStates.get(connectionId);
        if (state) state.lastCursor = cursor;
    }
    return results;
}

function applyChanges(state, records) {
    for (const record of records) {
        applyRecord(state, record);
    }
}

function applyRecord(state, record) {
    if (!record?.id) return;
    const action = record._nango_metadata?.last_action;
    const isDeleted = action === 'DELETED' || record._nango_metadata?.deleted_at != null;
    if (isDeleted) {
        if (state.records.delete(record.id)) {
            state.totalCount = Math.max(0, state.totalCount - 1);
        }
    } else {
        const existed = state.records.has(record.id);
        state.records.set(record.id, record);
        if (!existed) state.totalCount += 1;
    }
}

function snapshot(state) {
    return {
        records: [...state.records.values()].map(stripped),
        totalCount: state.totalCount,
        webhookHistory: state.webhookHistory,
        lastCursor: state.lastCursor
    };
}

function stripped(record) {
    if (!record) return record;
    const { _nango_metadata, ...rest } = record;
    return {
        ...rest,
        last_action: _nango_metadata?.last_action,
        last_modified_at: _nango_metadata?.last_modified_at
    };
}

function sendSse(res, type, data) {
    try {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    } catch {
        /* client gone */
    }
}

function broadcast(state, message) {
    for (const client of state.sseClients) {
        sendSse(client, message.type, message);
    }
}

async function proxyToNango(res, pathSuffix, init) {
    const url = `${NANGO_HOST}${pathSuffix}`;
    const headers = {
        Authorization: `Bearer ${NANGO_SECRET_KEY}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {})
    };
    try {
        const upstream = await fetch(url, { method: init.method, headers, body: init.body });
        const contentType = upstream.headers.get('content-type') ?? 'application/json';
        const body = await upstream.text();
        res.status(upstream.status).type(contentType).send(body);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(502).json({ error: 'Upstream Nango request failed', detail: message });
    }
}

app.listen(PORT, () => {
    console.log(`HubSpot Contacts demo running at http://localhost:${PORT}`);
    console.log(`Sync: ${SYNC_NAME}, Integration: ${PROVIDER_CONFIG_KEY}, Host: ${NANGO_HOST}`);
    console.log(
        'Configure your Nango env Webhook URL to POST to: http://<your-public-host>/api/webhooks/nango'
    );
});
