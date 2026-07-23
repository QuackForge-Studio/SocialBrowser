import React, { useState, useCallback, useEffect } from 'react';
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

  // Sync open tabs from main process
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;

    bridge.getSettings().then((settings) => {
      if ((settings as Record<string, string>).privacy_acknowledged !== 'true') setShowPrivacyModal(true);
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

  const handleSelectTab = useCallback(async (id: string) => {
    const bridge = getBridge();
    if (!bridge) return;
    if (!id) {
      // Return to Dashboard View
      await bridge.showDashboard();
      setActiveTabId(null);
    } else {
      // Activate existing specific tab
      setActiveTabId(id);
      if ((bridge as any).activateTab) {
        await (bridge as any).activateTab({ tabId: id });
      }
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    // When a browser tab is active, clicking hamburger returns to dashboard
    if (activeTabId) {
      handleSelectTab('');
      const bridge = getBridge();
      if (bridge) bridge.showDashboard();
      return;
    }
    setSidebarOpen((prev) => {
      const next = !prev;
      const bridge = getBridge();
      if (bridge && (bridge as any).setSidebarOpen) {
        (bridge as any).setSidebarOpen(next);
      }
      return next;
    });
  }, [activeTabId, handleSelectTab]);

  const handlePrivacyAcknowledge = useCallback(() => {
    const bridge = getBridge();
    if (bridge) bridge.updateSettings({ privacy_acknowledged: 'true' }).catch(() => {});
    setShowPrivacyModal(false);
  }, []);

  const handleAddTab = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) return;
    if ((bridge as any).openDefaultBrowserTab) {
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
  }, []);

  const handleCloseTab = useCallback(async (tabId: string) => {
    const bridge = getBridge();
    if (bridge) {
      if ((bridge as any).closeBrowserTab) {
        await (bridge as any).closeBrowserTab({ tabId });
      }
    }
  }, []);

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
      default: return <ProfileLauncher />;
    }
  };

  return (
    <div
      className="h-full w-full text-text overflow-hidden relative"
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
      />
      <Sidebar
        navItems={DEFAULT_NAV_ITEMS}
        activeView={activeView}
        isOpen={sidebarOpen}
        onNavigate={(view) => {
          setActiveView(view);
          handleSelectTab(''); // show dashboard when selecting sidebar item
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
          className="fixed pointer-events-none z-10 rounded-2xl border border-[#2d3345] bg-transparent shadow-2xl overflow-hidden"
          style={{
            top: '45px',
            left: '5px',
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
            className="w-[80%] max-w-[1200px] flex items-center justify-between bg-[#161925] border border-[#2f374e] rounded-t-2xl px-4 py-2.5 shadow-2xl text-white"
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