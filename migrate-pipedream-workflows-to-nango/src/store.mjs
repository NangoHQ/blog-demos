import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
    constructor(path = ':memory:') {
        if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
        this.db = new DatabaseSync(path);
        this.db.exec(`
            PRAGMA busy_timeout = 5000;
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS routes (
                customer_id TEXT NOT NULL,
                github_integration_id TEXT NOT NULL,
                github_connection_id TEXT NOT NULL,
                repository_id TEXT NOT NULL,
                slack_integration_id TEXT NOT NULL,
                slack_connection_id TEXT NOT NULL,
                slack_channel_id TEXT NOT NULL,
                PRIMARY KEY (github_integration_id, github_connection_id, repository_id)
            );
            CREATE TABLE IF NOT EXISTS deliveries (
                customer_id TEXT NOT NULL, delivery_id TEXT NOT NULL,
                fingerprint TEXT NOT NULL, received_at INTEGER NOT NULL,
                PRIMARY KEY (customer_id, delivery_id)
            );
            CREATE TABLE IF NOT EXISTS issues (
                customer_id TEXT NOT NULL, repository_id TEXT NOT NULL, issue_id TEXT NOT NULL,
                number INTEGER NOT NULL, title TEXT NOT NULL, state TEXT NOT NULL,
                source_updated_at INTEGER NOT NULL, needs_reconciliation INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (customer_id, repository_id, issue_id)
            );
            CREATE TABLE IF NOT EXISTS outbox (
                id INTEGER PRIMARY KEY, customer_id TEXT NOT NULL, delivery_id TEXT NOT NULL,
                slack_integration_id TEXT NOT NULL, slack_connection_id TEXT NOT NULL,
                slack_channel_id TEXT NOT NULL, text TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending','in_flight','sent','rejected','uncertain')),
                attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL,
                lease_token TEXT, lease_until INTEGER,
                result_channel TEXT, result_ts TEXT, last_error TEXT,
                UNIQUE (customer_id, delivery_id),
                FOREIGN KEY (customer_id, delivery_id) REFERENCES deliveries(customer_id, delivery_id)
            );
            CREATE INDEX IF NOT EXISTS outbox_ready ON outbox(status, available_at);
            CREATE TABLE IF NOT EXISTS quarantine (
                id INTEGER PRIMARY KEY, received_at INTEGER NOT NULL,
                reason TEXT NOT NULL, payload_sha256 TEXT NOT NULL
            );
        `);
    }

    transaction(fn) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const result = fn();
            this.db.exec('COMMIT');
            return result;
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    addRoute(route) {
        const fields = ['customerId', 'githubIntegrationId', 'githubConnectionId', 'githubRepositoryId',
            'slackIntegrationId', 'slackConnectionId', 'slackChannelId'];
        for (const field of fields) {
            if (typeof route[field] !== 'string' || !route[field].trim() || route[field].length > 200) {
                throw new Error(`Invalid route field: ${field}`);
            }
        }
        if (!/^[1-9]\d*$/.test(route.githubRepositoryId) || !/^[CG][A-Z0-9]+$/.test(route.slackChannelId)) {
            throw new Error('Expected a numeric GitHub repository ID and a Slack channel ID');
        }
        // Do not silently reassign a connection/repository to another tenant.
        this.db.prepare('INSERT INTO routes VALUES (?, ?, ?, ?, ?, ?, ?)').run(...fields.map(f => route[f]));
    }

    quarantine(raw, reason, now) {
        this.db.prepare('INSERT INTO quarantine(received_at, reason, payload_sha256) VALUES (?, ?, ?)')
            .run(now, reason, createHash('sha256').update(raw).digest('hex'));
        return { status: 'quarantined', reason };
    }

    accept(event, raw, now = Date.now()) {
        return this.transaction(() => {
            const route = this.db.prepare(`SELECT * FROM routes WHERE github_integration_id = ?
                AND github_connection_id = ? AND repository_id = ?`)
                .get(event.integrationId, event.connectionId, event.repositoryId);
            if (!route) return this.quarantine(raw, 'unknown_route', now);
            const fingerprint = createHash('sha256').update(JSON.stringify({
                repositoryId: event.repositoryId, issueId: event.issueId, number: event.number,
                action: event.action, state: event.state, title: event.title, updatedAt: event.updatedAt
            })).digest('hex');
            const previous = this.db.prepare('SELECT fingerprint FROM deliveries WHERE customer_id = ? AND delivery_id = ?')
                .get(route.customer_id, event.deliveryId);
            if (previous) {
                return previous.fingerprint === fingerprint ? { status: 'duplicate' }
                    : this.quarantine(raw, 'delivery_id_conflict', now);
            }
            this.db.prepare('INSERT INTO deliveries VALUES (?, ?, ?, ?)')
                .run(route.customer_id, event.deliveryId, fingerprint, now);
            const key = [route.customer_id, event.repositoryId, event.issueId];
            const old = this.db.prepare('SELECT * FROM issues WHERE customer_id = ? AND repository_id = ? AND issue_id = ?').get(...key);
            if (!old) {
                this.db.prepare(`INSERT INTO issues
                    (customer_id, repository_id, issue_id, number, title, state, source_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                    .run(...key, event.number, event.title, event.state, event.updatedAt);
            } else if (event.updatedAt > old.source_updated_at) {
                this.db.prepare(`UPDATE issues SET number = ?, title = ?, state = ?, source_updated_at = ?
                    WHERE customer_id = ? AND repository_id = ? AND issue_id = ?`)
                    .run(event.number, event.title, event.state, event.updatedAt, ...key);
            } else if (event.updatedAt === old.source_updated_at &&
                (event.state !== old.state || event.title !== old.title || event.number !== old.number)) {
                this.db.prepare(`UPDATE issues SET needs_reconciliation = 1
                    WHERE customer_id = ? AND repository_id = ? AND issue_id = ?`).run(...key);
            }
            const title = event.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            this.db.prepare(`INSERT INTO outbox (customer_id, delivery_id, slack_integration_id,
                slack_connection_id, slack_channel_id, text, status, available_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`)
                .run(route.customer_id, event.deliveryId, route.slack_integration_id, route.slack_connection_id,
                    route.slack_channel_id, `GitHub issue #${event.number} ${event.action}: ${title}`, now);
            return { status: 'accepted' };
        });
    }

    claim(now = Date.now(), leaseMs = 120_000) {
        return this.transaction(() => {
            // A dead worker may have posted successfully. Never turn its lease into a resend.
            this.db.prepare(`UPDATE outbox SET status = 'uncertain', last_error = 'lease_expired'
                WHERE status = 'in_flight' AND lease_until <= ?`).run(now);
            const row = this.db.prepare(`SELECT * FROM outbox WHERE status = 'pending' AND available_at <= ?
                ORDER BY id LIMIT 1`).get(now);
            if (!row) return null;
            const token = randomUUID();
            this.db.prepare(`UPDATE outbox SET status = 'in_flight', attempts = attempts + 1,
                lease_token = ?, lease_until = ? WHERE id = ?`).run(token, now + leaseMs, row.id);
            return { ...row, attempts: row.attempts + 1, lease_token: token };
        });
    }

    finish(job, result, now = Date.now()) {
        const ready = result.status === 'rate_limited';
        const status = ready ? (job.attempts < 5 ? 'pending' : 'rejected') : result.status;
        const error = ready ? (job.attempts < 5 ? 'rate_limited' : 'rate_limit_attempts_exhausted') : result.error ?? null;
        // The token fences late workers; expired writes can be resolved by their original response.
        return this.db.prepare(`UPDATE outbox SET status = ?, available_at = ?, lease_until = NULL,
            lease_token = NULL, result_channel = ?, result_ts = ?, last_error = ?
            WHERE id = ? AND lease_token = ? AND status IN ('in_flight', 'uncertain')`)
            .run(status, now + (ready ? result.retryAfterSeconds * 1000 : 0),
                result.channel ?? null, result.ts ?? null, error, job.id, job.lease_token).changes;
    }

    inspect() {
        return Object.fromEntries(['routes', 'deliveries', 'issues', 'outbox', 'quarantine']
            .map(table => [table, this.db.prepare(`SELECT * FROM ${table}`).all()]));
    }

    close() { this.db.close(); }
}
