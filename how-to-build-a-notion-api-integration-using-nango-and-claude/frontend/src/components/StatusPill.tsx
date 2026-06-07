import type { DocStatus } from "../lib/types";

/**
 * Status as a small "ink-stamp": uppercase, tracked, a dot + hairline ring.
 * Part of the editorial anchor — reads like a rubber stamp on paper.
 */
const STYLES: Record<DocStatus, { label: string; dot: string; text: string; ring: string }> = {
  draft: {
    label: "Draft",
    dot: "bg-stone-400",
    text: "text-stone-500",
    ring: "ring-stone-300",
  },
  in_review: {
    label: "In review",
    dot: "bg-amber-500",
    text: "text-amber-700",
    ring: "ring-amber-300",
  },
  published: {
    label: "Published",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    ring: "ring-emerald-300",
  },
  archived: {
    label: "Archived",
    dot: "bg-stone-300",
    text: "text-stone-400",
    ring: "ring-stone-200",
  },
};

export function StatusPill({ status }: { status: DocStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase ring-1 ring-inset ${s.text} ${s.ring}`}
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
