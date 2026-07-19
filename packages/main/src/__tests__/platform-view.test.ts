import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock objects - defined before vi.mock so the factory can close over them
const mockExposeInMainWorld = vi.fn();
const mockIpcRendererSend = vi.fn();
const mockSessionFromPartition = vi.fn();

// Use regular functions for mocks that need to be constructors
const mockWebContentsViewSetBounds = vi.fn();
const mockWebContentsViewSetVisible = vi.fn();
const mockWebContentsClose = vi.fn();
const mockWebContentsIsDestroyed = vi.fn().mockReturnValue(false);
const mockWebContentsOn = vi.fn();
const mockSetWindowOpenHandler = vi.fn();
const mockWebContentsLoadURL = vi.fn();

const mockWebContentsView = vi.fn().mockImplementation(function () {
  return {
    setBounds: mockWebContentsViewSetBounds,
    setVisible: mockWebContentsViewSetVisible,
    webContents: {
      close: mockWebContentsClose,
      isDestroyed: mockWebContentsIsDestroyed,
      on: mockWebContentsOn,
      setWindowOpenHandler: mockSetWindowOpenHandler,
      loadURL: mockWebContentsLoadURL,
    },
  };
});

const mockSession = {
  cookies: { flushStore: vi.fn().mockResolvedValue(undefined) },
  setPermissionRequestHandler: vi.fn(),
  on: vi.fn(),
};

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
  ipcRenderer: {
    send: mockIpcRendererSend,
  },
  WebContentsView: mockWebContentsView,
  session: {
    fromPartition: mockSessionFromPartition,
  },
}));

// ============================================================
// Preload Capture Tests
// ============================================================
describe('Preload Capture Script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should expose exactly 5 methods on __socialBrowser (VAL-CAPTURE-005)', async () => {
    await import('../preload-capture');
    expect(mockExposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(mockExposeInMainWorld).toHaveBeenCalledWith(
      '__socialBrowser',
      expect.any(Object)
    );
    const apiObject = mockExposeInMainWorld.mock.calls[0][1];
    const keys = Object.keys(apiObject).sort();
    expect(keys).toEqual([
      'sendAdapterReady',
      'sendComment',
      'sendError',
      'sendPost',
      'sendSnapshot',
    ]);
    expect(keys).toHaveLength(5);
  });

  it('should NOT expose ipcRenderer directly (VAL-CAPTURE-006, VAL-CAPTURE-007)', async () => {
    await import('../preload-capture');
    const apiObject = mockExposeInMainWorld.mock.calls[0][1];
    expect(apiObject).not.toHaveProperty('ipcRenderer');
    expect(apiObject).not.toHaveProperty('send');
    expect(apiObject).not.toHaveProperty('invoke');
    expect(apiObject).not.toHaveProperty('on');
  });

  it('should route sendPost to capture:post IPC channel (VAL-CAPTURE-008)', async () => {
    await import('../preload-capture');
    const apiObject = mockExposeInMainWorld.mock.calls[0][1];
    const data = { platform: 'x', accountId: 'test-uuid', normalizedPost: { platformPostId: '123' } };

    apiObject.sendPost(data);

    expect(mockIpcRendererSend).toHaveBeenCalledTimes(1);
    expect(mockIpcRendererSend).toHaveBeenCalledWith('capture:post', data);
  });

  it('should route sendSnapshot to capture:snapshot IPC channel (VAL-CAPTURE-009)', async () => {
    await import('../preload-capture');
    const apiObject = mockExposeInMainWorld.mock.calls[0][1];
    const data = { platform: 'x', accountId: 'test-uuid', postId: 'post-1', snapshot: { likes: 10 } };

    apiObject.sendSnapshot(data);

    expect(mockIpcRendererSend).toHaveBeenCalledTimes(1);
    expect(mockIpcRendererSend).toHaveBeenCalledWith('capture:snapshot', data);
  });

  it('should route sendComment to capture:comment IPC channel (VAL-CAPTURE-010)', async () => {
    await import('../preload-capture');
    const apiObject = mockExposeInMainWorld.mock.calls[0][1];
    const data = { platform: 'x', accountId: 'test-uuid', postId: 'post-1', comment: { text: 'nice post' } };

    apiObject.sendComment(data);

    expect(mockIpcRendererSend).toHaveBeenCalledTimes(1);
    expect(mockIpcRendererSend).toHaveBeenCalledWith('capture:comment', data);
  });

  it('should route sendAdapterReady to capture:adapter-ready IPC channel (VAL-CAPTURE-011)', async () => {
    await import('../preload-capture');
    const apiObject = mockExposeInMainWorld.mock.calls[0][1];
    const data = { platform: 'x', accountId: 'test-uuid', adapterVersion: 1 };

    apiObject.sendAdapterReady(data);

    expect(mockIpcRendererSend).toHaveBeenCalledTimes(1);
    expect(mockIpcRendererSend).toHaveBeenCalledWith('capture:adapter-ready', data);
  });

  it('should route sendError to capture:error IPC channel (VAL-CAPTURE-012)', async () => {
    await import('../preload-capture');
    const apiObject = mockExposeInMainWorld.mock.calls[0][1];
    const data = { platform: 'x', accountId: 'test-uuid', error: 'Adapter failed to initialize' };

    apiObject.sendError(data);

    expect(mockIpcRendererSend).toHaveBeenCalledTimes(1);
    expect(mockIpcRendererSend).toHaveBeenCalledWith('capture:error', data);
  });

  it('should not have a generic bridge or catch-all method (VAL-CAPTURE-006)', async () => {
    await import('../preload-capture');
    const apiObject = mockExposeInMainWorld.mock.calls[0][1];

    expect(apiObject).not.toHaveProperty('send');
    expect(apiObject).not.toHaveProperty('invoke');
    expect(apiObject).not.toHaveProperty('on');
    expect(apiObject).not.toHaveProperty('call');
    expect(apiObject).not.toHaveProperty('bridge');

    expect(Object.keys(apiObject)).toHaveLength(5);
  });
});

