import { createSync } from 'nango';
import * as z from 'zod';

const PAGE_LIMIT = 100;
const PROPERTIES = [
    'firstname',
    'lastname',
    'email',
    'phone',
    'jobtitle',
    'company',
    'createdate',
    'lastmodifieddate'
] as const;

const HubspotContactSchema = z.object({
    id: z.string(),
    firstname: z.string().optional(),
    lastname: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    jobtitle: z.string().optional(),
    company: z.string().optional(),
    createdate: z.string().optional(),
    lastmodifieddate: z.string()
});

type HubspotContact = z.infer<typeof HubspotContactSchema>;

// Nango's checkpoint schema only accepts ZodString | ZodNumber | ZodBoolean field types,
// so we use plain strings with empty-string sentinels to model "unset" values.
const CheckpointSchema = z.object({
    phase: z.string(),
    after: z.string(),
    lastmodifieddate: z.string()
});

interface HubspotContactProperties {
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
    phone?: string | null;
    jobtitle?: string | null;
    company?: string | null;
    createdate?: string | null;
    lastmodifieddate?: string | null;
}

interface HubspotContactRaw {
    id: string;
    properties?: HubspotContactProperties;
}

interface SearchResponse {
    results: HubspotContactRaw[];
    paging?: { next?: { after?: string } };
}

const sync = createSync({
    description:
        'Incrementally sync HubSpot contacts using a two-phase strategy: backfill via the list endpoint, then watermark-based incremental updates via the search endpoint. The watermark slides past the search-endpoint 10k-result cap on each scheduled run.',
    version: '1.0.0',
    frequency: 'every hour',
    autoStart: true,
    checkpoint: CheckpointSchema,
    models: {
        HubspotContact: HubspotContactSchema
    },

    exec: async (nango) => {
        const checkpoint = await nango.getCheckpoint();
        const phase = checkpoint?.phase === 'incremental' ? 'incremental' : 'initial';
        const initialAfter = checkpoint?.after ? checkpoint.after : undefined;
        let watermark = checkpoint?.lastmodifieddate ? checkpoint.lastmodifieddate : undefined;

        if (phase === 'initial') {
            await nango.log(
                `Starting initial phase${initialAfter ? ` from cursor ${initialAfter}` : ''}`
            );
            watermark = await runInitialPhase(nango, initialAfter, watermark);
        }

        await nango.log(
            `Starting incremental phase${watermark ? ` from lastmodifieddate ${watermark}` : ' with no watermark'}`
        );
        await runIncrementalPhase(nango, watermark);
    }
});

async function runInitialPhase(
    nango: NangoSyncLocal,
    initialAfter: string | undefined,
    initialWatermark: string | undefined
): Promise<string | undefined> {
    let watermark = initialWatermark;
    let transitionSaved = false;

    const proxyConfig = {
        // https://developers.hubspot.com/docs/api/crm/contacts#endpoint?spec=GET-/crm/v3/objects/contacts
        endpoint: '/crm/v3/objects/contacts',
        params: {
            limit: PAGE_LIMIT,
            properties: PROPERTIES.join(','),
            ...(initialAfter ? { after: initialAfter } : {})
        },
        paginate: {
            type: 'cursor' as const,
            cursor_name_in_request: 'after',
            cursor_path_in_response: 'paging.next.after',
            response_path: 'results',
            limit_name_in_request: 'limit',
            limit: PAGE_LIMIT,
            on_page: async ({ nextPageParam }: { nextPageParam?: string | number | undefined }) => {
                if (typeof nextPageParam === 'string' && nextPageParam) {
                    await nango.saveCheckpoint({
                        phase: 'initial',
                        after: nextPageParam,
                        lastmodifieddate: watermark ?? ''
                    });
                } else {
                    await nango.log('Initial phase complete; transitioning to incremental phase');
                    await nango.saveCheckpoint({
                        phase: 'incremental',
                        after: '',
                        lastmodifieddate: watermark ?? ''
                    });
                    transitionSaved = true;
                }
            }
        },
        retries: 3
    };

    for await (const page of nango.paginate<HubspotContactRaw>(proxyConfig)) {
        const contacts = page.map(toContact);
        if (contacts.length > 0) {
            await nango.batchSave(contacts, 'HubspotContact');
            watermark = highestWatermark(contacts, watermark);
        }
    }

    // The cursor paginator returns early on an empty `results` array without firing on_page,
    // so the transition to the incremental phase has to be persisted here for that case.
    if (!transitionSaved) {
        await nango.log('Initial phase complete (no further pages); transitioning to incremental phase');
        await nango.saveCheckpoint({
            phase: 'incremental',
            after: '',
            lastmodifieddate: watermark ?? ''
        });
    }

    return watermark;
}

async function runIncrementalPhase(
    nango: NangoSyncLocal,
    initialWatermark: string | undefined
): Promise<void> {
    // The filter watermark stays constant for the duration of this run because the
    // search endpoint's `after` cursor is only valid for the originating query.
    // Saved watermark advances per page so the next scheduled run picks up cleanly,
    // sliding past the 10k-result cap if HubSpot rejects this run mid-pagination.
    const filterWatermark = initialWatermark;
    let savedWatermark = initialWatermark;
    let after: string | undefined;

    const filterGroups = filterWatermark
        ? [
              {
                  filters: [
                      {
                          propertyName: 'lastmodifieddate',
                          operator: 'GT',
                          value: toMillisecondsString(filterWatermark)
                      }
                  ]
              }
          ]
        : [];

    while (true) {
        // https://developers.hubspot.com/docs/api/crm/search
        const response = await nango.post<SearchResponse>({
            endpoint: '/crm/v3/objects/contacts/search',
            data: {
                filterGroups,
                sorts: [
                    {
                        propertyName: 'lastmodifieddate',
                        direction: 'ASCENDING'
                    }
                ],
                properties: [...PROPERTIES],
                limit: PAGE_LIMIT,
                ...(after ? { after } : {})
            },
            retries: 3
        });

        const { results, paging } = response.data;

        if (results.length === 0) {
            return;
        }

        const contacts = results.map(toContact);
        await nango.batchSave(contacts, 'HubspotContact');
        savedWatermark = highestWatermark(contacts, savedWatermark);

        await nango.saveCheckpoint({
            phase: 'incremental',
            after: '',
            lastmodifieddate: savedWatermark ?? ''
        });

        after = paging?.next?.after;
        if (!after) {
            return;
        }
    }
}

function toContact(raw: HubspotContactRaw): HubspotContact {
    const props = raw.properties ?? {};
    const result: HubspotContact = {
        id: raw.id,
        lastmodifieddate: props.lastmodifieddate ?? ''
    };
    if (props.firstname) result.firstname = props.firstname;
    if (props.lastname) result.lastname = props.lastname;
    if (props.email) result.email = props.email;
    if (props.phone) result.phone = props.phone;
    if (props.jobtitle) result.jobtitle = props.jobtitle;
    if (props.company) result.company = props.company;
    if (props.createdate) result.createdate = props.createdate;
    return result;
}

function highestWatermark(contacts: HubspotContact[], current: string | undefined): string | undefined {
    let highest = current;
    for (const contact of contacts) {
        if (contact.lastmodifieddate && (!highest || contact.lastmodifieddate > highest)) {
            highest = contact.lastmodifieddate;
        }
    }
    return highest;
}

function toMillisecondsString(iso: string): string {
    return new Date(iso).getTime().toString();
}

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
