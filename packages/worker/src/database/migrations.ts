import type Database from 'better-sqlite3';
import { ALL_TABLE_STATEMENTS, WORKSPACE_TABLE_STATEMENTS, SQL_ENABLE_FOREIGN_KEYS, COMPLIANCE_TABLE_STATEMENTS } from './schema';

// ===== Migration Types =====

export interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

// ===== Migration Definitions =====

/**
 * Migration 001: Initial schema
 * Creates all 13 core + audit/provenance tables.
 */
export const MIGRATION_001: Migration = {
  version: 1,
  description: 'Initial schema - all 13 core and audit tables',
  up: (db: Database.Database) => {
    db.exec(SQL_ENABLE_FOREIGN_KEYS);
    for (const stmt of ALL_TABLE_STATEMENTS) {
      db.exec(stmt);
    }
  },
};

/**
 * All registered migrations, ordered by version.
 * Add new migrations at the end to preserve version ordering.
 */

/**
 * Migration 002: Add vec_row_id column to embedding_records
 * Enables mapping vec0 row IDs back to content IDs without fragile LIKE patterns.
 */
export const MIGRATION_002: Migration = {
  version: 2,
  description: 'Add vec_row_id column to embedding_records',
  up: (db: Database.Database) => {
    db.exec("ALTER TABLE embedding_records ADD COLUMN vec_row_id INTEGER");
  },
};

/**
 * Migration 003: Add content_type column to posts
 * Enables percentile scoping by content type (text, image, video, link, poll).
 * Also creates the heatmap_cells table for timing score computation.
 */
export const MIGRATION_003: Migration = {
  version: 3,
  description: 'Add content_type to posts, create heatmap_cells table',
  up: (db: Database.Database) => {
    // Add content_type column to posts if it doesn't exist
    const tableInfo = db.prepare("PRAGMA table_info('posts')").all() as Array<{ name: string }>;
    const hasContentType = tableInfo.some((col) => col.name === 'content_type');
    if (!hasContentType) {
      db.exec("ALTER TABLE posts ADD COLUMN content_type TEXT DEFAULT 'text'");
    }

    // Create heatmap_cells table for timing score (needed by scoring engine)
    const heatmapSQL = [
      "CREATE TABLE IF NOT EXISTS heatmap_cells (",
      "  id TEXT PRIMARY KEY,",
      "  account_id TEXT NOT NULL REFERENCES accounts(id),",
      "  content_type TEXT NOT NULL,",
      "  hour_of_day INTEGER NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),",
      "  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),",
      "  avg_engagement_score REAL,",
      "  sample_size INTEGER NOT NULL DEFAULT 0,",
      "  confidence REAL DEFAULT 0,",
      "  updated_at TEXT NOT NULL DEFAULT (datetime('now')),",
      "  UNIQUE(account_id, content_type, hour_of_day, day_of_week)",
      ")",
    ].join('\n');
    db.exec(heatmapSQL);
  },
};


/**
 * Migration 004: Add engagement_raw column to scores table
 * Enables proper percentile computation by comparing raw engagement values
 * rather than already-processed scores.
 */
export const MIGRATION_004: Migration = {
  version: 4,
  description: 'Add engagement_raw column to scores table',
  up: (db) => {
    const tableInfo = db.prepare("PRAGMA table_info('scores')").all() as Array<{ name: string }>;
    const hasEngagementRaw = tableInfo.some((col) => col.name === 'engagement_raw');
    if (!hasEngagementRaw) {
      db.exec("ALTER TABLE scores ADD COLUMN engagement_raw REAL");
    }
  },
};

/**
 * Migration 005: Workspace tables & legacy account data migration
 *
 * Ensures workspace-related tables exist and migrates existing legacy
 * accounts into a default workspace + group.
 *
 * The migration is:
 * - Non-destructive: preserves all account IDs, partitions, content
 * - Deterministic: orders accounts by created_at ASC, id ASC
 * - Idempotent: safe to run multiple times (checks for existing workspaces)
 * - Fresh-DB safe: does nothing if no accounts exist
 */
export const MIGRATION_005: Migration = {
  version: 5,
  description: 'Workspace tables and legacy account data migration',
  up: (db: Database.Database) => {
    // Create workspace tables (idempotent, IF NOT EXISTS)
    for (const stmt of WORKSPACE_TABLE_STATEMENTS) {
      db.exec(stmt);
    }

    // Migrate legacy accounts if there are accounts and no workspaces yet
    migrateLegacyAccounts(db);
  },
};

