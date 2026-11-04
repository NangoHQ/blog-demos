const element = (tag, value, className) => {
    const item = document.createElement(tag); item.textContent = value;
    if (className) item.className = className;
    return item;
};
function renderIssues(rows) {
    const target = document.querySelector('#issues'); target.replaceChildren();
    if (!rows.length) target.append(element('p', 'No issue events received yet.', 'empty'));
    for (const row of rows) {
        const card = element('article', '', 'card');
        card.append(element('span', row.state, `badge ${row.state}`), element('h3', `#${row.number} ${row.title}`),
            element('p', `Customer: ${row.customer_id} · Repository ID: ${row.repository_id}`, 'detail'),
            element('p', `Source updated: ${new Date(row.source_updated_at).toISOString()}`, 'detail'));
        if (row.needs_reconciliation) card.append(element('p', 'Conflicting source snapshots need reconciliation.', 'attention'));
        target.append(card);
    }
}
function renderNotifications(rows) {
    const target = document.querySelector('#notifications'); target.replaceChildren();
    if (!rows.length) target.append(element('p', 'No notifications queued yet.', 'empty'));
    for (const row of rows) {
        const card = element('article', '', 'card');
        card.append(element('span', row.status.replaceAll('_', ' '), `badge ${row.status}`), element('h3', row.text),
            element('p', `Delivery: ${row.delivery_id} · Attempts: ${row.attempts}`, 'detail'));
        if (row.result_ts) card.append(element('p', `Slack channel: ${row.result_channel} · Message timestamp: ${row.result_ts}`, 'detail'));
        if (row.last_error) card.append(element('p', row.last_error, 'attention'));
        target.append(card);
    }
}
async function refresh() {
    try {
        const response = await fetch('/api/evidence');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Database unavailable');
        document.querySelector('#connection').textContent = `Database checked at ${data.readAt}`;
        document.querySelector('#counts').replaceChildren(
            element('span', `${data.counts.deliveries} accepted deliveries`), element('span', `${data.counts.quarantine} quarantined events`));
        renderIssues(data.issues); renderNotifications(data.notifications);
    } catch (error) {
        document.querySelector('#connection').textContent = error.message;
    } finally { setTimeout(refresh, 5000); }
}
refresh();
