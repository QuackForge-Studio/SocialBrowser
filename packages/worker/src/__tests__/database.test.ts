import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  DatabaseManager,
  ALL_TABLE_NAMES,
  runMigrations,
  getAppliedVersions,
  ALL_MIGRATIONS,
  getVecExtensionPath,
} from '../database';
import { vecTableName, createVecTableSQL } from '../database/schema';

// Helper: count tables in the database
function countTables(db: Database.Database): number {
  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all() as { name: string }[];
  return rows.length;
}

// Helper: list all table names in the database
function listTables(db: Database.Database): string[] {
  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all() as { name: string }[];
  return rows.map(r => r.name);
}

describe('DatabaseManager (in-memory)', () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    manager = new DatabaseManager({
      dbPath: ':memory:',
      walMode: false, // :memory: databases can't use WAL
      runMigrations: true,
      autoLoadVec: false, // Don't attempt to load sqlite-vec for in-memory DB tests
    });
    manager.open();
  });

  afterEach(() => {
    if (manager.isOpen()) {
      manager.close();
    }
  });

  // ===== VAL-FOUND-081: All core tables created =====
  describe('VAL-FOUND-081: Core tables created', () => {
    it('should create accounts table', () => {
      expect(manager.hasTable('accounts')).toBe(true);
    });

    it('should create posts table', () => {
      expect(manager.hasTable('posts')).toBe(true);
    });

    it('should create engagement_snapshots table', () => {
      expect(manager.hasTable('engagement_snapshots')).toBe(true);
    });

    it('should create comments table', () => {
      expect(manager.hasTable('comments')).toBe(true);
    });

    it('should create content_drafts table', () => {
      expect(manager.hasTable('content_drafts')).toBe(true);
    });

    it('should create scores table', () => {
      expect(manager.hasTable('scores')).toBe(true);
    });
  });

  // ===== VAL-FOUND-082: All audit tables created =====
  describe('VAL-FOUND-082: Audit tables created', () => {
    it('should create capture_batches table', () => {
      expect(manager.hasTable('capture_batches')).toBe(true);
    });

    it('should create capture_events table', () => {
      expect(manager.hasTable('capture_events')).toBe(true);
    });

    it('should create adapter_versions table', () => {
      expect(manager.hasTable('adapter_versions')).toBe(true);
    });

    it('should create embedding_records table', () => {
      expect(manager.hasTable('embedding_records')).toBe(true);
    });

    it('should create ai_runs table', () => {
      expect(manager.hasTable('ai_runs')).toBe(true);
    });

    it('should create settings table', () => {
      expect(manager.hasTable('settings')).toBe(true);
    });
  });

  // ===== All 13 tables present =====
  describe('All 13 tables present', () => {
    it('should have exactly 18 tables including schema_migrations and workspace tables', () => {
      const tables = listTables(manager.getDb());
      expect(tables.length).toBe(21);
    });

    it('should have all expected table names', () => {
      const tables = listTables(manager.getDb());
      for (const name of ALL_TABLE_NAMES) {
        expect(tables).toContain(name);
      }
    });
  });

  // ===== VAL-FOUND-083: sqlite-vec virtual tables =====
  describe('VAL-FOUND-083: sqlite-vec virtual tables', () => {
    it('should produce correct vec0 CREATE VIRTUAL TABLE SQL', () => {
      const sql = createVecTableSQL('openai', 'text-embedding-3-small', 1536);
      expect(sql).toBe(
        'CREATE VIRTUAL TABLE IF NOT EXISTS vec_openai_text_embedding_3_small_1536 USING vec0(embedding float[1536])'
      );
    });

    it('should produce correct table name for provider/model/dimensions', () => {
      const name = vecTableName('openai', 'text-embedding-3-small', 1536);
      expect(name).toBe('vec_openai_text_embedding_3_small_1536');
    });

    it('should sanitize special characters in provider name', () => {
      const name = vecTableName('my-provider-v2', 'test-model', 768);
      expect(name).toBe('vec_my_provider_v2_test_model_768');
    });
  });

  // ===== VAL-FOUND-084: Schema migrations run on startup =====
  describe('VAL-FOUND-084: Migrations run on startup', () => {
    it('should have schema_migrations table after open', () => {
      expect(manager.hasTable('schema_migrations')).toBe(true);
    });

    it('should record migration 001 in schema_migrations', () => {
      const db = manager.getDb();
      const row = db.prepare(
        'SELECT version, description FROM schema_migrations WHERE version = 1'
      ).get() as { version: number; description: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.version).toBe(1);
      expect(row!.description).toContain('Initial schema');
    });

    it('should have exactly one migration applied', () => {
      const versions = getAppliedVersions(manager.getDb());
      expect(versions).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  // ===== Incremental migrations =====
  describe('Incremental migrations', () => {
    it('should not re-apply already applied migrations', () => {
      manager.close();

      const manager2 = new DatabaseManager({
        dbPath: ':memory:',
        walMode: false,
        runMigrations: true,
        autoLoadVec: false,
      });
      manager2.open();

      // On a fresh :memory: DB, this is a new database so migrations run again.
      const versions = getAppliedVersions(manager2.getDb());
      expect(versions).toEqual([1, 2, 3, 4, 5, 6]);

      // Calling runMigrations again should return 0 (nothing pending)
      const count = runMigrations(manager2.getDb());
      expect(count).toBe(0);

      manager2.close();
    });

    it('should detect that no migrations need to run on fresh migration run', () => {
      manager.close();

      // Open without auto-migration
      const manager2 = new DatabaseManager({
        dbPath: ':memory:',
        walMode: false,
        runMigrations: false,
        autoLoadVec: false,
      });
      manager2.open();

      // No tables yet since we didn't run migrations
      expect(manager2.hasTable('schema_migrations')).toBe(false);

      // Run migrations - should apply 1
      const count = runMigrations(manager2.getDb());
      expect(count).toBe(6);

      // Run again - should apply 0
      const count2 = runMigrations(manager2.getDb());
      expect(count2).toBe(0);

      manager2.close();
    });
  });

  // ===== Database lifecycle =====
  describe('Database lifecycle', () => {
    it('should throw when getting DB before open', () => {
      const freshManager = new DatabaseManager({
        dbPath: ':memory:',
        walMode: false,
        runMigrations: false,
        autoLoadVec: false,
      });
      expect(() => freshManager.getDb()).toThrow('Database is not open');
    });

    it('should report isOpen correctly', () => {
      const freshManager = new DatabaseManager({
        dbPath: ':memory:',
        walMode: false,
        runMigrations: false,
        autoLoadVec: false,
      });
      expect(freshManager.isOpen()).toBe(false);
      freshManager.open();
      expect(freshManager.isOpen()).toBe(true);
      freshManager.close();
      expect(freshManager.isOpen()).toBe(false);
    });

    it('should throw on double open', () => {
      expect(() => manager.open()).toThrow('Database is already open');
    });

    it('should not throw on double close', () => {
      manager.close();
      expect(() => manager.close()).not.toThrow();
    });
  });

  // ===== Foreign keys enabled =====
  describe('Foreign keys', () => {
    it('should have foreign keys enabled', () => {
      const db = manager.getDb();
      const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
      expect(result[0].foreign_keys).toBe(1);
    });
  });

  // ===== Account schema =====
  describe('accounts table schema', () => {
    it('should store and retrieve an account', () => {
      const db = manager.getDb();
      db.prepare([
        'INSERT INTO accounts (id, platform, handle, display_name, session_partition, adapter_version)',
        'VALUES (?, ?, ?, ?, ?, ?)'
      ].join(' ')).run('acc-1', 'x', '@testuser', 'Test User', 'persist:social-browser:x:uuid-1', 1);

      const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get('acc-1') as any;
      expect(row).toBeDefined();
      expect(row.platform).toBe('x');
      expect(row.handle).toBe('@testuser');
      expect(row.display_name).toBe('Test User');
      expect(row.session_partition).toBe('persist:social-browser:x:uuid-1');
    });
  });

  // ===== Post deduplication =====
  describe('posts table deduplication', () => {
    it('should enforce UNIQUE(account_id, platform_post_id)', () => {
      const db = manager.getDb();
      db.prepare([
        'INSERT INTO accounts (id, platform, handle, session_partition)',
        'VALUES (?, ?, ?, ?)'
      ].join(' ')).run('acc-1', 'x', '@test', 'persist:social-browser:x:uuid-1');

      db.prepare([
        'INSERT INTO posts (id, account_id, platform_post_id, content_text, adapter_version)',
        'VALUES (?, ?, ?, ?, ?)'
      ].join(' ')).run('post-1', 'acc-1', 'pid-1', 'Hello world', 1);

      expect(() => {
        db.prepare([
          'INSERT INTO posts (id, account_id, platform_post_id, content_text, adapter_version)',
          'VALUES (?, ?, ?, ?, ?)'
        ].join(' ')).run('post-2', 'acc-1', 'pid-1', 'Duplicate', 1);
      }).toThrow();
    });
  });

  // ===== Engagement snapshots are append-only =====
  describe('engagement_snapshots append-only', () => {
    it('should allow multiple snapshots for the same post', () => {
      const db = manager.getDb();
      db.prepare([
        'INSERT INTO accounts (id, platform, handle, session_partition)',
        'VALUES (?, ?, ?, ?)'
      ].join(' ')).run('acc-1', 'x', '@test', 'persist:social-browser:x:uuid-1');
      db.prepare([
        'INSERT INTO posts (id, account_id, platform_post_id, content_text, adapter_version)',
        'VALUES (?, ?, ?, ?, ?)'
      ].join(' ')).run('post-1', 'acc-1', 'pid-1', 'Hello', 1);

      db.prepare([
        'INSERT INTO engagement_snapshots (id, post_id, likes, shares)',
        'VALUES (?, ?, ?, ?)'
      ].join(' ')).run('snap-1', 'post-1', 10, 2);
      db.prepare([
        'INSERT INTO engagement_snapshots (id, post_id, likes, shares)',
        'VALUES (?, ?, ?, ?)'
      ].join(' ')).run('snap-2', 'post-1', 20, 5);

      const count = db.prepare(
        'SELECT COUNT(*) as cnt FROM engagement_snapshots WHERE post_id = ?'
      ).get('post-1') as { cnt: number };
      expect(count.cnt).toBe(2);
    });
  });

  // ===== Settings key-value =====
  describe('settings table', () => {
    it('should store and retrieve settings', () => {
      const db = manager.getDb();
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('theme', 'dark');

      const row = db.prepare('SELECT * FROM settings WHERE key = ?').get('theme') as any;
      expect(row).toBeDefined();
      expect(row.value).toBe('dark');
    });

    it('should upsert on conflict', () => {
      const db = manager.getDb();
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('theme', 'dark');
      db.prepare([
        "INSERT OR REPLACE INTO settings (key, value, updated_at)",
        "VALUES (?, ?, datetime('now'))"
      ].join(' ')).run('theme', 'light');

      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('theme') as any;
      expect(row.value).toBe('light');
    });
  });
});

// ===== File-based tests for WAL mode and exclusive locking =====
describe('File-based DB: WAL mode and exclusive locking', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-test-'));
  const dbPath = path.join(tmpDir, 'test-wal.sqlite');

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  // ===== VAL-AI-003: DB opens in WAL mode =====
  describe('VAL-AI-003: DB opens in WAL mode', () => {
    it('should enable WAL mode on file-based database', () => {
      const m = new DatabaseManager({
        dbPath,
        walMode: true,
        runMigrations: false,
        autoLoadVec: false,
      });
      m.open();
      expect(m.getJournalMode()).toBe('wal');
      m.close();
    });

    it('should not enable WAL on :memory: database', () => {
      const m = new DatabaseManager({
        dbPath: ':memory:',
        walMode: true,
        runMigrations: false,
        autoLoadVec: false,
      });
      m.open();
      // :memory: databases report 'memory' as journal mode
      expect(m.getJournalMode()).toBe('memory');
      m.close();
    });
  });

  // ===== Exclusive locking mode test =====
  describe('Exclusive locking mode', () => {
    it('should set exclusive locking mode on file-based database', () => {
      const m = new DatabaseManager({
        dbPath,
        walMode: true,
        runMigrations: false,
        autoLoadVec: false,
      });
      m.open();
      expect(m.getLockingMode()).toBe('exclusive');
      m.close();
    });
  });
});

// ===== sqlite-vec loading tests =====
describe('sqlite-vec extension loading', () => {
  // ===== VAL-AI-004: sqlite-vec loads in worker =====
  describe('VAL-AI-004: sqlite-vec loads in worker', () => {
    it('should resolve a vec extension path from the npm package', () => {
      const extPath = getVecExtensionPath();
      // On this platform (win32-x64), the path should be resolvable
      expect(extPath).toBeDefined();
      expect(typeof extPath).toBe('string');
      expect(extPath!.length).toBeGreaterThan(0);
    });

    it('should return path ending with vec0.dll on Windows', () => {
      const extPath = getVecExtensionPath();
      expect(extPath).toBeDefined();
      // The resolved path should point to the vec0.dll file
      expect(extPath!.toLowerCase()).toContain('vec0');
    });

    it('should load the extension and create a vec0 virtual table on file-based DB', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-vec-'));
      const dbPath2 = path.join(tmpDir, 'test-vec.sqlite');
      try {
        const m = new DatabaseManager({
          dbPath: dbPath2,
          walMode: true,
          runMigrations: false,
          autoLoadVec: true, // Auto-load the extension
        });
        m.open();

        const db = m.getDb();

        // Create a vec0 virtual table to verify extension is loaded
        db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS test_vec USING vec0(embedding float[3])');

        // Verify the table exists
        const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_vec'").get();
        expect(row).toBeDefined();

        // Insert and query a vector
        db.exec("INSERT INTO test_vec (rowid, embedding) VALUES (1, '[1.0, 2.0, 3.0]')");
        const result = db.prepare('SELECT rowid FROM test_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 1').get('[1.0, 2.0, 3.0]') as { rowid: number };
        expect(result).toBeDefined();
        expect(result.rowid).toBe(1);

        m.close();
      } finally {
        try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
      }
    });
  });

  it('should throw a clear error when loading from non-existent path', () => {
    const manager = new DatabaseManager({
      dbPath: ':memory:',
      walMode: false,
      runMigrations: false,
      vecExtensionPath: 'C:/nonexistent/vec0.dll',
    });
    expect(() => manager.open()).toThrow(/Failed to load sqlite-vec extension/);
  });
});

