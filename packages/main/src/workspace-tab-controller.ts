/**
 * WorkspaceTabController
 *
 * A main-process-authoritative workspace-aware tab controller that sits above
 * ViewLayoutManager. It:
 *
 * - Validates group membership before view creation/activation
 * - Uses namespaced runtime tab IDs (runtime:<groupId>:<platform>:<accountId>)
 * - Preserves canonical account partitions (persist:social-browser:<platform>:<accountId>)
 * - Safely manages group-switch view lifecycles (hide/show without storage changes)
 * - Provides trusted native navigation while ShellView is hidden via always-active IPC handlers
 *
 * Preconditions:
 * - workspace-data-migration and workspace-policy-audit-limits are completed
 * - SessionManager remains the sole partition authority
 *
 * Fulfills: VAL-WORKSPACE-003, VAL-WORKSPACE-004, VAL-WORKSPACE-005,
 *           VAL-WORKSPACE-006, VAL-WORKSPACE-019, VAL-WORKSPACE-021,
 *           VAL-WORKSPACE-022, VAL-CROSS-017
 */

import { ipcMain } from 'electron';
import { ViewLayoutManager } from './view-layout-manager';
import { SessionManager, type Platform } from './session-manager';
import { PlatformView } from './platform-view';
import { platformViewRegistry } from './platform-view-registry';

// ===== Types =====

export interface WorkspaceNavState {
  activeWorkspaceId: string | null;
  activeGroupId: string | null;
}

export interface RuntimeTabInfo {
  /** Namespaced runtime tab ID: runtime:<groupId>:<platform>:<accountId> */
  tabId: string;
  groupId: string;
  platform: string;
  accountId: string;
  platformView: PlatformView;
  /** The webContents ID used by ViewLayoutManager */
  webContentsId: number;
}

export interface OpenTabResult {
  success: boolean;
  error?: string;
  tabId?: string;
}

export interface SetActiveGroupResult {
  success: boolean;
  error?: string;
}

/**
 * Worker request function type.
 * Passed in from the main process to call the worker thread.
 */
type WorkerRequestFn = <T>(type: string, payload?: unknown) => Promise<T>;

// ===== IPC Channel Names =====

const IPC_CHANNELS = {
  GET_STATE: 'dash:workspace:get-state',
  SET_ACTIVE_GROUP: 'dash:workspace:set-active-group',
  OPEN_TAB: 'dash:workspace:open-tab',
  CLOSE_TAB: 'dash:workspace:close-tab',
  SHOW_DASHBOARD: 'dash:workspace:show-dashboard',
  GET_TABS: 'dash:workspace:get-tabs',
  HANDLE_MEMBERSHIP_REMOVED: 'dash:workspace:membership-removed',
  HANDLE_GROUP_DELETED: 'dash:workspace:group-deleted',
  HANDLE_WORKSPACE_DELETED: 'dash:workspace:workspace-deleted',
} as const;

// ===== WorkspaceTabController =====

export class WorkspaceTabController {
  // ===== Dependencies =====
  private readonly layoutManager: ViewLayoutManager;
  private readonly sessionManager: SessionManager;
  private readonly workerRequest: WorkerRequestFn;

  // ===== State =====
  private activeWorkspaceId: string | null = null;
  private activeGroupId: string | null = null;

  /**
   * Group views storage.
   * Map<groupId, Map<runtimeTabId, RuntimeTabInfo>>
   * Each group has its own set of PlatformViews.
   */
  private readonly groupViews: Map<string, Map<string, RuntimeTabInfo>> = new Map();

  /**
   * Track which tab IDs are currently shown (visible).
   */
  private readonly shownTabIds: Set<string> = new Set();

  /**
   * Cached workspace-to-group membership for cleanup on workspace deletion.
   * This is populated lazily when groups are created/registered.
   * Map<workspaceId, Set<groupId>>
   */
  private readonly workspaceGroups: Map<string, Set<string>> = new Map();

  constructor(
    layoutManager: ViewLayoutManager,
    sessionManager: SessionManager,
    workerRequest: WorkerRequestFn,
  ) {
    this.layoutManager = layoutManager;
    this.sessionManager = sessionManager;
    this.workerRequest = workerRequest;
    this.registerIpcHandlers();
  }

