import { parentPort as _parentPort } from "worker_threads";
import path from "path";
import { DatabaseManager } from "./database/database";
import { IngestionPipeline, createIngestionPipeline, PAYLOAD_SCHEMA_VERSION } from "./ingestion/ingestion";
import { setActiveProvider, getActiveProviderName, getProvider } from "./ai/provider-registry";

const dbPath = process.env.SOCIAL_BROWSER_DB_PATH || path.join(process.cwd(), "social-browser.sqlite");
const port = _parentPort;

let dbManager: DatabaseManager | null = null;
let pipeline: IngestionPipeline | null = null;

/**
 * Pending API key requests awaiting a response from the main process.
 */
const pendingKeyRequests = new Map<string, { resolve: (key: string) => void; reject: (err: Error) => void }>();

/**
 * Request an API key from the main process via the worker message protocol.
 * The main process reads the key from OS secure storage and returns it.
 */
function requestApiKeyFromMain(provider: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = "key-req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
    pendingKeyRequests.set(id, { resolve, reject });
    port?.postMessage({ type: "get-api-key", payload: { provider }, id });

    const timeout = setTimeout(() => {
      if (pendingKeyRequests.has(id)) {
        pendingKeyRequests.delete(id);
        reject(new Error("API key request timed out for provider: " + provider));
      }
    }, 15000);

    pendingKeyRequests.set(id, {
      resolve: (key: string) => {
        clearTimeout(timeout);
        resolve(key);
      },
      reject: (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
  });
}

/**
 * Get or create the AI provider, fetching the API key from the main process
 * if needed (for providers that require authentication).
 */
async function ensureProvider(providerName?: string): Promise<void> {
  const name = providerName || getActiveProviderName();
  const config: Record<string, unknown> = {};

  // For real providers, request the API key from the main process
  if (name !== "fake") {
    try {
      const apiKey = await requestApiKeyFromMain(name);
      config.apiKey = apiKey;
      config.model = process.env.AI_MODEL || undefined;
      config.embeddingModel = process.env.AI_EMBEDDING_MODEL || undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Worker] Failed to get API key for", name + ":", msg);
    }
  }

  try {
    setActiveProvider(name, config);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Worker] Failed to set active provider:", msg);
  }
}

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
