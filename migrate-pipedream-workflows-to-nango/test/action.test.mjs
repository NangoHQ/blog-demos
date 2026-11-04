import test from 'node:test';
import assert from 'node:assert/strict';
import action from '../slack/actions/migration-send-message.ts';
import { route, sent } from './helpers.mjs';

const input = { channel_id: route.slackChannelId, text: 'Synthetic test' };
test('owned action posts once with retries disabled and returns a confirmed receipt', async () => {
    let calls = 0;
    const result = await action.exec({ post: async request => {
        calls++;
        assert.equal(request.retries, 0);
        assert.equal(request.data.channel, input.channel_id);
        assert.equal(request.data.mrkdwn, false);
        return { data: { ok: true, channel: sent.channel, ts: sent.ts } };
    } }, input);
    assert.equal(calls, 1);
    assert.deepEqual(result, sent);
});

test('owned action preserves definite Slack rate limits including Retry-After', async () => {
    const result = await action.exec({ post: async () => {
        throw { response: { status: 429, headers: { 'retry-after': '30' } } };
    } }, input);
    assert.deepEqual(result, { status: 'rate_limited', retryAfterSeconds: 30 });
});

test('owned action keeps timeouts, server errors, invalid rate limits and unknown Slack errors uncertain', async () => {
    for (const error of [new Error('timeout'), { response: { status: 503 } },
        { response: { status: 429, headers: {} } }, { response: { status: 429, headers: { 'retry-after': '-1' } } }]) {
        const result = await action.exec({ post: async () => { throw error; } }, input);
        assert.equal(result.status, 'uncertain');
    }
    for (const data of [{ ok: false, error: 'fatal_error' }, { ok: true, channel: 'CWRONG', ts: sent.ts }, { ok: true }]) {
        assert.equal((await action.exec({ post: async () => ({ data }) }, input)).status, 'uncertain');
    }
});

test('owned action distinguishes explicit Slack permission and auth rejections', async () => {
    for (const error of ['token_revoked', 'missing_scope', 'not_in_channel']) {
        assert.deepEqual(await action.exec({ post: async () => ({ data: { ok: false, error } }) }, input),
            { status: 'rejected', error });
    }
});

test('action input and output schemas reject invalid contracts', () => {
    assert.equal(action.input.safeParse({ ...input, channel_id: 'arbitrary-channel' }).success, false);
    assert.equal(action.input.safeParse({ ...input, text: '' }).success, false);
    assert.equal(action.output.safeParse(sent).success, true);
    assert.equal(action.output.safeParse({ status: 'rate_limited', retryAfterSeconds: -1 }).success, false);
});
