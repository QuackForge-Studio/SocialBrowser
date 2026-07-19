/**
 * Embedding Pipeline
 *
 * Manages the embedding lifecycle for content (posts, comments, draft briefs):
 * - Embed text using the configured AI provider
 * - Store embedding vectors in vec0 tables (separate per provider/model/dimensions)
 * - Track embedding records (provider, model, dimensions, content_hash, status)
 * - Deduplicate by content_hash
 * - Handle dimensions mismatch rejection
 * - Incremental embedding of new content
 * - Query vec0 tables for KNN similarity search
 */

import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { vecTableName } from '../database/schema';
import type { AIProvider } from './provider';

/** Status values for embedding records. */
export type EmbeddingStatus = 'pending' | 'completed' | 'error';

/** Full embedding record returned by the pipeline. */
export interface EmbeddingRecord {
  id: string;
  contentType: string;
  contentId: string;
  provider: string;
  model: string;
  dimensions: number;
  contentHash: string;
  status: EmbeddingStatus;
  errorMessage?: string;
  createdAt: string;
}

/** Result of an embedding operation. */
export interface EmbedContentResult {
  status: 'completed' | 'skipped_dedup' | 'error';
  recordId?: string;
  provider?: string;
  model?: string;
  dimensions?: number;
  errorMessage?: string;
}

/** A similarity search result from vec0 query. */
export interface SimilarityResult {
  rowid: number;
  postId: string;
  distance: number;
  contentText?: string;
  engagementScore?: number;
  compositeScore?: number;
  publishedAt?: string;
}

/** Options for embedContent operation. */
export interface EmbedContentOptions {
  provider?: AIProvider;
  dedup?: boolean;
}

/**
 * Compute a deterministic SHA-256 content hash for deduplication.
 */
