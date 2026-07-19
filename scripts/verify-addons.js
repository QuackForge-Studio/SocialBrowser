/**
 * Verify that better-sqlite3 and sqlite-vec load correctly.
 * This script is used during development and as part of CI to ensure
 * native addon compatibility with the current Electron version.
 */

try {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  console.log('[verify] better-sqlite3 loaded OK');
  console.log('[verify] WAL mode enabled');

  try {
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(db);
    const row = db.prepare('SELECT vec_version() AS version').get();
    console.log(`[verify] sqlite-vec v${row.version} loaded OK`);
  } catch (vecErr) {
    console.error('[verify] FAILED: sqlite-vec could not load:', vecErr.message);
    process.exit(1);
  }

  db.close();
  console.log('[verify] All native addons verified successfully');
  process.exit(0);
} catch (dbErr) {
  console.error('[verify] FAILED: better-sqlite3 could not load:', dbErr.message);
  process.exit(1);
}

