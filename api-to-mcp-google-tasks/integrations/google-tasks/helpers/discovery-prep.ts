import * as z from 'zod';

// Public sample presentation, not a customer deck. Replace in code before deployment.
export const PRESENTATION_URL = 'https://revealjs.com/demo/';
export const PREPARATION_NOTES = [
  'Review the customer website and existing account notes.',
  'Prepare three questions about the current workflow and its constraints.',
  'Agree on the desired outcome and next step for the discovery call.'
] as const;
export const Input = z.object({
  customerName: z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/),
  dueDate: z.iso.date(),
  taskListId: z.string().min(1).max(1024)
}).strict();
export const Output = z.object({
  taskId: z.string(), taskListId: z.string(), title: z.string(), dueDate: z.iso.date(), notes: z.string()
});
export function buildTask(value: unknown) {
  const input = Input.parse(value);
  return {
    title: `Prepare customer discovery call: ${input.customerName}`,
    due: `${input.dueDate}T00:00:00.000Z`,
    notes: [`Presentation: ${PRESENTATION_URL}`, '', ...PREPARATION_NOTES].join('\n')
  };
}
