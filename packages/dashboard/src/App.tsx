import React, { useState, useCallback, useEffect } from 'react';
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
            if (active) setActiveTabId(active.id);
          }
        }
      } catch {
        // ignore
      }
    };

    syncTabs();
    const interval = setInterval(syncTabs, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
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

  const handleSelectTab = useCallback(async (id: string) => {
    const bridge = getBridge();
    if (!bridge) return;
    if (!id) {
      // Return to Dashboard View
      await bridge.showDashboard();
      setActiveTabId(null);
    } else {
      // Activate specific tab
      setActiveTabId(id);
      if ((bridge as any).navigateTab) {
        // bring view forward
        await bridge.openTab({ platform: 'google', accountId: id });
      }
    }
  }, []);

  const handleAddTab = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) return;
    if ((bridge as any).openDefaultBrowserTab) {
      await (bridge as any).openDefaultBrowserTab({ url: 'https://google.com' });
    }
  }, []);

  const handleCloseTab = useCallback(async (tabId: string) => {
    const bridge = getBridge();
    if (bridge) {
      await bridge.closeTab({ tabId });
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
    <div className="h-full w-full bg-bg text-text">
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
      <main
        className="absolute bottom-0 right-0 overflow-y-auto transition-all duration-200"
        style={{
          left: sidebarOpen ? '232px' : '0px',
          top: activeTabId ? '82px' : '44px',
        }}
      >
        {renderContent()}
      </main>
      {showPrivacyModal && <PrivacyModal onAcknowledge={handlePrivacyAcknowledge} />}
    </div>
  );
}