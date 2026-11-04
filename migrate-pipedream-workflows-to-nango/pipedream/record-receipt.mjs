export default defineComponent({
  props: { records: { type: 'data_store', label: 'Demo support records' } },
  async run({ steps, $ }) {
    const event = steps.update_support_record.$return_value;
    const receipt = steps.send_message.$return_value;
    if (!receipt?.ok || !receipt.ts || receipt.channel !== event.slackChannelId) {
      throw new Error('Slack did not return a matching successful receipt; reconcile before replay');
    }
    const result = { status: 'sent', issueKey: event.issueKey, text: event.text,
      channel: receipt.channel, timestamp: receipt.ts };
    await this.records.set(event.deliveryKey, result);
    await $.respond({ status: 200, body: { status: 'sent' } });
    return result;
  }
});
