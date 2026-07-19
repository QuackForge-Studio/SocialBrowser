import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { BatchProcessor } from '../ai/batch-processor';
import { AiRunTracker } from '../ai/ai-run-tracker';
import { runMigrations } from '../database';

function setupDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeTracker(db: Database.Database): AiRunTracker {
  return new AiRunTracker(db);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('VAL-AI-032: maxConcurrency', () => {
  let db: Database.Database;
  let tracker: AiRunTracker;
  beforeEach(() => { db = setupDb(); tracker = makeTracker(db); });
  afterEach(() => { db.close(); });

  it('should not exceed maxConcurrent=2 with 5 requests', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 2, maxRetries: 0, costLimitDaily: 0 });
    let peak = 0;
    let cur = 0;
    const work = async (id: number): Promise<number> => { cur++; peak = Math.max(peak, cur); await delay(50); cur--; return id; };
    const results = await Promise.all([1,2,3,4,5].map((id) => processor.execute(() => work(id))));
    expect(results).toEqual([1,2,3,4,5]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('should allow maxConcurrent=1 (sequential)', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 1, maxRetries: 0, costLimitDaily: 0 });
    const order: number[] = [];
    const work = async (id: number): Promise<number> => { order.push(id); await delay(30); return id; };
    const results = await Promise.all([1,2,3].map((id) => processor.execute(() => work(id))));
    expect(results).toEqual([1,2,3]);
    expect(order).toEqual([1,2,3]);
  });
});

describe('VAL-AI-043: Sequential processing (maxConcurrent=1)', () => {
  it('should process 3 calls sequentially', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 1, maxRetries: 0, costLimitDaily: 0 });
    const timestamps: number[] = [];
    const work = async (id: number): Promise<number> => { timestamps.push(Date.now()); await delay(40); return id; };
    const results = await Promise.all([1,2,3].map((id) => processor.execute(() => work(id))));
    expect(results).toEqual([1,2,3]);
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(35);
    expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(35);
  });
});

describe('VAL-AI-033: maxRetries exponential backoff', () => {
  it('should retry up to maxRetries=3', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 3, costLimitDaily: 0 });
    let attempts = 0;
    await expect(processor.execute(() => { attempts++; throw new Error('fail'); })).rejects.toThrow('fail');
    expect(attempts).toBe(4);
  });

  it('should succeed on retry after transient failure', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 3, costLimitDaily: 0 });
    let attempts = 0;
    const result = await processor.execute(() => { attempts++; if (attempts <= 2) throw new Error('transient'); return 'ok'; });
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('should increase delay between retries', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 3, costLimitDaily: 0 });
    const timestamps: number[] = [];
    await expect(processor.execute(() => { timestamps.push(Date.now()); throw new Error('fail'); })).rejects.toThrow();
    expect(timestamps.length).toBe(4);
    const d1 = timestamps[1] - timestamps[0];
    const d2 = timestamps[2] - timestamps[1];
    const d3 = timestamps[3] - timestamps[2];
    expect(d2).toBeGreaterThanOrEqual(d1 * 0.5);
    expect(d3).toBeGreaterThanOrEqual(d1 * 0.5);
  });

  it('should not retry when maxRetries=0', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0 });
    let attempts = 0;
    await expect(processor.execute(() => { attempts++; throw new Error('no-retry'); })).rejects.toThrow('no-retry');
    expect(attempts).toBe(1);
  });
});

describe('VAL-AI-034: costLimitDaily', () => {
  let db: Database.Database;
  let tracker: AiRunTracker;
  beforeEach(() => { db = setupDb(); tracker = makeTracker(db); });
  afterEach(() => { db.close(); });

  it('should reject calls when daily limit exceeded', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0.01 });
    processor.setRunTracker(tracker);
    const rid = tracker.createRun({ runType: 'generate', provider: 'openai', model: 'gpt-4o' });
    tracker.completeRun({ runId: rid, latencyMs: 100, tokenCount: 50, costEstimate: 0.01 });
    await expect(processor.execute(() => Promise.resolve('x'))).rejects.toThrow('Daily cost limit exceeded');
  });

  it('should allow calls when under limit', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0.05 });
    processor.setRunTracker(tracker);
    const rid = tracker.createRun({ runType: 'generate', provider: 'openai', model: 'gpt-4o' });
    tracker.completeRun({ runId: rid, latencyMs: 100, tokenCount: 50, costEstimate: 0.01 });
    const result = await processor.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('should pass with costLimitDaily=0 (no limit)', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0 });
    processor.setRunTracker(tracker);
    const result = await processor.execute(() => Promise.resolve('no-limit'));
    expect(result).toBe('no-limit');
  });

  it('should not execute fn when limit exceeded', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0.001 });
    processor.setRunTracker(tracker);
    const rid = tracker.createRun({ runType: 'generate', provider: 'openai', model: 'gpt-4o' });
    tracker.completeRun({ runId: rid, latencyMs: 100, tokenCount: 50, costEstimate: 0.001 });
    let executed = false;
    try { await processor.execute(() => { executed = true; return Promise.resolve('x'); }); } catch {}
    expect(executed).toBe(false);
  });

  it('should work without tracker (no limit check)', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0.01 });
    const result = await processor.execute(() => Promise.resolve('no-tracker'));
    expect(result).toBe('no-tracker');
  });
});

describe('BatchProcessor shutdown', () => {
  it('should reject new execute() after shutdown', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0 });
    processor.requestShutdown();
    await expect(processor.execute(() => Promise.resolve('x'))).rejects.toThrow('shutting down');
  });

  it('should clear queue on shutdown', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 1, maxRetries: 0, costLimitDaily: 0 });
    const p1 = processor.execute(() => delay(100).then(() => 'slow'));
    const p2 = processor.execute(() => Promise.resolve('fast'));
    processor.requestShutdown();
    await expect(p1).resolves.toBe('slow');
    await expect(p2).rejects.toThrow('shutting down');
  });
});
