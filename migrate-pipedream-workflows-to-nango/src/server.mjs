import { Store } from './store.mjs';
import { createReceiver } from './receiver.mjs';

const store = new Store(process.env.DATABASE_PATH || 'data/migration.sqlite');
const server = createReceiver({ store, signingKey: process.env.NANGO_WEBHOOK_SIGNING_KEY });
const port = Number(process.env.PORT || 3407);
server.listen(port, '127.0.0.1', () => console.log(`Receiver: http://127.0.0.1:${port}/webhooks/nango`));
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
