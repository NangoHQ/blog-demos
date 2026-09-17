import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const integration = 'google-mail-readonly';
export const toolName = `${integration}__read-inbox-summary`;
export function required(name) {
  const value = process.env[name];
  if (!value || value.startsWith('<')) throw new Error(`missing_${name}`);
  return value;
}
async function api(path, method, body) {
  const response = await fetch(`https://api.nango.dev${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${required('NANGO_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error(`nango_http_${response.status}`);
  if (method !== 'DELETE') return (await response.json()).data;
}
export async function createSession(
  action = 'read-inbox-summary',
  expiresIn = '5m',
  connections
) {
  // Production must resolve this connection from authenticated application identity.
  return api('/sessions', 'POST', {
    tenant: {
      connections: connections ?? {
        pinned: [{
          integration_id: integration,
          connection_id: required('NANGO_CONNECTION_ID')
        }]
      }
    },
    toolset: { [integration]: { allow: { tools: [action] } } },
    pinned_tools: { [integration]: [action] },
    meta_tools: {
      nango_tool_search: false,
      nango_execute: false,
      nango_proxy: false
    },
    expires_in: expiresIn
  });
}
export const terminateSession = session =>
  api(`/sessions/${encodeURIComponent(session.session_id)}`, 'DELETE');
export async function connectSession(session) {
  assert.equal(session.toolset[integration]?.connected, true);
  const url = new URL(session.mcp_url);
  assert.equal(url.origin, 'https://api.nango.dev');
  assert.ok(!url.username && !url.password && !url.search && !url.hash);
  const client = new Client({
    name: 'gmail-summary-demo',
    version: '1.0.0'
  });
  try {
    await client.connect(new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: { Authorization: `Bearer ${session.session_token}` },
        redirect: 'error'
      }
    }));
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}
