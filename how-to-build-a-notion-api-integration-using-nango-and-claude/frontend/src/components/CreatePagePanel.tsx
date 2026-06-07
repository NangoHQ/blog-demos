import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, FilePlus2, Loader2, Sparkles } from "lucide-react";
import { useDocs } from "../state/DocsContext";
import { useToast } from "../state/ToastContext";
import type { CreatedPage } from "../lib/types";

/** The "desk": pick a database, write a page, publish it back to Notion. */
export function CreatePagePanel() {
  const { parents, createPage } = useDocs();
  const { toast } = useToast();

  const [parentId, setParentId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedPage | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Default to the first teamspace page once they load.
  useEffect(() => {
    if (!parentId && parents.length) setParentId(parents[0].id);
  }, [parents, parentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !parentId || submitting) return;
    setSubmitting(true);
    setCreated(null);
    try {
      const page = await createPage({ parentPageId: parentId, title, content });
      setCreated(page);
      setTitle("");
      setContent("");
      titleRef.current?.focus();
      toast({
        variant: "success",
        title: "Page created in Notion",
        description: `“${page.title}” was added to your teamspace.`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Couldn't create the page",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const selected = parents.find((p) => p.id === parentId);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-stone-200 px-6 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-clay-600 text-white">
          <FilePlus2 className="size-4.5" />
        </div>
        <div>
          <h2 className="font-display text-base font-semibold text-stone-900">
            Create a page
          </h2>
          <p className="text-xs text-stone-400">
            Writes back to Notion via the create-page action
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5"
      >
        <label className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
          Create under
        </label>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="mt-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 transition hover:border-stone-300 focus:border-clay-400 focus:ring-2 focus:ring-clay-100 focus:outline-none"
        >
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>

        <label className="mt-5 text-xs font-semibold tracking-wide text-stone-500 uppercase">
          Title
        </label>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="mt-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 font-display text-lg text-stone-900 placeholder:text-stone-300 focus:border-clay-400 focus:ring-2 focus:ring-clay-100 focus:outline-none"
        />

        <label className="mt-5 text-xs font-semibold tracking-wide text-stone-500 uppercase">
          Body
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Write the page body. Blank lines become separate paragraphs in Notion."
          className="mt-1.5 min-h-32 flex-1 resize-none rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-stone-700 placeholder:text-stone-300 focus:border-clay-400 focus:ring-2 focus:ring-clay-100 focus:outline-none"
        />

        {created && (
          <a
            href={created.url}
            target="_blank"
            rel="noreferrer"
            className="animate-rise mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 transition hover:bg-emerald-100"
          >
            <Sparkles className="size-4 shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1 truncate">
              Created <span className="font-semibold">{created.title}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-medium">
              Open in Notion
              <ArrowUpRight className="size-3.5" />
            </span>
          </a>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-stone-400">
            {selected ? (
              <>
                New page in{" "}
                <span className="font-medium text-stone-500">
                  {selected.icon} {selected.name}
                </span>
              </>
            ) : (
              "Pick a page"
            )}
          </p>
          <button
            type="submit"
            disabled={!title.trim() || !parentId || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-clay-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-clay-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create in Notion"
            )}
          </button>
        </div>

      </form>
    </section>
  );
}
