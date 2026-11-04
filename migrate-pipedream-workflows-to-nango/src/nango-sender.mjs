import { Nango } from '@nangohq/node';

export function createNangoSender({ apiKey, host, actionName = 'migration-send-message' }) {
    if (!apiKey) throw new Error('NANGO_API_KEY is required');
    const nango = new Nango({ apiKey, ...(host ? { host } : {}) });
    return job => nango.triggerAction(job.slack_integration_id, job.slack_connection_id, actionName, {
        channel_id: job.slack_channel_id, text: job.text
    });
}
