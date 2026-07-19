import { ipcMain, WebContents } from "electron";
import { z } from "zod";
import { platformViewRegistry, type PlatformViewEntry } from "./platform-view-registry";

const PLATFORM_ORIGINS: Record<string, string[]> = {
  x: ["https://x.com", "https://twitter.com"],
  threads: ["https://threads.net"],
  instagram: ["https://instagram.com"],
  tiktok: ["https://tiktok.com"],
  facebook: ["https://facebook.com", "https://www.facebook.com", "https://fb.com"],
};

const platformSchema = z.enum(["x", "threads", "instagram", "tiktok", "facebook"]);
const accountIdSchema = z.string().min(1, "accountId must not be empty");

const capturePostSchema = z.object({
  platform: platformSchema,
  accountId: accountIdSchema,
  normalizedPost: z.object({
    platformPostId: z.string().min(1, "platformPostId must not be empty"),
    contentText: z.string().optional(),
    mediaRefs: z.string().optional(),
    authorHandle: z.string().optional(),
    publishedAt: z.string().optional(),
  }),
});

const captureSnapshotSchema = z.object({
  platform: platformSchema,
  accountId: accountIdSchema,
  postId: z.string().min(1, "postId must not be empty"),
  snapshot: z.object({
    views: z.number().int().nonnegative().optional(),
    likes: z.number().int().nonnegative().optional(),
    commentsCount: z.number().int().nonnegative().optional(),
    shares: z.number().int().nonnegative().optional(),
    otherMetrics: z.string().optional(),
  }),
});

const captureCommentSchema = z.object({
  platform: platformSchema,
  accountId: accountIdSchema,
  postId: z.string().min(1, "postId must not be empty"),
  comment: z.object({
    platformCommentId: z.string().optional(),
    authorHandle: z.string().optional(),
    text: z.string().optional(),
  }),
});

const captureAdapterReadySchema = z.object({
  platform: platformSchema,
  accountId: accountIdSchema,
  adapterVersion: z.number().int().positive("adapterVersion must be positive"),
});

const captureErrorSchema = z.object({
  platform: platformSchema,
  accountId: accountIdSchema,
  error: z.string().min(1, "error must not be empty"),
});

const captureSchemas: Record<string, z.ZodTypeAny> = {
  "capture:post": capturePostSchema,
  "capture:snapshot": captureSnapshotSchema,
  "capture:comment": captureCommentSchema,
  "capture:adapter-ready": captureAdapterReadySchema,
  "capture:error": captureErrorSchema,
};

export interface ValidationResult {
  valid: boolean;
  data: unknown;
  reason?: string;
}

function validateSchema(channel: string, body: unknown): ValidationResult {
  const schema = captureSchemas[channel];
  if (!schema) {
    return { valid: false, data: null, reason: "Unknown channel: " + channel };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return { valid: false, data: null, reason: "Schema validation failed: " + result.error.message };
  }
  return { valid: true, data: result.data };
}

function validateSender(sender: WebContents): ValidationResult {
  const entry = platformViewRegistry.get(sender.id);
  if (!entry) {
    return { valid: false, data: null, reason: "Unknown sender webContents ID: " + sender.id };
  }
  return { valid: true, data: entry };
}

function validatePartition(entry: PlatformViewEntry): ValidationResult {
  const expectedPartition = "persist:social-browser:" + entry.platform + ":" + entry.accountId;
  if (entry.partition !== expectedPartition) {
    return {
      valid: false,
      data: null,
      reason: "Partition mismatch: registered=" + entry.partition + ", expected=" + expectedPartition,
    };
  }
  return { valid: true, data: null };
}

function validatePlatform(body: { platform: string }, entry: PlatformViewEntry): ValidationResult {
  if (body.platform !== entry.platform) {
    return {
      valid: false,
      data: null,
      reason: "Platform mismatch: payload=" + body.platform + ", sender=" + entry.platform,
    };
  }
  return { valid: true, data: null };
}

function validateOrigin(sender: WebContents, entry: PlatformViewEntry): ValidationResult {
  try {
    const url = sender.getURL();
    const expectedOrigins = PLATFORM_ORIGINS[entry.platform];
    if (!expectedOrigins || expectedOrigins.length === 0) {
      return { valid: false, data: null, reason: "No origins defined for platform: " + entry.platform };
    }
    const originMatches = expectedOrigins.some((expectedOrigin: string) => url.startsWith(expectedOrigin));
    if (!originMatches) {
      return {
        valid: false,
        data: null,
        reason: "Origin mismatch: URL=" + url + ", expected origins=" + expectedOrigins.join(", "),
      };
    }
    return { valid: true, data: null };
  } catch {
    return { valid: false, data: null, reason: "Failed to get sender URL" };
  }
}

export type WorkerDispatchFn = (channel: string, data: unknown) => void;

let dispatchToWorker: WorkerDispatchFn = () => {};

export function setWorkerDispatch(fn: WorkerDispatchFn): void {
  dispatchToWorker = fn;
}

export function validateAndDispatch(
  channel: string,
  sender: WebContents,
  body: unknown
): boolean {
  const schemaResult = validateSchema(channel, body);
  if (!schemaResult.valid) {
    console.warn("[IPC-Gate] " + schemaResult.reason);
    return false;
  }
  const parsedBody = schemaResult.data as Record<string, unknown>;

  const senderResult = validateSender(sender);
  if (!senderResult.valid) {
    console.warn("[IPC-Gate] " + senderResult.reason);
    return false;
  }
  const entry = senderResult.data as PlatformViewEntry;

  const partitionResult = validatePartition(entry);
  if (!partitionResult.valid) {
    console.warn("[IPC-Gate] " + partitionResult.reason);
    return false;
  }

  const platformResult = validatePlatform(parsedBody as { platform: string }, entry);
  if (!platformResult.valid) {
    console.warn("[IPC-Gate] " + platformResult.reason);
    return false;
  }

  const originResult = validateOrigin(sender, entry);
  if (!originResult.valid) {
    console.warn("[IPC-Gate] " + originResult.reason);
    return false;
  }

  dispatchToWorker(channel, parsedBody);
  return true;
}

const CAPTURE_CHANNELS = [
  "capture:post",
  "capture:snapshot",
  "capture:comment",
  "capture:adapter-ready",
  "capture:error",
];

export function wireUpIpcGate(workerDispatch: WorkerDispatchFn): void {
  setWorkerDispatch(workerDispatch);
  for (const channel of CAPTURE_CHANNELS) {
    ipcMain.on(channel, (event, body: unknown) => {
      validateAndDispatch(channel, event.sender, body);
    });
  }
}

export function removeIpcGateHandlers(): void {
  for (const channel of CAPTURE_CHANNELS) {
    ipcMain.removeAllListeners(channel);
  }
}
