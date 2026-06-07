/** Human-friendly relative time, e.g. "just now", "2h ago", "3d ago". */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Full, readable date — e.g. "Jun 6, 2026, 10:42 AM". */
export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Minutes/hours ago expressed as an ISO string offset from now. */
export function isoAgo(opts: { minutes?: number; hours?: number; days?: number }): string {
  const ms =
    (opts.minutes ?? 0) * 60_000 +
    (opts.hours ?? 0) * 3_600_000 +
    (opts.days ?? 0) * 86_400_000;
  return new Date(Date.now() - ms).toISOString();
}
