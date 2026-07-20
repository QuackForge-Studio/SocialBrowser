/**
 * Scoring Engine
 *
 * Null-safe scoring pipeline:
 * - Engagement raw: (likes + comments*2 + shares*3) / max(reach, 1)
 * - Account-relative percentile scoped by platform + content_type
 * - Small-denominator outlier control
 * - Sample confidence (0.95@N=30, monotonic, bounded [0,1])
 * - Engagement score = percentile * sample_confidence
 * - Sentiment: (pos - neg) / total * 100, null if no comments
 * - Timing: distance from optimal window, null if no heatmap
 * - Composite: weighted blend, null renormalized
 * - Formula versioning (historical not retroactively updated)
 */

import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

// ===== Constants =====

/** Current formula version. Increment when formula changes. */
export const CURRENT_FORMULA_VERSION = 1;

/** Default weights for composite score. */
export const COMPOSITE_WEIGHTS = {
  engagement: 0.5,
  sentiment: 0.3,
  timing: 0.2,
} as const;

/** Lambda for sample confidence = 1 - exp(-N/lambda). At N=30, confidence approx 0.95. */
const CONFIDENCE_LAMBDA = 30 / -Math.log(0.05);

/** Minimum sample count for meaningful confidence. */
const MIN_SAMPLES_FOR_OUTLIER_CONTROL = 5;

/**
 * Valid content types for percentile scoping.
 * Determined from post media_refs or other metadata.
 */
export type ContentType = 'text' | 'image' | 'video' | 'link' | 'poll' | 'unknown';

// ===== Data Interfaces =====

export interface EngagementMetrics {
  likes?: number;
  commentsCount?: number;
  shares?: number;
  views?: number;
}

export interface ScoreResult {
  engagementRaw: number | null;
  engagementPercentile: number | null;
  sampleConfidence: number | null;
  engagementScore: number | null;
  sentimentScore: number | null;
  compositeScore: number | null;
  formulaVersion: number;
}

// ===== Engagement Raw Score =====

/**
 * Compute the raw engagement score from snapshot metrics.
 * Formula: (likes + commentsCount*2 + shares*3) / max(views, 1)
 *
 * NULL-safe: all metrics default to 0 if undefined.
 * Division-by-zero protected by max(views, 1).
 */
export function computeEngagementRaw(metrics: EngagementMetrics): number | null {
  const likes = metrics.likes ?? 0;
  const comments = metrics.commentsCount ?? 0;
  const shares = metrics.shares ?? 0;
  const views = metrics.views ?? 0;

  const numerator = likes + comments * 2 + shares * 3;
  const denominator = Math.max(views, 1);

  return numerator / denominator;
}

// ===== Percentile Calculation =====

/**
 * Compute the percentile rank of a value within a sorted array.
 * Returns a value between 0 and 100.
 */
export function computePercentileFromSorted(sortedValues: number[], value: number): number {
  if (sortedValues.length === 0) return 50;
  if (sortedValues.length === 1) {
    return sortedValues[0] === value ? 50 : (value > sortedValues[0] ? 100 : 0);
  }

  let countBelow = 0;
  let countEqual = 0;

  for (const v of sortedValues) {
    if (v < value) countBelow++;
    else if (v === value) countEqual++;
  }

  const total = sortedValues.length;
  // Percentile = (count_below + 0.5 * count_equal) / total * 100
  const percentile = ((countBelow + 0.5 * countEqual) / total) * 100;

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, percentile));
}

/**
 * Apply small-denominator outlier control.
 * For small sample sizes, blend the percentile toward the median (50%)
 * to avoid extreme values from tiny samples.
 */