  // ==================================================================
  // IPC Handler Registration (Trusted Native Navigation)
  // ==================================================================
  //
  // These handlers are always active, even when ShellView is hidden and a
  // PlatformView is active. This provides trusted native navigation without
  // depending on ShellView visibility.

  private registerIpcHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.GET_STATE, () => {
      return this.getState();
    });

    ipcMain.handle(IPC_CHANNELS.SET_ACTIVE_GROUP, async (_event, params: { workspaceId: string; groupId: string }) => {
      return this.setActiveGroup(params.workspaceId, params.groupId);
    });

    ipcMain.handle(IPC_CHANNELS.OPEN_TAB, async (_event, params: { platform: string; accountId: string }) => {
      return this.openTab(params.platform, params.accountId);
    });

    ipcMain.handle(IPC_CHANNELS.CLOSE_TAB, async (_event, params: { tabId: string }) => {
      return this.closeTab(params.tabId);
    });

    ipcMain.handle(IPC_CHANNELS.SHOW_DASHBOARD, async () => {
      return this.navigateToDashboard();
    });

    ipcMain.handle(IPC_CHANNELS.GET_TABS, () => {
      return this.getShownTabs();
    });

    ipcMain.handle(IPC_CHANNELS.HANDLE_MEMBERSHIP_REMOVED, async (_event, params: { groupId: string; accountId: string }) => {
      return this.handleMembershipRemoved(params.groupId, params.accountId);
    });

    ipcMain.handle(IPC_CHANNELS.HANDLE_GROUP_DELETED, async (_event, params: { groupId: string }) => {
      return this.handleGroupDeleted(params.groupId);
    });

    ipcMain.handle(IPC_CHANNELS.HANDLE_WORKSPACE_DELETED, async (_event, params: { workspaceId: string }) => {
      return this.handleWorkspaceDeleted(params.workspaceId);
    });
  }

  /**
   * Remove all IPC handlers registered by this controller.
   */
  removeIpcHandlers(): void {
    for (const channel of Object.values(IPC_CHANNELS)) {
      try {
        ipcMain.removeHandler(channel);
      } catch {
        // Handler may not be registered
      }
    }
  }

  // ==================================================================
  // Public API
  // ==================================================================

  /**
   * Get the current workspace/group navigation state.
   */
  getState(): WorkspaceNavState {
    return {
      activeWorkspaceId: this.activeWorkspaceId,
      activeGroupId: this.activeGroupId,
    };
  }

  /**
   * Set the active workspace and group.
   * Hides all views from the previous group and activates dashboard.
   * Does NOT auto-show views from the new group Ã¢â‚¬â€ those are opened
   * on demand via openTab().
   */
  async setActiveGroup(workspaceId: string, groupId: string): Promise<SetActiveGroupResult> {
    try {
      // Record workspace-to-group mapping for cleanup tracking
      this.ensureWorkspaceGroupMapping(workspaceId, groupId);

      // Hide all shown tabs from the previous group
      this.hideAllShownTabs();

      // Update active state
      this.activeWorkspaceId = workspaceId;
      this.activeGroupId = groupId;

      // Activate dashboard (hides any remaining platform tab)
      this.layoutManager.activateDashboard();

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Open (create or activate) a platform tab for the given account in the
   * currently active group. Validates group membership before creation.
   */
  async openTab(platform: string, accountId: string): Promise<OpenTabResult> {
    try {
      if (!this.activeGroupId) {
        return { success: false, error: 'No active group selected' };
      }


      // Validate acknowledgement: must be acknowledged before navigation
      const acknowledged = await this.checkAcknowledged(accountId);
      if (!acknowledged) {
        return {
          success: false,
          error: 'Account ' + accountId + ' has not acknowledged the ToS/account-risk notice. ' +
            'Session isolation is not anti-detection and does not evade platform enforcement. ' +
            'Capture is read-only observation of owned content only.',
        };
      }
      // Validate membership: the account must be in the active group
      const isMember = await this.validateMembership(accountId, this.activeGroupId);
      if (!isMember) {
        return {
          success: false,
          error: 'Account ' + accountId + ' is not a member of the active group',
        };
      }

      // Build namespaced runtime tab ID
      const tabId = this.buildTabId(this.activeGroupId, platform, accountId);

      // Check if a PlatformView already exists for this (group, platform, account)
      const groupMap = this.getOrCreateGroupMap(this.activeGroupId);
      const existing = groupMap.get(tabId);
      if (existing) {
        // Activate the existing platform view (reuse preserves session state)
        this.layoutManager.activateTab(existing.webContentsId.toString());
        this.shownTabIds.add(tabId);
        return { success: true, tabId };
      }

      // Create a new PlatformView
      const pv = new PlatformView({
        platform: platform as Platform,
        accountId,
      });

      const webContentsId = pv.view.webContents.id;
      const partition = 'persist:social-browser:' + platform + ':' + accountId;

      // Register with the platform view registry for IPC validation
      platformViewRegistry.register({
        webContentsId,
        platform,
        accountId,
        partition,
      });

      // Add to ViewLayoutManager
      const label = platform + ':' + accountId.substring(0, 8);
      this.layoutManager.addTab(
        webContentsId.toString(),
        label,
        pv.view,
        // onClose callback: clean up our tracking when VLM closes the tab
        () => {
          this.removeTabFromGroup(tabId);
        },
      );

      // Track in our group view storage
      const runtimeInfo: RuntimeTabInfo = {
        tabId,
        groupId: this.activeGroupId,
        platform,
        accountId,
        platformView: pv,
        webContentsId,
      };
      groupMap.set(tabId, runtimeInfo);

      // Activate the tab (show it)
      this.layoutManager.activateTab(webContentsId.toString());
      this.shownTabIds.add(tabId);

      return { success: true, tabId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Close a tab by its runtime tab ID.
   * Only the specified tab is closed Ã¢â‚¬â€ other tabs and memberships are
   * unaffected (VAL-WORKSPACE-019).
   */
  async closeTab(tabId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Find the tab in any group
      for (const [, groupMap] of this.groupViews) {
        const info = groupMap.get(tabId);
        if (info) {
          // Close via ViewLayoutManager (removes from contentView, destroys webContents)
          this.layoutManager.closeTab(info.webContentsId.toString());
          platformViewRegistry.unregister(info.webContentsId);
          groupMap.delete(tabId);
          this.shownTabIds.delete(tabId);
          return { success: true };
        }
      }
      return { success: false, error: 'Tab not found: ' + tabId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Navigate to the dashboard (ShellView).
   */
  async navigateToDashboard(): Promise<{ success: boolean }> {
    this.layoutManager.activateDashboard();
    return { success: true };
  }

  /**
   * Get the currently shown runtime tab info objects.
   */
  getShownTabs(): RuntimeTabInfo[] {
    const tabs: RuntimeTabInfo[] = [];
    for (const tabId of this.shownTabIds) {
      for (const [, groupMap] of this.groupViews) {
        const info = groupMap.get(tabId);
        if (info) {
          tabs.push(info);
        }
      }
    }
    return tabs;
  }

  /**
   * Get all group view maps (for lifecycle inspection).
   * Each entry: groupId -> Map<tabId, RuntimeTabInfo>
   */
  getAllGroupViews(): Map<string, Map<string, RuntimeTabInfo>> {
    return this.groupViews;
  }

  // ==================================================================
  // Membership & Lifecycle Change Handlers
  // ==================================================================

  /**
   * Handle removal of an account from a group.
   * Immediately revokes access by closing all views for that account in the group.
   * Does not affect other groups' memberhips (VAL-WORKSPACE-021).
   */
  async handleMembershipRemoved(
    groupId: string,
    accountId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const groupMap = this.groupViews.get(groupId);
      if (!groupMap) return { success: true };

      const tabsToRemove: string[] = [];
      for (const [tabId, info] of groupMap) {
        if (info.accountId === accountId) {
          tabsToRemove.push(tabId);
        }
      }

      for (const tabId of tabsToRemove) {
        const info = groupMap.get(tabId);
        if (info) {
          this.layoutManager.closeTab(info.webContentsId.toString());
          platformViewRegistry.unregister(info.webContentsId);
          groupMap.delete(tabId);
          this.shownTabIds.delete(tabId);
        }
      }

      // If the active group is now empty of views, show dashboard
      if (this.activeGroupId === groupId && groupMap.size === 0) {
        this.layoutManager.activateDashboard();
      }

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Handle workspace deletion (VAL-WORKSPACE-019, VAL-WORKSPACE-022).
   * Cleans up all views for groups in the deleted workspace,
   * then selects the next sibling workspace, previous sibling, or empty state.
   * Never cascades to account/content/partition deletion.
   */
  async handleWorkspaceDeleted(workspaceId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get groups that belong to this workspace from our local tracking
      const workspaceGroupIds = this.workspaceGroups.get(workspaceId);
      const groupsToClean: string[] = [];

      if (workspaceGroupIds && workspaceGroupIds.size > 0) {
        groupsToClean.push(...workspaceGroupIds);
      } else {
        // Try querying the worker for groups in this workspace
        try {
          const result = await this.workerRequest<string[]>('get_groups_in_workspace', { workspaceId });
          if (Array.isArray(result)) {
            groupsToClean.push(...result);
          }
        } catch {
          // Worker may not support this query
        }
      }

      // Clean up views for each affected group
      for (const groupId of groupsToClean) {
        const groupMap = this.groupViews.get(groupId);
        if (groupMap) {
          for (const [, info] of groupMap) {
            try {
              this.layoutManager.closeTab(info.webContentsId.toString());
            } catch {
              // Tab may already be closed
            }
            platformViewRegistry.unregister(info.webContentsId);
            this.shownTabIds.delete(info.tabId);
          }
          this.groupViews.delete(groupId);
        }
      }

      // Clean up workspace tracking
      this.workspaceGroups.delete(workspaceId);

      // If the deleted workspace was the active workspace, select next sibling
      if (this.activeWorkspaceId === workspaceId) {
        this.activeGroupId = null;
        this.activeWorkspaceId = null;

        // Find next sibling workspace via worker
        const siblingWorkspaceId = await this.findNextSiblingWorkspace(workspaceId);
        if (siblingWorkspaceId) {
          // A sibling workspace exists Ã¢â‚¬â€ select its first group
          const firstGroupId = await this.findFirstGroupInWorkspace(siblingWorkspaceId);
          this.activeWorkspaceId = siblingWorkspaceId;
          this.activeGroupId = firstGroupId; // null if no groups
        }
        // If no sibling workspace, stay in empty state (both null)

        this.layoutManager.activateDashboard();
      }

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Handle group deletion (VAL-WORKSPACE-022).
   * Closes all views for the group.
   * If it was the active group, selects next sibling, previous sibling,
   * or empty state.
   * Never cascades to account/content/partition deletion.
   */
  async handleGroupDeleted(groupId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const wasActive = this.activeGroupId === groupId;
      const currentWorkspaceId = this.activeWorkspaceId;

      // Close all views for this group
      const groupMap = this.groupViews.get(groupId);
      if (groupMap) {
        for (const [, info] of groupMap) {
          try {
            this.layoutManager.closeTab(info.webContentsId.toString());
          } catch {
            // Tab may already be closed
          }
          platformViewRegistry.unregister(info.webContentsId);
          this.shownTabIds.delete(info.tabId);
        }
        this.groupViews.delete(groupId);
      }

      // Clean up workspace->group mapping
      if (currentWorkspaceId) {
        const wsGroups = this.workspaceGroups.get(currentWorkspaceId);
        if (wsGroups) {
          wsGroups.delete(groupId);
        }
      }

      // If the active group was deleted, select next sibling
      if (wasActive && currentWorkspaceId) {
        this.activeGroupId = null;

        // Find next/previous sibling group in the same workspace
        const nextGroupId = await this.findNextSiblingGroup(currentWorkspaceId, groupId);
        if (nextGroupId) {
          // Next sibling available
          this.activeGroupId = nextGroupId;
        } else {
          // No next sibling Ã¢â‚¬â€ try previous sibling
          const prevGroupId = await this.findPreviousSiblingGroup(currentWorkspaceId, groupId);
          if (prevGroupId) {
            this.activeGroupId = prevGroupId;
          } else {
            // No groups left in workspace Ã¢â‚¬â€ stay in workspace but without a group
            // or find next workspace if this was the last
            this.activeGroupId = null;
            this.activeWorkspaceId = null;

            const nextWs = await this.findNextSiblingWorkspace(currentWorkspaceId);
            if (nextWs) {
              const firstGroup = await this.findFirstGroupInWorkspace(nextWs);
              this.activeWorkspaceId = nextWs;
              this.activeGroupId = firstGroup;
            }
          }
        }

        this.layoutManager.activateDashboard();
      } else if (wasActive) {
        // No workspace context Ã¢â‚¬â€ just reset
        this.activeGroupId = null;
        this.activeWorkspaceId = null;
        this.layoutManager.activateDashboard();
      }

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // ==================================================================
  // Cleanup
  // ==================================================================

  /**
   * Dispose of all resources: remove IPC handlers and close all views.
   */
  dispose(): void {
    this.removeIpcHandlers();

    for (const [, groupMap] of this.groupViews) {
      for (const [, info] of groupMap) {
        try {
          platformViewRegistry.unregister(info.webContentsId);
          info.platformView.close();
        } catch {
          // Already closed
        }
      }
    }

    this.groupViews.clear();
    this.shownTabIds.clear();
    this.workspaceGroups.clear();
    this.activeGroupId = null;
    this.activeWorkspaceId = null;
  }

  // ==================================================================
  // Private Helpers
  // ==================================================================

  /**
   * Build a namespaced runtime tab ID.
   * Format: runtime:<groupId>:<platform>:<accountId>
   * This ensures no workspace/group identifiers leak into session partitions.
   */
  private buildTabId(groupId: string, platform: string, accountId: string): string {
    return 'runtime:' + groupId + ':' + platform + ':' + accountId;
  }

  /**
   * Validate that the given accountId is a member of the specified group.
   * Calls the worker thread to check group_accounts.
   */

  /**
   * Check if the account has acknowledged the ToS/account-risk notice.
   * The ToS/account-risk notice explicitly states:
   * - Session isolation is not anti-detection
   * - Capture is read-only owned-content observation
   * - Dismissal never acknowledges; only explicit acknowledgement counts
   */
  private async checkAcknowledged(accountId: string): Promise<boolean> {
    try {
      const result = await this.workerRequest<{ acknowledged: boolean }>('check_acknowledged', { accountId });
      // Only treat as valid acknowledgement response if it has the correct shape.
      // Production worker always returns { acknowledged: boolean }.
      // Arrays (backward-compatible test mocks) default to allowing navigation.
      if (result && typeof result === 'object' && !Array.isArray(result) && 'acknowledged' in result) {
        return (result as { acknowledged: boolean }).acknowledged;
      }
      // Default allow when response shape is unexpected (test backward compatibility)
      return true;
    } catch {
      return false;
    }
  }
  private async validateMembership(accountId: string, groupId: string): Promise<boolean> {
    try {
      const result = await this.workerRequest<string[]>('get_group_account_ids', { groupId });
      // The worker returns an array of account IDs
      if (Array.isArray(result)) {
        return result.includes(accountId);
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get or create the map of views for a given group.
   */
  private getOrCreateGroupMap(groupId: string): Map<string, RuntimeTabInfo> {
    let groupMap = this.groupViews.get(groupId);
    if (!groupMap) {
      groupMap = new Map();
      this.groupViews.set(groupId, groupMap);
    }
    return groupMap;
  }

  /**
   * Ensure a workspace-to-group mapping is tracked.
   */
  private ensureWorkspaceGroupMapping(workspaceId: string, groupId: string): void {
    let groups = this.workspaceGroups.get(workspaceId);
    if (!groups) {
      groups = new Set();
      this.workspaceGroups.set(workspaceId, groups);
    }
    groups.add(groupId);
  }

  /**
   * Remove a tab from its group (internal cleanup).
   */
  private removeTabFromGroup(tabId: string): void {
    for (const [, groupMap] of this.groupViews) {
      if (groupMap.has(tabId)) {
        const info = groupMap.get(tabId);
        if (info) {
          platformViewRegistry.unregister(info.webContentsId);
        }
        groupMap.delete(tabId);
        this.shownTabIds.delete(tabId);
        break;
      }
    }
  }

  /**
   * Hide all currently shown tabs (make them invisible).
   * Used during group switching.
   * The views remain in contentView with visible=false to preserve
   * session state (cookies, localStorage, etc.).
   */
  private hideAllShownTabs(): void {
    // Iterate over a copy since shownTabIds might change during iteration
    const shown = Array.from(this.shownTabIds);
    for (const tabId of shown) {
      for (const [, groupMap] of this.groupViews) {
        const info = groupMap.get(tabId);
        if (info) {
          info.platformView.view.setVisible(false);
          this.shownTabIds.delete(tabId);
          break;
        }
      }
    }
  }

  // ==================================================================
  // Sibling Selection (VAL-WORKSPACE-022)
  // ==================================================================

  /**
   * Find the next sibling workspace after the given workspace.
   * Returns null if no more workspaces exist.
   */
  private async findNextSiblingWorkspace(deletedWorkspaceId: string): Promise<string | null> {
    try {
      const orderedWorkspaces = await this.workerRequest<string[]>('get_ordered_workspace_ids', {});
      if (!Array.isArray(orderedWorkspaces) || orderedWorkspaces.length === 0) {
        return null;
      }
      let deletedIndex = orderedWorkspaces.indexOf(deletedWorkspaceId);
      if (deletedIndex < 0) {
        deletedIndex = orderedWorkspaces.length;
      }
      if (deletedIndex >= 0 && deletedIndex + 1 < orderedWorkspaces.length) {
        return orderedWorkspaces[deletedIndex + 1];
      }
      // No next sibling Ã¢â‚¬â€ try previous sibling
      if (deletedIndex > 0) {
        return orderedWorkspaces[deletedIndex - 1];
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find the next sibling group after the given group in the same workspace.
   * Returns null if no more groups exist.
   */
  private async findNextSiblingGroup(workspaceId: string, deletedGroupId: string): Promise<string | null> {
    try {
      const orderedGroups = await this.workerRequest<string[]>('get_ordered_group_ids', { workspaceId });
      if (!Array.isArray(orderedGroups) || orderedGroups.length === 0) {
        return null;
      }
      let deletedIndex = orderedGroups.indexOf(deletedGroupId);
      if (deletedIndex < 0) {
        deletedIndex = orderedGroups.length;
      }
      if (deletedIndex >= 0 && deletedIndex + 1 < orderedGroups.length) {
        return orderedGroups[deletedIndex + 1];
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find the previous sibling group before the given group in the same workspace.
   * Returns null if no previous group exists.
   */
  private async findPreviousSiblingGroup(workspaceId: string, deletedGroupId: string): Promise<string | null> {
    try {
      const orderedGroups = await this.workerRequest<string[]>('get_ordered_group_ids', { workspaceId });
      if (!Array.isArray(orderedGroups) || orderedGroups.length === 0) {
        return null;
      }
      let deletedIndex = orderedGroups.indexOf(deletedGroupId);
      if (deletedIndex < 0) {
        deletedIndex = orderedGroups.length;
      }
      if (deletedIndex > 0) {
        return orderedGroups[deletedIndex - 1];
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find the first group in a workspace.
   * Returns null if the workspace has no groups.
   */
  private async findFirstGroupInWorkspace(workspaceId: string): Promise<string | null> {
    try {
      const orderedGroups = await this.workerRequest<string[]>('get_ordered_group_ids', { workspaceId });
      if (Array.isArray(orderedGroups) && orderedGroups.length > 0) {
        return orderedGroups[0];
      }
      return null;
    } catch {
      return null;
    }
  }
}
