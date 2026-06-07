/**
 * ────────────────────────────────────────────────────────────────────────────
 *  Lumin backend — holds the Nango secret key
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The browser never sees the secret key — it talks only to this API, which
 * calls Nango on its behalf. The connection id is NOT hardcoded: the user
 * authorizes Notion through Nango Connect (POST /api/connect-session), and the
 * frontend then passes the resulting connectionId on every request.
 *
 *   POST   /api/connect-session             nango.createConnectSession(...)             ✅
 *   GET    /api/connection/:id/workspace    nango.proxy → Notion users/me               ✅
 *   GET    /api/databases?connectionId=…     nango.proxy → Notion search (databases)    ✅
 *   GET    /api/parents?connectionId=…       nango.proxy → Notion search (pages)        ✅
 *   GET    /api/pages?connectionId=…         nango.listRecords('NotionPage')            ✅
 *   POST   /api/sync       {connectionId}    nango.triggerSync('data-source-entries')   ✅
 *   GET    /api/sync/status?connectionId=…   nango.syncStatus(...)                       ✅
 *   POST   /api/pages                        nango.triggerAction('create-page')         ✅
 *   POST   /api/assistant  {connectionId,…}  Claude agent → Nango MCP (Notion tools)    ✅
 *   DELETE /api/connection/:id               nango.deleteConnection('notion', id)        ⏳ stub
 */

import express from "express";
import { Nango } from "@nangohq/node";
import Anthropic from "@anthropic-ai/sdk";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = process.env.PORT || 3010;
const NOTION_INTEGRATION_ID = "notion";
const SYNC_NAME = "data-source-entries";
const PAGE_MODEL = "NotionPage";
const NANGO_MCP_URL = process.env.NANGO_MCP_URL || "https://api.nango.dev/mcp";
const AGENT_MODEL = "claude-opus-4-6";

const nango = process.env.NANGO_SECRET_KEY
  ? new Nango({
      secretKey: process.env.NANGO_SECRET_KEY,
      ...(process.env.NANGO_HOST ? { host: process.env.NANGO_HOST } : {}),
    })
  : null;

// The agent's LLM. The browser never sees this key — the backend runs the loop.
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const app = express();
app.use(express.json());

/** The product's own signed-in user (comes from your auth layer in a real app). */
const APP_USER = { id: "demo-mara", email: "mara@lumin.app", display_name: "Mara Ellis" };

/** A route that needs the Nango secret key, which isn't configured. */
function notConfigured(res, hint) {
  res.status(501).json({ error: "NANGO_SECRET_KEY not set", hint, integration: NOTION_INTEGRATION_ID });
}

/** Read the connectionId the frontend got from the Connect flow (query or body). */
function connectionFrom(req) {
  return req.query.connectionId || req.body?.connectionId || null;
}

/* ── Connect: the user authorizes Notion (managed OAuth via Nango Connect) ─── */

/** Mint a short-lived Connect session token for the @nangohq/frontend SDK. */
app.post("/api/connect-session", async (_req, res) => {
  if (!nango) return notConfigured(res, "createConnectSession for the notion integration");
  try {
    const session = await nango.createConnectSession({
      end_user: APP_USER,
      allowed_integrations: [NOTION_INTEGRATION_ID],
    });
    res.json({ sessionToken: session.data.token });
  } catch (err) {
    res.status(502).json({ error: "createConnectSession failed", detail: errMessage(err) });
  }
});

/** Workspace name/icon for the connection the user just authorized. */
app.get("/api/connection/:connectionId/workspace", async (req, res) => {
  if (!nango) return notConfigured(res, "read the connected Notion workspace");
  try {
    // https://developers.notion.com/reference/get-self
    const { data } = await nango.proxy({
      method: "GET",
      endpoint: "/v1/users/me",
      providerConfigKey: NOTION_INTEGRATION_ID,
      connectionId: req.params.connectionId,
      retries: 3,
    });
    res.json({ workspaceName: data?.bot?.workspace_name || "Notion workspace", workspaceIcon: "🗂️" });
  } catch (err) {
    res.status(502).json({ error: "users/me failed", detail: errMessage(err) });
  }
});

