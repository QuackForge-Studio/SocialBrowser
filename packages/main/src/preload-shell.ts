import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__socialBrowserDashboard', {
  // ===== Existing Dashboard APIs =====
  getAccounts: (): Promise<unknown[]> => ipcRenderer.invoke('dash:get-accounts'),
  getPosts: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:get-posts', params),
  getAnalytics: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:get-analytics', params),
  getHeatmap: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:get-heatmap', params),
  createDraft: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:create-draft', params),
  generateDraft: (params: unknown): Promise<unknown> => ipcRenderer.invoke('dash:generate-draft', params),
  getSettings: (): Promise<unknown> => ipcRenderer.invoke('dash:get-settings'),
  updateSettings: (settings: unknown): Promise<void> => ipcRenderer.invoke('dash:update-settings', settings),
  getKeyStatus: (): Promise<{ provider: string; configured: boolean }> =>
    ipcRenderer.invoke('dash:get-key-status'),
  navigateTo: (params: { platform: string; accountId: string; url?: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:navigate-to', params),
  prefillCompose: (params: { platform: string; accountId: string; text: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:prefill-compose', params),
  copyToClipboard: (params: { text: string }): Promise<unknown> =>
    ipcRenderer.invoke('dash:copy-to-clipboard', params),

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
  getWorkspaceTabs: (): Promise<any[]> =>
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
});
