# Google Tasks API-to-MCP companion

A Google Tasks agent built with Nango Agent Sessions and a custom discovery-preparation tool. `npm run starter` starts an agent without integrations. `npm start` runs the same interface with a server-created Nango Agent Session. The product agent uses OpenAI; Codex was used to build and test the integration with the Nango CLI and dashboard.

**Verified November 12–13, 2026:** local tests and compilation, managed OAuth through the dashboard and app-driven Connect, model reads and custom-tool writes, provider read-back, live read-only denial, pagination, and an empty date range. See [evidence/validation.md](evidence/validation.md) for the exact scope and remaining checks. This is a local demonstration, not a production application.

## Install and run the starter

Node.js >=22.22.2 and npm are required. From this folder:

```bash
npm ci
cp .env.example .env
npm run build
```

In your editor, configure `DEMO_USERNAME`, a `DEMO_PASSWORD` of at least 12 characters, and `OPENAI_API_KEY`. The default model is `gpt-6-luna`. Keep the password/key in `.env`; do not paste them into the agent conversation or commit the file.

**Model validation:** The default model is [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). On November 12, 2026, it passed a starter request, a read-only Responses API loop, and a custom-tool creation/read-back loop. Recheck model availability and tool calling when reusing this example.

```bash
npm run starter
```

Open http://127.0.0.1:3610 and enter the demo username/password in the browser's authentication prompt. The starter answers through the model but has no integration tools. This app listens only on the loopback interface and rejects other Host headers. Do not expose it to the public network.

## Set up Codex

Open this folder in Codex. The tutorial uses Codex to edit the source and run the Nango CLI commands below, with integration setup and Google consent in the dashboard.

To install Nango's function-building skill, run this command and select Codex in the installer:

```bash
npx skills add NangoHQ/skills -s building-nango-functions
```

