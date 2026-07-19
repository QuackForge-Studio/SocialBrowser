import { app } from "electron";
import { BaseWindow } from "./base-window";
import { ShellView } from "./shell-view";
import { ViewLayoutManager } from "./view-layout-manager";

let baseWindow: BaseWindow | null = null;
let shellView: ShellView | null = null;
let layoutManager: ViewLayoutManager | null = null;

function createWindow(): void {
  baseWindow = new BaseWindow();
  shellView = new ShellView();
  layoutManager = new ViewLayoutManager(baseWindow, shellView);
  baseWindow.onClose((event) => {
    event.preventDefault();
    void handleGracefulShutdown();
  });
  baseWindow.show();
}

async function handleGracefulShutdown(): Promise<void> {
  console.log("[main] Graceful shutdown initiated");
  if (layoutManager) { layoutManager.closeAllViews(); }
  try {
    const { session } = await import("electron");
    const s = session.defaultSession;
    if (s && typeof s.cookies.flushStore === "function") {
      await s.cookies.flushStore();
      console.log("[main] Cookies flushed");
    }
  } catch (err: any) {
    console.warn("[main] Cookie flush error:", err.message);
  }
  if (baseWindow) { baseWindow.destroy(); baseWindow = null; }
  app.quit();
}

function verifyNativeAddons(): void {
  try {
    const Database = require("better-sqlite3") as new (...args: unknown[]) => {
      pragma: (s: string) => string;
      prepare: (s: string) => { get: () => Record<string, unknown>; };
      close: () => void;
      loadExtension: (s: string) => void;
    };
    const db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    const sqliteVec = require("sqlite-vec") as { load: (db: unknown) => void; };
    sqliteVec.load(db);
    const row = db.prepare("SELECT vec_version() AS version").get();
    console.log("[main] better-sqlite3 OK - sqlite-vec v" + String(row.version) + " loaded");
    db.close();
  } catch (err: any) {
    console.error("[main] Native addon load error:", err.message);
  }
}

app.whenReady().then(() => { verifyNativeAddons(); createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") { app.quit(); } });
app.on("activate", () => { if (baseWindow === null) { createWindow(); } });

export { BaseWindow, ShellView, ViewLayoutManager };
