# Notion × Nango — demo app

Companion demo for the blog post **[How to build a Notion API integration using Nango and Claude](https://nango.dev/blog/how-to-build-a-notion-api-integration-using-nango-and-claude)**.

“Lumin” is a small SaaS-style content workspace that integrates Notion via [Nango](https://nango.dev):

- **Connect Notion** with managed OAuth (Nango Connect)
- **Sync** the connected workspace’s pages into a live ledger (the `data-source-entries` sync)
- **Create pages** back in Notion (the `create-page` action)
- An **AI assistant** (Claude) that calls the deployed Notion actions through Nango’s hosted MCP server — backend-orchestrated, like a real SaaS agent

```text
frontend/            Vite + React + TypeScript SPA (the UI)            → port 5180
backend/             Express API that holds the Nango secret key       → port 3010
nango-integrations/  The Nango sync + action (deployed with the CLI)
```

The browser never sees any secret — it talks only to the backend, which calls Nango. Vite proxies `/api/*` to the backend on port 3010.

## Prerequisites

- **Node.js 22+**
- A [Nango account](https://nango.dev) (free tier is enough)
- A **Notion integration** configured in Nango (keep the default unique key **`notion`** — the code references it), plus **one connection** with at least one page or database shared to it. See the blog post’s _Prerequisites_ section.
- _(Optional)_ an **Anthropic API key** — only needed for the AI assistant tab.

## 1. Deploy the Nango functions

```bash
cd nango-integrations
npm install
cp .env.example .env          # set NANGO_SECRET_KEY_DEV (Nango dashboard → Environment Settings)
npx nango deploy dev          # deploys the data-source-entries sync + create-page action
```

## 2. Start the backend (holds the secret key)

```bash
cd backend
npm install
cp .env.example .env          # set NANGO_SECRET_KEY (the same dev key).
                              # Optional: set ANTHROPIC_API_KEY to enable the assistant.
npm run dev                   # http://localhost:3010
```

## 3. Start the frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5180
```

Open **http://localhost:5180**, click **Connect Notion**, and authorize. Once the first sync run finishes you’ll see your synced pages in the ledger. Create a page from the form on the right, or open the **Assistant** tab and ask it to create one (e.g. _“Create a page titled ‘Launch checklist’ under <one of your pages>”_).

> Run the backend before connecting — Connect, sync, create, and the assistant all go through it.

## How it’s wired

`frontend/src/lib/nango.ts` is the single seam the rest of the UI talks to. It calls the backend, which uses:

- [`@nangohq/node`](https://nango.dev/docs/reference/sdks/node) for `createConnectSession`, `listRecords`, `triggerSync`, `triggerAction`, and `syncStatus`
- Nango’s hosted **MCP server** (`https://api.nango.dev/mcp`) for the assistant’s tool calls — the deployed Notion actions show up as tools and Nango injects the user’s credentials

The `nango-integrations/` functions were generated with the [Nango function-builder skill](https://nango.dev/docs/implementation-guides/platform/functions/leverage-ai-agents) and tested against a real connection with `nango dryrun`.
