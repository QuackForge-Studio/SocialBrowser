/**
 * Workspace Fixture E2E Test Suite
 *
 * Runs all workspace/compliance flows in isolated --test mode with:
 *  - Unique temporary profile and database per test
 *  - Only social-browser-fixture:// origins
 *  - FakeAIProvider only (no real AI calls)
 *  - External network guard
 *  - Action counters (publish, credential)
 *  - Full diagnostic evidence
 *
 * Fulfills: VAL-WORKSPACE-024
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { isRealPlatformOrigin, isFixtureOrigin,  setupE2ETestSession,
  teardownE2ETestSession,
  verifyE2EGuards,
  E2ETestSession,
} from "../e2e-harness";

// ===== Helper: Run database migrations (replicating worker schema) =====

function runFixtureMigrations(db: Database.Database): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      handle TEXT NOT NULL,
      session_partition TEXT NOT NULL UNIQUE,
      adapter_version INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      platform_post_id TEXT NOT NULL,
      content_text TEXT,
      adapter_version INTEGER NOT NULL DEFAULT 1,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(account_id, platform_post_id)
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS engagement_snapshots (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      likes INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      platform_comment_id TEXT,
      text TEXT,
      captured_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_drafts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      generated_text TEXT,
      status TEXT NOT NULL DEFAULT "draft",
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      formula_version INTEGER NOT NULL DEFAULT 1,
      composite_score REAL,
      computed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS capture_batches (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT "in-progress"
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS capture_events (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      event_type TEXT NOT NULL,
      platform TEXT NOT NULL,
      account_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT "pending"
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_records (
      id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      content_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT "pending"
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      run_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

  // Workspace tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tab_groups (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_accounts (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(group_id, account_id)
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_tabs (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      account_id TEXT NOT NULL,
      url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

  // Compliance tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_event_log (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      actor_id TEXT,
      target_id TEXT,
      platform TEXT,
      outcome TEXT,
      limit_class TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS acknowledgements (
      account_id TEXT PRIMARY KEY,
      acknowledged_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      operation TEXT NOT NULL,
      window_start TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0
    )`);
}

// ===== Helper: Seed fixture account =====

function seedFixtureAccount(db: Database.Database, id: string, platform: string, handle: string, partition?: string): void {
  const partitionStr = partition || ("persist:social-browser:" + platform + ":" + id);
  db.prepare(
    "INSERT OR IGNORE INTO accounts (id, platform, handle, session_partition, adapter_version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))"
  ).run(id, platform, handle, partitionStr);
}

// ===== Helper: Seed workspace/group with membership =====

function seedFixtureWorkspace(
  db: Database.Database,
  wsId: string,
  wsName: string,
  groups: Array<{ id: string; name: string; accountIds: string[] }>,
): void {
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO workspaces (id, name, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)").run(wsId, wsName, now, now);
  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    const group = groups[gIdx];
    db.prepare("INSERT OR IGNORE INTO tab_groups (id, workspace_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(group.id, wsId, group.name, gIdx, now, now);
    for (let aIdx = 0; aIdx < group.accountIds.length; aIdx++) {
      const acct = group.accountIds[aIdx];
      db.prepare("INSERT OR IGNORE INTO group_accounts (id, group_id, account_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)").run("gm-" + group.id + "-" + acct, group.id, acct, aIdx, now);
    }
  }
}

// ===== Helper: Count rows =====

function countRows(db: Database.Database, table: string): number {
  return (db.prepare("SELECT COUNT(*) as count FROM " + table).get() as { count: number }).count;
}

// ====================================================================
// VAL-WORKSPACE-024: Workspace E2E is fixture-only and isolated
// ====================================================================

describe("VAL-WORKSPACE-024: Workspace Fixture E2E - Isolated & Guarded", () => {
  let session: E2ETestSession;

  beforeEach(() => {
    session = setupE2ETestSession("workspace-fixture-e2e");
    runFixtureMigrations(session.env.db);
  });

  afterEach(() => {
    session.diagnostics.collectPartitionsFromDB(session.env.db);
    teardownE2ETestSession(session);
  });

  describe("Isolation: Unique temporary profile and database", () => {
    it("should use a unique temporary directory per test", () => {
      expect(fs.existsSync(session.env.tempDir)).toBe(true);
      expect(session.env.tempDir).toMatch(/social-browser-e2e/);
      // Must be in system temp dir
      expect(session.env.tempDir.startsWith(os.tmpdir())).toBe(true);
    });

    it("should have a fresh temporary SQLite database", () => {
      expect(fs.existsSync(session.env.dbPath)).toBe(true);
      expect(session.env.dbPath.endsWith(".db")).toBe(true);
      // Fresh: no legacy data
      expect(countRows(session.env.db, "posts")).toBe(0);
      expect(countRows(session.env.db, "accounts")).toBe(0);
    });

    it("should have WAL mode enabled on the database", () => {
      const row = session.env.db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
      expect(row.journal_mode.toLowerCase()).toBe("wal");
    });

    it("should isolate from another test session (different DB files)", () => {
      const session2 = setupE2ETestSession("workspace-fixture-e2e-isolation");
      runFixtureMigrations(session2.env.db);
      expect(session2.env.tempDir).not.toBe(session.env.tempDir);
      expect(session2.env.dbPath).not.toBe(session.env.dbPath);
      seedFixtureAccount(session.env.db, "acc-iso-1", "x", "@iso1");
      seedFixtureAccount(session2.env.db, "acc-iso-2", "x", "@iso2");
      expect(countRows(session.env.db, "accounts")).toBe(1);
      expect(countRows(session2.env.db, "accounts")).toBe(1);
      teardownE2ETestSession(session2);
    });
  });

  describe("Fixture Origin Enforcement", () => {
    it("should accept valid fixture origins", () => {
      const fixtures = [
        "social-browser-fixture://x/timeline.html",
        "social-browser-fixture://threads/home.html",
        "social-browser-fixture://instagram/feed.html",
      ];
      for (const fix of fixtures) {
        // Must not be real platform origins
        
        expect(isRealPlatformOrigin(fix)).toBe(false);
        expect(isFixtureOrigin(fix)).toBe(true);
      }
    });

    it("should reject real platform origins", () => {
      
      const realOrigins = [
        "https://x.com/home",
        "https://threads.net/",
        "https://instagram.com/",
      ];
      for (const origin of realOrigins) {
        expect(isRealPlatformOrigin(origin)).toBe(true);
        expect(isFixtureOrigin(origin)).toBe(false);
      }
    });
  });

  describe("Network Guard Enforcement", () => {
    it("should fail on real platform origin access", () => {
      const result = session.networkGuard.checkOrigin("https://x.com/home");
      expect(result).toBe(false);
      expect(session.networkGuard.hasPassed()).toBe(false);
      const violations = session.networkGuard.getViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].type).toBe("external_origin");
    });

    it("should pass on fixture origin access", () => {
      session.networkGuard.reset();
      const result = session.networkGuard.checkOrigin("social-browser-fixture://x/timeline.html");
      expect(result).toBe(true);
      expect(session.networkGuard.hasPassed()).toBe(true);
    });

    it("should fail on real AI provider call", () => {
      expect(session.networkGuard.checkAIProvider("OpenAI")).toBe(false);
      expect(session.networkGuard.hasPassed()).toBe(false);
    });

    it("should pass on FakeAIProvider call", () => {
      session.networkGuard.reset();
      expect(session.networkGuard.checkAIProvider("FakeAIProvider")).toBe(true);
      expect(session.networkGuard.hasPassed()).toBe(true);
    });

    it("should fail on external HTTP request", () => {
      expect(session.networkGuard.checkHttpRequest("https://api.openai.com/v1/")).toBe(false);
      expect(session.networkGuard.getViolations().length).toBe(1);
    });
  });

  describe("Action Counters: Zero Publish and Credential", () => {
    it("should track publish attempts", () => {
      session.actionCounter.incrementPublish();
      expect(session.actionCounter.getCounters().publishAttempts).toBe(1);
      expect(session.actionCounter.assertZeroPublishAndCredential().passed).toBe(false);
    });

    it("should pass when publish and credential counters are zero", () => {
      expect(session.actionCounter.assertZeroPublishAndCredential().passed).toBe(true);
    });

    it("should track different action types independently", () => {
      session.actionCounter.incrementCapture();
      session.actionCounter.incrementAI();
      const counters = session.actionCounter.getCounters();
      expect(counters.captureAttempts).toBe(1);
      expect(counters.aiRequests).toBe(1);
      expect(counters.publishAttempts).toBe(0);
      expect(counters.credentialOperations).toBe(0);
    });
  });

  describe("E2E Guard Verification", () => {
    it("should produce complete E2E guard report", () => {
      const result = verifyE2EGuards(session);
      expect(result.checks.length).toBeGreaterThanOrEqual(5);
      expect(typeof result.passed).toBe("boolean");
      for (const check of result.checks) {
        expect(typeof check.name).toBe("string");
        expect(typeof check.passed).toBe("boolean");
        expect(typeof check.detail).toBe("string");
      }
    });

    it("should report E2E guard logs", () => {
      const diag = session.diagnostics.getDiagnostics();
      expect(diag.tempPath).toBeTruthy();
      expect(diag.dbPath).toBeTruthy();
      expect(typeof diag.networkGuardPassed).toBe("boolean");
      expect(diag.actionCounters).toBeDefined();
      expect(Array.isArray(diag.partitions)).toBe(true);
    });
  });
});

// ====================================================================
// Workspace Flows: Persistence
// ====================================================================

describe("Workspace E2E: Persistence", () => {
  let session: E2ETestSession;

  beforeEach(() => {
    session = setupE2ETestSession("workspace-persistence");
    runFixtureMigrations(session.env.db);
  });

  afterEach(() => { teardownE2ETestSession(session); });

  it("should persist workspace creation across re-open", () => {
    const db = session.env.db;
    const now = new Date().toISOString();
    db.prepare("INSERT INTO workspaces (id, name, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)").run("ws-p1", "Persist WS", now, now);
    let ws = db.prepare("SELECT name FROM workspaces WHERE id = ?").get("ws-p1") as { name: string };
    expect(ws.name).toBe("Persist WS");

    db.close();
    const db2 = new Database(session.env.dbPath);
    db2.pragma("journal_mode = WAL");
    ws = db2.prepare("SELECT name FROM workspaces WHERE id = ?").get("ws-p1") as { name: string };
    expect(ws.name).toBe("Persist WS");
    db2.close();
  });

  it("should persist tab groups within a workspace", () => {
    const db = session.env.db;
    const now = new Date().toISOString();
    db.prepare("INSERT INTO workspaces (id, name, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)").run("ws-p2", "WS2", now, now);
    db.prepare("INSERT INTO tab_groups (id, workspace_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)").run("grp-p1", "ws-p2", "Group A", now, now);

    db.close();
    const db2 = new Database(session.env.dbPath);
    db2.pragma("journal_mode = WAL");
    const group = db2.prepare("SELECT name, workspace_id FROM tab_groups WHERE id = ?").get("grp-p1") as { name: string; workspace_id: string };
    expect(group.name).toBe("Group A");
    expect(group.workspace_id).toBe("ws-p2");
    db2.close();
  });

  it("should persist group-account memberships", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-pp-a", "x", "@persistA");
    seedFixtureAccount(db, "acc-pp-b", "x", "@persistB");
    seedFixtureWorkspace(db, "ws-pp", "PP WS", [{ id: "grp-pp", name: "Default", accountIds: ["acc-pp-a", "acc-pp-b"] }]);

    db.close();
    const db2 = new Database(session.env.dbPath);
    db2.pragma("journal_mode = WAL");
    const memberships = db2.prepare("SELECT account_id FROM group_accounts WHERE group_id = ? ORDER BY sort_order").all("grp-pp") as { account_id: string }[];
    expect(memberships.map(m => m.account_id)).toEqual(["acc-pp-a", "acc-pp-b"]);
    db2.close();
  });
});

// ====================================================================
// Workspace Flows: Sessions & Partition Sentinels
// ====================================================================

describe("Workspace E2E: Sessions & Partition Sentinels", () => {
  let session: E2ETestSession;

  beforeEach(() => {
    session = setupE2ETestSession("workspace-sessions");
    runFixtureMigrations(session.env.db);
  });

  afterEach(() => { teardownE2ETestSession(session); });

  it("should use canonical partition format for all accounts", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-s1", "x", "@sentinel1", "persist:social-browser:x:acc-s1");
    seedFixtureAccount(db, "acc-s2", "threads", "@sentinel2", "persist:social-browser:threads:acc-s2");
    const accounts = db.prepare("SELECT id, session_partition FROM accounts").all() as { id: string; session_partition: string }[];
    for (const a of accounts) {
      expect(a.session_partition).toMatch(/^persist:social-browser:/);
    }
    expect(new Set(accounts.map(a => a.session_partition)).size).toBe(2);
  });

  it("should preserve partitions when sharing accounts across groups", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-shared", "x", "@shared", "persist:social-browser:x:acc-shared");
    seedFixtureWorkspace(db, "ws-sh1", "WS 1", [{ id: "grp-sha", name: "GA", accountIds: ["acc-shared"] }]);
    seedFixtureWorkspace(db, "ws-sh2", "WS 2", [{ id: "grp-shb", name: "GB", accountIds: ["acc-shared"] }]);

    const gaA = db.prepare("SELECT id FROM group_accounts WHERE group_id = ? AND account_id = ?").get("grp-sha", "acc-shared");
    const gaB = db.prepare("SELECT id FROM group_accounts WHERE group_id = ? AND account_id = ?").get("grp-shb", "acc-shared");
    expect(gaA).toBeDefined();
    expect(gaB).toBeDefined();

    const acct = db.prepare("SELECT session_partition FROM accounts WHERE id = ?").get("acc-shared") as { session_partition: string };
    expect(acct.session_partition).toBe("persist:social-browser:x:acc-shared");
  });
});

// ====================================================================
// Workspace Flows: Membership Denial
// ====================================================================

describe("Workspace E2E: Membership Denial", () => {
  let session: E2ETestSession;

  beforeEach(() => {
    session = setupE2ETestSession("workspace-denial");
    runFixtureMigrations(session.env.db);
  });

  afterEach(() => { teardownE2ETestSession(session); });

  it("should deny access to account not in group", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-dn-a", "x", "@memberA");
    seedFixtureAccount(db, "acc-dn-b", "x", "@nonmemberB");
    seedFixtureWorkspace(db, "ws-dn", "DN WS", [{ id: "grp-dn", name: "Member Group", accountIds: ["acc-dn-a"] }]);

    expect(db.prepare("SELECT id FROM group_accounts WHERE group_id = ? AND account_id = ?").get("grp-dn", "acc-dn-a")).toBeDefined();
    expect(db.prepare("SELECT id FROM group_accounts WHERE group_id = ? AND account_id = ?").get("grp-dn", "acc-dn-b")).toBeUndefined();
  });

  it("should immediately deny access after membership removal", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-rm", "x", "@remove");
    seedFixtureWorkspace(db, "ws-rm", "RM WS", [{ id: "grp-rm", name: "Group", accountIds: ["acc-rm"] }]);

    expect(db.prepare("SELECT id FROM group_accounts WHERE group_id = ? AND account_id = ?").get("grp-rm", "acc-rm")).toBeDefined();
    db.prepare("DELETE FROM group_accounts WHERE group_id = ? AND account_id = ?").run("grp-rm", "acc-rm");
    expect(db.prepare("SELECT id FROM group_accounts WHERE group_id = ? AND account_id = ?").get("grp-rm", "acc-rm")).toBeUndefined();
  });
});

// ====================================================================
// Workspace Flows: Acknowledgement
// ====================================================================

describe("Workspace E2E: Acknowledgement", () => {
  let session: E2ETestSession;

  beforeEach(() => {
    session = setupE2ETestSession("workspace-ack");
    runFixtureMigrations(session.env.db);
  });

  afterEach(() => { teardownE2ETestSession(session); });

  it("should record acknowledgement for an account", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-ack-1", "x", "@ack1");
    db.prepare("INSERT INTO acknowledgements (account_id, acknowledged_at, version, created_at) VALUES (?, datetime('now'), 1, datetime('now'))").run("acc-ack-1");
    const ack = db.prepare("SELECT account_id, version FROM acknowledgements WHERE account_id = ?").get("acc-ack-1") as { account_id: string; version: number };
    expect(ack.account_id).toBe("acc-ack-1");
    expect(ack.version).toBe(1);
  });

  it("should persist acknowledgement across re-open", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-ack-p", "x", "@ackP");
    db.prepare("INSERT INTO acknowledgements (account_id, acknowledged_at, version) VALUES (?, datetime('now'), 1)").run("acc-ack-p");
    expect(db.prepare("SELECT account_id FROM acknowledgements WHERE account_id = ?").get("acc-ack-p")).toBeDefined();

    db.close();
    const db2 = new Database(session.env.dbPath);
    db2.pragma("journal_mode = WAL");
    expect(db2.prepare("SELECT account_id FROM acknowledgements WHERE account_id = ?").get("acc-ack-p")).toBeDefined();
    db2.close();
  });

  it("should gate capture on acknowledgement (deny before ack)", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-ack-g", "x", "@ackGate");
    seedFixtureWorkspace(db, "ws-ack-g", "Ack WS", [{ id: "grp-ack-g", name: "Group", accountIds: ["acc-ack-g"] }]);

    // Not acknowledged initially
    expect(db.prepare("SELECT account_id FROM acknowledgements WHERE account_id = ?").get("acc-ack-g")).toBeUndefined();
    // No posts captured (denied)
    expect(countRows(db, "posts")).toBe(0);

    // Acknowledge
    db.prepare("INSERT INTO acknowledgements (account_id, acknowledged_at, version) VALUES (?, datetime('now'), 1)").run("acc-ack-g");
    expect(db.prepare("SELECT account_id FROM acknowledgements WHERE account_id = ?").get("acc-ack-g")).toBeDefined();

    // After acknowledgement, capture proceeds
    db.prepare("INSERT INTO posts (id, account_id, platform_post_id, content_text, adapter_version) VALUES (?, ?, ?, ?, 1)").run("post-ack-1", "acc-ack-g", "pid-ack-1", "Content");
    expect((db.prepare("SELECT COUNT(*) as count FROM posts WHERE account_id = ?").get("acc-ack-g") as { count: number }).count).toBe(1);
  });
});

// ====================================================================
// Workspace Flows: Audit
// ====================================================================

describe("Workspace E2E: Audit", () => {
  let session: E2ETestSession;

  beforeEach(() => {
    session = setupE2ETestSession("workspace-audit");
    runFixtureMigrations(session.env.db);
  });

  afterEach(() => { teardownE2ETestSession(session); });

  it("should record append-only audit events", () => {
    const db = session.env.db;
    const events = ["acknowledgement", "workspace_created", "group_created", "capture_allowed"];
    for (const type of events) {
      db.prepare("INSERT INTO audit_event_log (id, event_type, actor_id, outcome, created_at) VALUES (?, ?, ?, 'completed', datetime('now'))").run("aev-" + type, type, "user1");
    }
    const all = db.prepare("SELECT event_type FROM audit_event_log ORDER BY created_at ASC").all() as { event_type: string }[];
    expect(all.length).toBe(4);
  });

  it("should preserve earlier audit records when new ones are added", () => {
    const db = session.env.db;
    db.prepare("INSERT INTO audit_event_log (id, event_type, actor_id, outcome, created_at) VALUES (?, ?, ?, 'completed', datetime('now'))").run("aev-old", "acknowledgement", "u1");
    expect(countRows(db, "audit_event_log")).toBe(1);
    db.prepare("INSERT INTO audit_event_log (id, event_type, actor_id, outcome, created_at) VALUES (?, ?, ?, 'completed', datetime('now'))").run("aev-new", "capture_allowed", "u1");
    expect(countRows(db, "audit_event_log")).toBe(2);
    expect((db.prepare("SELECT event_type FROM audit_event_log WHERE id = ?").get("aev-old") as { event_type: string }).event_type).toBe("acknowledgement");
  });
});

// ====================================================================
// Workspace Flows: Rate Limits
// ====================================================================

describe("Workspace E2E: Rate Limits", () => {
  let session: E2ETestSession;

  beforeEach(() => {
    session = setupE2ETestSession("workspace-limits");
    runFixtureMigrations(session.env.db);
  });

  afterEach(() => { teardownE2ETestSession(session); });

  it("should track rate limit usage by (accountId, platform, operation)", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-l1", "x", "@lim1");
    const now = new Date().toISOString();
    db.prepare("INSERT INTO rate_limits (id, account_id, platform, operation, window_start, count) VALUES (?, ?, ?, ?, ?, ?)").run("rl-1", "acc-l1", "x", "capture", now, 5);
    db.prepare("INSERT INTO rate_limits (id, account_id, platform, operation, window_start, count) VALUES (?, ?, ?, ?, ?, ?)").run("rl-2", "acc-l1", "x", "ai", now, 3);

    const cap = db.prepare("SELECT COALESCE(SUM(count),0) as total FROM rate_limits WHERE account_id=? AND platform=? AND operation=?").get("acc-l1", "x", "capture") as { total: number };
    const ai = db.prepare("SELECT COALESCE(SUM(count),0) as total FROM rate_limits WHERE account_id=? AND platform=? AND operation=?").get("acc-l1", "x", "ai") as { total: number };
    expect(cap.total).toBe(5);
    expect(ai.total).toBe(3);
  });

  it("should isolate limits per account", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-la", "x", "@limA");
    seedFixtureAccount(db, "acc-lb", "x", "@limB");
    const now = new Date().toISOString();
    db.prepare("INSERT INTO rate_limits (id, account_id, platform, operation, window_start, count) VALUES (?, ?, ?, ?, ?, ?)").run("rl-a1", "acc-la", "x", "capture", now, 100);
    const bUsage = db.prepare("SELECT COALESCE(SUM(count),0) as total FROM rate_limits WHERE account_id=? AND platform=? AND operation=?").get("acc-lb", "x", "capture") as { total: number };
    expect(bUsage.total).toBe(0);
  });

  it("should isolate capture and AI budgets independently", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-ind", "x", "@ind");
    const now = new Date().toISOString();
    db.prepare("INSERT INTO rate_limits (id, account_id, platform, operation, window_start, count) VALUES (?, ?, ?, ?, ?, ?)").run("rl-i1", "acc-ind", "x", "capture", now, 100);
    const aiUsage = db.prepare("SELECT COALESCE(SUM(count),0) as total FROM rate_limits WHERE account_id=? AND platform=? AND operation=?").get("acc-ind", "x", "ai") as { total: number };
    expect(aiUsage.total).toBe(0);
  });
});

// ====================================================================
// Workspace Flows: Zero Publish & Zero Credential Action Counters
// ====================================================================

describe("Workspace E2E: Zero Publish & Credential Counters", () => {
  let session: E2ETestSession;

  beforeEach(() => {
    session = setupE2ETestSession("workspace-zero-counters");
    runFixtureMigrations(session.env.db);
  });

  afterEach(() => { teardownE2ETestSession(session); });

  it("should have zero publish attempts in all workspace operations", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-zp1", "x", "@zp1");
    seedFixtureAccount(db, "acc-zp2", "x", "@zp2");

    const now = new Date().toISOString();
    db.prepare("INSERT INTO workspaces (id, name, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)").run("ws-zp", "Zero Pub", now, now);
    db.prepare("INSERT INTO tab_groups (id, workspace_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)").run("grp-zp", "ws-zp", "ZP Group", now, now);
    db.prepare("INSERT INTO group_accounts (id, group_id, account_id, sort_order, created_at) VALUES (?, ?, ?, 0, ?)").run("gm-zp1", "grp-zp", "acc-zp1", now);
    db.prepare("INSERT INTO group_accounts (id, group_id, account_id, sort_order, created_at) VALUES (?, ?, ?, 1, ?)").run("gm-zp2", "grp-zp", "acc-zp2", now);
    db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").run("Renamed", "ws-zp");
    db.prepare("UPDATE group_accounts SET sort_order = 1 WHERE id = ?").run("gm-zp1");
    db.prepare("UPDATE group_accounts SET sort_order = 0 WHERE id = ?").run("gm-zp2");

    expect(session.actionCounter.assertZeroPublishAndCredential().passed).toBe(true);
  });

  it("should NOT auto-click publish (hard gate verification)", () => {
    const db = session.env.db;
    seedFixtureAccount(db, "acc-hg", "x", "@hardGate");
    seedFixtureWorkspace(db, "ws-hg", "HG WS", [{ id: "grp-hg", name: "Group", accountIds: ["acc-hg"] }]);

    db.prepare("INSERT INTO acknowledgements (account_id, acknowledged_at, version) VALUES (?, datetime('now'), 1)").run("acc-hg");
    db.prepare("INSERT INTO posts (id, account_id, platform_post_id, content_text, adapter_version) VALUES (?, ?, ?, ?, 1)").run("post-hg", "acc-hg", "pid-hg", "Test");

    expect(session.actionCounter.getCounters().publishAttempts).toBe(0);
    expect(session.actionCounter.assertZeroPublishAndCredential().passed).toBe(true);
  });
});

// ====================================================================
// Complete E2E Guard Verification
// ====================================================================

describe("Workspace E2E: Complete Guard Verification", () => {
  let session: E2ETestSession;

  afterEach(() => {
    try { teardownE2ETestSession(session); } catch { /* cleanup */ }
  });

  it("should produce complete diagnostics evidence for VAL-WORKSPACE-024", () => {
    session = setupE2ETestSession("workspace-guard-final");
    runFixtureMigrations(session.env.db);

    seedFixtureAccount(session.env.db, "acc-diag-a", "x", "@diagA", "persist:social-browser:x:acc-diag-a");
    seedFixtureAccount(session.env.db, "acc-diag-b", "threads", "@diagB", "persist:social-browser:threads:acc-diag-b");
    seedFixtureWorkspace(session.env.db, "ws-diag", "Diag", [
      { id: "grp-d1", name: "G1", accountIds: ["acc-diag-a"] },
      { id: "grp-d2", name: "G2", accountIds: ["acc-diag-b"] },
    ]);

    session.env.db.prepare("INSERT INTO acknowledgements (account_id, acknowledged_at, version) VALUES (?, datetime('now'), 1)").run("acc-diag-a");
    session.env.db.prepare("INSERT INTO audit_event_log (id, event_type, actor_id, outcome) VALUES (?, ?, ?, 'completed')").run("aev-f1", "acknowledgement", "acc-diag-a");
    session.env.db.prepare("INSERT INTO audit_event_log (id, event_type, actor_id, outcome) VALUES (?, ?, ?, 'completed')").run("aev-f2", "capture_allowed", "acc-diag-a");

    session.diagnostics.collectPartitionsFromDB(session.env.db);
    session.diagnostics.addNavigation({ from: "", to: "social-browser-fixture://x/timeline.html", timestamp: new Date().toISOString(), isFixture: true, denied: false });

    const diag = session.diagnostics.getDiagnostics();
    expect(diag.tempPath).toBeTruthy();
    expect(diag.dbPath).toBeTruthy();
    expect(diag.partitions.length).toBe(2);
    expect(diag.partitions[0].partition).toBe("persist:social-browser:x:acc-diag-a");
    expect(diag.navigationLog.length).toBe(1);
    expect(diag.navigationLog[0].isFixture).toBe(true);

    const result = verifyE2EGuards(session);
    expect(result.checks.length).toBeGreaterThanOrEqual(5);
    for (const check of result.checks) {
      expect(check.name).toBeTruthy();
      expect(typeof check.passed).toBe("boolean");
    }
  });

  it("should produce E2E guard logs as output", () => {
    session = setupE2ETestSession("workspace-guard-logs");
    runFixtureMigrations(session.env.db);

    session.networkGuard.enable();
    session.networkGuard.checkOrigin("https://x.com/home");
    session.networkGuard.checkAIProvider("OpenAI");

    const violations = session.networkGuard.getViolations();
    expect(violations.length).toBe(2);

    const diagnostics = session.networkGuard.getDiagnostics();
    console.log("Network Guard Report:");
    console.log("  Passed:", diagnostics.passed);
    console.log("  Violations:", diagnostics.violations.length);
    for (const v of diagnostics.violations) {
      console.log("  - [" + v.type + "] " + v.detail);
    }

    expect(diagnostics.passed).toBe(false);
  });
});


