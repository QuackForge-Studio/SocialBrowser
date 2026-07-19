import { parentPort as _parentPort } from "worker_threads";
import path from "path";
import { DatabaseManager } from "./database/database";
import { IngestionPipeline, createIngestionPipeline, PAYLOAD_SCHEMA_VERSION } from "./ingestion/ingestion";

const dbPath = process.env.SOCIAL_BROWSER_DB_PATH || path.join(process.cwd(), "social-browser.sqlite");
const port = _parentPort;

let dbManager: DatabaseManager | null = null;
let pipeline: IngestionPipeline | null = null;

function initialize(): void {
  try {
    dbManager = new DatabaseManager({
      dbPath,
      walMode: dbPath !== ":memory:",
      runMigrations: true,
    });
    dbManager.open();
    pipeline = createIngestionPipeline(dbManager.getDb());
    console.log("[Worker] Initialized successfully");
    port?.postMessage({ id: "ready", success: true, data: { version: "0.1.0", dbPath } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Worker] Failed to initialize:", msg);
    port?.postMessage({ id: "ready", success: false, error: msg });
  }
}

function processCaptureEvent(channel: string, data: Record<string, unknown>): unknown {
  if (!pipeline) {
    return { status: "error", reason: "Ingestion pipeline not initialized" };
  }
  const platform = data.platform as string;
  const accountId = data.accountId as string;
  const batchId = pipeline.ensureActiveBatch(accountId);
  const adapterVersion = (data.adapterVersion as number) || 1;
  const meta = { platform, accountId, adapterVersion, payloadSchemaVersion: PAYLOAD_SCHEMA_VERSION, batchId };

  switch (channel) {
    case "capture:post": {
      const np = data.normalizedPost as Record<string, unknown>;
      return pipeline.ingestPost({
        platformPostId: np.platformPostId as string,
        contentText: np.contentText as string | undefined,
        mediaRefs: np.mediaRefs as string | undefined,
        authorHandle: np.authorHandle as string | undefined,
        publishedAt: np.publishedAt as string | undefined,
      }, meta);
    }
    case "capture:snapshot": {
      const snap = data.snapshot as Record<string, unknown>;
      const dbo = dbManager!.getDb();
      const row = dbo.prepare("SELECT id FROM posts WHERE account_id = ? AND platform_post_id = ?").get(accountId, data.postId) as { id: string } | undefined;
      if (row) {
        return pipeline.ingestSnapshot(row.id, {
          views: snap.views as number | undefined,
          likes: snap.likes as number | undefined,
          commentsCount: snap.commentsCount as number | undefined,
          shares: snap.shares as number | undefined,
          otherMetrics: snap.otherMetrics as string | undefined,
        }, meta);
      }
      return { status: "rejected", reason: "Post not found for snapshot" };
    }
    case "capture:comment": {
      const cmt = data.comment as Record<string, unknown>;
      const dbo = dbManager!.getDb();
      const row = dbo.prepare("SELECT id FROM posts WHERE account_id = ? AND platform_post_id = ?").get(accountId, data.postId) as { id: string } | undefined;
      if (row) {
        return pipeline.ingestComment(row.id, {
          platformCommentId: cmt.platformCommentId as string | undefined,
          authorHandle: cmt.authorHandle as string | undefined,
          text: cmt.text as string | undefined,
        }, meta);
      }
      return { status: "rejected", reason: "Post not found for comment" };
    }
    case "capture:adapter-ready":
      return pipeline.handleAdapterReady(data as unknown as { platform: string; accountId: string; adapterVersion: number });
    case "capture:error":
      pipeline.handleError(data as unknown as { platform: string; accountId: string; error: string }, batchId);
      return { status: "logged", error: data.error };
    default:
      return null;
  }
}

// Listen for messages from the main process
if (port) {
  port.on("message", (msg: { type: string; payload?: { channel: string; data: Record<string, unknown> }; id: string }) => {
    const { type, payload, id: msgId } = msg;

    switch (type) {
      case "ping":
        port.postMessage({ id: msgId, success: true, data: { pong: true, version: "0.1.0" } });
        break;

      case "process_capture":
        try {
          if (!payload) {
            port.postMessage({ id: msgId, success: false, error: "Missing payload" });
            break;
          }
          const result = processCaptureEvent(payload.channel, payload.data);
          port.postMessage({ id: msgId, success: true, data: result });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error("[Worker] Capture processing error:", errorMsg);
          port.postMessage({ id: msgId, success: false, error: errorMsg });
        }
        break;

      case "shutdown":
        try {
          if (dbManager) {
            dbManager.close();
            dbManager = null;
            pipeline = null;
          }
          port.postMessage({ id: msgId, success: true, data: { shutdown: true } });
          process.exit(0);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          port.postMessage({ id: msgId, success: false, error: errorMsg });
          process.exit(1);
        }
        break;

      default:
        port.postMessage({ id: msgId, success: false, error: "Unknown message type: " + type });
        break;
    }
  });

  // Initialize on startup
  initialize();
} else {
  console.error("[Worker] No parentPort available - not running as a worker thread");
}
