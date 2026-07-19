const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Social Browser',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Load a minimal HTML page as placeholder
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Verify native addons can load
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');

    // Load sqlite-vec extension
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(db);

    // Verify sqlite-vec works
    const row = db.prepare('SELECT vec_version() AS version').get();
    console.log(`[main] better-sqlite3 OK — sqlite-vec v${row.version} loaded`);

    db.close();
  } catch (err) {
    console.error('[main] Native addon load error:', err.message);
    // Don't crash the app on addon load failure — allow dev to see the error
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
