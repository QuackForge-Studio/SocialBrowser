/** Dashboard view identifiers */
export type DashboardView = 'calendar' | 'analytics' | 'settings';

/** A platform tab entry */
export interface PlatformTab {
  id: string;
  label: string;
  platform: string;
}

/** Navigation state for the ShellView */
export interface NavigationState {
  activeView: DashboardView;
  activeTabId: string | null;
  tabs: PlatformTab[];
}

/** Dashboard IPC API exposed via contextBridge */
export interface DashboardBridge {
  getAccounts: () => Promise<unknown[]>;
  getPosts: (params: unknown) => Promise<unknown>;
  getAnalytics: (params: unknown) => Promise<unknown>;
  getHeatmap: (params: unknown) => Promise<unknown>;
  createDraft: (params: unknown) => Promise<unknown>;
  generateDraft: (params: unknown) => Promise<unknown>;
  getSettings: () => Promise<unknown>;
  updateSettings: (settings: unknown) => Promise<void>;
  getKeyStatus: () => Promise<{ provider: string; configured: boolean }>;
  navigateTo: (params: { platform: string; accountId: string; url?: string }) => void;
  prefillCompose: (params: { platform: string; accountId: string; text: string }) => void;
}

declare global {
  interface Window {
    __socialBrowserDashboard?: DashboardBridge;
  }
}
