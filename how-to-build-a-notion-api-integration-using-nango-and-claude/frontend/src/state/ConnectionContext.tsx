import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { connectNotion, disconnectNotion, syncPages } from "../lib/nango";
import type {
  ConnectionStatus,
  NotionConnection,
  SyncState,
} from "../lib/types";

interface ConnectionContextValue {
  status: ConnectionStatus;
  connection: NotionConnection | null;
  error: string | null;
  sync: SyncState;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  runSync: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [connection, setConnection] = useState<NotionConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({
    status: "idle",
    lastSyncedAt: null,
  });

  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    try {
      const result = await connectNotion();
      setConnection(result);
      setStatus("connected");
      setSync({ status: "idle", lastSyncedAt: new Date().toISOString() });
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Failed to connect Notion.",
      );
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (connection) {
      await disconnectNotion(connection.connectionId);
    }
    setConnection(null);
    setStatus("disconnected");
    setSync({ status: "idle", lastSyncedAt: null });
    setError(null);
  }, [connection]);

  const runSync = useCallback(async () => {
    setSync((prev) => ({ ...prev, status: "syncing" }));
    try {
      const { syncedAt } = await syncPages();
      setSync({ status: "idle", lastSyncedAt: syncedAt });
    } catch {
      setSync((prev) => ({ ...prev, status: "error" }));
    }
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({ status, connection, error, sync, connect, disconnect, runSync }),
    [status, connection, error, sync, connect, disconnect, runSync],
  );

  return <ConnectionContext value={value}>{children}</ConnectionContext>;
}

export function useConnection(): ConnectionContextValue {
  const ctx = use(ConnectionContext);
  if (!ctx) {
    throw new Error("useConnection must be used within a ConnectionProvider");
  }
  return ctx;
}
