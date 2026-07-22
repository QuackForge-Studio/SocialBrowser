import React from "react";
import { Globe, SquaresFour, CalendarBlank, ChartLine, Gear, CaretDown } from "@phosphor-icons/react";
import type { DashboardView } from "./types";

export interface NavItem { view: DashboardView; label: string; icon: React.ReactNode; }

interface SidebarProps {
  navItems: NavItem[];
  activeView: DashboardView;
  isOpen: boolean;
  onNavigate: (view: DashboardView) => void;
  onNavigateToPlatform: (platform: string, accountId: string) => void;
}

export function Sidebar({ navItems, activeView, isOpen, onNavigate }: SidebarProps) {
  return (
    <aside
      className="fixed top-11 left-0 bottom-0 z-40 flex w-[232px] flex-col border-r border-border/60 bg-bg-base/95 backdrop-blur-md transition-transform duration-200 ease-out"
      style={{
        WebkitAppRegion: 'no-drag' as any,
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
      }}
    >
      {/* Workspace quick switcher */}
      <div className="border-b border-border/60 p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-bg-elevated/80 border border-border px-3 py-2 cursor-pointer text-[13px] text-text hover:bg-bg-hover hover:border-accent/30 transition-all shadow-sm group">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Globe size={13} weight="duotone" />
          </div>
          <span className="flex-1 font-semibold truncate text-[13.5px]">Browser Profiles</span>
          <CaretDown size={12} weight="bold" className="text-text-faint group-hover:text-text transition-colors" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col p-3 gap-1 overflow-y-auto">
        <div className="px-2 py-1.5 text-[11px] font-bold text-text-faint uppercase tracking-wider">
          Browser Engine
        </div>
        {navItems.map((item) => {
          const active = activeView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-all text-left relative ${
                active 
                  ? 'bg-bg-elevated text-text border border-accent/20 shadow-md shadow-accent/5' 
                  : 'text-text-muted hover:bg-bg-hover hover:text-text'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-accent" />
              )}
              <span className={`flex h-5 w-5 items-center justify-center transition-colors ${
                active ? 'text-accent' : 'text-text-faint group-hover:text-text'
              }`}>
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border/60 p-4 text-[12px] text-text-faint flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          <span className="font-mono">v0.2.0</span>
        </div>
        <span className="text-[11px] text-text-faint">Multi-Profile Browser</span>
      </div>
    </aside>
  );
}

export const DEFAULT_NAV_ITEMS: NavItem[] = [
  { view: "profiles", label: "Profiles", icon: <Globe size={18} weight="duotone" /> },
  { view: "workspaces", label: "Workspaces", icon: <SquaresFour size={18} weight="duotone" /> },
  { view: "calendar", label: "Tools: Calendar", icon: <CalendarBlank size={18} weight="duotone" /> },
  { view: "analytics", label: "Tools: Analytics", icon: <ChartLine size={18} weight="duotone" /> },
  { view: "settings", label: "Settings", icon: <Gear size={18} weight="duotone" /> },
];