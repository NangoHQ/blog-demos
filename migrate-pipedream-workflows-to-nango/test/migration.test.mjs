import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { Store } from '../src/store.mjs';
import { receive, createReceiver } from '../src/receiver.mjs';
import { runOnce } from '../src/worker.mjs';
import { route, event, signed, signingKey, sent } from './helpers.mjs';

function setup(t) {
    const store = new Store();
    store.addRoute(route);
    t.after(() => store.close());
    return store;
}
const deliver = (store, body = event(), delivery) => receive({ store, ...signed(body, delivery) });

test('a verified event persists the support issue and one notification using the trusted route', t => {
    const store = setup(t);
    const body = event();
    body.payload.slackConnectionId = 'attacker';
    body.payload.issue.title = '<!channel> & test';
    assert.equal(deliver(store, body).body.status, 'accepted');
    const state = store.inspect();
    assert.equal(state.issues[0].state, 'open');
    assert.equal(state.outbox[0].slack_connection_id, route.slackConnectionId);
    assert.equal(state.outbox[0].text, 'GitHub issue #42 opened: &lt;!channel&gt; &amp; test');
});

test('signature validation uses raw bytes and rejects missing or malformed signatures', t => {
    const store = setup(t);
    for (const signature of [undefined, '', '0'.repeat(64), 'z'.repeat(64)]) {
        assert.equal(receive({ store, ...signed(event(), 'x', { 'x-nango-hmac-sha256': signature }) }).code, 401);
    }
    const request = signed();
    request.raw = Buffer.concat([request.raw, Buffer.from(' ')]);
    assert.equal(receive({ store, ...request }).code, 401);
    assert.equal(store.inspect().deliveries.length, 0);
});

test('unverified, unattributed, unknown-tenant and wrong-repository events are quarantined', t => {
    const store = setup(t);
    const cases = [
        signed(event(), '1', { 'x-nango-webhook-unverified': 'true' }),
        signed({ ...event(), unverified: true }),
        signed(event().payload),
        signed({ ...event(), connectionId: 'unknown' }),
        signed({ ...event(), providerConfigKey: 'wrong' }),
        signed({ ...event(), payload: { ...event().payload, repository: { id: 999 } } })
    ];
    for (const request of cases) assert.equal(receive({ store, ...request }).body.status, 'quarantined');
    assert.equal(store.inspect().outbox.length, 0);
    assert.equal(store.inspect().quarantine.length, cases.length);
});

test('malformed fields and missing provider headers cannot produce writes', t => {
    const store = setup(t);
    for (const issue of [null, { ...event().payload.issue, id: Number.MAX_SAFE_INTEGER + 1 },
        { ...event().payload.issue, updated_at: '2026-02-31T10:00:00Z' },
        { ...event().payload.issue, state: 'closed' }, { ...event().payload.issue, title: [] }]) {
        const body = event(); body.payload.issue = issue;
        assert.equal(deliver(store, body).body.status, 'quarantined');
    }
    for (const overrides of [{ 'x-github-event': undefined }, { 'x-github-delivery': '' }]) {
        assert.equal(receive({ store, ...signed(event(), 'x', overrides) }).body.status, 'quarantined');
    }
    assert.equal(store.inspect().outbox.length, 0);
});

test('verified auth callbacks, pings and unsupported issue actions are acknowledged separately', t => {
    const store = setup(t);
    const edited = event(); edited.payload.action = 'edited';
    for (const request of [signed({ type: 'auth', success: true }), signed(event(), 'x', { 'x-github-event': 'ping' }), signed(edited)]) {
        assert.equal(receive({ store, ...request }).body.status, 'ignored');
    }
    assert.equal(store.inspect().deliveries.length, 0);
});

test('duplicate events and changed payloads sharing a delivery ID do not enqueue again', t => {
    const store = setup(t);
    deliver(store);
    assert.equal(deliver(store).body.status, 'duplicate');
    const changed = event(); changed.payload.issue.title = 'Changed';
    assert.equal(deliver(store, changed).body.reason, 'delivery_id_conflict');
    assert.equal(store.inspect().outbox.length, 1);
});

test('out-of-order updates preserve newer state but retain each unseen notification', t => {
    const store = setup(t);
    const newer = event(); newer.payload.action = 'closed'; newer.payload.issue.state = 'closed';
    newer.payload.issue.updated_at = '2026-11-01T10:01:00Z';
    deliver(store, newer, 'newer');
    deliver(store, event(), 'older');
    const state = store.inspect();
    assert.equal(state.issues[0].state, 'closed');
    assert.equal(state.outbox.length, 2);
    assert.match(state.outbox[1].text, /opened/);
});

test('conflicting snapshots with equal timestamps are flagged for reconciliation', t => {
    const store = setup(t);
    deliver(store);
    const changed = event(); changed.payload.issue.title = 'Different title';
    deliver(store, changed, 'different');
    assert.equal(store.inspect().issues[0].needs_reconciliation, 1);
    assert.equal(store.inspect().issues[0].title, event().payload.issue.title);
});

test('a failed outbox insert rolls back the event and issue together', t => {
    const store = setup(t);
    store.db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END;");
    assert.throws(() => deliver(store), /simulated disk failure/);
    assert.equal(store.inspect().deliveries.length, 0);
    assert.equal(store.inspect().issues.length, 0);
});