export function computeContentHash(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

/**
 * EmbeddingPipeline manages the full embedding lifecycle.
 *
 * Responsibilities:
 * - Embed content and store in vec0 tables
 * - Manage embedding_records table (metadata tracking)
 * - Deduplicate by content_hash
 * - Query vec0 tables for KNN similarity search
 * - Graceful handling of dimensions mismatch
 */
export class EmbeddingPipeline {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Embed text content and store in the appropriate vec0 table.
   *
   * Steps:
   * 1. Compute content hash
   * 2. Check for existing embedding by hash (dedup)
   * 3. If new: embed via provider, create vec0 table if needed, store vector, record metadata
   * 4. Return the embedding record result
   *
   * Handles:
   * - Deduplication by content_hash
   * - Dimensions mismatch (proper error, no corruption)
   * - Missing provider gracefully
   */
  async embedContent(
    contentType: string,
    contentId: string,
    text: string,
    options?: EmbedContentOptions,
  ): Promise<EmbedContentResult> {
    const hash = computeContentHash(text);

    // Check for dedup
    if (options?.dedup !== false) {
      const existing = this.db.prepare(
        "SELECT id, provider, model, dimensions, status FROM embedding_records WHERE content_hash = ? AND status = 'completed' LIMIT 1"
      ).get(hash) as { id: string; provider: string; model: string; dimensions: number; status: string } | undefined;

      if (existing) {
        return {
          status: 'skipped_dedup',
          recordId: existing.id,
          provider: existing.provider,
          model: existing.model,
          dimensions: existing.dimensions,
        };
      }
    }

    // Embed via provider
    const provider = options?.provider;
    if (!provider) {
      // No provider available - create an error record
      const recordId = uuidv4();
      this.db.prepare(
        "INSERT INTO embedding_records (id, content_type, content_id, provider, model, dimensions, content_hash, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, 'error', ?)"
      ).run(recordId, contentType, contentId || recordId, '', '', 0, hash, 'No AI provider available');
      return { status: 'error', recordId, errorMessage: 'No AI provider available' };
    }

    // Create a pending record first
    const recordId = uuidv4();
    this.db.prepare(
      "INSERT INTO embedding_records (id, content_type, content_id, provider, model, dimensions, content_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')"
    ).run(recordId, contentType, contentId || recordId, provider.provider, provider.model, 0, hash);

    try {
      const embedResult = await provider.embed(text);
      const dimensions = embedResult.dimensions;

      // Verify dimensions are positive
      if (dimensions <= 0) {
        throw new Error('Invalid embedding dimensions: ' + dimensions);
      }

      // Create vec0 table if it doesn't exist
      const tableName = vecTableName(embedResult.provider, embedResult.model, dimensions);
      this.ensureVectorTable(tableName, dimensions);

      // Store vector in vec0 table
      const vecId = this.getNextVecRowId(tableName);
      const embeddingBuffer = Buffer.from(embedResult.vector.buffer);

      try {
        this.db.prepare(
          'INSERT INTO ' + tableName + ' (rowid, embedding) VALUES (?, ?)'
        ).run(vecId, embeddingBuffer);
      } catch (insertErr) {
        const insertMsg = insertErr instanceof Error ? insertErr.message : String(insertErr);
        // Check for dimensions mismatch
        if (insertMsg.toLowerCase().includes('dimension') || insertMsg.toLowerCase().includes('float')) {
          this.db.prepare(
            "UPDATE embedding_records SET status = 'error', error_message = ?, dimensions = ? WHERE id = ?"
          ).run(
            'Dimensions mismatch: expected ' + dimensions + ' dimensions but vector table requires matching dimensions',
            dimensions,
            recordId,
          );
          return {
            status: 'error',
            recordId,
            errorMessage: 'Dimensions mismatch: vector table requires matching dimensions',
            dimensions,
          };
        }
        throw insertErr;
      }

      // Update record as completed with dimensions
      this.db.prepare(
        "UPDATE embedding_records SET status = 'completed', dimensions = ? WHERE id = ?"
      ).run(dimensions, recordId);

      // Also store the embedding blob in the embedding_records table for fallback
      this.db.prepare(
        'UPDATE embedding_records SET embedding = ? WHERE id = ?'
      ).run(embeddingBuffer, recordId);

      return {
        status: 'completed',
        recordId,
        provider: embedResult.provider,
        model: embedResult.model,
        dimensions,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.db.prepare(
        "UPDATE embedding_records SET status = 'error', error_message = ? WHERE id = ?"
      ).run(errorMsg, recordId);
      return { status: 'error', recordId, errorMessage: errorMsg };
    }
  }

  /**
   * Query a vec0 table for top-K nearest neighbor vectors.
   * Returns an array of {rowid, distance} results.
   */
  queryTopK(
    tableName: string,
    queryVector: Float32Array,
    topK: number,
  ): Array<{ rowid: number; distance: number }> {
    const queryBuffer = Buffer.from(queryVector.buffer);
    const results = this.db.prepare(
      'SELECT rowid, distance FROM ' + tableName + ' WHERE embedding MATCH ? ORDER BY distance LIMIT ?'
    ).all(queryBuffer, Math.max(1, topK)) as Array<{ rowid: number; distance: number }>;

    return results || [];
  }

  /**
   * Ensure a vector table exists for the given name and dimensions.
   */
  ensureVectorTable(tableName: string, dimensions: number): void {
    const exists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);

    if (!exists) {
      this.db.exec(
        'CREATE VIRTUAL TABLE IF NOT EXISTS ' + tableName + ' USING vec0(embedding float[' + dimensions + '])'
      );
    }
  }

  /**
   * Get the next available row ID for inserting into a vec0 table.
   */
  private getNextVecRowId(tableName: string): number {
    const maxRow = this.db.prepare(
      'SELECT COALESCE(MAX(rowid), 0) as max_id FROM ' + tableName
    ).get() as { max_id: number };
    return maxRow.max_id + 1;
  }

  /**
   * Load full similarity results with post content and engagement scores.
   */
  loadSimilarityResults(
    results: Array<{ rowid: number; postId: string; distance: number }>,
  ): SimilarityResult[] {
    if (results.length === 0) return [];

    const similarityResults: SimilarityResult[] = [];

    for (const result of results) {
      // Load post content
      const post = this.db.prepare(
        'SELECT id, content_text, published_at FROM posts WHERE id = ?'
      ).get(result.postId) as { id: string; content_text: string | null; published_at: string | null } | undefined;

      if (!post) continue;

      // Load latest engagement score
      const score = this.db.prepare(
        'SELECT engagement_score, composite_score FROM scores WHERE post_id = ? ORDER BY computed_at DESC LIMIT 1'
      ).get(result.postId) as { engagement_score: number | null; composite_score: number | null } | undefined;

      similarityResults.push({
        rowid: result.rowid,
        postId: post.id,
        distance: result.distance,
        contentText: post.content_text || undefined,
        engagementScore: score?.engagement_score ?? undefined,
        compositeScore: score?.composite_score ?? undefined,
        publishedAt: post.published_at || undefined,
      });
    }

    return similarityResults;
  }

  /**
   * Check if a vec0 table exists for the given provider/model/dimensions.
   */
  hasVectorTable(provider: string, model: string, dimensions: number): boolean {
    const tableName = vecTableName(provider, model, dimensions);
    const result = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);
    return result !== undefined;
  }

  /**
   * Count embedding records with a given status.
   * Useful for verification in tests.
   */
  countEmbeddingRecords(status?: string): number {
    let row: { count: number };
    if (status) {
      row = this.db.prepare(
        "SELECT COUNT(*) as count FROM embedding_records WHERE status = ?"
      ).get(status) as { count: number };
    } else {
      row = this.db.prepare(
        'SELECT COUNT(*) as count FROM embedding_records'
      ).get() as { count: number };
    }
    return row.count;
  }

  /**
   * Count rows in a vec0 table.
   */
  countVectorRows(tableName: string): number {
    try {
      const row = this.db.prepare(
        'SELECT COUNT(*) as count FROM ' + tableName
      ).get() as { count: number };
      return row.count;
    } catch {
      return 0;
    }
  }

  /**
   * Re-embed a specific content item (for model migration).
   */
  async reEmbedContent(
    contentType: string,
    contentId: string,
    provider: AIProvider,
  ): Promise<EmbedContentResult> {
    let text: string | undefined;

    if (contentType === 'post') {
      const post = this.db.prepare(
        'SELECT content_text FROM posts WHERE id = ?'
      ).get(contentId) as { content_text: string | null } | undefined;
      text = post?.content_text || undefined;
    } else if (contentType === 'comment') {
      const comment = this.db.prepare(
        'SELECT text FROM comments WHERE id = ?'
      ).get(contentId) as { text: string | null } | undefined;
      text = comment?.text || undefined;
    }

    if (!text) {
      return { status: 'error', errorMessage: 'Content not found or empty' };
    }

    return this.embedContent(contentType, contentId, text, { provider, dedup: false });
  }
}
