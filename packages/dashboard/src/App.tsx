import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Eye, ArrowSquareOut, Copy, X } from '@phosphor-icons/react';
import type { DashboardView, PlatformTab } from './types';
import type { DashboardBridge } from './types';
import { Sidebar, DEFAULT_NAV_ITEMS } from './Sidebar';
import { TitleBar } from './TitleBar';
import { ProfileLauncher } from './views/ProfileLauncher';
import { CalendarView } from './views/CalendarView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';
import { WorkspaceManager } from './views/WorkspaceManager';
import { AboutView } from './views/AboutView';
import { PrivacyModal } from './PrivacyModal';

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

export function App() {
  const [activeView, setActiveView] = useState<DashboardView>('profiles');
  const [tabs, setTabs] = useState<PlatformTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [peekData, setPeekData] = useState<{ url: string } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'glassmorphism' | 'light'>('dark');
  const sidebarBeforeBrowserRef = useRef(false);

  // Sync open tabs from main process
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;

    bridge.getSettings().then((settings) => {
      const saved = settings as Record<string, string>;
      if (saved.privacy_acknowledged !== 'true') setShowPrivacyModal(true);
      const rawTheme = saved.browser_theme;
      const activeTheme: 'dark' | 'glassmorphism' | 'light' =
        rawTheme === 'zen' || rawTheme === 'glassmorphism'
          ? 'glassmorphism'
          : rawTheme === 'light'
          ? 'light'
          : 'dark';
      setTheme(activeTheme);
      (bridge as any).setBrowserTheme?.(activeTheme);
    }).catch(() => setShowPrivacyModal(true));

    const syncTabs = async () => {
      try {
        if ((bridge as any).getBrowserTabs) {
          const t: any[] = await (bridge as any).getBrowserTabs();
          if (Array.isArray(t)) {
            setTabs(t);
            const active = t.find((item) => item.active);
            setActiveTabId(active ? active.id : null);
          }
        }
      } catch {
        // ignore
      }
    };

    syncTabs();
    const interval = setInterval(syncTabs, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const bridge = getBridge() as any;
    return bridge?.onThemeChanged?.((nextTheme: string) => {
      const activeTheme: 'dark' | 'glassmorphism' | 'light' =
        nextTheme === 'zen' || nextTheme === 'glassmorphism'
          ? 'glassmorphism'
          : nextTheme === 'light'
          ? 'light'
          : 'dark';
      setTheme(activeTheme);
    });
  }, []);

  // Listen to Peek Preview events
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;

    if ((bridge as any).onPeekOpened) {
      const unsub1 = (bridge as any).onPeekOpened((data: { url: string }) => {
        setPeekData(data);
      });
      const unsub2 = (bridge as any).onPeekClosed(() => {
        setPeekData(null);
      });
      return () => {
        if (unsub1) unsub1();
        if (unsub2) unsub2();
      };
    }
    return undefined;
  }, []);

  const handleClosePeek = useCallback(async () => {
    const bridge = getBridge();
    if (bridge && (bridge as any).closePeekPreview) {
      await (bridge as any).closePeekPreview();
    }
    setPeekData(null);
  }, []);

  const handleOpenPeekInTab = useCallback(async (url: string) => {
    const bridge = getBridge();
    if (bridge && (bridge as any).openPeekInTab) {
      await (bridge as any).openPeekInTab(url);
    }
    setPeekData(null);
  }, []);

  // Listen to ESC key to close Peek preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && peekData) {
        handleClosePeek();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [peekData, handleClosePeek]);

  const closeSidebarForBrowser = useCallback(async () => {
    if (!sidebarOpen) return;
    sidebarBeforeBrowserRef.current = true;
    setSidebarOpen(false);
    const bridge = getBridge();
    if (bridge && (bridge as any).setSidebarOpen) {
      await (bridge as any).setSidebarOpen(false);
    }
  }, [sidebarOpen]);

  const handleSelectTab = useCallback(async (id: string) => {
    const bridge = getBridge();
    if (!bridge) return;
    if (!id) {
      // Return to Dashboard View
      const shouldRestoreSidebar = !!activeTabId && sidebarBeforeBrowserRef.current;
      await bridge.showDashboard();
      setActiveTabId(null);
      if (shouldRestoreSidebar) {
        setSidebarOpen(true);
        if ((bridge as any).setSidebarOpen) {
          await (bridge as any).setSidebarOpen(true);
        }
      }
    } else {
      // Activate existing specific tab
      await closeSidebarForBrowser();
      setActiveTabId(id);
      if ((bridge as any).activateTab) {
        await (bridge as any).activateTab({ tabId: id });
      }
    }
  }, [activeTabId, closeSidebarForBrowser]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      sidebarBeforeBrowserRef.current = next;
      const bridge = getBridge();
      if (bridge && (bridge as any).setSidebarOpen) {
        (bridge as any).setSidebarOpen(next);
      }
      return next;
    });
  }, []);

  const handlePrivacyAcknowledge = useCallback(() => {
    const bridge = getBridge();
    if (bridge) bridge.updateSettings({ privacy_acknowledged: 'true' }).catch(() => {});
    setShowPrivacyModal(false);
  }, []);

  const handleAddTab = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) return;
    if ((bridge as any).openDefaultBrowserTab) {
      await closeSidebarForBrowser();
      const res: any = await (bridge as any).openDefaultBrowserTab({ url: 'https://google.com' });
      if (res?.tabId) {
        setActiveTabId(res.tabId);
        if ((bridge as any).activateTab) {
          await (bridge as any).activateTab({ tabId: res.tabId });
        }
      }
      if ((bridge as any).getBrowserTabs) {
        const t: any[] = await (bridge as any).getBrowserTabs();
        if (Array.isArray(t)) {
          setTabs(t);
        }
      }
    }
  }, [closeSidebarForBrowser]);

  const handleOpenAboutTab = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) return;
    if ((bridge as any).openDefaultBrowserTab) {
      await closeSidebarForBrowser();
      const res: any = await (bridge as any).openDefaultBrowserTab({ url: 'socialbrowser://about-us/' });
      if (res?.tabId) {
        setActiveTabId(res.tabId);
        if ((bridge as any).activateTab) {
          await (bridge as any).activateTab({ tabId: res.tabId });
        }
      }
      if ((bridge as any).getBrowserTabs) {
        const t: any[] = await (bridge as any).getBrowserTabs();
        if (Array.isArray(t)) setTabs(t);
      }
    }
  }, [closeSidebarForBrowser]);

  const handleOpenSettingsTab = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge || !(bridge as any).openDefaultBrowserTab) return;
    await closeSidebarForBrowser();
    const res: any = await (bridge as any).openDefaultBrowserTab({ url: 'socialbrowser://settings/' });
    if (res?.tabId) {
      setActiveTabId(res.tabId);
      await (bridge as any).activateTab?.({ tabId: res.tabId });
    }
    const t: any[] = await (bridge as any).getBrowserTabs?.();
    if (Array.isArray(t)) setTabs(t);
  }, [closeSidebarForBrowser]);

  const handleCloseTab = useCallback(async (tabId: string) => {
    const bridge = getBridge();
    if (!bridge || !(bridge as any).closeBrowserTab) return;

    setTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== tabId));
    if (activeTabId === tabId) setActiveTabId(null);
    await (bridge as any).closeBrowserTab({ tabId });
  }, [activeTabId]);

  const handleNavigateToPlatform = useCallback((platform: string, accountId: string) => {
    const bridge = getBridge();
    if (bridge) bridge.navigateTo({ platform, accountId });
  }, []);

  const renderContent = () => {
    switch (activeView) {
      case 'profiles': return <ProfileLauncher />;
      case 'workspaces': return <WorkspaceManager />;
      case 'calendar': return <CalendarView />;
      case 'analytics': return <AnalyticsView />;
      case 'settings': return <SettingsView />;
      case 'about': return <AboutView />;
      default: return <ProfileLauncher />;
    }
  };

  return (
    <div
      className={`ambient-bg h-full w-full text-text overflow-hidden relative theme-${theme}`}
      style={{
        background: activeTabId ? 'transparent' : 'var(--color-bg-base)',
        pointerEvents: activeTabId ? 'none' : 'auto',
      }}
    >
      <TitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        activeView={activeView}
        sidebarOpen={sidebarOpen}
        onTabSelect={handleSelectTab}
        onTabClose={handleCloseTab}
        onAddTab={handleAddTab}
        onToggleSidebar={toggleSidebar}
        onNavigateView={(view) => {
          if (view === 'about') {
            handleOpenAboutTab();
          } else if (view === 'settings') {
            handleOpenSettingsTab();
          } else {
            setActiveView(view);
            handleSelectTab('');
          }
        }}
      />
      <Sidebar
        navItems={DEFAULT_NAV_ITEMS}
        activeView={activeView}
        isOpen={sidebarOpen}
        onNavigate={(view) => {
          if (view === 'about') {
            handleOpenAboutTab();
          } else if (view === 'settings') {
            handleOpenSettingsTab();
          } else {
            setActiveView(view);
            handleSelectTab(''); // show dashboard when selecting sidebar item
          }
        }}
        onNavigateToPlatform={handleNavigateToPlatform}
      />
      {/* When a browser tab is active, hide the main content area so the browser
          tab behind the transparent shell is visible. Clicks pass through to the
          browser tab via pointer-events: none. TitleBar and Sidebar stay on top. */}
      <main
        className="absolute bottom-0 right-0 overflow-y-auto transition-all duration-200"
        style={{
          left: sidebarOpen ? '232px' : '0px',
          top: activeTabId ? '91px' : '40px',
          pointerEvents: activeTabId ? 'none' : 'auto',
          display: activeTabId ? 'none' : undefined,
        }}
      >
        {renderContent()}
      </main>

      {/* Unified Browser Container Backdrop (URL Bar + Browser Body unified card) */}
      {activeTabId && (
        <div
          className="glass-browser-frame fixed pointer-events-none z-20 rounded-2xl border bg-transparent overflow-hidden transition-all duration-200"
          style={{
            top: '45px',
            left: sidebarOpen ? '238px' : '5px',
            right: '5px',
            bottom: '5px',
          }}
        />
      )}

      {/* Peek Link Preview Header Card Overlay */}
      {peekData && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-start pt-[95px] bg-black/50 backdrop-blur-xs pointer-events-auto animate-dropdown"
          onClick={handleClosePeek}
          style={{ WebkitAppRegion: 'no-drag' as any }}
        >
          <div
            className="glass-surface w-[80%] max-w-[1200px] flex items-center justify-between border rounded-t-2xl px-4 py-2.5 text-white"
            onClick={(e) => e.stopPropagation()}
            style={{ WebkitAppRegion: 'no-drag' as any }}
          >
            {/* Left: Peek Badge & URL */}
            <div className="flex items-center gap-3 truncate mr-4">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold text-[12px] shrink-0">
                <Eye size={15} />
                <span>Xem Nhanh Link</span>
              </span>
              <span className="text-[13px] font-medium text-text-muted truncate max-w-[500px]" title={peekData.url}>
                {peekData.url}
              </span>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenPeekInTab(peekData.url)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#222736] hover:bg-[#2e354a] text-white text-[12.5px] font-medium transition-colors border border-[#38415c]"
                style={{ WebkitAppRegion: 'no-drag' as any }}
              >
                <ArrowSquareOut size={15} className="text-amber-400" />
                <span>Mở thành Tab mới</span>
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(peekData.url)}
                title="Sao chép link"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#222736] hover:bg-[#2e354a] text-text-muted hover:text-white text-[12.5px] font-medium transition-colors"
                style={{ WebkitAppRegion: 'no-drag' as any }}
              >
                <Copy size={15} />
              </button>
              <button
                type="button"
                onClick={handleClosePeek}
                title="Đóng (ESC)"
                className="flex items-center justify-center h-7 w-7 rounded-lg text-text-muted hover:text-white hover:bg-red-500/20 hover:text-red-400 transition-colors"
                style={{ WebkitAppRegion: 'no-drag' as any }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {!activeTabId && showPrivacyModal && <PrivacyModal onAcknowledge={handlePrivacyAcknowledge} />}
    </div>
  );
}
