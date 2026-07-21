import React, { useState, useEffect, useCallback } from "react";
import { Plus, X, CaretUp, CaretDown, WarningCircle } from "@phosphor-icons/react";
import type {
  Workspace,
  TabGroup,
  GroupAccountInfo,
  GroupTab,
  Account,
  DashboardBridge,
} from "../types";
import { ToSAcknowledgment } from "./ToSAcknowledgment";

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

function InlineEdit({
  value,
  onCommit,
  placeholder,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleBlur = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== value) onCommit(t);
    else setDraft(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full rounded-sm border border-accent bg-bg px-1.5 py-0.5 text-[13px] text-text outline-none"
      />
    );
  }

  return (
    <span
      onDoubleClick={() => setEditing(true)}
      title="Double-click to rename"
      className={"cursor-pointer flex-1 truncate text-[13px] text-text " + (className ?? "")}
    >
      {value}
    </span>
  );
}

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function IconBtn({
  onClick,
  disabled,
  title,
  children,
  danger,
}: {
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      disabled={disabled}
      title={title}
      className={[
        "flex h-6 w-6 items-center justify-center rounded-sm transition-colors",
        disabled
          ? "cursor-default opacity-30"
          : danger
            ? "text-text-faint hover:bg-error-soft hover:text-error"
            : "text-text-faint hover:bg-surface-hover hover:text-text-dim",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function WorkspaceManager() {
  const bridge = getBridge();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [groupAccounts, setGroupAccounts] = useState<GroupAccountInfo[]>([]);
  const [groupTabs, setGroupTabs] = useState<GroupTab[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [ackMap, setAckMap] = useState<Record<string, boolean>>({});

  const [selWsId, setSelWsId] = useState<string | null>(null);
  const [selGrpId, setSelGrpId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ackModalAccountId, setAckModalAccountId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!bridge) return;
    try {
      const [ws, accts, wsState] = await Promise.all([
        bridge.getWorkspaces(),
        bridge.getAccounts(),
        bridge.getWorkspaceState(),
      ]);
      setWorkspaces(ws);
      setAllAccounts(accts);
      if (wsState.activeWorkspaceId && ws.some((w: Workspace) => w.id === wsState.activeWorkspaceId)) {
        setSelWsId(wsState.activeWorkspaceId);
        if (wsState.activeGroupId) setSelGrpId(wsState.activeGroupId);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAckOpen = useCallback((accountId: string) => setAckModalAccountId(accountId), []);
  const handleAckClose = useCallback(() => setAckModalAccountId(null), []);
  const handleAckConfirmed = useCallback(() => {
    if (!ackModalAccountId) return;
    setAckMap((prev) => ({ ...prev, [ackModalAccountId]: true }));
    setAckModalAccountId(null);
  }, [ackModalAccountId]);

  useEffect(() => {
    if (!bridge || !selWsId) { setGroups([]); return; }
    bridge.getTabGroups({ workspaceId: selWsId }).then(setGroups).catch(() => {});
  }, [bridge, selWsId]);

  useEffect(() => {
    if (!bridge || !selGrpId) { setGroupAccounts([]); setGroupTabs([]); return; }
    Promise.all([
      bridge.getGroupAccounts({ groupId: selGrpId }),
      bridge.getGroupTabs({ groupId: selGrpId }),
    ]).then(([ga, gt]) => { setGroupAccounts(ga); setGroupTabs(gt); }).catch(() => {});

    (async () => {
      const map: Record<string, boolean> = {};
      try {
        const ga = await bridge.getGroupAccounts({ groupId: selGrpId });
        await Promise.all(
          ga.map(async (m) => {
            try {
              const r = await bridge.checkAcknowledged({ accountId: m.accountId });
              map[m.accountId] = r.acknowledged;
            } catch { map[m.accountId] = false; }
          })
        );
      } catch { /* ignore */ }
      setAckMap(map);
    })();
  }, [bridge, selGrpId]);

  const createWs = async () => {
    if (!bridge) {
      setError("Bridge not available � dashboard may still be loading. Please try again.");
      return;
    }
    try {
      // Electron WebContentsView does NOT support window.prompt()
      // Use "New Workspace" as default name � user can double-click to rename
      const name = "New Workspace";
      const ws = await bridge.createWorkspace({ name });
      setWorkspaces((p) => [...p, ws].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (e: any) { setError(e?.message ?? "Create workspace failed"); }
  };

  const renameWs = async (id: string, name: string) => {
    if (!bridge) return;
    try {
      await bridge.renameWorkspace({ id, name });
      setWorkspaces((p) => p.map((w) => (w.id === id ? { ...w, name } : w)));
    } catch (e: any) { setError(e?.message ?? "Rename workspace failed"); }
  };

  const deleteWs = async (id: string) => {
    if (!bridge) return;
    if (!window.confirm("Delete this workspace?")) return;
    try {
      await bridge.deleteWorkspace({ id });
      setWorkspaces((p) => p.filter((w) => w.id !== id));
      if (selWsId === id) { setSelWsId(null); setSelGrpId(null); }
    } catch (e: any) { setError(e?.message ?? "Delete workspace failed"); }
  };

  const moveWs = (idx: number, dir: -1 | 1) => {
    const newList = [...workspaces];
    const target = idx + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    const ids = newList.map((w) => w.id);
    setWorkspaces(newList);
    if (bridge) bridge.reorderWorkspaces({ ids }).catch((e: any) => setError(e?.message ?? "Reorder failed"));
  };

  const createGroup = async () => {
    if (!bridge || !selWsId) return;
    const name = "New Group";
    if (!name) return;
    try {
      const g = await bridge.createTabGroup({ workspaceId: selWsId, name });
      setGroups((p) => [...p, g].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (e: any) { setError(e?.message ?? "Create group failed"); }
  };

  const renameGroup = async (id: string, name: string) => {
    if (!bridge) return;
    try {
      await bridge.renameTabGroup({ id, name });
      setGroups((p) => p.map((g) => (g.id === id ? { ...g, name } : g)));
    } catch (e: any) { setError(e?.message ?? "Rename group failed"); }
  };

  const deleteGroup = async (id: string) => {
    if (!bridge) return;
    if (!window.confirm("Delete this group?")) return;
    try {
      await bridge.deleteTabGroup({ id });
      setGroups((p) => p.filter((g) => g.id !== id));
      if (selGrpId === id) setSelGrpId(null);
    } catch (e: any) { setError(e?.message ?? "Delete group failed"); }
  };

  const moveGroup = (idx: number, dir: -1 | 1) => {
    const newList = [...groups];
    const target = idx + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    const ids = newList.map((g) => g.id);
    setGroups(newList);
    if (bridge) bridge.reorderTabGroups({ ids }).catch((e: any) => setError(e?.message ?? "Reorder failed"));
  };

  const addAccount = async (accountId: string) => {
    if (!bridge || !selGrpId) return;
    try {
      const r = await bridge.addAccountToGroup({ groupId: selGrpId, accountId });
      if (!r.alreadyMember) {
        const ga = await bridge.getGroupAccounts({ groupId: selGrpId });
        setGroupAccounts(ga);
      }
    } catch (e: any) { setError(e?.message ?? "Add account failed"); }
  };

  const removeAccount = async (accountId: string) => {
    if (!bridge || !selGrpId) return;
    try {
      await bridge.removeAccountFromGroup({ groupId: selGrpId, accountId });
      setGroupAccounts((p) => p.filter((a) => a.accountId !== accountId));
    } catch (e: any) { setError(e?.message ?? "Remove account failed"); }
  };

  const moveAccount = (idx: number, dir: -1 | 1) => {
    const newList = [...groupAccounts];
    const target = idx + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    setGroupAccounts(newList);
    if (bridge && selGrpId) bridge.reorderGroupAccounts({ groupId: selGrpId, accountIds: newList.map((a) => a.accountId) }).catch((e: any) => setError(e?.message ?? "Reorder failed"));
  };

  const addTab = async (platform: string, accountId: string) => {
    if (!bridge || !selGrpId) return;
    try {
      const t = await bridge.addGroupTab({ groupId: selGrpId, platform, accountId });
      setGroupTabs((p) => [...p, t].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (e: any) { setError(e?.message ?? "Add tab failed"); }
  };

  const removeTab = async (id: string) => {
    if (!bridge) return;
    try {
      await bridge.removeGroupTab({ id });
      setGroupTabs((p) => p.filter((t) => t.id !== id));
    } catch (e: any) { setError(e?.message ?? "Remove tab failed"); }
  };

  const moveTab = (idx: number, dir: -1 | 1) => {
    const newList = [...groupTabs];
    const target = idx + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    setGroupTabs(newList);
    if (bridge && selGrpId) bridge.reorderGroupTabs({ groupId: selGrpId, tabIds: newList.map((t) => t.id) }).catch((e: any) => setError(e?.message ?? "Reorder failed"));
  };

  const selectGroup = (wsId: string, gId: string) => {
    setSelGrpId(gId);
    if (bridge) bridge.setActiveGroup({ workspaceId: wsId, groupId: gId });
  };

  const groupAccountIds = new Set(groupAccounts.map((a) => a.accountId));
  const availableAccounts = allAccounts.filter((a) => !groupAccountIds.has(a.id));

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold tracking-tight">Workspaces</h2>
        <p className="mt-3 text-[13px] text-text-dim">Loading...</p>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 text-center">
        <p className="text-[17px] font-medium text-text">No workspaces yet</p>
        <p className="mt-1.5 text-[13px] text-text-dim">
          Create a workspace to start organizing your accounts and tabs.
        </p>
        <button
          type="button"
          onClick={createWs}
          className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover active:translate-y-px"
        >
          <Plus size={14} weight="bold" /> Create Workspace
        </button>
        {error && <p className="mt-4 text-[12px] text-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Workspaces</h2>
        <button
          type="button"
          onClick={createWs}
          title="Create workspace"
          className="flex h-7 w-7 items-center justify-center rounded-md text-success transition-colors hover:bg-success-soft"
        >
          <Plus size={16} weight="bold" />
        </button>
        {error && (
          <span className="ml-auto inline-flex items-center gap-2 rounded-md bg-error-soft px-2.5 py-1 text-[12px] text-error">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-text-faint hover:text-text"
            >
              <X size={12} />
            </button>
          </span>
        )}
      </div>

      {/* Three-panel layout */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* LEFT: Workspaces */}
        <Panel title="Workspaces">
          {workspaces.map((ws, i) => (
            <div
              key={ws.id}
              onClick={() => { setSelWsId(ws.id); setSelGrpId(null); }}
              className={[
                "group mb-0.5 flex items-center gap-1 rounded-md border px-2 py-1.5 cursor-pointer transition-colors",
                selWsId === ws.id
                  ? "border-accent bg-accent-soft"
                  : "border-transparent hover:bg-surface-hover",
              ].join(" ")}
            >
              <IconBtn onClick={() => moveWs(i, -1)} disabled={i === 0} title="Move up">
                <CaretUp size={10} weight="fill" />
              </IconBtn>
              <IconBtn onClick={() => moveWs(i, 1)} disabled={i === workspaces.length - 1} title="Move down">
                <CaretDown size={10} weight="fill" />
              </IconBtn>
              <InlineEdit
                value={ws.name}
                onCommit={(v) => renameWs(ws.id, v)}
              />
              <IconBtn onClick={() => deleteWs(ws.id)} title="Delete workspace" danger>
                <X size={11} weight="bold" />
              </IconBtn>
            </div>
          ))}
        </Panel>

        {/* CENTER: Groups */}
        <Panel
          title="Groups"
          action={selWsId ? (
            <button
              type="button"
              onClick={createGroup}
              title="Create group"
              className="flex h-6 w-6 items-center justify-center rounded-sm text-success transition-colors hover:bg-success-soft"
            >
              <Plus size={14} weight="bold" />
            </button>
          ) : null}
        >
          {!selWsId ? (
            <p className="text-[12px] text-text-faint">Select a workspace</p>
          ) : groups.length === 0 ? (
            <p className="text-[12px] text-text-faint">No groups in this workspace</p>
          ) : (
            groups.map((g, i) => (
              <div
                key={g.id}
                onClick={() => selectGroup(g.workspaceId, g.id)}
                className={[
                  "group mb-0.5 flex items-center gap-1 rounded-md border px-2 py-1.5 cursor-pointer transition-colors",
                  selGrpId === g.id
                    ? "border-accent bg-accent-soft"
                    : "border-transparent hover:bg-surface-hover",
                ].join(" ")}
              >
                <IconBtn onClick={() => moveGroup(i, -1)} disabled={i === 0} title="Move up">
                  <CaretUp size={10} weight="fill" />
                </IconBtn>
                <IconBtn onClick={() => moveGroup(i, 1)} disabled={i === groups.length - 1} title="Move down">
                  <CaretDown size={10} weight="fill" />
                </IconBtn>
                <InlineEdit value={g.name} onCommit={(v) => renameGroup(g.id, v)} />
                <IconBtn onClick={() => deleteGroup(g.id)} title="Delete group" danger>
                  <X size={11} weight="bold" />
                </IconBtn>
              </div>
            ))
          )}
        </Panel>

        {/* RIGHT: Members & Tabs */}
        <Panel title={selGrpId ? `Members & Tabs` : "Members & Tabs"}>
          {!selGrpId ? (
            <p className="text-[12px] text-text-faint">Select a group</p>
          ) : (
            <>
              {/* Accounts */}
              <div className="mb-4">
                <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                  Accounts ({groupAccounts.length})
                </h4>
                {groupAccounts.map((ga, i) => (
                  <div
                    key={ga.id}
                    className="mb-0.5 flex items-center gap-1.5 rounded-md bg-bg-elevated px-2 py-1.5 text-[12px]"
                  >
                    <IconBtn onClick={() => moveAccount(i, -1)} disabled={i === 0} title="Move up">
                      <CaretUp size={9} weight="fill" />
                    </IconBtn>
                    <IconBtn onClick={() => moveAccount(i, 1)} disabled={i === groupAccounts.length - 1} title="Move down">
                      <CaretDown size={9} weight="fill" />
                    </IconBtn>
                    <span
                      className={[
                        "h-2 w-2 flex-shrink-0 rounded-full",
                        ackMap[ga.accountId] ? "bg-success" : "bg-warning cursor-pointer",
                      ].join(" ")}
                      title={ackMap[ga.accountId] ? "Acknowledged" : "Click to acknowledge"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!ackMap[ga.accountId]) handleAckOpen(ga.accountId);
                      }}
                    />
                    <span className="flex-1 truncate text-text">
                      {ga.displayName || ga.handle || ga.accountId}
                      {ga.platform && (
                        <span className="ml-1 text-text-faint">@{ga.platform}</span>
                      )}
                      {!ackMap[ga.accountId] && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleAckOpen(ga.accountId); }}
                          title="Click to acknowledge"
                          className="ml-1.5 inline-flex text-warning hover:text-warning-hover"
                        >
                          <WarningCircle size={11} weight="fill" />
                        </button>
                      )}
                    </span>
                    <IconBtn onClick={() => removeAccount(ga.accountId)} title="Remove account" danger>
                      <X size={10} weight="bold" />
                    </IconBtn>
                  </div>
                ))}

                {availableAccounts.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addAccount(e.target.value);
                      e.target.value = "";
                    }}
                    className="mt-1.5 w-full"
                  >
                    <option value="">+ Add account...</option>
                    {availableAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName || a.handle} ({a.platform})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="my-2 h-px bg-border" />

              {/* Tabs */}
              <div>
                <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                  Tabs ({groupTabs.length})
                </h4>
                {groupTabs.map((t, i) => (
                  <div
                    key={t.id}
                    className="mb-0.5 flex items-center gap-1.5 rounded-md bg-bg-elevated px-2 py-1.5 text-[12px]"
                  >
                    <IconBtn onClick={() => moveTab(i, -1)} disabled={i === 0} title="Move up">
                      <CaretUp size={9} weight="fill" />
                    </IconBtn>
                    <IconBtn onClick={() => moveTab(i, 1)} disabled={i === groupTabs.length - 1} title="Move down">
                      <CaretDown size={9} weight="fill" />
                    </IconBtn>
                    <span className="flex-1 truncate text-text">
                      {t.platform}
                      {t.url && (
                        <span className="ml-1 truncate text-[10px] text-text-faint">
                          {t.url.length > 30 ? t.url.slice(0, 30) + "..." : t.url}
                        </span>
                      )}
                    </span>
                    <IconBtn onClick={() => removeTab(t.id)} title="Remove tab" danger>
                      <X size={10} weight="bold" />
                    </IconBtn>
                  </div>
                ))}

                <div className="mt-1.5 flex gap-1.5">
                  <select id="tab-platform" className="flex-1">
                    <option value="">Platform...</option>
                    <option value="twitter">Twitter</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="reddit">Reddit</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                  <select id="tab-account" className="flex-1">
                    <option value="">Account...</option>
                    {groupAccounts.map((ga) => (
                      <option key={ga.accountId} value={ga.accountId}>
                        {ga.handle || ga.displayName || ga.accountId}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const plat = (document.getElementById("tab-platform") as HTMLSelectElement)?.value;
                      const acct = (document.getElementById("tab-account") as HTMLSelectElement)?.value;
                      if (plat && acct) addTab(plat, acct);
                    }}
                    className="rounded-sm bg-accent px-3 py-1 text-[12px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                  >
                    + Tab
                  </button>
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* ToS Acknowledgment Modal */}
      {ackModalAccountId && (
        <ToSAcknowledgment
          accountId={ackModalAccountId}
          accountLabel={
            groupAccounts.find((ga) => ga.accountId === ackModalAccountId)?.displayName ||
            groupAccounts.find((ga) => ga.accountId === ackModalAccountId)?.handle ||
            ackModalAccountId
          }
          onAcknowledged={handleAckConfirmed}
          onCancel={handleAckClose}
        />
      )}
    </div>
  );
}

export default WorkspaceManager;
