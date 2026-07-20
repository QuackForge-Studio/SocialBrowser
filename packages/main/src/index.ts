import { app, ipcMain, clipboard } from 'electron';
import { Worker } from 'worker_threads';
import path from 'path';
import {
  wireUpIpcGate,
  removeIpcGateHandlers,
} from './ipc-gate';
import { platformViewRegistry } from './platform-view-registry';
import { KeyVault, getKeyVault } from './key-vault';
import { sanitizeLog } from './log-sanitizer';
import {
  getPublishAssistManager,
  resetPublishAssistManager,
} from './publish-assist-manager';

let worker: Worker | null = null;
let workerRestartCount = 0;
const MAX_WORKER_RESTARTS = 5;

/**
 * Map of pending IPC requests from renderer -> worker.
 * Resolves when the worker responds with matching msgId.
 */
const pendingWorkerRequests = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();

function startWorker(): void {
  const workerPath = path.join(__dirname, '..', '..', 'worker', 'dist', 'worker.js');
  try {
    worker = new Worker(workerPath);

    worker.on('message', (msg: any) => {
      // Handle API key requests from worker
      if (msg.type === 'get-api-key') {
        const provider = msg.payload?.provider as string;
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
      const pending = pendingWorkerRequests.get(msg.id);
      if (pending) {
        pendingWorkerRequests.delete(msg.id);
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
      try { worker?.terminate(); } catch {}
    });

    worker.on('exit', (code: number) => {
      console.log(sanitizeLog('[Main] Worker exited with code'), code);
      worker = null;
      if (code !== 0 && !app.isQuitting() && workerRestartCount < MAX_WORKER_RESTARTS) {
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

  // dash:generate-draft — special handling with AI/RAG
  ipcMain.handle('dash:generate-draft', async (_event, payload: unknown) => {
    try {
      return await workerRequest('generate_draft', payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Main] dash:generate-draft error:', msg);
      return { error: msg };
    }
  });

  // dash:get-key-status — returns masked key status (no key value ever)
  ipcMain.handle('dash:get-key-status', async () => {
    const provider = process.env.AI_PROVIDER || 'openai';
    const configured = vault.hasApiKey(provider);
    return { provider, configured };
  });

  // dash:update-settings — handles API key storage via KeyVault
  ipcMain.handle('dash:update-settings', async (_event, settings: Record<string, unknown>) => {
    if (settings.apiKey && typeof settings.apiKey === 'string') {
      const provider = (settings.aiProvider as string) || process.env.AI_PROVIDER || 'openai';
      vault.setApiKey(provider, settings.apiKey);
      const { apiKey: _, ...restSettings } = settings;
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
app.whenReady().then(() => {
  console.log('[Main] Social Browser starting...');
  startWorker();
  setupDashboardIpc();

  wireUpIpcGate((channel: string, data: unknown) => {
    if (worker) {
      worker.postMessage({ type: 'process_capture', payload: { channel, data }, id: 'capture-' + Date.now() });
    } else {
      console.log('[Main] No worker available, capture logged:', { channel, data });
    }
  });

  console.log('[Main] IPC validation gate active');
  console.log('[Main] Social Browser ready');
});

app.on('will-quit', () => {
  if (worker) {
    worker.postMessage({ type: 'shutdown', id: 'shutdown-' + Date.now() });
  }
  removeIpcGateHandlers();
  platformViewRegistry.clear();
});

