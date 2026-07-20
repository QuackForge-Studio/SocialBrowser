/**
 * Dashboard Query Handlers
 *
 * Handlers for dashboard IPC requests. These run in the worker thread
 * and query the database for the dashboard UI.
 */

import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { WorkerResponse } from './index';

export type SendFn = (msg: WorkerResponse) => void;

export function getAccounts(db: Database.Database, send: SendFn, msgId: string): void {
  try {
    const rows = db.prepare(
      'SELECT id, platform, handle, display_name as displayName, avatar_url as avatarUrl, ' +
      'session_partition as sessionPartition, adapter_version as adapterVersion, ' +
      'created_at as createdAt, updated_at as updatedAt FROM accounts ORDER BY platform, handle'
    ).all();
    send({ id: msgId, success: true, data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Get accounts error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function getPosts(db: Database.Database, send: SendFn, msgId: string, payload?: any): void {
  try {
    let sql = 'SELECT p.id, p.account_id as accountId, p.platform_post_id as platformPostId, ' +
      'p.content_text as contentText, p.media_refs as mediaRefs, ' +
      'p.payload_schema_version as payloadSchemaVersion, ' +
      'p.adapter_version as adapterVersion, p.published_at as publishedAt, p.captured_at as capturedAt, ' +
      'p.content_type as contentType, a.platform, a.handle as authorHandle, ' +
      's.composite_score as compositeScore, s.engagement_score as engagementScore ' +
      'FROM posts p LEFT JOIN accounts a ON p.account_id = a.id ' +
      'LEFT JOIN scores s ON s.post_id = p.id';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (payload?.accountId) {
      conditions.push('p.account_id = ?');
      params.push(payload.accountId);
    }
    if (payload?.date) {
      conditions.push('date(p.published_at) = date(?)');
      params.push(payload.date);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY p.published_at DESC';

    const limit = payload?.limit || 200;
    const offset = payload?.offset || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params);
    send({ id: msgId, success: true, data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Get posts error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function createDraftHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const draftId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO content_drafts (id, account_id, source_prompt, scheduled_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, '"'"'draft'"'"', ?, ?)'
    ).run(draftId, payload.accountId, payload.sourcePrompt || null, payload.scheduledDate || null, now, now);
    const draft = db.prepare(
      'SELECT id, account_id as accountId, generated_text as generatedText, source_prompt as sourcePrompt, ' +
      'rag_context_ids as ragContextIds, predicted_score as predictedScore, scheduled_date as scheduledDate, ' +
      'published_at as publishedAt, status, created_at as createdAt, updated_at as updatedAt FROM content_drafts WHERE id = ?'
    ).get(draftId);
    send({ id: msgId, success: true, data: draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Create draft error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function getDrafts(db: Database.Database, send: SendFn, msgId: string, payload?: any): void {
  try {
    let sql = 'SELECT id, account_id as accountId, generated_text as generatedText, source_prompt as sourcePrompt, ' +
      'rag_context_ids as ragContextIds, predicted_score as predictedScore, scheduled_date as scheduledDate, ' +
      'published_at as publishedAt, status, created_at as createdAt, updated_at as updatedAt FROM content_drafts';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (payload?.accountId) {
      conditions.push('account_id = ?');
      params.push(payload.accountId);
    }
    if (payload?.date) {
      conditions.push('date(scheduled_date) = date(?)');
      params.push(payload.date);
    }
    if (payload?.status) {
      conditions.push('status = ?');
      params.push(payload.status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC';

    const rows = db.prepare(sql).all(...params);
    send({ id: msgId, success: true, data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Get drafts error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function updateDraftHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const now = new Date().toISOString();
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (payload.generatedText !== undefined) { setClauses.push('generated_text = ?'); params.push(payload.generatedText); }
    if (payload.sourcePrompt !== undefined) { setClauses.push('source_prompt = ?'); params.push(payload.sourcePrompt); }
    if (payload.scheduledDate !== undefined) { setClauses.push('scheduled_date = ?'); params.push(payload.scheduledDate); }
    if (payload.status !== undefined) { setClauses.push('status = ?'); params.push(payload.status); }
    if (payload.predictedScore !== undefined) { setClauses.push('predicted_score = ?'); params.push(payload.predictedScore); }

    params.push(payload.id);
    db.prepare('UPDATE content_drafts SET ' + setClauses.join(', ') + ' WHERE id = ?').run(...params);
    const draft = db.prepare(
      'SELECT id, account_id as accountId, generated_text as generatedText, source_prompt as sourcePrompt, ' +
      'rag_context_ids as ragContextIds, predicted_score as predictedScore, scheduled_date as scheduledDate, ' +
      'published_at as publishedAt, status, created_at as createdAt, updated_at as updatedAt FROM content_drafts WHERE id = ?'
    ).get(payload.id);
    send({ id: msgId, success: true, data: draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Update draft error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function deleteDraftHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    db.prepare('DELETE FROM content_drafts WHERE id = ?').run(payload.id);
    send({ id: msgId, success: true, data: { deleted: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Delete draft error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function getSettingsHandler(db: Database.Database, send: SendFn, msgId: string): void {
  try {
    const rows = db.prepare('SELECT key, value, updated_at as updatedAt FROM settings').all() as any[];
    const settingsMap: Record<string, string> = {};
    for (const row of rows) {
      settingsMap[row.key] = row.value;
    }
    send({ id: msgId, success: true, data: settingsMap });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Get settings error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function updateSettingsHandler(db: Database.Database, send: SendFn, msgId: string, payload: Record<string, string>): void {
  try {
    const now = new Date().toISOString();
    const upsert = db.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    );
    for (const [key, value] of Object.entries(payload)) {
      upsert.run(key, value, now);
    }
    send({ id: msgId, success: true, data: { updated: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Update settings error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function getAnalyticsHandler(db: Database.Database, send: SendFn, msgId: string, payload?: any): void {
  try {
    const params: unknown[] = [];
    let whereClause = '';
    if (payload?.accountId) {
      whereClause = ' WHERE p.account_id = ?';
      params.push(payload.accountId);
    }

    const totalPosts = db.prepare('SELECT COUNT(*) as count FROM posts p' + whereClause).get(...params) as any;

    const trendData = db.prepare(
      'SELECT date(p.published_at) as date, AVG(s.composite_score) as avgScore, ' +
      'COUNT(*) as postCount FROM posts p LEFT JOIN scores s ON s.post_id = p.id' +
      whereClause + ' AND p.published_at IS NOT NULL ' +
      'GROUP BY date(p.published_at) ORDER BY date ASC LIMIT 90'
    ).all(...params);

    const topPosts = db.prepare(
      'SELECT p.id, p.content_text as contentText, p.published_at as publishedAt, ' +
      'a.handle as authorHandle, a.platform, s.composite_score as compositeScore, ' +
      's.engagement_score as engagementScore FROM posts p ' +
      'LEFT JOIN accounts a ON p.account_id = a.id ' +
      'LEFT JOIN scores s ON s.post_id = p.id' +
      whereClause + ' AND s.composite_score IS NOT NULL ' +
      'ORDER BY s.composite_score DESC LIMIT 5'
    ).all(...params);

    const bottomPosts = db.prepare(
      'SELECT p.id, p.content_text as contentText, p.published_at as publishedAt, ' +
      'a.handle as authorHandle, a.platform, s.composite_score as compositeScore, ' +
      's.engagement_score as engagementScore FROM posts p ' +
      'LEFT JOIN accounts a ON p.account_id = a.id ' +
      'LEFT JOIN scores s ON s.post_id = p.id' +
      whereClause + ' AND s.composite_score IS NOT NULL ' +
      'ORDER BY s.composite_score ASC LIMIT 5'
    ).all(...params);

    send({ id: msgId, success: true, data: {
      totalPosts: totalPosts.count,
      trendData,
      topPosts,
      bottomPosts,
    }});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Get analytics error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function getHeatmapHandler(db: Database.Database, send: SendFn, msgId: string, payload?: any): void {
  try {
    let sql = 'SELECT id, account_id as accountId, content_type as contentType, hour_of_day as hourOfDay, ' +
      'day_of_week as dayOfWeek, avg_engagement_score as avgEngagementScore, sample_size as sampleSize, ' +
      'confidence, updated_at as updatedAt FROM heatmap_cells';
    const params: unknown[] = [];
    if (payload?.accountId) {
      sql += ' WHERE account_id = ?';
      params.push(payload.accountId);
    }
    sql += ' ORDER BY day_of_week, hour_of_day';
    const rows = db.prepare(sql).all(...params);
    send({ id: msgId, success: true, data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Get heatmap error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}
