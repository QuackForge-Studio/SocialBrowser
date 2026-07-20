import React from "react";
import type { DashboardView } from "./types";

interface NavItem {
  view: DashboardView;
  label: string;
  icon: string;
}

interface SidebarProps {
  navItems: NavItem[];
  activeView: DashboardView;
  onNavigate: (view: DashboardView) => void;
  onNavigateToPlatform: (platform: string, accountId: string) => void;
}

export function Sidebar({ navItems, activeView, onNavigate }: SidebarProps) {
  return (
    <aside id="sidebar">
      <div className="logo">
        Social Browser
        <small>v0.1.0</small>
      </div>
      <nav>
        {navItems.map((item) => (
          <div
            key={item.view}
            className={'nav-item' + (activeView === item.view ? ' active' : '')}
            data-view={item.view}
            onClick={() => onNavigate(item.view)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">No posts captured yet</div>
    </aside>
  );
}
