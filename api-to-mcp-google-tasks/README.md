# Google Tasks API-to-MCP example

Connect Google Tasks to an agent through Nango Agent Sessions, then add a custom tool that creates discovery-preparation tasks with a fixed presentation link and notes.

The example has two modes: `npm run starter` runs the agent without integrations; `npm start` adds the scoped MCP tools. It uses OpenAI for the runtime agent and Codex for integration development.

## Install

You need Node.js 22.22.2 or later, npm, a Nango account, a Google test account, and an OpenAI API key.

From this folder:

```bash
npm ci
cp .env.example .env
npm run build
```

Set these values in `.env`:

- `DEMO_USERNAME`: your local demo username.
- `DEMO_PASSWORD`: a password of at least 12 characters.
- `OPENAI_API_KEY`: your OpenAI API key.
- `OPENAI_MODEL`: defaults to `gpt-6-luna`; choose a model available to your account that supports tool calling.

Keep `.env` out of version control. To try the agent before connecting Google Tasks:

```bash
npm run starter
```

Open http://127.0.0.1:3610 and sign in with the demo credentials. This is a single-user localhost app with in-memory conversation storage.

## Set up Codex

Open this folder in Codex and run:

```bash
npx skills add NangoHQ/skills --skill building-nango-functions --agent codex
codex mcp add nango-management --url https://mcp.nango.dev/mcp
```

Complete browser authorization. If it does not start automatically, run `codex mcp login nango-management`. Start a new Codex session, ask it to call `environments_list`, and use `dev` for this tutorial. Invoke `$building-nango-functions` when building the custom tool. See [Nango's coding-agent setup](https://nango.dev/docs/getting-started/coding-agent-setup).

## Connect Google Tasks

In Nango's `dev` environment, create an integration with ID `google-tasks`. Choose the Nango-managed OAuth app and confirm its fixed scopes include `https://www.googleapis.com/auth/tasks`.

In `.env`:

- Set `NANGO_API_KEY` to a dev Environment API key with `environment:connect_sessions:write` and `environment:agent_sessions:write`.
- Leave `NANGO_CONNECTION_ID` empty.
- Keep `ENABLE_DISCOVERY_PREP=false`.

Stop the starter if it is running, then run:

```bash
npm start
```

Sign in at http://127.0.0.1:3610. Click **Connect Google Tasks**, open **Authorize Google Tasks, then return here**, and complete Google consent and Nango Connect.

The backend assigns `tutorial=con-361` and `end_user_id=<authenticated username>` tags to the connection. Its Agent Sessions select that connection and allow only the configured tools. Create one connection for this user; multiple matching connections are ambiguous.

For an optional dashboard test connection, set `NANGO_CONNECTION_ID` to its ID instead. This override belongs to `DEMO_USERNAME` and disables the app's Connect flow.

## Verify the read tools

Inspect the available tools and their input schemas:

```bash
npm run inspect
```

Create a Google Tasks list named `CON-361 demo` with these incomplete tasks:

| Task | Due date |
| --- | --- |
| Review Acme account notes | 2026-11-11 |
| Prepare discovery questions | 2026-11-13 |
| Send next-week follow-up | 2026-11-18 |

The example uses `DEMO_TODAY=2026-11-11`, `DEMO_TIMEZONE=Africa/Lagos`, and a Monday-to-Sunday week. Ask:

```text
What incomplete tasks are due this week in CON-361 demo?
```

The first two tasks should appear; the November 18 task should not. Expand **Tool calls** to inspect the filters and compare the answer with Google Tasks.

## Build and deploy the custom tool

The [tool definition](integrations/google-tasks/tools/create-customer-discovery-prep.ts) validates inputs and calls Google Tasks. The [helper](integrations/google-tasks/helpers/discovery-prep.ts) enforces the title, presentation URL, and preparation notes. Replace the sample deck at https://revealjs.com/demo/ with your own URL before deploying your workflow.

```bash
npm test
npm run compile:tool
```

Set `NANGO_SECRET_KEY_DEV` to a dev Environment API key with `environment:connections:read`, `environment:integrations:read`, `environment:proxy`, and `environment:deploy`. See the [CLI scope reference](https://nango.dev/docs/reference/backend/http-api/api-keys#cli).

Copy the connection ID from its Nango dashboard entry and the test-list ID from `list-tasklists`. Substitute them below. **The dry run creates a real task.**

```bash
cd integrations
node --env-file=../.env ../node_modules/nango/dist/index.js dryrun \
  google-tasks/tools/create-customer-discovery-prep.ts '<CONNECTION_ID>' -e dev \
  --input '{"customerName":"Acme Dry Run","dueDate":"2026-11-13","taskListId":"<TEST_LIST_ID>"}' \
  --validate --no-dependency-update

node --env-file=../.env ../node_modules/nango/dist/index.js deploy \
  dev google-tasks/tools/create-customer-discovery-prep.ts --no-dependency-update
cd ..
```

Google must grant the `tasks` scope for creation. The tool's `meta.requiredScopes` documents this requirement; it does not grant consent. The task's `due` field stores a calendar date, with no time component.

## Run the custom workflow

Set `ENABLE_DISCOVERY_PREP=true`, restart the server, refresh the page, and confirm **Task creation enabled** appears. Choose **New conversation**, then ask:

```text
Create a customer discovery preparation task for Acme Walkthrough, due
November 13, 2026, in CON-361 demo, with our standard deck link.
```

Verify the title, list, date, presentation link, and three preparation notes in Google Tasks. The agent should read the task back through `list-tasks` and match its ID. Use test data: task content is sent to the model provider.

For an automated creation/read-back and permission check, set `TEST_TASK_LIST_ID` in `.env`, then run:

```bash
npm run verify:live -- --create-test-task
```

This creates an `Acme Demo` task, verifies its stored fields, and checks that a separate read-only session rejects the custom tool. It leaves the task in place for inspection. If creation returns an uncertain result, inspect the list before rerunning to avoid duplicates.

You can also try the tools in [Agent Playground](https://app.nango.dev/dev/playground/agent). Its permissions can differ from the app's allowlist, so use the verifier to check the app's restrictions.

See [verification and tested versions](evidence/validation.md) for commands, expected results, and known limitations.

## Adapt the example

- `src/server.ts`: authentication, Connect route, chat interface, and conversation state.
- `src/session.ts`: user-to-connection mapping, session creation, and MCP client cleanup.
- `src/policy.ts`: read/write tool allowlists and disabled proxy access.
- `src/agent.ts`: model/tool loop and instructions for resolving lists and reading tasks back.
- `integrations/google-tasks/`: custom tool and business rules.

For your product, use its authentication, verify ownership when selecting a connection, replace the global write switch with per-user authorization, and store conversations separately for each user. Keep session tokens in the backend and provider credentials in Nango.
