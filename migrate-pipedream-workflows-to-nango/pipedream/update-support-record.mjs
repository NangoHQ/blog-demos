// Tutorial baseline for sequential, controlled tests. Pipedream Data Store
// operations are not transactional; this is not a concurrent outbox implementation.
export default defineComponent({
  props: {
    records: { type: 'data_store', label: 'Demo support records' },
    slackChannelId: { type: 'string', label: 'Approved Slack channel ID' }
  },
  async run({ steps, $ }) {
    const event = steps.verify_issue.$return_value;
    const deliveryKey = `delivery:${event.deliveryId}`;
    if (await this.records.has(deliveryKey)) {
      await $.respond({ status: 200, body: { status: 'duplicate' } });
      return $.flow.exit('Duplicate delivery');
    }
    const key = `issue:${event.customerId}:${event.repositoryId}:${event.issue.id}`;
    const previous = await this.records.get(key);
    if (!previous || Date.parse(event.issue.updatedAt) > Date.parse(previous.updatedAt)) {
      await this.records.set(key, { customerId: event.customerId, repositoryId: event.repositoryId, ...event.issue });
    }
    await this.records.set(deliveryKey, { status: 'pending', issueKey: key, text: event.text });
    return { ...event, deliveryKey, issueKey: key, slackChannelId: this.slackChannelId };
  }
});
