/**
 * Shared domain types for the Lumin demo.
 *
 * These are the shapes the UI renders. They are intentionally close to what a
 * Nango Notion sync (`NotionPage` records) and a `create-page` action will
 * return — so when the real integration lands, the seam in `lib/nango.ts` maps
 * Notion's raw payloads into exactly these types and nothing in the UI changes.
 */

/** Editorial status of a doc. Mirrors a Notion "Status" select property. */
export type DocStatus = "draft" | "in_review" | "published" | "archived";

/**
 * A Notion database the integration can read from and write to. In Notion's
 * `2025-09-03` API this maps to a *data source* (`data_source_id`), which is
 * what the create-page action targets.
 */
export interface NotionDatabase {
  /** The Notion data_source_id. */
  id: string;
  name: string;
  /** Emoji icon, as Notion databases carry one. */
  icon: string;
}

/**
 * A Notion page the create-page action can create a sub-page under. Notion can't
 * create at a teamspace root, so the create form picks one of these as the parent.
 */
export interface NotionParent {
  /** The parent Notion page id. */
  id: string;
  name: string;
  /** Emoji icon (the page's, or a default). */
  icon: string;
}

/**
 * A normalized page synced from a Notion database. Independent of Notion's raw
 * API response — the sync layer maps Notion pages into this shape.
 */
export interface NotionPage {
  id: string;
  databaseId: string;
  title: string;
  status: DocStatus;
  /** Short preview of the page body, for the ledger list. */
  excerpt: string;
  author: string;
  /** Public Notion URL (notion.so/...). */
  url: string;
  /** ISO 8601 — the field the incremental sync checkpoints on. */
  lastEditedTime: string;
  /** ISO 8601. */
  createdTime: string;
}

/** Input the create-page form (and the assistant) hand to the action. */
export interface CreatePageInput {
  /** The Notion page id the new page is created under (its parent). */
  parentPageId: string;
  title: string;
  /** Body text; blank lines split it into paragraphs (Notion blocks). */
  content: string;
}

/** What the create-page action returns. */
export interface CreatedPage {
  id: string;
  url: string;
  title: string;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** The connected Notion workspace, surfaced from Nango after OAuth. */
export interface NotionConnection {
  /** The Nango connection id for this end user. */
  connectionId: string;
  workspaceName: string;
  workspaceIcon: string;
  connectedAt: string;
}

export type SyncStatus = "idle" | "syncing" | "error";

export interface SyncState {
  status: SyncStatus;
  /** ISO 8601 of the last successful sync, or null if never synced. */
  lastSyncedAt: string | null;
}

/** Top-level views the sidebar navigates between. */
export type View = "workspace" | "assistant" | "settings";

/* ── AI assistant (the MCP tool-calling surface) ────────────────────────── */

export type ToolCallStatus = "running" | "success" | "error";

/**
 * A single tool invocation the assistant makes. The assistant is a Claude agent
 * on the backend whose tools come from Nango's hosted MCP server — each deployed
 * action (`create-page`, …) is one tool, and Nango injects the right Notion
 * credentials when the model calls it.
 */
export interface ToolCall {
  id: string;
  /** The Nango action exposed as an MCP tool, e.g. "create-page". */
  name: string;
  /** The arguments the model passed to the tool. */
  arguments: unknown;
  status: ToolCallStatus;
  /** The tool's return value (parsed JSON when possible). */
  result?: unknown;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text?: string;
  /** Tool calls the assistant made in this turn (the agent may make several). */
  toolCalls?: ToolCall[];
}
