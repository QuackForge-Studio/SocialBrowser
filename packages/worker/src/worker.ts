import { parentPort as _parentPort } from 'worker_threads';
import path from 'path';
import { DatabaseManager } from './database/database';
import { IngestionPipeline, createIngestionPipeline, PAYLOAD_SCHEMA_VERSION } from './ingestion/ingestion';
import { setActiveProvider, getActiveProviderName, getProvider } from './ai/provider-registry';
import { AiRunTracker } from './ai/ai-run-tracker';
import { BatchProcessor } from './ai/batch-processor';
import { computeAndStoreScore, CURRENT_FORMULA_VERSION } from './scoring/scoring-engine';
import type { WorkerMessage, WorkerResponse } from './index';

export type { WorkerMessage, WorkerResponse } from './index';

const dbPath = process.env.SOCIAL_BROWSER_DB_PATH || path.join(process.cwd(), 'social-browser.sqlite');
const port = _parentPort;

let dbManager: DatabaseManager | null = null;
let pipeline: IngestionPipeline | null = null;
let runTracker: AiRunTracker | null = null;
let batchProcessor: BatchProcessor | null = null;

const pendingKeyRequests = new Map<string, { resolve: (key: string) => void; reject: (err: Error) => void }>();

let shutdownRequested = false;

function send(msg: { id: string; success: boolean; data?: unknown; error?: string }): void {
  if (port) {
    port.postMessage(msg);
  }
}

function requestApiKeyFromMain(provider: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = 'key-req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const timeout = setTimeout(() => {
      if (pendingKeyRequests.has(id)) {
        pendingKeyRequests.delete(id);
        reject(new Error('API key request timed out for provider: ' + provider));
      }
    }, 15000);
    pendingKeyRequests.set(id, {
      resolve: (key: string) => { clearTimeout(timeout); resolve(key); },
      reject: (err: Error) => { clearTimeout(timeout); reject(err); },
    });
    port?.postMessage({ type: 'get-api-key', payload: { provider }, id });
  });
}

async function ensureProvider(providerName?: string): Promise<void> {
  const name = providerName || getActiveProviderName();
  const config: Record<string, unknown> = {};
  if (name !== 'fake') {
    try {
      const apiKey = await requestApiKeyFromMain(name);
      config.apiKey = apiKey;
      config.model = process.env.AI_MODEL || undefined;
      config.embeddingModel = process.env.AI_EMBEDDING_MODEL || undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Worker] Failed to get API key for', name + ': ', msg);
    }
  }
  try {
    setActiveProvider(name, config);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Worker] Failed to set active provider:', msg);
  }
}

