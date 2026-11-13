import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { demoConnection, listTools, openSession, required } from './session.js';
import { WRITE_TOOL } from './policy.js';
import { Output, PRESENTATION_URL, PREPARATION_NOTES } from '../integrations/google-tasks/helpers/discovery-prep.js';
if (!process.argv.includes('--create-test-task')) throw new Error('This test creates a real task. Run with --create-test-task only against the controlled CON-361 demo list.');
const taskListId = required('TEST_TASK_LIST_ID');
const connection = demoConnection();
const read = await openSession(required('DEMO_USERNAME'), connection, false);
try {
  // Create the read-only session first. It remains open as the write session is created.
  const write = await openSession(required('DEMO_USERNAME'), connection, true);
  try {
    const before = await listTools(read.client);
    const after = await listTools(write.client);
    const create = after.find(tool => tool.name.endsWith(`__${WRITE_TOOL}`));
    assert.ok(create, 'Custom tool must be deployed and present in the write session.');
    assert.ok(!before.some(tool => tool.name === create.name));
    assert.deepEqual(create.inputSchema.required, ['input', 'goal', 'intent']);
    const input = { customerName: 'Acme Demo', dueDate: '2026-11-13', taskListId };
    const result = await write.client.callTool({ name: create.name, arguments: {
      input, goal: 'Verify the tutorial discovery preparation workflow', intent: 'Create a synthetic task with the fixed presentation and notes'
    } });
    // Save the response before parsing: an unexpected envelope must not cause a duplicate write.
    await writeFile('evidence/live-custom-result.json', JSON.stringify({ checkedAt: new Date().toISOString(), input, result }, null, 2));
    assert.ok(!result.isError, 'Allowed creation must succeed before the denial check.');
    const text = Array.isArray(result.content) ? result.content.find(item => item.type === 'text')?.text : undefined;
    // Preserve the original result for review if the deployment's envelope differs.
    const raw = result.structuredContent ?? JSON.parse(typeof text === 'string' ? text : 'null');
    const task = Output.parse(raw);
    assert.equal(task.title, 'Prepare customer discovery call: Acme Demo');
    assert.equal(task.dueDate, input.dueDate);
    assert.equal(task.taskListId, taskListId);
    assert.ok(task.notes.includes(PRESENTATION_URL));
    for (const note of PREPARATION_NOTES) assert.ok(task.notes.includes(note));
    let cursor: string | undefined;
    let found: Record<string, any> | undefined;
    do {
      const page = await write.client.callTool({ name: `${connection.integrationId}__list-tasks`, arguments: {
        input: { tasklist: taskListId, maxResults: 100, showCompleted: false, showHidden: false, showDeleted: false, ...(cursor ? { cursor } : {}) },
        goal: 'Verify the tutorial discovery preparation workflow', intent: 'Read back the created task and compare its fields'
      } });
      assert.ok(!page.isError, 'Read-back failed. Inspect the created task before retrying.');
      const content = Array.isArray(page.content) ? page.content.find(item => item.type === 'text')?.text : undefined;
      const decoded = page.structuredContent ?? JSON.parse(typeof content === 'string' ? content : 'null');
      assert.ok(Array.isArray(decoded.items), 'Unexpected read-back envelope.');
      found = decoded.items.find((item: { id: string }) => item.id === task.taskId);
      cursor = decoded.nextCursor;
    } while (!found && cursor);
    assert.ok(found, 'Created task ID was not found on read-back.');
    assert.equal(found.title, task.title);
    assert.equal(found.due?.slice(0, 10), task.dueDate);
    assert.equal(found.notes, task.notes);
    // Safe denial probe: input is invalid for task creation, even if access control regresses.
    let denial = '';
    try {
      const denied = await read.client.callTool({ name: create.name, arguments: {} });
      assert.ok(denied.isError, 'Read-only session unexpectedly accepted the write tool.');
      denial = JSON.stringify(denied);
    } catch (error) {
      denial = error instanceof Error ? error.message : String(error);
    }
    // A validation or provider failure is not evidence of an allowlist denial.
    assert.match(denial, /unknown.?tool|tool.*not found|tool.*not.*(allowed|available)|not.*(allowed|available).*tool/i);
    await writeFile('evidence/live-custom-and-denial.json', JSON.stringify({ checkedAt: new Date().toISOString(), task, readBack: found, denial }, null, 2));
    console.log('Custom task created and read back with fixed notes. Original read-only session rejected the write tool.');
    console.log('Open Google Tasks to inspect the created task.');
    console.log(JSON.stringify(task, null, 2));
  } finally { await write.close(); }
} finally { await read.close(); }
