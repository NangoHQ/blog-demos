# Demo app — HubSpot Contacts browser

A tiny HTML + JS dashboard that demos the [HubSpot contacts sync](../nango-integrations) end-to-end:

- One-click "Connect HubSpot" via [Nango Connect](https://docs.nango.dev/integrate/guides/auth/connect)
- Browse and search the cached contacts (no live HubSpot calls)
- Trigger a manual sync
- Receive `sync` webhooks from Nango via SSE — the table updates live, only fetching the records that actually changed

## What's inside

- [`server.js`](server.js) — ~200-line Node/Express server. Three jobs: proxy a few Nango API calls so the secret key stays server-side, receive Nango's webhooks (HMAC-verified), broadcast events over Server-Sent Events.
- [`public/index.html`](public/index.html), [`public/app.js`](public/app.js), [`public/styles.css`](public/styles.css) — vanilla browser code. Loads the Nango Connect SDK from a CDN, listens to `/api/events`, paints contacts and webhook history.

## Prerequisites

- Node.js ≥ 20
- A Nango account with the HubSpot integration enabled
- The [`fetch-contacts` sync deployed](../nango-integrations) to your Nango environment
- [ngrok](https://ngrok.com/) (or any other tunnel) — needed for Nango to reach your local webhook endpoint

## Setup

```bash
npm install
cp .env.example .env
# Open .env and paste your Nango dev secret key
```

## Run

```bash
# Terminal 1 — the demo
npm start
# → http://localhost:3000

# Terminal 2 — public tunnel for Nango webhooks
ngrok http 3000
```

Copy the `https://…ngrok-free.app` URL ngrok prints, then in the Nango dashboard → *Environment Settings → Webhook URLs*, set it to:

```
https://<your-ngrok>.ngrok-free.app/api/webhooks/nango
```

## What you should see

1. Open http://localhost:3000 → big "Connect HubSpot" card.
2. Click it → Nango Connect modal opens → authorize HubSpot.
3. After OAuth, the dashboard switches to the connected view. The first run of `fetch-contacts` populates the cache; the dashboard polls `/api/state` once on connect, then never again.
4. Click "Sync now" → POST to `/sync/trigger` returns immediately. A few seconds later Nango fires a `sync` webhook → the right-side panel pops a new entry → the server fetches only the records that changed (using Nango's [change-stream cursor](https://docs.nango.dev/integrate/guides/syncs/records-cache#cursors-and-sync-progress)) → the changed rows flash yellow.

## How the realtime stream works

```
HubSpot ──► Nango sync ──► Records cache
                                │
                                ▼
                         POST /api/webhooks/nango   (HMAC-verified)
                                │
                                ▼
                         GET /records?cursor=…       (only the deltas)
                                │
                                ▼
                         Server-Sent Events ──► browser
```

The server keeps an in-memory `Map<id, contact>` per connection plus the `lastCursor` of the last record it has seen. On each webhook, it fetches everything newer than that cursor, applies the deltas (added/updated/deleted), and broadcasts both the raw webhook payload and the resulting record changes to every connected SSE client.

## Files to know

| File | Why it matters |
| --- | --- |
| [`server.js`](server.js#L107) | `/api/webhooks/nango` — HMAC verification + SSE broadcast |
| [`server.js`](server.js#L185) | `fetchAll()` — pagination via Nango's records cursor |
| [`public/app.js`](public/app.js#L62) | `openEventStream()` — `EventSource` wiring |
| [`public/app.js`](public/app.js#L114) | `applyChanges()` — local map merge with row-flash UX |

## Troubleshooting

- **Webhooks panel never gets entries** — Nango can't reach your tunnel. Verify the URL in the Nango dashboard matches your current ngrok URL (it changes on every restart with the free plan).
- **`401 Invalid signature`** — The `NANGO_SECRET_KEY_DEV` in `.env` doesn't match the environment that's POSTing the webhook (e.g. you saved a prod key but Nango is sending from dev). Check the dashboard.
- **`Connection not found` after OAuth** — You authorized into a different Nango environment than the one your secret key is for. Make sure both are dev (or both prod).
