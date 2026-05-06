# HubSpot contacts sync with Nango — example project

A complete, working example of syncing HubSpot contacts via [Nango](https://nango.dev), including:

- A two-phase sync that handles HubSpot's **10,000-result search cap** by combining the bulk list endpoint with the search endpoint behind a stateful checkpoint.
- A small browser dashboard that demonstrates the typical real-world payoff: a fast, queryable, **webhook-driven** local cache instead of hitting HubSpot every page load.

## Layout

```
.
├── nango-integrations/   ← the Nango sync function (TypeScript, deploys to Nango)
│   └── hubspot/syncs/fetch-contacts.ts
│
└── demo-app/             ← Node/Express + vanilla HTML/JS dashboard
    ├── server.js         ← webhook receiver + SSE broadcaster
    └── public/           ← UI
```

The two folders are independent — each has its own `package.json`, `.env`, and README.

## Before you start: set up Nango

The sync deploys to a **specific integration** in your Nango dashboard. The CLI doesn't create the integration for you — it only attaches the sync to one that already exists. So:

1. Sign in at https://app.nango.dev and switch to the **dev** environment.
2. Go to **Integrations → Configure new integration → HubSpot** and finish the OAuth setup (paste your HubSpot client ID/secret, set the OAuth scopes you want — `crm.objects.contacts.read` is enough for this demo).
3. **Make sure the integration's "Unique Key" is exactly `hubspot`.** That string has to match the top-level folder name (`nango-integrations/hubspot/…`) — that's how the CLI knows which integration to attach the sync to. (See [How the deploy resolves the integration](#how-the-deploy-resolves-the-integration) below.)
4. Grab your dev **secret key** from **Environment Settings → API keys** — you'll paste it into both `.env` files.

## Quickstart

```bash
# 1. The sync
cd nango-integrations
npm install
cp .env.example .env             # paste NANGO_SECRET_KEY_DEV
npx nango deploy dev             # deploys hubspot/syncs/fetch-contacts.ts to the `hubspot` integration in dev

# 2. The demo app
cd ../demo-app
npm install
cp .env.example .env             # paste NANGO_SECRET_KEY_DEV
npm start                        # http://localhost:3000

# 3. Tunnel for Nango webhooks (separate terminal)
ngrok http 3000
# Then in the Nango dashboard → Environment Settings → Webhook URLs:
#   https://<your-ngrok>.ngrok-free.app/api/webhooks/nango
```

Open http://localhost:3000, click **Connect HubSpot**, and you're off. Click **Sync now** to trigger an on-demand run; the right-side panel will show the resulting webhook and the rows that changed will flash in the table.

## How the deploy resolves the integration

`npx nango deploy dev` doesn't read a config file — it derives everything from filesystem layout, your secret key, and the dashboard:

| What gets deployed where | Where it comes from |
| --- | --- |
| Which **integration** the sync attaches to | The **top-level folder name** of the script. `hubspot/syncs/fetch-contacts.ts` → `providerConfigKey: "hubspot"`. The integration with that exact key must already exist in your Nango dashboard. |
| The **sync's name** | The **filename** without `.ts`. `fetch-contacts.ts` → sync name `fetch-contacts`. |
| Schedule, autoStart, models, description | The `createSync({ … })` arguments inside the `.ts` file. |
| Which **Nango account** + **environment** to deploy to | The `NANGO_SECRET_KEY_DEV` value in `nango-integrations/.env`. The `dev` argument on the CLI must match the environment that key belongs to. |

So if you wanted to add, say, a Slack sync alongside, you'd create `slack/syncs/post-message.ts` and a `slack` integration in the dashboard — no config file edits.

## What each piece teaches

| Concern | Where to look |
| --- | --- |
| Nango sync with checkpoints + the 10k-search-cap workaround | [`nango-integrations/hubspot/syncs/fetch-contacts.ts`](nango-integrations/hubspot/syncs/fetch-contacts.ts) |
| OAuth via Nango Connect (no hardcoded connection IDs) | [`demo-app/server.js`](demo-app/server.js) (`/api/connect/session`), [`demo-app/public/app.js`](demo-app/public/app.js) (`startConnect`) |
| Webhook receiver with HMAC verification | [`demo-app/server.js`](demo-app/server.js) (`/api/webhooks/nango`, `verifySignature`) |
| Incremental record fetch via the Nango change-stream cursor | [`demo-app/server.js`](demo-app/server.js) (`fetchChanges`, `applyRecord`) |
| Realtime UI updates without polling | [`demo-app/public/app.js`](demo-app/public/app.js) (`openEventStream`, `applyChanges`) |

## Prerequisites

- Node.js ≥ 20
- A free [Nango](https://app.nango.dev) account with the HubSpot integration enabled
- [ngrok](https://ngrok.com/) (or any tunnel) so Nango can reach your local webhook endpoint
