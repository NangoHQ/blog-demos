import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createSession, connectSession, terminateSession, toolName, integration } from './session.mjs';

async function withSession(action, fn) {
  const session = await createSession(action, '60s');
  let client;
  try { client = await connectSession(session); await fn(client, session); }
  finally {
    try { if (client) await client.close(); }
    finally { await terminateSession(session); }
  }
  return session;
}
async function requireEnded(session) {
  const response = await fetch(session.mcp_url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${session.session_token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
  });
  assert.equal(response.status, 401);
}
let stage = 'control';
try {
  const probe = 'google-mail-readonly__denied-probe';
  await withSession('denied-probe', async client => {
    const result = await client.callTool({ name: probe, arguments: {} });
    assert.ok(!result.isError);
    const data = result.structuredContent ?? JSON.parse(result.content.find(x => x.type === 'text').text);
    assert.equal(data.executed, true);
  });
  console.log('Control: probe executed when allowed.');
  stage = 'exclusion';
  const ended = await withSession('read-inbox-summary', async client => {
    const listed = await client.listTools();
    assert.ok(!listed.nextCursor);
    assert.deepEqual(listed.tools.map(x => x.name), [toolName]);
    await assert.rejects(client.callTool({ name: probe, arguments: {} }), error =>
      error.code === -32602 && /tool.*not found|unknown tool/i.test(error.message));
  });
  console.log('Restricted session: probe excluded.');
  stage = 'termination';
  await requireEnded(ended);
  console.log('Terminated session: HTTP 401.');
  if (process.argv.includes('--missing-connection')) {
    stage = 'missing_connection';
    const session = await createSession('read-inbox-summary', '60s', {
      any: [{ tags: { con270_missing_connection: randomUUID() } }]
    });
    try {
      assert.equal(session.toolset[integration]?.connected, false);
      await assert.rejects(connectSession(session), { code: 'ERR_ASSERTION' });
      console.log('Missing connection: connected=false; client setup rejected.');
    } finally {
      await terminateSession(session);
    }
  }
  if (process.argv.includes('--expiry')) {
    stage = 'expiry';
    const session = await createSession('read-inbox-summary', '60s');
    try {
      const deadline = Date.parse(session.expires_at) + 1000;
      assert.ok(Number.isFinite(deadline) && deadline - Date.now() <= 65000);
      while (Date.now() < deadline) await delay(Math.min(30000, deadline - Date.now()));
      await requireEnded(session);
      console.log('Expired session: HTTP 401.');
    } finally { await terminateSession(session); }
  }
} catch {
  console.error(JSON.stringify({ error: 'verification_failed', stage }));
  process.exitCode = 1;
}
