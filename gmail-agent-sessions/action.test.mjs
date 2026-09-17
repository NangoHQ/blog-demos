import test from 'node:test';
import assert from 'node:assert/strict';
import action from './google-mail-readonly/actions/read-inbox-summary.ts';
import probe from './google-mail-readonly/actions/denied-probe.ts';

test('Gmail action enforces five reads, fixed fields, redaction, and text limits', async () => {
  const requests = [];
  const subject = `${'s'.repeat(195)}ya29.fixture-token`;
  const snippet = `${'x'.repeat(495)}Bearer fixture-token`;
  const nango = {
    async get(request) {
      requests.push(request);
      if (requests.length === 1) {
        assert.deepEqual(request, {
          endpoint: '/gmail/v1/users/me/messages',
          params: { labelIds: 'INBOX', maxResults: 5 }
        });
        return { data: {
          messages: Array.from({ length: 6 }, (_, i) => ({ id: `message/${i}` })),
          nextPageToken: 'must-not-follow'
        } };
      }
      assert.deepEqual(request, {
        endpoint: `/gmail/v1/users/me/messages/message%2F${requests.length - 2}`,
        params: { format: 'full', fields: 'id,snippet,payload/headers' }
      });
      return { data: { snippet, payload: { headers: [{ name: 'sUbJeCt', value: subject }] } } };
    }
  };
  const result = await action.exec(nango, {});
  assert.equal(requests.length, 6);
  assert.equal(result.messages.length, 5);
  for (const message of result.messages) {
    assert.deepEqual(Object.keys(message).sort(), ['id', 'snippet', 'subject']);
    assert.equal(message.subject, `${'s'.repeat(195)}[REDA`);
    assert.equal(message.snippet, `${'x'.repeat(495)}Beare`);
  }
});

test('Gmail action redacts supported token patterns before returning text', async () => {
  let count = 0;
  const nango = { async get() {
    if (++count === 1) return { data: { messages: [{ id: 'fixture' }] } };
    return { data: {
      snippet: 'Bearer fixture-bearer nango_agent_session_fixture-session ya29.fixture-google access_token=fixture-access refresh_token:fixture-refresh api_key=fixture-key',
      payload: { headers: [] }
    } };
  } };
  const result = await action.exec(nango, {});
  assert.equal(result.messages[0].subject, '');
  assert.equal(result.messages[0].snippet,
    'Bearer [REDACTED] [REDACTED] [REDACTED] access_token=[REDACTED] refresh_token:[REDACTED] api_key=[REDACTED]');
});

test('Gmail action handles an empty inbox and rejects caller-controlled queries', async () => {
  let calls = 0;
  const nango = { async get() { calls++; return { data: {} }; } };
  assert.deepEqual(await action.exec(nango, {}), { messages: [] });
  assert.equal(calls, 1);
  await assert.rejects(action.exec(nango, { q: 'from:anyone' }));
  assert.equal(calls, 1);
});

test('control probe returns its marker without accessing a provider', async () => {
  const context = new Proxy({}, { get() { throw new Error('unexpected provider access'); } });
  assert.deepEqual(await probe.exec(context, {}), { executed: true });
});
