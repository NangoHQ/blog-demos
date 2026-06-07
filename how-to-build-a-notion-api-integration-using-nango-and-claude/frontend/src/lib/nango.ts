/**
 * ────────────────────────────────────────────────────────────────────────────
 *  THE INTEGRATION SEAM
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The ONLY file the rest of the app talks to for Notion + connection behavior.
 *
 * The user authorizes Notion through Nango Connect on the "Connect" click, and
 * the data-source-entries SYNC is wired: the ledger reads the real synced
 * records and "Sync now" triggers a real run. Everything goes through the
 * backend, which holds the Nango secret key — the browser never sees it. The
 * connection id comes from the Connect flow and is passed on every request
 * (nothing is hardcoded).
 *
 *   Browser (this SPA)              Backend (holds NANGO_SECRET_KEY)            Nango ── Notion
 *   ───────────────────            ─────────────────────────────────          ────────────────
 *   @nangohq/frontend   ──auth──▶   POST /api/connect-session  ───────────▶  create Connect session   ✅ wired
 *   fetch('/api/databases') ─────▶  nango.proxy → Notion search ───────────▶  shared databases         ✅ wired
 *   fetch('/api/pages') ─────────▶  nango.listRecords('notion','NotionPage')▶  synced pages             ✅ wired
 *   fetch('/api/sync') ──────────▶  nango.triggerSync('data-source-entries')▶  refresh the ledger       ✅ wired
 *   fetch('/api/parents') ───────▶  nango.proxy → Notion search (pages) ─────▶  parent pages to write to ✅ wired
 *   fetch('/api/pages', POST) ───▶  nango.triggerAction('create-page', …) ──▶  write a page back        ✅ wired
 *
 * The create-page action creates a sub-page under a teamspace page you pick
 * (Notion can't create at a teamspace root). The sync paths map Notion's records
 * into the app's `NotionPage` type, so nothing in the UI changes.
 */

import Nango from "@nangohq/frontend";
import type {
  CreatePageInput,
  CreatedPage,
  DocStatus,
  NotionConnection,
  NotionDatabase,
  NotionPage,
  NotionParent,
  ToolCall,
} from "./types";

/** Nango integration (provider config) id for Notion. */
export const NOTION_INTEGRATION_ID = "notion";

/**
 * Every seam path is wired now: Connect, the sync reads, and the create-page
 * action. (Kept as a flag the UI can read; there's no longer a stubbed path.)
 */
export const SEAM_WIRED = true;

/** Simulated network latency so loading states actually render in screenshots. */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── Local state ──────────────────────────────────────────────────────────
 * The connection id from the Connect flow, and any pages created via the (still
 * simulated) create-page action. The optimistic list lets created pages appear
 * at the top of the ledger immediately, surviving the sync refetch. Once the
 * real create-page action is wired, created pages flow back through Notion and
 * the data-source-entries sync, and this optimistic list goes away.
 */
let activeConnectionId: string | null = null;
let locallyCreated: NotionPage[] = [];

/** Newest first — the order the ledger renders. */
function byNewest(a: NotionPage, b: NotionPage): number {
  return a.lastEditedTime < b.lastEditedTime
    ? 1
    : a.lastEditedTime > b.lastEditedTime
      ? -1
      : 0;
}

/* ── Auth: the user authorizes Notion via Nango Connect ───────────────────── */

/**
 * Start the Notion OAuth flow via Nango Connect and return the new connection.
 * The backend mints a short-lived session token (it holds the secret key); the
 * managed Connect UI runs the OAuth dance in the browser and hands back the
 * connection id Nango created. We then wait for the connection's first sync run
 * to finish, so the ledger has records the moment we resolve.
 */
export async function connectNotion(): Promise<NotionConnection> {
  // 1. Ask the backend for a Connect session token scoped to the notion integration.
  const res = await fetch("/api/connect-session", { method: "POST" });
  if (!res.ok) {
    throw new Error("Could not start the Notion connection. Is the backend running?");
  }
  const { sessionToken } = (await res.json()) as { sessionToken: string };

  // 2. Open Nango's managed Connect UI and wait for the user to authorize Notion.
  const nango = new Nango();
  const connectionId = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const ui = nango.openConnectUI({
      onEvent: (event) => {
        if (settled) return;
        if (event.type === "connect") {
          settled = true;
          resolve(event.payload.connectionId);
          ui.close();
        } else if (event.type === "close") {
          settled = true;
          reject(new Error("Connection window closed before finishing."));
        } else if (event.type === "error") {
          settled = true;
          reject(new Error(event.payload.errorMessage || "Notion authorization failed."));
        }
      },
    });
    ui.setSessionToken(sessionToken);
  });

  activeConnectionId = connectionId;

  // 3. In parallel: read the workspace name, and wait for the initial sync run
  //    (autoStart kicks it off when the connection is created) to land records.
  const [workspace] = await Promise.all([
    fetchWorkspace(connectionId),
    waitForSyncComplete(connectionId, null),
  ]);

  return {
    connectionId,
    workspaceName: workspace.name,
    workspaceIcon: workspace.icon,
    connectedAt: new Date().toISOString(),
  };
}

