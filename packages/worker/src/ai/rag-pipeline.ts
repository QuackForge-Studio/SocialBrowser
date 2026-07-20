/**
 * RAG Pipeline
 *
 * Implements Retrieval-Augmented Generation for draft creation.
 */

import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { vecTableName } from '../database/schema';
import type { AIProvider } from './provider';
import { EmbeddingPipeline } from './embedding-pipeline';
import type { SimilarityResult } from './embedding-pipeline';
import type { GenerateResult } from '@social-browser/shared';

const DEFAULT_TOP_K = 5;
const MAX_CONTEXT_CHARS = 8000;

export interface GenerateWithRAGResult {
  generateResult: GenerateResult;
  ragContextIds: string[];
  contextPosts: SimilarityResult[];
  ragUsed: boolean;
  ragError?: string;
}

export interface RAGPipelineOptions {
  topK?: number;
}

export class RAGPipeline {
  private db: Database.Database;
  private embeddingPipeline: EmbeddingPipeline;

  constructor(db: Database.Database, embeddingPipeline: EmbeddingPipeline) {
    this.db = db;
    this.embeddingPipeline = embeddingPipeline;
  }

  async generateWithRAG(
    prompt: string,
    brief: string,
    provider: AIProvider,
    options?: RAGPipelineOptions,
  ): Promise<GenerateWithRAGResult> {
    const topK = options?.topK ?? DEFAULT_TOP_K;
    let ragContextIds: string[] = [];
    let contextPosts: SimilarityResult[] = [];
    let ragUsed = false;
    let ragError: string | undefined;

    // Step 1: Embed the brief
    try {
      const embedResult = await this.embeddingPipeline.embedContent(
        'draft_brief',
        '',
        brief,
        { provider, dedup: true },
      );

      if (embedResult.status === 'completed' && embedResult.dimensions && embedResult.provider && embedResult.model) {
        // Step 2: Retrieve top-K similar posts
        try {
          const tableName = vecTableName(embedResult.provider, embedResult.model, embedResult.dimensions);
          const tableExists = this.db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
          ).get(tableName);

          if (tableExists) {
            const briefRecord = this.db.prepare(
              "SELECT embedding FROM embedding_records WHERE id = ? AND status = 'completed'"
            ).get(embedResult.recordId) as { embedding: Buffer } | undefined;

            if (briefRecord && briefRecord.embedding) {
              const briefVector = new Float32Array(
                briefRecord.embedding.buffer,
                briefRecord.embedding.byteOffset,
                briefRecord.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
              );

              const knnResults = this.embeddingPipeline.queryTopK(tableName, briefVector, topK + 1);

              if (knnResults.length > 0) {
                const postIds = this.mapRowIdsToPostIds(knnResults.map((r: any) => r.rowid));
                const distanceMap = new Map<number, number>();
                for (const r of knnResults) {
                  distanceMap.set(r.rowid, r.distance);
                }

                const mappedResults: Array<{ rowid: number; postId: string; distance: number }> = [];
                for (const [rowid, postId] of postIds) {
                  const distance = distanceMap.get(rowid);
                  if (distance !== undefined) {
                    mappedResults.push({ rowid, postId, distance });
                  }
                }

                mappedResults.sort((a, b) => a.distance - b.distance);
                const limited = mappedResults.slice(0, topK);

                contextPosts = this.embeddingPipeline.loadSimilarityResults(limited);
                ragContextIds = contextPosts.map((p: any) => p.postId);
                ragUsed = ragContextIds.length > 0;
              }
            }
          }
        } catch (err) {
          ragError = err instanceof Error ? err.message : String(err);
        }
      } else if (embedResult.status === 'error') {
        ragError = embedResult.errorMessage || 'Embedding failed';
      }
    } catch (err) {
      ragError = err instanceof Error ? err.message : String(err);
    }

    // Step 3: Format grounding context
    let contextStrings: string[] | undefined;
    if (ragUsed && contextPosts.length > 0) {
      contextStrings = this.formatRAGContext(contextPosts, MAX_CONTEXT_CHARS);
    }

    // Step 4: Generate with or without RAG context
    const generateResult = await provider.generate(prompt, contextStrings);
    return {
      generateResult,
      ragContextIds,
      contextPosts,
      ragUsed,
      ragError,
    };
  }

  private mapRowIdsToPostIds(rowids: number[]): Array<[number, string]> {
    if (rowids.length === 0) return [];
    const results: Array<[number, string]> = [];
    const seen = new Set<number>();

    for (const rowid of rowids) {
      if (seen.has(rowid)) { continue; }
      seen.add(rowid);

      const rows = this.db.prepare(
        'SELECT content_id FROM embedding_records WHERE vec_row_id = ? ORDER BY created_at DESC LIMIT 1'
      ).all(rowid) as Array<{ content_id: string }>;

      if (rows.length > 0 && rows[0].content_id) {
        results.push([rowid, rows[0].content_id]);
      }
    }

    return results;
  }

  private formatRAGContext(posts: SimilarityResult[], maxChars: number): string[] {
    const contextParts: string[] = [];
    let totalChars = 0;

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      let part = '';

      if (post.contentText) {
        part = 'Post ' + (i + 1) + ':\n' + post.contentText;
        if (post.engagementScore !== undefined) {
          part += '\nEngagement Score: ' + post.engagementScore.toFixed(1);
        }
        if (post.compositeScore !== undefined) {
          part += '\nComposite Score: ' + post.compositeScore.toFixed(1);
        }
      }

      if (part.length > 0) {
        if (totalChars + part.length > maxChars) {
          const remaining = maxChars - totalChars;
          if (remaining > 50) {
            contextParts.push(part.slice(0, remaining) + '...');
          }
          break;
        }
        contextParts.push(part);
        totalChars += part.length;
      }
    }

    return contextParts;
  }

  updateDraftWithRAGContext(draftId: string, ragContextIds: string[]): void {
    if (ragContextIds.length === 0) { return; }
    const contextIdsStr = ragContextIds.join(',');
    this.db.prepare(
      'UPDATE content_drafts SET rag_context_ids = ? WHERE id = ?'
    ).run(contextIdsStr, draftId);
  }

  createDraft(params: {
    accountId: string;
    generatedText: string;
    sourcePrompt: string;
    ragContextIds: string[];
    predictedScore?: number;
    status?: string;
  }): string {
    const draftId = uuidv4();
    const now = new Date().toISOString();
    const ragContextIdsStr = params.ragContextIds.length > 0 ? params.ragContextIds.join(',') : null;

    this.db.prepare(
      'INSERT INTO content_drafts (id, account_id, generated_text, source_prompt, rag_context_ids, predicted_score, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      draftId,
      params.accountId,
      params.generatedText,
      params.sourcePrompt,
      ragContextIdsStr,
      params.predictedScore ?? null,
      params.status || 'draft',
      now,
      now,
    );

    return draftId;
  }
}
