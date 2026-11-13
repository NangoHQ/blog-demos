# Validation record

Initial live test date: November 12, 2026. App-Connect revision: November 13, 2026.

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
- Codex built and tested the original source using the Nango CLI, direct MCP client, and dashboard. On November 13, Codex CLI 0.167.0 added Nango Management MCP and completed OAuth login. The authenticated Management MCP environments_list call in this Codex session returned dev (non-production) and prod (production). The official building-nango-functions skill was also installed for Codex in the fresh reproduction checkout. No production resources were modified.
- The primary app-driven Connect/tag-selection path passed on November 13. The app created the Connect link for the authenticated demo user. Before authorization, chat returned `Google Tasks is not connected.` After the user completed consent, the same app used the tag-selected account and returned seven incomplete tasks for November 9–15 through list-tasklists and list-tasks. The November 18 fixture was excluded. NANGO_CONNECTION_ID was empty in the running process. The November 12 captures use a dashboard test connection.
- Inclusive/exclusive date boundaries and ambiguous tag matches need separate live tests. The missing-connection case passed on November 13. The tested interior dates do not establish boundary behavior.
- An empty date range and pagination were tested directly through MCP, not as additional product-model conversations.
- The sample is a single-user localhost application. Production identity, durable conversation storage, and application authorization need adaptation.
- The locked install reports five dependency audit findings (one low, three moderate, one high). They are not remediated here; review applicability before deployment.

## November 13 revision checks

- TypeScript build and all six local tests passed after making authenticated identity explicit in both Connect and chat routes.
- The added test verifies distinct user tag selectors, rejects cross-user session policies, and prevents another user from inheriting the optional pinned demo account.
- Validation ran with NANGO_CONNECTION_ID empty and ENABLE_DISCOVERY_PREP=false. The local configuration now keeps these defaults for subsequent restarts.
- Connect-session creation succeeded through the authenticated app route. The user completed OAuth and the tag-selected product-agent read passed with HTTP 200. Refreshed full-resolution app Connect, seven-task answer, and both successful read-tool call screenshots are included in the article.

## Clean-checkout reproduction scope

On November 13, a new checkout of commit 4daf279 passed npm ci, all six tests, custom-tool compilation, and a live starter-agent request with no integration calls. A new test identity had no matching Google Tasks connection and correctly returned Google Tasks is not connected. The user chose to stop the fresh-user authorization rerun. The existing demo's live reads, custom creation/read-back, and read-only denial remain verified separately; a complete end-to-end live run from the clean checkout is not claimed.

## Playground read recording

The November 13 user recording shows the actual Playground prompt, successful List Tasklists and List Tasks calls, and seven incomplete tasks for November 9–15. It does not show expanded call arguments or the session policy. The article GIF trims idle time, preserves the full 3448×1940 frame, and uses 2× playback. A native-resolution lossless MP4 export is retained separately from the publication assets.

## Playground custom-tool recording

The November 13 recording shows the user approving create-customer-discovery-prep for Acme Playground Check, followed by successful custom creation and Get Task read-back. The final answer displays the returned ID, November 13 date, fixed reveal.js presentation URL, and all three preparation notes. A separate read-only MCP list-tasks call then found the same task and verified its stored date, link, and notes. The call cards remain collapsed in the recording; it does not show raw input/output envelopes. The article GIF preserves the full 3446×1938 frame, trims idle time, and runs at 2× speed for 12.53 seconds. Raw verification JSON remains ignored.

## Connection and OAuth scope evidence

The November 13 app-created Google Tasks connection overview shows tutorial=con-361 and end_user_id=demo with access/refresh tokens masked. A server-side connection read confirmed the granted scope https://www.googleapis.com/auth/tasks. Only the scope string was emitted; tokens were not printed or copied to public evidence. The connection screenshot is embedded unchanged in the article.

## Final technical recheck

After the article revisions on November 13, TypeScript compilation, all six tests, and Nango tool compilation passed again under Node 24.10.0/npm 11.6.1. A temporary read-only session pinned to the original test connection exposed exactly list-tasklists and list-tasks with the documented argument schemas. Provider read-back verified the existing Acme Walkthrough, Acme Demo, and Acme Playground Check tasks, including their date, presentation URL, and three notes. Calling the custom tool through this read-only session was rejected. No tasks were created or changed, and the session was terminated. This check does not constitute a new product-model run or the skipped fresh-user end-to-end reproduction.