/**
 * Disconnect locally. This clears the app's session; it intentionally does NOT
 * delete the connection in Nango, so reconnecting is instant during the demo.
 *
 * TODO(nango): for a real teardown, DELETE /api/connection/:id →
 * nango.deleteConnection("notion", id)
 */
export async function disconnectNotion(_connectionId: string): Promise<void> {
  await delay(400);
  activeConnectionId = null;
  locallyCreated = [];
}

/* ── Read: databases + synced pages (WIRED) ───────────────────────────────── */

/**
 * The Notion databases (data sources) shared with this connection — the backend
 * runs a Notion search and returns id + name + icon for each. The create-page
 * picker and the ledger's per-database filter use these.
 */
export async function fetchDatabases(): Promise<NotionDatabase[]> {
  if (!activeConnectionId) return [];
  try {
    const res = await fetch(`/api/databases?connectionId=${encodeURIComponent(activeConnectionId)}`);
    if (!res.ok) return [];
    const { databases } = (await res.json()) as { databases: NotionDatabase[] };
    return databases;
  } catch {
    return [];
  }
}

/**
 * Top-level teamspace pages the create-page action can create a sub-page under
 * (the backend searches pages and keeps the workspace-level ones). These are the
 * destinations the create form's picker offers.
 */
export async function fetchParents(): Promise<NotionParent[]> {
  if (!activeConnectionId) return [];
  try {
    const res = await fetch(`/api/parents?connectionId=${encodeURIComponent(activeConnectionId)}`);
    if (!res.ok) return [];
    const { parents } = (await res.json()) as { parents: NotionParent[] };
    return parents;
  } catch {
    return [];
  }
}

/**
 * Load synced pages — the `NotionPage` records the data-source-entries sync
 * writes into Nango's cache, read back via `listRecords` on the backend and
 * mapped into the app's `NotionPage` shape. Locally-created (optimistic) pages
 * are merged on top until the create-page action is wired.
 */
export async function fetchPages(): Promise<NotionPage[]> {
  if (!activeConnectionId) return [];
  let synced: NotionPage[] = [];
  try {
    const res = await fetch(`/api/pages?connectionId=${encodeURIComponent(activeConnectionId)}`);
    if (res.ok) {
      const { pages } = (await res.json()) as { pages: SyncedNotionPage[] };
      synced = pages.map(toNotionPage);
    } else {
      console.warn(`GET /api/pages → ${res.status}. Is the backend running and the sync deployed?`);
    }
  } catch (err) {
    console.warn("GET /api/pages failed — is the backend running?", err);
  }

  const optimisticIds = new Set(locallyCreated.map((p) => p.id));
  return [...locallyCreated, ...synced.filter((p) => !optimisticIds.has(p.id))].sort(byNewest);
}

/**
 * Trigger a run of the Notion sync and wait for it to finish, so the refetch
 * that follows reflects the new data. We snapshot the last run's finish time
 * first, then poll until a NEWER run completes (a fixed delay would race a
 * slow run).
 */
export async function syncPages(): Promise<{ syncedAt: string }> {
  if (!activeConnectionId) {
    throw new Error("Connect a Notion workspace before syncing.");
  }
  const connectionId = activeConnectionId;
  const before = (await getSyncStatus(connectionId))?.finishedAt ?? null;

  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Sync failed (${res.status}). ${detail}`.trim());
  }
  await res.json();

  await waitForSyncComplete(connectionId, before);
  return { syncedAt: new Date().toISOString() };
}

/* ── Sync status (used to wait for runs to land) ──────────────────────────── */

interface SyncStatusInfo {
  status: "RUNNING" | "SUCCESS" | "ERROR" | "PAUSED" | "STOPPED" | null;
  finishedAt: string | null;
  records: number;
}

async function getSyncStatus(connectionId: string): Promise<SyncStatusInfo | null> {
  try {
    const res = await fetch(`/api/sync/status?connectionId=${encodeURIComponent(connectionId)}`);
    if (!res.ok) return null;
    return (await res.json()) as SyncStatusInfo;
  } catch {
    return null;
  }
}

/**
 * Poll until a sync run that finished AFTER `sinceFinishedAt` has completed
 * (pass `null` to wait for the connection's first run). Bounded by a timeout so
 * the UI never hangs if a run stalls.
 */
async function waitForSyncComplete(
  connectionId: string,
  sinceFinishedAt: string | null,
  timeoutMs = 45_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await getSyncStatus(connectionId);
    if (s && s.status !== "RUNNING" && s.finishedAt && s.finishedAt !== sinceFinishedAt) {
      return;
    }
    await delay(1500);
  }
}

/* ── Write: create a page via the create-page action (WIRED) ──────────────── */

/**
 * Create a page in Notion (a sub-page under the chosen parent) via the deployed
 * create-page action, and return its id + URL. We also prepend it to the
 * optimistic list — with its real Notion id — so it shows at the top of the
 * ledger immediately and survives the next sync (which re-emits the same record
 * and dedupes by id).
 */
export async function createPage(input: CreatePageInput): Promise<CreatedPage> {
  if (!activeConnectionId) {
    throw new Error("Connect a Notion workspace before creating a page.");
  }
  if (!input.title.trim()) {
    throw new Error("A title is required.");
  }

  const res = await fetch("/api/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connectionId: activeConnectionId,
      parentPageId: input.parentPageId,
      title: input.title.trim(),
      content: input.content,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Couldn't create the page (${res.status}). ${detail}`.trim());
  }
  const created = (await res.json()) as CreatedPage;

  const now = new Date().toISOString();
  const firstLine = input.content.trim().split("\n").find(Boolean) ?? "";
  locallyCreated = [
    {
      id: created.id,
      databaseId: "",
      title: created.title,
      status: "draft",
      excerpt: firstLine.slice(0, 140),
      author: "",
      url: created.url,
      lastEditedTime: now,
      createdTime: now,
    },
    ...locallyCreated.filter((p) => p.id !== created.id),
  ];

  return created;
}

