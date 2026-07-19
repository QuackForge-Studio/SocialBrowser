import { app, ipcMain } from 'electron';
import { Worker } from 'worker_threads';
import path from 'path';
import {
  wireUpIpcGate,
  removeIpcGateHandlers,
  setWorkerDispatch,
} from './ipc-gate';
import { platformViewRegistry } from './platform-view-registry';
import { KeyVault, getKeyVault } from './key-vault';
import { sanitizeLog } from './log-sanitizer';

/**
 * Social Browser — Main Process Entry Point
 *
 * The main process is a thin coordinator:
 * - Window management (BaseWindow)
 * - View management (ShellView, PlatformView via ViewLayoutManager)
 * - Session management (SessionManager)
 * - IPC validation gate (validates all capture:* messages)
 * - Worker thread lifecycle management
 * - Key vault (OS secure storage for API keys, never exposed to renderer)
 *
 * It MUST NOT:
 * - Execute SQLite queries directly
 * - Make network requests (except Electron internal)
 * - Perform long-running computation
 * - Store API keys in plaintext anywhere
 */

let worker: Worker | null = null;

function startWorker(): void {
  const workerPath = path.join(__dirname, '..', '..', 'worker', 'dist', 'worker.js');
  try {
    worker = new Worker(workerPath);

    worker.on('message', (msg: { type?: string; id: string; success: boolean; data?: unknown; error?: string }) => {
      // Handle worker key requests
      if (msg.type === 'get-api-key') {
        const provider = (msg as any).payload?.provider as string;
        const vault = getKeyVault();
        const apiKey = vault.getApiKey(provider);
        if (apiKey) {
          worker?.postMessage({
            type: 'get-api-key-response',
            id: msg.id,
            success: true,
            data: { apiKey },
          });
        } else {
          worker?.postMessage({
            type: 'get-api-key-response',
            id: msg.id,
            success: false,
            error: `API key not configured for ${provider}`,
          });
        }
        return;
      }

      if (msg.id === 'ready') {
        console.log(sanitizeLog('[Main] Worker ready:'), msg.data);
      } else if (!msg.success) {
        console.warn(sanitizeLog('[Main] Worker error response:'), msg.error);
      }
    });

    worker.on('error', (err: Error) => {
      // Worker failure must NOT crash the main process
      console.warn(sanitizeLog('[Main] Worker error (non-fatal):'), err.message);
    });

    worker.on('exit', (code: number) => {
      console.log(sanitizeLog('[Main] Worker exited with code'), code);
      worker = null;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(sanitizeLog('[Main] Failed to start worker thread:'), msg);
    // Worker may not be built yet in development; fall back to inline dispatch
    console.log('[Main] Running without worker thread - capture data will be logged');
  }
}

function setupDashboardIpc(): void {
  const vault = getKeyVault();

  // dash:get-key-status — returns masked key status (no key value ever)
  ipcMain.handle('dash:get-key-status', async () => {
    const provider = process.env.AI_PROVIDER || 'openai';
    const configured = vault.hasApiKey(provider);
    return { provider, configured };
  });

  // dash:update-settings — handles API key storage via KeyVault (never SQLite)
  ipcMain.handle('dash:update-settings', async (_event, settings: Record<string, unknown>) => {
    // If settings contains an API key, store it via OS secure storage
    if (settings.apiKey && typeof settings.apiKey === 'string') {
      const provider = (settings.aiProvider as string) || process.env.AI_PROVIDER || 'openai';
      vault.setApiKey(provider, settings.apiKey);
      // Do NOT forward the API key to the worker/SQLite
      const { apiKey: _, ...restSettings } = settings;
      // Forward non-key settings to the worker if available
      if (worker && Object.keys(restSettings).length > 0) {
        worker.postMessage({
          type: 'update_settings',
          payload: restSettings,
          id: 'settings-' + Date.now(),
        });
      }
      return;
    }

    // No API key in settings — forward directly to worker
    if (worker) {
      worker.postMessage({
        type: 'update_settings',
        payload: settings,
        id: 'settings-' + Date.now(),
      });
    }
  });
}

app.whenReady().then(() => {
  console.log('[Main] Social Browser starting...');

  // Start worker thread
  startWorker();

  // Set up dashboard IPC handlers
  setupDashboardIpc();

  // Wire up the IPC validation gate with worker dispatch
  wireUpIpcGate((channel: string, data: unknown) => {
    if (worker) {
      worker.postMessage({
        type: 'process_capture',
        payload: { channel, data },
        id: 'capture-' + Date.now(),
      });
    } else {
      console.log('[Main] No worker available, capture logged:', { channel, data });
    }
  });

  console.log('[Main] IPC validation gate active');
  console.log('[Main] Social Browser ready');
});

app.on('will-quit', () => {
  if (worker) {
    worker.postMessage({
      type: 'shutdown',
      id: 'shutdown-' + Date.now(),
    });
  }
  removeIpcGateHandlers();
  platformViewRegistry.clear();
});