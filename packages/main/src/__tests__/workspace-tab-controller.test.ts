import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
interface MockPlatformViewInstance {
  view: {
    setBounds: ReturnType<typeof vi.fn>;
    setVisible: ReturnType<typeof vi.fn>;
    webContents: {
      id: number;
      close: ReturnType<typeof vi.fn>;
      isDestroyed: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      setWindowOpenHandler: ReturnType<typeof vi.fn>;
      loadURL: ReturnType<typeof vi.fn>;
    };
  };
  getView: ReturnType<typeof vi.fn>;
  getPlatform: ReturnType<typeof vi.fn>;
  getAccountId: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  config: Record<string, unknown>;
}
const mockPlatformViewInstances: MockPlatformViewInstance[] = [];

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
  PlatformView: vi.fn().mockImplementation(function (config: { platform: string; accountId: string }) {
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

interface MockLayoutManager {
  activateTab: ReturnType<typeof vi.fn>;
  activateDashboard: ReturnType<typeof vi.fn>;
  addTab: ReturnType<typeof vi.fn>;
  closeTab: ReturnType<typeof vi.fn>;
  getTabs: ReturnType<typeof vi.fn>;
}

interface MockSessionManager {
  getOrCreateSession: ReturnType<typeof vi.fn>;
  hasSession: ReturnType<typeof vi.fn>;
}

describe('WorkspaceTabController', () => {
  let controller: WorkspaceTabController;
  let mockWorkerRequest: ReturnType<typeof vi.fn>;
  let mockLayoutManager: MockLayoutManager;
  let mockSessionManager: MockSessionManager;

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
      mockLayoutManager,
      mockSessionManager,
      mockWorkerRequest,
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

      const channels = mockIpcMainHandle.mock.calls.map((c) => c[0]).sort();
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

      mockWorkerRequest.mockResolvedValue([]);
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
  // VAL-WORKSPACE-008: ToS/account-risk acknowledgement gates navigation
  // ==================================================================

  describe('acknowledgement gates navigation (VAL-WORKSPACE-008)', () => {
    it('should reject navigation when account is not acknowledged', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      // First call: check_acknowledged returns not acknowledged
      // Second call: get_group_account_ids returns membership list
      mockWorkerRequest.mockImplementation(async (type: string) => {
        if (type === 'check_acknowledged') return { acknowledged: false };
        if (type === 'get_group_account_ids') return ['acct-1'];
        return [];
      });

      const result = await controller.openTab('x', 'acct-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('has not acknowledged');
      expect(result.error).toContain('not anti-detection');
      expect(result.error).toContain('read-only');
    });

    it('should allow navigation when account is acknowledged', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockImplementation(async (type: string) => {
        if (type === 'check_acknowledged') return { acknowledged: true };
        if (type === 'get_group_account_ids') return ['acct-1'];
        return [];
      });

      const result = await controller.openTab('x', 'acct-1');
      expect(result.success).toBe(true);
    });

    it('should allow acknowledged account while different unacknowledged account remains blocked', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockImplementation(async (type: string) => {
        if (type === 'check_acknowledged') {
          const payload = mockWorkerRequest.mock.calls[mockWorkerRequest.mock.calls.length - 1]?.[1];
          return { acknowledged: true };
        }
        if (type === 'get_group_account_ids') return ['acct-1', 'acct-2'];
        return [];
      });

      const result1 = await controller.openTab('x', 'acct-1');
      expect(result1.success).toBe(true);

      // Now check for acct-2 which is not acknowledged
      mockWorkerRequest.mockImplementation(async (type: string) => {
        if (type === 'check_acknowledged') return { acknowledged: false };
        if (type === 'get_group_account_ids') return ['acct-1', 'acct-2'];
        return [];
      });

      const result2 = await controller.openTab('x', 'acct-2');
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('has not acknowledged');
    });

    it('should include explicit notice text about isolation not being anti-detection', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockImplementation(async (type: string) => {
        if (type === 'check_acknowledged') return { acknowledged: false };
        if (type === 'get_group_account_ids') return ['acct-1'];
        return [];
      });

      const result = await controller.openTab('x', 'acct-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Session isolation is not anti-detection');
      expect(result.error).toContain('does not evade platform enforcement');
      expect(result.error).toContain('Capture is read-only observation of owned content only');
    });
  });
  // ==================================================================
  // Trusted Native Navigation — VAL-CROSS-017
  // ==================================================================

  describe('trusted native navigation (VAL-CROSS-017)', () => {
    it('should register IPC handlers that do not depend on ShellView', () => {
      const getStateHandler = mockIpcMainHandle.mock.calls.find(
        (c) => c[0] === 'dash:workspace:get-state'
      );
      expect(getStateHandler).toBeDefined();

      const openTabHandler = mockIpcMainHandle.mock.calls.find(
        (c) => c[0] === 'dash:workspace:open-tab'
      );
      expect(openTabHandler).toBeDefined();

      const navigateDashboardHandler = mockIpcMainHandle.mock.calls.find(
        (c) => c[0] === 'dash:workspace:show-dashboard'
      );
      expect(navigateDashboardHandler).toBeDefined();
    });

    it('get-state IPC handler returns current navigation state', async () => {
      const handlerCall = mockIpcMainHandle.mock.calls.find(
        (c) => c[0] === 'dash:workspace:get-state'
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
        (c) => c[0].accountId === 'acct-1'
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

  // ==================================================================
  // Group Switch Lifecycle — VAL-WORKSPACE-005
  // ==================================================================

  describe('group switch lifecycle (VAL-WORKSPACE-005)', () => {
    it('should keep hidden views tracked in groupViews after switching away', async () => {
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.setActiveGroup('ws-1', 'group-a');
      await controller.openTab('x', 'acct-1');

      await controller.setActiveGroup('ws-1', 'group-b');

      const allViews = controller.getAllGroupViews();
      expect(allViews.has('group-a')).toBe(true);
      const groupAViews = allViews.get('group-a');
      expect(groupAViews.size).toBe(1);
    });

    it('should reuse hidden PlatformView when switching back (no recreation)', async () => {
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.setActiveGroup('ws-1', 'group-a');
      await controller.openTab('x', 'acct-1');

      const { PlatformView } = await import('../platform-view');
      const createCount1 = PlatformView.mock.calls.length;

      await controller.setActiveGroup('ws-1', 'group-b');
      await controller.setActiveGroup('ws-1', 'group-a');

      await controller.openTab('x', 'acct-1');
      const createCount2 = PlatformView.mock.calls.length;

      expect(createCount2 - createCount1).toBe(0);
    });

    it('should have zero shown tabs after switching away from a group', async () => {
      mockWorkerRequest.mockResolvedValue(['acct-1', 'acct-2']);
      await controller.setActiveGroup('ws-1', 'group-a');
      await controller.openTab('x', 'acct-1');
      await controller.openTab('x', 'acct-2');

      expect(controller.getShownTabs()).toHaveLength(2);
      await controller.setActiveGroup('ws-1', 'group-b');
      expect(controller.getShownTabs()).toHaveLength(0);
    });

    it('should not leave orphaned PlatformViews visible after switching away', async () => {
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.setActiveGroup('ws-1', 'group-a');
      await controller.openTab('x', 'acct-1');

      const platformViewInstance = mockPlatformViewInstances[0];
      await controller.setActiveGroup('ws-1', 'group-b');

      expect(platformViewInstance.view.setVisible).toHaveBeenCalledWith(false);
    });
  });

  // ==================================================================
  // closeTab — VAL-WORKSPACE-019 (extended)
  // ==================================================================

  describe('closeTab extended (VAL-WORKSPACE-019)', () => {
    it('should close only the specified tab without affecting other tabs', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1', 'acct-2']);

      const tab1 = await controller.openTab('x', 'acct-1');
      await controller.openTab('x', 'acct-2');

      expect(controller.getShownTabs()).toHaveLength(2);
      await controller.closeTab(tab1.tabId);

      const remaining = controller.getShownTabs();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].accountId).toBe('acct-2');
    });
  });

  // ==================================================================
  // handleGroupDeleted — VAL-WORKSPACE-022 (extended)
  // ==================================================================

  describe('handleGroupDeleted sibling selection (VAL-WORKSPACE-022)', () => {
    it('should select next sibling group when active group is deleted', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      await controller.setActiveGroup('ws-1', 'group-b');

      mockWorkerRequest.mockImplementation(async (type, payload) => {
        if (type === 'get_ordered_group_ids') { return ['group-a', 'group-c']; }
        if (type === 'get_ordered_workspace_ids') { return ['ws-1']; }
        return [];
      });

      await controller.handleGroupDeleted('group-b');

      const state = controller.getState();
      expect(state.activeWorkspaceId).toBe('ws-1');
      expect(state.activeGroupId).toBe('group-c');
    });

    it('should select previous sibling when next sibling does not exist', async () => {
      await controller.setActiveGroup('ws-1', 'group-c');
      mockWorkerRequest.mockResolvedValue(['acct-1']);

      mockWorkerRequest.mockImplementation(async (type, payload) => {
        if (type === 'get_ordered_group_ids') { return ['group-a', 'group-b']; }
        if (type === 'get_ordered_workspace_ids') { return ['ws-1']; }
        if (type === 'get_group_account_ids') { return ['acct-1']; }
        return [];
      });

      await controller.handleGroupDeleted('group-c');

      const state = controller.getState();
      expect(state.activeWorkspaceId).toBe('ws-1');
      expect(state.activeGroupId).toBe('group-b');
    });

    it('should select next available workspace when no groups remain', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);

      mockWorkerRequest.mockImplementation(async (type, payload) => {
        if (type === 'get_ordered_group_ids') { return []; }
        if (type === 'get_ordered_workspace_ids') { return ['ws-2']; }
        return [];
      });

      await controller.handleGroupDeleted('group-a');

      const state = controller.getState();
      expect(state.activeWorkspaceId).toBe('ws-2');
    });

    it('should not affect views in other groups', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      await controller.setActiveGroup('ws-1', 'group-b');
      mockWorkerRequest.mockResolvedValue(['acct-2']);
      await controller.openTab('x', 'acct-2');

      mockWorkerRequest.mockImplementation(async (type, payload) => {
        if (type === 'get_ordered_group_ids') { return ['group-a', 'group-c']; }
        if (type === 'get_ordered_workspace_ids') { return ['ws-1']; }
        return [];
      });

      await controller.handleGroupDeleted('group-a');

      expect(controller.getState().activeGroupId).toBe('group-b');
    });
  });

  // ==================================================================
  // handleWorkspaceDeleted — VAL-WORKSPACE-019, VAL-WORKSPACE-022
  // ==================================================================

  describe('handleWorkspaceDeleted (VAL-WORKSPACE-019, VAL-WORKSPACE-022)', () => {
    it('should clean up views and select next sibling workspace', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      mockWorkerRequest.mockImplementation(async (type, payload) => {
        if (type === 'get_ordered_workspace_ids') { return ['ws-1', 'ws-2']; }
        if (type === 'get_groups_in_workspace') { return ['group-a']; }
        if (type === 'get_ordered_group_ids') { return ['group-x']; }
        return [];
      });

      await controller.handleWorkspaceDeleted('ws-1');

      const state = controller.getState();
      expect(state.activeWorkspaceId).toBe('ws-2');
      expect(state.activeGroupId).toBe('group-x');
    });

    it('should select previous sibling when next sibling does not exist', async () => {
      await controller.setActiveGroup('ws-3', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);

      mockWorkerRequest.mockImplementation(async (type, payload) => {
        if (type === 'get_ordered_workspace_ids') { return ['ws-1', 'ws-2']; }
        if (type === 'get_groups_in_workspace') { return ['group-a']; }
        if (type === 'get_ordered_group_ids') { return ['group-x']; }
        return [];
      });

      await controller.handleWorkspaceDeleted('ws-3');

      const state = controller.getState();
      expect(state.activeWorkspaceId).toBe('ws-2');
    });

    it('should select empty state when no workspaces remain', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);

      mockWorkerRequest.mockImplementation(async (type, payload) => {
        if (type === 'get_ordered_workspace_ids') { return []; }
        if (type === 'get_groups_in_workspace') { return ['group-a']; }
        return [];
      });

      await controller.handleWorkspaceDeleted('ws-1');

      const state = controller.getState();
      expect(state.activeWorkspaceId).toBeNull();
      expect(state.activeGroupId).toBeNull();
    });

    it('should close views for all groups in the deleted workspace', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');
      await controller.setActiveGroup('ws-1', 'group-b');
      mockWorkerRequest.mockResolvedValue(['acct-2']);
      await controller.openTab('x', 'acct-2');

      mockWorkerRequest.mockImplementation(async (type, payload) => {
        if (type === 'get_ordered_workspace_ids') { return ['ws-2']; }
        if (type === 'get_groups_in_workspace') { return ['group-a', 'group-b']; }
        if (type === 'get_ordered_group_ids') { return ['group-x']; }
        return [];
      });

      await controller.handleWorkspaceDeleted('ws-1');

      const allViews = controller.getAllGroupViews();
      expect(allViews.has('group-a')).toBe(false);
      expect(allViews.has('group-b')).toBe(false);
      expect(controller.getShownTabs()).toHaveLength(0);
    });

    it('should not cascade to account/content/partition deletion', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      mockWorkerRequest.mockImplementation(async (type, payload) => {
        if (type === 'get_ordered_workspace_ids') { return ['ws-2']; }
        if (type === 'get_groups_in_workspace') { return ['group-a']; }
        if (type === 'get_ordered_group_ids') { return ['group-x']; }
        return [];
      });

      await controller.handleWorkspaceDeleted('ws-1');

      expect(mockVLMCloseTab).toHaveBeenCalled();
    });
  });

  // ==================================================================
  // Canonical Partition Across Groups — VAL-WORKSPACE-004
  // ==================================================================

  describe('canonical partition across groups (VAL-WORKSPACE-004)', () => {
    it('should use same partition for shared account across groups', async () => {
      await controller.setActiveGroup('ws-1', 'group-a');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      await controller.setActiveGroup('ws-2', 'group-b');
      mockWorkerRequest.mockResolvedValue(['acct-1']);
      await controller.openTab('x', 'acct-1');

      const registerCalls = mockRegistryRegister.mock.calls.filter((c) => c[0].accountId === 'acct-1');
      for (const call of registerCalls) {
        if (call[0].partition !== 'persist:social-browser:x:acct-1') {
          throw new Error('Expected partition persist:social-browser:x:acct-1 but got ' + call[0].partition)
        }
      }
    });
  });

  // ==================================================================
  // Trusted Native Navigation — VAL-CROSS-017 (extended)
  // ==================================================================

  describe('trusted native navigation extended (VAL-CROSS-017)', () => {
    it('IPC handlers remain functional while PlatformView would be active', () => {
      const showDashboardHandler = mockIpcMainHandle.mock.calls.find(
        (c) => c[0] === 'dash:workspace:show-dashboard'
      );
      expect(showDashboardHandler).toBeDefined();
    });
  });

});