function initialize(): void {
  try {
    dbManager = new DatabaseManager({
      dbPath,
      walMode: dbPath !== ':memory:',
      runMigrations: true,
    });
    dbManager.open();

    pipeline = createIngestionPipeline(dbManager.getDb());
    runTracker = new AiRunTracker(dbManager.getDb());
    batchProcessor = new BatchProcessor({
      maxConcurrent: 5,
      maxRetries: 3,
      costLimitDaily: 0,
    });
    batchProcessor.setRunTracker(runTracker);

    console.log('[Worker] Initialized successfully');
    send({ id: 'ready', success: true, data: { version: '0.1.0', dbPath } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Worker] Failed to initialize:', msg);
    send({ id: 'ready', success: false, error: msg });
  }
}

function triggerScoring(postId: string): void {
  if (!dbManager) return;
  try {
    computeAndStoreScore(dbManager.getDb(), postId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Worker] Scoring error (non-fatal):', msg);
  }
}

function processCaptureEvent(channel: string, data: Record<string, unknown>): unknown {
  if (!pipeline || !dbManager) {
    return { status: 'error', reason: 'Ingestion pipeline not initialized' };
  }

  const platform = data.platform as string;
  const accountId = data.accountId as string;
  const batchId = pipeline.ensureActiveBatch(accountId);
  const adapterVersion = (data.adapterVersion as number) || 1;
  const meta = { platform, accountId, adapterVersion, payloadSchemaVersion: PAYLOAD_SCHEMA_VERSION, batchId };

  switch (channel) {
    case 'capture:post': {
      const np = (data as any).normalizedPost;
      return pipeline.ingestPost({
        platformPostId: np.platformPostId,
        contentText: np.contentText,
        mediaRefs: np.mediaRefs,
        authorHandle: np.authorHandle,
        publishedAt: np.publishedAt,
      }, meta);
    }

    case 'capture:snapshot': {
      const snap = (data as any).snapshot;
      const dbo = dbManager.getDb();
      const row = dbo.prepare('SELECT id FROM posts WHERE account_id = ? AND platform_post_id = ?').get(accountId, data.postId) as { id: string } | undefined;
      if (row) {
        return pipeline.ingestSnapshot(row.id, {
          views: snap.views,
          likes: snap.likes,
          commentsCount: snap.commentsCount,
          shares: snap.shares,
          otherMetrics: snap.otherMetrics,
        }, meta);
      }
      return { status: 'rejected', reason: 'Post not found for snapshot' };
    }

    case 'capture:comment': {
      const cmt = (data as any).comment;
      const dbo = dbManager.getDb();
      const row = dbo.prepare('SELECT id FROM posts WHERE account_id = ? AND platform_post_id = ?').get(accountId, data.postId) as { id: string } | undefined;
      if (row) {
        return pipeline.ingestComment(row.id, {
          platformCommentId: cmt.platformCommentId,
          authorHandle: cmt.authorHandle,
          text: cmt.text,
        }, meta);
      }
      return { status: 'rejected', reason: 'Post not found for comment' };
    }

    case 'capture:adapter-ready':
      return pipeline.handleAdapterReady(data as any);

    case 'capture:error':
      pipeline.handleError(data as any, batchId);
      return { status: 'logged', error: data.error };

    default:
      return null;
  }
}

function handleComputeScores(payload: { postId?: string; accountId?: string }, msgId: string): void {
  try {
    if (!dbManager) {
      send({ id: msgId, success: false, error: 'Database not initialized' });
      return;
    }
    const db = dbManager.getDb();
    if (payload.postId) {
      const scoreId = computeAndStoreScore(db, payload.postId);
      send({ id: msgId, success: true, data: { scoreId, formulaVersion: CURRENT_FORMULA_VERSION } });
    } else if (payload.accountId) {
      const posts = db.prepare('SELECT id FROM posts WHERE account_id = ?').all(payload.accountId) as { id: string }[];
      const results = [];
      for (const post of posts) {
        const scoreId = computeAndStoreScore(db, post.id);
        results.push({ postId: post.id, scoreId });
      }
      send({ id: msgId, success: true, data: { results, formulaVersion: CURRENT_FORMULA_VERSION } });
    } else {
      const posts = db.prepare('SELECT id FROM posts').all() as { id: string }[];
      let count = 0;
      for (const post of posts) {
        const scoreId = computeAndStoreScore(db, post.id);
        if (scoreId) count++;
      }
      send({ id: msgId, success: true, data: { postsProcessed: count, formulaVersion: CURRENT_FORMULA_VERSION } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Worker] Compute scores error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

async function handleGenerateDraft(payload: { accountId: string; prompt: string; context?: string[] }, msgId: string): Promise<void> {
  try {
    const provider = getProvider();
    runTracker?.createRun({
      runType: 'generate',
      provider: provider.provider,
      model: provider.model,
    });

    const start = Date.now();
    const result = await provider.generate(payload.prompt, payload.context);
    const latencyMs = Date.now() - start;

    send({ id: msgId, success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Worker] Generate draft error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

async function handleBatchSentiment(payload: { texts: string[] }, msgId: string): Promise<void> {
  try {
    const provider = getProvider();

    const runId = runTracker?.createRun({
      runType: 'batch_sentiment',
      provider: provider.provider,
      model: provider.model,
    });

    const start = Date.now();
    const result = await batchProcessor!.execute(async () => {
      return await provider.classifySentiment(payload.texts);
    });
    const latencyMs = Date.now() - start;

    if (runId) {
      runTracker?.completeRun({
        runId,
        latencyMs,
        tokenCount: 0,
        costEstimate: 0,
      });
    }

    send({ id: msgId, success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Worker] Batch sentiment error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

function handleShutdown(msgId: string): void {
  shutdownRequested = true;

  try {
    if (batchProcessor) {
      batchProcessor.requestShutdown();
    }

    if (dbManager) {
      try {
        dbManager.getDb().pragma('wal_checkpoint(TRUNCATE)');
      } catch {
      }
      dbManager.close();
      dbManager = null;
      pipeline = null;
      runTracker = null;
      batchProcessor = null;
    }

    }


