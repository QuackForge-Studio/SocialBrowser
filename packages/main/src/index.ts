import { app, ipcMain, clipboard, Menu, nativeImage, nativeTheme, globalShortcut, protocol } from 'electron';
import { Worker } from 'worker_threads';
import path from 'path';

// Tell Windows to identify this as Social Browser, not "electron.exe"
app.setAppUserModelId('com.social-browser.app');
protocol.registerSchemesAsPrivileged([{
  scheme: 'socialbrowser',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

import {
  wireUpIpcGate,
  removeIpcGateHandlers,
} from './ipc-gate';
import { platformViewRegistry } from './platform-view-registry';
import { getKeyVault } from './key-vault';
import { sanitizeLog, installConsoleGuard } from './log-sanitizer';
import {
  getPublishAssistManager,
} from './publish-assist-manager';
import { BaseWindow } from './base-window';
import { ShellView } from './shell-view';
import { ViewLayoutManager } from './view-layout-manager';
import { SessionManager } from './session-manager';
import { WorkspaceTabController } from './workspace-tab-controller';
import { BrowserTabView } from './browser-tab-view';
import { adBlockEngine, ADBLOCK_RULES_INFO } from './adblock-engine';

let worker: Worker | null = null;
let workerRestartCount = 0;
const MAX_WORKER_RESTARTS = 5;

// ===== App Components =====

let baseWindow: BaseWindow | null = null;
let shellView: ShellView | null = null;
let layoutManager: ViewLayoutManager | null = null;
let sessionManager: SessionManager | null = null;
let workspaceController: WorkspaceTabController | null = null;

/** Registry of browser tab views for URL/tab queries from the dashboard */
const browserTabRegistry = new Map<string, BrowserTabView>();

function registerBrowserTab(wcId: number, btv: BrowserTabView): void {
  browserTabRegistry.set(wcId.toString(), btv);
}

/**
 * Map of pending IPC requests from renderer -> worker.
 * Resolves when the worker responds with matching msgId.
 */
const pendingWorkerRequests = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();

function startWorker(): void {
  // Worker dist files are copied to __dirname/worker/ during build
  const workerPath = path.join(__dirname, 'worker', 'worker.js');
  try {
    worker = new Worker(workerPath);

    worker.on('message', (msg: { type?: string; id?: string; success?: boolean; data?: unknown; error?: string; payload?: { provider?: string } }) => {
      // Handle API key requests from worker
      if (msg.type === 'get-api-key') {
        const provider = msg.payload?.provider; if (!provider) return;
        const vault = getKeyVault();
        const apiKey = vault.getApiKey(provider);
        if (apiKey) {
          worker?.postMessage({ type: 'get-api-key-response', id: msg.id, success: true, data: { apiKey } });
        } else {
          worker?.postMessage({ type: 'get-api-key-response', id: msg.id, success: false, error: 'API key not configured for ' + provider });
        }
        return;
      }

      // Resolve pending IPC requests
      const pending = pendingWorkerRequests.get(msg.id ?? '');
      if (pending) {
        pendingWorkerRequests.delete(msg.id ?? '');
        if (msg.success) {
          pending.resolve(msg.data);
        } else {
          pending.reject(new Error(msg.error || 'Worker request failed'));
        }
        return;
      }

      // Handle other responses
      if (msg.id === 'ready') {
        console.log(sanitizeLog('[Main] Worker ready:'), msg.data);
      } else if (!msg.success) {
        console.warn(sanitizeLog('[Main] Worker error:'), msg.error);
      }
    });

    worker.on('error', (err: Error) => {
      console.warn(sanitizeLog('[Main] Worker error (non-fatal):'), err.message);
      try { worker?.terminate(); } catch { /* noop */ }
    });

    worker.on('exit', (code: number) => {
      console.log(sanitizeLog('[Main] Worker exited with code'), code);
      worker = null;
      if (code !== 0 && !(app as unknown as { isQuitting?: boolean }).isQuitting && workerRestartCount < MAX_WORKER_RESTARTS) {
        workerRestartCount++;
        console.log(sanitizeLog('[Main] Restarting worker (attempt ' + workerRestartCount + ')'));
        startWorker();
      } else if (code !== 0 && workerRestartCount >= MAX_WORKER_RESTARTS) {
        console.error(sanitizeLog('[Main] Worker restart limit reached.'));
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(sanitizeLog('[Main] Failed to start worker thread:'), msg);
    console.log('[Main] Running without worker thread');
  }
}

/**
 * Send a request to the worker and return a promise that resolves with the response.
 */
function workerRequest<T = unknown>(type: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      // Return default/empty data when no worker is available
      resolve({} as T);
      return;
    }
    const id = 'req-' + type + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    pendingWorkerRequests.set(id, { resolve: resolve as (data: unknown) => void, reject });
    worker.postMessage({ type, payload, id });
    // Timeout after 15 seconds
    setTimeout(() => {
      if (pendingWorkerRequests.has(id)) {
        pendingWorkerRequests.delete(id);
        reject(new Error('Worker request timed out: ' + type));
      }
    }, 15000);
  });
}

function setupDashboardIpc(): void {
  const vault = getKeyVault();

  // Forward all dash:* IPC channels to the worker thread
  const dashHandlers: Array<{ channel: string; workerType: string }> = [
    { channel: 'dash:get-accounts', workerType: 'get_accounts' },
    { channel: 'dash:get-posts', workerType: 'get_posts' },
    { channel: 'dash:get-drafts', workerType: 'get_drafts' },
    { channel: 'dash:create-draft', workerType: 'create_draft' },
    { channel: 'dash:update-draft', workerType: 'update_draft' },
    { channel: 'dash:delete-draft', workerType: 'delete_draft' },
    { channel: 'dash:get-settings', workerType: 'get_settings' },
    { channel: 'dash:get-analytics', workerType: 'get_analytics' },
    { channel: 'dash:get-heatmap', workerType: 'get_heatmap' },
    { channel: 'dash:get-profiles', workerType: 'get_profiles' },
    { channel: 'dash:create-profile', workerType: 'create_profile' },
    { channel: 'dash:delete-profile', workerType: 'delete_profile' },
  ];

  for (const handler of dashHandlers) {
    ipcMain.handle(handler.channel, async (_event, payload?: unknown) => {
      try {
        return await workerRequest(handler.workerType, payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[Main] ' + handler.channel + ' error:', msg);
        return { error: msg };
      }
    });
  }

  // dash:generate-draft ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â special handling with AI/RAG
  ipcMain.handle('dash:generate-draft', async (_event, payload: unknown) => {
    try {
      return await workerRequest('generate_draft', payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Main] dash:generate-draft error:', msg);
      return { error: msg };
    }
  });

  // dash:get-key-status ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â returns masked key status (no key value ever)
  // dash:get-key-status ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â  returns masked key status (no key value ever)
  ipcMain.handle('dash:get-key-status', async () => {
    const provider = process.env.AI_PROVIDER || 'openai';
    const configured = vault.hasApiKey(provider);
    return { provider, configured };
  });

  // dash:get-performance-metrics — returns real-time Electron process CPU and memory metrics
  ipcMain.handle('dash:get-performance-metrics', async () => {
    const { diagnosticsManager } = await import('./diagnostics-manager');
    return diagnosticsManager.getSnapshot();
  });

  // dash:update-settings ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â  handles API key storage via KeyVault
  ipcMain.handle('dash:update-settings', async (_event, settings: Record<string, unknown>) => {
    if (settings.apiKey && typeof settings.apiKey === 'string') {
      const provider = (settings.aiProvider as string) || process.env.AI_PROVIDER || 'openai';
      vault.setApiKey(provider, settings.apiKey);
      const { apiKey: _apiKey, ...restSettings } = settings;
      if (worker && Object.keys(restSettings).length > 0) {
        worker.postMessage({ type: 'update_settings', payload: restSettings, id: 'settings-' + Date.now() });
      }
      return;
    }
    if (worker) {
      worker.postMessage({ type: 'update_settings', payload: settings, id: 'settings-' + Date.now() });
    }
  });
}


// ===== Browser Tab IPC handlers (non-worker, direct view management) =====

type BrowserThemePreference = 'dark' | 'light' | 'glassmorphism' | 'auto';
type ResolvedBrowserTheme = Exclude<BrowserThemePreference, 'auto'>;

let browserThemePreference: BrowserThemePreference = 'dark';

function normalizeBrowserTheme(theme: string): BrowserThemePreference {
  if (theme === 'zen' || theme === 'glassmorphism') return 'glassmorphism';
  if (theme === 'light') return 'light';
  if (theme === 'auto') return 'auto';
  return 'dark';
}

function resolveBrowserTheme(theme: BrowserThemePreference): ResolvedBrowserTheme {
  return theme === 'auto' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme;
}

function applyBrowserTheme(theme: string): void {
  browserThemePreference = normalizeBrowserTheme(theme);
  const resolvedTheme = resolveBrowserTheme(browserThemePreference);
  const bgColor = resolvedTheme === 'light' ? '#ffffff' : '#0c0e14';
  baseWindow?.win.setBackgroundMaterial(resolvedTheme === 'glassmorphism' ? 'acrylic' : 'none');
  baseWindow?.setContentBackgroundColor(resolvedTheme === 'glassmorphism' ? '#00000000' : bgColor);
  layoutManager?.setTabsBackgroundColor(bgColor);
  shellView?.webContents.send('dash:theme-changed', resolvedTheme);
  worker?.postMessage({ type: 'update_settings', payload: { browser_theme: browserThemePreference }, id: 'theme-' + Date.now() });
}

nativeTheme.on('updated', () => {
  if (browserThemePreference === 'auto') applyBrowserTheme('auto');
});

ipcMain.handle('dash:set-browser-theme', (_event, theme: string) => {
  applyBrowserTheme(theme);
  return { success: true };
});

const createBrowserTabHelper = (profileId: string, partition: string, initialUrl?: string, label?: string) => {
  const btv = new BrowserTabView({
    profileId,
    partition,
    initialUrl,
    onOpenPeek: (url) => {
      layoutManager?.openPeekPreview(url);
    },
    onOpenNewTab: (url) => {
      const newProfileId = 'default-browser-' + Date.now();
      const newPartition = 'persist:social-browser:default-browser';
      createBrowserTabHelper(newProfileId, newPartition, url, 'Browser');
    },
    onThemeChange: applyBrowserTheme,
  });
  const wcId = btv.view.webContents.id;
  const tabLabel = label || 'Browser';
  registerBrowserTab(wcId, btv);
  layoutManager?.addTab(wcId.toString(), tabLabel, btv.view, () => {
    browserTabRegistry.delete(wcId.toString());
    btv.close();
  });
  layoutManager?.activateTab(wcId.toString());
  return wcId.toString();
};

ipcMain.handle('dash:launch-browser-profile', async (_event, params: { profileId: string; url?: string }) => {
  try {
    const { profileId, url } = params;
    const partition = 'persist:social-browser:profile:' + profileId;
    const initialUrl = url || 'https://google.com';
    const tabId = createBrowserTabHelper(profileId, partition, initialUrl, 'Browser:' + profileId.substring(0, 8));
    return { success: true, tabId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
});

ipcMain.handle('dash:open-default-browser-tab', async (_event, params?: { url?: string }) => {
  try {
    const profileId = 'default-browser-' + Date.now();
    const partition = 'persist:social-browser:default-browser';
    const initialUrl = params?.url || 'https://google.com';
    const tabId = createBrowserTabHelper(profileId, partition, initialUrl, 'Browser');
    return { success: true, tabId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
});

ipcMain.handle('dash:set-sidebar-open', (_event, open: boolean) => {
  layoutManager?.setSidebarOpen(open);
  return { success: true };
});

ipcMain.handle('dash:set-popover-open', (_event, open: boolean) => {
  layoutManager?.setPopoverOpen(open);
  return { success: true };
});

ipcMain.handle('dash:close-peek-preview', () => {
  layoutManager?.closePeekPreview();
  return { success: true };
});

ipcMain.handle('dash:open-peek-in-tab', (_event, url?: string) => {
  const targetUrl = url || layoutManager?.getPeekUrl() || 'https://google.com';
  layoutManager?.closePeekPreview();
  const profileId = 'default-browser-' + Date.now();
  const partition = 'persist:social-browser:default-browser';
  const tabId = createBrowserTabHelper(profileId, partition, targetUrl, 'Browser');
  return { success: true, tabId };
});

ipcMain.handle('dash:get-adblock-stats', (_event, tabId?: string) => {
  const numericId = tabId ? Number(tabId) : undefined;
  const tabBlocked = numericId ? adBlockEngine.getTabBlockedCount(numericId) : 0;
  return {
    enabled: adBlockEngine.isEnabled(),
    totalBlocked: adBlockEngine.getTotalBlockedCount(),
    tabBlocked,
    rulesInfo: ADBLOCK_RULES_INFO,
  };
});

ipcMain.handle('dash:toggle-adblock', () => {
  const current = adBlockEngine.isEnabled();
  adBlockEngine.setEnabled(!current);
  return { enabled: adBlockEngine.isEnabled() };
});

ipcMain.handle('dash:clear-site-data', async (_event, params: { tabId?: string; url?: string }) => {
  try {
    const { tabId, url } = params;
    const targetId = tabId || layoutManager?.getActiveTabId();
    if (!targetId) return { success: false, error: 'No active tab' };

    const btv = browserTabRegistry.get(targetId);
    if (btv && !btv.isDestroyed()) {
      const sess = btv.view.webContents.session;
      const targetUrl = url || btv.getUrl();
      if (targetUrl && targetUrl.startsWith('http')) {
        const u = new URL(targetUrl);
        await sess.clearStorageData({
          origin: u.origin,
          storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
        });
        return { success: true, domain: u.hostname };
      }
    }
    return { success: false, error: 'Tab not found or non-HTTP URL' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to clear site data' };
  }
});

ipcMain.handle('dash:get-browser-tabs', () => {
  const tabs = layoutManager?.getTabs() || [];
  const activeTabId = layoutManager?.getActiveTabId() || null;
  return tabs.map(t => {
    const btv = browserTabRegistry.get(t.id);
    const wc = t.view?.webContents;
    const isWcLoading = wc && !wc.isDestroyed() ? wc.isLoading() : false;
    const url = btv && !btv.isDestroyed() ? btv.getUrl() : (wc && !wc.isDestroyed() ? wc.getURL() : '');
    const title = btv && !btv.isDestroyed() ? (btv.pageTitle || btv.getTitle()) : (wc && !wc.isDestroyed() ? wc.getTitle() : '');
    const favicon = (btv && btv.favicon) ? btv.favicon : (t.favicon || '');
    const isLoading = btv ? (btv.isLoading || isWcLoading) : isWcLoading;
    return {
      id: t.id,
      label: title || t.label,
      platform: 'browser',
      url,
      active: t.id === activeTabId,
      favicon,
      isLoading,
    };
  });
});

ipcMain.handle('dash:activate-tab', (_event, params: { tabId: string }) => {
  const { tabId } = params;
  if (layoutManager) {
    layoutManager.activateTab(tabId);
    return { success: true };
  }
  return { success: false, error: 'Layout manager unavailable' };
});

ipcMain.handle('dash:navigate-tab', (_event, params: { tabId: string; url: string }) => {
  const { tabId, url } = params;
  if (!url) return { success: false, error: 'No URL provided' };

  let webContents: Electron.WebContents | undefined;
  const btv = browserTabRegistry.get(tabId);
  if (btv && !btv.isDestroyed()) {
    webContents = btv.view.webContents;
  } else if (layoutManager) {
    const tabs = layoutManager.getTabs();
    const entry = tabs.find(t => t.id === tabId);
    if (entry && entry.view) {
      webContents = entry.view.webContents;
    }
  }

  if (webContents && !webContents.isDestroyed()) {
    if (url.startsWith('javascript:')) {
      void webContents.executeJavaScript(url.substring(11));
    } else {
      const finalUrl = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('about:') || url.startsWith('socialbrowser://')
        ? url
        : 'https://' + url;
      if (btv) {
        void btv.loadURL(finalUrl);
      } else {
        void webContents.loadURL(finalUrl);
      }
    }
    return { success: true };
  }
  return { success: false, error: 'Tab not found' };
});

ipcMain.handle('dash:close-browser-tab', (_event, params: { tabId: string }) => {
  const { tabId } = params;
  browserTabRegistry.delete(tabId);
  if (layoutManager) {
    layoutManager.closeTab(tabId);
    return { success: true };
  }
  return { success: false, error: 'Tab not found' };
});


function autoLaunchDefaultBrowserTab(): void {
  try {
    const profileId = 'auto-launch-' + Date.now();
    const partition = 'persist:social-browser:auto-launch';
    const initialUrl = 'https://google.com';
    const btv = new BrowserTabView({ profileId, partition, initialUrl, onThemeChange: applyBrowserTheme });
    const wcId = btv.view.webContents.id;
    registerBrowserTab(wcId, btv);
    layoutManager?.addTab(wcId.toString(), 'Browser', btv.view, () => {
      browserTabRegistry.delete(wcId.toString());
      btv.close();
    });
    layoutManager?.activateTab(wcId.toString());
    console.log('[Main] Auto-launched default browser tab');
  } catch (err) {
    console.warn('[Main] autoLaunchDefaultBrowserTab error:', err);
  }
}




function setupWorkspaceManageIpc(): void {
  const dashHandlers: Array<{ channel: string; workerType: string }> = [
    { channel: 'dash:workspace:manage:get-workspaces', workerType: 'get_workspaces' },
    { channel: 'dash:workspace:manage:create-workspace', workerType: 'create_workspace' },
    { channel: 'dash:workspace:manage:rename-workspace', workerType: 'rename_workspace' },
    { channel: 'dash:workspace:manage:delete-workspace', workerType: 'delete_workspace' },
    { channel: 'dash:workspace:manage:reorder-workspaces', workerType: 'reorder_workspaces' },
    { channel: 'dash:workspace:manage:get-tab-groups', workerType: 'get_tab_groups' },
    { channel: 'dash:workspace:manage:create-tab-group', workerType: 'create_tab_group' },
    { channel: 'dash:workspace:manage:rename-tab-group', workerType: 'rename_tab_group' },
    { channel: 'dash:workspace:manage:delete-tab-group', workerType: 'delete_tab_group' },
    { channel: 'dash:workspace:manage:reorder-tab-groups', workerType: 'reorder_tab_groups' },
    { channel: 'dash:workspace:manage:get-group-accounts', workerType: 'get_group_accounts' },
    { channel: 'dash:workspace:manage:add-account-to-group', workerType: 'add_account_to_group' },
    { channel: 'dash:workspace:manage:remove-account-from-group', workerType: 'remove_account_from_group' },
    { channel: 'dash:workspace:manage:reorder-group-accounts', workerType: 'reorder_group_accounts' },
    { channel: 'dash:workspace:manage:get-group-tabs', workerType: 'get_group_tabs' },
    { channel: 'dash:workspace:manage:add-group-tab', workerType: 'add_group_tab' },
    { channel: 'dash:workspace:manage:remove-group-tab', workerType: 'remove_group_tab' },
    { channel: 'dash:workspace:manage:reorder-group-tabs', workerType: 'reorder_group_tabs' },
  ];

  for (const handler of dashHandlers) {
    ipcMain.handle(handler.channel, async (_event, payload?: unknown) => {
      try {
        return await workerRequest(handler.workerType, payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[Main] ' + handler.channel + ' error:', msg);
        return { error: msg };
      }
    });
  }
}



function setupComplianceIpc(): void {
  ipcMain.handle('dash:acknowledge-account', async (_event, params: unknown) => {
    try {
      return await workerRequest('acknowledge_account', params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Main] dash:acknowledge-account error:', msg);
      return { error: msg };
    }
  });

  ipcMain.handle('dash:check-acknowledged', async (_event, params: unknown) => {
    try {
      return await workerRequest('check_acknowledged', params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Main] dash:check-acknowledged error:', msg);
      return { error: msg };
    }
  });

  ipcMain.handle('dash:get-audit-events', async (_event, params: unknown) => {
    try {
      return await workerRequest('get_audit_events', params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Main] dash:get-audit-events error:', msg);
      return { error: msg };
    }
  });
}


/**
 * Handler for dash:navigate-to IPC.
 */
function setupNavigateToHandler(publishMgr: ReturnType<typeof getPublishAssistManager>): void {
  ipcMain.handle('dash:navigate-to', async (_event, params: unknown) => {
    try {
      const { platform, accountId, url } = params as { platform: string; accountId: string; url?: string };
      if (!platform || !accountId) {
        return { success: false, error: 'Platform and accountId are required' };
      }
      console.log(sanitizeLog('[Main] dash:navigate-to: ' + platform + ':' + accountId));
      if (workspaceController) {
        return await workspaceController.openTab(platform, accountId, url);
      }
      const result = await publishMgr.navigateTo({ platform, accountId, url });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Main] dash:navigate-to error:', msg);
      return { success: false, error: msg };
    }
  });
}

/**
 * Handler for dash:prefill-compose IPC.
 * HARD GATE: NEVER auto-clicks Publish. Only inserts text.
 * HARD GATE: NEVER bypasses platform protections.
 */
function setupPrefillComposeHandler(publishMgr: ReturnType<typeof getPublishAssistManager>): void {
  ipcMain.handle('dash:prefill-compose', async (_event, params: unknown) => {
    try {
      const { platform, accountId, text } = params as { platform: string; accountId: string; text: string };
      if (!platform || !accountId || !text) {
        return { success: false, verificationMatch: false, error: 'Platform, accountId, and text are required' };
      }

      // HARD GATE: Scan for dangerous patterns
      const dangerousPatterns = [/\.click\(\)/i, /submit/i, /form[\s.]*submit/i, /PublishButton/i, /post[\s.]*submit/i, /Tweet[\s.]*click/i];
      for (const pattern of dangerousPatterns) {
        if (pattern.test(text)) {
          console.error('[Main] HARD GATE BLOCKED: Prefill text contains forbidden patterns');
          return { success: false, verificationMatch: false, error: 'HARD GATE BLOCKED: Text contains forbidden patterns. The app will NEVER auto-click Publish.' };
        }
      }

      console.log(sanitizeLog('[Main] dash:prefill-compose: ' + platform + ':' + accountId));
      const result = await publishMgr.prefillCompose({ platform, accountId, text });

      if (result.success) {
        console.log('[Main] HARD GATE: Text inserted. Publish button was NOT clicked. User must click Publish manually.');
        console.log('[Main] HARD GATE: Platform protections were NOT bypassed. No form submission or POST request was made.');
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Main] dash:prefill-compose error:', msg);
      return { success: false, verificationMatch: false, error: msg };
    }
  });
}

/**
 * Handler for dash:copy-to-clipboard IPC.
 */
function setupClipboardHandler(): void {
  ipcMain.handle('dash:copy-to-clipboard', async (_event, params: unknown) => {
    try {
      const { text } = params as { text: string };
      if (!text) return { success: false, error: 'Text to copy is required' };
      clipboard.writeText(text);
      console.log(sanitizeLog('[Main] Text copied to clipboard (publish-assist fallback)'));
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Main] dash:copy-to-clipboard error:', msg);
      return { success: false, error: msg };
    }
  });
}


// ===== Window controls IPC (custom title bar) =====
function setupWindowControlIpc(): void {
  ipcMain.handle('window:minimize', () => baseWindow?.win.minimize());
  ipcMain.handle('window:maximize', () => {
    if (baseWindow?.win.isMaximized()) baseWindow.win.unmaximize();
    else baseWindow?.win.maximize();
    return baseWindow?.win.isMaximized();
  });
  ipcMain.handle('window:close', () => baseWindow?.close());
  ipcMain.handle('window:is-maximized', () => baseWindow?.win.isMaximized() ?? false);
}

app.whenReady().then(() => {
  setupWindowControlIpc();
  // Remove default menu bar (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);
  // Guard against EPIPE crashes when parent process closes pipe
  installConsoleGuard();

  console.log('[Main] Social Browser starting...');

  // 1. Set up base window, shell view, layout manager, and session manager immediately for fast paint
  baseWindow = new BaseWindow();
  try {
    const iconPath = path.join(__dirname, 'icon.png');
    if (require('fs').existsSync(iconPath)) baseWindow.win.setIcon(require('electron').nativeImage.createFromPath(iconPath));
  } catch { /* icon optional */ }
  shellView = new ShellView();
  layoutManager = new ViewLayoutManager(baseWindow, shellView);
  sessionManager = new SessionManager();

  // 2. Initialize publish assist manager & IPC handlers
  const publishMgr = getPublishAssistManager();
  setupDashboardIpc();
  setupWorkspaceManageIpc();
  setupComplianceIpc();
  setupNavigateToHandler(publishMgr);
  setupPrefillComposeHandler(publishMgr);
  setupClipboardHandler();

  // 3. Wire up capture IPC validation gate
  wireUpIpcGate((channel: string, data: unknown) => {
    if (worker) {
      worker.postMessage({ type: 'process_capture', payload: { channel, data }, id: 'capture-' + Date.now() });
    } else {
      console.log('[Main] No worker available, capture logged:', { channel, data });
    }
  });

  // 4. Create the workspace tab controller (above ViewLayoutManager)
  workspaceController = new WorkspaceTabController(
    layoutManager,
    sessionManager,
    workerRequest,
  );

  // 5. Show the window immediately (first paint)
  baseWindow.show();

  // 6. Activate the dashboard UI on cold startup
  layoutManager.activateDashboard();

  // 7. Auto-launch a default browser tab so the app opens browser-first
  autoLaunchDefaultBrowserTab();

  // 8. Register keyboard shortcuts
  const ret = globalShortcut.register('CommandOrControl+R', () => {
    const activeId = layoutManager?.getActiveTabId();
    if (activeId) {
      const btv = browserTabRegistry.get(activeId);
      if (btv && !btv.isDestroyed()) {
        btv.view.webContents.reload();
      }
    }
  });
  if (!ret) console.warn('[Main] Failed to register reload shortcut');

  // 9. Defer background worker thread startup until after window is painted
  setImmediate(() => {
    startWorker();
  });

  console.log('[Main] WorkspaceTabController active — verified native navigation while ShellView is hidden');
  console.log('[Main] Social Browser ready');
});

// One-shot shutdown guard
let shuttingDown = false;
app.on('before-quit', async (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  (app as unknown as { isQuitting?: boolean }).isQuitting = true;
  event.preventDefault();
  try {
    if (sessionManager) { await sessionManager.flushAllCookies(); }
    if (worker) {
      try {
        await workerRequest('shutdown');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[Main] Worker shutdown acknowledgement failed:', msg);
      }
      worker = null;
    }
    if (workspaceController) { workspaceController.dispose(); workspaceController = null; }
    removeIpcGateHandlers();
    platformViewRegistry.clear();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Main] Shutdown error:', msg);
  } finally {
    globalShortcut.unregisterAll();
    app.quit();
  }
});