/* ── The data-source-entries sync (reads + trigger) ─────────────────────── */

/** List the Notion databases (data sources) shared with this connection. */
app.get("/api/databases", async (req, res) => {
  if (!nango) return notConfigured(res, "search Notion databases");
  const connectionId = connectionFrom(req);
  if (!connectionId) return res.status(400).json({ error: "connectionId is required" });
  try {
    const databases = [];
    let cursor;
    do {
      // https://developers.notion.com/reference/post-search
      const { data } = await nango.proxy({
        method: "POST",
        endpoint: "/v1/search",
        providerConfigKey: NOTION_INTEGRATION_ID,
        connectionId,
        data: {
          filter: { property: "object", value: "database" },
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        },
        retries: 3,
      });

      for (const db of data.results ?? []) {
        if (db.object !== "database") continue;
        databases.push({
          id: db.id,
          name: plainText(db.title) || "Untitled database",
          icon: emojiOf(db.icon),
        });
      }
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    res.json({ databases });
  } catch (err) {
    res.status(502).json({ error: "Notion search failed", detail: errMessage(err) });
  }
});

/** List top-level teamspace pages — the parents the create-page action can target. */
app.get("/api/parents", async (req, res) => {
  if (!nango) return notConfigured(res, "search Notion pages");
  const connectionId = connectionFrom(req);
  if (!connectionId) return res.status(400).json({ error: "connectionId is required" });
  try {
    res.json({ parents: await listParentPages(connectionId) });
  } catch (err) {
    res.status(502).json({ error: "Notion search failed", detail: errMessage(err) });
  }
});

/** Read synced pages written by the data-source-entries sync (Nango's cache). */
app.get("/api/pages", async (req, res) => {
  if (!nango) return notConfigured(res, "listRecords NotionPage");
  const connectionId = connectionFrom(req);
  if (!connectionId) return res.status(400).json({ error: "connectionId is required" });
  try {
    const records = [];
    let cursor;
    do {
      const page = await nango.listRecords({
        providerConfigKey: NOTION_INTEGRATION_ID,
        connectionId,
        model: PAGE_MODEL,
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      records.push(...page.records);
      cursor = page.next_cursor;
    } while (cursor);

    // Drop soft-deleted rows and strip Nango's per-record metadata.
    const pages = records
      .filter((r) => !r._nango_metadata?.deleted_at)
      .map(({ _nango_metadata, ...rest }) => rest);

    res.json({ pages });
  } catch (err) {
    res.status(502).json({ error: "listRecords failed", detail: errMessage(err) });
  }
});

/** Trigger an immediate, one-off run of the Notion sync (runs in the background). */
app.post("/api/sync", async (req, res) => {
  if (!nango) return notConfigured(res, "triggerSync data-source-entries");
  const connectionId = connectionFrom(req);
  if (!connectionId) return res.status(400).json({ error: "connectionId is required" });
  try {
    await nango.triggerSync(NOTION_INTEGRATION_ID, [SYNC_NAME], connectionId);
    res.json({ syncedAt: new Date().toISOString(), triggered: true });
  } catch (err) {
    res.status(502).json({ error: "triggerSync failed", detail: errMessage(err) });
  }
});

/** Status of the sync for this connection — lets the UI wait for a run to land. */
app.get("/api/sync/status", async (req, res) => {
  if (!nango) return notConfigured(res, "syncStatus data-source-entries");
  const connectionId = connectionFrom(req);
  if (!connectionId) return res.status(400).json({ error: "connectionId is required" });
  try {
    const { syncs } = await nango.syncStatus(NOTION_INTEGRATION_ID, [SYNC_NAME], connectionId);
    const sync = syncs?.[0];
    res.json({
      status: sync?.status ?? null, // RUNNING | SUCCESS | ERROR | PAUSED | STOPPED
      finishedAt: sync?.finishedAt ?? null,
      records: sync?.recordCount?.[PAGE_MODEL] ?? 0,
    });
  } catch (err) {
    res.status(502).json({ error: "syncStatus failed", detail: errMessage(err) });
  }
});

/** Create a page (sub-page under a parent) via the create-page action. */
app.post("/api/pages", async (req, res) => {
  if (!nango) return notConfigured(res, "triggerAction create-page");
  const connectionId = connectionFrom(req);
  if (!connectionId) return res.status(400).json({ error: "connectionId is required" });
  const { parentPageId, title, content } = req.body ?? {};
  if (!parentPageId || !title) {
    return res.status(400).json({ error: "parentPageId and title are required" });
  }
  try {
    const result = await nango.triggerAction(NOTION_INTEGRATION_ID, connectionId, "create-page", {
      parent_page_id: parentPageId,
      title,
      content: content ?? "",
    });
    res.json(result); // { id, url, title }
  } catch (err) {
    res.status(502).json({ error: "create-page failed", detail: errMessage(err) });
  }
});

/* ── Assistant: a Claude agent that calls the Notion tools via Nango's MCP ──
 *
 * This is the production-shaped setup: the browser sends a chat message, the
 * backend runs the Claude tool-use loop, and the tools come from Nango's hosted
 * MCP server (the deployed `create-page` action, etc.). Nango injects the user's
 * Notion credentials when a tool is called — the model never sees them.
 */
app.post("/api/assistant", async (req, res) => {
  if (!anthropic) {
    return res.status(501).json({
      error: "ANTHROPIC_API_KEY not set",
      hint: "set ANTHROPIC_API_KEY in backend/.env to enable the assistant agent",
    });
  }
  if (!nango) return notConfigured(res, "the assistant needs Nango's MCP");
  const connectionId = connectionFrom(req);
  if (!connectionId) return res.status(400).json({ error: "connectionId is required" });
  const { message, history } = req.body ?? {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  let mcp;
  try {
    // 1. Connect to Nango's MCP for THIS connection and discover the Notion tools.
    mcp = await openNotionMcp(connectionId);
    const { tools: mcpTools } = await mcp.listTools();
    const tools = mcpTools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: t.inputSchema,
    }));

    // 2. Give the agent the context a tool needs that the schema can't carry —
    //    create-page wants a parent_page_id, so list the user's teamspace pages.
    const parents = await listParentPages(connectionId).catch(() => []);
    const parentList = parents.length
      ? parents.map((p) => `- ${p.name} (id: ${p.id})`).join("\n")
      : "- (no pages shared with this connection yet)";
    const system =
      `You are the assistant inside "Lumin", a SaaS app that integrates Notion through Nango. ` +
      `You act in the user's Notion workspace by calling the provided tools (served by Nango's MCP ` +
      `server, which injects the user's credentials).\n\n` +
      `Tool notes:\n` +
      `- create-page needs a parent_page_id. The user's teamspace pages you can create under:\n` +
      `${parentList}\n` +
      `  Pick the parent that best fits the request; if none is specified, use the first.\n\n` +
      `Be concise and friendly. After a tool call, confirm what you did in one line and include the ` +
      `page URL when there is one. If a request isn't something the tools support, say so briefly.`;

    // 3. Seed the conversation with prior turns (text only) + the new message.
    const messages = [];
    for (const turn of Array.isArray(history) ? history : []) {
      if ((turn?.role === "user" || turn?.role === "assistant") && typeof turn?.text === "string" && turn.text) {
        messages.push({ role: turn.role, content: turn.text });
      }
    }
    messages.push({ role: "user", content: message });

    // 4. The agent loop: Claude calls tools, we execute them via MCP, repeat.
    const toolCalls = [];
    let replyText = "";
    const MAX_TURNS = 8;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model: AGENT_MODEL,
        max_tokens: 8192,
        thinking: { type: "adaptive" },
        system,
        tools,
        messages,
      });

      // Preserve the full content (incl. thinking blocks) for the next turn.
      messages.push({ role: "assistant", content: response.content });

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) replyText = text;

      if (response.stop_reason === "pause_turn") continue;

      const toolUses = response.content.filter((b) => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

      const toolResults = [];
      for (const tu of toolUses) {
        let ok = true;
        let resultText = "";
        let parsed;
        try {
          const r = await mcp.callTool({ name: tu.name, arguments: tu.input ?? {} });
          resultText = (r.content ?? [])
            .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
            .join("\n");
          ok = !r.isError;
          try { parsed = JSON.parse(resultText); } catch { parsed = resultText; }
        } catch (err) {
          ok = false;
          resultText = errMessage(err);
          parsed = resultText;
        }
        toolCalls.push({ id: tu.id, name: tu.name, arguments: tu.input ?? {}, result: parsed, status: ok ? "success" : "error" });
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: resultText || "(no output)", is_error: !ok });
      }
      messages.push({ role: "user", content: toolResults });
    }

    res.json({ text: replyText, toolCalls });
  } catch (err) {
    res.status(502).json({ error: "assistant failed", detail: errMessage(err) });
  } finally {
    if (mcp) await mcp.close().catch(() => {});
  }
});

