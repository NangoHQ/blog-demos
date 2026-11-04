import { setTimeout as delay } from 'node:timers/promises';
import { Store } from './store.mjs';
import { runOnce } from './worker.mjs';
import { createNangoSender } from './nango-sender.mjs';

const send = createNangoSender({ apiKey: process.env.NANGO_API_KEY });
const store = new Store(process.env.DATABASE_PATH || 'data/migration.sqlite');
let running = true;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { running = false; });
try {
    do {
        const result = await runOnce({ store, send });
        if (result) console.log(JSON.stringify(result));
        if (process.argv.includes('--once')) break;
        if (running && !result) await delay(1000);
    } while (running);
} finally {
    store.close();
}
