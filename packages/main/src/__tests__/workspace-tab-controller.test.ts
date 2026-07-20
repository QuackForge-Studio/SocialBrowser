import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== Mocks — use vi.hoisted to avoid hoisting issues with vi.mock =====

const mockIpcMainHandle = vi.hoisted(() => vi.fn());
const mockIpcMainRemoveHandler = vi.hoisted(() => vi.fn());

const mockVLMActivateTab = vi.hoisted(() => vi.fn());
const mockVLMActivateDashboard = vi.hoisted(() => vi.fn());
const mockVLMAddTab = vi.hoisted(() => vi.fn());
const mockVLMCloseTab = vi.hoisted(() => vi.fn());
const mockVLMGetTabs = vi.hoisted(() => vi.fn().mockReturnValue([]));

const mockSMGetOrCreateSession = vi.hoisted(() => vi.fn());
const mockSMHasSession = vi.hoisted(() => vi.fn());

const mockRegistryRegister = vi.hoisted(() => vi.fn());
const mockRegistryUnregister = vi.hoisted(() => vi.fn());
const mockRegistryGet = vi.hoisted(() => vi.fn());
const mockRegistryHas = vi.hoisted(() => vi.fn());
const mockRegistryClear = vi.hoisted(() => vi.fn());
const mockRegistryGetAll = vi.hoisted(() => vi.fn().mockReturnValue([]));

// Track created PlatformView instances for assertions
const mockPlatformViewInstances: any[] = [];

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcMainHandle,
    removeHandler: mockIpcMainRemoveHandler,
  },
  WebContentsView: vi.fn().mockImplementation(function () {
    return {
      setBounds: vi.fn(),
      setVisible: vi.fn(),
      webContents: {
        id: Math.floor(Math.random() * 10000),
        close: vi.fn(),
        isDestroyed: vi.fn().mockReturnValue(false),
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        loadURL: vi.fn(),
      },
    };
  }),
  session: {
    fromPartition: vi.fn().mockReturnValue({
      cookies: { flushStore: vi.fn().mockResolvedValue(undefined) },
      setPermissionRequestHandler: vi.fn(),
      on: vi.fn(),
    }),
  },
}));

vi.mock('../view-layout-manager', () => ({
  ViewLayoutManager: vi.fn().mockImplementation(function () {
    return {
      activateTab: mockVLMActivateTab,
      activateDashboard: mockVLMActivateDashboard,
      addTab: mockVLMAddTab,
      closeTab: mockVLMCloseTab,
      getTabs: mockVLMGetTabs,
    };
  }),
  SIDEBAR_WIDTH: 240,
  TAB_BAR_HEIGHT: 40,
}));

vi.mock('../session-manager', () => ({
  SessionManager: vi.fn().mockImplementation(function () {
    return {
      getOrCreateSession: mockSMGetOrCreateSession,
      hasSession: mockSMHasSession,
    };
  }),
}));

vi.mock('../platform-view', () => ({
  PlatformView: vi.fn().mockImplementation(function (config: any) {
    const instance = {
      view: {
        setBounds: vi.fn(),
        setVisible: vi.fn(),
        webContents: {
          id: Math.floor(Math.random() * 10000) + 1000,
          close: vi.fn(),
          isDestroyed: vi.fn().mockReturnValue(false),
          on: vi.fn(),
          setWindowOpenHandler: vi.fn(),
          loadURL: vi.fn(),
        },
      },
      getView: vi.fn().mockReturnThis(),
      getPlatform: vi.fn().mockReturnValue(config.platform),
      getAccountId: vi.fn().mockReturnValue(config.accountId),
      close: vi.fn(),
      config,
    };
    mockPlatformViewInstances.push(instance);
    return instance;
  }),
}));

vi.mock('../platform-view-registry', () => ({
  platformViewRegistry: {
    register: mockRegistryRegister,
    unregister: mockRegistryUnregister,
    get: mockRegistryGet,
    has: mockRegistryHas,
    clear: mockRegistryClear,
    getAll: mockRegistryGetAll,
  },
}));

// ===== Import after mocks =====
import { WorkspaceTabController } from '../workspace-tab-controller';

