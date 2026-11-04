import { parentPort, workerData } from 'node:worker_threads';
import { Store } from '../src/store.mjs';
import { receive } from '../src/receiver.mjs';
import { signed } from './helpers.mjs';

const store = new Store(workerData.path);
try { parentPort.postMessage(receive({ store, ...signed() })); }
finally { store.close(); }
