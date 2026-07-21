import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebContents } from "electron";
import { platformViewRegistry } from "../platform-view-registry";
import type { PlatformViewEntry } from "../platform-view-registry";

// Track console.warn calls
const mockConsoleWarn = vi.fn();

// Mock electron module
vi.mock("electron", () => {
  const mockIpcMainOn = vi.fn();
  const mockIpcMainRemoveAllListeners = vi.fn();
  return {
    ipcMain: {
      on: mockIpcMainOn,
      removeAllListeners: mockIpcMainRemoveAllListeners,
    },
  };
});

// Import after mocking
import { ipcMain } from "electron";
import {
  validateAndDispatch,
  wireUpIpcGate,
  removeIpcGateHandlers,
  setWorkerDispatch,
  type WorkerDispatchFn,
} from "../ipc-gate";

interface MockSender {
  id: number;
  getURL: ReturnType<typeof vi.fn>;
  session: Record<string, never>;
}

function createMockSender(overrides: Partial<{
  id: number;
  url: string;
  sessionName: string;
}> = {}): MockSender {
  const config = { id: 1001, url: "https://x.com/home", sessionName: "persist:social-browser:x:test", ...overrides };
  return {
    id: config.id,
    getURL: vi.fn().mockReturnValue(config.url),
    session: {},
  };
}

