import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('local app authenticates requests and rejects client-selected connections', async () => {
  const child = spawn(process.execPath, ['dist/src/server.js', 'starter'], {
    env: { PATH: process.env.PATH, PORT: '3611', DEMO_USERNAME: 'test-user', DEMO_PASSWORD: 'local-test-password-only' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out: ' + stderr)), 10000);
      child.stdout.on('data', chunk => { if (String(chunk).includes('agent:')) { clearTimeout(timer); resolve(); } });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Server startup failed: ' + stderr)); });
      child.once('error', reject);
    });
    const base = 'http://127.0.0.1:3611';
    const authorization = `Basic ${Buffer.from('test-user:local-test-password-only').toString('base64')}`;
    assert.equal((await fetch(base)).status, 401);
    const home = await fetch(base, { headers: { authorization } });
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.ok(html.includes('Starter:'));
    assert.ok(!html.includes('local-test-password-only'));
    const injected = await fetch(base + '/api/chat', { method: 'POST', headers: { authorization, 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ question: 'Read my tasks', connectionId: 'someone-else' }) });
    assert.equal(injected.status, 400);
    assert.equal((await injected.json() as { error: string }).error, 'Send a question only.');
    const crossOrigin = await fetch(base + '/api/reset', { method: 'POST', headers: { authorization, 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: '{}' });
    assert.equal(crossOrigin.status, 403);
  } finally {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  }
});
