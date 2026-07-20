/**
 * Compliance Module
 *
 * Worker-owned compliance management:
 * - Append-only audit event logging (payload-minimized)
 * - Account-scoped acknowledgement persistence
 * - Canonical capture/AI rate limiting per (accountId, platform, operation)
 * - Active-group authorization helpers
 *
 * Audit records contain ONLY opaque IDs, action/outcome enums, platform,
 * timestamp, and limit class. No labels, URLs, post/comment/draft text,
 * normalized content, raw DOM, cookie values, credentials, API keys,
 * DMs, IP addresses, or free-form platform errors.
 */

import type Database from 'better-sqlite3';

// ===== Audit Event Types =====

export const AUDIT_EVENT_TYPES = [
  'acknowledgement',
  'workspace_created',
  'workspace_renamed',
  'workspace_deleted',
  'workspace_reordered',
  'group_created',
  'group_renamed',
  'group_deleted',
  'group_selected',
  'group_reordered',
  'membership_added',
  'membership_removed',
  'membership_reordered',
  'tab_opened',
  'tab_closed',
  'tab_reordered',
  'capture_allowed',
  'capture_rejected',
  'capture_throttled',
  'ai_allowed',
  'ai_rate_limited',
  'publish_assist_attempted',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export type AuditOutcome = 'allowed' | 'rejected' | 'throttled' | 'completed';

export type LimitClass = 'capture' | 'ai' | 'acknowledgement';

export interface AuditEventLog {
  id: string;
  event_type: AuditEventType;
  actor_id: string | null;
  target_id: string | null;
  platform: string | null;
  outcome: AuditOutcome | null;
  limit_class: LimitClass | null;
  metadata_json: string | null;
  created_at: string;
}

// ===== Rate Limit Configuration =====

export interface RateLimitConfig {
  maxCapturesPerWindow: number;
  maxAiRequestsPerWindow: number;
  windowMinutes: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  maxCapturesPerWindow: 100,
  maxAiRequestsPerWindow: 20,
  windowMinutes: 60,
};

// ===== Audit Event Recording =====

export function recordAuditEvent(
  db: Database.Database,
  eventType: AuditEventType,
  outcome: AuditOutcome | null,
  opts?: {
    actorId?: string;
    targetId?: string;
    platform?: string;
    limitClass?: LimitClass;
    metadata?: Record<string, unknown>;
  },
): string {
  const id = 'aev-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
  const now = new Date().toISOString();
  const metadataJson = opts?.metadata ? JSON.stringify(opts.metadata) : null;

  db.prepare(
    `INSERT INTO audit_event_log (id, event_type, actor_id, target_id, platform, outcome, limit_class, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    eventType,
    opts?.actorId ?? null,
    opts?.targetId ?? null,
    opts?.platform ?? null,
    outcome,
    opts?.limitClass ?? null,
    metadataJson,
    now,
  );

  return id;
}

export function recordWorkspaceCreated(db: Database.Database, workspaceId: string): void {
  recordAuditEvent(db, 'workspace_created', 'completed', {
    actorId: workspaceId,
    metadata: { workspaceId },
  });
}

export function recordGroupCreated(db: Database.Database, groupId: string, workspaceId: string): void {
  recordAuditEvent(db, 'group_created', 'completed', {
    actorId: groupId,
    targetId: workspaceId,
    metadata: { groupId, workspaceId },
  });
}

export function recordGroupSelected(db: Database.Database, groupId: string): void {
  recordAuditEvent(db, 'group_selected', 'completed', {
    actorId: groupId,
    metadata: { groupId },
  });
}

export function recordMembershipAdded(db: Database.Database, groupId: string, accountId: string): void {
  recordAuditEvent(db, 'membership_added', 'completed', {
    actorId: accountId,
    targetId: groupId,
    metadata: { groupId, accountId },
  });
}

export function recordMembershipRemoved(db: Database.Database, groupId: string, accountId: string): void {
  recordAuditEvent(db, 'membership_removed', 'completed', {
    actorId: accountId,
    targetId: groupId,
    metadata: { groupId, accountId },
  });
}

export function recordTabOpened(db: Database.Database, tabId: string, groupId: string, accountId: string, platform: string): void {
  recordAuditEvent(db, 'tab_opened', 'completed', {
    actorId: tabId,
    targetId: groupId,
    platform,
    metadata: { tabId, groupId, accountId, platform },
  });
}

export function recordTabClosed(db: Database.Database, tabId: string, groupId: string): void {
  recordAuditEvent(db, 'tab_closed', 'completed', {
    actorId: tabId,
    targetId: groupId,
    metadata: { tabId, groupId },
  });
}

export function recordCaptureResult(
  db: Database.Database,
  outcome: 'allowed' | 'rejected' | 'throttled',
  accountId: string,
  platform: string,
  reason?: string,
): void {
  const limitClass: LimitClass = 'capture';
  recordAuditEvent(db, ('capture_' + outcome) as AuditEventType, outcome, {
    actorId: accountId,
    platform,
    limitClass,
    metadata: { accountId, platform, ...(reason ? { reason: reason } : {}) },
  });
}

export function recordAiResult(
  db: Database.Database,
  outcome: 'allowed' | 'rate_limited',
  accountId: string,
  platform: string,
  reason?: string,
): void {
  const eventType: AuditEventType = outcome === 'allowed' ? 'ai_allowed' : 'ai_rate_limited';
  const auditOutcome: AuditOutcome = outcome === 'allowed' ? 'allowed' : 'throttled';
  const limitClass: LimitClass = 'ai';
  recordAuditEvent(db, eventType, auditOutcome, {
    actorId: accountId,
    platform,
    limitClass,
    metadata: { accountId, platform, ...(reason ? { reason: reason } : {}) },
  });
}

export function recordPublishAssistAttempted(db: Database.Database, accountId: string, platform: string): void {
  recordAuditEvent(db, 'publish_assist_attempted', 'completed', {
    actorId: accountId,
    platform,
    metadata: { accountId, platform },
  });
}

// ===== Query Audit Events =====

export function getAuditEvents(
  db: Database.Database,
  opts?: {
    eventType?: AuditEventType;
    actorId?: string;
    limit?: number;
    offset?: number;
  },
): AuditEventLog[] {
  let sql = 'SELECT id, event_type as eventType, actor_id as actorId, target_id as targetId, ' +
    'platform, outcome, limit_class as limitClass, metadata_json as metadataJson, created_at as createdAt ' +
    'FROM audit_event_log';
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.eventType) {
    conditions.push('event_type = ?');
    params.push(opts.eventType);
  }
  if (opts?.actorId) {
    conditions.push('actor_id = ?');
    params.push(opts.actorId);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at ASC';

  const limit = opts?.limit || 1000;
  const offset = opts?.offset || 0;
  sql += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(sql).all(...params) as AuditEventLog[];
}

export function countAuditEvents(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM audit_event_log').get() as { count: number };
  return row.count;
}

export function countAuditEventsByType(db: Database.Database, eventType: AuditEventType): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM audit_event_log WHERE event_type = ?').get(eventType) as { count: number };
  return row.count;
}

// ===== Acknowledgement =====

export function isAccountAcknowledged(db: Database.Database, accountId: string): boolean {
  const row = db.prepare('SELECT account_id FROM acknowledgements WHERE account_id = ?').get(accountId);
  return row !== undefined;
}

export function acknowledgeAccount(db: Database.Database, accountId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR REPLACE INTO acknowledgements (account_id, acknowledged_at, version, created_at) VALUES (?, ?, 1, ?)'
  ).run(accountId, now, now);

  recordAuditEvent(db, 'acknowledgement', 'completed', {
    actorId: accountId,
    limitClass: 'acknowledgement',
    metadata: { accountId },
  });
}

export function countAcknowledgements(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM acknowledgements').get() as { count: number };
  return row.count;
}

// ===== Rate Limiting =====

export function checkAndConsumeRateLimit(
  db: Database.Database,
  accountId: string,
  platform: string,
  operation: 'capture' | 'ai',
  config?: Partial<RateLimitConfig>,
): boolean {
  const cfg: RateLimitConfig = { ...DEFAULT_RATE_LIMITS, ...config };
  const maxRequests = operation === 'capture' ? cfg.maxCapturesPerWindow : cfg.maxAiRequestsPerWindow;
  const windowMinutes = cfg.windowMinutes;

  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000).toISOString();

  const result = db.transaction(() => {
    const row = db.prepare(
      'SELECT COALESCE(SUM(count), 0) as total FROM rate_limits ' +
      'WHERE account_id = ? AND platform = ? AND operation = ? AND window_start >= ?'
    ).get(accountId, platform, operation, windowStart) as { total: number };

    if (row.total >= maxRequests) {
      return false;
    }

    const id = 'rl-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
    db.prepare(
      'INSERT INTO rate_limits (id, account_id, platform, operation, window_start, count) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(id, accountId, platform, operation, now.toISOString());

    return true;
  })();

  return result as boolean;
}

export function getRateLimitUsage(
  db: Database.Database,
  accountId: string,
  platform: string,
  operation: 'capture' | 'ai',
  windowMinutes?: number,
): number {
  const winMinutes = windowMinutes ?? DEFAULT_RATE_LIMITS.windowMinutes;
  const windowStart = new Date(Date.now() - winMinutes * 60 * 1000).toISOString();
  const row = db.prepare(
    'SELECT COALESCE(SUM(count), 0) as total FROM rate_limits ' +
    'WHERE account_id = ? AND platform = ? AND operation = ? AND window_start >= ?'
  ).get(accountId, platform, operation, windowStart) as { total: number };
  return row.total;
}

// ===== Authorization =====

export function getGroupAccountIds(db: Database.Database, groupId: string): string[] {
  const rows = db.prepare(
    'SELECT account_id FROM group_accounts WHERE group_id = ? ORDER BY sort_order'
  ).all(groupId) as { account_id: string }[];
  return rows.map(r => r.account_id);
}

export function isAccountInGroup(db: Database.Database, accountId: string, groupId: string): boolean {
  const row = db.prepare(
    'SELECT id FROM group_accounts WHERE group_id = ? AND account_id = ?'
  ).get(groupId, accountId);
  return row !== undefined;
}

export function isAuthorizedForAction(
  db: Database.Database,
  accountId: string,
  groupId: string,
): boolean {
  return isAccountInGroup(db, accountId, groupId);
}
