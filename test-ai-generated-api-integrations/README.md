This example accompanies the Nango guide **“How to test AI-generated API integrations against real APIs.”**

It shows how to generate a HubSpot contacts sync with a coding agent, test it against a real HubSpot test account, catch an incomplete pagination implementation, fix it, turn the verified API response into a regression test, deploy the sync, and display the synced contacts in a small demo app.

## What this example contains

```text
test-ai-generated-api-integrations/
├── contacts.csv
├── expected.json
├── demo-app/
│   ├── public/
│   │   └── index.html
│   ├── .env.example
│   ├── package.json
│   └── server.js
└── nango-integrations/
    ├── hubspot/
    │   ├── syncs/
    │   │   └── fetch-contacts.ts
    │   └── tests/
    │       ├── fetch-contacts.test.json
    │       └── hubspot-fetch-contacts.test.ts
    ├── index.ts
    └── package.json
```
The seeded HubSpot account used for the walkthrough contains:

- 250 contacts
- Unique emails from `contact-001@example.com` to `contact-250@example.com`
- Five contacts without a phone number or job title
- Enough records to require three HubSpot API requests when using a page size of 100

The expected values are stored in [`expected.json`](./expected.json).

## Prerequisites

You need:

- Node.js
- [A Nango account](https://nango.dev/)
- A HubSpot test account
- A HubSpot integration configured in Nango
- A Nango dev environment API key
- A HubSpot connection in Nango

Import `contacts.csv` into your HubSpot test account before running the sync if you want to reproduce the same 250-contact dataset.

## 1. Install the Nango integration dependencies

From this directory:

```bash
cd nango-integrations
npm install
```

Create a local .env file with your Nango dev API key:

NANGO_SECRET_KEY_DEV=your-dev-api-key

Do not commit this file.

## 2. Run the sync against a real HubSpot connection

Compile the project:

```bash
npm run compile
```

Then run the sync against your HubSpot connection:

```bash
nango dryrun fetch-contacts <connection-id> --validate -e dev --no-interactive --auto-confirm
```

For the seeded account, the corrected sync should return:

```text
added: 250
updated: 0
deleted: 0
```

The sync uses HubSpot cursor pagination and fetches the contacts in three pages:

100 + 100 + 50 = 250 contacts

## 3. Record the verified response and run the regression test

Once the live result matches the expected dataset, save the API response:

```bash
nango dryrun fetch-contacts <connection-id> --save -e dev --no-interactive --auto-confirm
```

Generate the test:

```bash
nango generate:tests --sync fetch-contacts`
```

Then run it:

```bash
npm test
```

The generated fixture is stored in:

```text
hubspot/tests/fetch-contacts.test.json
```

and the generated Vitest test is:

```text
hubspot/tests/hubspot-fetch-contacts.test.ts
```

## 4. Deploy the sync

To deploy the verified sync to the Nango dev environment:

```bash
nango deploy --sync fetch-contacts dev
```

After deployment, trigger the sync for your test connection and verify the operation logs in Nango.

A successful run against the seeded account should fetch all 250 contacts across three HubSpot API requests.

## 5. Run the demo app

The demo-app reads the synced Contact records from Nango and displays them in a simple browser page.

Install its dependencies:

```bash
cd ../demo-app
npm install
```

Copy the example environment file:

```bash
cp .env.example .env
```

Then update .env with your own values:

```
NANGO_SECRET_KEY=your-dev-api-key
NANGO_CONNECTION_ID=your-hubspot-connection-id
```

Start the app:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

With the seeded account and a successful sync, the page should show:

```text
250 contacts synced
Important
```

The .env files are ignored by Git. Never commit Nango API keys, provider access tokens, or other credentials.

The recorded .test.json fixture should only be regenerated after you have verified the result against the real provider. If the expected output changes intentionally, rerun the live dry run with --save and record a new fixture.

## Related resources

[Nango coding agent setup](https://nango.dev/docs/getting-started/coding-agent-setup)
[Testing Nango functions](https://nango.dev/docs/guides/functions/testing)
[Sync checkpoints](https://nango.dev/docs/guides/functions/syncs/checkpoints)
[Nango Management MCP](https://nango.dev/docs/reference/backend/management-mcp)