// ============================================================
// PlatformView Tests
// ============================================================
describe('PlatformView', () => {
  const viewConfig = {
    platform: 'x' as const,
    accountId: '550e8400-e29b-41d4-a716-446655440000',
    preloadPath: '/path/to/preload-capture.js',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSessionFromPartition.mockReturnValue(mockSession);
  });

  it('should create WebContentsView with nodeIntegration:false (VAL-CAPTURE-001)', async () => {
    const { PlatformView } = await import('../platform-view');
    new PlatformView(viewConfig);

    expect(mockWebContentsView).toHaveBeenCalledTimes(1);
    const options = mockWebContentsView.mock.calls[0][0];
    expect(options.webPreferences.nodeIntegration).toBe(false);
  });

  it('should create WebContentsView with contextIsolation:true (VAL-CAPTURE-002)', async () => {
    const { PlatformView } = await import('../platform-view');
    new PlatformView(viewConfig);

    const options = mockWebContentsView.mock.calls[0][0];
    expect(options.webPreferences.contextIsolation).toBe(true);
  });

  it('should create WebContentsView with sandbox:true (VAL-CAPTURE-003)', async () => {
    const { PlatformView } = await import('../platform-view');
    new PlatformView(viewConfig);

    const options = mockWebContentsView.mock.calls[0][0];
    expect(options.webPreferences.sandbox).toBe(true);
  });

  it('should create WebContentsView with webSecurity:true (VAL-CAPTURE-004)', async () => {
    const { PlatformView } = await import('../platform-view');
    new PlatformView(viewConfig);

    const options = mockWebContentsView.mock.calls[0][0];
    expect(options.webPreferences.webSecurity).toBe(true);
  });

  it('should set the preload path to the capture preload script', async () => {
    const { PlatformView } = await import('../platform-view');
    new PlatformView(viewConfig);

    const options = mockWebContentsView.mock.calls[0][0];
    expect(options.webPreferences.preload).toBe('/path/to/preload-capture.js');
  });

  it('should create a session via session.fromPartition with correct partition', async () => {
    const { PlatformView } = await import('../platform-view');
    mockSessionFromPartition.mockReturnValue(mockSession);
    new PlatformView(viewConfig);

    expect(mockSessionFromPartition).toHaveBeenCalledTimes(1);
    const partitionArg = mockSessionFromPartition.mock.calls[0][0];
    expect(partitionArg).toMatch(/^persist:social-browser:x:/);
    expect(partitionArg).toContain('550e8400-e29b-41d4-a716-446655440000');
  });

  it('should configure webContents with navigation restrictions', async () => {
    const { PlatformView } = await import('../platform-view');
    mockSessionFromPartition.mockReturnValue(mockSession);
    new PlatformView(viewConfig);

    expect(mockWebContentsOn).toHaveBeenCalledWith('will-navigate', expect.any(Function));
    expect(mockSetWindowOpenHandler).toHaveBeenCalled();
  });

  it('should provide getView() that returns the WebContentsView', async () => {
    const { PlatformView } = await import('../platform-view');
    mockSessionFromPartition.mockReturnValue(mockSession);
    const pv = new PlatformView(viewConfig);

    expect(pv.getView()).toBeDefined();
  });

  it('should provide getPlatform() returning the platform', async () => {
    const { PlatformView } = await import('../platform-view');
    mockSessionFromPartition.mockReturnValue(mockSession);
    const pv = new PlatformView(viewConfig);

    expect(pv.getPlatform()).toBe('x');
  });

  it('should provide getAccountId() returning the accountId', async () => {
    const { PlatformView } = await import('../platform-view');
    mockSessionFromPartition.mockReturnValue(mockSession);
    const pv = new PlatformView(viewConfig);

    expect(pv.getAccountId()).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('should provide close() that destroys webContents', async () => {
    const { PlatformView } = await import('../platform-view');
    mockSessionFromPartition.mockReturnValue(mockSession);
    const pv = new PlatformView(viewConfig);

    pv.close();
    expect(mockWebContentsClose).toHaveBeenCalledTimes(1);
  });

  it('should set up permission handler that denies by default', async () => {
    const { PlatformView } = await import('../platform-view');
    mockSessionFromPartition.mockReturnValue(mockSession);
    new PlatformView(viewConfig);

    expect(mockSession.setPermissionRequestHandler).toHaveBeenCalled();
  });
});