describe('WorkspaceTabController', () => {
  let controller: WorkspaceTabController;
  let mockWorkerRequest: ReturnType<typeof vi.fn>;
  let mockLayoutManager: any;
  let mockSessionManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatformViewInstances.length = 0;

    mockLayoutManager = {
      activateTab: mockVLMActivateTab,
      activateDashboard: mockVLMActivateDashboard,
      addTab: mockVLMAddTab,
      closeTab: mockVLMCloseTab,
      getTabs: mockVLMGetTabs,
    };

    mockSessionManager = {
      getOrCreateSession: mockSMGetOrCreateSession,
      hasSession: mockSMHasSession,
    };

    mockWorkerRequest = vi.fn();

    controller = new WorkspaceTabController(
      mockLayoutManager as any,
      mockSessionManager as any,
      mockWorkerRequest as any,
    );
  });

  afterEach(() => {
    controller.dispose();
  });

  // ==================================================================
  // Initialization & IPC Registration
  // ==================================================================

  describe('initialization', () => {
    it('should register all IPC handlers on construction', () => {
      expect(mockIpcMainHandle).toHaveBeenCalledTimes(9);

      const channels = mockIpcMainHandle.mock.calls.map((c: any[]) => c[0]).sort();
      expect(channels).toEqual([
        'dash:workspace:close-tab',
        'dash:workspace:get-state',
        'dash:workspace:get-tabs',
        'dash:workspace:group-deleted',
        'dash:workspace:membership-removed',
        'dash:workspace:open-tab',
        'dash:workspace:set-active-group',
        'dash:workspace:show-dashboard',
        'dash:workspace:workspace-deleted',
      ]);
    });

    it('should start with null active state', () => {
      const state = controller.getState();
      expect(state.activeWorkspaceId).toBeNull();
      expect(state.activeGroupId).toBeNull();
    });
  });

  describe('removeIpcHandlers', () => {
    it('should remove all registered IPC handlers', () => {
      controller.removeIpcHandlers();
      expect(mockIpcMainRemoveHandler).toHaveBeenCalledTimes(9);
    });
  });

  // ==================================================================
  // setActiveGroup — VAL-WORKSPACE-003, VAL-WORKSPACE-022
  // ==================================================================

  describe('setActiveGroup', () => {
    it('should update active workspace and group', async () => {
      const result = await controller.setActiveGroup('ws-1', 'group-a');
      expect(result).toEqual({ success: true });
      const state = controller.getState();
      expect(state.activeWorkspaceId).toBe('ws-1');
      expect(state.activeGroupId).toBe('group-a');
    });

    it('should activate dashboard when switching groups', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      expect(mockVLMActivateDashboard).toHaveBeenCalled();
    });

    it('should hide shown tabs from previous group', async () => {
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.setActiveGroup('ws-1', 'group-a');
      await controller.openTab('x', 'acct-1');

      await controller.setActiveGroup('ws-1', 'group-b');

      expect(mockVLMActivateDashboard).toHaveBeenCalledTimes(2);
      expect(controller.getShownTabs()).toHaveLength(0);
    });
  });

  // ==================================================================
  // openTab — VAL-WORKSPACE-003, VAL-WORKSPACE-004, VAL-WORKSPACE-006
  // ==================================================================

  describe('openTab', () => {
    it('should reject when no active group is selected', async () => {
      const result = await controller.openTab('x', 'acct-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active group');
    });

    it('should reject when account is not a member (VAL-WORKSPACE-006)', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-2', 'acct-3']);

      const result = await controller.openTab('x', 'acct-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not a member');
    });

    it('should accept when account IS a member', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1', 'acct-2']);

      const result = await controller.openTab('x', 'acct-1');
      expect(result.success).toBe(true);
      expect(result.tabId).toBeDefined();
      expect(result.tabId).toContain('runtime:');
      expect(result.tabId).toContain('group-a');
      expect(result.tabId).toContain('x');
      expect(result.tabId).toContain('acct-1');
    });

    it('should call worker with correct group ID for membership validation', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);

      await controller.openTab('x', 'acct-1');
      expect(mockWorkerRequest).toHaveBeenCalledWith('get_group_account_ids', { groupId: 'group-a' });
    });

    it('should create PlatformView with correct partition (VAL-WORKSPACE-004)', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);

      await controller.openTab('x', 'acct-1');

      const { PlatformView } = await import('../platform-view');
      expect(PlatformView).toHaveBeenCalledWith({
        platform: 'x',
        accountId: 'acct-1',
      });
    });

    it('should register with platformViewRegistry with correct partition (VAL-WORKSPACE-004)', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);

      await controller.openTab('x', 'acct-1');

      expect(mockRegistryRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'x',
          accountId: 'acct-1',
          partition: 'persist:social-browser:x:acct-1',
        }),
      );
    });

    it('should reuse existing PlatformView for same group/account/platform', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);

      await controller.openTab('x', 'acct-1');
      const { PlatformView } = await import('../platform-view');
      expect(PlatformView).toHaveBeenCalledTimes(1);

      await controller.openTab('x', 'acct-1');
      expect(PlatformView).toHaveBeenCalledTimes(1);
    });

    it('should expose only active group tabs, not implicit unassigned tabs (VAL-WORKSPACE-003)', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      const tabs = controller.getShownTabs();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].groupId).toBe('group-a');
      expect(tabs[0].accountId).toBe('acct-1');

      const allGroupA = controller.getShownTabs().filter(t => t.groupId === 'group-a');
      expect(allGroupA).toHaveLength(1);
    });

    it('should add tab to ViewLayoutManager', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);

      const result = await controller.openTab('x', 'acct-1');
      expect(result.success).toBe(true);

      expect(mockVLMAddTab).toHaveBeenCalledTimes(1);
      expect(mockVLMActivateTab).toHaveBeenCalledTimes(1);
    });
  });

  // ==================================================================
  // closeTab — VAL-WORKSPACE-019
  // ==================================================================

  describe('closeTab', () => {
    it('should close a tab and unregister from registry', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      const result = await controller.openTab('x', 'acct-1');
      const tabId = result.tabId!;

      await controller.closeTab(tabId);

      expect(mockVLMCloseTab).toHaveBeenCalled();
      expect(mockRegistryUnregister).toHaveBeenCalled();
      expect(controller.getShownTabs()).toHaveLength(0);
    });

    it('should return error for unknown tab', async () => {
      const result = await controller.closeTab('nonexistent-tab');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ==================================================================
  // navigateToDashboard — VAL-CROSS-017
  // ==================================================================

  describe('navigateToDashboard', () => {
    it('should call activateDashboard on layout manager (VAL-CROSS-017)', async () => {
      await controller.navigateToDashboard();
      expect(mockVLMActivateDashboard).toHaveBeenCalled();
    });
  });

  // ==================================================================
  // handleMembershipRemoved — VAL-WORKSPACE-021
  // ==================================================================

  describe('handleMembershipRemoved', () => {
    it('should close views for removed account in group (VAL-WORKSPACE-021)', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1', 'acct-2']);

      await controller.openTab('x', 'acct-1');
      await controller.openTab('x', 'acct-2');

      expect(controller.getShownTabs()).toHaveLength(2);

      await controller.handleMembershipRemoved('group-a', 'acct-1');

      const remaining = controller.getShownTabs();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].accountId).toBe('acct-2');
    });

    it('should not affect views in other groups (VAL-WORKSPACE-021)', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      await controller.setActiveGroup('ws-2', 'group-b');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      await controller.handleMembershipRemoved('group-a', 'acct-1');

      // We're in group-b, so its state should be preserved
      expect(controller.getState().activeGroupId).toBe('group-b');
    });
  });

  // ==================================================================
  // handleGroupDeleted — VAL-WORKSPACE-022
  // ==================================================================

  describe('handleGroupDeleted', () => {
    it('should close all views for the deleted group (VAL-WORKSPACE-022)', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      await controller.handleGroupDeleted('group-a');

      expect(controller.getState().activeGroupId).toBeNull();
      expect(controller.getShownTabs()).toHaveLength(0);
      expect(mockVLMActivateDashboard).toHaveBeenCalled();
    });

    it('should not affect views in other groups', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      await controller.setActiveGroup('ws-1', 'group-b');
      mockWorkerRequest.mockResolvedValue(['acct-2']);
      await controller.openTab('x', 'acct-2');

      await controller.handleGroupDeleted('group-a');

      expect(controller.getState().activeGroupId).toBe('group-b');
    });
  });

  // ==================================================================
  // Trusted Native Navigation — VAL-CROSS-017
  // ==================================================================

  describe('trusted native navigation (VAL-CROSS-017)', () => {
    it('should register IPC handlers that do not depend on ShellView', () => {
      const getStateHandler = mockIpcMainHandle.mock.calls.find(
        (c: any[]) => c[0] === 'dash:workspace:get-state'
      );
      expect(getStateHandler).toBeDefined();

      const openTabHandler = mockIpcMainHandle.mock.calls.find(
        (c: any[]) => c[0] === 'dash:workspace:open-tab'
      );
      expect(openTabHandler).toBeDefined();

      const navigateDashboardHandler = mockIpcMainHandle.mock.calls.find(
        (c: any[]) => c[0] === 'dash:workspace:show-dashboard'
      );
      expect(navigateDashboardHandler).toBeDefined();
    });

    it('get-state IPC handler returns current navigation state', async () => {
      const handlerCall = mockIpcMainHandle.mock.calls.find(
        (c: any[]) => c[0] === 'dash:workspace:get-state'
      );
      expect(handlerCall).toBeDefined();

      const handler = handlerCall[1];
      const result = await handler();
      expect(result).toEqual({
        activeWorkspaceId: null,
        activeGroupId: null,
      });
    });
  });

  // ==================================================================
  // Partition Preservation — VAL-WORKSPACE-004, VAL-WORKSPACE-005
  // ==================================================================

  describe('canonical partition preservation (VAL-WORKSPACE-004, VAL-WORKSPACE-005)', () => {
    it('should preserve exact partition without workspace/group identifiers', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      const registerCall = mockRegistryRegister.mock.calls.find(
        (c: any[]) => c[0].accountId === 'acct-1'
      );
      expect(registerCall).toBeDefined();
      const partition = registerCall[0].partition;
      expect(partition).toBe('persist:social-browser:x:acct-1');
      expect(partition).not.toContain('workspace');
      expect(partition).not.toContain('group');
    });
  });

  // ==================================================================
  // Dispose
  // ==================================================================

  describe('dispose', () => {
    it('should remove all IPC handlers and close all views', () => {
      controller.dispose();
      expect(mockIpcMainRemoveHandler).toHaveBeenCalled();
    });
  });
});


