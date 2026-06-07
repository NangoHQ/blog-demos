/**
 * The assistant is a Claude agent that runs on the backend (`POST /api/assistant`)
 * with its tools served by Nango's hosted MCP server — each deployed Notion
 * action (`create-page`, …) is a tool the model can call, and Nango injects the
 * user's credentials. The frontend just sends messages via `runAssistant` (see
 * `lib/nango.ts`) and renders the reply + tool-call cards.
 *
 * These are the starter prompts shown as chips in the empty assistant.
 */
export const SUGGESTED_PROMPTS = [
  'Create a page titled "Launch checklist" under Blog Requirements',
  'Draft a doc called "Webhook setup notes" in Topic Research',
  'Add a page titled "Standup — this week"',
];
