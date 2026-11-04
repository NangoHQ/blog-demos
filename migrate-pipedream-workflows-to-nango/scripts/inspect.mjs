import { Store } from '../src/store.mjs';

const store = new Store(process.env.DATABASE_PATH || 'data/migration.sqlite');
try { console.log(JSON.stringify(store.inspect(), null, 2)); }
finally { store.close(); }
