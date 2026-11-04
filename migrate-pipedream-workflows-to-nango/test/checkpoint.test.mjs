import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Store } from '../src/store.mjs';
import { importDeliveredCheckpoint } from '../src/checkpoint.mjs';
const route = JSON.parse(readFileSync(new URL('../fixtures/routes.synthetic.json', import.meta.url)))[0];
const checkpoint = { deliveryId: 'synthetic-source-delivery', action: 'closed', issueId: '987654',
    number: 42, title: 'Synthetic checkpoint', state: 'closed', updatedAt: '2026-11-01T10:00:00Z',
    receipt: { channel: route.slackChannelId, ts: '123.456' } };

test('imported receipt preserves state without creating a resend and deduplicates a later same-ID event', () => {
    const s = new Store(); s.addRoute(route);
    try {
        assert.equal(importDeliveredCheckpoint(s, route, checkpoint).status, 'imported');
        assert.equal(s.inspect().issues[0].state, 'closed');
        assert.equal(s.inspect().outbox[0].attempts, 0);
        assert.equal(s.claim(), null);
        assert.deepEqual(s.accept({integrationId:route.githubIntegrationId, connectionId:route.githubConnectionId,
            repositoryId:route.githubRepositoryId, ...checkpoint, updatedAt:Date.parse(checkpoint.updatedAt)}, Buffer.from('{}')), {status:'duplicate'});
        assert.throws(() => importDeliveredCheckpoint(s, route, checkpoint), /already exists/);
        assert.equal(s.inspect().deliveries.length, 1);
    } finally { s.close(); }
});

test('import refuses wrong destinations and untrusted routes before changing state', () => {
    const s = new Store(); s.addRoute(route);
    try {
        assert.throws(() => importDeliveredCheckpoint(s, route, {...checkpoint,receipt:{channel:'CWRONG',ts:'123.456'}}), /Invalid/);
        assert.throws(() => importDeliveredCheckpoint(s, {...route,customerId:'wrong'}, checkpoint), /Route/);
        assert.equal(s.inspect().deliveries.length, 0);
    } finally { s.close(); }
});

test('import rolls back delivery and issue changes if receipt persistence fails', () => {
    const s = new Store(); s.addRoute(route);
    try {
        s.db.exec("CREATE TRIGGER fail_import BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END");
        assert.throws(() => importDeliveredCheckpoint(s, route, checkpoint), /injected storage failure/);
        assert.equal(s.inspect().deliveries.length, 0);
        assert.equal(s.inspect().issues.length, 0);
    } finally { s.close(); }
});
