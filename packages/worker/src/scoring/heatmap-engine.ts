/**
 * Heatmap Engine
 *
 * Computes and maintains timing heatmap data:
 * - All timestamps stored as UTC ISO 8601
 * - Account-local timezone for calculations
 * - Hour-of-day (0-23) x day-of-week (0-6) -> {avg_engagement_score, sample_size, confidence}
 * - Per account per content type
 * - Incremental recompute on new data
 * - Confidence gate: <5 samples = excluded
 * - Confidence monotonic with sample size
 *
 * Heatmap cells are stored in the `heatmap_cells` table (created by migration 003).
 * Scoring engine reads from this table for timing score computation.
 */

import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { computeSampleConfidence } from "./scoring-engine";

// ===== Constants =====

/** Default timezone if account has none configured. */
const DEFAULT_TIMEZONE = "UTC";

/** Minimum samples for a heatmap cell to have meaningful confidence. */
export const CONFIDENCE_GATE_MIN_SAMPLES = 5;

// ===== Data Interfaces =====

export interface HeatmapCell {
  accountId: string;
  contentType: string;
  hourOfDay: number;
  dayOfWeek: number;
  avgEngagementScore: number | null;
  sampleSize: number;
  confidence: number;
}

export interface HeatmapCellRow {
  id: string;
  account_id: string;
  content_type: string;
  hour_of_day: number;
  day_of_week: number;
  avg_engagement_score: number | null;
  sample_size: number;
  confidence: number;
  updated_at: string;
}

export interface LocalTime {
  hour: number;
  day: number;
}

// ===== Timezone Utilities =====

/**
 * Validate an IANA timezone string.
 */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== "string") return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a UTC ISO 8601 timestamp to account-local hour and day-of-week.
 */
export function getLocalHourAndDay(
  utcIsoString: string,
  timezone: string = DEFAULT_TIMEZONE,
): LocalTime {
  const date = new Date(utcIsoString);
  if (isNaN(date.getTime())) {
    return { hour: 0, day: 0 };
  }

  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  });
  const hourStr = hourFormatter.format(date);
  const hour = parseInt(hourStr, 10);

  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const dayName = dayFormatter.format(date);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[dayName] ?? date.getUTCDay();

  return {
    hour: isNaN(hour) ? Math.max(0, Math.min(23, date.getUTCHours())) : Math.max(0, Math.min(23, hour)),
    day: Math.max(0, Math.min(6, day)),
  };
}

// ===== Timezone Settings =====

export function getAccountTimezone(db: any, accountId: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("timezone:" + accountId) as { value: string } | undefined;
  if (!row) return DEFAULT_TIMEZONE;
  return isValidTimezone(row.value) ? row.value : DEFAULT_TIMEZONE;
}

export function setAccountTimezone(db: any, accountId: string, timezone: string): void {
  if (!isValidTimezone(timezone)) {
    throw new Error("Invalid IANA timezone: " + timezone);
  }
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).run("timezone:" + accountId, timezone);
}

// ===== Private Helpers =====

function getAccountIdForPost(db: any, postId: string): string | null {
  const row = db.prepare("SELECT account_id FROM posts WHERE id = ?").get(postId) as { account_id: string } | undefined;
  return row?.account_id ?? null;
}

function getContentTypeForPost(db: any, postId: string): string | null {
  const row = db.prepare("SELECT COALESCE(content_type, 'text') as content_type FROM posts WHERE id = ?").get(postId) as { content_type: string } | undefined;
  return row?.content_type ?? null;
}

function getPublishedAtForPost(db: any, postId: string): string | null {
  const row = db.prepare("SELECT published_at FROM posts WHERE id = ?").get(postId) as { published_at: string } | undefined;
  return row?.published_at ?? null;
}

// ===== Heatmap Computation =====

interface PostScoreEntry {
  postId: string;
  accountId: string;
  contentType: string;
  publishedAt: string;
  engagementRaw: number | null;
  engagementPercentile: number | null;
  engagementScore: number | null;
}

