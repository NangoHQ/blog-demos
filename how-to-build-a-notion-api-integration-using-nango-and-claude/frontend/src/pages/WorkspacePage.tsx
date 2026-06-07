import { DocsLedger } from "../components/DocsLedger";
import { CreatePagePanel } from "../components/CreatePagePanel";

/**
 * The hero split: synced Notion content on the left (read), a desk to write a
 * page back on the right (write). This is the layout the blog post screenshots.
 */
export function WorkspacePage() {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-5 p-7 lg:grid-cols-[1.5fr_1fr]">
      <DocsLedger />
      <CreatePagePanel />
    </div>
  );
}
