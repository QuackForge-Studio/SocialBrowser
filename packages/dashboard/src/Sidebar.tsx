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
    <aside
      className="fixed top-0 left-0 z-40 flex h-full w-[200px] flex-col border-r"
      style={{
        background: "var(--color-bg-base)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Logo */}
      <div
        className="border-b px-5 py-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          Social Browser
        </div>
        <div
          className="mt-0.5 text-[10px]"
          style={{
            color: "var(--color-text-muted)",
            letterSpacing: "0.06em",
          }}
        >
          v0.2.0
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {navItems.map((item, idx) => {
          const active = activeView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              data-view={item.view}
              onClick={() => onNavigate(item.view)}
              className="sidebar-nav-btn group flex items-center gap-2 rounded-md px-3 py-2 text-left"
              style={{
                color: active
                  ? "var(--color-accent)"
                  : "var(--color-text-muted)",
                background: active
                  ? "var(--color-bg-hover)"
                  : "transparent",
                fontSize: "11px",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                position: "relative",
                animationName: active ? "none" : "sidebarItemIn",
                animationDuration: "var(--motion-medium)",
                animationTimingFunction: "var(--motion-spring)",
                animationDelay: idx * 30 + "ms",
                animationFillMode: "both",
              }}
              onMouseEnter={(e) => {
                if (!active)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--color-bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!active)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
              }}
            >
              {/* Active indicator bar */}
              {active && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "2px",
                    height: "18px",
                    borderRadius: "0 2px 2px 0",
                    background: "var(--color-accent)",
                  }}
                />
              )}
              <span
                style={{
                  display: "flex",
                  width: "14px",
                  height: "14px",
                  alignItems: "center",
                  justifyContent: "center",
                  color: active
                    ? "var(--color-accent)"
                    : "var(--color-text-muted)",
                  transition: "color var(--motion-fast) var(--motion-spring)",
                }}
              >
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="border-t px-4 py-3 text-[10px]"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-text-muted)",
          letterSpacing: "0.04em",
        }}
      >
        No posts captured
      </div>
    </aside>
  );
}

export const DEFAULT_NAV_ITEMS: NavItem[] = [
  {
    view: "workspaces",
    label: "Workspaces",
    icon: <SquaresFour size={14} weight="duotone" />,
  },
  {
    view: "calendar",
    label: "Calendar",
    icon: <CalendarBlank size={14} weight="duotone" />,
  },
  {
    view: "analytics",
    label: "Analytics",
    icon: <ChartLine size={14} weight="duotone" />,
  },
  {
    view: "settings",
    label: "Settings",
    icon: <GearSix size={14} weight="duotone" />,
  },
];