/** Tear down a connection in Nango. */
app.delete("/api/connection/:connectionId", async (_req, res) => {
  // TODO(nango): nango.deleteConnection('notion', req.params.connectionId)
  res.status(501).json({ error: "Not wired yet", hint: "deleteConnection", integration: NOTION_INTEGRATION_ID });
});

app.listen(PORT, () => {
  console.log(`Lumin backend listening on http://localhost:${PORT}`);
  console.log(
    nango
      ? `Nango client ready — connections come from the Connect flow per request.`
      : "No NANGO_SECRET_KEY set — routes return 501 until it's configured.",
  );
  console.log(
    anthropic
      ? `Assistant agent ready (model ${AGENT_MODEL}; tools via Nango MCP).`
      : "No ANTHROPIC_API_KEY set — /api/assistant returns 501 until it's configured.",
  );
});

/* ── Small Notion helpers ───────────────────────────────────────────────── */

/** Join a Notion rich-text array into plain text. */
function plainText(richText) {
  if (!Array.isArray(richText)) return "";
  return richText.map((segment) => segment?.plain_text ?? "").join("").trim();
}

/** Pull a page's plain-text title out of its properties (the title-typed prop). */
function pageTitle(page) {
  for (const value of Object.values(page?.properties ?? {})) {
    if (value?.type === "title" && Array.isArray(value.title)) {
      return plainText(value.title);
    }
  }
  return "";
}

