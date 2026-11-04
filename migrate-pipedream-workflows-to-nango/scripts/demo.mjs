import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { receive } from '../src/receiver.mjs';
import { runOnce } from '../src/worker.mjs';
import action from '../slack/actions/migration-send-message.ts';
import { route, event, signed, sent } from '../test/helpers.mjs';

mkdirSync('data', { recursive: true });
const directory = mkdtempSync('data/demo-');
const store = new Store(`${directory}/migration.sqlite`);
const posted = [];
try {
    store.addRoute(route);
    const receiveEvent = (body, delivery) => receive({ store, ...signed(body, delivery) }).body;
    const opened = receiveEvent(event(), 'demo-opened');
    const duplicate = receiveEvent(event(), 'demo-opened');
    const closed = event();
    closed.payload.action = 'closed'; closed.payload.issue.state = 'closed';
    closed.payload.issue.updated_at = '2026-11-01T10:01:00Z';
    receiveEvent(closed, 'demo-closed');
    const fakeProvider = { post: async request => {
        posted.push(request.data);
        return { data: { ok: true, channel: request.data.channel, ts: `1793527200.00000${posted.length}` } };
    } };
    const send = job => action.exec(fakeProvider, { channel_id: job.slack_channel_id, text: job.text });
    await runOnce({ store, send });
    await runOnce({ store, send });
    const reopened = event(); reopened.payload.action = 'reopened';
    reopened.payload.issue.updated_at = '2026-11-01T10:02:00Z';
    receiveEvent(reopened, 'demo-reopened');
    await runOnce({ store, timeoutMs: 5, leaseMs: 20, send: async () => {
        // Model a remote acceptance whose response arrives after our timeout.
        await new Promise(resolve => setTimeout(resolve, 20)); return sent;
    } });
    const unknown = receiveEvent({ ...event(), connectionId: 'unknown-connection' }, 'demo-unknown');
    assert.equal(await runOnce({ store, send }), null);
    const state = store.inspect();
    assert.equal(duplicate.status, 'duplicate');
    assert.equal(posted.length, 2);
    assert.deepEqual(state.outbox.map(job => job.status), ['sent', 'sent', 'uncertain']);
    const report = {
        validation: 'synthetic-local-only', realProviderRequests: 0,
        opened, duplicate, unknown,
        finalIssueState: state.issues[0].state,
        notificationStates: state.outbox.map(job => job.status),
        mockSlackRequests: posted,
        note: 'No connected GitHub repository, Pipedream export, or Slack account was used.'
    };
    writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    console.log(`Saved report and database: ${resolve(directory)}`);
} finally { store.close(); }