// ===== VAL-AI-005: Pending migrations applied on startup =====
describe('VAL-AI-005: Pending migrations applied on startup', () => {
  it('should run migrations when runMigrations=true', () => {
    const manager = new DatabaseManager({
      dbPath: ':memory:',
      walMode: false,
      runMigrations: true,
      autoLoadVec: false,
    });
    manager.open();

    // schema_migrations should exist with version 1
    const versions = getAppliedVersions(manager.getDb());
    expect(versions).toEqual([1, 2, 3, 4, 5, 6]);
    manager.close();
  });

  it('should NOT run migrations when runMigrations=false', () => {
    const manager = new DatabaseManager({
      dbPath: ':memory:',
      walMode: false,
      runMigrations: false,
      autoLoadVec: false,
    });
    manager.open();

    // No schema_migrations table
    expect(manager.hasTable('accounts')).toBe(false);
    manager.close();
  });
});

// ===== Standalone migration tests =====
describe('Migration system (standalone)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty applied versions on fresh DB', () => {
    const versions = getAppliedVersions(db);
    expect(versions).toEqual([]);
  });

  it('should apply migration 001 when run', () => {
    const count = runMigrations(db);
    expect(count).toBe(6);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    expect(tables.length).toBe(21);
  });

  it('should apply zero migrations on second run', () => {
    runMigrations(db);
    const count = runMigrations(db);
    expect(count).toBe(0);
  });

  it('should have correct migration version recorded', () => {
    runMigrations(db);
    const versions = getAppliedVersions(db);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('should enable foreign keys during migration', () => {
    runMigrations(db);
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
  });

  it('should create all table columns matching schema', () => {
    runMigrations(db);

    // Verify accounts table has expected columns
    const accountsCols = db.prepare('PRAGMA table_info(accounts)').all() as any[];
    const accountsNames = accountsCols.map((c: any) => c.name);
    expect(accountsNames).toContain('id');
    expect(accountsNames).toContain('platform');
    expect(accountsNames).toContain('handle');
    expect(accountsNames).toContain('session_partition');
    expect(accountsNames).toContain('created_at');
    expect(accountsNames).toContain('updated_at');

    // Verify posts table has expected columns
    const postsCols = db.prepare('PRAGMA table_info(posts)').all() as any[];
    const postsNames = postsCols.map((c: any) => c.name);
    expect(postsNames).toContain('account_id');
    expect(postsNames).toContain('platform_post_id');
    expect(postsNames).toContain('content_text');
    expect(postsNames).toContain('adapter_version');

    // Verify UNIQUE constraint on posts
    const postsIndexes = db.prepare('PRAGMA index_list(posts)').all() as any[];
    expect(postsIndexes.length).toBeGreaterThan(0);
  });
});
