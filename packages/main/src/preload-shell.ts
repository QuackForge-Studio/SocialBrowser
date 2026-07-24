import { contextBridge, ipcRenderer } from 'electron';

// === Window controls ===
contextBridge.exposeInMainWorld('__socialBrowserWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
});

contextBridge.exposeInMainWorld('__socialBrowserDashboard', {
  // ===== Existing Dashboard APIs =====
  getAccounts: (): Promise<unknown[]> => ipcRenderer.invoke('dash:get-accounts'),
  getPosts: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:get-posts', params),
  getAnalytics: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:get-analytics', params),
  getHeatmap: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:get-heatmap', params),
  getDrafts: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:get-drafts', params),
  createDraft: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:create-draft', params),
  updateDraft: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:update-draft', params),
  deleteDraft: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:delete-draft', params),
  generateDraft: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:generate-draft', params),
  getSettings: (): Promise<unknown> => ipcRenderer.invoke('dash:get-settings'),
  updateSettings: (settings: unknown): Promise<void> => ipcRenderer.invoke('dash:update-settings', settings),
  onThemeChanged: (callback: (theme: 'dark' | 'glassmorphism' | 'light') => void) => {
    const listener = (_event: unknown, theme: 'dark' | 'glassmorphism' | 'light') => callback(theme);
    ipcRenderer.on('dash:theme-changed', listener);
    return () => ipcRenderer.removeListener('dash:theme-changed', listener);
  },
  setBrowserTheme: (theme: 'dark' | 'glassmorphism' | 'light'): Promise<unknown> =>
    ipcRenderer.invoke('dash:set-browser-theme', theme),
  getKeyStatus: (): Promise<{ provider: string; configured: boolean }> =>
    ipcRenderer.invoke('dash:get-key-status'),
  navigateTo: (params: { platform: string; accountId: string; url?: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:navigate-to', params),
  prefillCompose: (params: { platform: string; accountId: string; text: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:prefill-compose', params),
  copyToClipboard: (params: { text: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:copy-to-clipboard', params),

  // ===== Workspace & Group Management APIs =====
  getWorkspaces: (): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:get-workspaces'),
  createWorkspace: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:create-workspace', params),
  renameWorkspace: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:rename-workspace', params),
  deleteWorkspace: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:delete-workspace', params),
  reorderWorkspaces: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:reorder-workspaces', params),
  getTabGroups: (params?: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:get-tab-groups', params),
  createTabGroup: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:create-tab-group', params),
  renameTabGroup: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:rename-tab-group', params),
  deleteTabGroup: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:delete-tab-group', params),
  reorderTabGroups: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:reorder-tab-groups', params),
  getGroupAccounts: (params?: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:get-group-accounts', params),
  addAccountToGroup: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:add-account-to-group', params),
  removeAccountFromGroup: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:remove-account-from-group', params),
  reorderGroupAccounts: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:reorder-group-accounts', params),
  getGroupTabs: (params?: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:get-group-tabs', params),
  addGroupTab: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:add-group-tab', params),
  removeGroupTab: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:remove-group-tab', params),
  reorderGroupTabs: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:workspace:manage:reorder-group-tabs', params),

  // ===== Workspace & Group Navigation APIs =====
  // These IPC handlers are always active (trusted native navigation),
  // even when ShellView is hidden and a PlatformView is active.

  /** Get the current workspace/group navigation state. */
  getWorkspaceState: (): Promise<{ activeWorkspaceId: string | null; activeGroupId: string | null }> =>
    ipcRenderer.invoke('dash:workspace:get-state'),

  /** Set the active workspace and group. Triggers group switch. */
  setActiveGroup: (params: { workspaceId: string; groupId: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dash:workspace:set-active-group', params),

  /** Open a platform tab for the given account in the active group. Validates membership. */
  openTab: (params: { platform: string; accountId: string }): Promise<{ success: boolean; error?: string; tabId?: string }> =>
    ipcRenderer.invoke('dash:workspace:open-tab', params),

  /** Close a tab by its runtime tab ID. */
  closeTab: (params: { tabId: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dash:workspace:close-tab', params),

  /** Navigate to the dashboard (ShellView). */
  showDashboard: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('dash:workspace:show-dashboard'),

  /** Get the list of currently shown runtime tabs. */
  getWorkspaceTabs: (): Promise<unknown[]> =>
    ipcRenderer.invoke('dash:workspace:get-tabs'),

  /** Handle membership removal for an account in a group. */
  handleMembershipRemoved: (params: { groupId: string; accountId: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dash:workspace:membership-removed', params),

  /** Handle group deletion. */
  handleGroupDeleted: (params: { groupId: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dash:workspace:group-deleted', params),

  /** Handle workspace deletion. */
  handleWorkspaceDeleted: (params: { workspaceId: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dash:workspace:workspace-deleted', params),

  // ===== Browser Profile APIs =====
  setSidebarOpen: (open: boolean): Promise<unknown> => ipcRenderer.invoke('dash:set-sidebar-open', open),
  getProfiles: (): Promise<unknown> => ipcRenderer.invoke('dash:get-profiles'),
  createProfile: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:create-profile', params),
  deleteProfile: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:delete-profile', params),
  launchBrowserProfile: (params: { profileId: string; url?: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:launch-browser-profile', params),
  openDefaultBrowserTab: (params?: { url?: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:open-default-browser-tab', params),
  getBrowserTabs: (): Promise<unknown> => ipcRenderer.invoke('dash:get-browser-tabs'),
  getTabUrl: (params: { tabId: string }): Promise<unknown> => ipcRenderer.invoke('dash:get-tab-url', params),
  navigateTab: (params: { tabId: string; url: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:navigate-tab', params),
  activateTab: (params: { tabId: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:activate-tab', params),
  closeBrowserTab: (params: { tabId: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:close-browser-tab', params),

  // ===== Compliance APIs =====
  acknowledgeAccount: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:acknowledge-account', params),
  checkAcknowledged: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:check-acknowledged', params),
  getAuditEvents: (params?: unknown): Promise<unknown> => ipcRenderer.invoke('dash:get-audit-events', params),

  // ===== AdBlock & Popover & Site Data APIs =====
  getAdBlockStats: (tabId?: string): Promise<unknown> => ipcRenderer.invoke('dash:get-adblock-stats', tabId),
  toggleAdBlock: (): Promise<unknown> => ipcRenderer.invoke('dash:toggle-adblock'),
  clearSiteData: (params: { tabId?: string; url?: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:clear-site-data', params),
  setPopoverOpen: (open: boolean): Promise<unknown> => ipcRenderer.invoke('dash:set-popover-open', open),
  onClosePopovers: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('dash:close-popovers', listener);
    return () => ipcRenderer.removeListener('dash:close-popovers', listener);
  },

  // ===== Peek Link Preview APIs =====
  closePeekPreview: (): Promise<unknown> => ipcRenderer.invoke('dash:close-peek-preview'),
  openPeekInTab: (url?: string): Promise<unknown> => ipcRenderer.invoke('dash:open-peek-in-tab', url),
  onPeekOpened: (callback: (data: { url: string }) => void) => {
    const listener = (_e: unknown, data: { url: string }) => callback(data);
    ipcRenderer.on('peek:opened', listener);
    return () => ipcRenderer.removeListener('peek:opened', listener);
  },
  onPeekClosed: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('peek:closed', listener);
    return () => ipcRenderer.removeListener('peek:closed', listener);
  },
});
