import { parentPort as _parentPort } from 'worker_threads';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from './database/database';
import { IngestionPipeline, createIngestionPipeline, PAYLOAD_SCHEMA_VERSION } from './ingestion/ingestion';
import { setActiveProvider, getActiveProviderName, getProvider } from './ai/provider-registry';
import { AiRunTracker } from './ai/ai-run-tracker';
import { BatchProcessor } from './ai/batch-processor';
import { computeAndStoreScore, CURRENT_FORMULA_VERSION } from './scoring/scoring-engine';
import { EmbeddingPipeline } from './ai/embedding-pipeline';
import { RAGPipeline } from './ai/rag-pipeline';
import {
  getAccounts,
  getPosts,
  createDraftHandler,
  getDrafts,
  updateDraftHandler,
  deleteDraftHandler,
  getSettingsHandler,
  updateSettingsHandler,
  getAnalyticsHandler,
  getHeatmapHandler,
} from './dashboard-handlers';
import {
  getWorkspacesHandler,
  createWorkspaceHandler,
  renameWorkspaceHandler,
  deleteWorkspaceHandler,
  reorderWorkspacesHandler,
  getTabGroupsHandler,
  createTabGroupHandler,
  renameTabGroupHandler,
  deleteTabGroupHandler,
  reorderTabGroupsHandler,
  getGroupAccountsHandler,
  addAccountToGroupHandler,
  removeAccountFromGroupHandler,
  reorderGroupAccountsHandler,
  getGroupTabsHandler,
  addGroupTabHandler,
  removeGroupTabHandler,
  reorderGroupTabsHandler,
} from './workspace';
import {
  recordAuditEvent,
  acknowledgeAccount,
  isAccountAcknowledged,
  checkAndConsumeRateLimit,
  getAuditEvents,
  getGroupAccountIds,
  recordCaptureResult,
  recordAiResult,
} from './workspace/compliance';
import type { WorkerMessage, WorkerResponse } from './index';

export type { WorkerMessage, WorkerResponse } from './index';

const dbPath = process.env.SOCIAL_BROWSER_DB_PATH || path.join(process.cwd(), 'social-browser.sqlite');
const port = _parentPort;

let dbManager: DatabaseManager | null = null;
let pipeline: IngestionPipeline | null = null;
let runTracker: AiRunTracker | null = null;
let batchProcessor: BatchProcessor | null = null;
let embeddingPipeline: EmbeddingPipeline | null = null;
let ragPipeline: RAGPipeline | null = null;

const pendingKeyRequests = new Map();
let shutdownRequested = false;

function send(msg: WorkerResponse): void {
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
        reject(new Error('API key request timed out for: ' + provider));
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
    const db = dbManager.getDb();

    pipeline = createIngestionPipeline(db);
    runTracker = new AiRunTracker(db);
    batchProcessor = new BatchProcessor({
      maxConcurrent: 5,
      maxRetries: 3,
      costLimitDaily: 0,
    });
    batchProcessor.setRunTracker(runTracker);
    embeddingPipeline = new EmbeddingPipeline(db);
    ragPipeline = new RAGPipeline(db, embeddingPipeline);

    console.log('[Worker] Initialized successfully');
    send({ id: 'ready', success: true, data: { version: '0.1.0', dbPath } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Worker] Failed to initialize:', msg);
    send({ id: 'ready', success: false, error: msg });
  }
}