export function applyOutlierControl(percentile: number, sampleCount: number): number {
  if (sampleCount >= MIN_SAMPLES_FOR_OUTLIER_CONTROL) {
    return percentile;
  }

  // For very small samples, blend toward 50%
  if (sampleCount <= 1) {
    return 50;
  }

  // Linear blend: N=2 -> heavy blend, N=4 -> light blend, N>=5 -> no blend
  const blendFactor = (MIN_SAMPLES_FOR_OUTLIER_CONTROL - sampleCount) / (MIN_SAMPLES_FOR_OUTLIER_CONTROL - 1);
  const blended = percentile * (1 - blendFactor) + 50 * blendFactor;

  return blended;
}

// ===== Sample Confidence =====

/**
 * Compute sample confidence.
 * Formula: 1 - exp(-N / CONFIDENCE_LAMBDA)
 * - 0.95 at N=30
 * - Monotonic with N
 * - Bounded [0, 1]
 */
export function computeSampleConfidence(N: number): number {
  if (N <= 0) return 0;
  return 1 - Math.exp(-N / CONFIDENCE_LAMBDA);
}

// ===== Engagement Score =====

/**
 * Compute the confidence-weighted engagement score.
 * score = percentile * sample_confidence
 */
export function computeEngagementScore(
  percentile: number | null,
  sampleConfidence: number | null,
): number | null {
  if (percentile === null || sampleConfidence === null) return null;
  return percentile * sampleConfidence;
}

// ===== Account-Relative Percentile =====

/**
 * Get all raw engagement values for posts belonging to the same account,
 * platform, and content type.
 */
export function getPeerEngagementValues(
  db: Database.Database,
  accountId: string,
  platform: string,
  contentType: ContentType,
  excludePostId?: string,
): number[] {
  const query = 
    SELECT s.engagement_score
    FROM scores s
    JOIN posts p ON p.id = s.post_id
    JOIN accounts a ON a.id = p.account_id
    WHERE a.id = ?
      AND a.platform = ?
      AND (p.content_type = ? OR p.content_type IS NULL)
      AND s.engagement_score IS NOT NULL
      
    ORDER BY s.engagement_score ASC
  ;
  const params: unknown[] = [accountId, platform, contentType];
  if (excludePostId) params.push(excludePostId);

  const rows = db.prepare(query).all(...params) as { engagement_score: number }[];
  return rows.map(v => v.engagement_score);
}

/**
 * Compute the account-relative percentile for an engagement score
 * scoped by platform and content type.
 */
export function computeAccountRelativePercentile(
  db: Database.Database,
  accountId: string,
  platform: string,
  contentType: ContentType,
  engagementScore: number,
  excludePostId?: string,
): number | null {
  const peers = getPeerEngagementValues(db, accountId, platform, contentType, excludePostId);

  if (peers.length === 0) return 50;

  const rawPercentile = computePercentileFromSorted(peers, engagementScore);
  const controlled = applyOutlierControl(rawPercentile, peers.length);

  return controlled;
}

// ===== Sentiment =====

/**
 * Compute sentiment score for a post.
 * Formula: (positive - negative) / total * 100
 * - null if no comments
 * - All positive = 100, all negative = -100
 * - Neutrals excluded from numerator but included in denominator
 */
export function computeSentiment(db: Database.Database, postId: string): number | null {
  const row = db.prepare(
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive,
      SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative
    FROM comments
    WHERE post_id = ?
  ).get(postId) as { total: number; positive: number; negative: number } | undefined;

  if (!row || row.total === 0) return null;

  const { total, positive, negative } = row;
  return ((positive - negative) / total) * 100;
}

// ===== Timing Score =====

/**
 * Compute timing score for a post based on distance from optimal window.
 * Returns null if no heatmap data is available.
 */
