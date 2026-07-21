import React, { useState, useCallback, useEffect } from 'react';
import type { DashboardView, PlatformTab } from './types';
import type { DashboardBridge } from './types';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { CalendarView } from './views/CalendarView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';
import { WorkspaceManager } from './views/WorkspaceManager';
import { PrivacyModal } from './PrivacyModal';

const NAV_ITEMS: Array<{ view: DashboardView; label: string; icon: string }> = [
  { view: 'workspaces', label: 'Workspaces', icon: '\u{1F5C2}' },
  { view: 'calendar', label: 'Calendar', icon: '\u{1F4C5}' },
  { view: 'analytics', label: 'Analytics', icon: '\u{1F4C8}' },
  { view: 'settings', label: 'Settings', icon: '\u2699' },
];

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
      // On error, show modal to be safe
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

  // Notify main process on platform tab navigation requests
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

  // Handle add-tab requests (delegated to main process)
  const handleAddTab = useCallback(() => {
    console.log('[Dashboard] Add tab requested');
  }, []);

  // Handle tab close
  const handleCloseTab = useCallback((_tabId: string) => {
    console.log('[Dashboard] Close tab requested:', _tabId);
  }, []);

  // Render the active view content
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

  // Log successful mount
  useEffect(() => {
    console.log('[Dashboard] Shell loaded successfully');
  }, []);

  return (
    <div className="app-shell">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={handleCloseTab}
        onAddTab={handleAddTab}
      />
      <Sidebar
        navItems={NAV_ITEMS}
        activeView={activeView}
        onNavigate={setActiveView}
        onNavigateToPlatform={handleNavigateToPlatform}
      />
      <main id="content-area">
        {renderContent()}
      </main>
      {showPrivacyModal ? (
        <PrivacyModal onAcknowledge={handlePrivacyAcknowledge} />
      ) : null}
    </div>
  );
}
