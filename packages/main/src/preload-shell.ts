import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__socialBrowserDashboard', {
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
});