function getScoredPostsForAccount(db: any, accountId: string, contentType?: string): PostScoreEntry[] {
  let query = "SELECT p.id as postId, p.account_id as accountId, COALESCE(p.content_type, 'text') as contentType, p.published_at as publishedAt, s.engagement_raw as engagementRaw, s.engagement_percentile as engagementPercentile, s.engagement_score as engagementScore FROM posts p JOIN scores s ON s.post_id = p.id WHERE p.account_id = ?";
  const params: unknown[] = [accountId];
  if (contentType) {
    query += " AND COALESCE(p.content_type, 'text') = ?";
    params.push(contentType);
  }
  query += " ORDER BY p.published_at ASC";
  return db.prepare(query).all(...params);
}

export function computeHeatmapCells(
  entries: PostScoreEntry[],
  timezone: string,
): Map<string, { hour: number; day: number; scores: number[] }> {
  const cells = new Map<string, { hour: number; day: number; scores: number[] }>();
  for (const entry of entries) {
    if (!entry.publishedAt) continue;
    if (entry.engagementScore === null && entry.engagementPercentile === null && entry.engagementRaw === null) continue;
    const { hour, day } = getLocalHourAndDay(entry.publishedAt, timezone);
    const key = hour + ":" + day;
    if (!cells.has(key)) {
      cells.set(key, { hour, day, scores: [] });
    }
    const score = entry.engagementPercentile ?? entry.engagementScore ?? entry.engagementRaw;
    if (score !== null) {
      cells.get(key)!.scores.push(score);
    }
  }
  return cells;
}

