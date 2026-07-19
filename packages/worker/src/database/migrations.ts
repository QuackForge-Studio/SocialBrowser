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
export const ALL_MIGRATIONS: Migration[] = [
  MIGRATION_001,
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
