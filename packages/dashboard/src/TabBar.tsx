import React from 'react';
import { Plus, X } from '@phosphor-icons/react';
import type { PlatformTab } from './types';

interface TabBarProps {
  tabs: PlatformTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onAddTab: () => void;
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose, onAddTab }: TabBarProps) {
  return (
    <div
      className="fixed top-0 left-0 right-[220px] z-50 flex h-9 items-center gap-0.5 px-1"
      style={{
        background: 'var(--color-bg-base)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Tabs */}
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabSelect(tab.id)}
            className="group relative flex h-8 items-center gap-2 rounded-t-lg px-3 text-[14px] transition-all"
            style={{
              background: active ? 'var(--color-bg-elevated)' : 'transparent',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              borderLeft: active ? '1px solid var(--color-border)' : '1px solid transparent',
              borderRight: active ? '1px solid var(--color-border)' : '1px solid transparent',
              borderTop: active ? '1px solid var(--color-border)' : '1px solid transparent',
              borderBottom: active ? '1px solid var(--color-bg-elevated)' : '1px solid transparent',
              marginBottom: active ? '-1px' : '0',
            }}
          >
            {/* Accent line on top */}
            {active && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: 'var(--color-accent)',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                }}
              />
            )}
            <span className="truncate max-w-[160px]">{tab.label}</span>
            <span
              role="button"
              aria-label={'Close ' + tab.label}
              onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
              className="flex h-4 w-4 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-60 hover:opacity-100"
              style={{
                color: 'var(--color-text-muted)',
                background: 'var(--color-bg-hover)',
              }}
            >
              <X size={10} weight="bold" />
            </span>
          </button>
        );
      })}

      {/* Add tab button */}
      <button
        type="button"
        onClick={onAddTab}
        title="New tab"
        className="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150"
        style={{
          color: 'var(--color-text-faint)',
          background: 'transparent',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent)';
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg-hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-faint)';
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <Plus size={14} weight="bold" />
      </button>
    </div>
  );
}