/**
 * Migrate legacy accounts into a default workspace and ordered group.
 *
 * Scans the accounts table for any accounts that are not yet assigned
 * to a workspace group, then creates a default workspace, a default
 * tab group, and assigns all accounts to that group in deterministic
 * order (created_at ASC, id ASC as tiebreaker).
 *
 * This function is idempotent: if workspaces already exist, it returns
 * immediately without making changes.
 *
 * Postconditions:
 * - A "Default Workspace" and "Default Group" exist (if accounts existed)
 * - All accounts are members of the default group in deterministic order
 * - All existing account IDs, session_partitions, and content preserved
 * - No browser storage or sessions are read, cleared, or modified
 */
export function migrateLegacyAccounts(db: Database.Database): void {
  // Skip if no accounts exist
  const accountCount = db.prepare(
    'SELECT COUNT(*) as count FROM accounts'
  ).get() as { count: number };
  if (accountCount.count === 0) return;

  // Skip if workspaces already exist (idempotency guard)
  const wsCount = db.prepare(
    'SELECT COUNT(*) as count FROM workspaces'
  ).get() as { count: number };
  if (wsCount.count > 0) return;

  const now = new Date().toISOString();

  // Create default workspace at sort_order 0
  const wsId = 'workspace-default';
  db.prepare(
    'INSERT INTO workspaces (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(wsId, 'Default Workspace', 0, now, now);

  // Create default tab group in the default workspace at sort_order 0
  const groupId = 'group-default';
  db.prepare(
    'INSERT INTO tab_groups (id, workspace_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(groupId, wsId, 'Default Group', 0, now, now);

  // Fetch all accounts ordered deterministically: created_at ASC, id ASC
  const accounts = db.prepare(
    'SELECT id FROM accounts ORDER BY created_at ASC, id ASC'
  ).all() as { id: string }[];

  // Insert group-account memberships in a single transaction for atomicity
  const insertStmt = db.prepare(
    'INSERT INTO group_accounts (id, group_id, account_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  const insertAll = db.transaction(() => {
    for (let i = 0; i < accounts.length; i++) {
      const gmId = 'gm-' + accounts[i].id;
      insertStmt.run(gmId, groupId, accounts[i].id, i, now);
    }
  });

  insertAll();
}

/**
 * Migration 006: Compliance tables for audit events, acknowledgements, and rate limits
 *
 * Creates the three compliance tables needed by the workspace policy/audit/limits
 * feature:
 * - audit_event_log: append-only, payload-minimized audit records
 * - acknowledgements: per-account ToS/account-risk acknowledgement persistence
 * - rate_limits: canonical per (accountId, platform, operation) rate limiting
 *
 * These tables support:
 * - VAL-WORKSPACE-012: Append-only audit for acknowledgement and group/tab actions
 * - VAL-WORKSPACE-013: Capture allow/reject/throttle audit outcomes
 * - VAL-WORKSPACE-014: AI rate-limit and publish-assist audit outcomes
 * - VAL-WORKSPACE-015: Allowlisted minimum metadata in audit records
 * - VAL-WORKSPACE-016: Canonical per-account/platform capture limits
 * - VAL-WORKSPACE-017: Canonical per-account/platform AI limits
 * - VAL-CROSS-028: Per-account/platform guardrail isolation
 */
export const MIGRATION_006: Migration = {
  version: 6,
  description: 'Compliance tables for audit events, acknowledgements, and rate limits',
  up: (db: Database.Database) => {
    for (const stmt of COMPLIANCE_TABLE_STATEMENTS) {
      db.exec(stmt);
    }
  },
};
export const ALL_MIGRATIONS: Migration[] = [
  MIGRATION_001,
  MIGRATION_002,
  MIGRATION_003,
  MIGRATION_004,
  MIGRATION_005,
  MIGRATION_006,
];

// ===== Migration Runner =====

/**
 * Get the list of applied migration versions from the database.
 * Returns an empty array if the schema_migrations table doesn't exist yet.
 */
export function getAppliedVersions(db: Database.Database): number[] {
  try {
    const rows = db.prepare(
      'SELECT version FROM schema_migrations ORDER BY version ASC'
    ).all() as { version: number }[];
    return rows.map(r => r.version);
  } catch {
    return [];
  }
}

/**
 * Run all pending migrations on the database.
 * All unapplied migrations are executed in order within a single transaction.
 * Returns the number of migrations that were applied.
 */
export function runMigrations(db: Database.Database): number {
  const appliedVersions = new Set(getAppliedVersions(db));
  const pending = ALL_MIGRATIONS.filter(m => !appliedVersions.has(m.version));

  if (pending.length === 0) {
    return 0;
  }

  const runAll = db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      db.exec(
        "INSERT INTO schema_migrations (version, description) VALUES (" +
        migration.version + ", '" +
        migration.description.replace(/'/g, "''") +
        "')"
      );
    }
  });

  runAll();

  return pending.length;
}