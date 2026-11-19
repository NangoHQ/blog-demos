import { writeFile } from 'node:fs/promises';
import { demoConnection, listTools, openSession, required } from './session.js';
const session = await openSession(required('DEMO_USERNAME'), demoConnection(), false);
try {
  const tools = await listTools(session.client);
  // Schemas only. No session token or provider data is written.
  await writeFile('evidence/live-read-tool-schemas.json', JSON.stringify(tools, null, 2));
  console.log(JSON.stringify(tools, null, 2));
} finally { await session.close(); }
