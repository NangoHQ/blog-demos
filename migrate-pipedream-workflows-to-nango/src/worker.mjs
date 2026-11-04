export function normalizeResult(result, job) {
    if (result?.status === 'sent' && result.channel === job.slack_channel_id &&
        typeof result.ts === 'string' && /^\d+\.\d+$/.test(result.ts)) return result;
    if (result?.status === 'rate_limited' && Number.isInteger(result.retryAfterSeconds) &&
        result.retryAfterSeconds >= 1 && result.retryAfterSeconds <= 86_400) return result;
    if (result?.status === 'rejected' && typeof result.error === 'string' && /^[\w-]{1,100}$/.test(result.error)) return result;
    return { status: 'uncertain', error: 'unconfirmed_delivery' };
}

export async function runOnce({ store, send, now = Date.now, timeoutMs = 60_000, leaseMs = 120_000 }) {
    if (leaseMs <= timeoutMs) throw new Error('The lease must outlast the request timeout');
    const job = store.claim(now(), leaseMs);
    if (!job) return null;
    let timer;
    let result;
    try {
        // Timeout does not prove cancellation. The provider might still accept the message.
        const response = await Promise.race([
            Promise.resolve().then(() => send(job)),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })
        ]);
        result = normalizeResult(response, job);
    } catch {
        // Do not infer safe retries from an undocumented nested SDK error shape.
        result = { status: 'uncertain', error: 'action_request_failed_or_timed_out' };
    } finally {
        clearTimeout(timer);
    }
    store.finish(job, result, now());
    return { id: job.id, ...result };
}
