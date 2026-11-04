import { createHmac, timingSafeEqual } from 'node:crypto';

export default defineComponent({
  props: {
    signingSecret: { type: 'string', label: 'GitHub webhook signing secret', secret: true },
    repositoryId: { type: 'string', label: 'Allowed repository ID' }
  },
  async run({ steps, $ }) {
    const event = steps.trigger.event;
    const headers = {};
    if (Array.isArray(event.headers)) {
      for (let i = 0; i < event.headers.length; i += 2) {
        headers[String(event.headers[i]).toLowerCase()] = event.headers[i + 1];
      }
    } else {
      for (const [key, value] of Object.entries(event.headers || {})) headers[key.toLowerCase()] = value;
    }
    const stop = async (status, reason) => {
      await $.respond({ status, body: { status: reason } });
      return $.flow.exit(reason);
    };
    const signature = headers['x-hub-signature-256'];
    if (typeof event.body !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature || '')) {
      return stop(401, 'missing_signature_or_raw_body');
    }
    const expected = createHmac('sha256', this.signingSecret).update(event.body).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) return stop(401, 'invalid_signature');
    const payload = JSON.parse(event.body);
    if (headers['x-github-event'] === 'ping') return stop(200, 'ping');
    if (headers['x-github-event'] !== 'issues' || !['opened', 'closed', 'reopened'].includes(payload.action)) {
      return stop(200, 'ignored_event');
    }
    if (String(payload.repository?.id) !== this.repositoryId) return stop(403, 'unexpected_repository');
    const issue = payload.issue;
    if (!issue || !Number.isSafeInteger(issue.id) || !Number.isSafeInteger(issue.number) ||
        typeof issue.title !== 'string' || issue.title.length > 1024 ||
        issue.state !== (payload.action === 'closed' ? 'closed' : 'open') ||
        !Number.isFinite(Date.parse(issue.updated_at)) || !headers['x-github-delivery']) {
      return stop(400, 'invalid_issue');
    }
    const title = issue.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return {
      customerId: 'demo_customer_support', repositoryId: this.repositoryId,
      deliveryId: headers['x-github-delivery'], action: payload.action,
      issue: { id: String(issue.id), number: issue.number, title: issue.title,
        state: issue.state, updatedAt: issue.updated_at },
      text: `GitHub issue #${issue.number} ${payload.action}: ${title}`
    };
  }
});
