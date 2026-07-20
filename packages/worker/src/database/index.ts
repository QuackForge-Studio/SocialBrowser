export { DatabaseManager } from './database';
export type { DatabaseOptions } from './database';
export { getVecExtensionPath } from './vec-loading';
export { runMigrations, getAppliedVersions, ALL_MIGRATIONS, migrateLegacyAccounts } from './migrations';
export type { Migration } from './migrations';
export {
  ALL_TABLE_NAMES,
  ALL_TABLE_STATEMENTS,
  CORE_TABLE_STATEMENTS,
  AUDIT_TABLE_STATEMENTS,
  CREATE_SCHEMA_MIGRATIONS,
  CREATE_ACCOUNTS,
  CREATE_POSTS,
  CREATE_ENGAGEMENT_SNAPSHOTS,
  CREATE_COMMENTS,
  CREATE_CONTENT_DRAFTS,
  CREATE_SCORES,
  CREATE_CAPTURE_BATCHES,
  CREATE_CAPTURE_EVENTS,
  CREATE_ADAPTER_VERSIONS,
  CREATE_EMBEDDING_RECORDS,
  CREATE_AI_RUNS,
  CREATE_SETTINGS,
  vecTableName,
  createVecTableSQL,
  SQL_ENABLE_WAL,
  WORKSPACE_TABLE_STATEMENTS,
  CREATE_WORKSPACES,
  CREATE_TAB_GROUPS,
  CREATE_GROUP_ACCOUNTS,
  CREATE_GROUP_TABS,
} from './schema';
export {
  CREATE_AUDIT_EVENT_LOG,
  CREATE_ACKNOWLEDGEMENTS,
  CREATE_RATE_LIMITS,
  COMPLIANCE_TABLE_STATEMENTS,
} from './schema';
