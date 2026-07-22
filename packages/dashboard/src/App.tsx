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
  const [tabs] = useState<PlatformTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    bridge.getSettings().then((settings) => {
      if ((settings as Record<string, string>).privacy_acknowledged !== 'true') setShowPrivacyModal(true);
    }).catch(() => setShowPrivacyModal(true));
  }, []);

  const handlePrivacyAcknowledge = useCallback(() => {
    const bridge = getBridge();
    if (bridge) bridge.updateSettings({ privacy_acknowledged: 'true' }).catch(() => {});
    setShowPrivacyModal(false);
  }, []);

  const handleAddTab = useCallback(() => {}, []);
  const handleCloseTab = useCallback((_tabId: string) => {}, []);
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
      <main className="absolute bottom-0 left-[232px] right-0 top-11 overflow-y-auto">
        {renderContent()}
      </main>
      {showPrivacyModal && <PrivacyModal onAcknowledge={handlePrivacyAcknowledge} />}
    </div>
  );
}