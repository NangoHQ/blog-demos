import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const databasePath = process.env.DATABASE_PATH || 'data/migration.sqlite';
const port = Number(process.env.DASHBOARD_PORT || 3408);
const files = {
    '/': ['text/html', new URL('../dashboard/index.html', import.meta.url)],
    '/app.js': ['text/javascript', new URL('../dashboard/app.js', import.meta.url)],
    '/style.css': ['text/css', new URL('../dashboard/style.css', import.meta.url)]
};
const server = createServer((req, res) => {
    const reply = (status, type, body) => {
        res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store',
            'content-security-policy': "default-src 'self'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff' });
        res.end(body);
    };
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return reply(403, 'text/plain', 'Local access only');
    if (req.method !== 'GET') return reply(405, 'text/plain', 'Read-only view');
    if (files[req.url]) {
        const [type, file] = files[req.url];
        return reply(200, type, readFileSync(file));
    }
    if (req.url !== '/api/evidence') return reply(404, 'text/plain', 'Not found');
    let db;
    try {
        db = new DatabaseSync(databasePath, { readOnly: true });
        const issues = db.prepare(`SELECT customer_id, repository_id, issue_id, number, title, state,
            source_updated_at, needs_reconciliation FROM issues ORDER BY source_updated_at DESC LIMIT 20`).all();
        const notifications = db.prepare(`SELECT id, delivery_id, text, status, attempts, result_channel, result_ts,
            last_error FROM outbox ORDER BY id DESC LIMIT 20`).all();
        const counts = {
            deliveries: db.prepare('SELECT count(*) AS n FROM deliveries').get().n,
            quarantine: db.prepare('SELECT count(*) AS n FROM quarantine').get().n
        };
        reply(200, 'application/json', JSON.stringify({ issues, notifications, counts, readAt: new Date().toISOString() }));
    } catch {
        reply(503, 'application/json', JSON.stringify({ error: 'Start the receiver and load its routes first.' }));
    } finally { db?.close(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Support record view: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
