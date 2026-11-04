import { createHash } from 'node:crypto';

// Import an independently verified, already-delivered source event while writers are stopped.
// A source delivery ID is not a deduplication key across independent GitHub subscriptions.
export function importDeliveredCheckpoint(store, route, checkpoint, now = Date.now()) {
    const c = checkpoint;
    if (!c || typeof c.deliveryId !== 'string' || !/^[\w.:-]{1,200}$/.test(c.deliveryId) ||
        !['opened', 'closed', 'reopened'].includes(c.action) ||
        !/^[1-9]\d{0,19}$/.test(c.issueId) || !Number.isSafeInteger(c.number) || c.number < 1 ||
        typeof c.title !== 'string' || c.title.length > 1024 ||
        c.state !== (c.action === 'closed' ? 'closed' : 'open') ||
        typeof c.updatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(c.updatedAt) ||
        !Number.isFinite(Date.parse(c.updatedAt)) ||
        new Date(c.updatedAt).toISOString().replace('.000Z', 'Z') !== c.updatedAt ||
        c.receipt?.channel !== route.slackChannelId || !/^\d+\.\d+$/.test(c.receipt?.ts)) {
        throw new Error('Invalid delivered checkpoint');
    }
    const event = { repositoryId: route.githubRepositoryId, issueId: c.issueId, number: c.number,
        action: c.action, state: c.state, title: c.title, updatedAt: Date.parse(c.updatedAt) };
    const fingerprint = createHash('sha256').update(JSON.stringify(event)).digest('hex');
    const escaped = c.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return store.transaction(() => {
        const existingRoute = store.db.prepare(`SELECT * FROM routes WHERE customer_id=? AND
            github_integration_id=? AND github_connection_id=? AND repository_id=? AND
            slack_integration_id=? AND slack_connection_id=? AND slack_channel_id=?`)
            .get(route.customerId, route.githubIntegrationId, route.githubConnectionId, route.githubRepositoryId,
                route.slackIntegrationId, route.slackConnectionId, route.slackChannelId);
        if (!existingRoute) throw new Error('Route does not match trusted application configuration');
        if (store.db.prepare("SELECT count(*) AS n FROM outbox WHERE status IN ('pending','in_flight','uncertain')").get().n) {
            throw new Error('Drain or reconcile the outbox before importing');
        }
        const previous = store.db.prepare('SELECT * FROM deliveries WHERE customer_id=? AND delivery_id=?')
            .get(route.customerId, c.deliveryId);
        if (previous) throw new Error('Delivery already exists; inspect it instead of overwriting');
        const key = [route.customerId, route.githubRepositoryId, c.issueId];
        const old = store.db.prepare('SELECT * FROM issues WHERE customer_id=? AND repository_id=? AND issue_id=?').get(...key);
        if (old && (old.source_updated_at > event.updatedAt ||
            (old.source_updated_at === event.updatedAt && (old.state !== c.state || old.title !== c.title || old.number !== c.number)))) {
            throw new Error('Checkpoint is older or conflicts with current issue state');
        }
        store.db.prepare('INSERT INTO deliveries VALUES (?,?,?,?)').run(route.customerId, c.deliveryId, fingerprint, now);
        store.db.prepare(`INSERT INTO issues(customer_id,repository_id,issue_id,number,title,state,source_updated_at)
            VALUES (?,?,?,?,?,?,?) ON CONFLICT(customer_id,repository_id,issue_id) DO UPDATE SET
            number=excluded.number,title=excluded.title,state=excluded.state,source_updated_at=excluded.source_updated_at`)
            .run(...key, c.number, c.title, c.state, event.updatedAt);
        store.db.prepare(`INSERT INTO outbox(customer_id,delivery_id,slack_integration_id,slack_connection_id,
            slack_channel_id,text,status,attempts,available_at,result_channel,result_ts,last_error)
            VALUES (?,?,?,?,?,?,'sent',0,?,?,?,'imported_pipedream_receipt')`)
            .run(route.customerId, c.deliveryId, route.slackIntegrationId, route.slackConnectionId,
                route.slackChannelId, `GitHub issue #${c.number} ${c.action}: ${escaped}`, now, c.receipt.channel, c.receipt.ts);
        return { status: 'imported', deliveryId: c.deliveryId, notificationsSent: 0 };
    });
}