export function storeHeatmapCells(
  db: any,
  accountId: string,
  contentType: string,
  cells: Map<string, { hour: number; day: number; scores: number[] }>,
): void {
  const deleteStmt = db.prepare("DELETE FROM heatmap_cells WHERE account_id = ? AND content_type = ?");
  const insertStmt = db.prepare(
    "INSERT INTO heatmap_cells (id, account_id, content_type, hour_of_day, day_of_week, avg_engagement_score, sample_size, confidence, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  );
  const tx = db.transaction(() => {
    deleteStmt.run(accountId, contentType);
    for (const [, cell] of cells) {
      const sampleSize = cell.scores.length;
      const confidence = computeSampleConfidence(sampleSize);
      const avgScore = sampleSize > 0 ? cell.scores.reduce((sum: number, s: number) => sum + s, 0) / sampleSize : null;
      insertStmt.run(uuidv4(), accountId, contentType, cell.hour, cell.day, avgScore, sampleSize, confidence);
    }
  });
  tx();
}

export function getAccountContentTypes(db: any, accountId: string): string[] {
  const rows = db.prepare("SELECT DISTINCT COALESCE(content_type, 'text') as content_type FROM posts WHERE account_id = ?").all(accountId) as { content_type: string }[];
  return rows.map(r => r.content_type);
}

export function getAllScoredAccountIds(db: any): string[] {
  const rows = db.prepare("SELECT DISTINCT p.account_id as accountId FROM posts p JOIN scores s ON s.post_id = p.id").all() as { accountId: string }[];
  return rows.map(r => r.accountId);
}

export function computeHeatmapForAccount(db: any, accountId: string): void {
  const timezone = getAccountTimezone(db, accountId);
  const contentTypes = getAccountContentTypes(db, accountId);
  for (const contentType of contentTypes) {
    const entries = getScoredPostsForAccount(db, accountId, contentType);
    const cells = computeHeatmapCells(entries, timezone);
    storeHeatmapCells(db, accountId, contentType, cells);
  }
}

export function computeAllHeatmaps(db: any): void {
  const accountIds = getAllScoredAccountIds(db);
  for (const accountId of accountIds) {
    computeHeatmapForAccount(db, accountId);
  }
}

export function recomputeHeatmapForPost(db: any, postId: string): void {
  const accountId = getAccountIdForPost(db, postId);
  if (!accountId) return;
  const contentType = getContentTypeForPost(db, postId);
  if (!contentType) return;
  const publishedAt = getPublishedAtForPost(db, postId);
  if (!publishedAt) return;
  const timezone = getAccountTimezone(db, accountId);
  const { hour, day } = getLocalHourAndDay(publishedAt, timezone);
  const allEntries = getScoredPostsForAccount(db, accountId, contentType);
  const slotEntries = allEntries.filter(entry => {
    if (!entry.publishedAt) return false;
    const entryLocal = getLocalHourAndDay(entry.publishedAt, timezone);
    return entryLocal.hour === hour && entryLocal.day === day;
  });
  const scores = slotEntries.map(e => e.engagementPercentile ?? e.engagementScore ?? e.engagementRaw).filter((s: number | null): s is number => s !== null);
  const sampleSize = scores.length;
  const confidence = computeSampleConfidence(sampleSize);
  const avgScore = sampleSize > 0 ? scores.reduce((sum: number, s: number) => sum + s, 0) / sampleSize : null;
  const existing = db.prepare("SELECT id FROM heatmap_cells WHERE account_id = ? AND content_type = ? AND hour_of_day = ? AND day_of_week = ?").get(accountId, contentType, hour, day) as { id: string } | undefined;
  if (existing) {
    db.prepare("UPDATE heatmap_cells SET avg_engagement_score = ?, sample_size = ?, confidence = ?, updated_at = datetime('now') WHERE id = ?").run(avgScore, sampleSize, confidence, existing.id);
  } else {
    db.prepare("INSERT INTO heatmap_cells (id, account_id, content_type, hour_of_day, day_of_week, avg_engagement_score, sample_size, confidence, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))").run(uuidv4(), accountId, contentType, hour, day, avgScore, sampleSize, confidence);
  }
}

export function recomputeHeatmapForTimezoneChange(db: any, accountId: string): void {
  computeHeatmapForAccount(db, accountId);
}

export function getHeatmapForAccount(db: any, accountId: string, contentType?: string): HeatmapCell[] {
  let query = "SELECT * FROM heatmap_cells WHERE account_id = ?";
  const params: unknown[] = [accountId];
  if (contentType) {
    query += " AND content_type = ?";
    params.push(contentType);
  }
  query += " ORDER BY day_of_week ASC, hour_of_day ASC";
  const rows = db.prepare(query).all(...params) as HeatmapCellRow[];
  return rows.map(row => ({
    accountId: row.account_id,
    contentType: row.content_type,
    hourOfDay: row.hour_of_day,
    dayOfWeek: row.day_of_week,
    avgEngagementScore: row.avg_engagement_score,
    sampleSize: row.sample_size,
    confidence: row.confidence,
  }));
}

export function getHeatmapGrid(db: any, accountId: string, contentType?: string): {
  grid: { hour: number; day: number; avgScore: number | null; sampleSize: number; confidence: number; excluded: boolean }[][];
  contentTypes: string[];
  timezone: string;
} {
  const cells = getHeatmapForAccount(db, accountId, contentType);
  const contentTypesList = getAccountContentTypes(db, accountId);
  const tz = getAccountTimezone(db, accountId);
  const cellMap = new Map<string, HeatmapCell>();
  for (const cell of cells) {
    cellMap.set(cell.hourOfDay + ":" + cell.dayOfWeek, cell);
  }
  const grid: { hour: number; day: number; avgScore: number | null; sampleSize: number; confidence: number; excluded: boolean }[][] = [];
  for (let hour = 0; hour < 24; hour++) {
    const row: { hour: number; day: number; avgScore: number | null; sampleSize: number; confidence: number; excluded: boolean }[] = [];
    for (let day = 0; day < 7; day++) {
      const key = hour + ":" + day;
      const cell = cellMap.get(key);
      if (cell && cell.sampleSize >= CONFIDENCE_GATE_MIN_SAMPLES) {
        row.push({ hour, day, avgScore: cell.avgEngagementScore, sampleSize: cell.sampleSize, confidence: cell.confidence, excluded: false });
      } else if (cell) {
        row.push({ hour, day, avgScore: cell.avgEngagementScore, sampleSize: cell.sampleSize, confidence: 0, excluded: true });
      } else {
        row.push({ hour, day, avgScore: null, sampleSize: 0, confidence: 0, excluded: true });
      }
    }
    grid.push(row);
  }
  return { grid, contentTypes: contentTypesList, timezone: tz };
}