/** Notion icons can be emoji, uploaded files, or built-in icons. Use the emoji
 *  when there is one; otherwise fall back to a neutral glyph for the UI. */
function emojiOf(icon) {
  return icon?.type === "emoji" && icon.emoji ? icon.emoji : "🗂️";
}

/** Open a connected MCP client to Nango's hosted server for one connection.
 *  Nango exposes the connection's enabled actions as tools and injects creds. */
async function openNotionMcp(connectionId) {
  const transport = new StreamableHTTPClientTransport(new URL(NANGO_MCP_URL), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${process.env.NANGO_SECRET_KEY}`,
        "connection-id": connectionId,
        "provider-config-key": NOTION_INTEGRATION_ID,
      },
    },
  });
  const client = new McpClient({ name: "lumin-backend", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

/** Top-level teamspace pages (search → workspace-parent pages). Shared by the
 *  /api/parents route and the assistant's system prompt. */
async function listParentPages(connectionId) {
  const parents = [];
  let cursor;
  do {
    // https://developers.notion.com/reference/post-search
    const { data } = await nango.proxy({
      method: "POST",
      endpoint: "/v1/search",
      providerConfigKey: NOTION_INTEGRATION_ID,
      connectionId,
      data: {
        filter: { property: "object", value: "page" },
        sort: { timestamp: "last_edited_time", direction: "descending" },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      },
      retries: 3,
    });
    for (const page of data.results ?? []) {
      if (page.parent?.type !== "workspace") continue;
      const icon = page.icon?.type === "emoji" && page.icon.emoji ? page.icon.emoji : "📄";
      parents.push({ id: page.id, name: pageTitle(page) || "Untitled", icon });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return parents;
}

function errMessage(err) {
  return err?.response?.data ? JSON.stringify(err.response.data) : String(err?.message ?? err);
}
