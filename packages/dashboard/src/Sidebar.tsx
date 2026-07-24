import React from "react";
import { Globe, SquaresFour, CalendarBlank, ChartLine, Gear, Info, CaretDown } from "@phosphor-icons/react";
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
  const [isSwitcherOpen, setIsSwitcherOpen] = React.useState(false);
  const [workspaces, setWorkspaces] = React.useState<{ id: string; name: string }[]>([]);

  React.useEffect(() => {
    if (!isSwitcherOpen) return;
    const bridge = (window as any).__socialBrowserDashboard;
    if (bridge?.getWorkspaces) {
      bridge.getWorkspaces().then((ws: any[]) => {
        if (Array.isArray(ws)) setWorkspaces(ws);
      }).catch(() => {});
    }

    const handleOutsideClick = () => setIsSwitcherOpen(false);
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isSwitcherOpen]);

  return (
    <aside
      className="fixed top-[45px] left-[5px] bottom-[5px] z-40 flex w-[226px] flex-col overflow-hidden rounded-2xl border border-[#2d3345] bg-bg-base/95 shadow-2xl backdrop-blur-md transition-transform duration-200 ease-out"
      style={{
        WebkitAppRegion: 'no-drag' as any,
        transform: isOpen ? 'translateX(0)' : 'translateX(calc(-100% - 5px))',
        pointerEvents: 'auto',
      }}
    >
      {/* Workspace quick switcher */}
      <div className="relative border-b border-border/60 p-3">
        <div
          onClick={(e) => { e.stopPropagation(); setIsSwitcherOpen(prev => !prev); }}
          className="flex items-center gap-2.5 rounded-xl bg-bg-elevated/80 border border-border px-3 py-2 cursor-pointer text-[13px] text-text hover:bg-bg-hover hover:border-accent/30 transition-all shadow-sm group select-none"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Globe size={13} weight="duotone" />
          </div>
          <span className="flex-1 font-semibold truncate text-[13.5px]">Browser Profiles</span>
          <CaretDown size={12} weight="bold" className={`text-text-faint group-hover:text-text transition-transform duration-150 ${isSwitcherOpen ? 'rotate-180 text-accent' : ''}`} />
        </div>

        {/* Dropdown Menu */}
        {isSwitcherOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute left-3 right-3 top-[52px] z-50 rounded-xl bg-bg-elevated border border-border/80 p-1.5 shadow-xl animate-dropdown"
          >
            <div className="px-2 py-1 text-[10.5px] font-bold text-text-faint uppercase tracking-wider">
              Quick Switch
            </div>
            <button
              onClick={() => { onNavigate("profiles"); setIsSwitcherOpen(false); }}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-muted hover:bg-bg-hover hover:text-text text-left transition-colors"
            >
              <Globe size={14} className="text-accent" />
              <span>Browser Profiles</span>
            </button>
            <button
              onClick={() => { onNavigate("workspaces"); setIsSwitcherOpen(false); }}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-muted hover:bg-bg-hover hover:text-text text-left transition-colors"
            >
              <SquaresFour size={14} className="text-accent" />
              <span>All Workspaces ({workspaces.length})</span>
            </button>

            {workspaces.length > 0 && (
              <>
                <div className="my-1 border-t border-border/60" />
                <div className="px-2 py-1 text-[10.5px] font-bold text-text-faint uppercase tracking-wider">
                  Workspaces
                </div>
                {workspaces.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => { onNavigate("workspaces"); setIsSwitcherOpen(false); }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-text-muted hover:bg-bg-hover hover:text-text text-left truncate transition-colors"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    <span className="truncate">{ws.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
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
  { view: "about", label: "About Us", icon: <Info size={18} weight="duotone" /> },
];
