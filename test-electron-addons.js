const { app } = require('electron');
app.whenReady().then(() => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    console.log('[OK] better-sqlite3 loaded');
    try {
      const sqliteVec = require('sqlite-vec');
      sqliteVec.load(db);
      const row = db.prepare('SELECT vec_version() AS v').get();
      console.log('[OK] sqlite-vec v' + row.v + ' loaded');
    } catch(e) {
      console.log('[FAIL] sqlite-vec:', e.message);
    }
    db.close();
  } catch(e) {
    console.log('[FAIL] better-sqlite3:', e.message);
  }
  app.quit();
});
