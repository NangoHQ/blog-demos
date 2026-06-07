import { z } from 'zod';
import { createAction } from 'nango';

/**
 * Create a new Notion page as a SUB-PAGE under an existing page. Notion's API
 * can't create at a teamspace/workspace root, so every new page needs a parent —
 * here a page id (e.g. one of the teamspace's top-level docs).
 */
const InputSchema = z.object({
    parent_page_id: z
        .string()
        .describe('Notion page id to create the new page under. Example: "30de4cea-858a-80b7-9d73-fb0660193aee"'),
    title: z.string().describe('Title of the new page. Example: "Launch checklist"'),
    content: z
        .string()
        .optional()
        .describe('Optional body text. Blank lines split it into separate paragraph blocks.')
});

const OutputSchema = z.object({
    id: z.string().describe('Created page id'),
    url: z.string().describe('Created page URL, e.g. "https://www.notion.so/Launch-checklist-30de4cea..."'),
    title: z.string().describe('Title of the created page')
});

const action = createAction({
    description: 'Create a new Notion page as a sub-page under an existing page.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/notion/pages', group: 'Pages' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const title = input.title.trim();
        if (!title) {
            throw new nango.ActionError({ type: 'invalid_input', message: 'A page title is required.' });
        }

        // Split the body on blank lines into paragraph blocks. Notion caps a single
        // create at 100 child blocks and 2000 chars per rich-text segment.
        const paragraphs = (input.content ?? '')
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean)
            .slice(0, 100);

        const children = paragraphs.map((text) => ({
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: text.slice(0, 2000) } }] }
        }));

        // No retries: creating a page is not idempotent, so a retry could duplicate it.
        // https://developers.notion.com/reference/post-page
        const response = await nango.post<{ id: string; url?: string }>({
            endpoint: '/v1/pages',
            data: {
                parent: { page_id: input.parent_page_id },
                properties: { title: { title: [{ text: { content: title } }] } },
                ...(children.length > 0 && { children })
            },
            retries: 0
        });

        if (!response.data?.id) {
            throw new nango.ActionError({
                type: 'create_failed',
                message: 'Notion did not return a created page.',
                parent_page_id: input.parent_page_id
            });
        }

        return {
            id: response.data.id,
            url: response.data.url ?? '',
            title
        };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
