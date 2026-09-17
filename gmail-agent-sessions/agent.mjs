import { createSession, connectSession, terminateSession, required } from './session.mjs';
import { summarizeInbox } from './assistant.mjs';

let session, client;
let stage = 'configuration';
try {
  const apiKey = required('OPENAI_API_KEY');
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini-2025-04-14';
  const question = process.argv[2] || 'Summarize up to five emails in my inbox.';
  const requestModel = async body => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, store: false, max_output_tokens: 1000, ...body })
    });
    if (!response.ok) throw new Error(`model_http_${response.status}`);
    return response.json();
  };
  stage = 'session';
  session = await createSession();
  client = await connectSession(session);
  stage = 'summary';
  const summary = await summarizeInbox({ client, requestModel, question,
    trace: event => console.log(JSON.stringify(event)) });
  console.log(summary);
} catch (error) {
  const safe = /^(missing_[A-Z_]+|nango_http_\d{3}|model_http_\d{3})$/.test(error.message);
  console.error(JSON.stringify({ error: safe ? error.message : 'request_failed', stage }));
  process.exitCode = 1;
} finally {
  // Close and revoke independently, so a close failure cannot skip revocation.
  if (client) await client.close().catch(() => { process.exitCode = 1; });
  if (session) {
    try {
      await terminateSession(session);
      console.log(JSON.stringify({ session_terminated: true }));
    } catch {
      console.error(JSON.stringify({ error: 'session_cleanup_failed' }));
      process.exitCode = 1;
    }
  }
}
