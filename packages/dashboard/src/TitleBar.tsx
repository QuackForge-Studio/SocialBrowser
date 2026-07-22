import React, { useState, useEffect } from 'react';
import { Plus, X, SquaresFour, ArrowLeft, ArrowRight, ArrowClockwise, List, Lock, CircleNotch } from '@phosphor-icons/react';
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
  browser: { color: '#f59e0b' },
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
  const [isInputFocused, setIsInputFocused] = useState(false);

  const activeTab = tabs.find(t => t.id === activeTabId);

  useEffect(() => {
    const bridge = (window as any).__socialBrowserDashboard;
    if (!bridge?.getBrowserTabs) return;
    const poll = () => {
      bridge.getBrowserTabs().then((t: PlatformTab[]) => {
        if (activeTabId && t) {
          const active = t.find((tab) => tab.id === activeTabId);
          if (active?.url) {
            setCurrentUrl(active.url);
          }
        }
      }).catch(() => {});
    };
    poll();
    const i = setInterval(poll, 800);
    return () => clearInterval(i);
  }, [activeTabId]);

  const handleUrlSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !activeTabId) return;
    let target = urlInput.trim();
    if (!target) return;

    if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('about:')) {
      if (target.includes('.') && !target.includes(' ')) {
        target = 'https://' + target;
      } else {
        target = 'https://www.google.com/search?q=' + encodeURIComponent(target);
      }
    }
    (window as any).__socialBrowserDashboard?.navigateTab?.({ tabId: activeTabId, url: target });
    setCurrentUrl(target);
    setIsInputFocused(false);
    (e.target as HTMLInputElement).blur();
  };

  const sendNav = (js: string) => {
    if (activeTabId) (window as any).__socialBrowserDashboard?.navigateTab?.({ tabId: activeTabId, url: js });
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 select-none border-b border-[#1e2230] bg-[#0f1117] shadow-md">
      {/* Row 1: Tab strip */}
      <div className="flex h-11 items-stretch" style={{ WebkitAppRegion: 'drag' as any, paddingLeft: 10 }}>
        <button onClick={onToggleSidebar} title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          className="flex items-center gap-2 mr-3 my-auto shrink-0 rounded-lg px-2 py-1 -ml-1 transition-all hover:bg-bg-hover active:scale-95"
          style={{ WebkitAppRegion: 'no-drag' as any }}>
          <img src={logoPng} alt="Social Browser" className="h-6 w-auto" />
          <span className="text-[10px] font-medium text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded-md"><List size={14} weight="bold" /></span>
        </button>

        <div className="h-4 w-px bg-border/40 my-auto mr-2 shrink-0" />

        <div className="flex-1 flex items-center gap-2 overflow-x-auto py-1 pr-2">
          {/* Workspaces Tab Button */}
          <button
            onClick={() => onTabSelect('')}
            className={`flex h-9 items-center gap-2.5 px-4 text-[13.5px] font-medium transition-all shrink-0 min-w-[130px] ${
              activeTabId === null
                ? 'rounded-xl bg-[#222736] border border-amber-500/40 text-white shadow-sm ring-1 ring-amber-500/20'
                : 'rounded-xl text-text-muted hover:bg-[#1a1d28] hover:text-text-primary'
            }`}
            style={{ WebkitAppRegion: 'no-drag' as any }}
          >
            <SquaresFour size={16} weight="duotone" className={activeTabId === null ? 'text-amber-500' : 'text-text-faint'} />
            <span>Workspaces</span>
          </button>

          {/* Browser & Platform Tabs */}
          {tabs.map(tab => {
            const active = tab.id === activeTabId;
            const pColor = PLATFORMS[tab.platform] ?? { color: '#f59e0b' };

            let fallbackFavicon = '';
            if (tab.url && tab.url.startsWith('http')) {
              try {
                const domain = new URL(tab.url).hostname;
                if (domain) {
                  fallbackFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                }
              } catch {
                fallbackFavicon = '';
              }
            }
            const faviconSrc = tab.favicon || fallbackFavicon;

            return (
              <button
                key={tab.id}
                onClick={() => onTabSelect(tab.id)}
                className={`group relative flex h-9 items-center gap-2.5 px-3.5 text-[13.5px] font-medium transition-all shrink-0 min-w-[140px] max-w-[240px] ${
                  active
                    ? 'rounded-xl bg-[#222736] border border-amber-500/40 text-white shadow-sm ring-1 ring-amber-500/20'
                    : 'rounded-xl text-text-muted hover:bg-[#1a1d28] hover:text-text-primary border border-transparent'
                }`}
                style={{ WebkitAppRegion: 'no-drag' as any }}
              >
                {/* Tab Favicon or Spinning Loading Animation */}
                {tab.isLoading ? (
                  <CircleNotch size={15} weight="bold" className="animate-spin text-amber-400 shrink-0" />
                ) : faviconSrc ? (
                  <img
                    src={faviconSrc}
                    alt=""
                    className="h-4 w-4 rounded-sm object-contain shrink-0"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: pColor.color }} />
                )}

                <span className="truncate flex-1 text-left">{tab.label}</span>

                {/* Larger Close Button & Larger Click Area */}
                <span
                  onClick={e => { e.stopPropagation(); onTabClose(tab.id); }}
                  title="Close tab"
                  className="ml-1 flex h-6 w-6 items-center justify-center rounded-lg opacity-60 group-hover:opacity-100 hover:bg-[#383e54] text-text-muted hover:text-white transition-all shrink-0"
                >
                  <X size={13} weight="bold" />
                </span>
              </button>
            );
          })}

          {/* New Tab Button */}
          <button onClick={onAddTab} title="New browser tab"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-text-faint hover:bg-[#1a1d28] hover:text-amber-400 transition-all shrink-0 ml-1 border border-transparent hover:border-[#2b3042]"
            style={{ WebkitAppRegion: 'no-drag' as any }}>
            <Plus size={15} weight="bold" />
          </button>
        </div>

        <WindowControls />
      </div>

      {/* Row 2: URL bar (only when a browser tab is active) */}
      {activeTabId && (
        <div className="relative flex items-center gap-2 h-[46px] pb-2 pt-0.5 px-3 border-t border-[#1e2230]/60 bg-[#0f1117]"
          style={{ WebkitAppRegion: 'no-drag' as any }}>
          <button onClick={() => sendNav('javascript:history.back()')} title="Back"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-[#1f2330] hover:text-white transition-all"><ArrowLeft size={15} weight="bold" /></button>
          <button onClick={() => sendNav('javascript:history.forward()')} title="Forward"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-[#1f2330] hover:text-white transition-all"><ArrowRight size={15} weight="bold" /></button>
          <button onClick={() => sendNav('javascript:location.reload()')} title="Reload"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-[#1f2330] hover:text-white transition-all mr-1">
            {activeTab?.isLoading ? (
              <CircleNotch size={14} weight="bold" className="animate-spin text-amber-400" />
            ) : (
              <ArrowClockwise size={14} weight="bold" />
            )}
          </button>

          <div className="flex-1 flex items-center rounded-xl bg-[#161822] border border-[#262b3a] focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/20 px-3 h-8 text-[12.5px] transition-all shadow-inner">
            {activeTab?.isLoading ? (
              <CircleNotch size={13} weight="bold" className="animate-spin text-amber-400 mr-2 shrink-0" />
            ) : (
              <Lock size={13} weight="fill" className="text-amber-500 mr-2 shrink-0" />
            )}
            <input
              type="text"
              value={isInputFocused ? urlInput : currentUrl}
              onChange={e => setUrlInput(e.target.value)}
              onFocus={(e) => {
                setIsInputFocused(true);
                setUrlInput(currentUrl);
                e.target.select();
              }}
              onBlur={() => setIsInputFocused(false)}
              onKeyDown={handleUrlSubmit}
              placeholder="Search Google or type a URL..."
              className="w-full bg-transparent text-[12.5px] text-white outline-none border-none placeholder:text-text-faint font-medium"
              style={{ WebkitAppRegion: 'no-drag' as any }}
            />
          </div>

          {/* Animated orange loading bar at bottom of URL bar */}
          {activeTab?.isLoading && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-amber-500/30 overflow-hidden">
              <div className="h-full bg-amber-500 animate-pulse w-full" style={{ animationDuration: '0.8s' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TitleBar;