import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { sessionPolicy, type Connection } from './policy.js';
export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Configure ${name} in the local .env file.`);
  return value;
}
export async function api(path: string, method: string, body?: unknown) {
  const response = await fetch(`https://api.nango.dev${path}`, {
    method, headers: { Authorization: `Bearer ${required('NANGO_API_KEY')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Nango ${method} ${path.split('/')[1]} failed: HTTP ${response.status}. Check Nango Logs and API key scopes.`);
  return (await response.json() as { data: any }).data;
}
export async function openSession(userId: string, connection: Connection, canCreate: boolean) {
  const session = await api('/sessions', 'POST', sessionPolicy(userId, connection, canCreate));
  const client = new Client({ name: 'google-tasks-tutorial', version: '1.0.0' });
  const end = async () => {
    try { await client.close(); }
    finally { await api(`/sessions/${encodeURIComponent(session.session_id)}`, 'DELETE'); }
  };
  try {
    if (session.toolset?.[connection.integrationId]?.connected !== true) throw new Error('Google Tasks is not connected.');
    const url = new URL(session.mcp_url);
    if (url.origin !== 'https://api.nango.dev' || url.search || url.hash || url.username || url.password) throw new Error('Unexpected MCP endpoint.');
    await client.connect(new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${session.session_token}` }, redirect: 'error' }
    }));
    return { client, close: end };
  } catch (error) {
    await end().catch(() => console.error('Session cleanup failed; five-minute expiry still applies.'));
    throw error;
  }
}
export async function listTools(client: Client) {
  const tools = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : {});
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}
export function demoConnection(): Connection {
  return { userId: required('DEMO_USERNAME'), integrationId: process.env.NANGO_INTEGRATION_ID || 'google-tasks', ...(process.env.NANGO_CONNECTION_ID ? { connectionId: process.env.NANGO_CONNECTION_ID } : { tags: { tutorial: 'con-361', end_user_id: required('DEMO_USERNAME') } }) };
}
