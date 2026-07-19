import type Database from 'better-sqlite3';

// ===== SQL Schema Definitions =====

export const SQL_ENABLE_WAL = 'PRAGMA journal_mode = WAL';
export const SQL_ENABLE_FOREIGN_KEYS = 'PRAGMA foreign_keys = ON';

// ---- Migration tracking ----
export const CREATE_SCHEMA_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT NOT NULL
);
`;

// ---- Core tables ----
export const CREATE_ACCOUNTS = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  session_partition TEXT NOT NULL UNIQUE,
  adapter_version INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_POSTS = `
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  platform_post_id TEXT NOT NULL,
  content_text TEXT,
  media_refs TEXT,
  payload_schema_version INTEGER NOT NULL DEFAULT 1,
  adapter_version INTEGER NOT NULL,
  published_at TEXT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, platform_post_id)
);
`;

export const CREATE_ENGAGEMENT_SNAPSHOTS = `
CREATE TABLE IF NOT EXISTS engagement_snapshots (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  views INTEGER,
  likes INTEGER,
  comments_count INTEGER,
  shares INTEGER,
  other_metrics TEXT
);
`;

export const CREATE_COMMENTS = `
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  platform_comment_id TEXT,
  author_handle TEXT,
  text TEXT,
  sentiment_label TEXT,
  sentiment_score REAL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, platform_comment_id)
);
`;

export const CREATE_CONTENT_DRAFTS = `
CREATE TABLE IF NOT EXISTS content_drafts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  generated_text TEXT,
  source_prompt TEXT,
  rag_context_ids TEXT,
  predicted_score REAL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_SCORES = `
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  formula_version INTEGER NOT NULL,
  engagement_score REAL,
  engagement_percentile REAL,
  sentiment_score REAL,
  timing_score REAL,
  composite_score REAL,
  sample_confidence REAL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ---- Audit and Provenance tables ----
export const CREATE_CAPTURE_BATCHES = `
CREATE TABLE IF NOT EXISTS capture_batches (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  event_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in-progress'
);
`;

export const CREATE_CAPTURE_EVENTS = `
CREATE TABLE IF NOT EXISTS capture_events (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES capture_batches(id),
  event_type TEXT NOT NULL,
  payload_schema_version INTEGER NOT NULL,
  adapter_version INTEGER NOT NULL,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  raw_payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_ADAPTER_VERSIONS = `
CREATE TABLE IF NOT EXISTS adapter_versions (
  platform TEXT NOT NULL,
  version INTEGER NOT NULL,
  deployed_at TEXT NOT NULL DEFAULT (datetime('now')),
  changelog TEXT,
  PRIMARY KEY (platform, version)
);
`;

export const CREATE_EMBEDDING_RECORDS = `
CREATE TABLE IF NOT EXISTS embedding_records (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  embedding BLOB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_AI_RUNS = `
CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_template_version INTEGER,
  source_post_ids TEXT,
  latency_ms INTEGER,
  token_count INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  cost_estimate REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_SETTINGS = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ===== All CREATE TABLE statements =====

/**
 * List of all core table creation SQL statements.
 */
export const CORE_TABLE_STATEMENTS: string[] = [
  CREATE_SCHEMA_MIGRATIONS,
  CREATE_ACCOUNTS,
  CREATE_POSTS,
  CREATE_ENGAGEMENT_SNAPSHOTS,
  CREATE_COMMENTS,
  CREATE_CONTENT_DRAFTS,
  CREATE_SCORES,
];

/**
 * List of all audit/provenance table creation SQL statements.
 */
export const AUDIT_TABLE_STATEMENTS: string[] = [
  CREATE_CAPTURE_BATCHES,
  CREATE_CAPTURE_EVENTS,
  CREATE_ADAPTER_VERSIONS,
  CREATE_EMBEDDING_RECORDS,
  CREATE_AI_RUNS,
  CREATE_SETTINGS,
];

/**
 * All 13 table creation statements combined.
 */
export const ALL_TABLE_STATEMENTS: string[] = [
  ...CORE_TABLE_STATEMENTS,
  ...AUDIT_TABLE_STATEMENTS,
];

/**
 * Returns a safe vector table name from provider, model, and dimensions.
 */
export function vecTableName(provider: string, model: string, dimensions: number): string {
  const safeProvider = provider.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const safeModel = model.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return 'vec_' + safeProvider + '_' + safeModel + '_' + dimensions;
}

export function createVecTableSQL(
  provider: string,
  model: string,
  dimensions: number
): string {
  const tableName = vecTableName(provider, model, dimensions);
  return 'CREATE VIRTUAL TABLE IF NOT EXISTS ' + tableName + ' USING vec0(embedding float[' + dimensions + '])';
}

/**
 * List of all table names for verification (13 total).
 * Core (7): schema_migrations, accounts, posts, engagement_snapshots, comments, content_drafts, scores
 * Audit (6): capture_batches, capture_events, adapter_versions, embedding_records, ai_runs, settings
 */
export const ALL_TABLE_NAMES: string[] = [
  'schema_migrations',
  'accounts',
  'posts',
  'engagement_snapshots',
  'comments',
  'content_drafts',
  'scores',
  'capture_batches',
  'capture_events',
  'adapter_versions',
  'embedding_records',
  'ai_runs',
  'settings',
];
