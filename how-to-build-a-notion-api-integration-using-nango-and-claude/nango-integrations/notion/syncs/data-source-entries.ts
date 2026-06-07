import { createSync, type ProxyConfiguration } from 'nango';
import * as z from 'zod';

/**
 * Normalized Notion page record.
 *
 * One record per Notion page the connection can access — standalone pages,
 * nested sub-pages, AND database rows (in Notion's API a database row is just a
 * page whose parent is a `database_id`). Kept generic: every page has an id,
 * timestamps, a URL and a title; the per-page `properties` schema varies, so the
 * full bag is passed through unchanged for consumers to interpret.
 */
const NotionPageSchema = z.object({
    id: z.string().describe('Notion page id, e.g. "9fce4cea-858a-82d6-bbd2-010b7b3397ce"'),
    database_id: z
        .string()
        .describe('Parent database id when this page is a database row; empty string for standalone/nested pages'),
    title: z.string().describe('Plain-text page title, derived from the title property. Empty string when untitled.'),
    url: z.string().describe('Notion page URL, e.g. "https://www.notion.so/Blog-Requirements-9fce4cea..."'),
    created_time: z.string().describe('ISO 8601 timestamp, e.g. "2026-04-23T08:29:00.000Z"'),
    last_edited_time: z.string().describe('ISO 8601 timestamp the sync checkpoints on, e.g. "2026-06-06T18:29:00.000Z"'),
    properties: z
        .record(z.string(), z.unknown())
        .describe('Raw Notion properties, passed through unchanged. Keys and shape vary per page/database.')
});

/**
 * Single global high-water mark. The checkpoint must be a flat object of
 * primitives (the platform rejects nested objects/arrays), so one `last_edited_time`
 * spans every page.
 */
const CheckpointSchema = z.object({
    // Required (not .optional()): the platform's checkpoint type only allows bare
    // string/number/boolean values. Absence is modeled by getCheckpoint() returning
    // null on the first run, not by an optional field.
    last_edited_time: z
        .string()
        .describe('Newest last_edited_time synced so far; the descending search stops once it reads past this.')
});

type NotionPage = z.infer<typeof NotionPageSchema>;

/** Minimal shape of a Notion page in a search response. */
interface NotionRawPage {
    id: string;
    url?: string;
    created_time: string;
    last_edited_time: string;
    parent?: { type?: string; database_id?: string };
    properties?: Record<string, unknown>;
}

const sync = createSync({
    description:
        'Incrementally syncs every Notion page the connection can access (standalone pages, sub-pages and database rows), kept current via last_edited_time.',
    version: '1.1.0',
    endpoints: [{ method: 'GET', path: '/notion/pages', group: 'Pages' }],
    frequency: 'every 5 minutes',
    autoStart: true,
    checkpoint: CheckpointSchema,
    models: {
        NotionPage: NotionPageSchema
    },

    exec: async (nango) => {
        const checkpoint = await nango.getCheckpoint();
        const since = checkpoint?.last_edited_time;

        await nango.log(since ? `Syncing pages edited on/after ${since}` : 'Initial full page sync');

        // Notion's search endpoint can SORT by last_edited_time but cannot FILTER
        // by it, so we sort newest-first and stop as soon as we read a page that
        // is older than the checkpoint — everything after it is already synced.
        // The boundary is inclusive (we keep pages with last_edited_time === since)
        // because last_edited_time is minute-granular: re-reading the boundary
        // minute guarantees no page sharing it is skipped (batchSave dedupes on id).
        const proxyConfig: ProxyConfiguration = {
            // https://developers.notion.com/reference/post-search
            endpoint: '/v1/search',
            method: 'POST',
            data: {
                filter: { property: 'object', value: 'page' },
                sort: { timestamp: 'last_edited_time', direction: 'descending' }
            },
            paginate: {
                type: 'cursor',
                cursor_name_in_request: 'start_cursor',
                cursor_path_in_response: 'next_cursor',
                response_path: 'results',
                limit_name_in_request: 'page_size',
                limit: 100
            },
            retries: 3
        };

        // Sorted descending, so the very first page carries the newest timestamp.
        let newest = since;
        let reachedCheckpoint = false;

        for await (const batch of nango.paginate<NotionRawPage>(proxyConfig)) {
            const fresh: NotionRawPage[] = [];
            for (const page of batch) {
                if (since && page.last_edited_time < since) {
                    reachedCheckpoint = true; // older than the high-water mark → done
                    break;
                }
                fresh.push(page);
            }

            if (fresh.length > 0) {
                const pages: NotionPage[] = fresh.map(toNotionPage);
                await nango.batchSave(pages, 'NotionPage');
                const batchNewest = pages[0]!.last_edited_time;
                if (!newest || batchNewest > newest) {
                    newest = batchNewest;
                }
            }

            if (reachedCheckpoint) {
                break; // stop paginating — no need to fetch older pages
            }
        }

        // Commit the new high-water mark once the changed prefix is saved.
        // ISO 8601 UTC strings compare lexicographically === chronologically.
        if (newest && newest !== since) {
            await nango.saveCheckpoint({ last_edited_time: newest });
        }
    }
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;

/** Map a raw Notion page into the normalized NotionPage record. */
function toNotionPage(page: NotionRawPage): NotionPage {
    const properties = page.properties ?? {};
    return {
        id: page.id,
        database_id: page.parent?.type === 'database_id' ? (page.parent.database_id ?? '') : '',
        title: extractTitle(properties),
        url: page.url ?? '',
        created_time: page.created_time,
        last_edited_time: page.last_edited_time,
        properties
    };
}

/**
 * Pull the plain-text title out of the one property whose type is `title`
 * (every Notion page has exactly one). Returns '' for an untitled page.
 */
function extractTitle(properties: Record<string, unknown>): string {
    for (const value of Object.values(properties)) {
        const prop = value as { type?: string; title?: { plain_text?: string }[] };
        if (prop?.type === 'title' && Array.isArray(prop.title)) {
            return prop.title
                .map((segment) => segment.plain_text ?? '')
                .join('')
                .trim();
        }
    }
    return '';
}
