import type Database from 'better-sqlite3';
import { ALL_TABLE_STATEMENTS, SQL_ENABLE_FOREIGN_KEYS } from './schema';

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
    const tableInfo = db.prepare("PRAGMA table_info('posts')").all() as { name: string }[];
    const hasContentType = tableInfo.some(col => col.name === 'content_type');
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
    const tableInfo = db.prepare("PRAGMA table_info('scores')").all();
    const hasEngagementRaw = tableInfo.some(col => col.name === 'engagement_raw');
    if (!hasEngagementRaw) {
      db.exec("ALTER TABLE scores ADD COLUMN engagement_raw REAL");
    }
  },
};

export const ALL_MIGRATIONS: Migration[] = [
  MIGRATION_001,
  MIGRATION_002,
  MIGRATION_003,
  MIGRATION_004,
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
    // schema_migrations table doesn't exist yet; treat as fresh DB with no migrations applied
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

  // Use exec-based approach for migration tracking since schema_migrations
  // table may not exist yet at statement-prepare time for the first migration.
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

