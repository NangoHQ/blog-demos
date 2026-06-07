import { useState } from "react";
import type { View } from "./lib/types";
import { ConnectionProvider, useConnection } from "./state/ConnectionContext";
import { DocsProvider } from "./state/DocsContext";
import { ToastProvider } from "./state/ToastContext";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { ConnectNotionCard } from "./components/ConnectNotionCard";
import { WorkspacePage } from "./pages/WorkspacePage";
import { AssistantPanel } from "./components/AssistantPanel";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <ToastProvider>
      <ConnectionProvider>
        <DocsProvider>
          <Shell />
        </DocsProvider>
      </ConnectionProvider>
    </ToastProvider>
  );
}

function Shell() {
  const { status } = useConnection();
  const connected = status === "connected";
  const [view, setView] = useState<View>("workspace");

  return (
    <div className="flex h-full">
      <Sidebar view={view} onNavigate={setView} />

      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar view={view} />

        <div className="min-h-0 flex-1 overflow-hidden">
          {view === "settings" ? (
            <div className="h-full overflow-y-auto">
              <SettingsPage />
            </div>
          ) : !connected ? (
            <ConnectNotionCard />
          ) : view === "assistant" ? (
            <AssistantPanel />
          ) : (
            <WorkspacePage />
          )}
        </div>
      </main>
    </div>
  );
}
