import { createSync, type ProxyConfiguration } from 'nango';
import * as z from 'zod';

const ContactSchema = z.object({
    id: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    jobTitle: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string()
});
type Contact = z.infer<typeof ContactSchema>;

type HubspotContact = {
    id: string;
    properties: {
        firstname?: string | null;
        lastname?: string | null;
        email?: string | null;
        phone?: string | null;
        jobtitle?: string | null;
    };
    createdAt: string;
    updatedAt: string;
};

const CheckpointSchema = z.object({
    after: z.string().describe('HubSpot paging cursor (paging.next.after); empty string means start from the first page. Example: "557296410312"')
});

const sync = createSync({
    description: 'Fetches all HubSpot contacts using cursor pagination, with a checkpoint to resume interrupted runs.',
    version: '1.1.0',
    frequency: 'every hour',
    autoStart: true,
    checkpoint: CheckpointSchema,

    models: {
        Contact: ContactSchema
    },

    exec: async (nango) => {
        // Full refresh: every run walks the whole contact list. The `after` cursor is checkpointed
        // only so an interrupted run can resume; it is cleared once the last page succeeds.
        const checkpoint = await nango.getCheckpoint();
        let after: string | undefined = checkpoint?.['after'] || undefined;

        const proxyConfig: ProxyConfiguration = {
            // https://developers.hubspot.com/docs/reference/api/crm/objects/contacts#get-%2Fcrm%2Fv3%2Fobjects%2Fcontacts
            endpoint: '/crm/v3/objects/contacts',
            params: {
                properties: 'firstname,lastname,email,phone,jobtitle',
                ...(after && { after })
            },
            paginate: {
                type: 'cursor',
                cursor_name_in_request: 'after',
                cursor_path_in_response: 'paging.next.after',
                response_path: 'results',
                limit_name_in_request: 'limit',
                limit: 100,
                on_page: async ({ nextPageParam }) => {
                    after = typeof nextPageParam === 'string' ? nextPageParam : undefined;
                }
            },
            retries: 3
        };

        for await (const results of nango.paginate<HubspotContact>(proxyConfig)) {
            const contacts: Contact[] = results.map((contact) => ({
                id: contact.id,
                ...(contact.properties.firstname != null && { firstName: contact.properties.firstname }),
                ...(contact.properties.lastname != null && { lastName: contact.properties.lastname }),
                ...(contact.properties.email != null && { email: contact.properties.email }),
                ...(contact.properties.phone != null && { phone: contact.properties.phone }),
                ...(contact.properties.jobtitle != null && { jobTitle: contact.properties.jobtitle }),
                createdAt: contact.createdAt,
                updatedAt: contact.updatedAt
            }));

            if (contacts.length > 0) {
                await nango.batchSave(contacts, 'Contact');
            }

            // Save after every page, including the last, so clearCheckpoint() always has a row to clear.
            // On the last page `after` is undefined, so this stores '' (= start from the first page).
            await nango.saveCheckpoint({ after: after ?? '' });
        }

        // All pages fetched: clear the checkpoint so the next scheduled run starts from page 1.
        await nango.clearCheckpoint();
    }
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
