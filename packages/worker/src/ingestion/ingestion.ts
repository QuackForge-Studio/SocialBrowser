/**
 * Ingestion Pipeline
 *
 * Handles validated capture data from the main process and writes it to the database.
 * Responsibilities:
 * - Capture batch lifecycle management (create, complete, fail)
 * - Capture event recording with version tracking
 * - Post ingestion with deduplication (UNIQUE constraint)
 * - Append-only engagement snapshot insertion
 * - Comment ingestion with deduplication
 * - Error handling (failures do not crash the worker)
 */

import type Database from 'better-sqlite3';

export const PAYLOAD_SCHEMA_VERSION = 1;

export interface NormalizedPostPayload {
  platformPostId: string;
  contentText?: string;
  mediaRefs?: string;
  authorHandle?: string;
  publishedAt?: string;
}

export interface SnapshotPayload {
  views?: number;
  likes?: number;
  commentsCount?: number;
  shares?: number;
  otherMetrics?: string;
}

export interface CommentPayload {
  platformCommentId?: string;
  authorHandle?: string;
  text?: string;
}

export interface AdapterReadyPayload {
  platform: string;
  accountId: string;
  adapterVersion: number;
}

export interface ErrorPayload {
  platform: string;
  accountId: string;
  error: string;
}

export interface CaptureMetadata {
  platform: string;
  accountId: string;
  adapterVersion: number;
  payloadSchemaVersion: number;
  batchId: string;
}

export interface CaptureResult {
  status: 'ingested' | 'duplicate' | 'rejected' | 'error';
  eventId?: string;
  reason?: string;
}

export class IngestionPipeline {
  private db: Database.Database;
  private activeBatches: Map<string, string> = new Map();

  constructor(db: Database.Database) {
    this.db = db;
  }

  startBatch(accountId: string): string {
    const batchId = this.generateId();
    this.db.prepare(
      `INSERT INTO capture_batches (id, account_id, started_at, event_count, status)
       VALUES (?, ?, datetime('now'), 0, 'in-progress')`
    ).run(batchId, accountId);
    return batchId;
  }

  completeBatch(batchId: string): void {
    this.db.prepare(
      `UPDATE capture_batches SET status = 'completed', completed_at = datetime('now')
       WHERE id = ? AND status = 'in-progress'`
    ).run(batchId);
  }

  failBatch(batchId: string): void {
    this.db.prepare(
      `UPDATE capture_batches SET status = 'failed', completed_at = datetime('now')
       WHERE id = ? AND status = 'in-progress'`
    ).run(batchId);
  }

  getBatchStatus(batchId: string): string | null {
    const row = this.db.prepare(
      'SELECT status FROM capture_batches WHERE id = ?'
    ).get(batchId) as { status: string } | undefined;
    return row ? row.status : null;
  }

  ensureActiveBatch(accountId: string): string {
    const existing = this.activeBatches.get(accountId);
    if (existing) {
      const status = this.getBatchStatus(existing);
      if (status === 'in-progress') {
        return existing;
      }
    }
    const batchId = this.startBatch(accountId);
    this.activeBatches.set(accountId, batchId);
    return batchId;
  }

  clearActiveBatch(accountId: string): void {
    this.activeBatches.delete(accountId);
  }