export function computeTimingScore(db: Database.Database, postId: string): number | null {
  // Check if heatmap table exists and has data
  const tableExists = db.prepare(
    SELECT name FROM sqlite_master WHERE type='table' AND name='heatmap_cells'
  ).get() as { name: string } | undefined;

  if (!tableExists) return null;

  const count = db.prepare('SELECT COUNT(*) as count FROM heatmap_cells').get() as { count: number };
  if (count.count === 0) return null;

  const post = db.prepare(
    SELECT published_at FROM posts WHERE id = ?
  ).get(postId) as { published_at: string } | undefined;

  if (!post?.published_at) return null;

  const publishedDate = new Date(post.published_at);
  const hour = publishedDate.getUTCHours();
  const day = publishedDate.getUTCDay();

  const cell = db.prepare(
    SELECT avg_engagement_score, sample_size, confidence
    FROM heatmap_cells
    WHERE account_id = (SELECT account_id FROM posts WHERE id = ?)
      AND content_type = (SELECT content_type FROM posts WHERE id = ?)
      AND hour_of_day = ?
      AND day_of_week = ?
  ).get(postId, postId, hour, day) as {
    avg_engagement_score: number;
    sample_size: number;
    confidence: number;
  } | undefined;

  if (!cell || cell.sample_size < 5) return null;

  return Math.max(0, Math.min(100, cell.avg_engagement_score * 100));
}

// ===== Composite Score =====

/**
 * Compute the composite score from component scores.
 *
 * Weights: engagement=0.5, sentiment=0.3, timing=0.2
 * - If all null -> null
 * - If some null -> renormalize weights to sum to 1.0
 * - If only one component -> that's the composite (single component = 100% weight)
 */
export function computeComposite(
  engagementScore: number | null,
  sentimentScore: number | null,
  timingScore: number | null,
): number | null {
  const components: { value: number; weight: number }[] = [];
  const weightsMap = COMPOSITE_WEIGHTS;

  if (engagementScore !== null) {
    components.push({ value: engagementScore, weight: weightsMap.engagement });
  }
  if (sentimentScore !== null) {
    // Sentiment is [-100, 100], normalize to [0, 100] for blending
    components.push({ value: (sentimentScore + 100) / 2, weight: weightsMap.sentiment });
  }
  if (timingScore !== null) {
    components.push({ value: timingScore, weight: weightsMap.timing });
  }

  if (components.length === 0) return null;

  if (components.length === 1) {
    return components[0].value;
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return null;

  const composite = components.reduce((sum, c) => {
    return sum + c.value * (c.weight / totalWeight);
  }, 0);

  return composite;
}

// ===== Content Type Detection =====

/**
 * Detect content type from post metadata.
 */
export function detectContentType(mediaRefs?: string | null, contentText?: string | null): ContentType {
  if (!mediaRefs && !contentText) return 'text';
  if (!mediaRefs) return 'text';

  try {
    const parsed = JSON.parse(mediaRefs);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return 'text';

      const hasVideo = parsed.some((ref: string) =>
        /\.(mp4|webm|mov|avi|mkv)$/i.test(ref) || ref.includes('video') || ref.includes('/v/')
      );
      if (hasVideo) return 'video';

      const hasImage = parsed.some((ref: string) =>
        /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(ref) ||
        ref.includes('photo') || ref.includes('image') || ref.includes('media')
      );
      if (hasImage) return 'image';

      const hasLink = parsed.some((ref: string) =>
        ref.startsWith('http') && !/\.(jpg|jpeg|png|gif|webp|bmp|svg|mp4|webm)$/i.test(ref)
      );
      if (hasLink) return 'link';
    }
  } catch {
    if (/\.(mp4|webm|mov|avi|mkv)$/i.test(mediaRefs)) return 'video';
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(mediaRefs)) return 'image';
    if (mediaRefs.startsWith('http')) return 'link';
  }

  return 'unknown';
}

// ===== Full Score Computation =====

/**
 * Compute all scores for a post and insert into the scores table.
 * Returns the computed ScoreResult.
 */
