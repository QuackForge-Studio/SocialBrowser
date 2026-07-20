import React from 'react';
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
    <div id="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item${tab.id === activeTabId ? ' active' : ''}`}
          onClick={() => onTabSelect(tab.id)}
        >
          <span>{tab.label}</span>
          <span
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab.id);
            }}
            role="button"
            aria-label={'Close ' + tab.label + ' tab'}
          >
            {'\u00D7'}
          </span>
        </div>
      ))}
      <div className="add-tab-btn" onClick={onAddTab} title="Add platform tab">
        +
      </div>
    </div>
  );
}