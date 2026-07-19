import Database from 'better-sqlite3';
import { runMigrations } from './migrations';

export interface DatabaseOptions {
  /** Path to the SQLite database file. Use ':memory:' for testing. */
  dbPath: string;
  /** Whether to enable WAL mode (default: true). Ignored for :memory: databases. */
  walMode?: boolean;
  /** Whether to run pending migrations on open (default: true). */
  runMigrations?: boolean;
  /** Path to the sqlite-vec extension library (optional). */
  vecExtensionPath?: string;
}

/**
 * DatabaseManager manages a single better-sqlite3 connection.
 * Designed to be used EXCLUSIVELY in a worker thread.
 *
 * Responsibilities:
 * - Open/create a SQLite database file
 * - Enable WAL mode
 * - Load the sqlite-vec extension
 * - Run pending schema migrations
 * - Provide access to the underlying database instance
 * - Close the database connection cleanly
 */
export class DatabaseManager {
  private db: Database.Database | null = null;
  private readonly opts: {
    dbPath: string;
    walMode: boolean;
    runMigrations: boolean;
    vecExtensionPath: string | undefined;
  };

  constructor(options: DatabaseOptions) {
    this.opts = {
      dbPath: options.dbPath,
      walMode: options.walMode ?? true,
      runMigrations: options.runMigrations ?? true,
      vecExtensionPath: options.vecExtensionPath,
    };
  }

  /**
   * Open or create the database, enable WAL mode,
   * load sqlite-vec extension, and run pending migrations.
   */
  open(): void {
    if (this.db) {
      throw new Error('Database is already open');
    }

    this.db = new Database(this.opts.dbPath);

    // Enable WAL mode (only meaningful for file-based databases;
    // :memory: databases will report 'memory' as journal mode)
    if (this.opts.walMode && this.opts.dbPath !== ':memory:') {
      const result = this.db.pragma('journal_mode = WAL') as { journal_mode: string }[];
      if (!result || result[0]?.journal_mode !== 'wal') {
        throw new Error('Failed to enable WAL mode');
      }
    }

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Run pending migrations
    if (this.opts.runMigrations) {
      const count = runMigrations(this.db);
      if (count > 0) {
        console.log('[Database] Applied ' + count + ' migration(s)');
      }
    }
  }

  /** Check if the database connection is open. */
  isOpen(): boolean {
    return this.db !== null;
  }

  /** Get the underlying better-sqlite3 Database instance. */
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database is not open. Call open() first.');
    }
    return this.db;
  }

  /** Close the database connection with WAL checkpoint. */
  close(): void {
    if (!this.db) return;

    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Ignore checkpoint errors during close
    }

    this.db.close();
    this.db = null;
  }

  /**
   * Check if a table exists in the database.
   */
  hasTable(tableName: string): boolean {
    const row = this.getDb().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);
    return row !== undefined;
  }

  /**
   * Check the current journal_mode.
   */
  getJournalMode(): string {
    const result = this.getDb().pragma('journal_mode') as { journal_mode: string }[];
    return result[0]?.journal_mode || 'unknown';
  }
}
