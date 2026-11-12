import { createTool, scopes } from 'nango';
import * as z from 'zod';
import { Input, Output, buildTask } from '../helpers/discovery-prep.js';

export default createTool({
  description: 'Create a customer discovery preparation task with the configured presentation and preparation notes.',
  input: Input,
  output: Output,
  meta: {
    instructions: 'Use only when the user requests discovery preparation. Resolve the task list and obtain customerName and an explicit dueDate before writing. The presentation and notes are fixed by the implementation. Do not retry an uncertain creation automatically.',
    requiredScopes: scopes.all('https://www.googleapis.com/auth/tasks')
  },
  exec: async (nango, trigger) => {
    const input = Input.parse(trigger.input);
    const response = await nango.post({
      endpoint: `/tasks/v1/lists/${encodeURIComponent(input.taskListId)}/tasks`,
      data: buildTask(input),
      retries: 0
    });
    const task = z.object({ id: z.string(), title: z.string(), due: z.string(), notes: z.string() }).parse(response.data);
    return { taskId: task.id, taskListId: input.taskListId, title: task.title, dueDate: task.due.slice(0, 10), notes: task.notes };
  }
});
