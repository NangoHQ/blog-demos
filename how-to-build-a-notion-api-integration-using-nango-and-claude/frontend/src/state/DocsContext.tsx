import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createPage as seamCreatePage,
  fetchDatabases,
  fetchPages,
  fetchParents,
} from "../lib/nango";
import type {
  CreatePageInput,
  CreatedPage,
  NotionDatabase,
  NotionPage,
  NotionParent,
} from "../lib/types";
import { useConnection } from "./ConnectionContext";

interface DocsContextValue {
  databases: NotionDatabase[];
  /** Teamspace pages the create form can target as parents. */
  parents: NotionParent[];
  pages: NotionPage[];
  loading: boolean;
  /** id of the most recently created page, for a brief highlight in the ledger. */
  justCreatedId: string | null;
  refetch: () => Promise<void>;
  createPage: (input: CreatePageInput) => Promise<CreatedPage>;
}

const DocsContext = createContext<DocsContextValue | null>(null);

export function DocsProvider({ children }: { children: ReactNode }) {
  const { status, sync } = useConnection();
  const connected = status === "connected";

  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [parents, setParents] = useState<NotionParent[]>([]);
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const [dbs, prnts, pgs] = await Promise.all([
        fetchDatabases(),
        fetchParents(),
        fetchPages(),
      ]);
      setDatabases(dbs);
      setParents(prnts);
      setPages(pgs);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on connect, clear on disconnect, and refresh after each sync.
  useEffect(() => {
    if (!connected) {
      setDatabases([]);
      setParents([]);
      setPages([]);
      return;
    }
    void refetch();
  }, [connected, sync.lastSyncedAt, refetch]);

  const createPage = useCallback(
    async (input: CreatePageInput) => {
      const created = await seamCreatePage(input);
      await refetch();
      setJustCreatedId(created.id);
      setTimeout(() => setJustCreatedId(null), 2600);
      return created;
    },
    [refetch],
  );

  const value = useMemo<DocsContextValue>(
    () => ({ databases, parents, pages, loading, justCreatedId, refetch, createPage }),
    [databases, parents, pages, loading, justCreatedId, refetch, createPage],
  );

  return <DocsContext value={value}>{children}</DocsContext>;
}

export function useDocs(): DocsContextValue {
  const ctx = use(DocsContext);
  if (!ctx) {
    throw new Error("useDocs must be used within a DocsProvider");
  }
  return ctx;
}
