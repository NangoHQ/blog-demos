import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, connectSession, integration } from './session.mjs';

test('a missing connection stops client setup before any MCP request', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('unexpected request'); };
  try {
    await assert.rejects(connectSession({
      toolset: { [integration]: { connected: false } },
      mcp_url: 'https://api.nango.dev/session/fixture/mcp',
      session_token: 'fixture-only'
    }), { code: 'ERR_ASSERTION' });
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the missing-connection probe sends only its selector, not the normal pin', async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.NANGO_API_KEY;
  const previousConnection = process.env.NANGO_CONNECTION_ID;
  process.env.NANGO_API_KEY = 'fixture-only';
  process.env.NANGO_CONNECTION_ID = 'must-not-be-pinned';
  const connections = { any: [{ tags: { con270_missing_connection: 'fixture-only' } }] };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.nango.dev/sessions');
    assert.deepEqual(JSON.parse(options.body).tenant.connections, connections);
    assert.ok(!options.body.includes('must-not-be-pinned'));
    return Response.json({ data: { toolset: { [integration]: { connected: false } } } });
  };
  try {
    const session = await createSession('read-inbox-summary', '60s', connections);
    assert.equal(session.toolset[integration].connected, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.NANGO_API_KEY;
    else process.env.NANGO_API_KEY = previousKey;
    if (previousConnection === undefined) delete process.env.NANGO_CONNECTION_ID;
    else process.env.NANGO_CONNECTION_ID = previousConnection;
  }
});
