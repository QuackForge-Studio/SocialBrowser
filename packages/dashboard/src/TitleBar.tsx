import React, { useState, useEffect } from 'react';
import { Plus, X, SquaresFour } from '@phosphor-icons/react';
import type { PlatformTab, DashboardView } from './types';
import logoPng from './logo.png';

interface TitleBarProps {
  tabs: PlatformTab[];
  activeTabId: string | null;
  activeView: DashboardView;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onAddTab: () => void;
}

const PLATFORMS: Record<string, { color: string }> = {
  twitter: { color: '#1DA1F2' },
  linkedin: { color: '#0A66C2' },
  facebook: { color: '#0866FF' },
  instagram: { color: '#E4405F' },
  reddit: { color: '#FF4500' },
  tiktok: { color: '#00F2EA' },
};

function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M0 5H10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2.5 1.5H8.5V7.5" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="3.5" width="6" height="6" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function WindowControls() {
  const [isMaxed, setIsMaxed] = useState(false);

  const getApi = () => (window as any).__socialBrowserWindow;
  const handleMin = () => getApi()?.minimize();
  const handleMax = async () => {
    const api = getApi();
    if (api) {
      const result = await api.maximize();
      setIsMaxed(!!result);
    }
  };
  const handleClose = () => getApi()?.close();

  return (
    <div className="flex h-full items-stretch shrink-0" style={{ WebkitAppRegion: 'no-drag' as any }}>
      <button
        onClick={handleMin}
        title="Minimize"
        className="flex h-full w-[46px] items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
      >
        <MinimizeIcon />
      </button>
      <button
        onClick={handleMax}
        title={isMaxed ? "Restore" : "Maximize"}
        className="flex h-full w-[46px] items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
      >
        {isMaxed ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        onClick={handleClose}
        title="Close"
        className="flex h-full w-[46px] items-center justify-center text-text-muted transition-colors hover:bg-[#e81123] hover:text-white"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

export function TitleBar({ tabs, activeTabId, activeView, onTabSelect, onTabClose, onAddTab }: TitleBarProps) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex h-11 items-stretch select-none border-b border-border bg-bg-base/95 backdrop-blur-md"
      style={{ WebkitAppRegion: 'drag' as any, paddingLeft: 10 }}
    >
      {/* App Logo */}
      <div className="flex items-center gap-2 mr-3 my-auto shrink-0" style={{ WebkitAppRegion: 'no-drag' as any }}>
        <img src={logoPng} alt="Social Browser" className="h-6 w-auto" />
      </div>

      {/* Vertical Divider */}
      <div className="h-4 w-px bg-border my-auto mr-2 shrink-0" />

      {/* Tab Strip */}
      <div className="flex-1 flex items-center gap-0.5 overflow-x-auto py-1 pr-2" style={{ WebkitAppRegion: 'no-drag' as any }}>
        <button
          onClick={() => onTabSelect('')}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] transition-colors shrink-0"
          style={{
            background: activeTabId === null ? 'var(--color-bg-elevated)' : 'transparent',
            color: activeTabId === null ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          }}
        >
          <SquaresFour size={14} weight="duotone" style={{ color: 'var(--color-accent)' }} />
          <span className="font-semibold">Workspaces</span>
        </button>

        {tabs.map(tab => {
          const active = tab.id === activeTabId;
          const p = PLATFORMS[tab.platform] ?? { color: 'var(--color-text-muted)' };
          return (
            <button
              key={tab.id}
              onClick={() => onTabSelect(tab.id)}
              className="group flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] transition-colors shrink-0 max-w-[180px]"
              style={{
                background: active ? 'var(--color-bg-elevated)' : 'transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                borderLeft: active ? `2px solid ${p.color}` : '2px solid transparent',
              }}
            >
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className="truncate">{tab.label}</span>
              <span
                onClick={e => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full opacity-0 group-hover:opacity-70 hover:opacity-100 flex-shrink-0"
                style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}
              >
                <X size={9} weight="bold" />
              </span>
            </button>
          );
        })}

        <button
          onClick={onAddTab}
          title="New browser tab"
          className="flex h-6 w-6 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg-hover hover:text-accent shrink-0 ml-1"
        >
          <Plus size={13} weight="bold" />
        </button>
      </div>

      {/* Right Window Controls (Flush right edge) */}
      <WindowControls />
    </div>
  );
}

export default TitleBar;