export function computeScoreForPost(
  db: Database.Database,
  postId: string,
): ScoreResult {
  const post = db.prepare(
    SELECT p.id, p.account_id, p.content_text, p.media_refs, p.content_type,
           a.platform
    FROM posts p
    JOIN accounts a ON a.id = p.account_id
    WHERE p.id = ?
  ).get(postId) as {
    id: string;
    account_id: string;
    content_text?: string;
    media_refs?: string;
    content_type?: string | null;
    platform: string;
  } | undefined;

  if (!post) {
    return {
      engagementRaw: null,
      engagementPercentile: null,
      sampleConfidence: null,
      engagementScore: null,
      sentimentScore: null,
      compositeScore: null,
      formulaVersion: CURRENT_FORMULA_VERSION,
    };
  }

  const snapshot = db.prepare(
    SELECT likes, comments_count, shares, views
    FROM engagement_snapshots
    WHERE post_id = ?
    ORDER BY captured_at DESC
    LIMIT 1
  ).get(postId) as {
    likes?: number;
    comments_count?: number;
    shares?: number;
    views?: number;
  } | undefined;

  const contentType: ContentType = (post.content_type as ContentType) ||
    detectContentType(post.media_refs, post.content_text);

  const engagementRaw = snapshot
    ? computeEngagementRaw({
        likes: snapshot.likes,
        commentsCount: snapshot.comments_count,
        shares: snapshot.shares,
        views: snapshot.views,
      })
    : null;

  const peerValues = getPeerEngagementValues(
    db, post.account_id, post.platform, contentType, postId,
  );
  const peerCount = peerValues.length + (engagementRaw !== null ? 1 : 0);
  const sampleConfidence = computeSampleConfidence(peerCount);

  const engagementPercentile = engagementRaw !== null
    ? computeAccountRelativePercentile(
        db, post.account_id, post.platform, contentType, engagementRaw, postId,
      )
    : null;

  const engagementScore = computeEngagementScore(engagementPercentile, sampleConfidence);
  const sentimentScore = computeSentiment(db, postId);
  const timingScore = computeTimingScore(db, postId);
  const compositeScore = computeComposite(engagementScore, sentimentScore, timingScore);

  return {
    engagementRaw,
    engagementPercentile,
    sampleConfidence,
    engagementScore,
    sentimentScore,
    compositeScore,
    formulaVersion: CURRENT_FORMULA_VERSION,
  };
}

/**
 * Store a score result for a post in the scores table.
 * Creates a new score row (append-only, historical scores preserved).
 */
export function storeScore(
  db: Database.Database,
  postId: string,
  result: ScoreResult,
): string {
  const scoreId = uuidv4();
  const computedAt = new Date().toISOString();

  db.prepare(
    INSERT INTO scores (id, post_id, formula_version, engagement_score,
      engagement_percentile, sentiment_score, timing_score, composite_score,
      sample_confidence, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ).run(
    scoreId,
    postId,
    result.formulaVersion,
    result.engagementScore ?? null,
    result.engagementPercentile ?? null,
    result.sentimentScore ?? null,
    null,
    result.compositeScore ?? null,
    result.sampleConfidence ?? null,
    computedAt,
  );

  return scoreId;
}

/**
 * Compute and store scores for a post.
 * Returns the score ID.
 */
export function computeAndStoreScore(
  db: Database.Database,
  postId: string,
): string | null {
  const result = computeScoreForPost(db, postId);
  const scoreId = storeScore(db, postId, result);
  return scoreId;
}

/**
 * Get the current formula version from the database settings.
 */
export function getFormulaVersionSetting(db: Database.Database): number {
  const row = db.prepare(
    "SELECT value FROM settings WHERE key = 'scoring_formula_version'"
  ).get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) || CURRENT_FORMULA_VERSION : CURRENT_FORMULA_VERSION;
}

/**
 * Set the formula version in settings.
 */
export function setFormulaVersion(
  db: Database.Database,
  version: number,
): void {
  db.prepare(
    INSERT INTO settings (key, value, updated_at)
    VALUES ('scoring_formula_version', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  ).run(String(version));
}
