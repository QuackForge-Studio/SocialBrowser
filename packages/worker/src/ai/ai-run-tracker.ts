import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export class AiRunTracker {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  createRun(params: {
    runType: string;
    provider: string;
    model: string;
    promptTemplateVersion?: number;
    sourcePostIds?: string[];
  }): string {
    const id = uuidv4();
    const now = new Date().toISOString();
    const sourcePostIdsStr = params.sourcePostIds?.length ? params.sourcePostIds.join(',') : null;

    this.db.prepare(
      "INSERT INTO ai_runs (id, run_type, provider, model, prompt_template_version, source_post_ids, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)"
    ).run(id, params.runType, params.provider, params.model, params.promptTemplateVersion ?? null, sourcePostIdsStr, now);

    return id;
  }

  completeRun(params: {
    runId: string;
    latencyMs: number;
    tokenCount: number;
    costEstimate?: number;
  }): void {
    this.db.prepare(
      'UPDATE ai_runs SET status = \'success\', latency_ms = ?, token_count = ?, cost_estimate = ? WHERE id = ?'
    ).run(params.latencyMs, params.tokenCount, params.costEstimate ?? 0, params.runId);
  }

  failRun(params: {
    runId: string;
    errorMessage: string;
    isRateLimited?: boolean;
  }): void {
    const status = params.isRateLimited ? 'rate_limited' : 'error';
    this.db.prepare(
      'UPDATE ai_runs SET status = ?, error_message = ? WHERE id = ?'
    ).run(status, params.errorMessage, params.runId);
  }

  isDailyCostExceeded(limitUsd: number): boolean {
    const today = new Date().toISOString().split('T')[0];
    const row = this.db.prepare(
      "SELECT COALESCE(SUM(cost_estimate), 0) as total_cost FROM ai_runs WHERE created_at >= ? AND status IN ('success', 'error', 'rate_limited')"
    ).get(today) as { total_cost: number };
    return row.total_cost >= limitUsd;
  }
}
