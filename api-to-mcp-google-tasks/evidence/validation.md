# Validation record

Test date: November 12, 2026.

## Environment

| Component | Version |
| --- | --- |
| Node.js | 25.9.0 |
| npm | 11.12.1 |
| TypeScript | 5.9.3 |
| Nango CLI/functions SDK | 0.72.4 |
| Zod | 4.6.7 |
| MCP TypeScript SDK | 1.30.0 |
| Node type definitions | 25.0.3 |
| Product-agent model | gpt-6-luna |

Dependencies are pinned in package-lock.json. Earlier local checks also passed under Node.js 24.10.0. The minimum version declared by this project is 22.22.2; it was not separately exercised.

## Local checks

- A fresh source-only checkout passed npm ci --ignore-scripts, TypeScript build, all five tests, and npm run compile:tool. No .env or existing build artifacts were copied.
- Nango tool typecheck, compilation, and artifact generation passed.
- Contract tests cover the fixed deck/notes, extra fields, empty/control-character names, impossible dates, and timestamp rejection.
- Policy tests cover wrong-user selection, separate read/write policies, and disabled raw proxy access.
- HTTP smoke test checks unauthenticated access, authenticated starter output, rejection of client-selected connections, and cross-origin POST rejection.

These checks do not make provider or model API calls. The HTTP test binds a loopback port using synthetic credentials.

## Live checks

The following used a controlled Google Tasks account through Nango's dev environment:

- Google Tasks authorization through the Nango-managed OAuth app; dashboard-created connection pinned in the backend.
- Actual MCP tools/list discovery for the two reads and the deployed custom tool. Required argument envelope: input, goal, intent.
- Starter model response and complete read-only model loop. The November 9–15 query included the November 11 and 13 fixtures and excluded November 18.
- Custom-tool CLI dry run, then deployment of only that file. The dry run made a real task.
- Direct MCP creation of Acme Demo; read-back matched the returned task ID, title, list, November 13 date, fixed deck, and all three notes.
- The original read-only session stayed open while the write session was created. Calling the custom tool through it returned: `MCP error -32602: Tool google-tasks__create-customer-discovery-prep not found`.
- A model request with missing customer/date/list details asked for clarification rather than creating a task.
- The product-agent HTTP create/read-back loop succeeded for Acme Rehearsal. The recorded Acme Walkthrough run also succeeded, and a separate provider read confirmed the recorded task.
- Pagination with maxResults=1 returned a cursor and a distinct second task. A December 7–13 date-range query returned no tasks.
- Light-theme screenshots and a trimmed recording show the actual UI and tool calls. The two customer names in the media identify separate runs, not one combined execution.

Raw live JSON is ignored because it can contain account identifiers and task data. The verifier writes local evidence before parsing the creation result to avoid an automatic retry after an uncertain write. Never commit .env, session tokens, or raw connection credentials.

## Limits and outstanding checks

- Agent Playground reads and custom creation/read-back also passed. Its observed policy used toolset="*", nango_proxy=true, existing pinned connections, and a one-hour expiry. It searched for tools, created Acme Playground after UI approval, and verified it with get-task. This does not validate the app's narrower policy.
- Codex built and tested the source using the Nango CLI, direct MCP client, and dashboard. Optional Codex Management MCP login and Nango skill installation are documented setup instructions, not steps executed in the captured run. Codex MCP command syntax was checked against the installed CLI and official OpenAI/Nango documentation.
- The optional app-driven Connect/tag-selection path was not live-tested; the captured path uses a dashboard test connection.
- Inclusive/exclusive date boundaries, ambiguous tag matches, and missing connections need separate live tests. The tested interior dates do not establish boundary behavior.
- An empty date range and pagination were tested directly through MCP, not as additional product-model conversations.
- The sample is a single-user localhost application. Production identity, durable conversation storage, and application authorization need adaptation.
- The locked install reports five dependency audit findings (one low, three moderate, one high). They are not remediated here; review applicability before deployment.
