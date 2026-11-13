export const READ_TOOLS = ['list-tasklists', 'list-tasks'] as const;
export const WRITE_TOOL = 'create-customer-discovery-prep';
export type Connection = { userId: string; integrationId: string; connectionId?: string; tags?: Record<string, string> };
export function sessionPolicy(userId: string, connection: Connection, canCreate: boolean) {
  if (connection.userId !== userId || (!connection.connectionId && !connection.tags)) {
    throw new Error('No authorized Google Tasks connection for this user.');
  }
  const tools: string[] = [...READ_TOOLS, ...(canCreate ? [WRITE_TOOL] : [])];
  return {
    tenant: { connections: connection.connectionId
      ? { pinned: [{ integration_id: connection.integrationId, connection_id: connection.connectionId }] }
      : { any: [{ tags: connection.tags! }] } },
    toolset: { [connection.integrationId]: { allow: { tools } } },
    pinned_tools: { [connection.integrationId]: tools },
    meta_tools: { nango_tool_search: false, nango_execute: false, nango_proxy: false },
    expires_in: '5m'
  };
}
