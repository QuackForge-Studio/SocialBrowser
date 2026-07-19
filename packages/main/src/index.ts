import { app, BrowserWindow } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: "Social Browser",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function verifyNativeAddons(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require("better-sqlite3") as new (...args: unknown[]) => {
      pragma: (s: string) => string;
      prepare: (s: string) => { get: () => Record<string, unknown> };
      close: () => void;
      loadExtension: (s: string) => void;
    };
    const db = new Database(":memory:");
    db.pragma("journal_mode = WAL");

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sqliteVec = require("sqlite-vec") as { load: (db: unknown) => void };
    sqliteVec.load(db);

    const row = db.prepare("SELECT vec_version() AS version").get();
    console.log(`[main] better-sqlite3 OK — sqlite-vec v${String(row.version)} loaded`);

    db.close();
  } catch (err) {
    console.error("[main] Native addon load error:", (err as Error).message);
  }
}

app.whenReady().then(() => {
  verifyNativeAddons();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
