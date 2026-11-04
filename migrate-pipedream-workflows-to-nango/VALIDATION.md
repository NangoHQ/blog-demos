# Tests and validation

## Automated checks

From the demo directory, run:

```bash
npm ci
npm test
NANGO_CLI_UPGRADE_MODE=ignore npm run compile
npm run demo
```

Last verified November 3, 2026 with Node.js 24.10.0, Nango CLI/SDK 0.71.14, and Zod 4.6.7: **27 tests passed**, compilation passed, and the synthetic demo passed. These commands use fixtures and mocked provider responses; they make no real provider requests or deployments.

| Area | Coverage |
| --- | --- |
| Webhook receiver | Raw-body signature verification, input validation, customer routing, and quarantine |
| Persistence | Duplicate suppression, concurrent delivery, transactional rollback, and issue ordering |
| Worker | Exclusive leases, bounded rate-limit retries, auth rejection, and uncertain writes |
| Slack action and SDK | Request/response contract and prevention of automatic retries after ambiguous failures |
| Checkpoint import | Destination validation, duplicate rejection, rollback, and importing receipts without resending |

The synthetic demo produces two confirmed mock messages and one uncertain outcome. It also demonstrates duplicate suppression and an unknown-route quarantine.

## Connected-account testing

On November 1, 2026, the example was tested with one GitHub repository and Slack channel:

- Opening, closing, and reopening an issue updated the support record and sent notifications.
- Redelivering a GitHub event produced no additional notification.
- A controlled switch from Pipedream to Nango, back to Pipedream, and back to Nango kept one writer active and imported confirmed state between switches.
- Seven real issue changes produced seven notifications. Two separately labeled setup messages were excluded from that count.

The reusable checkpoint importer was tested locally; the live rehearsal used an equivalent script with independently verified source values.

## Scope of the results

Failure and concurrency cases were simulated locally. The connected-account run does not establish behavior under concurrent production cutover, automatic backfill, or exactly-once external delivery.

The Pipedream baseline was built for this tutorial. The supplied files are workflow source and setup instructions; an official Pipedream export was not generated.
