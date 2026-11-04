import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createNangoSender } from '../src/nango-sender.mjs';
import { route, sent } from './helpers.mjs';

test('pinned Nango SDK sends the owned action contract and makes no automatic retry on server failure', async t => {
    const requests = [];
    let fail = false;
    const server = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        requests.push({ url: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
        res.writeHead(fail ? 503 : 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(fail ? { error: 'synthetic_failure' } : sent));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const send = createNangoSender({ apiKey: 'synthetic-key', host: `http://127.0.0.1:${server.address().port}` });
    const job = { slack_integration_id: 'slack', slack_connection_id: route.slackConnectionId,
        slack_channel_id: route.slackChannelId, text: 'Synthetic test' };
    assert.deepEqual(await send(job), sent);
    assert.equal(requests[0].url, '/action/trigger');
    assert.equal(requests[0].body.action_name, 'migration-send-message');
    assert.deepEqual(requests[0].body.input, { channel_id: route.slackChannelId, text: job.text });
    assert.equal(requests[0].headers['connection-id'], route.slackConnectionId);
    assert.equal(requests[0].headers['provider-config-key'], 'slack');
    fail = true;
    await assert.rejects(() => send(job));
    assert.equal(requests.length, 2);
});
