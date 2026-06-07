import { RefreshCw } from "lucide-react";
import { useConnection } from "../state/ConnectionContext";
import { formatRelative } from "../lib/format";

/** "Synced 2m ago" + a manual Sync button. Drives the data-source-entries sync. */
export function SyncStatus() {
  const { sync, runSync } = useConnection();
  const syncing = sync.status === "syncing";

  return (
    <div className="flex items-center gap-3">
      {sync.lastSyncedAt && (
        <span className="hidden text-xs text-stone-400 sm:inline">
          {syncing ? "Syncing…" : `Synced ${formatRelative(sync.lastSyncedAt)}`}
        </span>
      )}
      <button
        onClick={runSync}
        disabled={syncing}
        className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-60"
      >
        <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing" : "Sync"}
      </button>
    </div>
  );
}
