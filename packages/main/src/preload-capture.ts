import { contextBridge, ipcRenderer } from 'electron';

/**
 * Capture preload script for PlatformView instances.
 *
 * Exposes exactly 5 narrow methods via contextBridge on window.__socialBrowser.
 * NO generic bridge. NO raw ipcRenderer exposed.
 *
 * Security: runs in a sandboxed context with nodeIntegration=false,
 * contextIsolation=true, sandbox=true, webSecurity=true.
 */
contextBridge.exposeInMainWorld('__socialBrowser', {
  /**
   * Send a captured post to the main process.
   */
  sendPost: (data: unknown): void => {
    ipcRenderer.send('capture:post', data);
  },

  /**
   * Send an engagement snapshot to the main process.
   */
  sendSnapshot: (data: unknown): void => {
    ipcRenderer.send('capture:snapshot', data);
  },

  /**
   * Send a captured comment to the main process.
   */
  sendComment: (data: unknown): void => {
    ipcRenderer.send('capture:comment', data);
  },

  /**
   * Signal that the platform adapter is ready for capture.
   */
  sendAdapterReady: (data: unknown): void => {
    ipcRenderer.send('capture:adapter-ready', data);
  },

  /**
   * Send a capture error to the main process.
   */
  sendError: (data: unknown): void => {
    ipcRenderer.send('capture:error', data);
  },
});
