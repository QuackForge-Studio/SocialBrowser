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
  navigateTo: (params: { platform: string; accountId: string; url?: string }): void =>
    ipcRenderer.send('dash:navigate-to', params),
  prefillCompose: (params: { platform: string; accountId: string; text: string }): void =>
    ipcRenderer.send('dash:prefill-compose', params),
});
