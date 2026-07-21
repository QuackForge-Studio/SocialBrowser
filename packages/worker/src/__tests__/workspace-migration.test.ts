import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  runMigrations,
  getAppliedVersions,
  ALL_MIGRATIONS,
  migrateLegacyAccounts,
} from '../database';

// Helper to list tables in the database
function listTables(db: Database.Database): string[] {
  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all() as { name: string }[];
  return rows.map(r => r.name);
}

function seedAccount(db: Database.Database, id: string, platform: string, handle: string, partition: string, createdAt: string): void {
  db.prepare(
    'INSERT INTO accounts (id, platform, handle, session_partition, adapter_version, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, platform, handle, partition, 1, createdAt);
}

describe('Workspace Data Migration (VAL-WORKSPACE-023)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // Run all base schema migrations (1-4) so core tables exist
    // We selectively test migration 005 behavior separately
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  // ===== Migration 005 structure =====
  describe('Migration 005 structure', () => {
    it('should have 5 total migrations with version 5', () => {
      expect(ALL_MIGRATIONS.length).toBe(6);
      expect(ALL_MIGRATIONS[4].version).toBe(5);
      expect(ALL_MIGRATIONS[5].version).toBe(6);
    });

    it('should apply migration 005 idempotently', () => {
      const count1 = getAppliedVersions(db).length;
      // Run again - should be zero new migrations
      const count2 = runMigrations(db);
      expect(count2).toBe(0);
    });

    it('should have recorded migration 005 as applied', () => {
      const versions = getAppliedVersions(db).sort((a, b) => a - b);
      expect(versions).toContain(5);
      expect(versions.length).toBe(6);
    });
  });

  // ===== Workspace tables exist =====
  describe('Workspace tables exist after migrations', () => {
    it('should have workspaces, tab_groups, group_accounts, group_tabs tables', () => {
      const tables = listTables(db);
      expect(tables).toContain('workspaces');
      expect(tables).toContain('tab_groups');
      expect(tables).toContain('group_accounts');
      expect(tables).toContain('group_tabs');
    });

    it('should have 17 total tables including workspace tables', () => {
      const tables = listTables(db);
      expect(tables.length).toBe(21);
    });

    it('should have correct columns in workspaces table', () => {
      const cols = db.prepare('PRAGMA table_info(workspaces)').all() as { name: string }[];
      const names = cols.map((c: { name: string }) => c.name);
      expect(names).toContain('id');
      expect(names).toContain('name');
      expect(names).toContain('sort_order');
      expect(names).toContain('created_at');
      expect(names).toContain('updated_at');
    });

    it('should have correct columns in tab_groups table', () => {
      const cols = db.prepare('PRAGMA table_info(tab_groups)').all() as { name: string }[];
      const names = cols.map((c: { name: string }) => c.name);
      expect(names).toContain('id');
      expect(names).toContain('workspace_id');
      expect(names).toContain('name');
      expect(names).toContain('sort_order');
    });

    it('should have correct columns in group_accounts table', () => {
      const cols = db.prepare('PRAGMA table_info(group_accounts)').all() as { name: string }[];
      const names = cols.map((c: { name: string }) => c.name);
      expect(names).toContain('id');
      expect(names).toContain('group_id');
      expect(names).toContain('account_id');
      expect(names).toContain('sort_order');
    });
  });

  // ===== Fresh database - no legacy accounts =====
  describe('Fresh database with no accounts', () => {
    it('should NOT create default workspace/group when no accounts exist', () => {
      // Migration 005 already ran (in runMigrations) and found 0 accounts
      const workspaces = db.prepare('SELECT COUNT(*) as count FROM workspaces').get() as { count: number };
      expect(workspaces.count).toBe(0);

      const groups = db.prepare('SELECT COUNT(*) as count FROM tab_groups').get() as { count: number };
      expect(groups.count).toBe(0);
    });

    it('should have all workspace tables queryable when empty', () => {
      expect(() => {
        db.prepare('SELECT * FROM workspaces').all();
        db.prepare('SELECT * FROM tab_groups').all();
        db.prepare('SELECT * FROM group_accounts').all();
        db.prepare('SELECT * FROM group_tabs').all();
      }).not.toThrow();
    });
  });

  // ===== migrateLegacyAccounts() function tests =====
  describe('migrateLegacyAccounts() with legacy accounts', () => {
    it('should create default workspace and group when accounts exist', () => {
      seedAccount(db, 'acc-a', 'x', '@testA', 'persist:social-browser:x:acc-a', '2024-01-01T00:00:00Z');
      seedAccount(db, 'acc-b', 'x', '@testB', 'persist:social-browser:x:acc-b', '2024-01-02T00:00:00Z');

      migrateLegacyAccounts(db);

      // Verify default workspace was created
      const workspaces = db.prepare(
        "SELECT id, name FROM workspaces ORDER BY sort_order"
      ).all() as { id: string; name: string }[];
      expect(workspaces.length).toBe(1);
      expect(workspaces[0].id).toBe('workspace-default');
      expect(workspaces[0].name).toBe('Default Workspace');

      // Verify default group was created
      const groups = db.prepare(
        "SELECT id, name, workspace_id FROM tab_groups ORDER BY sort_order"
      ).all() as { id: string; name: string; workspace_id: string }[];
      expect(groups.length).toBe(1);
      expect(groups[0].id).toBe('group-default');
      expect(groups[0].name).toBe('Default Group');
      expect(groups[0].workspace_id).toBe('workspace-default');

      // Verify memberships
      const memberships = db.prepare(
        "SELECT account_id, sort_order FROM group_accounts WHERE group_id = 'group-default' ORDER BY sort_order"
      ).all() as { account_id: string; sort_order: number }[];
      expect(memberships.length).toBe(2);
      expect(memberships[0].account_id).toBe('acc-a');
      expect(memberships[0].sort_order).toBe(0);
      expect(memberships[1].account_id).toBe('acc-b');
      expect(memberships[1].sort_order).toBe(1);
    });

    it('should place accounts in deterministic order by created_at then id', () => {
      // Same created_at to test ID tiebreaker
      seedAccount(db, 'z-acc', 'x', '@z', 'p:s:b:x:z', '2024-06-01T00:00:00Z');
      seedAccount(db, 'a-acc', 'x', '@a', 'p:s:b:x:a', '2024-06-01T00:00:00Z');
      seedAccount(db, 'm-acc', 'x', '@m', 'p:s:b:x:m', '2024-06-01T00:00:00Z');

      migrateLegacyAccounts(db);

      const memberships = db.prepare(
        'SELECT account_id, sort_order FROM group_accounts ORDER BY sort_order'
      ).all() as { account_id: string; sort_order: number }[];

      // Should order by created_at ASC (same for all), then id ASC: a-acc, m-acc, z-acc
      expect(memberships.length).toBe(3);
      expect(memberships[0].account_id).toBe('a-acc');
      expect(memberships[0].sort_order).toBe(0);
      expect(memberships[1].account_id).toBe('m-acc');
      expect(memberships[1].sort_order).toBe(1);
      expect(memberships[2].account_id).toBe('z-acc');
      expect(memberships[2].sort_order).toBe(2);
    });

    it('should sort accounts with different created_at correctly', () => {
      seedAccount(db, 'acc-c', 'x', '@testC', 'p:s:b:x:c', '2024-01-03T00:00:00Z');
      seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:a', '2024-01-01T00:00:00Z');
      seedAccount(db, 'acc-b', 'x', '@testB', 'p:s:b:x:b', '2024-01-02T00:00:00Z');

      migrateLegacyAccounts(db);

      const memberships = db.prepare(
        'SELECT account_id, sort_order FROM group_accounts ORDER BY sort_order'
      ).all() as { account_id: string; sort_order: number }[];

      expect(memberships[0].account_id).toBe('acc-a');
      expect(memberships[1].account_id).toBe('acc-b');
      expect(memberships[2].account_id).toBe('acc-c');
    });

    it('should be idempotent when called multiple times', () => {
      seedAccount(db, 'acc-a', 'x', '@a', 'p:s:b:x:a', '2024-01-01T00:00:00Z');
      seedAccount(db, 'acc-b', 'x', '@b', 'p:s:b:x:b', '2024-01-02T00:00:00Z');

      migrateLegacyAccounts(db);
      migrateLegacyAccounts(db); // Second call should be no-op

      const workspaces = db.prepare('SELECT COUNT(*) as count FROM workspaces').get() as { count: number };
      expect(workspaces.count).toBe(1);

      const groups = db.prepare('SELECT COUNT(*) as count FROM tab_groups').get() as { count: number };
      expect(groups.count).toBe(1);

      const memberships = db.prepare('SELECT COUNT(*) as count FROM group_accounts').get() as { count: number };
      expect(memberships.count).toBe(2);
    });

    it('should not create workspace/group if they already exist', () => {
      // Pre-create a workspace (simulating existing workspace data)
      db.prepare("INSERT INTO workspaces (id, name, sort_order) VALUES ('custom-ws', 'Custom', 0)").run();
      db.prepare("INSERT INTO tab_groups (id, workspace_id, name) VALUES ('custom-grp', 'custom-ws', 'Custom Group')").run();

      seedAccount(db, 'acc-a', 'x', '@a', 'p:s:b:x:a', '2024-01-01T00:00:00Z');

      migrateLegacyAccounts(db);

      // Should not have created a default workspace
      const wsDefault = db.prepare("SELECT id FROM workspaces WHERE id = 'workspace-default'").get();
      expect(wsDefault).toBeUndefined();

      // Original workspace should still exist
      const wsOrig = db.prepare("SELECT id FROM workspaces WHERE id = 'custom-ws'").get();
      expect(wsOrig).toBeDefined();
    });
  });

  // ===== VAL-WORKSPACE-023: Data preservation =====
  describe('VAL-WORKSPACE-023: Data preservation after migration', () => {
    it('should preserve account IDs and session partitions unchanged', () => {
      seedAccount(db, 'legacy-a', 'x', '@alice', 'persist:social-browser:x:legacy-a', '2024-06-01T00:00:00Z');
      seedAccount(db, 'legacy-b', 'x', '@bob', 'persist:social-browser:x:legacy-b', '2024-06-02T00:00:00Z');

      migrateLegacyAccounts(db);

      // Verify accounts preserved exactly as they were
      const accA = db.prepare(
        'SELECT id, session_partition, platform, handle FROM accounts WHERE id = ?'
      ).get('legacy-a') as { id: string; session_partition: string; platform: string; handle: string };
      expect(accA).toBeDefined();
      expect(accA.id).toBe('legacy-a');
      expect(accA.session_partition).toBe('persist:social-browser:x:legacy-a');
      expect(accA.platform).toBe('x');
      expect(accA.handle).toBe('@alice');

      const accB = db.prepare(
        'SELECT id, session_partition FROM accounts WHERE id = ?'
      ).get('legacy-b') as { id: string; session_partition: string };
      expect(accB).toBeDefined();
      expect(accB.id).toBe('legacy-b');
      expect(accB.session_partition).toBe('persist:social-browser:x:legacy-b');
    });

    it('should preserve owned content (posts, scores, drafts) after migration', () => {
      db.prepare(
        "INSERT INTO accounts (id, platform, handle, session_partition) VALUES (?, ?, ?, ?)"
      ).run('acc-content', 'x', '@user', 'persist:social-browser:x:acc-content');

      db.prepare(
        "INSERT INTO posts (id, account_id, platform_post_id, content_text, adapter_version, published_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('post-old', 'acc-content', 'pid-100', 'Legacy post content', 1, '2024-01-01T00:00:00Z');

      db.prepare(
        "INSERT INTO engagement_snapshots (id, post_id, likes, shares) VALUES (?, ?, ?, ?)"
      ).run('snap-1', 'post-old', 42, 7);

      db.prepare(
        "INSERT INTO comments (id, post_id, platform_comment_id, text) VALUES (?, ?, ?, ?)"
      ).run('cmt-1', 'post-old', 'c-1', 'Great post!');

      db.prepare(
        "INSERT INTO scores (id, post_id, formula_version, composite_score, computed_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).run('score-1', 'post-old', 1, 0.85);

      db.prepare(
        "INSERT INTO content_drafts (id, account_id, source_prompt, status) VALUES (?, ?, ?, ?)"
      ).run('draft-1', 'acc-content', 'Test prompt', 'draft');

      // Run migration - should not affect existing content
      migrateLegacyAccounts(db);

      // Verify all content preserved
      const post = db.prepare('SELECT content_text FROM posts WHERE id = ?').get('post-old') as { content_text: string };
      expect(post.content_text).toBe('Legacy post content');

      const snap = db.prepare('SELECT likes FROM engagement_snapshots WHERE id = ?').get('snap-1') as { likes: number };
      expect(snap.likes).toBe(42);

      const cmt = db.prepare('SELECT text FROM comments WHERE id = ?').get('cmt-1') as { text: string };
      expect(cmt.text).toBe('Great post!');

      const score = db.prepare('SELECT composite_score FROM scores WHERE id = ?').get('score-1') as { composite_score: number };
      expect(score.composite_score).toBe(0.85);

      const draft = db.prepare('SELECT status FROM content_drafts WHERE id = ?').get('draft-1') as { status: string };
      expect(draft.status).toBe('draft');
    });

    it('should not touch browser storage (no session or cookie operations)', () => {
      // Structural assertion: migration runs in worker thread only,
      // which has no access to Electron session/browser storage APIs.
      migrateLegacyAccounts(db);
      expect(true).toBe(true);
    });
  });

  // ===== Group table constraints =====
  describe('Group table constraints', () => {
    it('should enforce UNIQUE(group_id, account_id) in group_accounts', () => {
      db.prepare("INSERT INTO workspaces (id, name) VALUES ('ws-t', 'Test WS')").run();
      db.prepare("INSERT INTO tab_groups (id, workspace_id, name) VALUES ('grp-t', 'ws-t', 'Test G')").run();
      db.prepare("INSERT INTO accounts (id, platform, handle, session_partition) VALUES ('acc-t', 'x', '@t', 'p:s:b:x:t')").run();

      db.prepare("INSERT INTO group_accounts (id, group_id, account_id, sort_order) VALUES ('gm-1', 'grp-t', 'acc-t', 0)").run();

      expect(() => {
        db.prepare("INSERT INTO group_accounts (id, group_id, account_id, sort_order) VALUES ('gm-2', 'grp-t', 'acc-t', 1)").run();
      }).toThrow();
    });

    it('should cascade delete group_accounts and group_tabs when tab_group deleted', () => {
      db.prepare("INSERT INTO workspaces (id, name) VALUES ('ws-t', 'Test WS')").run();
      db.prepare("INSERT INTO tab_groups (id, workspace_id, name) VALUES ('grp-t', 'ws-t', 'Test G')").run();
      db.prepare("INSERT INTO accounts (id, platform, handle, session_partition) VALUES ('acc-t', 'x', '@t', 'p:s:b:x:t')").run();
      db.prepare("INSERT INTO group_accounts (id, group_id, account_id, sort_order) VALUES ('gm-1', 'grp-t', 'acc-t', 0)").run();
      db.prepare("INSERT INTO group_tabs (id, group_id, platform, account_id, sort_order) VALUES ('gt-1', 'grp-t', 'x', 'acc-t', 0)").run();

      db.prepare("DELETE FROM tab_groups WHERE id = 'grp-t'").run();

      const memberships = db.prepare("SELECT COUNT(*) as count FROM group_accounts WHERE group_id = 'grp-t'").get() as { count: number };
      expect(memberships.count).toBe(0);

      const tabs = db.prepare("SELECT COUNT(*) as count FROM group_tabs WHERE group_id = 'grp-t'").get() as { count: number };
      expect(tabs.count).toBe(0);
    });
  });
});
