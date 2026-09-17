import { createAction } from 'nango';
import * as z from 'zod';

// Harmless test action. Deploy in a test environment, exclude from the session.
export default createAction({
  description: 'Negative authorization test; no provider calls or side effects.',
  version: '1.0.1',
  input: z.object({}).strict(),
  output: z.object({ executed: z.literal(true) }),
  exec: async () => ({ executed: true as const })
});