Invoke the installed skill as `$building-nango-functions` in a Codex prompt. See the [Nango setup guide](https://nango.dev/docs/getting-started/coding-agent-setup) and [Codex skill documentation](https://learn.chatgpt.com/docs/build-skills).

For optional direct Nango account management through MCP:

```bash
codex mcp add nango-management --url https://mcp.nango.dev/mcp
codex mcp login nango-management
codex mcp list
```

Complete OAuth authorization, then use `/mcp` in Codex to check the connection. Ask Codex to list accessible Nango environments and select `dev`. This optional setup follows the [Codex MCP reference](https://learn.chatgpt.com/docs/extend/mcp?surface=cli); the captured walkthrough used the dashboard and CLI path.

## Run the integrated agent with read tools

In the Nango dashboard, create the `google-tasks` integration with the Nango-managed OAuth app and its `https://www.googleapis.com/auth/tasks` scope.

Set `NANGO_API_KEY` to a dev Environment API key with `environment:connect_sessions:write` and `environment:agent_sessions:write`. Leave `NANGO_CONNECTION_ID` empty and keep `ENABLE_DISCOVERY_PREP=false`. Stop the optional starter and run:

```bash
npm start
```

Sign in at http://127.0.0.1:3610. Click **Connect Google Tasks**, open **Authorize Google Tasks, then return here**, and complete Google consent and Nango Connect. Return to the app to ask about tasks.

Both Connect and chat routes call `connectionForUser(userId)` using the authenticated identity. It derives `tutorial=con-361` and `end_user_id=<authenticated username>` tags on the server. Connect copies those tags onto the connection; the Agent Session uses the same selector with an explicit tool allowlist. Create only one connection for that pair; multiple matches are ambiguous. A production app supporting multiple accounts should save connection IDs and verify ownership when selecting one.

For an isolated dashboard test instead, choose **Connections → Add test connection** and set `NANGO_CONNECTION_ID` to its ID. That connection belongs only to `DEMO_USERNAME` in this sample. The Connect button refuses to create another connection while this override is set. The November 12 captures used this pinned path. The app-driven Connect and tag-selected read passed on November 13; see [evidence/validation.md](evidence/validation.md).

```bash
npm run inspect
```

This opens a read-only session, calls MCP `tools/list`, prints its tool schemas, saves `evidence/live-read-tool-schemas.json`, and terminates the session. It does not list the user's tasks. Inspect the real catalog schemas before recording or modifying the walkthrough.

Create a Google Tasks list named `CON-361 demo`. Seed incomplete tasks:

- Review Acme account notes: 2026-11-11.
- Prepare discovery questions: 2026-11-13.
- Send next-week follow-up: 2026-11-18.

The app fixes the example date to `2026-11-11` via `DEMO_TODAY` and uses `Africa/Lagos`. Ask: `What tasks are due this week in CON-361 demo?` The intended week is Monday November 9 through Sunday November 15. Confirm the first two tasks appear and the third does not. Also test dates at both boundaries, an empty week, and a missing connection.

## Build the custom tool

The source is split into a [tool definition](integrations/google-tasks/tools/create-customer-discovery-prep.ts) and [shared contract/business rules](integrations/google-tasks/helpers/discovery-prep.ts). The public sample deck is https://revealjs.com/demo/. Replace it in the helper before deploying your real workflow. Presentation URL and notes are not model inputs.

```bash
npm test
npm run compile:tool
```

The `integrations/.nango/.gitkeep` file identifies the Nango project. Its package manifest pins the same Nango/Zod versions as the root; dependencies resolve from the root installation. The compile script disables automatic dependency updates to retain the lockfile's tested versions.

Configure `NANGO_SECRET_KEY_DEV` for Nango CLI operations. This key stays separate from the running application's session key. The [CLI scope reference](https://nango.dev/docs/reference/backend/http-api/api-keys#cli) lists `environment:connections:read`, `environment:integrations:read`, and `environment:proxy` for dry runs, and `environment:deploy` for deployment.

**The following dry run makes a real write.** Use the controlled list. From `integrations/`:

```bash
node --env-file=../.env ../node_modules/nango/dist/index.js dryrun \
  google-tasks/tools/create-customer-discovery-prep.ts '<CONNECTION_ID>' -e dev \
  --input '{"customerName":"Acme Dry Run","dueDate":"2026-11-13","taskListId":"<TEST_LIST_ID>"}' \
  --validate --no-dependency-update

node --env-file=../.env ../node_modules/nango/dist/index.js deploy \
  dev google-tasks/tools/create-customer-discovery-prep.ts --no-dependency-update
```

Google must grant `https://www.googleapis.com/auth/tasks` to create a task. `meta.requiredScopes` documents that requirement; it neither grants Google permission nor narrows consent. Inspect the managed app's actual scopes and reconnect/change configuration if necessary.

## Expose and verify the custom workflow

Set `ENABLE_DISCOVERY_PREP=true`, restart the server, refresh the page, and confirm **Task creation enabled** appears. Choose **New conversation**. Ask:

```text
Create a customer discovery preparation task for Acme Walkthrough, due
November 13, 2026, in CON-361 demo, with our standard deck link.
```

Confirm the title, date, list, deck URL, all three notes, returned task ID, and read-back through `list-tasks`. Use synthetic customer names. Task titles and notes go to the model provider as tool results.

For a direct MCP check, set `TEST_TASK_LIST_ID` to this controlled list and run:

```bash
npm run verify:live -- --create-test-task
```

This opens a read-only control session and then a separate write-enabled session. It creates a real `Acme Demo` task with the allowed session, checks its fields, and probes the still-open read-only session using the same tool name but invalid input. A tool-access rejection must occur; input validation/provider failure is not accepted as permission evidence. The invalid input prevents a real write if access control unexpectedly regresses. The script leaves tasks in place for inspection and creates no destructive cleanup operations.

The verifier checks returned fields, reads back the matching task ID through `list-tasks`, and verifies the read-only denial. It uses the live-discovered `input`, `goal`, and `intent` envelope and saves the raw create response before parsing. Creation, read-back, and denial passed against Nango on November 12, 2026. If a later run fails after submission, inspect the controlled list before rerunning; do not automatically retry an uncertain creation. The product-model create/read-back loop also passed. Playground read and custom-create/read-back checks also passed separately. Its observed session used toolset="*", nango_proxy=true, and a one-hour expiry; it is not the app's restricted policy. The custom write required approving the proposed task in the Playground UI.

## Files and adaptation

- `src/server.ts`: localhost demo authentication, Connect link, conversation handling, server-selected policy.
- `src/policy.ts`: authorized connection selector, explicit read/write allowlists, proxy disabled.
- `src/session.ts`: session lifecycle and authenticated MCP client; tokens remain outside model messages.
- `src/agent.ts`: bounded model/tool loop using discovered schemas, pagination instructions, and missing-detail questions.
- `src/inspect.ts`: capture actual read-tool schemas.
- `src/verify-live.ts`: live positive-control/denial check (explicit opt-in write).
- `tests/contracts.test.ts`: local validation and authorization-policy tests.

For production, use your application's authentication, derive connection selectors from authenticated identity (or persist owned connection IDs), apply per-user access decisions, and replace the single-user in-memory conversation state. Keep provider credentials in Nango. The demonstration's five-minute sessions limit the lifetime of access; the backend also attempts termination after each question and logs cleanup failures. Termination does not cancel an in-flight call. A failed model request after a write does not undo that write.

The tutorial GIF uses Acme Walkthrough. Static Nango Logs and Google Tasks captures use Acme Demo from the direct verifier. Dry-run and rehearsal tasks have distinct names; repeated runs can add more tasks to the controlled list.

## Optional Playground check

Open the dev Agent Playground to inspect tool calls independently of the app. The November 12 read run returned six tasks for November 9–15 because custom-tool tests had already added four preparation tasks. A separate approved custom-tool call created Acme Playground; `get-task` read it back. The observed Playground policy allowed all tools, enabled raw proxy access, and lasted one hour. These checks do not establish the app's narrower permissions. The app uses only its allowed `list-tasks` tool for read-back.