describe("IPC Validation Gate", () => {
  const TEST_SENDER_ID = 1001;
  const UNKNOWN_SENDER_ID = 9999;
  const TEST_PLATFORM = "x";
  const TEST_ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440000";
  const TEST_PARTITION = "persist:social-browser:x:550e8400-e29b-41d4-a716-446655440000";

  let mockSender: MockSender;
  let workerDispatch: WorkerDispatchFn;
  let workerDispatchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    console.warn = mockConsoleWarn;

    mockSender = createMockSender({ id: TEST_SENDER_ID, url: "https://x.com/some-user" });

    workerDispatchMock = vi.fn();
    workerDispatch = workerDispatchMock as unknown as WorkerDispatchFn;
    setWorkerDispatch(workerDispatch);

    // Register a mock PlatformView
    const entry: PlatformViewEntry = {
      webContentsId: TEST_SENDER_ID,
      platform: TEST_PLATFORM,
      accountId: TEST_ACCOUNT_ID,
      partition: TEST_PARTITION,
    };
    platformViewRegistry.register(entry);
  });

  afterEach(() => {
    platformViewRegistry.clear();
    removeIpcGateHandlers();
  });

  // ============================================================
  // VAL-CAPTURE-014: Valid capture:post passes all gates
  // ============================================================
  it("should accept a valid capture:post message (VAL-CAPTURE-014)", () => {
    const validPost = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      normalizedPost: {
        platformPostId: "post-12345",
        contentText: "This is a test post",
        authorHandle: "@testuser",
        publishedAt: "2026-07-19T12:00:00Z",
      },
    };

    const result = validateAndDispatch("capture:post", mockSender as unknown as WebContents, validPost);

    expect(result).toBe(true);
    expect(workerDispatchMock).toHaveBeenCalledTimes(1);
    expect(workerDispatchMock).toHaveBeenCalledWith("capture:post", expect.objectContaining({
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
    }));
  });

  // ============================================================
  // VAL-CAPTURE-015: Missing required fields dropped
  // ============================================================
  it("should reject capture:post with missing required fields (VAL-CAPTURE-015)", () => {
    const invalidPost = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
    };

    const result = validateAndDispatch("capture:post", mockSender as unknown as WebContents, invalidPost);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Schema validation failed")
    );
  });

  // ============================================================
  // VAL-CAPTURE-016: Wrong field types dropped
  // ============================================================
  it("should reject capture:post with wrong field types (VAL-CAPTURE-016)", () => {
    const wrongTypePost = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      normalizedPost: {
        platformPostId: 12345, // should be string, not number
      },
    };

    const result = validateAndDispatch("capture:post", mockSender as unknown as WebContents, wrongTypePost);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Schema validation failed")
    );
  });

  // ============================================================
  // VAL-CAPTURE-017: Unknown sender webContents ID dropped
  // ============================================================
  it("should reject message from unknown sender (VAL-CAPTURE-017)", () => {
    const unknownSender = createMockSender({ id: UNKNOWN_SENDER_ID, url: "https://x.com/some-user" });

    const validPost = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      normalizedPost: {
        platformPostId: "post-12345",
      },
    };

    const result = validateAndDispatch("capture:post", unknownSender as unknown as WebContents, validPost);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Unknown sender webContents ID")
    );
  });

  // ============================================================
  // VAL-CAPTURE-018: Origin mismatch dropped
  // ============================================================
  it("should reject message with origin mismatch (VAL-CAPTURE-018)", () => {
    mockSender.getURL.mockReturnValue("https://evil.com/phishing");

    const validPost = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      normalizedPost: {
        platformPostId: "post-12345",
      },
    };

    const result = validateAndDispatch("capture:post", mockSender as unknown as WebContents, validPost);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Origin mismatch")
    );
  });

  // ============================================================
  // VAL-CAPTURE-019: Partition mismatch dropped
  // ============================================================
  it("should reject message with partition mismatch (VAL-CAPTURE-019)", () => {
    const wrongPartitionEntry: PlatformViewEntry = {
      webContentsId: TEST_SENDER_ID,
      platform: TEST_PLATFORM,
      accountId: TEST_ACCOUNT_ID,
      partition: "persist:social-browser:x:WRONG-ACCOUNT-ID",
    };
    platformViewRegistry.clear();
    platformViewRegistry.register(wrongPartitionEntry);

    const validPost = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      normalizedPost: {
        platformPostId: "post-12345",
      },
    };

    const result = validateAndDispatch("capture:post", mockSender as unknown as WebContents, validPost);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Partition mismatch")
    );
  });

  // ============================================================
  // VAL-CAPTURE-020: Valid message reaches worker queue
  // ============================================================
  it("should dispatch valid message to worker queue (VAL-CAPTURE-020)", () => {
    const validPost = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      normalizedPost: {
        platformPostId: "post-67890",
        contentText: "Another test post",
      },
    };

    const result = validateAndDispatch("capture:post", mockSender as unknown as WebContents, validPost);

    expect(result).toBe(true);
    expect(workerDispatchMock).toHaveBeenCalledTimes(1);
    expect(workerDispatchMock).toHaveBeenCalledWith("capture:post", validPost);
  });

  // ============================================================
  // Platform mismatch in payload vs sender
  // ============================================================
  it("should reject message where payload platform differs from sender platform", () => {
    const wrongPlatformPost = {
      platform: "threads",
      accountId: TEST_ACCOUNT_ID,
      normalizedPost: {
        platformPostId: "post-12345",
      },
    };

    const result = validateAndDispatch("capture:post", mockSender as unknown as WebContents, wrongPlatformPost);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Platform mismatch")
    );
  });

  // ============================================================
  
  // ============================================================
  // VAL-WORKSPACE-007: Capture account ID must match registered view
  // ============================================================
  it("should reject capture when payload account ID differs from registered PlatformView account ID (VAL-WORKSPACE-007)", () => {
    const mismatchedAccountPost = {
      platform: "x",
      accountId: "a-different-account-id",
      normalizedPost: {
        platformPostId: "post-12345",
        contentText: "This is from a different account",
      },
    };

    const result = validateAndDispatch("capture:post", mockSender as unknown as WebContents, mismatchedAccountPost);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Account ID mismatch")
    );
  });

  it("should reject capture:snapshot when payload account ID differs from registered view", () => {
    const mismatchedSnapshot = {
      platform: "x",
      accountId: "a-different-account-id",
      postId: "post-123",
      snapshot: { likes: 5 },
    };

    const result = validateAndDispatch("capture:snapshot", mockSender as unknown as WebContents, mismatchedSnapshot);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Account ID mismatch")
    );
  });

  it("should reject capture:comment when payload account ID differs from registered view", () => {
    const mismatchedComment = {
      platform: "x",
      accountId: "a-different-account-id",
      postId: "post-123",
      comment: { text: "Nice!" },
    };

    const result = validateAndDispatch("capture:comment", mockSender as unknown as WebContents, mismatchedComment);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Account ID mismatch")
    );
  });

  it("should reject capture:adapter-ready when payload account ID differs from registered view", () => {
    const mismatchedAdapterReady = {
      platform: "x",
      accountId: "a-different-account-id",
      adapterVersion: 1,
    };

    const result = validateAndDispatch("capture:adapter-ready", mockSender as unknown as WebContents, mismatchedAdapterReady);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Account ID mismatch")
    );
  });

  it("should reject capture:error when payload account ID differs from registered view", () => {
    const mismatchedError = {
      platform: "x",
      accountId: "a-different-account-id",
      error: "Something went wrong",
    };

    const result = validateAndDispatch("capture:error", mockSender as unknown as WebContents, mismatchedError);

    expect(result).toBe(false);
    expect(workerDispatchMock).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Account ID mismatch")
    );
  });

  it("should accept capture:post when payload account ID matches registered view account ID", () => {
    const matchingPost = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      normalizedPost: {
        platformPostId: "post-12345",
        contentText: "Test from my own account",
      },
    };

    const result = validateAndDispatch("capture:post", mockSender as unknown as WebContents, matchingPost);

    expect(result).toBe(true);
    expect(workerDispatchMock).toHaveBeenCalledTimes(1);
    expect(workerDispatchMock).toHaveBeenCalledWith("capture:post", matchingPost);
  });
