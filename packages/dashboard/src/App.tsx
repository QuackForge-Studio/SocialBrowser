import React, { useState, useCallback, useEffect } from 'react';
import type { DashboardView, PlatformTab } from './types';
import type { DashboardBridge } from './types';
import { Sidebar, DEFAULT_NAV_ITEMS } from './Sidebar';
import { TabBar } from './TabBar';
import { CalendarView } from './views/CalendarView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';
import { WorkspaceManager } from './views/WorkspaceManager';
import { PrivacyModal } from './PrivacyModal';

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

export function App() {
  const [activeView, setActiveView] = useState<DashboardView>('workspaces');
  const [tabs] = useState<PlatformTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Check first-launch privacy acknowledgment
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;

    bridge.getSettings().then((settings) => {
      const settingsMap = settings as Record<string, string>;
      if (settingsMap.privacy_acknowledged !== 'true') {
        setShowPrivacyModal(true);
      }
    }).catch((err) => {
      console.error('[App] Failed to check privacy settings:', err);
      setShowPrivacyModal(true);
    });
  }, []);

  const handlePrivacyAcknowledge = useCallback(() => {
    const bridge = getBridge();
    if (bridge) {
      bridge.updateSettings({ privacy_acknowledged: 'true' }).catch((err) => {
        console.error('[App] Failed to save privacy acknowledgment:', err);
      });
    }
    setShowPrivacyModal(false);
  }, []);

  const handleNavigateToPlatform = useCallback(
    (platform: string, accountId: string) => {
      const bridge = getBridge();
      if (bridge) {
        bridge.navigateTo({ platform, accountId });
      }
      console.log('[Dashboard] navigate-to:', { platform, accountId });
    },
    []
  );

  const handleAddTab = useCallback(() => {
    console.log('[Dashboard] Add tab requested');
  }, []);

  const handleCloseTab = useCallback((_tabId: string) => {
    console.log('[Dashboard] Close tab requested:', _tabId);
  }, []);

  const renderContent = () => {
    switch (activeView) {
      case 'workspaces':
        return <WorkspaceManager />;
      case 'calendar':
        return <CalendarView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <WorkspaceManager />;
    }
  };

  useEffect(() => {
    console.log('[Dashboard] Shell loaded successfully');
  }, []);

  return (
    <div className="h-full w-full bg-bg text-text">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={handleCloseTab}
        onAddTab={handleAddTab}
      />
      <Sidebar
        navItems={DEFAULT_NAV_ITEMS}
        activeView={activeView}
        onNavigate={setActiveView}
        onNavigateToPlatform={handleNavigateToPlatform}
      />
      <main className="absolute bottom-0 left-60 right-0 top-11 overflow-y-auto">
        {renderContent()}
      </main>
      {showPrivacyModal ? (
        <PrivacyModal onAcknowledge={handlePrivacyAcknowledge} />
      ) : null}
    </div>
  );
}
