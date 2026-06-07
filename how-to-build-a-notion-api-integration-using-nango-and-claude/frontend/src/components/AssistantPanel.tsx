import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useToast } from "../state/ToastContext";
import { runAssistant, type AssistantTurn } from "../lib/nango";
import { SUGGESTED_PROMPTS } from "../lib/assistant";
import type { AssistantMessage } from "../lib/types";
import { Avatar } from "./Avatar";
import { ToolCallCard } from "./ToolCallCard";

/**
 * The assistant: a Claude agent (run on the backend) whose tools come from
 * Nango's hosted MCP server. Each message is one `runAssistant` round-trip; the
 * reply carries the final text plus any tool calls the model made, rendered as
 * cards.
 */
export function AssistantPanel() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function send(prompt: string) {
    const text = prompt.trim();
    if (!text || busy) return;
    setInput("");

    // Prior turns (text only) become the agent's conversation history.
    const history: AssistantTurn[] = messages
      .filter((m) => m.text)
      .map((m) => ({ role: m.role, text: m.text as string }));

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    setBusy(true);

    try {
      const reply = await runAssistant(text, history);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: reply.text || (reply.toolCalls.length ? "" : "Done."),
          toolCalls: reply.toolCalls,
        },
      ]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Something went wrong.";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: detail },
      ]);
      toast({ variant: "error", title: "Assistant error", description: detail });
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-6 py-6">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-clay-600 text-white shadow-sm">
              <Sparkles className="size-6" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold text-stone-900">
              What should we file?
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-stone-500">
              The assistant is a Claude agent with your deployed Notion tools
              attached over Nango's MCP server. Ask it to create a page and watch
              the tool call.
            </p>
            <div className="mt-6 flex w-full max-w-md flex-col gap-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-left text-sm text-stone-600 shadow-sm transition hover:border-clay-300 hover:text-stone-900"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 pb-2">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-clay-600 px-4 py-2.5 text-sm text-white shadow-sm">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="animate-rise flex gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-clay-100 text-clay-700 ring-1 ring-clay-200">
                    <Sparkles className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    {m.toolCalls?.map((call) => (
                      <ToolCallCard key={call.id} call={call} />
                    ))}
                    {m.text && (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-stone-700">
                        {m.text}
                      </p>
                    )}
                  </div>
                </div>
              ),
            )}

            {busy && (
              <div className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-clay-100 text-clay-700 ring-1 ring-clay-200">
                  <Sparkles className="size-4" />
                </span>
                <div className="inline-flex items-center gap-2 text-sm text-stone-400">
                  <Loader2 className="size-4 animate-spin" />
                  Working… calling your Notion tools
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="mt-4 flex items-end gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm focus-within:border-clay-300 focus-within:ring-2 focus-within:ring-clay-100"
      >
        <Avatar name="Mara Ellis" size="sm" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the assistant to create a Notion page…"
          disabled={busy}
          className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          aria-label="Send"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-clay-600 text-white transition hover:bg-clay-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="size-4.5" />
        </button>
      </form>
    </div>
  );
}
