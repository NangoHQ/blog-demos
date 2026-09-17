# Gmail Agent Sessions

Companion code for **How to give AI agents access to user accounts without exposing OAuth tokens**.

A user connects Gmail through [Nango](https://nango.dev/). Your backend creates a five-minute session for one read-only action, retrieves up to five email subjects and snippets, and sends them to OpenAI for a summary. It terminates the session when the request finishes. Gmail OAuth credentials and the session token stay out of the model input.

## Prerequisites

- A [Nango account](https://app.nango.dev/) with a `dev` environment.
- A Google Cloud project and a Gmail test account with non-sensitive test messages.
- Node.js 24.10 or later, npm, and a Unix-compatible shell.
- An OpenAI API key for a Responses API model supporting function calling.

## Setup

### 1. Connect Gmail

Follow [Nango's Gmail OAuth app guide](https://nango.dev/docs/api-integrations/google-mail/how-to-register-your-own-gmail-api-oauth-app). Enable the Gmail API, create a web application OAuth client, and set its redirect URI to `https://api.nango.dev/oauth/callback`. For testing, use **External / Testing** and add your test mailbox as a test user.

In Nango's `dev` environment, add a Gmail integration with ID `google-mail-readonly`. Select **Custom developer app**, enter your Google client ID and secret, and request only this scope:

```text
https://www.googleapis.com/auth/gmail.readonly
```

Use **Add test connection** to authorize the mailbox, then copy the connection ID. If you use another integration ID, update the action directory, `index.ts`, `session.mjs`, and the probe name in `verify.mjs`.

### 2. Install and configure

Run from the `gmail-agent-sessions` directory:

```bash
npm ci --ignore-scripts --no-audit --no-fund
cp .env.example .env
chmod 600 .env
```

Fill `.env` in your editor. Create the two Nango keys under **dev → Environment settings → API Keys** with these scopes:

| Variable | Value |
| --- | --- |
| `NANGO_API_KEY` | Environment key with `environment:agent_sessions:write` |
| `NANGO_SECRET_KEY_DEV` | Environment key with `environment:deploy` |
| `NANGO_CONNECTION_ID` | Connection ID from Step 1 |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `OPENAI_MODEL` | The model to use; the example pins the snapshot from the recorded run |

Keep keys in `.env`, which Git ignores. Do not paste them into coding-agent conversations. Both Nango keys must belong to the environment containing the integration.

### 3. Test and deploy the actions

```bash
node --test action.test.mjs assistant.test.mjs session.test.mjs
export NANGO_CLI_UPGRADE_MODE=ignore
npx nango compile --no-dependency-update
node --env-file=.env node_modules/nango/dist/index.js deploy --action read-inbox-summary --no-dependency-update dev
node --env-file=.env node_modules/nango/dist/index.js deploy --action denied-probe --no-dependency-update dev
```

Wait for `Compiled` before deploying. Compilation regenerates `.nango/nango.json`; the repository includes `.nango/.gitkeep` to preserve the directory after cloning.

Check that Nango lists both actions as enabled under **Integrations → google-mail-readonly → Functions**. The `denied-probe` action makes no provider calls. It proves that an action works when allowed before the verifier checks its exclusion.

## Try it

Add non-sensitive messages to your test inbox. [test-messages.md](test-messages.md) contains the five synthetic examples used for the recorded run. The runner sends subjects and snippets to OpenAI and prints the resulting summary.

```bash
node --env-file=.env agent.mjs "Summarize up to five emails in my inbox."
```

Expect a `read_inbox` tool call, a `message_count`, the summary, and `session_terminated:true` after successful cleanup. Compare the summary with your messages; snippets may omit details. See the [recorded output](evidence/synthetic-summary-output.txt) and [model request bodies](evidence/synthetic-model-requests.json).

Next, verify the session restrictions:

```bash
node --env-file=.env verify.mjs --expiry --missing-connection
```

This check does not read Gmail or call OpenAI. Allow just over a minute for the expiry test. Expected output:

```text
Control: probe executed when allowed.
Restricted session: probe excluded.
Terminated session: HTTP 401.
Missing connection: connected=false; client setup rejected.
Expired session: HTTP 401.
```

Failures report a check stage and exit nonzero. The [implementation notes](docs/implementation-notes.md) cover troubleshooting, cleanup, test evidence, and production considerations.

## Project structure

| File | Role |
| --- | --- |
| [read-inbox-summary.ts](google-mail-readonly/actions/read-inbox-summary.ts) | Fixed Gmail requests, five-message limit, redaction, and text limits |
| [denied-probe.ts](google-mail-readonly/actions/denied-probe.ts) | Harmless positive control for the exclusion test |
| [session.mjs](session.mjs) | Session creation, MCP authentication, and termination |
| [assistant.mjs](assistant.mjs) | Tool validation and the two model requests |
| [agent.mjs](agent.mjs) | Terminal runner, OpenAI requests, errors, and cleanup |
| [verify.mjs](verify.mjs) | Live session permission and lifecycle checks |
| [action.test.mjs](action.test.mjs) | Offline Gmail request, redaction, and limit checks |
| [assistant.test.mjs](assistant.test.mjs) | Offline model/tool data-boundary checks |
| [session.test.mjs](session.test.mjs) | Missing-connection and selector-isolation checks |
| [evidence/](evidence/) | Recorded synthetic summary, model requests, and session results |

## Learn more

- [Nango Agent Sessions](https://nango.dev/docs/guides/agent-sessions)
- [Gmail read-only scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Implementation notes and verification record](docs/implementation-notes.md)

The demo uses a local connection ID and `https://api.nango.dev`. A product must verify connection ownership and handle reconnection. Read the [boundaries](docs/implementation-notes.md#boundaries) before adapting it for customer accounts.
