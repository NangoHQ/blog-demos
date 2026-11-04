import { readFileSync } from 'node:fs';
import { Store } from '../src/store.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: npm run routes -- routes.local.json');
const routes = JSON.parse(readFileSync(path, 'utf8'));
if (!Array.isArray(routes) || routes.length === 0) throw new Error('Expected a nonempty array of trusted server routes');
const store = new Store(process.env.DATABASE_PATH || 'data/migration.sqlite');
try {
    store.transaction(() => routes.forEach(route => store.addRoute(route)));
    console.log(`Loaded ${routes.length} route(s).`);
} finally { store.close(); }
