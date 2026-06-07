import {
  AlertCircle,
  Link2,
  Loader2,
  PenLine,
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useConnection } from "../state/ConnectionContext";

const CAPABILITIES: { icon: LucideIcon; label: string }[] = [
  { icon: RefreshCw, label: "Keep a Notion database in sync, automatically" },
  { icon: PenLine, label: "Publish new pages straight back to Notion" },
  { icon: Sparkles, label: "Let the assistant file pages for you" },
];

/** The connect-state hero. Entry point for Nango Connect (Notion OAuth). */
export function ConnectNotionCard() {
  const { connect, status, error } = useConnection();
  const connecting = status === "connecting";

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="animate-rise w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-xl shadow-stone-900/5">
        {/* Lumin ↔ Notion */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-clay-50 ring-1 ring-clay-100">
            <img src="/logo.svg" alt="Lumin" className="size-8" />
          </div>
          <div className="flex size-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400">
            <Link2 className="size-4" />
          </div>
          <div className="flex size-14 items-center justify-center rounded-2xl bg-stone-900 font-display text-2xl font-semibold text-white">
            N
          </div>
        </div>

        <h2 className="mt-6 font-display text-2xl font-semibold text-stone-900">
          Connect your Notion
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-stone-500">
          Link a Notion workspace to sync a database into Lumin and publish new
          pages back to it.
        </p>

        <ul className="mt-6 space-y-2.5 text-left">
          {CAPABILITIES.map((cap) => (
            <li key={cap.label} className="flex items-center gap-3 text-sm">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-clay-50 text-clay-600">
                <cap.icon className="size-4" />
              </span>
              <span className="text-stone-600">{cap.label}</span>
            </li>
          ))}
        </ul>

        {error && (
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={connect}
          disabled={connecting}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-clay-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-clay-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {connecting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Opening Notion…
            </>
          ) : (
            "Connect Notion"
          )}
        </button>
      </div>
    </div>
  );
}