test('fan-out deduplicates within one customer and isolates different customers', t => {
    const store = setup(t);
    store.addRoute({ ...route, githubConnectionId: 'connection-2' });
    store.addRoute({ ...route, githubConnectionId: 'connection-3', customerId: 'customer-2', slackChannelId: 'COTHER' });
    deliver(store);
    assert.equal(deliver(store, { ...event(), connectionId: 'connection-2' }).body.status, 'duplicate');
    assert.equal(deliver(store, { ...event(), connectionId: 'connection-3' }).body.status, 'accepted');
    assert.deepEqual(store.inspect().outbox.map(row => row.slack_channel_id), [route.slackChannelId, 'COTHER']);
    assert.throws(() => store.addRoute({ ...route, customerId: 'hijacked' }), /UNIQUE/);
});

test('independent receiver threads share durable deduplication across SQLite connections', async t => {
    const directory = mkdtempSync(join(tmpdir(), 'con-337-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, 'test.sqlite');
    const first = new Store(path); first.addRoute(route); first.close();
    const results = await Promise.all(Array.from({ length: 6 }, () => new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./accept-thread.mjs', import.meta.url), { workerData: { path } });
        let result;
        worker.once('message', value => { result = value; });
        worker.once('error', reject);
        worker.once('exit', code => code === 0 ? resolve(result) : reject(new Error(`Worker exited ${code}`)));
    })));
    assert.equal(results.filter(result => result.body.status === 'accepted').length, 1);
    const reopened = new Store(path);
    try { assert.equal(reopened.inspect().outbox.length, 1); }
    finally { reopened.close(); }
});

test('competing workers send once and record the Slack receipt', async t => {
    const store = setup(t); deliver(store);
    let calls = 0;
    const send = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return sent; };
    await Promise.all([runOnce({ store, send }), runOnce({ store, send })]);
    assert.equal(calls, 1);
    assert.equal(store.inspect().outbox[0].status, 'sent');
    assert.equal(store.inspect().outbox[0].result_ts, sent.ts);
});

test('a timeout after acceptance stays uncertain and is never automatically resent', async t => {
    const store = setup(t); deliver(store);
    let calls = 0;
    const send = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 25)); return sent; };
    await runOnce({ store, send, timeoutMs: 5, leaseMs: 20 });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(store.inspect().outbox[0].status, 'uncertain');
    assert.equal(await runOnce({ store, send }), null);
    assert.equal(calls, 1);
});

test('rate limits respect Retry-After and stop after a bounded number of attempts', async t => {
    const store = setup(t); deliver(store);
    let now = Date.now() + 1000;
    const send = async () => ({ status: 'rate_limited', retryAfterSeconds: 10 });
    for (let count = 1; count <= 5; count++) {
        await runOnce({ store, send, now: () => now });
        assert.equal(store.inspect().outbox[0].attempts, count);
        assert.equal(await runOnce({ store, send, now: () => now + 9999 }), null);
        now += 10_000;
    }
    assert.equal(store.inspect().outbox[0].status, 'rejected');
});

test('revoked auth and lost channel access stay visible for operator recovery', async t => {
    const store = setup(t);
    for (const error of ['token_revoked', 'not_in_channel']) {
        deliver(store, event(), error);
        await runOnce({ store, send: async () => ({ status: 'rejected', error }) });
    }
    assert.deepEqual(store.inspect().outbox.map(row => row.status), ['rejected', 'rejected']);
    assert.equal(store.inspect().issues.length, 1);
});

test('unknown failures, malformed receipts and unexpected destinations stay uncertain', async t => {
    const store = setup(t);
    const senders = [async () => { throw new Error('transport'); }, async () => ({ ...sent, channel: 'CWRONG' }),
        async () => ({ ok: true }), async () => ({ status: 'rate_limited', retryAfterSeconds: -1 })];
    for (const [i, send] of senders.entries()) {
        deliver(store, event(), `case-${i}`);
        await runOnce({ store, send });
    }
    assert.ok(store.inspect().outbox.every(row => row.status === 'uncertain'));
});

test('expired worker leases become uncertain; only the original lease can resolve them', t => {
    const store = setup(t); deliver(store);
    const now = Date.now() + 1000;
    const claimed = store.claim(now, 10);
    assert.equal(store.claim(now + 11), null);
    assert.equal(store.inspect().outbox[0].status, 'uncertain');
    assert.equal(store.finish({ ...claimed, lease_token: 'wrong-token' }, sent), 0);
    assert.equal(store.finish(claimed, sent), 1);
    assert.equal(store.inspect().outbox[0].status, 'sent');
});

test('HTTP receiver accepts concurrent signed requests and rejects oversized payloads', async t => {
    const store = setup(t);
    const server = createReceiver({ store, signingKey, maxBytes: 2000 });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const url = `http://127.0.0.1:${server.address().port}/webhooks/nango`;
    const request = signed();
    const results = await Promise.all(Array.from({ length: 10 }, async () => {
        const response = await fetch(url, { method: 'POST', headers: request.headers, body: request.raw });
        assert.equal(response.status, 200);
        return response.json();
    }));
    assert.equal(results.filter(result => result.status === 'accepted').length, 1);
    assert.equal(store.inspect().outbox.length, 1);
    const tooBig = await fetch(url, { method: 'POST', body: 'x'.repeat(2001) });
    assert.equal(tooBig.status, 413);
    store.db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'disk'); END;");
    const next = signed(event(), 'different');
    const failed = await fetch(url, { method: 'POST', headers: next.headers, body: next.raw });
    assert.equal(failed.status, 503);
    assert.equal(store.inspect().deliveries.length, 1);
});
