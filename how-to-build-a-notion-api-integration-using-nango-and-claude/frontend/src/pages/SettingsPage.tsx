import { useState } from "react";
import { AlertCircle, Check, Loader2, Plug } from "lucide-react";
import { useConnection } from "../state/ConnectionContext";
import { formatFullDate } from "../lib/format";
import { NOTION_INTEGRATION_ID } from "../lib/nango";

const COMING_SOON = ["Google Drive", "Slack", "Linear"];

export function SettingsPage() {
  const { status, connection, connect, disconnect, error } = useConnection();
  const connected = status === "connected";
  const connecting = status === "connecting";
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await disconnect();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-7 py-8">
      <p className="text-sm text-stone-500">
        Connect the tools your workspace runs on. Authentication is handled by
        Nango, so your customers' credentials never touch this app.
      </p>

      {/* Notion integration card */}
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-stone-900 font-display text-xl font-semibold text-white">
            N
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-semibold text-stone-900">
                Notion
              </h3>
              {connected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
                  <Check className="size-3" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                  Not connected
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-stone-500">
              Sync a database into Lumin and publish new pages back to Notion.
            </p>
            <p className="mt-1 font-mono text-xs text-stone-400">
              provider: {NOTION_INTEGRATION_ID}
            </p>
          </div>

          <div className="shrink-0">
            {connected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-3.5 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-60"
              >
                {disconnecting && <Loader2 className="size-4 animate-spin" />}
                Disconnect
              </button>
            ) : (
              <button
                onClick={connect}
                disabled={connecting}
                className="inline-flex items-center gap-2 rounded-lg bg-clay-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-clay-700 disabled:opacity-70"
              >
                {connecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plug className="size-4" />
                )}
                {connecting ? "Connecting…" : "Connect"}
              </button>
            )}
          </div>
        </div>

        {error && !connected && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {connected && connection && (
          <dl className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 text-sm sm:grid-cols-3">
            <Detail
              label="Workspace"
              value={`${connection.workspaceIcon} ${connection.workspaceName}`}
            />
            <Detail label="Connection ID" value={connection.connectionId} mono />
            <Detail
              label="Connected"
              value={formatFullDate(connection.connectedAt)}
            />
          </dl>
        )}
      </div>

      {/* Coming soon — reinforces that Notion is one of many Nango integrations. */}
      <h4 className="mt-8 text-xs font-semibold tracking-wide text-stone-400 uppercase">
        More integrations
      </h4>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {COMING_SOON.map((name) => (
          <div
            key={name}
            className="flex items-center gap-3 rounded-xl border border-dashed border-stone-200 bg-white px-4 py-3"
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-stone-50 text-stone-300 ring-1 ring-stone-200">
              <Plug className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-600">{name}</p>
              <p className="text-xs text-stone-400">Coming soon</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-xs text-stone-400">{label}</dt>
      <dd
        className={`mt-0.5 truncate text-stone-700 ${mono ? "font-mono text-xs" : "text-sm"}`}
      >
        {value}
      </dd>
    </div>
  );
}
