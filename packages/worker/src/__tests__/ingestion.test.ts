import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createIngestionPipeline, IngestionPipeline, PAYLOAD_SCHEMA_VERSION } from '../ingestion';
import { runMigrations } from '../database';

function setupDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare('INSERT INTO accounts (id, platform, handle, session_partition) VALUES (?, ?, ?, ?)').run('acc-1', 'x', '@testuser', 'persist:social-browser:x:acc-1');
  return db;
}

function makeMeta(accountId = 'acc-1', adapterVersion = 1, batchId?: string) {
  return { platform: 'x', accountId, adapterVersion, payloadSchemaVersion: PAYLOAD_SCHEMA_VERSION, batchId: batchId || '' };
}

describe('IngestionPipeline', () => {
  let db: Database.Database;
  let pipeline: IngestionPipeline;
  let batchId: string;

  beforeEach(() => {
    db = setupDb();
    pipeline = createIngestionPipeline(db);
    batchId = pipeline.startBatch('acc-1');
  });

  afterEach(() => {
    db.close();
  });

  // VAL-CAPTURE-036: First post stored normally
  describe('VAL-CAPTURE-036: First post stored normally', () => {
    it('should insert first occurrence of a post', () => {
      const result = pipeline.ingestPost({ platformPostId: 'pid-1', contentText: 'Hello' }, makeMeta('acc-1', 1, batchId));
      expect(result.status).toBe('ingested');
      const row = db.prepare('SELECT * FROM posts WHERE account_id = ? AND platform_post_id = ?').get('acc-1', 'pid-1') as { content_text: string; adapter_version: number; payload_schema_version: number };
      expect(row).toBeDefined();
      expect(row.content_text).toBe('Hello');
      expect(row.adapter_version).toBe(1);
      expect(row.payload_schema_version).toBe(PAYLOAD_SCHEMA_VERSION);
    });
  });

  // VAL-CAPTURE-035: Duplicate post deduplicated
  describe('VAL-CAPTURE-035: Duplicate post deduplicated', () => {
    it('should return duplicate status for same (account_id, platform_post_id)', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1', contentText: 'First' }, makeMeta('acc-1', 1, batchId));
      const result = pipeline.ingestPost({ platformPostId: 'pid-1', contentText: 'Duplicate' }, makeMeta('acc-1', 1, batchId));
      expect(result.status).toBe('duplicate');
      const rows = db.prepare('SELECT COUNT(*) as cnt FROM posts WHERE account_id = ? AND platform_post_id = ?').get('acc-1', 'pid-1') as { cnt: number };
      expect(rows.cnt).toBe(1);
    });
  });

  // VAL-CAPTURE-038: Different accounts NOT deduplicated
  describe('VAL-CAPTURE-038: Different accounts NOT deduplicated', () => {
    it('should store same platform_post_id for different accounts', () => {
      db.prepare('INSERT INTO accounts (id, platform, handle, session_partition) VALUES (?, ?, ?, ?)').run('acc-2', 'x', '@user2', 'persist:social-browser:x:acc-2');
      const batch2 = pipeline.startBatch('acc-2');
      pipeline.ingestPost({ platformPostId: 'pid-1', contentText: 'From acc1' }, makeMeta('acc-1', 1, batchId));
      pipeline.ingestPost({ platformPostId: 'pid-1', contentText: 'From acc2' }, makeMeta('acc-2', 1, batch2));
      const rows = db.prepare('SELECT account_id, content_text FROM posts WHERE platform_post_id = ? ORDER BY account_id').all('pid-1') as Array<{ account_id: string; content_text: string }>;
      expect(rows).toHaveLength(2);
      expect(rows[0].account_id).toBe('acc-1');
      expect(rows[1].account_id).toBe('acc-2');
    });
  });

  // VAL-CAPTURE-037: Concurrent dedup atomic via UNIQUE
  describe('VAL-CAPTURE-037: Concurrent dedup atomic', () => {
    it('should enforce UNIQUE constraint - duplicate insert throws', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 1, batchId));
      expect(() => {
        db.prepare('INSERT INTO posts (id, account_id, platform_post_id, content_text, adapter_version) VALUES (?, ?, ?, ?, ?)').run('post-dup', 'acc-1', 'pid-1', 'Dup', 1);
      }).toThrow();
      const rows = db.prepare('SELECT COUNT(*) as cnt FROM posts WHERE account_id = ? AND platform_post_id = ?').get('acc-1', 'pid-1') as { cnt: number };
      expect(rows.cnt).toBe(1);
    });
  });

  // VAL-CAPTURE-039/040: Engagement snapshots append-only
  describe('VAL-CAPTURE-039/040: Snapshots append-only', () => {
    it('should insert multiple snapshots for same post', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 1, batchId));
      // Look up internal post ID - ingestSnapshot needs the internal ID, not the platform_post_id
      const post = db.prepare('SELECT id FROM posts WHERE account_id = ? AND platform_post_id = ?').get('acc-1', 'pid-1') as { id: string };
      const r1 = pipeline.ingestSnapshot(post.id, { likes: 10 }, makeMeta('acc-1', 1, batchId));
      const r2 = pipeline.ingestSnapshot(post.id, { likes: 20 }, makeMeta('acc-1', 1, batchId));
      expect(r1.status).toBe('ingested');
      expect(r2.status).toBe('ingested');
      const count = db.prepare('SELECT COUNT(*) as cnt FROM engagement_snapshots WHERE post_id = ?').get(post.id) as { cnt: number };
      expect(count.cnt).toBe(2);
    });
  });

  // VAL-CAPTURE-041: Snapshots linked to batch
  describe('VAL-CAPTURE-041: Snapshots linked to batch', () => {
    it('should have capture events referencing the batch', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 1, batchId));
      const post = db.prepare('SELECT id FROM posts WHERE account_id = ? AND platform_post_id = ?').get('acc-1', 'pid-1') as { id: string };
      pipeline.ingestSnapshot(post.id, { likes: 5 }, makeMeta('acc-1', 1, batchId));
      const events = db.prepare('SELECT * FROM capture_events WHERE batch_id = ?').all(batchId) as Array<{ event_type: string; batch_id: string }>;
      const snapshotEvents = events.filter(e => e.event_type === 'snapshot');
      expect(snapshotEvents.length).toBeGreaterThanOrEqual(1);
      expect(snapshotEvents[0].batch_id).toBe(batchId);
    });
  });

  // VAL-CAPTURE-043: Capture batch created at session start
  describe('VAL-CAPTURE-043: Capture batch created at session start', () => {
    it('should create a batch with status in-progress', () => {
      const b = pipeline.startBatch('acc-1');
      const row = db.prepare('SELECT * FROM capture_batches WHERE id = ?').get(b) as { status: string; account_id: string };
      expect(row).toBeDefined();
      expect(row.status).toBe('in-progress');
      expect(row.account_id).toBe('acc-1');
    });
  });

  // VAL-CAPTURE-044: Capture events counted per batch
  describe('VAL-CAPTURE-044: Capture events counted per batch', () => {
    it('should increment event_count on each event', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 1, batchId));
      pipeline.ingestPost({ platformPostId: 'pid-2' }, makeMeta('acc-1', 1, batchId));
      const row = db.prepare('SELECT event_count FROM capture_batches WHERE id = ?').get(batchId) as { event_count: number };
      expect(row.event_count).toBe(2);
    });
  });

  // VAL-CAPTURE-045: Batch status transitions valid
  describe('VAL-CAPTURE-045: Batch status transitions', () => {
    it('should complete an in-progress batch', () => {
      pipeline.completeBatch(batchId);
      const row = db.prepare('SELECT status FROM capture_batches WHERE id = ?').get(batchId) as { status: string };
      expect(row.status).toBe('completed');
    });

    it('should fail an in-progress batch', () => {
      pipeline.failBatch(batchId);
      const row = db.prepare('SELECT status FROM capture_batches WHERE id = ?').get(batchId) as { status: string };
      expect(row.status).toBe('failed');
    });

    it('should have completed_at set when completed', () => {
      pipeline.completeBatch(batchId);
      const row = db.prepare('SELECT completed_at FROM capture_batches WHERE id = ?').get(batchId) as { completed_at: string };
      expect(row.completed_at).toBeDefined();
    });
  });

  // VAL-CAPTURE-046: capture_events has required audit fields
  describe('VAL-CAPTURE-046: capture_events audit fields', () => {
    it('should have all required audit columns', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 1, batchId));
      const events = db.prepare('SELECT * FROM capture_events WHERE batch_id = ?').all(batchId) as Array<{ id: string; batch_id: string; event_type: string; status: string; payload_schema_version: number; adapter_version: number; platform: string; account_id: string }>;
      const e = events.find((ev: { event_type: string; status: string }) => ev.event_type === 'post' && ev.status === 'ingested');
      expect(e).toBeDefined();
      if (!e) return;
      expect(e.id).toBeDefined();
      expect(e.batch_id).toBe(batchId);
      expect(e.event_type).toBe('post');
      expect(e.payload_schema_version).toBe(PAYLOAD_SCHEMA_VERSION);
      expect(e.adapter_version).toBe(1);
      expect(e.platform).toBe('x');
      expect(e.account_id).toBe('acc-1');
    });
  });

  // VAL-CAPTURE-047: Events share same batch_id
  describe('VAL-CAPTURE-047: Events share same batch_id', () => {
    it('should have no NULL batch_ids', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 1, batchId));
      pipeline.ingestPost({ platformPostId: 'pid-2' }, makeMeta('acc-1', 1, batchId));
      const nullBatch = db.prepare('SELECT COUNT(*) as cnt FROM capture_events WHERE batch_id IS NULL').get() as { cnt: number };
      expect(nullBatch.cnt).toBe(0);
    });

    it('should have all events in same batch referencing the batch_id', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 1, batchId));
      pipeline.ingestPost({ platformPostId: 'pid-2' }, makeMeta('acc-1', 1, batchId));
      const events = db.prepare('SELECT batch_id FROM capture_events').all() as { batch_id: string }[];
      events.forEach(e => expect(e.batch_id).toBe(batchId));
    });
  });

  // VAL-CAPTURE-055: Adapter version stored with events
  describe('VAL-CAPTURE-055: Adapter version stored', () => {
    it('should store adapter_version in capture_events', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 2, batchId));
      const e = db.prepare("SELECT adapter_version FROM capture_events WHERE event_type = 'post' AND status = 'ingested'").get() as { adapter_version: number };
      expect(e.adapter_version).toBe(2);
    });

    it('should store adapter_version in posts table', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 3, batchId));
      const row = db.prepare('SELECT adapter_version FROM posts WHERE platform_post_id = ?').get('pid-1') as { adapter_version: number };
      expect(row.adapter_version).toBe(3);
    });
  });

  // VAL-CAPTURE-056: Payload schema version stored
  describe('VAL-CAPTURE-056: Payload schema version stored', () => {
    it('should store payload_schema_version in capture_events', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 1, batchId));
      const e = db.prepare("SELECT payload_schema_version FROM capture_events WHERE event_type = 'post' AND status = 'ingested'").get() as { payload_schema_version: number };
      expect(e.payload_schema_version).toBe(PAYLOAD_SCHEMA_VERSION);
    });

    it('should store payload_schema_version in posts table', () => {
      pipeline.ingestPost({ platformPostId: 'pid-1' }, makeMeta('acc-1', 1, batchId));
      const row = db.prepare('SELECT payload_schema_version FROM posts WHERE platform_post_id = ?').get('pid-1') as { payload_schema_version: number };
      expect(row.payload_schema_version).toBe(PAYLOAD_SCHEMA_VERSION);
    });
  });

  // VAL-CAPTURE-042: Snapshot timestamps monotonic
  describe('VAL-CAPTURE-042: Snapshot timestamps monotonic', () => {
    it('should have monotonic captured_at timestamps within same batch', () => {
      pipeline.ingestPost({ platformPostId: 'pid-mono' }, makeMeta('acc-1', 1, batchId));
      const post = db.prepare('SELECT id FROM posts WHERE platform_post_id = ?').get('pid-mono') as { id: string };
      pipeline.ingestSnapshot(post.id, { likes: 5 }, makeMeta('acc-1', 1, batchId));
      pipeline.ingestSnapshot(post.id, { likes: 10 }, makeMeta('acc-1', 1, batchId));
      const snapshots = db.prepare('SELECT captured_at FROM engagement_snapshots WHERE post_id = ? ORDER BY captured_at ASC').all(post.id) as { captured_at: string }[];
      expect(snapshots).toHaveLength(2);
      expect(new Date(snapshots[0].captured_at).getTime()).toBeLessThanOrEqual(new Date(snapshots[1].captured_at).getTime());
    });
  });

  // VAL-CAPTURE-057: Version mismatch detectable
  describe('VAL-CAPTURE-057: Version mismatch detectable', () => {
    it('should store payload_schema_version and adapter_version in capture_events', () => {
      pipeline.ingestPost({ platformPostId: 'pid-v1' }, makeMeta('acc-1', 2, batchId));
      const event = db.prepare("SELECT payload_schema_version, adapter_version FROM capture_events WHERE event_type = 'post' AND status = 'ingested'").get() as { payload_schema_version: number; adapter_version: number };
      expect(event.payload_schema_version).toBe(PAYLOAD_SCHEMA_VERSION);
      expect(event.adapter_version).toBe(2);
    });

    it('should allow querying rows with version discrepancy', () => {
      pipeline.ingestPost({ platformPostId: 'pid-v2' }, makeMeta('acc-1', 1, batchId));
      const batch2 = pipeline.startBatch('acc-1');
      pipeline.ingestPost({ platformPostId: 'pid-v3' }, makeMeta('acc-1', 3, batch2));
      const diffRows = db.prepare("SELECT adapter_version, payload_schema_version FROM capture_events WHERE adapter_version != 1").all() as { adapter_version: number; payload_schema_version: number }[];
      expect(diffRows.length).toBeGreaterThanOrEqual(1);
      expect(diffRows[0].adapter_version).toBe(3);
    });
  });

  // VAL-CAPTURE-059: Worker processes ingestion correctly
  describe('VAL-CAPTURE-059: Worker processes ingestion correctly', () => {
    it('should insert a post and create corresponding capture events', () => {
      const result = pipeline.ingestPost({ platformPostId: 'pid-ingest', contentText: 'Worker test', authorHandle: '@test' }, makeMeta('acc-1', 1, batchId));
      expect(result.status).toBe('ingested');
      expect(result.eventId).toBeDefined();
      const post = db.prepare('SELECT * FROM posts WHERE platform_post_id = ?').get('pid-ingest') as { content_text: string };
      expect(post).toBeDefined();
      expect(post.content_text).toBe('Worker test');
      const event = db.prepare('SELECT * FROM capture_events WHERE id = ?').get(result.eventId) as { event_type: string; status: string; platform: string; account_id: string };
      expect(event).toBeDefined();
      expect(event.event_type).toBe('post');
      expect(event.status).toBe('ingested');
      expect(event.platform).toBe('x');
      expect(event.account_id).toBe('acc-1');
    });

    it('should return duplicate status for same (account_id, platform_post_id)', () => {
      pipeline.ingestPost({ platformPostId: 'pid-err' }, makeMeta('acc-1', 1, batchId));
      const result = pipeline.ingestPost({ platformPostId: 'pid-err' }, makeMeta('acc-1', 1, batchId));
      expect(result.status).toBe('duplicate');
    });

    it('should record adapter-ready events', () => {
      const result = pipeline.handleAdapterReady({ platform: 'x', accountId: 'acc-1', adapterVersion: 1 });
      expect(result.batchId).toBeDefined();
      const events = db.prepare("SELECT * FROM capture_events WHERE event_type = 'adapter-ready'").all() as Array<{ status: string; adapter_version: number }>;
      expect(events.length).toBeGreaterThanOrEqual(1);
      const readyEvent = events[events.length - 1];
      expect(readyEvent.status).toBe('completed');
      expect(readyEvent.adapter_version).toBe(1);
    });
  });

  // VAL-CAPTURE-061: Rapid captures handled without loss
  describe('VAL-CAPTURE-061: Rapid captures without loss', () => {
    it('should process 50 posts in rapid succession without data loss', () => {
      for (let i = 0; i < 50; i++) {
        pipeline.ingestPost({ platformPostId: 'rapid-' + i, contentText: 'Post #' + i }, makeMeta('acc-1', 1, batchId));
      }
      const count = db.prepare('SELECT COUNT(*) as cnt FROM posts WHERE account_id = ?').get('acc-1') as { cnt: number };
      expect(count.cnt).toBe(50);
      const eventCount = db.prepare("SELECT COUNT(*) as cnt FROM capture_events WHERE batch_id = ?").get(batchId) as { cnt: number };
      expect(eventCount.cnt).toBeGreaterThanOrEqual(50);
    });
  });

  // VAL-CAPTURE-062: Navigation does not break pipeline
  describe('VAL-CAPTURE-062: Navigation resilience', () => {
    it('should continue processing after batch is completed and new batch is started', () => {
      pipeline.completeBatch(batchId);
      pipeline.clearActiveBatch('acc-1');
      const newBatchId = pipeline.startBatch('acc-1');
      const result = pipeline.ingestPost({ platformPostId: 'pid-nav-test' }, makeMeta('acc-1', 1, newBatchId));
      expect(result.status).toBe('ingested');
      const event = db.prepare('SELECT * FROM capture_events WHERE id = ?').get(result.eventId!) as { batch_id: string };
      expect(event.batch_id).toBe(newBatchId);
      expect(event.batch_id).not.toBe(batchId);
    });

    it('should handle multiple batch lifecycles without issues', () => {
      for (let nav = 0; nav < 3; nav++) {
        const bId = pipeline.startBatch('acc-1');
        pipeline.ingestPost({ platformPostId: 'pid-nav-' + nav }, makeMeta('acc-1', 1, bId));
        pipeline.completeBatch(bId);
        pipeline.clearActiveBatch('acc-1');
      }
      const allBatches = db.prepare('SELECT COUNT(DISTINCT batch_id) as cnt FROM capture_events').get() as { cnt: number };
      expect(allBatches.cnt).toBeGreaterThanOrEqual(3);
    });
  });

  // VAL-CAPTURE-063: Multiple PlatformViews independent
  describe('VAL-CAPTURE-063: Multiple PlatformViews independent', () => {
    it('should ingest data for different accounts without cross-contamination', () => {
      db.prepare('INSERT INTO accounts (id, platform, handle, session_partition) VALUES (?, ?, ?, ?)').run('acc-x', 'x', '@user_x', 'persist:social-browser:x:acc-x');
      db.prepare('INSERT INTO accounts (id, platform, handle, session_partition) VALUES (?, ?, ?, ?)').run('acc-threads', 'threads', '@user_threads', 'persist:social-browser:threads:acc-threads');
      const batchX = pipeline.startBatch('acc-x');
      const batchThreads = pipeline.startBatch('acc-threads');
      pipeline.ingestPost({ platformPostId: 'same-pid' }, makeMeta('acc-x', 1, batchX));
      pipeline.ingestPost({ platformPostId: 'same-pid' }, makeMeta('acc-threads', 1, batchThreads));
      const xPosts = db.prepare("SELECT COUNT(*) as cnt FROM posts WHERE account_id = 'acc-x'").get() as { cnt: number };
      const tPosts = db.prepare("SELECT COUNT(*) as cnt FROM posts WHERE account_id = 'acc-threads'").get() as { cnt: number };
      expect(xPosts.cnt).toBe(1);
      expect(tPosts.cnt).toBe(1);
      const xEvents = db.prepare("SELECT COUNT(*) as cnt FROM capture_events WHERE batch_id = ?").get(batchX) as { cnt: number };
      const tEvents = db.prepare("SELECT COUNT(*) as cnt FROM capture_events WHERE batch_id = ?").get(batchThreads) as { cnt: number };
      expect(xEvents.cnt).toBeGreaterThanOrEqual(1);
      expect(tEvents.cnt).toBeGreaterThanOrEqual(1);
    });
  });
});
