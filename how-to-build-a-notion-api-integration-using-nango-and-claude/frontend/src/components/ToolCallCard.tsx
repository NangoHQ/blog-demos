import { ArrowUpRight, Check, Loader2, Wrench } from "lucide-react";
import type { ToolCall } from "../lib/types";

/**
 * Renders one tool invocation the agent made. The tools come from Nango's hosted
 * MCP server (each deployed Notion action is a tool), so this card mirrors
 * exactly what the model called and what came back.
 */
export function ToolCallCard({ call }: { call: ToolCall }) {
  const result = call.result;
  const link =
    result && typeof result === "object" && typeof (result as { url?: unknown }).url === "string"
      ? (result as { url: string; id?: string })
      : null;
  const otherResult = call.status !== "running" && result != null && !link ? result : null;

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
      <div className="flex items-center gap-2 border-b border-stone-200 bg-white px-3.5 py-2">
        <Wrench className="size-3.5 text-clay-600" />
        <span className="font-mono text-xs font-medium text-stone-700">{call.name}</span>
        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.65rem] text-stone-400">
          nango · notion · MCP
        </span>
        <span className="ml-auto">
          {call.status === "running" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
              <Loader2 className="size-3.5 animate-spin" />
              Running
            </span>
          ) : call.status === "success" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <Check className="size-3.5" />
              Done
            </span>
          ) : (
            <span className="text-xs font-medium text-rose-600">Failed</span>
          )}
        </span>
      </div>

      <pre className="overflow-x-auto px-3.5 py-2.5 font-mono text-[0.72rem] leading-relaxed text-stone-600">
        {JSON.stringify(call.arguments, null, 2)}
      </pre>

      {link && (
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 border-t border-stone-200 bg-white px-3.5 py-2 font-mono text-[0.72rem] text-emerald-700 transition hover:bg-emerald-50"
        >
          → {link.id ?? "created"}
          <span className="ml-auto inline-flex items-center gap-1 font-sans font-medium">
            Open in Notion
            <ArrowUpRight className="size-3.5" />
          </span>
        </a>
      )}

      {otherResult && (
        <pre className="overflow-x-auto border-t border-stone-200 bg-white px-3.5 py-2 font-mono text-[0.72rem] leading-relaxed text-stone-500">
          {typeof otherResult === "string" ? otherResult : JSON.stringify(otherResult, null, 2)}
        </pre>
      )}
    </div>
  );
}
