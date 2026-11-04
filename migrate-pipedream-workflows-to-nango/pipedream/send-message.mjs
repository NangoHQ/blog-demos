// Dedicated Bot for Slack connection requires only chat:write and channel membership.
// No automatic retries: a timeout may occur after Slack has accepted the message.
export default defineComponent({
  props: { slack: { type: 'app', app: 'slack_bot' } },
  async run({ steps }) {
    const event = steps.update_support_record.$return_value;
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.slack.$auth.bot_token}`, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: event.slackChannelId, text: event.text, unfurl_links: false, unfurl_media: false }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(`Slack rejected request: ${result.error || response.status}`);
    return { ok: true, channel: result.channel, ts: result.ts };
  }
});
