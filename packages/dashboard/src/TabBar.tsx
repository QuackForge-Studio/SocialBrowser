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
    <div className="fixed top-0 left-60 right-0 z-40 flex h-11 items-center gap-1 border-b border-border bg-bg-elevated px-2">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabSelect(tab.id)}
            className={[
              'group flex h-8 items-center gap-2 rounded-md border px-3 text-[12px] transition-colors duration-150',
              active
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-transparent text-text-dim hover:bg-surface-hover hover:text-text',
            ].join(' ')}
          >
            <span>{tab.label}</span>
            <span
              role="button"
              aria-label={'Close ' + tab.label + ' tab'}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className="flex h-4 w-4 items-center justify-center rounded-sm opacity-50 transition-opacity hover:bg-accent-soft hover:opacity-100"
            >
              <X size={10} weight="bold" />
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onAddTab}
        title="Add platform tab"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-border text-text-faint transition-colors duration-150 hover:border-accent hover:text-accent"
      >
        <Plus size={14} weight="bold" />
      </button>
    </div>
  );
}