// All capture channels validated
  // ============================================================
  it("should validate all capture:* channels with their own schemas", () => {
    // Valid snapshot
    const validSnapshot = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      postId: "post-123",
      snapshot: {
        likes: 10,
        shares: 5,
        commentsCount: 3,
      },
    };
    expect(validateAndDispatch("capture:snapshot", mockSender as unknown as WebContents, validSnapshot)).toBe(true);
    expect(workerDispatchMock).toHaveBeenCalledWith("capture:snapshot", validSnapshot);

    // Valid comment
    const validComment = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      postId: "post-123",
      comment: {
        platformCommentId: "comment-1",
        authorHandle: "@other",
        text: "Great post!",
      },
    };
    expect(validateAndDispatch("capture:comment", mockSender as unknown as WebContents, validComment)).toBe(true);
    expect(workerDispatchMock).toHaveBeenCalledWith("capture:comment", validComment);

    // Valid adapter-ready
    const validAdapterReady = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      adapterVersion: 1,
    };
    expect(validateAndDispatch("capture:adapter-ready", mockSender as unknown as WebContents, validAdapterReady)).toBe(true);
    expect(workerDispatchMock).toHaveBeenCalledWith("capture:adapter-ready", validAdapterReady);

    // Valid error
    const validError = {
      platform: "x",
      accountId: TEST_ACCOUNT_ID,
      error: "Adapter failed to initialize",
    };
    expect(validateAndDispatch("capture:error", mockSender as unknown as WebContents, validError)).toBe(true);
    expect(workerDispatchMock).toHaveBeenCalledWith("capture:error", validError);

    expect(workerDispatchMock).toHaveBeenCalledTimes(4);
  });

  // ============================================================
  // PlatformViewRegistry tests
  // ============================================================
  describe("PlatformViewRegistry", () => {
    it("should register and retrieve entries", () => {
      const entry: PlatformViewEntry = {
        webContentsId: 42,
        platform: "threads",
        accountId: "uuid-1",
        partition: "persist:social-browser:threads:uuid-1",
      };
      platformViewRegistry.register(entry);
      expect(platformViewRegistry.get(42)).toBe(entry);
      expect(platformViewRegistry.has(42)).toBe(true);
    });

    it("should unregister entries", () => {
      platformViewRegistry.register({
        webContentsId: 42,
        platform: "threads",
        accountId: "uuid-1",
        partition: "persist:social-browser:threads:uuid-1",
      });
      platformViewRegistry.unregister(42);
      expect(platformViewRegistry.get(42)).toBeUndefined();
      expect(platformViewRegistry.has(42)).toBe(false);
    });

    it("should track count correctly", () => {
      platformViewRegistry.clear();
      expect(platformViewRegistry.getCount()).toBe(0);
      platformViewRegistry.register({
        webContentsId: 1, platform: "x", accountId: "a", partition: "p:a",
      });
      expect(platformViewRegistry.getCount()).toBe(1);
      platformViewRegistry.register({
        webContentsId: 2, platform: "x", accountId: "b", partition: "p:b",
      });
      expect(platformViewRegistry.getCount()).toBe(2);
    });

    it("should return all entries", () => {
      platformViewRegistry.clear();
      platformViewRegistry.register({
        webContentsId: 1, platform: "x", accountId: "a", partition: "p:a",
      });
      platformViewRegistry.register({
        webContentsId: 2, platform: "threads", accountId: "b", partition: "p:b",
      });
      expect(platformViewRegistry.getAll()).toHaveLength(2);
    });
  });

  // ============================================================
  // wireUpIpcGate tests
  // ============================================================
  describe("wireUpIpcGate", () => {
    it("should register ipcMain.on handlers for all capture channels", () => {
      wireUpIpcGate(vi.fn() as unknown as WorkerDispatchFn);
      expect(ipcMain.on).toHaveBeenCalledTimes(5);
      expect(ipcMain.on).toHaveBeenCalledWith("capture:post", expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith("capture:snapshot", expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith("capture:comment", expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith("capture:adapter-ready", expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith("capture:error", expect.any(Function));
    });
  });
});
