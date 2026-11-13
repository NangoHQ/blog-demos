import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { runAgent, type Turn } from './agent.js';
import { api, connectionForUser, openSession, required } from './session.js';
const starter = process.argv[2] === 'starter';
const canCreate = process.env.ENABLE_DISCOVERY_PREP === 'true';
const port = Number(process.env.PORT || 3610);
const username = required('DEMO_USERNAME');
const password = required('DEMO_PASSWORD');
if (password === 'replace-with-a-long-local-password' || password.length < 12) throw new Error('Choose a local demo password of at least 12 characters.');
const origin = `http://127.0.0.1:${port}`;
const expectedAuth = Buffer.from(`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
let history: Turn[] = [];
let busy = false;
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function authenticate(req: IncomingMessage): string | undefined {
  const provided = Buffer.from(req.headers.authorization || '');
  return provided.length === expectedAuth.length && timingSafeEqual(provided, expectedAuth) ? username : undefined;
}
async function readQuestion(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 12000) throw new Error('Question is too long.');
  }
  const parsed = JSON.parse(body);
  if (Object.keys(parsed).some(key => key !== 'question') || typeof parsed.question !== 'string' || !parsed.question.trim()) throw new Error('Send a question only.');
  return parsed.question.trim();
}
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Google Tasks agent</title>
<style>body{background:#fff;color:#17212b;font:17px system-ui;max-width:780px;margin:50px auto;padding:24px}h1{font-size:32px}button{background:#165dd7;color:white;border:0;border-radius:8px;padding:12px 18px;cursor:pointer}textarea{box-sizing:border-box;width:100%;padding:14px;font:inherit;border:1px solid #aab5c2;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6fa;padding:18px;border-radius:10px}small{color:#516174}section{margin:24px 0}</style>
<h1>Google Tasks agent</h1><p>${starter ? 'Starter: ask the agent a question. Google Tasks is not connected yet.' : 'Find your tasks and prepare for customer discovery calls.'}</p>
${starter ? '' : `<p><small>${canCreate ? 'Task creation enabled' : 'Read-only access'}</small></p>`}
${starter ? '' : '<button id="connect">Connect Google Tasks</button><p id="connection"></p>'}
<section><textarea id="question" rows="3" placeholder="What tasks are due this week in CON-361 demo?"></textarea></section><button id="ask">Ask agent</button><button id="reset">New conversation</button><pre id="answer" aria-live="polite">Ready.</pre><details><summary>Tool calls</summary><pre id="trace"></pre></details>
<script>
const $=id=>document.getElementById(id);
async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data}
$('ask').onclick=async()=>{ $('ask').disabled=true; $('answer').textContent='Working…';try{const data=await post('/api/chat',{question:$('question').value});$('answer').textContent=data.text;$('trace').textContent=JSON.stringify(data.trace,null,2)}catch(e){$('answer').textContent=e.message}finally{$('ask').disabled=false}};
$('reset').onclick=async()=>{try{await post('/api/reset',{});$('answer').textContent='Ready.';$('trace').textContent=''}catch(e){$('answer').textContent=e.message}};
if($('connect'))$('connect').onclick=async()=>{try{const data=await post('/api/connect',{});const a=document.createElement('a');a.href=data.connectLink;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Authorize Google Tasks, then return here';$('connection').replaceChildren(a)}catch(e){$('connection').textContent=e.message}};
</script></html>`;
export const server = createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}`) { send(res, 403, { error: 'Use the local loopback URL.' }); return; }
  const userId = authenticate(req);
  if (!userId) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Local tutorial", charset="UTF-8"' }); res.end('Sign in with the demo credentials from .env.'); return; }
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(page); return; }
  if (req.method !== 'POST' || (req.headers.origin && req.headers.origin !== origin) || !req.headers['content-type']?.startsWith('application/json')) { send(res, 403, { error: 'Invalid request.' }); return; }
  try {
    if (req.url === '/api/reset') { if (busy) { send(res, 409, { error: 'Wait for the current question.' }); return; } history = []; send(res, 200, {}); return; }
    if (req.url === '/api/connect' && !starter) {
      if (process.env.NANGO_CONNECTION_ID) { send(res, 409, { error: 'This demo uses the connection configured on the server. Clear NANGO_CONNECTION_ID and restart to use Connect.' }); return; }
      const connection = connectionForUser(userId);
      const data = await api('/connect/sessions', 'POST', { tags: connection.tags, allowed_integrations: [connection.integrationId] });
      const link = new URL(data.connect_link);
      if (link.protocol !== 'https:') throw new Error('Invalid Connect link.');
      send(res, 200, { connectLink: link.href }); return;
    }
    if (req.url !== '/api/chat') { send(res, 404, { error: 'Not found.' }); return; }
    if (busy) { send(res, 409, { error: 'Wait for the current question.' }); return; }
    // Application identity and write permission are chosen on the server.
    // No customer ID, connection ID, or permission flag is accepted from the browser/model.
    busy = true;
    try {
      const question = await readQuestion(req);
      const session = starter ? undefined : await openSession(userId, connectionForUser(userId), canCreate);
      let result;
      try { result = await runAgent([...history, { role: 'user', content: question }], session?.client); }
      finally { await session?.close().catch(() => console.error('Session cleanup failed; five-minute expiry still applies.')); }
      history.push({ role: 'user', content: question }, { role: 'assistant', content: result.text });
      history = history.slice(-16);
      send(res, 200, result);
    } finally { busy = false; }
  } catch (error) { send(res, 400, { error: error instanceof Error ? error.message : 'Request failed.' }); }
});
server.listen(port, '127.0.0.1', () => console.log(`${starter ? 'Starter' : 'Finished'} agent: ${origin}`));