function processCaptureEvent(channel: string, data: Record<string, unknown>): unknown {
  if (!pipeline || !dbManager) {
    return { status: 'error', reason: 'Pipeline not initialized' };
  }
  const platform = data.platform as string;
  const accountId = data.accountId as string;

  // VAL-WORKSPACE-009: Check account acknowledgement before processing capture
  const db = dbManager.getDb();
  if (!isAccountAcknowledged(db, accountId)) {
    recordCaptureResult(db, 'rejected', accountId, platform, 'Account not acknowledged: must accept ToS/account-risk notice before capture');
    return { status: 'rejected', reason: 'Account not acknowledged. Capture is read-only owned-content observation. Session isolation is not anti-detection.' };
  }

  // Only start batch for acknowledged accounts
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
      const row = dbo.prepare('SELECT id FROM posts WHERE account_id = ? AND platform_post_id = ?').get(accountId, data.postId) as any;
      if (row) {
        return pipeline.ingestSnapshot(row.id, {
          views: snap.views, likes: snap.likes,
          commentsCount: snap.commentsCount, shares: snap.shares,
          otherMetrics: snap.otherMetrics,
        }, meta);
      }
      return { status: 'rejected', reason: 'Post not found for snapshot' };
    }
    case 'capture:comment': {
      const cmt = (data as any).comment;
      const dbo = dbManager.getDb();
      const row = dbo.prepare('SELECT id FROM posts WHERE account_id = ? AND platform_post_id = ?').get(accountId, data.postId) as any;
      if (row) {
        return pipeline.ingestComment(row.id, {
          platformCommentId: cmt.platformCommentId,
          authorHandle: cmt.authorHandle, text: cmt.text,
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

function handleComputeScores(payload: any, msgId: string): void {
  try {
    if (!dbManager) { send({ id: msgId, success: false, error: 'DB not initialized' }); return; }
    const db = dbManager.getDb();
    if (payload?.postId) {
      const scoreId = computeAndStoreScore(db, payload.postId);
      send({ id: msgId, success: true, data: { scoreId, formulaVersion: CURRENT_FORMULA_VERSION } });
    } else if (payload?.accountId) {
      const posts = db.prepare('SELECT id FROM posts WHERE account_id = ?').all(payload.accountId) as any[];
      const results = posts.map(p => ({ postId: p.id, scoreId: computeAndStoreScore(db, p.id) }));
      send({ id: msgId, success: true, data: { results, formulaVersion: CURRENT_FORMULA_VERSION } });
    } else {
      const posts = db.prepare('SELECT id FROM posts').all() as any[];
      let count = 0;
      for (const post of posts) { if (computeAndStoreScore(db, post.id)) count++; }
      send({ id: msgId, success: true, data: { postsProcessed: count, formulaVersion: CURRENT_FORMULA_VERSION } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Worker] Compute scores error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

async function handleGenerateDraft(payload: any, msgId: string): Promise<void> {
  try {
    if (!dbManager || !ragPipeline) {
      send({ id: msgId, success: false, error: 'Pipeline not initialized' });
      return;
    }
    await ensureProvider();
    const provider = getProvider();
    const brief = payload.brief || payload.prompt;

    const ragResult = await ragPipeline.generateWithRAG(payload.prompt, brief, provider);
    const draftId = ragPipeline.createDraft({
      accountId: payload.accountId,
      generatedText: ragResult.generateResult.text,
      sourcePrompt: payload.prompt,
      ragContextIds: ragResult.ragContextIds,
      status: 'draft',
    });

    let predictedScore: number | undefined;
    if (ragResult.contextPosts.length > 0) {
      const scores = ragResult.contextPosts
        .map((p: any) => p.compositeScore)
        .filter((s: any) => s !== undefined && s !== null);
      if (scores.length > 0) {
        predictedScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        dbManager.getDb().prepare('UPDATE content_drafts SET predicted_score = ? WHERE id = ?').run(predictedScore, draftId);
      }
    }

    send({ id: msgId, success: true, data: {
      draftId, id: draftId, accountId: payload.accountId,
      generatedText: ragResult.generateResult.text, sourcePrompt: payload.prompt,
      ragContextIds: ragResult.ragContextIds, predictedScore, status: 'draft',
      ragUsed: ragResult.ragUsed,
      contextPosts: ragResult.contextPosts.map((p: any) => ({
        postId: p.postId, contentText: p.contentText,
        engagementScore: p.engagementScore, compositeScore: p.compositeScore,
        similarity: p.distance !== undefined ? 1 - p.distance : undefined,
      })),
      createdAt: new Date().toISOString(),
    }});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Worker] Generate draft error:', msg);
    send({ id: msgId, success: false, error: msg });
  }
}

async function handleBatchSentiment(payload: any, msgId: string): Promise<void> {
  try {
    const provider = getProvider();
    const runId = runTracker?.createRun({ runType: 'batch_sentiment', provider: provider.provider, model: provider.model });
    const start = Date.now();
    const result = await batchProcessor!.execute(async () => provider.classifySentiment(payload.texts));
    const latencyMs = Date.now() - start;
    if (runId) runTracker?.completeRun({ runId, latencyMs, tokenCount: 0, costEstimate: 0 });
    send({ id: msgId, success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send({ id: msgId, success: false, error: msg });
  }
}

function handleShutdown(msgId: string): void {
  shutdownRequested = true;
  try {
    batchProcessor?.requestShutdown();
    if (dbManager) {
      try { dbManager.getDb().pragma('wal_checkpoint(TRUNCATE)'); } catch { /* WAL checkpoint may fail during shutdown, non-critical */ }
      dbManager.close();
      dbManager = null; pipeline = null; runTracker = null;
      batchProcessor = null; embeddingPipeline = null; ragPipeline = null;
    }
    send({ id: msgId, success: true, data: { shutdown: true } });
  } catch (err) {
    send({ id: msgId, success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

// ===== Message Dispatch Loop =====

if (port) {
  port.on('message', async (msg: WorkerMessage) => {
    const { type, payload, id: msgId } = msg;

    // Handle API key responses
    if (type === 'get-api-key-response') {
      const p = payload as any;
      const pending = pendingKeyRequests.get(msgId);
      if (pending) {
        pendingKeyRequests.delete(msgId);
        if (p.apiKey) pending.resolve(p.apiKey);
        else pending.reject(new Error(p.error || 'API key request failed'));
      }
      return;
    }

    const dbFn = (fn: (db: any, send: any, id: string, payload?: any) => void) => {
      if (!dbManager) { send({ id: msgId, success: false, error: 'DB not initialized' }); return; }
      fn(dbManager.getDb(), send, msgId, payload);
    };

    switch (type) {
      case 'ping':
        send({ id: msgId, success: true, data: { pong: true, version: '0.1.0' } });
        break;
      case 'process_capture':
        try {
          if (!payload) { send({ id: msgId, success: false, error: 'Missing payload' }); break; }
          const p = payload as { channel: string; data: Record<string, unknown> };
          send({ id: msgId, success: true, data: processCaptureEvent(p.channel, p.data) });
        } catch (err) {
          send({ id: msgId, success: false, error: err instanceof Error ? err.message : String(err) });
        }
        break;
      case 'compute_scores':
        handleComputeScores(payload, msgId);
        break;
      case 'generate_draft':
        await handleGenerateDraft(payload, msgId);
        break;
      case 'batch_sentiment':
        await handleBatchSentiment(payload, msgId);
        break;
      case 'get_accounts':
        dbFn(getAccounts);
        break;
      case 'get_posts':
        dbFn(getPosts);
        break;
      case 'get_drafts':
        dbFn(getDrafts);
        break;
      case 'create_draft':
        dbFn(createDraftHandler);
        break;
      case 'update_draft':
        dbFn(updateDraftHandler);
        break;
      case 'delete_draft':
        dbFn(deleteDraftHandler);
        break;
      case 'get_settings':
        dbFn(getSettingsHandler);
        break;
      case 'update_settings':
        dbFn(updateSettingsHandler);
        break;
      case 'get_analytics':
        dbFn(getAnalyticsHandler);
        break;
      case 'get_heatmap':
        dbFn(getHeatmapHandler);
        break;
      case 'shutdown':
        handleShutdown(msgId);
        break;
      case 'get_workspaces':
        dbFn(getWorkspacesHandler);
        break;
      case 'create_workspace':
        dbFn(createWorkspaceHandler);
        break;
      case 'rename_workspace':
        dbFn(renameWorkspaceHandler);
        break;
      case 'delete_workspace':
        dbFn(deleteWorkspaceHandler);
        break;
      case 'reorder_workspaces':
        dbFn(reorderWorkspacesHandler);
        break;
      case 'get_tab_groups':
        dbFn(getTabGroupsHandler);
        break;
      case 'create_tab_group':
        dbFn(createTabGroupHandler);
        break;
      case 'rename_tab_group':
        dbFn(renameTabGroupHandler);
        break;
      case 'delete_tab_group':
        dbFn(deleteTabGroupHandler);
        break;
      case 'reorder_tab_groups':
        dbFn(reorderTabGroupsHandler);
        break;
      case 'get_group_accounts':
        dbFn(getGroupAccountsHandler);
        break;
      case 'add_account_to_group':
        dbFn(addAccountToGroupHandler);
        break;
      case 'remove_account_from_group':
        dbFn(removeAccountFromGroupHandler);
        break;
      case 'reorder_group_accounts':
        dbFn(reorderGroupAccountsHandler);
        break;
      case 'get_group_tabs':
        dbFn(getGroupTabsHandler);
        break;
      case 'add_group_tab':
        dbFn(addGroupTabHandler);
        break;
      case 'remove_group_tab':
        dbFn(removeGroupTabHandler);
        break;
      case 'reorder_group_tabs':
        dbFn(reorderGroupTabsHandler);
        break;
      case 'acknowledge_account':
        {
          if (!dbManager) { send({ id: msgId, success: false, error: 'DB not initialized' }); break; }
          const p = payload as any;
          acknowledgeAccount(dbManager.getDb(), p.accountId);
          send({ id: msgId, success: true, data: { acknowledged: true } });
          break;
        }
      case 'check_acknowledged':
        {
          if (!dbManager) { send({ id: msgId, success: false, error: 'DB not initialized' }); break; }
          const p = payload as any;
          const acknowledged = isAccountAcknowledged(dbManager.getDb(), p.accountId);
          send({ id: msgId, success: true, data: { acknowledged } });
          break;
        }
      case 'check_capture_rate_limit':
        {
          if (!dbManager) { send({ id: msgId, success: false, error: 'DB not initialized' }); break; }
          const p = payload as any;
          const allowed = checkAndConsumeRateLimit(dbManager.getDb(), p.accountId, p.platform, 'capture', p.config);
          send({ id: msgId, success: true, data: { allowed } });
          break;
        }
      case 'check_ai_rate_limit':
        {
          if (!dbManager) { send({ id: msgId, success: false, error: 'DB not initialized' }); break; }
          const p = payload as any;
          const allowed = checkAndConsumeRateLimit(dbManager.getDb(), p.accountId, p.platform, 'ai', p.config);
          send({ id: msgId, success: true, data: { allowed } });
          break;
        }
      case 'record_capture_audit':
        {
          if (!dbManager) { send({ id: msgId, success: false, error: 'DB not initialized' }); break; }
          const p = payload as any;
          recordCaptureResult(dbManager.getDb(), p.outcome, p.accountId, p.platform, p.reason);
          send({ id: msgId, success: true, data: { recorded: true } });
          break;
        }
      case 'record_ai_audit':
        {
          if (!dbManager) { send({ id: msgId, success: false, error: 'DB not initialized' }); break; }
          const p = payload as any;
          recordAiResult(dbManager.getDb(), p.outcome, p.accountId, p.platform, p.reason);
          send({ id: msgId, success: true, data: { recorded: true } });
          break;
        }
      case 'get_audit_events':
        {
          if (!dbManager) { send({ id: msgId, success: false, error: 'DB not initialized' }); break; }
          const p = payload as any;
          const events = getAuditEvents(dbManager.getDb(), p);
          send({ id: msgId, success: true, data: events });
          break;
        }
      case 'get_group_account_ids':
        {
          if (!dbManager) { send({ id: msgId, success: false, error: 'DB not initialized' }); break; }
          const p = payload as any;
          const accountIds = getGroupAccountIds(dbManager.getDb(), p.groupId);
          send({ id: msgId, success: true, data: accountIds });
          break;
        }
      default:
        send({ id: msgId, success: false, error: 'Unknown type: ' + type });
        break;
    }
  });

  initialize();
} else {
  console.error('[Worker] No parentPort available');
}
