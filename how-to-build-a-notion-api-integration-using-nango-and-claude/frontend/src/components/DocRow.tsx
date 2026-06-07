import { ArrowUpRight } from "lucide-react";
import type { NotionDatabase, NotionPage } from "../lib/types";
import { formatRelative } from "../lib/format";
import { StatusPill } from "./StatusPill";

export function DocRow({
  page,
  database,
  highlight,
}: {
  page: NotionPage;
  database?: NotionDatabase;
  highlight: boolean;
}) {
  return (
    <a
      href={page.url}
      target="_blank"
      rel="noreferrer"
      className={`group relative block px-6 py-4 transition-colors ${
        highlight ? "bg-clay-50/70" : "hover:bg-stone-50/80"
      }`}
    >
      {highlight && (
        <span className="absolute inset-y-0 left-0 w-0.5 bg-clay-500" aria-hidden />
      )}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[1.05rem] leading-snug font-semibold text-stone-900 group-hover:text-clay-700">
              {page.title}
            </h3>
            <ArrowUpRight className="size-3.5 shrink-0 text-stone-300 opacity-0 transition group-hover:opacity-100" />
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-500">
            {page.excerpt}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-400">
            {database && (
              <span className="inline-flex items-center gap-1">
                <span>{database.icon}</span>
                {database.name}
              </span>
            )}
            {database && page.author && <span aria-hidden>·</span>}
            {page.author && <span>{page.author}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusPill status={page.status} />
          <span className="text-xs text-stone-400">
            {formatRelative(page.lastEditedTime)}
          </span>
        </div>
      </div>
    </a>
  );
}
