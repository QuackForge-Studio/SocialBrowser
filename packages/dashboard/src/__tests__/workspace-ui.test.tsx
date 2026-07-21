/**
 * Workspace UI Tests
 *
 * Tests for WorkspaceManager, ToSAcknowledgment, DenialBanner, and PublishAssistPanel.
 * Uses mocked DashboardBridge via window.__socialBrowserDashboard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";
import { WorkspaceManager } from "../views/WorkspaceManager";
import { ToSAcknowledgment } from "../views/ToSAcknowledgment";
import { DenialBanner } from "../views/DenialBanner";
import { PublishAssistPanel } from "../views/PublishAssistPanel";
import type {
  DashboardBridge,
  Workspace,
  TabGroup,
  GroupAccountInfo,
  Account,
} from "../types";

// ── Mock bridge factory ──

function createMockBridge(
  overrides: Partial<DashboardBridge> = {}
): DashboardBridge {
  return {
    getAccounts: vi.fn().mockResolvedValue([]),
    getPosts: vi.fn().mockResolvedValue([]),
    getAnalytics: vi.fn().mockResolvedValue({}),
    getHeatmap: vi.fn().mockResolvedValue([]),
    createDraft: vi.fn().mockResolvedValue({}),
    generateDraft: vi.fn().mockResolvedValue({}),
    getDrafts: vi.fn().mockResolvedValue([]),
    updateDraft: vi.fn().mockResolvedValue({}),
    deleteDraft: vi.fn().mockResolvedValue({}),
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    getKeyStatus: vi
      .fn()
      .mockResolvedValue({ provider: "openai", configured: true }),
    navigateTo: vi.fn().mockResolvedValue({}),
    prefillCompose: vi.fn().mockResolvedValue({}),
    copyToClipboard: vi.fn().mockResolvedValue({}),
    getWorkspaces: vi.fn().mockResolvedValue([]),
    createWorkspace: vi.fn().mockResolvedValue({
      id: "ws-new",
      name: "New Workspace",
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }),
    renameWorkspace: vi.fn().mockResolvedValue({ updated: true }),
    deleteWorkspace: vi.fn().mockResolvedValue({ deleted: true }),
    reorderWorkspaces: vi.fn().mockResolvedValue({ reordered: true }),
    getTabGroups: vi.fn().mockResolvedValue([]),
    createTabGroup: vi.fn().mockResolvedValue({
      id: "g-new",
      workspaceId: "ws-1",
      name: "New Group",
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }),
    renameTabGroup: vi.fn().mockResolvedValue({ updated: true }),
    deleteTabGroup: vi.fn().mockResolvedValue({ deleted: true }),
    reorderTabGroups: vi.fn().mockResolvedValue({ reordered: true }),
    getGroupAccounts: vi.fn().mockResolvedValue([]),
    addAccountToGroup: vi.fn().mockResolvedValue({ id: "ma-1" }),
    removeAccountFromGroup: vi.fn().mockResolvedValue({ removed: true }),
    reorderGroupAccounts: vi.fn().mockResolvedValue({ reordered: true }),
    getGroupTabs: vi.fn().mockResolvedValue([]),
    addGroupTab: vi.fn().mockResolvedValue({
      id: "gt-1",
      groupId: "g-1",
      platform: "twitter",
      accountId: "acc-1",
      url: "",
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }),
    removeGroupTab: vi.fn().mockResolvedValue({ removed: true }),
    reorderGroupTabs: vi.fn().mockResolvedValue({ reordered: true }),
    getWorkspaceState: vi
      .fn()
      .mockResolvedValue({ activeWorkspaceId: null, activeGroupId: null }),
    setActiveGroup: vi.fn().mockResolvedValue({ success: true }),
    openTab: vi.fn().mockResolvedValue({ success: true }),
    closeTab: vi.fn().mockResolvedValue({ success: true }),
    showDashboard: vi.fn().mockResolvedValue({ success: true }),
    getWorkspaceTabs: vi.fn().mockResolvedValue([]),
    handleMembershipRemoved: vi.fn().mockResolvedValue({ success: true }),
    handleGroupDeleted: vi.fn().mockResolvedValue({ success: true }),
    handleWorkspaceDeleted: vi.fn().mockResolvedValue({ success: true }),
    acknowledgeAccount: vi.fn().mockResolvedValue({ acknowledged: true }),
    checkAcknowledged: vi.fn().mockResolvedValue({ acknowledged: true }),
    getAuditEvents: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ── Data helpers ──

function makeWs(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    name: "Test Workspace",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeGroup(overrides: Partial<TabGroup> = {}): TabGroup {
  return {
    id: "g-1",
    workspaceId: "ws-1",
    name: "Test Group",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeGroupAccount(
  overrides: Partial<GroupAccountInfo> = {}
): GroupAccountInfo {
  return {
    id: "ga-1",
    groupId: "g-1",
    accountId: "acc-1",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    platform: "twitter",
    handle: "@test",
    displayName: "Test Account",
    sessionPartition: "persist:test",
    ...overrides,
  };
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    platform: "twitter",
    handle: "@test",
    displayName: "Test Account",
    avatarUrl: "",
    sessionPartition: "persist:test",
    adapterVersion: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ── Before each: reset mocks and clean up DOM ──

beforeEach(() => {
  vi.restoreAllMocks();
  // Reset the bridge on the window
  delete (window as any).__socialBrowserDashboard;
});

// ════════════════════════════════════════════════════
//  WorkspaceManager
// ════════════════════════════════════════════════════

describe("WorkspaceManager", () => {
  describe("empty state", () => {
    it('renders "No workspaces yet" when no workspaces exist', async () => {
      const bridge = createMockBridge({
        getWorkspaces: vi.fn().mockResolvedValue([]),
        getAccounts: vi.fn().mockResolvedValue([]),
      });
      (window as any).__socialBrowserDashboard = bridge;

      render(<WorkspaceManager />);

      await waitFor(() => {
        expect(screen.getByText("No workspaces yet")).toBeDefined();
      });
    });
  });

  describe("workspace list", () => {
    it("renders workspace names after fetching", async () => {
      const ws1 = makeWs({ id: "ws-1", name: "Alpha" });
      const ws2 = makeWs({ id: "ws-2", name: "Beta" });

      const bridge = createMockBridge({
        getWorkspaces: vi.fn().mockResolvedValue([ws1, ws2]),
        getAccounts: vi.fn().mockResolvedValue([]),
      });
      (window as any).__socialBrowserDashboard = bridge;

      render(<WorkspaceManager />);

      await waitFor(() => {
        expect(screen.getByText("Alpha")).toBeDefined();
      });
      expect(screen.getByText("Beta")).toBeDefined();
    });
  });

  describe("workspace creation", () => {
    it("calls createWorkspace via the create button", async () => {
      const bridge = createMockBridge({
        getWorkspaces: vi.fn().mockResolvedValue([]),
        getAccounts: vi.fn().mockResolvedValue([]),
      });
      (window as any).__socialBrowserDashboard = bridge;

      // Mock window.prompt to return a name
      const promptStub = vi
        .spyOn(window, "prompt")
        .mockReturnValue("My Workspace");

      render(<WorkspaceManager />);

      await waitFor(() => {
        expect(screen.getByText("No workspaces yet")).toBeDefined();
      });

      // Click the "+ Create Workspace" button
      fireEvent.click(screen.getByText("+ Create Workspace"));

      await waitFor(() => {
        expect(bridge.createWorkspace).toHaveBeenCalledWith({
          name: "My Workspace",
        });
      });

      promptStub.mockRestore();
    });
  });

  describe("workspace rename", () => {
    it("handles inline rename via double-click", async () => {
      const ws1 = makeWs({ id: "ws-1", name: "Original" });
      const bridge = createMockBridge({
        getWorkspaces: vi.fn().mockResolvedValue([ws1]),
        getAccounts: vi.fn().mockResolvedValue([]),
      });
      (window as any).__socialBrowserDashboard = bridge;

      const { container } = render(<WorkspaceManager />);

      await waitFor(() => {
        expect(screen.getByText("Original")).toBeDefined();
      });

      // Double-click the workspace name to enter edit mode
      const nameSpan = screen.getByText("Original");
      fireEvent.doubleClick(nameSpan);

      // The InlineEdit switches to input mode; find the input
      const input = screen.getByDisplayValue("Original") as HTMLInputElement;
      expect(input).toBeDefined();

      // Change the value and blur to commit
      fireEvent.change(input, { target: { value: "Renamed" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(bridge.renameWorkspace).toHaveBeenCalledWith({
          id: "ws-1",
          name: "Renamed",
        });
      });
    });
  });

  describe("workspace deletion", () => {
    it("handles deletion with confirmation", async () => {
      const ws1 = makeWs({ id: "ws-1", name: "ToDelete" });
      const bridge = createMockBridge({
        getWorkspaces: vi.fn().mockResolvedValue([ws1]),
        getAccounts: vi.fn().mockResolvedValue([]),
      });
      (window as any).__socialBrowserDashboard = bridge;

      const confirmStub = vi
        .spyOn(window, "confirm")
        .mockReturnValue(true);

      render(<WorkspaceManager />);

      await waitFor(() => {
        expect(screen.getByText("ToDelete")).toBeDefined();
      });

      // Find and click the delete button (the "✕" button with title="Delete workspace")
      const deleteBtn = screen.getByTitle("Delete workspace");
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(bridge.deleteWorkspace).toHaveBeenCalledWith({
          id: "ws-1",
        });
      });

      confirmStub.mockRestore();
    });
  });

  describe("groups for selected workspace", () => {
    it("renders groups when a workspace is selected", async () => {
      const ws1 = makeWs({ id: "ws-1", name: "My WS" });
      const g1 = makeGroup({
        id: "g-1",
        workspaceId: "ws-1",
        name: "Group A",
      });
      const g2 = makeGroup({
        id: "g-2",
        workspaceId: "ws-1",
        name: "Group B",
      });

      const bridge = createMockBridge({
        getWorkspaces: vi.fn().mockResolvedValue([ws1]),
        getAccounts: vi.fn().mockResolvedValue([]),
        getTabGroups: vi.fn().mockResolvedValue([g1, g2]),
      });
      (window as any).__socialBrowserDashboard = bridge;

      render(<WorkspaceManager />);

      await waitFor(() => {
        expect(screen.getByText("My WS")).toBeDefined();
      });

      // Click on the workspace
      fireEvent.click(screen.getByText("My WS"));

      // Wait for groups to appear
      await waitFor(() => {
        expect(screen.getByText("Group A")).toBeDefined();
      });
      expect(screen.getByText("Group B")).toBeDefined();
    });
  });

  describe("accounts for selected group", () => {
    it("renders accounts when a group is selected", async () => {
      const ws1 = makeWs({ id: "ws-1", name: "My WS" });
      const g1 = makeGroup({
        id: "g-1",
        workspaceId: "ws-1",
        name: "Group A",
      });
      const ga1 = makeGroupAccount({
        id: "ga-1",
        groupId: "g-1",
        accountId: "acc-1",
        displayName: "Alice",
        handle: "@alice",
        platform: "twitter",
      });

      const bridge = createMockBridge({
        getWorkspaces: vi.fn().mockResolvedValue([ws1]),
        getAccounts: vi.fn().mockResolvedValue([
          makeAccount({ id: "acc-1", displayName: "Alice", handle: "@alice" }),
        ]),
        getTabGroups: vi.fn().mockResolvedValue([g1]),
        getGroupAccounts: vi.fn().mockResolvedValue([ga1]),
        getGroupTabs: vi.fn().mockResolvedValue([]),
        // checkAcknowledged is called in the separate async IIFE
        checkAcknowledged: vi
          .fn()
          .mockResolvedValue({ acknowledged: true }),
      });
      (window as any).__socialBrowserDashboard = bridge;

      render(<WorkspaceManager />);

      await waitFor(() => {
        expect(screen.getByText("My WS")).toBeDefined();
      });

      // Select the workspace
      fireEvent.click(screen.getByText("My WS"));

      await waitFor(() => {
        expect(screen.getByText("Group A")).toBeDefined();
      });

      // Select the group
      fireEvent.click(screen.getByText("Group A"));

      // Wait for accounts to appear
      await waitFor(() => {
        // The account display shows displayName, handle, and platform
        expect(screen.getByText(/Alice/)).toBeDefined();
      });
    });
  });

  describe("acknowledgement status indicator", () => {
    it("shows warning indicator for unacknowledged accounts", async () => {
      const ws1 = makeWs({ id: "ws-1", name: "My WS" });
      const g1 = makeGroup({
        id: "g-1",
        workspaceId: "ws-1",
        name: "Group A",
      });
      const ga1 = makeGroupAccount({
        id: "ga-1",
        groupId: "g-1",
        accountId: "acc-1",
        displayName: "Unacked",
        handle: "@unacked",
      });

      const bridge = createMockBridge({
        getWorkspaces: vi.fn().mockResolvedValue([ws1]),
        getAccounts: vi.fn().mockResolvedValue([
          makeAccount({ id: "acc-1", displayName: "Unacked", handle: "@unacked" }),
        ]),
        getTabGroups: vi.fn().mockResolvedValue([g1]),
        getGroupAccounts: vi.fn().mockResolvedValue([ga1]),
        getGroupTabs: vi.fn().mockResolvedValue([]),
        // Return acknowledged: false to trigger warning indicator
        checkAcknowledged: vi
          .fn()
          .mockResolvedValue({ acknowledged: false }),
      });
      (window as any).__socialBrowserDashboard = bridge;

      render(<WorkspaceManager />);

      await waitFor(() => {
        expect(screen.getByText("My WS")).toBeDefined();
      });

      fireEvent.click(screen.getByText("My WS"));

      await waitFor(() => {
        expect(screen.getByText("Group A")).toBeDefined();
      });

      fireEvent.click(screen.getByText("Group A"));

      // Wait for the warning indicator "(!)" to appear
      await waitFor(() => {
        expect(screen.getByText("(!)")).toBeDefined();
      });
    });
  });
});

// ════════════════════════════════════════════════════
//  ToSAcknowledgment
// ════════════════════════════════════════════════════

describe("ToSAcknowledgment", () => {
  const NOTICE_TEXT =
    "Session isolation is not anti-detection and does not evade platform enforcement. Capture is read-only observation of owned content only.";

  describe("rendering", () => {
    it("renders acknowledgment modal with correct notice text", () => {
      const bridge = createMockBridge();
      (window as any).__socialBrowserDashboard = bridge;

      render(
        <ToSAcknowledgment
          accountId="acc-1"
          accountLabel="Test Account"
          onAcknowledged={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // Title should be visible
      expect(screen.getByText("Account Risk Acknowledgment")).toBeDefined();

      // Notice text should be visible
      expect(screen.getByText(NOTICE_TEXT)).toBeDefined();

      // Account label should be visible
      expect(screen.getByText(/Test Account/)).toBeDefined();
    });
  });

  describe("acknowledge flow", () => {
    it("calls acknowledgeAccount and onAcknowledged when I Acknowledge is clicked", async () => {
      const bridge = createMockBridge({
        acknowledgeAccount: vi.fn().mockResolvedValue({ acknowledged: true }),
      });
      (window as any).__socialBrowserDashboard = bridge;

      const onAcknowledged = vi.fn();
      const onCancel = vi.fn();

      render(
        <ToSAcknowledgment
          accountId="acc-1"
          accountLabel="Test Account"
          onAcknowledged={onAcknowledged}
          onCancel={onCancel}
        />
      );

      fireEvent.click(screen.getByText("I Acknowledge"));

      await waitFor(() => {
        expect(bridge.acknowledgeAccount).toHaveBeenCalledWith({
          accountId: "acc-1",
        });
      });

      await waitFor(() => {
        expect(onAcknowledged).toHaveBeenCalled();
      });
    });

    it("calls onCancel when Cancel is clicked", () => {
      const onAcknowledged = vi.fn();
      const onCancel = vi.fn();

      render(
        <ToSAcknowledgment
          accountId="acc-1"
          onAcknowledged={onAcknowledged}
          onCancel={onCancel}
        />
      );

      fireEvent.click(screen.getByText("Cancel"));

      expect(onCancel).toHaveBeenCalled();
      expect(onAcknowledged).not.toHaveBeenCalled();
    });
  });
});

// ════════════════════════════════════════════════════
//  DenialBanner
// ════════════════════════════════════════════════════

describe("DenialBanner", () => {
  describe("rendering", () => {
    it("renders error message", () => {
      render(<DenialBanner message="Something went wrong" />);

      expect(screen.getByText("Something went wrong")).toBeDefined();
      // Should have role="alert"
      const alert = screen.getByRole("alert");
      expect(alert).toBeDefined();
    });

    it("supports warning style", () => {
      render(
        <DenialBanner message="Heads up" type="warning" />
      );

      const alert = screen.getByRole("alert");
      expect(screen.getByText("Heads up")).toBeDefined();
      // Warning has specific border color; just verify it renders
      expect(alert).toBeDefined();
    });

    it("returns null when no message is provided", () => {
      const { container } = render(<DenialBanner />);
      // Container should be empty (no children rendered)
      expect(container.innerHTML).toBe("");
    });
  });

  describe("auto-dismiss", () => {
    it("calls onDismiss after the timeout", async () => {
      vi.useFakeTimers();

      const onDismiss = vi.fn();
      render(
        <DenialBanner
          message="Temp error"
          dismissMs={500}
          onDismiss={onDismiss}
        />
      );

      expect(onDismiss).not.toHaveBeenCalled();

      // Advance time past the dismiss timeout
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(onDismiss).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });
});

// ════════════════════════════════════════════════════
//  PublishAssistPanel
// ════════════════════════════════════════════════════

describe("PublishAssistPanel", () => {
  const defaultProps = {
    draftId: "draft-1",
    text: "Hello world!",
    platform: "twitter",
    accountId: "acc-1",
    onClose: vi.fn(),
    onPublished: vi.fn(),
  };

  describe("initial state", () => {
    it("renders idle state with text preview and Publish button", () => {
      render(<PublishAssistPanel {...defaultProps} />);

      expect(screen.getByText("Publish Draft")).toBeDefined();
      expect(screen.getByText("Hello world!")).toBeDefined();
      expect(screen.getByText("Publish")).toBeDefined();
    });
  });

  describe("confirmation step", () => {
    it("shows confirmation when Publish is clicked", () => {
      render(<PublishAssistPanel {...defaultProps} />);

      // Click "Publish" to go to confirming state
      fireEvent.click(screen.getByText("Publish"));

      expect(screen.getByText("Confirm Publication")).toBeDefined();
      expect(screen.getByText("Yes, Open & Insert")).toBeDefined();
      expect(screen.getByText("Back")).toBeDefined();
    });

    it("returns to idle when Back is clicked", () => {
      render(<PublishAssistPanel {...defaultProps} />);

      fireEvent.click(screen.getByText("Publish"));

      // Should be in confirmation
      expect(screen.getByText("Confirm Publication")).toBeDefined();

      fireEvent.click(screen.getByText("Back"));

      // Should be back in idle
      expect(screen.getByText("Publish Draft")).toBeDefined();
    });
  });

  describe("publish flow", () => {
    it("calls navigateTo and prefillCompose in sequence", async () => {
      const bridge = createMockBridge({
        navigateTo: vi.fn().mockResolvedValue({}),
        prefillCompose: vi.fn().mockResolvedValue({}),
      });
      (window as any).__socialBrowserDashboard = bridge;

      render(<PublishAssistPanel {...defaultProps} />);

      // Go to confirming
      fireEvent.click(screen.getByText("Publish"));

      // Click confirm
      fireEvent.click(screen.getByText("Yes, Open & Insert"));

      // Wait for the flow to complete
      await waitFor(() => {
        expect(bridge.navigateTo).toHaveBeenCalledWith({
          platform: "twitter",
          accountId: "acc-1",
        });
      });

      await waitFor(() => {
        expect(bridge.prefillCompose).toHaveBeenCalledWith({
          platform: "twitter",
          accountId: "acc-1",
          text: "Hello world!",
        });
      });
    });
  });

  describe("success message", () => {
    it("shows success message after successful publish", async () => {
      const bridge = createMockBridge({
        navigateTo: vi.fn().mockResolvedValue({}),
        prefillCompose: vi.fn().mockResolvedValue({}),
      });
      (window as any).__socialBrowserDashboard = bridge;

      const onPublished = vi.fn();

      render(
        <PublishAssistPanel
          {...defaultProps}
          onPublished={onPublished}
        />
      );

      // Navigate through the flow
      fireEvent.click(screen.getByText("Publish"));
      fireEvent.click(screen.getByText("Yes, Open & Insert"));

      // Wait for success state
      await waitFor(() => {
        expect(screen.getByText("Text Inserted")).toBeDefined();
      });

      expect(
        screen.getByText(
          "Text inserted. Click Publish on the platform to post."
        )
      ).toBeDefined();

      expect(onPublished).toHaveBeenCalled();
    });
  });

  describe("clipboard fallback", () => {
    it("shows Copy to Clipboard button on success", async () => {
      const bridge = createMockBridge({
        navigateTo: vi.fn().mockResolvedValue({}),
        prefillCompose: vi.fn().mockResolvedValue({}),
        copyToClipboard: vi.fn().mockResolvedValue({}),
      });
      (window as any).__socialBrowserDashboard = bridge;

      render(<PublishAssistPanel {...defaultProps} />);

      // Navigate through the flow
      fireEvent.click(screen.getByText("Publish"));
      fireEvent.click(screen.getByText("Yes, Open & Insert"));

      // Wait for success state
      await waitFor(() => {
        expect(screen.getByText("Text Inserted")).toBeDefined();
      });

      // Click "Copy to Clipboard"
      fireEvent.click(screen.getByText("Copy to Clipboard"));

      await waitFor(() => {
        expect(bridge.copyToClipboard).toHaveBeenCalledWith({
          text: "Hello world!",
        });
      });
    });
  });
});