import type { View } from "../lib/types";
import { useConnection } from "../state/ConnectionContext";
import { SyncStatus } from "./SyncStatus";

const META: Record<View, { title: string; sub: string }> = {
  workspace: {
    title: "Demo: Integrate Notion into your app using Nango",
    sub: "Your synced Notion content, and a desk to write back.",
  },
  assistant: {
    title: "Assistant",
    sub: "Ask it to draft and file a page — it calls your Notion tools.",
  },
  settings: {
    title: "Integrations",
    sub: "Connect the tools your workspace runs on.",
  },
};

export function Topbar({ view }: { view: View }) {
  const { status } = useConnection();
  const connected = status === "connected";
  const meta = META[view];

  return (
    <header className="flex h-[4.75rem] shrink-0 items-center gap-4 border-b border-stone-200/80 bg-paper/70 px-7 backdrop-blur-sm">
      <div className="min-w-0">
        <h1 className="font-display text-xl leading-tight font-semibold text-stone-900">
          {meta.title}
        </h1>
        <p className="truncate text-sm text-stone-500">{meta.sub}</p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {connected ? (
          view === "workspace" ? (
            <SyncStatus />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
              <span className="size-2 rounded-full bg-emerald-500" />
              Notion connected
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">
            <span className="size-2 rounded-full bg-stone-300" />
            Not connected
          </span>
        )}
      </div>
    </header>
  );
}
