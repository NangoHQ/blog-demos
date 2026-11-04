# Pipedream source workflow

This workflow receives a GitHub issue event, updates a support record, sends a Slack notification, and stores the receipt. Recreate it with the source files below to compare its behavior with the Nango implementation.

These files are individual workflow steps, not an importable Pipedream export.

## Build the workflow

1. Create an HTTP-triggered workflow. Select **Raw request** event data and **Return a custom response from your workflow** so the first step can verify the GitHub signature against the raw bytes.
2. Add a Node.js step named `verify_issue` using [`verify-issue.mjs`](verify-issue.mjs). Refresh fields and set the allowed numeric repository ID and a dedicated signing secret. Replace the sample customer ID `demo_customer_support` consistently for your test.
3. Add `update_support_record` using [`update-support-record.mjs`](update-support-record.mjs). Select a new Data Store and set the destination Slack channel ID.
4. Create a Slack app using [`slack-app-manifest.json`](slack-app-manifest.json), install it in your workspace, and invite it to the test channel. Its bot scope is `chat:write`. Save the Bot User OAuth Token through Pipedream's **Bot for Slack** connector.
5. Add `send_message` using [`send-message.mjs`](send-message.mjs). Refresh fields and select that connection.
6. Add `record_receipt` using [`record-receipt.mjs`](record-receipt.mjs) and select the same Data Store. It records the Slack receipt before returning HTTP 200.
7. Test with a uniquely identified, signed payload, then deploy. In the GitHub repository's Webhooks settings, add the workflow's HTTP URL, choose JSON, enter the same signing secret, and subscribe to **Issues**. Keep SSL verification enabled.
8. Pause Nango forwarding for this customer, then close and reopen a test issue. Check the workflow execution, support record, and Slack message.

Keep automated workflow retries disabled. A timeout can occur after Slack has accepted a message; check Slack history before replaying a failed step or resetting a pending delivery.

## Stored state

| Key | Value |
| --- | --- |
| `issue:<customer>:<repository>:<issue>` | Latest issue snapshot |
| `delivery:<GitHub delivery GUID>` | Processing status, followed by the confirmed Slack receipt |

This baseline is for sequential testing. Pipedream [Data Stores are not transactional](https://pipedream.com/docs/workflows/data-management/data-stores), so the delivery record alone does not prevent concurrent duplicate writes. Testing a send step independently also bypasses earlier deduplication.

Use the [checkpoint and cutover instructions](../README.md#import-confirmed-source-state-and-cut-over) to carry confirmed state into the Nango implementation. Connect accounts separately in Nango and keep only one notification writer active during the switch.