  recordEvent(
    batchId: string,
    eventType: string,
    platform: string,
    accountId: string,
    adapterVersion: number,
    payloadSchemaVersion: number,
    status: string,
    rawPayload?: string,
    rejectionReason?: string,
  ): string {
    const eventId = this.generateId();
    this.db.prepare(
      `INSERT INTO capture_events (id, batch_id, event_type, payload_schema_version,
        adapter_version, platform, account_id, raw_payload, status, rejection_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      eventId, batchId, eventType, payloadSchemaVersion,
      adapterVersion, platform, accountId,
      rawPayload || null, status, rejectionReason || null,
    );

    this.db.prepare(
      'UPDATE capture_batches SET event_count = event_count + 1 WHERE id = ?'
    ).run(batchId);
    return eventId;
  }

  ingestPost(
    data: NormalizedPostPayload,
    meta: CaptureMetadata,
  ): CaptureResult {
    const { platform, accountId, adapterVersion, payloadSchemaVersion, batchId } = meta;
    const { platformPostId, contentText, mediaRefs, authorHandle, publishedAt } = data;

    const existing = this.db.prepare('SELECT id FROM posts WHERE account_id = ? AND platform_post_id = ?').get(accountId, platformPostId) as { id: string } | undefined;

    if (existing) {
      const eventId = this.recordEvent(batchId, 'post', platform, accountId, adapterVersion, payloadSchemaVersion, 'duplicate', JSON.stringify(data), 'Duplicate post: already captured');
      return { status: 'duplicate', eventId };
    }

    const postId = this.generateId();
    try {
    this.db.prepare(
      `INSERT INTO posts (id, account_id, platform_post_id, content_text, media_refs,
        payload_schema_version, adapter_version, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(postId, accountId, platformPostId, contentText || null, mediaRefs || null, payloadSchemaVersion, adapterVersion, publishedAt || null);

      const eventId = this.recordEvent(batchId, 'post', platform, accountId, adapterVersion, payloadSchemaVersion, 'ingested', JSON.stringify(data));
      return { status: 'ingested', eventId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.recordEvent(batchId, 'post', platform, accountId, adapterVersion, payloadSchemaVersion, 'error', JSON.stringify(data), errorMsg);
      return { status: 'error', reason: errorMsg };
    }
  }

  ingestSnapshot(
    postId: string,
    data: SnapshotPayload,
    meta: CaptureMetadata,
  ): CaptureResult {
    const { platform, accountId, adapterVersion, payloadSchemaVersion, batchId } = meta;
    const { views, likes, commentsCount, shares, otherMetrics } = data;
    try {
      const snapshotId = this.generateId();
    this.db.prepare(
      `INSERT INTO engagement_snapshots (id, post_id, views, likes, comments_count, shares, other_metrics)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(snapshotId, postId, views ?? null, likes ?? null, commentsCount ?? null, shares ?? null, otherMetrics ?? null);

      const eventId = this.recordEvent(batchId, 'snapshot', platform, accountId, adapterVersion, payloadSchemaVersion, 'ingested', JSON.stringify({ postId, snapshot: data }));
      return { status: 'ingested', eventId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.recordEvent(batchId, 'snapshot', platform, accountId, adapterVersion, payloadSchemaVersion, 'error', JSON.stringify({ postId, snapshot: data }), errorMsg);
      return { status: 'error', reason: errorMsg };
    }
  }

  ingestComment(
    postId: string,
    data: CommentPayload,
    meta: CaptureMetadata,
  ): CaptureResult {
    const { platform, accountId, adapterVersion, payloadSchemaVersion, batchId } = meta;
    const { platformCommentId, authorHandle, text } = data;
    if (platformCommentId) {
      const existing = this.db.prepare('SELECT id FROM comments WHERE post_id = ? AND platform_comment_id = ?').get(postId, platformCommentId) as { id: string } | undefined;
      if (existing) {
        const eventId = this.recordEvent(batchId, 'comment', platform, accountId, adapterVersion, payloadSchemaVersion, 'duplicate', JSON.stringify({ postId, comment: data }), 'Duplicate comment: already captured');
        return { status: 'duplicate', eventId };
      }
    }
    try {
      const commentId = this.generateId();
    this.db.prepare(
      `INSERT INTO comments (id, post_id, platform_comment_id, author_handle, text)
       VALUES (?, ?, ?, ?, ?)`
    ).run(commentId, postId, platformCommentId || null, authorHandle || null, text || null);

      const eventId = this.recordEvent(batchId, 'comment', platform, accountId, adapterVersion, payloadSchemaVersion, 'ingested', JSON.stringify({ postId, comment: data }));
      return { status: 'ingested', eventId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.recordEvent(batchId, 'comment', platform, accountId, adapterVersion, payloadSchemaVersion, 'error', JSON.stringify({ postId, comment: data }), errorMsg);
      return { status: 'error', reason: errorMsg };
    }
  }

  handleAdapterReady(data: AdapterReadyPayload): { batchId: string } {
    const { platform, accountId, adapterVersion } = data;
    this.clearActiveBatch(accountId);
    const batchId = this.ensureActiveBatch(accountId);
    this.recordEvent(batchId, 'adapter-ready', platform, accountId, adapterVersion, PAYLOAD_SCHEMA_VERSION, 'completed', JSON.stringify(data));
    return { batchId };
  }

  handleError(data: ErrorPayload, batchId: string): void {
    const { platform, accountId, error } = data;
    this.recordEvent(batchId, 'error', platform, accountId, 0, PAYLOAD_SCHEMA_VERSION, 'rejected', JSON.stringify(data), error);
  }

  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return timestamp + '-' + random;
  }
}

export function createIngestionPipeline(db: Database.Database): IngestionPipeline {
  return new IngestionPipeline(db);
}