/* ── Assistant: a backend Claude agent that calls Notion tools via Nango MCP ─ */

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AssistantReply {
  text: string;
  toolCalls: ToolCall[];
}

/**
 * Send a message to the assistant. The backend runs a Claude tool-use loop whose
 * tools are served by Nango's hosted MCP server (the deployed Notion actions);
 * it executes any tool calls and returns the final reply plus the tool calls it
 * made (for the tool-call cards). The browser never sees the Anthropic or Nango
 * keys — the backend orchestrates the agent.
 */
export async function runAssistant(
  message: string,
  history: AssistantTurn[],
): Promise<AssistantReply> {
  if (!activeConnectionId) {
    throw new Error("Connect a Notion workspace before using the assistant.");
  }
  const res = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: activeConnectionId, message, history }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Assistant failed (${res.status}). ${detail}`.trim());
  }
  const data = (await res.json()) as { text?: string; toolCalls?: ToolCall[] };
  return { text: data.text ?? "", toolCalls: data.toolCalls ?? [] };
}

/* ── Mapping: Notion sync record → the app's NotionPage ───────────────────── */

/** Shape of a `NotionPage` record as written by the data-source-entries sync. */
interface SyncedNotionPage {
  id: string;
  database_id: string;
  title: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, unknown>;
}

function toNotionPage(record: SyncedNotionPage): NotionPage {
  return {
    id: record.id,
    databaseId: record.database_id,
    title: record.title || "Untitled",
    status: deriveStatus(record.properties),
    excerpt: deriveExcerpt(record.properties),
    author: deriveAuthor(record.properties),
    url: record.url,
    lastEditedTime: record.last_edited_time,
    createdTime: record.created_time,
  };
}

/** Best-effort workspace name/icon for the header (defaults if unavailable). */
async function fetchWorkspace(connectionId: string): Promise<{ name: string; icon: string }> {
  try {
    const res = await fetch(`/api/connection/${encodeURIComponent(connectionId)}/workspace`);
    if (res.ok) {
      const ws = (await res.json()) as { workspaceName?: string; workspaceIcon?: string };
      return { name: ws.workspaceName ?? "Notion workspace", icon: ws.workspaceIcon ?? "🗂️" };
    }
  } catch {
    // fall through to defaults
  }
  return { name: "Notion workspace", icon: "🗂️" };
}

/**
 * Notion property schemas differ per database, so these readers are best-effort:
 * they find a property of the right *type* and fall back to a sane default. The
 * sync stays generic; the app interprets the properties it understands.
 */
function deriveStatus(properties: Record<string, unknown>): DocStatus {
  for (const value of Object.values(properties)) {
    const prop = value as {
      type?: string;
      status?: { name?: string };
      select?: { name?: string };
    };
    if (prop?.type === "status" && prop.status?.name) return toDocStatus(prop.status.name);
    if (prop?.type === "select" && prop.select?.name) return toDocStatus(prop.select.name);
  }
  return "draft";
}

function toDocStatus(name: string): DocStatus {
  const n = name.toLowerCase();
  if (n.includes("review")) return "in_review";
  if (n.includes("publish") || n.includes("done") || n.includes("complete") || n.includes("live"))
    return "published";
  if (n.includes("archiv")) return "archived";
  return "draft";
}

function deriveExcerpt(properties: Record<string, unknown>): string {
  for (const value of Object.values(properties)) {
    const prop = value as { type?: string; rich_text?: { plain_text?: string }[] };
    if (prop?.type === "rich_text" && Array.isArray(prop.rich_text) && prop.rich_text.length) {
      const text = prop.rich_text
        .map((segment) => segment.plain_text ?? "")
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return "";
}

function deriveAuthor(properties: Record<string, unknown>): string {
  for (const value of Object.values(properties)) {
    const prop = value as { type?: string; people?: { name?: string }[] };
    if (prop?.type === "people" && Array.isArray(prop.people) && prop.people[0]?.name) {
      return prop.people[0].name ?? "";
    }
  }
  return "";
}
