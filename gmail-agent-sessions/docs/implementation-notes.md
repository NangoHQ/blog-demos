# Implementation notes

[Back to the README](../README.md)

## Cleanup and error reporting

When generating the runner with a coding agent, use this prompt alongside the article's two-file layout:

```text
Close the MCP client and terminate the session in finally. Attempt
termination even if closing the client fails.

Report failures as { error, stage }, with stage configuration,
session, or summary. Use missing_<VARIABLE> for absent configuration,
nango_http_<STATUS> or model_http_<STATUS> for API failures, and
request_failed otherwise. Never print raw errors, headers, or session
objects. Exit nonzero on failure; report session_cleanup_failed if
termination fails. Print session_terminated:true only after success.
```

## Troubleshooting

| Failure | Check |
| --- | --- |
| Compilation fails or an action is absent | Run from the project root. `index.ts` must import both actions with `.js` extensions. Preserve `.nango/`. Keep helper functions private; Nango rejects arbitrary named exports in action files. Suppress the CLI upgrade prompt with `NANGO_CLI_UPGRADE_MODE=ignore` and require the explicit `Compiled` result. |
| Deployment returns 403 | `NANGO_SECRET_KEY_DEV` needs `environment:deploy` in the environment containing the integration. |
| `nango_http_403` | `NANGO_API_KEY` needs `environment:agent_sessions:write` in that same environment. |
| Connection or Gmail call fails | Check the integration and connection IDs, then inspect the relevant Nango operation under **Logs**. Reconnect if the Google grant is unusable; a new Agent Session cannot repair it. |
| `model_http_401` | Check the OpenAI API key and account configuration. |
| `model_http_429` | Check rate limits and available API quota. Waiting helps with temporary rate limits, not exhausted billing quota. |
| `session_cleanup_failed` | Retain the session ID securely in a production backend and retry termination. The demo's five-minute expiry bounds subsequent use if cleanup fails. |

See the [Nango API-key reference](https://nango.dev/docs/reference/backend/http-api/api-keys) and [OpenAI error reference](https://developers.openai.com/api/docs/guides/error-codes).

## Boundaries

This demo hardcodes `https://api.nango.dev` for session requests and validates that MCP URL origin; EU or self-hosted deployments require changing both locations in `session.mjs`.

The backend and MCP client share one trusted process. Keeping credentials out of model input does not isolate them from arbitrary code in that process. The demo uses an operator-configured connection ID; a product must resolve the connection from authenticated application identity and verify ownership.

The model gets one function call per question because the runner supplies no tools to its second request. The session permits repeated calls to the allowed action until termination or expiry. Revocation does not cancel a call already in flight.

The text filter recognizes a few token formats; it is not a complete secret or personal-data detector. Model instructions do not guarantee prompt-injection resistance. Inspect application logs and trace exporters independently.

For Google's External/Testing configuration, refresh tokens for Gmail access expire after seven days. Reconnect as needed during testing. Production OAuth verification, customer onboarding, connection ownership, and provider-revocation recovery need separate work.

## Verification record

**Reference implementation:** compilation, five offline fixture tests, and four live session checks passed. Two OpenAI calls using `gpt-4.1-mini-2025-04-14` summarized five synthetic messages. An author-only wrapper checked the fixture pairs before the summary request; the companion runner does not include that check. The [stdout](../evidence/synthetic-summary-output.txt), [request bodies](../evidence/synthetic-model-requests.json), and [verifier stdout](../evidence/session-verification-output.txt) preserve the recorded results. Output files omit display-only headings; request bodies omit authentication headers and contain no configured keys or recognizable Gmail/session tokens. The earlier personal-mail output is excluded.

**Independent reconstruction:** a coding agent rebuilt the project from the tutorial prompts without reading the reference. Compilation and the replay agent's own 16 synthetic tests passed after fixing a named helper export and suppressing the CLI upgrade prompt. Its verifier passed four live checks; its summary runner made two OpenAI calls on the guarded synthetic messages and terminated its session. Live replay used the existing deployed actions; the reconstructed actions compiled locally but were not independently deployed.

**Missing-connection check:** seven offline tests and compilation passed. The live verifier passed its control, exclusion, termination, and missing-connection checks ([run output](../evidence/missing-connection-verification.txt)); the original verification run covered expiry. After adding failure stages, an offline smoke check confirmed a configuration failure reports `control` and exits nonzero.

**Final companion check:** a fresh copy of the publication files installed all 532 dependencies from the lockfile using `npm ci --ignore-scripts --no-audit --no-fund --offline`. All 11 offline tests passed, including four new action tests. Both actions compiled successfully. The current verifier passed its positive control, tool exclusion, termination, missing-connection, and independent expiry checks against Nango dev ([complete output](../evidence/final-session-verification.txt)). This run made no Gmail or OpenAI calls. The full synthetic Gmail/model result remains the recorded run above.

## References

- [Nango Agent Sessions](https://nango.dev/docs/guides/agent-sessions)
- [Register a Gmail OAuth app](https://nango.dev/docs/api-integrations/google-mail/how-to-register-your-own-gmail-api-oauth-app)
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [MCP tool errors](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling)
- [Google refresh-token expiry](https://developers.google.com/identity/protocols/oauth2#expiration)
