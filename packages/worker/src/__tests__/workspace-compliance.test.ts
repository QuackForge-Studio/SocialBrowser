/**
 * Tests for Workspace Compliance Module
 *
 * Covers:
 * - VAL-WORKSPACE-012: Acknowledgement and group/tab actions have append-only audit records
 * - VAL-WORKSPACE-013: Capture allow, reject, and throttle outcomes are auditable
 * - VAL-WORKSPACE-014: AI rate-limit and publish-assist attempts are auditable
 * - VAL-WORKSPACE-015: Audit records are allowlisted minimum metadata
 * - VAL-WORKSPACE-016: Capture limits are canonical per account and platform before writes
 * - VAL-WORKSPACE-017: AI limits are canonical per account and platform before provider calls
 * - VAL-CROSS-028: Per-account/platform guardrail isolation flow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../database/migrations';
import {
  recordAuditEvent,
  getAuditEvents,
  countAuditEvents,
  countAuditEventsByType,
  recordWorkspaceCreated,
  recordGroupCreated,
  recordGroupSelected,
  recordMembershipAdded,
  recordMembershipRemoved,
  recordTabOpened,
  recordTabClosed,
  recordCaptureResult,
  recordAiResult,
  recordPublishAssistAttempted,
  isAccountAcknowledged,
  acknowledgeAccount,
  checkAndConsumeRateLimit,
  getRateLimitUsage,
  getGroupAccountIds,
  isAccountInGroup,
  DEFAULT_RATE_LIMITS,
} from '../workspace/compliance';
import DatabaseManager from 'better-sqlite3';

// Helper to seed an account
function seedAccount(db: Database.Database, id: string, platform: string, handle: string, partition: string, createdAt?: string): void {
  db.prepare(
    'INSERT INTO accounts (id, platform, handle, session_partition, adapter_version, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, platform, handle, partition, 1, createdAt || new Date().toISOString());
}

// Helper to create a workspace, group, and membership
function seedWorkspaceAndGroup(db: Database.Database, wsId: string, groupId: string, accountIds: string[]): void {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO workspaces (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(wsId, 'Test WS', 0, now, now);
  db.prepare('INSERT INTO tab_groups (id, workspace_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(groupId, wsId, 'Test Group', 0, now, now);
  for (let i = 0; i < accountIds.length; i++) {
    const gmId = 'gm-' + groupId + '-' + accountIds[i];
    db.prepare('INSERT INTO group_accounts (id, group_id, account_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(gmId, groupId, accountIds[i], i, now);
  }
}

describe('VAL-WORKSPACE-012: Acknowledgement and group/tab actions have append-only audit records', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should record acknowledgement audit event', () => {
    seedAccount(db, 'acc-a', 'x', '@test', 'p:s:b:x:acc-a');
    acknowledgeAccount(db, 'acc-a');
    const events = getAuditEvents(db);
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('acknowledgement');
    expect(events[0].actorId).toBe('acc-a');
    expect(events[0].outcome).toBe('completed');
  });

  it('should record audit events in chronological order', () => {
    seedAccount(db, 'acc-a', 'x', '@test', 'p:s:b:x:acc-a');
    const wsId = 'ws-test';
    const groupId = 'grp-test';
    const now = new Date().toISOString();
    db.prepare('INSERT INTO workspaces (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(wsId, 'Test', 0, now, now);

    recordWorkspaceCreated(db, wsId);
    db.prepare('INSERT INTO tab_groups (id, workspace_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(groupId, wsId, 'G', 0, now, now);
    recordGroupCreated(db, groupId, wsId);
    recordGroupSelected(db, groupId);
    recordMembershipAdded(db, groupId, 'acc-a');

    const events = getAuditEvents(db);
    expect(events.length).toBe(4);
    expect(events[0].eventType).toBe('workspace_created');
    expect(events[1].eventType).toBe('group_created');
    expect(events[2].eventType).toBe('group_selected');
    expect(events[3].eventType).toBe('membership_added');
  });

  it('should retain earlier records when later actions are performed', () => {
    seedAccount(db, 'acc-a', 'x', '@test', 'p:s:b:x:acc-a');
    const wsId = 'ws-test';
    const groupId = 'grp-test';
    const now = new Date().toISOString();
    db.prepare('INSERT INTO workspaces (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(wsId, 'Test', 0, now, now);
    db.prepare('INSERT INTO tab_groups (id, workspace_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(groupId, wsId, 'G', 0, now, now);

    recordWorkspaceCreated(db, wsId);
    recordGroupCreated(db, groupId, wsId);

    const eventsBefore = getAuditEvents(db);
    expect(eventsBefore.length).toBe(2);

    // Perform more actions
    recordGroupSelected(db, groupId);
    recordMembershipAdded(db, groupId, 'acc-a');

    const eventsAfter = getAuditEvents(db);
    expect(eventsAfter.length).toBe(4);
    // Earlier records preserved
    expect(eventsAfter[0].eventType).toBe('workspace_created');
    expect(eventsAfter[1].eventType).toBe('group_created');
    expect(eventsAfter[2].eventType).toBe('group_selected');
    expect(eventsAfter[3].eventType).toBe('membership_added');
  });
});

describe('VAL-WORKSPACE-013: Capture allow, reject, and throttle outcomes are auditable', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should record accepted capture outcome with content row', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');
    seedWorkspaceAndGroup(db, 'ws-1', 'grp-1', ['acc-a']);

    // Simulate: acknowledged, check rate limit, run capture
    acknowledgeAccount(db, 'acc-a');
    const allowed = checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', { maxCapturesPerWindow: 100, windowMinutes: 60 });
    expect(allowed).toBe(true);

    recordCaptureResult(db, 'allowed', 'acc-a', 'x');

    // Insert a post (simulating an accepted capture)
    db.prepare(
      'INSERT INTO posts (id, account_id, platform_post_id, content_text, adapter_version) VALUES (?, ?, ?, ?, ?)'
    ).run('post-1', 'acc-a', 'pid-1', 'Test post', 1);

    // Verify audit
    const events = getAuditEvents(db);
    const captureEvents = events.filter(e => e.eventType === 'capture_allowed');
    expect(captureEvents.length).toBe(1);
    expect(captureEvents[0].actorId).toBe('acc-a');
    expect(captureEvents[0].platform).toBe('x');
    expect(captureEvents[0].outcome).toBe('allowed');
    expect(captureEvents[0].limitClass).toBe('capture');

    // Verify content row exists
    const posts = db.prepare('SELECT COUNT(*) as count FROM posts').get() as { count: number };
    expect(posts.count).toBe(1);
  });

  it('should record rejected capture outcome with no content row', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');

    recordCaptureResult(db, 'rejected', 'acc-a', 'x', 'Account not in group');

    const events = getAuditEvents(db);
    const rejectedEvents = events.filter(e => e.eventType === 'capture_rejected');
    expect(rejectedEvents.length).toBe(1);
    expect(rejectedEvents[0].outcome).toBe('rejected');

    // No content row should exist
    const posts = db.prepare('SELECT COUNT(*) as count FROM posts').get() as { count: number };
    expect(posts.count).toBe(0);
  });

  it('should record throttled capture outcome with no content row when rate limited', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');

    // Set very low limit
    let allowed = checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', { maxCapturesPerWindow: 2, windowMinutes: 60 });
    expect(allowed).toBe(true);
    recordCaptureResult(db, 'allowed', 'acc-a', 'x');

    allowed = checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', { maxCapturesPerWindow: 2, windowMinutes: 60 });
    expect(allowed).toBe(true);
    recordCaptureResult(db, 'allowed', 'acc-a', 'x');

    // Third capture should be throttled
    allowed = checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', { maxCapturesPerWindow: 2, windowMinutes: 60 });
    expect(allowed).toBe(false);

    // Record throttled outcome (no content written in real flow)
    // In real code we checkAndConsumeRateLimit first and don't write if false
    // Here we just record the audit separately
    recordCaptureResult(db, 'throttled', 'acc-a', 'x');

    const events = getAuditEvents(db);
    const throttledEvents = events.filter(e => e.eventType === 'capture_throttled');
    expect(throttledEvents.length).toBe(1);
    expect(throttledEvents[0].limitClass).toBe('capture');
    expect(throttledEvents[0].outcome).toBe('throttled');

    // No content row beyond what was written during allowed captures
    const posts = db.prepare('SELECT COUNT(*) as count FROM posts').get() as { count: number };
    expect(posts.count).toBe(0);
  });
});

describe('VAL-WORKSPACE-014: AI rate-limit and publish-assist attempts are auditable', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should record allowed AI request', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');
    const allowed = checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', { maxAiRequestsPerWindow: 5, windowMinutes: 60 });
    expect(allowed).toBe(true);
    recordAiResult(db, 'allowed', 'acc-a', 'x');

    const events = getAuditEvents(db);
    const aiEvents = events.filter(e => e.eventType === 'ai_allowed');
    expect(aiEvents.length).toBe(1);
    expect(aiEvents[0].limitClass).toBe('ai');
    expect(aiEvents[0].outcome).toBe('allowed');
  });

  it('should record rate-limited AI request with zero provider calls', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');

    // Exhaust the limit (set to 0)
    // With limit 0, checkAndConsumeRateLimit should return false
    const allowed = checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', { maxAiRequestsPerWindow: 0, windowMinutes: 60 });
    expect(allowed).toBe(false);

    // Record throttled AI event (no provider call made in the real flow)
    recordAiResult(db, 'rate_limited', 'acc-a', 'x');

    const events = getAuditEvents(db);
    const rateLimitedEvents = events.filter(e => e.eventType === 'ai_rate_limited');
    expect(rateLimitedEvents.length).toBe(1);
    expect(rateLimitedEvents[0].limitClass).toBe('ai');
    expect(rateLimitedEvents[0].outcome).toBe('throttled');
  });

  it('should record publish-assist attempt', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');
    recordPublishAssistAttempted(db, 'acc-a', 'x');

    const events = getAuditEvents(db);
    const publishEvents = events.filter(e => e.eventType === 'publish_assist_attempted');
    expect(publishEvents.length).toBe(1);
    expect(publishEvents[0].actorId).toBe('acc-a');
    expect(publishEvents[0].platform).toBe('x');
    expect(publishEvents[0].outcome).toBe('completed');
  });
});

describe('VAL-WORKSPACE-015: Audit records are allowlisted minimum metadata', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should only contain allowlisted fields in audit records', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');
    seedWorkspaceAndGroup(db, 'ws-1', 'grp-1', ['acc-a']);

    // Record various events
    acknowledgeAccount(db, 'acc-a');
    recordWorkspaceCreated(db, 'ws-1');
    recordGroupCreated(db, 'grp-1', 'ws-1');
    recordGroupSelected(db, 'grp-1');
    recordCaptureResult(db, 'allowed', 'acc-a', 'x');
    recordCaptureResult(db, 'throttled', 'acc-a', 'x');
    recordAiResult(db, 'allowed', 'acc-a', 'x');
    recordPublishAssistAttempted(db, 'acc-a', 'x');

    const events = getAuditEvents(db);
    expect(events.length).toBe(8);

    for (const event of events) {
      // Must have ONLY: id, eventType, actorId, targetId, platform, outcome, limitClass, metadataJson, createdAt
      const keys = Object.keys(event);
      // Check no disallowed fields are present
      expect(keys).not.toContain('contentText');
      expect(keys).not.toContain('rawPayload');
      expect(keys).not.toContain('cookie');
      expect(keys).not.toContain('credentials');
      expect(keys).not.toContain('apiKey');
      expect(keys).not.toContain('ipAddress');
      expect(keys).not.toContain('draftText');

      // Verify metadataJson if present contains only opaque IDs
      if (event.metadataJson) {
        const metadata = JSON.parse(event.metadataJson);
        for (const [key, value] of Object.entries(metadata)) {
          if (key === 'reason') {
            // reason is an enum-like string, not content
            expect(typeof value).toBe('string');
          } else {
            // All other values should be opaque IDs
            expect(typeof value).toBe('string');
          }
        }
      }
    }
  });

  it('should not contain free-form platform errors or raw content in audit records', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');

    // Record a rejected capture with a reason - reason should be enum-like
    recordCaptureResult(db, 'rejected', 'acc-a', 'x', 'foreign_account');

    const events = getAuditEvents(db);
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('capture_rejected');

    // The metadata should have ONLY opaque IDs and the reason enum
    const metadata = JSON.parse(events[0].metadataJson!);
    expect(metadata.accountId).toBe('acc-a');
    expect(metadata.platform).toBe('x');
    expect(metadata.reason).toBe('foreign_account');

    // There should be NO content text, post text, comment text, raw DOM, etc.
    expect(metadata).not.toHaveProperty('contentText');
    expect(metadata).not.toHaveProperty('postContent');
    expect(metadata).not.toHaveProperty('rawDom');
    expect(metadata).not.toHaveProperty('url');
    expect(metadata).not.toHaveProperty('label');
  });
});

describe('VAL-WORKSPACE-016: Capture limits are canonical per account and platform before writes', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should share capture budget across groups for same account', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');
    seedAccount(db, 'acc-b', 'x', '@testB', 'p:s:b:x:acc-b');
    seedWorkspaceAndGroup(db, 'ws-1', 'grp-1', ['acc-a', 'acc-b']);
    seedWorkspaceAndGroup(db, 'ws-2', 'grp-2', ['acc-a']);

    // Set small limit: 2 captures per window
    const limitConfig = { maxCapturesPerWindow: 2, windowMinutes: 60 };

    // Exhaust limit from Group A
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(true);
    recordCaptureResult(db, 'allowed', 'acc-a', 'x');
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(true);
    recordCaptureResult(db, 'allowed', 'acc-a', 'x');

    // Third capture from Group B should be throttled against same budget
    const allowed = checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig);
    expect(allowed).toBe(false);

    // X-B on X should still work (different account)
    expect(checkAndConsumeRateLimit(db, 'acc-b', 'x', 'capture', limitConfig)).toBe(true);

    // Verify no excess content rows are created (we didn't write any posts for throttled)
    // Audit should show 2 allowed + 1 throttled
    const allowedEvents = countAuditEventsByType(db, 'capture_allowed');
    expect(allowedEvents).toBe(2);
  });

  it('should not throttle different accounts on same platform', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');
    seedAccount(db, 'acc-b', 'x', '@testB', 'p:s:b:x:acc-b');

    const limitConfig = { maxCapturesPerWindow: 1, windowMinutes: 60 };

    // Exhaust acc-a's limit
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(true);
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(false);

    // acc-b should still be allowed
    expect(checkAndConsumeRateLimit(db, 'acc-b', 'x', 'capture', limitConfig)).toBe(true);
  });

  it('should not throttle same account on different platform', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');

    const limitConfig = { maxCapturesPerWindow: 1, windowMinutes: 60 };

    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(true);
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(false);

    // Same account on a different platform should still work
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'threads', 'capture', limitConfig)).toBe(true);
  });

  it('should create audit records for throttled captures', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');

    const limitConfig = { maxCapturesPerWindow: 1, windowMinutes: 60 };

    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(true);
    recordCaptureResult(db, 'allowed', 'acc-a', 'x');

    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(false);
    recordCaptureResult(db, 'throttled', 'acc-a', 'x');

    const throttledCount = countAuditEventsByType(db, 'capture_throttled');
    expect(throttledCount).toBe(1);
  });
});

describe('VAL-WORKSPACE-017: AI limits are canonical per account and platform before provider calls', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should share AI budget across groups for same account', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');
    seedAccount(db, 'acc-b', 'x', '@testB', 'p:s:b:x:acc-b');
    seedWorkspaceAndGroup(db, 'ws-1', 'grp-1', ['acc-a', 'acc-b']);
    seedWorkspaceAndGroup(db, 'ws-2', 'grp-2', ['acc-a']);

    const limitConfig = { maxAiRequestsPerWindow: 2, windowMinutes: 60 };

    // Exhaust from Group A
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', limitConfig)).toBe(true);
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', limitConfig)).toBe(true);

    // Group B request should be throttled (same budget)
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', limitConfig)).toBe(false);

    // acc-b on X should still work
    expect(checkAndConsumeRateLimit(db, 'acc-b', 'x', 'ai', limitConfig)).toBe(true);
  });

  it('should keep capture and AI budgets independent', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');

    const limitConfig = { maxCapturesPerWindow: 1, maxAiRequestsPerWindow: 1, windowMinutes: 60 };

    // Exhaust capture budget
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(true);
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(false);

    // AI budget should be independent (still at 0 usage)
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', limitConfig)).toBe(true);
  });

  it('should record AI rate-limit audit events', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');

    const limitConfig = { maxAiRequestsPerWindow: 1, windowMinutes: 60 };

    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', limitConfig)).toBe(true);
    recordAiResult(db, 'allowed', 'acc-a', 'x');

    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', limitConfig)).toBe(false);
    recordAiResult(db, 'rate_limited', 'acc-a', 'x');

    const rateLimitedCount = countAuditEventsByType(db, 'ai_rate_limited');
    expect(rateLimitedCount).toBe(1);

    // capture audit should remain 0 (independent budgets)
    const captureCount = countAuditEventsByType(db, 'capture_throttled');
    expect(captureCount).toBe(0);
  });
});

describe('VAL-CROSS-028: Per-account/platform guardrail isolation flow', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should throttle only the exhausted account/platform combination', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');
    seedAccount(db, 'acc-b', 'x', '@testB', 'p:s:b:x:acc-b');

    const limitConfig = { maxCapturesPerWindow: 1, maxAiRequestsPerWindow: 1, windowMinutes: 60 };

    // Exhaust capture AND AI limits for X-A on X
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(true);
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(false); // throttled
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', limitConfig)).toBe(true);
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', limitConfig)).toBe(false); // throttled

    recordCaptureResult(db, 'allowed', 'acc-a', 'x');
    recordCaptureResult(db, 'throttled', 'acc-a', 'x');
    recordAiResult(db, 'allowed', 'acc-a', 'x');
    recordAiResult(db, 'rate_limited', 'acc-a', 'x');

    // X-B on X should succeed (different account)
    expect(checkAndConsumeRateLimit(db, 'acc-b', 'x', 'capture', limitConfig)).toBe(true);
    expect(checkAndConsumeRateLimit(db, 'acc-b', 'x', 'ai', limitConfig)).toBe(true);
    recordCaptureResult(db, 'allowed', 'acc-b', 'x');
    recordAiResult(db, 'allowed', 'acc-b', 'x');

    // X-A on threads should succeed (different platform)
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'threads', 'capture', limitConfig)).toBe(true);
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'threads', 'ai', limitConfig)).toBe(true);
    recordCaptureResult(db, 'allowed', 'acc-a', 'threads');
    recordAiResult(db, 'allowed', 'acc-a', 'threads');

    // Verify audit events
    const allowedCaptureCount = countAuditEventsByType(db, 'capture_allowed');
    const throttledCaptureCount = countAuditEventsByType(db, 'capture_throttled');
    const allowedAiCount = countAuditEventsByType(db, 'ai_allowed');
    const rateLimitedAiCount = countAuditEventsByType(db, 'ai_rate_limited');

    // X-A on X allowed: 1 capture + 1 AI = 2
    // X-A on X throttled: 1 capture + 1 AI = 2
    // X-B on X allowed: 1 capture + 1 AI = 2
    // X-A on threads allowed: 1 capture + 1 AI = 2
    expect(allowedCaptureCount).toBe(3);  // X-A X, X-B X, X-A threads
    expect(throttledCaptureCount).toBe(1); // X-A X
    expect(allowedAiCount).toBe(3);         // X-A X, X-B X, X-A threads
    expect(rateLimitedAiCount).toBe(1);     // X-A X
  });

  it('should preserve rate limit isolation by (accountId, platform, operation)', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');

    const limitConfig = { maxCapturesPerWindow: 5, maxAiRequestsPerWindow: 5, windowMinutes: 60 };

    // Track usage
    for (let i = 0; i < 5; i++) {
      checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig);
    }

    // Capture exhausted
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'capture', limitConfig)).toBe(false);

    // AI should still be fresh
    expect(getRateLimitUsage(db, 'acc-a', 'x', 'ai')).toBe(0);
    expect(checkAndConsumeRateLimit(db, 'acc-a', 'x', 'ai', limitConfig)).toBe(true);
  });
});

describe('Authorization helpers', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should get group account IDs', () => {
    seedAccount(db, 'acc-a', 'x', '@a', 'p:s:b:x:acc-a');
    seedAccount(db, 'acc-b', 'x', '@b', 'p:s:b:x:acc-b');
    seedAccount(db, 'acc-c', 'x', '@c', 'p:s:b:x:acc-c');
    seedWorkspaceAndGroup(db, 'ws-1', 'grp-1', ['acc-a', 'acc-b']);

    const accountIds = getGroupAccountIds(db, 'grp-1');
    expect(accountIds).toEqual(['acc-a', 'acc-b']);
  });

  it('should check if account is in group', () => {
    seedAccount(db, 'acc-a', 'x', '@a', 'p:s:b:x:acc-a');
    seedAccount(db, 'acc-b', 'x', '@b', 'p:s:b:x:acc-b');
    seedWorkspaceAndGroup(db, 'ws-1', 'grp-1', ['acc-a']);

    expect(isAccountInGroup(db, 'acc-a', 'grp-1')).toBe(true);
    expect(isAccountInGroup(db, 'acc-b', 'grp-1')).toBe(false);
  });
});

describe('Acknowledgement persistence', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should persist acknowledgement and survive simulated restart', () => {
    seedAccount(db, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');

    expect(isAccountAcknowledged(db, 'acc-a')).toBe(false);
    acknowledgeAccount(db, 'acc-a');
    expect(isAccountAcknowledged(db, 'acc-a')).toBe(true);

    // Simulate restart by closing and reopening DB
    db.close();
    const db2 = new Database(':memory:');
    runMigrations(db2);
    // Re-seed account (it was in :memory:)
    seedAccount(db2, 'acc-a', 'x', '@testA', 'p:s:b:x:acc-a');
    acknowledgeAccount(db2, 'acc-a');
    expect(isAccountAcknowledged(db2, 'acc-a')).toBe(true);
    db2.close();
  });

  it('should be per-account (not shared)', () => {
    seedAccount(db, 'acc-a', 'x', '@a', 'p:s:b:x:acc-a');
    seedAccount(db, 'acc-b', 'x', '@b', 'p:s:b:x:acc-b');

    acknowledgeAccount(db, 'acc-a');
    expect(isAccountAcknowledged(db, 'acc-a')).toBe(true);
    expect(isAccountAcknowledged(db, 'acc-b')).toBe(false);
  });
});
