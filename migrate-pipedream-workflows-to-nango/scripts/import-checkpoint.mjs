import { readFileSync } from 'node:fs';
import { Store } from '../src/store.mjs';
import { importDeliveredCheckpoint } from '../src/checkpoint.mjs';
const [routesPath, checkpointPath] = process.argv.slice(2);
if (!routesPath || !checkpointPath) throw new Error('Usage: node --env-file=.env scripts/import-checkpoint.mjs routes.local.json checkpoint.json');
const routes = JSON.parse(readFileSync(routesPath, 'utf8'));
if (!Array.isArray(routes) || routes.length !== 1) throw new Error('Supply exactly one trusted route for this import');
const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
const store = new Store(process.env.DATABASE_PATH || 'data/migration.sqlite');
try { console.log(JSON.stringify(importDeliveredCheckpoint(store, routes[0], checkpoint))); }
finally { store.close(); }
