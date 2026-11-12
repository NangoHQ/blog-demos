import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionPolicy } from '../src/policy.js';
import { Input, buildTask, PRESENTATION_URL, PREPARATION_NOTES } from '../integrations/google-tasks/helpers/discovery-prep.js';
const connection = { userId: 'alice', integrationId: 'google-tasks', connectionId: 'alice-connection' };
test('customer input cannot change the fixed presentation or notes', () => {
  const task = buildTask({ customerName: 'Acme Demo', dueDate: '2026-11-13', taskListId: 'controlled-list' });
  assert.equal(task.title, 'Prepare customer discovery call: Acme Demo');
  assert.equal(task.due, '2026-11-13T00:00:00.000Z');
  assert.ok(task.notes.includes(PRESENTATION_URL));
  for (const note of PREPARATION_NOTES) assert.ok(task.notes.includes(note));
  assert.equal(Input.safeParse({ customerName: 'Acme Demo', dueDate: '2026-11-13', taskListId: 'controlled-list', notes: 'override', presentationUrl: 'https://example.com' }).success, false);
});
test('invalid calendar dates and missing customer details are rejected', () => {
  for (const dueDate of ['2026-02-29', '2026-11-31', 'tomorrow', '2026-11-13T12:00:00Z']) {
    assert.throws(() => buildTask({ customerName: 'Acme', dueDate, taskListId: 'list' }));
  }
  assert.throws(() => buildTask({ customerName: ' ', dueDate: '2026-11-13', taskListId: 'list' }));
  assert.throws(() => buildTask({ customerName: 'Acme\nInjected', dueDate: '2026-11-13', taskListId: 'list' }));
});
test('wrong user cannot select another user connection', () => {
  assert.throws(() => sessionPolicy('bob', connection, false));
});
test('a later write policy leaves the original read policy unchanged', () => {
  const original = sessionPolicy('alice', connection, false);
  const write = sessionPolicy('alice', connection, true);
  assert.deepEqual(original.toolset['google-tasks'].allow.tools, ['list-tasklists', 'list-tasks']);
  assert.equal(write.toolset['google-tasks'].allow.tools.length, 3);
  assert.equal(original.meta_tools.nango_proxy, false);
  assert.equal(write.meta_tools.nango_proxy, false);
  assert.deepEqual(original.tenant.connections.pinned, [{ integration_id: 'google-tasks', connection_id: 'alice-connection' }]);
});
