import React, { useState, useEffect } from 'react';
import { Plus, X, SquaresFour, ArrowLeft, ArrowRight, ArrowClockwise, List } from '@phosphor-icons/react';
import type { PlatformTab, DashboardView } from './types';
import logoPng from './logo.png';

interface TitleBarProps {
  tabs: PlatformTab[];
  activeTabId: string | null;
  activeView: DashboardView;
  sidebarOpen: boolean;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onAddTab: () => void;
  onToggleSidebar: () => void;
}

const PLATFORMS: Record<string, { color: string }> = {
  twitter: { color: '#1DA1F2' }, linkedin: { color: '#0A66C2' }, facebook: { color: '#0866FF' },
  instagram: { color: '#E4405F' }, reddit: { color: '#FF4500' }, tiktok: { color: '#00F2EA' },
};

function SvgIcon({ d, w, h }: { d: string; w: number; h: number }) {
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none"><path d={d} stroke="currentColor" strokeWidth="1" /></svg>;
}

function WindowControls() {
  const [isMaxed, setIsMaxed] = useState(false);
  const api = () => (window as any).__socialBrowserWindow;
  return (
    <div className="flex h-full items-stretch shrink-0" style={{ WebkitAppRegion: 'no-drag' as any }}>
      <button onClick={() => api()?.minimize()} title="Minimize" className="flex h-full w-[46px] items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text">
        <SvgIcon d="M0 5H10" w={10} h={10} />
      </button>
      <button onClick={async () => { const r = await api()?.maximize(); setIsMaxed(!!r); }} title={isMaxed ? "Restore" : "Maximize"} className="flex h-full w-[46px] items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text">
        {isMaxed
          ? <SvgIcon d="M2.5 1.5H8.5V7.5M0.5 3.5H6.5V9.5" w={10} h={10} />
          : <SvgIcon d="M0.5 0.5H9.5V9.5" w={10} h={10} />
        }
      </button>
      <button onClick={() => api()?.close()} title="Close" className="flex h-full w-[46px] items-center justify-center text-text-muted hover:bg-[#e81123] hover:text-white">
        <SvgIcon d="M1 1L9 9M9 1L1 9" w={10} h={10} />
      </button>
    </div>
  );
}

export function TitleBar({ tabs, activeTabId, activeView, sidebarOpen, onTabSelect, onTabClose, onAddTab, onToggleSidebar }: TitleBarProps) {
  const [urlInput, setUrlInput] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [browserTabs, setBrowserTabs] = useState<PlatformTab[]>([]);

  useEffect(() => {
    const bridge = (window as any).__socialBrowserDashboard;
    if (!bridge?.getBrowserTabs) return;
    const poll = () => {
      bridge.getBrowserTabs().then((t: PlatformTab[]) => {
        setBrowserTabs(t || []);
        if (activeTabId && t) {
          const active = t.find((tab) => tab.id === activeTabId);
          if (active?.url) setCurrentUrl(active.url);
        }
      }).catch(() => {});
    };
    poll();
    const i = setInterval(poll, 1500);
    return () => clearInterval(i);
  }, [activeTabId]);

  const handleUrlSubmit = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !activeTabId || !urlInput.trim()) return;
    let target = urlInput.trim();
    if (!target.includes('.') && !target.startsWith('about:')) {
      target = 'https://www.google.com/search?q=' + encodeURIComponent(target);
    } else if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('about:')) {
      target = 'https://' + target;
    }
    (window as any).__socialBrowserDashboard?.navigateTab?.({ tabId: activeTabId, url: target });
    setCurrentUrl(target);
    setUrlInput('');
  };

  const sendNav = (js: string) => {
    if (activeTabId) (window as any).__socialBrowserDashboard?.navigateTab?.({ tabId: activeTabId, url: js });
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 select-none border-b border-border bg-bg-base/95 backdrop-blur-md">
      {/* Row 1: Tab strip */}
      <div className="flex h-11 items-stretch" style={{ WebkitAppRegion: 'drag' as any, paddingLeft: 10 }}>
        <button onClick={onToggleSidebar} title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          className="flex items-center gap-2 mr-3 my-auto shrink-0 rounded-lg px-2 py-1 -ml-1 transition-all hover:bg-bg-hover active:scale-95"
          style={{ WebkitAppRegion: 'no-drag' as any }}>
          <img src={logoPng} alt="Social Browser" className="h-6 w-auto" />
          <span className="text-[10px] font-medium text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded-md"><List size={14} weight="bold" /></span>
        </button>

        <div className="h-4 w-px bg-border my-auto mr-2 shrink-0" />

        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto py-1 pr-2">
          <button onClick={() => onTabSelect('')} className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] transition-colors shrink-0"
            style={{ WebkitAppRegion: 'no-drag' as any, background: activeTabId === null ? 'var(--color-bg-elevated)' : 'transparent', color: activeTabId === null ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            <SquaresFour size={14} weight="duotone" style={{ color: 'var(--color-accent)' }} />
            <span className="font-semibold">Workspaces</span>
          </button>

          {tabs.map(tab => {
            const active = tab.id === activeTabId;
            const pColor = PLATFORMS[tab.platform] ?? { color: 'var(--color-text-muted)' };
            return (
              <button key={tab.id} onClick={() => onTabSelect(tab.id)}
                className="group flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] transition-colors shrink-0 max-w-[180px]"
                style={{ WebkitAppRegion: 'no-drag' as any, background: active ? 'var(--color-bg-elevated)' : 'transparent', color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)', borderLeft: active ? `2px solid ${pColor.color}` : '2px solid transparent' }}>
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: pColor.color }} />
                <span className="truncate">{tab.label}</span>
                <span onClick={e => { e.stopPropagation(); onTabClose(tab.id); }}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full opacity-0 group-hover:opacity-70 hover:opacity-100 flex-shrink-0"
                  style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}><X size={9} weight="bold" /></span>
              </button>
            );
          })}

          <button onClick={onAddTab} title="New browser tab"
            className="flex h-6 w-6 items-center justify-center rounded-lg text-text-faint hover:bg-bg-hover hover:text-accent shrink-0 ml-1"
            style={{ WebkitAppRegion: 'no-drag' as any }}><Plus size={13} weight="bold" /></button>
        </div>

        <WindowControls />
      </div>

      {/* Row 2: URL bar (only when a browser tab is active) */}
      {activeTabId && (
        <div className="flex items-center gap-1.5 h-[38px] px-3 border-t border-border/40 bg-bg-elevated/50"
          style={{ WebkitAppRegion: 'no-drag' as any }}>
          <button onClick={() => sendNav('javascript:history.back()')} title="Back"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text"><ArrowLeft size={15} weight="bold" /></button>
          <button onClick={() => sendNav('javascript:history.forward()')} title="Forward"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text"><ArrowRight size={15} weight="bold" /></button>
          <button onClick={() => sendNav('javascript:location.reload()')} title="Reload"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text mr-1"><ArrowClockwise size={14} weight="bold" /></button>

          <div className="flex-1 flex items-center rounded-xl bg-bg-base border border-border px-3 h-8 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20 transition-all">
            {currentUrl && !urlInput && (
              <span className="text-[12px] text-text-dim truncate flex-1 select-text">{currentUrl}</span>
            )}
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onFocus={() => setUrlInput(currentUrl)}
              onBlur={() => setUrlInput('')}
              onKeyDown={handleUrlSubmit}
              placeholder={currentUrl || 'Search Google or type a URL'}
              className="w-full bg-transparent text-[12px] text-text outline-none placeholder:text-text-faint"
              style={{ WebkitAppRegion: 'no-drag' as any }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default TitleBar;