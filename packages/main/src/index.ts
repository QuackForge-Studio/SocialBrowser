import { app } from "electron";
import {
  wireUpIpcGate,
  removeIpcGateHandlers,
} from "./ipc-gate";

/**
 * Social Browser — Main Process Entry Point
 *
 * The main process is a thin coordinator:
 * - Window management (BaseWindow)
 * - View management (ShellView, PlatformView via ViewLayoutManager)
 * - Session management (SessionManager)
 * - IPC validation gate (validates all capture:* messages)
 * - Worker thread lifecycle management
 *
 * It MUST NOT:
 * - Execute SQLite queries directly
 * - Make network requests (except Electron internal)
 * - Perform long-running computation
 */

app.whenReady().then(() => {
  console.log("[Main] Social Browser starting...");

  // Wire up the IPC validation gate
  // The worker dispatch function will be replaced when the worker thread is initialized.
  // For now, validated messages are logged.
  wireUpIpcGate((channel: string, data: unknown) => {
    console.log("[Main] Dispatching to worker:", { channel, data });
  });

  console.log("[Main] IPC validation gate active");
  console.log("[Main] Social Browser ready");
});

app.on("will-quit", () => {
  removeIpcGateHandlers();
});
