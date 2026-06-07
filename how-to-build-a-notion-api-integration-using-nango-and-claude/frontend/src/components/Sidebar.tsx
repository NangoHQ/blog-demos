import { useState } from "react";
import {
  LayoutPanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { View } from "../lib/types";
import { appUser } from "../lib/appUser";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";
import { useConnection } from "../state/ConnectionContext";

const NAV_ITEMS: { view: View; label: string; icon: LucideIcon }[] = [
  {
    view: "workspace",
    label: "Demo: Integrate Notion into your app using Nango",
    icon: LayoutPanelLeft,
  },
  { view: "assistant", label: "Assistant", icon: Sparkles },
];

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
}

export function Sidebar({ view, onNavigate }: SidebarProps) {
  const { status, connection } = useConnection();
  const connected = status === "connected";
  const [collapsed, setCollapsed] = useState(true);

  const itemBase = "flex items-center rounded-lg text-sm font-medium transition";
  const itemShape = collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2";
  const itemState = (active: boolean) =>
    active
      ? "bg-white text-clay-700 shadow-sm ring-1 ring-stone-200/70"
      : "text-stone-600 hover:bg-white/60 hover:text-stone-900";

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden border-r border-stone-200/80 bg-paper-deep/40 transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Header: logo + collapse toggle */}
      <div
        className={`flex py-5 ${
          collapsed ? "flex-col items-center gap-3 px-2" : "items-start justify-between px-5"
        }`}
      >
        {collapsed ? (
          <Logo showWordmark={false} />
        ) : (
          <div className="min-w-0">
            <Logo />
            <p className="mt-2 ml-0.5 font-display text-xs text-stone-400 italic">
              your team's content, in sync
            </p>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-400 transition hover:bg-white/70 hover:text-stone-700"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4.5" />
          ) : (
            <PanelLeftClose className="size-4.5" />
          )}
        </button>
      </div>

      <nav className={`mt-2 flex flex-col gap-0.5 ${collapsed ? "px-2" : "px-3"}`}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            onClick={() => onNavigate(item.view)}
            title={item.label}
            className={`${itemBase} ${itemShape} ${itemState(view === item.view)}`}
          >
            <item.icon className="size-4.5 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Notion connection summary — the integration's home base. */}
      <div className={`pb-2 ${collapsed ? "px-2" : "px-3"}`}>
        <button
          onClick={() => onNavigate("settings")}
          title="Integrations"
          className={`relative w-full ${itemBase} ${itemShape} ${itemState(view === "settings")}`}
        >
          <Plug className="size-4.5 shrink-0" />
          {!collapsed && <span className="truncate">Integrations</span>}
          <span
            className={`size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-stone-300"} ${
              collapsed ? "absolute top-1.5 right-1.5" : "ml-auto"
            }`}
            aria-hidden
          />
        </button>
        {!collapsed && connected && connection && (
          <p className="mt-1.5 truncate px-3 text-xs text-stone-400">
            {connection.workspaceIcon} {connection.workspaceName} · Notion
          </p>
        )}
      </div>

      <div className="border-t border-stone-200/80 p-3">
        <div
          className={`flex items-center rounded-lg py-1.5 ${
            collapsed ? "justify-center" : "gap-3 px-2"
          }`}
        >
          <Avatar name={appUser.name} size="sm" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-stone-900">
                {appUser.name}
              </p>
              <p className="truncate text-xs text-stone-500">
                {appUser.role} · {appUser.workspace}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
