import React from "react";
import {
  SquaresFour,
  CalendarBlank,
  ChartLine,
  GearSix,
} from "@phosphor-icons/react";
import type { DashboardView } from "./types";

export interface NavItem {
  view: DashboardView;
  label: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  navItems: NavItem[];
  activeView: DashboardView;
  onNavigate: (view: DashboardView) => void;
  onNavigateToPlatform: (platform: string, accountId: string) => void;
}

export function Sidebar({ navItems, activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="fixed top-0 left-0 z-40 flex h-full w-60 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="border-b border-border px-5 py-4">
        <div className="text-[15px] font-semibold tracking-tight text-text">
          Social Browser
        </div>
        <div className="mt-0.5 text-[11px] text-text-faint">v0.1.0</div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {navItems.map((item) => {
          const active = activeView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              data-view={item.view}
              onClick={() => onNavigate(item.view)}
              className={[
                "group flex items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] transition-colors duration-150",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-text-dim hover:bg-surface-hover hover:text-text",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center transition-colors",
                  active ? "text-accent" : "text-text-faint group-hover:text-text-dim",
                ].join(" ")}
              >
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-5 py-3 text-[11px] text-text-faint">
        No posts captured yet
      </div>
    </aside>
  );
}

export const DEFAULT_NAV_ITEMS: NavItem[] = [
  { view: "workspaces", label: "Workspaces", icon: <SquaresFour size={18} weight="duotone" /> },
  { view: "calendar", label: "Calendar", icon: <CalendarBlank size={18} weight="duotone" /> },
  { view: "analytics", label: "Analytics", icon: <ChartLine size={18} weight="duotone" /> },
  { view: "settings", label: "Settings", icon: <GearSix size={18} weight="duotone" /> },
];
