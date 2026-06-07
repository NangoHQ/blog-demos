import { useMemo, useState } from "react";
import { Database, FileText } from "lucide-react";
import { useDocs } from "../state/DocsContext";
import { DocRow } from "./DocRow";

/** The synced Notion database, rendered as a ruled editorial ledger. */
export function DocsLedger() {
  const { databases, pages, loading, justCreatedId } = useDocs();
  const [filter, setFilter] = useState<string>("all");

  const dbById = useMemo(
    () => new Map(databases.map((d) => [d.id, d])),
    [databases],
  );

  const visible = useMemo(
    () => (filter === "all" ? pages : pages.filter((p) => p.databaseId === filter)),
    [pages, filter],
  );

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {/* Ledger header */}
      <div className="flex items-center gap-3 border-b border-stone-200 px-6 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-stone-900 text-white">
          <Database className="size-4.5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-stone-900">
            Content database
          </h2>
          <p className="text-xs text-stone-400">
            Synced from Notion · {pages.length} page{pages.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="ml-auto">
          <label className="sr-only" htmlFor="db-filter">
            Filter by database
          </label>
          <select
            id="db-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-stone-200 bg-white py-1.5 pr-8 pl-3 text-sm text-stone-700 transition hover:border-stone-300 focus:border-clay-400 focus:ring-2 focus:ring-clay-100 focus:outline-none"
          >
            <option value="all">All databases</option>
            {databases.map((d) => (
              <option key={d.id} value={d.id}>
                {d.icon} {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && pages.length === 0 ? (
          <LedgerSkeleton />
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <FileText className="size-8 text-stone-300" />
            <p className="text-sm text-stone-500">No pages in this database yet.</p>
            <p className="text-xs text-stone-400">
              Create one on the right and it lands here.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-stone-100">
            {visible.map((page) => (
              <li key={page.id}>
                <DocRow
                  page={page}
                  database={dbById.get(page.databaseId)}
                  highlight={page.id === justCreatedId}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function LedgerSkeleton() {
  return (
    <div className="divide-y divide-stone-100">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-6 py-4">
          <div className="h-4 w-2/3 rounded bg-stone-200/80 animate-shimmer bg-gradient-to-r from-stone-100 via-stone-200 to-stone-100" />
          <div className="mt-2 h-3 w-full rounded bg-stone-100" />
          <div className="mt-1.5 h-3 w-1/3 rounded bg-stone-100" />
        </div>
      ))}
    </div>
  );
}
