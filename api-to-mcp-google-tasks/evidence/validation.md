# Verification and tested versions

Tested November 12–13, 2026.

| Component | Tested version |
| --- | --- |
| Node.js | 24.10.0 and 25.9.0 |
| npm | 11.6.1 and 11.12.1 |
| TypeScript | 5.9.3 |
| Nango CLI/functions SDK | 0.72.4 |
| Zod | 4.6.7 |
| MCP TypeScript SDK | 1.30.0 |
| Product-agent model | gpt-6-luna |

Dependencies are pinned in `package-lock.json`. The declared minimum Node.js version, 22.22.2, was not separately tested.

## Run the checks

| Command | Expected result |
| --- | --- |
| `npm test` | TypeScript build and six tests pass, covering input validation, fixed business rules, authentication, and connection/tool policies |
| `npm run compile:tool` | Nango typechecking, tool compilation, and artifact generation succeed |
| `npm run inspect` | A read-only session lists `google-tasks__list-tasklists` and `google-tasks__list-tasks` with their input schemas |
| `npm run verify:live -- --create-test-task` | Creates a real test task, verifies its stored fields, and confirms that a read-only session rejects the custom tool |

The last two commands require a connected Google Tasks account. The live verifier also requires the deployed custom tool and `TEST_TASK_LIST_ID` in `.env`. Follow the [README](../README.md) for setup.

## Expected behavior

- The weekly query returns the two in-range fixtures and excludes the November 18 task. Other tasks you create in that week also appear.
- The custom tool creates `Prepare customer discovery call: <customerName>` with the configured presentation URL and all three preparation notes.
- Read-back matches the returned task ID, date, title, and notes.
- The read-only session rejects `google-tasks__create-customer-discovery-prep`; it does not gain write access when another session allows the tool.

These workflows passed live checks, including the app's Connect flow and product-agent reads and writes. Pagination and an empty date range were checked directly through MCP.

Inspection and verification save JSON under `evidence/live-*.json`. These files are ignored by Git; keep them local because verification output can contain task data.

## Limitations

- Clean installation, local tests, compilation, and the starter request passed in a fresh checkout. A full fresh-user authorization-to-write run was not completed there.
- Date-boundary inclusivity and ambiguous connection selectors were not separately live-tested. Test these cases when adapting the example.
- The app uses single-user localhost authentication and in-memory conversation storage. Replace both for a customer-facing product.
- The locked dependencies reported five audit findings: one low, three moderate, and one high. Review them before deployment.
- Playground uses its own session policy. Its successful calls do not establish the app's permissions.
