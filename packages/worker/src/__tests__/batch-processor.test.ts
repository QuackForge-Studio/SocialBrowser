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

interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
}

function createDeferred<T = void>(): Deferred<T> {
  let resolve: ((value: T) => void) = () => {};
  let reject: ((err: Error) => void) = () => {};
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('VAL-AI-032: maxConcurrency', () => {
  let db: Database.Database;
  let tracker: AiRunTracker;
  beforeEach(() => { db = setupDb(); tracker = makeTracker(db); });
  afterEach(() => { db.close(); });

  it('should not exceed maxConcurrent=2 with 5 requests and verify peak concurrency', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 2, maxRetries: 0, costLimitDaily: 0 });
    const ds = [createDeferred(), createDeferred(), createDeferred(), createDeferred(), createDeferred()];
    let cur = 0, peak = 0;
    const ps = ds.map((d, i) => processor.execute(async () => { cur++; peak = Math.max(peak, cur); await d.promise; cur--; return i; }));
    await delay(0);
    expect(peak).toBeLessThanOrEqual(2);
    ds[0].resolve(undefined); await delay(0);
    expect(peak).toBeLessThanOrEqual(2);
    ds[1].resolve(undefined); await delay(0);
    expect(peak).toBeLessThanOrEqual(2);
    ds.slice(2).forEach(d => d.resolve(undefined));
    const r = await Promise.all(ps);
    expect(r.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('should not exceed maxConcurrent=2 with peak tracking', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 2, maxRetries: 0, costLimitDaily: 0 });
    let peak = 0, cur = 0;
    const ds = [createDeferred(), createDeferred(), createDeferred(), createDeferred(), createDeferred()];
    const ps = ds.map((d, i) => processor.execute(async () => { cur++; peak = Math.max(peak, cur); await d.promise; cur--; return i; }));
    await delay(0);
    expect(peak).toBeLessThanOrEqual(2);
    ds.forEach(d => d.resolve(undefined));
    const r = await Promise.all(ps);
    expect(r.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('should preserve maxConcurrent=1 (deterministic sequential)', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 1, maxRetries: 0, costLimitDaily: 0 });
    const d1 = createDeferred(), d2 = createDeferred();
    const order: number[] = [];
    const p1 = processor.execute(async () => { order.push(1); await d1.promise; return 1; });
    const p2 = processor.execute(async () => { order.push(2); await d2.promise; return 2; });
    const p3 = processor.execute(async () => { order.push(3); return 3; });
    await delay(0);
    expect(order).toEqual([1]);
    d1.resolve(undefined); await p1; await delay(0);
    expect(order).toEqual([1, 2]);
    d2.resolve(undefined); await p2; await delay(0);
    expect(order).toEqual([1, 2, 3]);
    expect(await p3).toBe(3);
  });
});

describe('VAL-AI-043: Sequential processing (maxConcurrent=1)', () => {
  it('should process 3 calls sequentially with deferred control', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 1, maxRetries: 0, costLimitDaily: 0 });
    const d1 = createDeferred(), d2 = createDeferred();
    const order: number[] = [];
    const p1 = processor.execute(async () => { order.push(1); await d1.promise; return 1; });
    const p2 = processor.execute(async () => { order.push(2); await d2.promise; return 2; });
    const p3 = processor.execute(async () => { order.push(3); return 3; });
    expect(order).toEqual([1]);
    d1.resolve(undefined); await p1; await delay(0);
    expect(order).toEqual([1, 2]);
    d2.resolve(undefined); await p2; await delay(0);
    expect(order).toEqual([1, 2, 3]);
    await p3;
  });
});

describe('VAL-AI-033: maxRetries exponential backoff', () => {
  it('should retry up to maxRetries=3', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 3, costLimitDaily: 0 });
    let a = 0;
    await expect(processor.execute(() => { a++; throw new Error('fail'); })).rejects.toThrow('fail');
    expect(a).toBe(4);
  });

  it('should succeed on retry after transient failure', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 3, costLimitDaily: 0 });
    let a = 0;
    const r = await processor.execute(() => { a++; if (a <= 2) throw new Error('transient'); return 'ok'; });
    expect(r).toBe('ok'); expect(a).toBe(3);
  });

  it('should not retry when maxRetries=0', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0 });
    let a = 0;
    await expect(processor.execute(() => { a++; throw new Error('no-retry'); })).rejects.toThrow('no-retry');
    expect(a).toBe(1);
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
    const r = await processor.execute(() => Promise.resolve('ok'));
    expect(r).toBe('ok');
  });

  it('should pass with costLimitDaily=0 (no limit)', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0 });
    processor.setRunTracker(tracker);
    const r = await processor.execute(() => Promise.resolve('no-limit'));
    expect(r).toBe('no-limit');
  });

  it('should not execute fn when limit exceeded', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0.001 });
    processor.setRunTracker(tracker);
    const rid = tracker.createRun({ runType: 'generate', provider: 'openai', model: 'gpt-4o' });
    tracker.completeRun({ runId: rid, latencyMs: 100, tokenCount: 50, costEstimate: 0.001 });
    let executed = false;
    try { await processor.execute(() => { executed = true; return Promise.resolve('x'); }); } catch (e) { /* empty catch expected */ }
    expect(executed).toBe(false);
  });

  it('should work without tracker (no limit check)', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0.01 });
    const r = await processor.execute(() => Promise.resolve('no-tracker'));
    expect(r).toBe('no-tracker');
  });
});


describe('BatchProcessor shutdown', () => {
  it('should reject new execute() after shutdown', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 5, maxRetries: 0, costLimitDaily: 0 });
    processor.requestShutdown();
    await expect(processor.execute(() => Promise.resolve('x'))).rejects.toThrow('shutting down');
  });
  it('should leave no hanging promises after shutdown', async () => {
    const processor = new BatchProcessor({ maxConcurrent: 1, maxRetries: 0, costLimitDaily: 0 });
    const d = createDeferred();
    const p1 = processor.execute(async () => { await d.promise; return 'first'; });
    const p2 = processor.execute(() => Promise.resolve('second'));
    const p3 = processor.execute(() => Promise.resolve('third'));
    await delay(0);
    processor.requestShutdown();
    await expect(p2).rejects.toThrow('shutting down');
    await expect(p3).rejects.toThrow('shutting down');
    d.resolve(undefined);
    await expect(p1).resolves.toBe('first');
    expect(processor.pendingCount).toBe(0);
  });
});
