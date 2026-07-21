import React, { useState, useEffect, useCallback } from "react";
import type {
  Workspace,
  TabGroup,
  GroupAccountInfo,
  GroupTab,
  Account,
  DashboardBridge,
} from "../types";

// ── helpers ──

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

// ── palette ──

const C = {
  bg: "#1a1a2e",
  surface: "#16213e",
  primary: "#0f3460",
  accent: "#e94560",
  text: "#eee",
  textDim: "#888",
  success: "#2ecc71",
  error: "#e74c3c",
  warning: "#f39c12",
  border: "#2a2a4a",
};

const sDivider: React.CSSProperties = {
  border: "none",
  borderTop: `1px solid ${C.border}`,
  margin: "8px 0",
};

const sIconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: C.textDim,
  cursor: "pointer",
  fontSize: 14,
  padding: "2px 6px",
  borderRadius: 4,
};

// ── inline-edit helper ──

function InlineEdit({
  value,
  onCommit,
  placeholder,
  style,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
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

  return editing ? (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      style={{
        background: C.surface,
        color: C.text,
        border: `1px solid ${C.accent}`,
        borderRadius: 4,
        padding: "2px 6px",
        fontSize: 13,
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    />
  ) : (
    <span
      onDoubleClick={() => setEditing(true)}
      title="Double-click to rename"
      style={{ cursor: "pointer", ...style }}
    >
      {value}
    </span>
  );
}

// ── panel wrap helper ──

const panelWrap: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  background: C.surface,
  borderRadius: 8,
  padding: 12,
  overflowY: "auto",
};

const panelTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: C.textDim,
  textTransform: "uppercase" as const,
  letterSpacing: 1,
  marginBottom: 8,
};

// ── Main Component ──

export function WorkspaceManager() {
  const bridge = getBridge();

  // ── data state ──
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

  // ── load ──

  const loadData = useCallback(async () => {
    if (!bridge) return;
    try {
      const [ws, accts] = await Promise.all([
        bridge.getWorkspaces(),
        bridge.getAccounts(),
      ]);
      setWorkspaces(ws);
      setAllAccounts(accts);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── load groups when workspace changes ──

  useEffect(() => {
    if (!bridge || !selWsId) {
      setGroups([]);
      return;
    }
    bridge.getTabGroups({ workspaceId: selWsId }).then(setGroups).catch(() => {});
  }, [bridge, selWsId]);

  // ── load group accounts + tabs when group changes ──

  useEffect(() => {
    if (!bridge || !selGrpId) {
      setGroupAccounts([]);
      setGroupTabs([]);
      return;
    }
    Promise.all([
      bridge.getGroupAccounts({ groupId: selGrpId }),
      bridge.getGroupTabs({ groupId: selGrpId }),
    ])
      .then(([ga, gt]) => {
        setGroupAccounts(ga);
        setGroupTabs(gt);
      })
      .catch(() => {});

    // also check acknowledgement for each account in group
    (async () => {
      const map: Record<string, boolean> = {};
      try {
        const ga = await bridge.getGroupAccounts({ groupId: selGrpId });
        await Promise.all(
          ga.map(async (m) => {
            try {
              const r = await bridge.checkAcknowledged({
                accountId: m.accountId,
              });
              map[m.accountId] = r.acknowledged;
            } catch {
              map[m.accountId] = false;
            }
          })
        );
      } catch { /* ignore fetch errors */ }
      setAckMap(map);
    })();
  }, [bridge, selGrpId]);

  // ── workspace actions ──

  const createWs = async () => {
    if (!bridge) return;
    const name = window.prompt("Workspace name:")?.trim();
    if (!name) return;
    try {
      const ws = await bridge.createWorkspace({ name });
      setWorkspaces((p) =>
        [...p, ws].sort((a, b) => a.sortOrder - b.sortOrder)
      );
    } catch (e: any) {
      setError(e?.message ?? "Create workspace failed");
    }
  };

  const renameWs = async (id: string, name: string) => {
    if (!bridge) return;
    try {
      await bridge.renameWorkspace({ id, name });
      setWorkspaces((p) =>
        p.map((w) => (w.id === id ? { ...w, name } : w))
      );
    } catch (e: any) {
      setError(e?.message ?? "Rename workspace failed");
    }
  };

  const deleteWs = async (id: string) => {
    if (!bridge) return;
    if (!window.confirm("Delete this workspace?")) return;
    try {
      await bridge.deleteWorkspace({ id });
      setWorkspaces((p) => p.filter((w) => w.id !== id));
      if (selWsId === id) {
        setSelWsId(null);
        setSelGrpId(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Delete workspace failed");
    }
  };

  const moveWs = (idx: number, dir: -1 | 1) => {
    const newList = [...workspaces];
    const target = idx + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    const ids = newList.map((w) => w.id);
    setWorkspaces(newList);
    if (bridge)
      bridge
        .reorderWorkspaces({ ids })
        .catch((e: any) => setError(e?.message ?? "Reorder failed"));
  };

  // ── group actions ──

  const createGroup = async () => {
    if (!bridge || !selWsId) return;
    const name = window.prompt("Group name:")?.trim();
    if (!name) return;
    try {
      const g = await bridge.createTabGroup({ workspaceId: selWsId, name });
      setGroups((p) =>
        [...p, g].sort((a, b) => a.sortOrder - b.sortOrder)
      );
    } catch (e: any) {
      setError(e?.message ?? "Create group failed");
    }
  };

  const renameGroup = async (id: string, name: string) => {
    if (!bridge) return;
    try {
      await bridge.renameTabGroup({ id, name });
      setGroups((p) =>
        p.map((g) => (g.id === id ? { ...g, name } : g))
      );
    } catch (e: any) {
      setError(e?.message ?? "Rename group failed");
    }
  };

  const deleteGroup = async (id: string) => {
    if (!bridge) return;
    if (!window.confirm("Delete this group?")) return;
    try {
      await bridge.deleteTabGroup({ id });
      setGroups((p) => p.filter((g) => g.id !== id));
      if (selGrpId === id) setSelGrpId(null);
    } catch (e: any) {
      setError(e?.message ?? "Delete group failed");
    }
  };

  const moveGroup = (idx: number, dir: -1 | 1) => {
    const newList = [...groups];
    const target = idx + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    const ids = newList.map((g) => g.id);
    setGroups(newList);
    if (bridge)
      bridge
        .reorderTabGroups({ ids })
        .catch((e: any) => setError(e?.message ?? "Reorder failed"));
  };

  // ── membership actions ──

  const addAccount = async (accountId: string) => {
    if (!bridge || !selGrpId) return;
    try {
      const r = await bridge.addAccountToGroup({
        groupId: selGrpId,
        accountId,
      });
      if (!r.alreadyMember) {
        // reload
        const ga = await bridge.getGroupAccounts({ groupId: selGrpId });
        setGroupAccounts(ga);
      }
    } catch (e: any) {
      setError(e?.message ?? "Add account failed");
    }
  };

  const removeAccount = async (accountId: string) => {
    if (!bridge || !selGrpId) return;
    try {
      await bridge.removeAccountFromGroup({ groupId: selGrpId, accountId });
      setGroupAccounts((p) => p.filter((a) => a.accountId !== accountId));
    } catch (e: any) {
      setError(e?.message ?? "Remove account failed");
    }
  };

  const moveAccount = (idx: number, dir: -1 | 1) => {
    const newList = [...groupAccounts];
    const target = idx + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    setGroupAccounts(newList);
    if (bridge && selGrpId)
      bridge
        .reorderGroupAccounts({
          groupId: selGrpId,
          accountIds: newList.map((a) => a.accountId),
        })
        .catch((e: any) => setError(e?.message ?? "Reorder failed"));
  };

  // ── tab actions ──

  const addTab = async (platform: string, accountId: string) => {
    if (!bridge || !selGrpId) return;
    try {
      const t = await bridge.addGroupTab({
        groupId: selGrpId,
        platform,
        accountId,
      });
      setGroupTabs((p) =>
        [...p, t].sort((a, b) => a.sortOrder - b.sortOrder)
      );
    } catch (e: any) {
      setError(e?.message ?? "Add tab failed");
    }
  };

  const removeTab = async (id: string) => {
    if (!bridge) return;
    try {
      await bridge.removeGroupTab({ id });
      setGroupTabs((p) => p.filter((t) => t.id !== id));
    } catch (e: any) {
      setError(e?.message ?? "Remove tab failed");
    }
  };

  const moveTab = (idx: number, dir: -1 | 1) => {
    const newList = [...groupTabs];
    const target = idx + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    setGroupTabs(newList);
    if (bridge && selGrpId)
      bridge
        .reorderGroupTabs({
          groupId: selGrpId,
          tabIds: newList.map((t) => t.id),
        })
        .catch((e: any) => setError(e?.message ?? "Reorder failed"));
  };

  // ── select group ──

  const selectGroup = (wsId: string, gId: string) => {
    setSelGrpId(gId);
    if (bridge) bridge.setActiveGroup({ workspaceId: wsId, groupId: gId });
  };

  // ── available accounts (not yet in group) ──

  const groupAccountIds = new Set(groupAccounts.map((a) => a.accountId));
  const availableAccounts = allAccounts.filter(
    (a) => !groupAccountIds.has(a.id)
  );

  // ── loading ──

  if (loading) {
    return (
      <div style={{ padding: 24, color: C.text }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          Workspaces
        </h2>
        <p style={{ color: C.textDim, marginTop: 12 }}>Loading...</p>
      </div>
    );
  }

  // ── empty state ──

  if (workspaces.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: C.textDim,
          padding: 40,
        }}
      >
        <p style={{ fontSize: 18, marginBottom: 4 }}>No workspaces yet</p>
        <p style={{ fontSize: 13, marginBottom: 16 }}>
          Create a workspace to start organizing your accounts and tabs.
        </p>
        <button
          onClick={createWs}
          style={{
            background: C.accent,
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Create Workspace
        </button>
        {error && (
          <p style={{ color: C.error, marginTop: 12, fontSize: 13 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── full layout ──

  return (
    <div style={{ padding: 16, color: C.text, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Workspaces</h2>
        <button onClick={createWs} style={{ ...sIconBtn, color: C.success, fontSize: 18, fontWeight: 700 }} title="Create workspace">
          +
        </button>
        {error && (
          <span style={{ color: C.error, fontSize: 12, marginLeft: "auto" }}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{ ...sIconBtn, color: C.textDim, marginLeft: 8 }}
            >
              x
            </button>
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* ── LEFT: Workspaces ── */}
        <div style={panelWrap}>
          <div style={panelTitle}>Workspaces</div>
          {workspaces.map((ws, i) => (
            <div
              key={ws.id}
              onClick={() => { setSelWsId(ws.id); setSelGrpId(null); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px",
                borderRadius: 6,
                cursor: "pointer",
                background: selWsId === ws.id ? C.primary : "transparent",
                border: selWsId === ws.id ? `1px solid ${C.accent}` : "1px solid transparent",
                marginBottom: 2,
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); moveWs(i, -1); }}
                disabled={i === 0}
                style={{ ...sIconBtn, opacity: i === 0 ? 0.3 : 1 }}
              >
                ▲
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveWs(i, 1); }}
                disabled={i === workspaces.length - 1}
                style={{ ...sIconBtn, opacity: i === workspaces.length - 1 ? 0.3 : 1 }}
              >
                ▼
              </button>
              <InlineEdit
                value={ws.name}
                onCommit={(v) => renameWs(ws.id, v)}
                style={{ flex: 1, fontSize: 13, color: C.text }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); deleteWs(ws.id); }}
                style={{ ...sIconBtn, color: C.error }}
                title="Delete workspace"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* ── CENTER: Groups ── */}
        <div style={panelWrap}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={panelTitle}>Groups</div>
            {selWsId && (
              <button onClick={createGroup} style={{ ...sIconBtn, color: C.success, fontSize: 16, fontWeight: 700 }} title="Create group">
                +
              </button>
            )}
          </div>
          {!selWsId ? (
            <p style={{ color: C.textDim, fontSize: 12 }}>Select a workspace</p>
          ) : groups.length === 0 ? (
            <p style={{ color: C.textDim, fontSize: 12 }}>No groups in this workspace</p>
          ) : (
            groups.map((g, i) => (
              <div
                key={g.id}
                onClick={() => selectGroup(g.workspaceId, g.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: selGrpId === g.id ? C.primary : "transparent",
                  border: selGrpId === g.id ? `1px solid ${C.accent}` : "1px solid transparent",
                  marginBottom: 2,
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); moveGroup(i, -1); }}
                  disabled={i === 0}
                  style={{ ...sIconBtn, opacity: i === 0 ? 0.3 : 1 }}
                >
                  ▲
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); moveGroup(i, 1); }}
                  disabled={i === groups.length - 1}
                  style={{ ...sIconBtn, opacity: i === groups.length - 1 ? 0.3 : 1 }}
                >
                  ▼
                </button>
                <InlineEdit
                  value={g.name}
                  onCommit={(v) => renameGroup(g.id, v)}
                  style={{ flex: 1, fontSize: 13, color: C.text }}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}
                  style={{ ...sIconBtn, color: C.error }}
                  title="Delete group"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* ── RIGHT: Members & Tabs ── */}
        <div style={panelWrap}>
          {!selGrpId ? (
            <p style={{ color: C.textDim, fontSize: 12 }}>Select a group</p>
          ) : (
            <>
              {/* Accounts */}
              <div style={{ marginBottom: 16 }}>
                <div style={panelTitle}>
                  Accounts ({groupAccounts.length})
                </div>
                {groupAccounts.map((ga, i) => (
                  <div
                    key={ga.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: C.primary,
                      marginBottom: 2,
                      fontSize: 12,
                    }}
                  >
                    <button
                      onClick={() => moveAccount(i, -1)}
                      disabled={i === 0}
                      style={{ ...sIconBtn, opacity: i === 0 ? 0.3 : 1, fontSize: 10 }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveAccount(i, 1)}
                      disabled={i === groupAccounts.length - 1}
                      style={{ ...sIconBtn, opacity: i === groupAccounts.length - 1 ? 0.3 : 1, fontSize: 10 }}
                    >
                      ▼
                    </button>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: ackMap[ga.accountId] ? C.success : C.warning,
                        flexShrink: 0,
                      }}
                      title={
                        ackMap[ga.accountId]
                          ? "Acknowledged"
                          : "Acknowledgment required"
                      }
                    />
                    <span style={{ flex: 1 }}>
                      {ga.displayName || ga.handle || ga.accountId}
                      {ga.platform && (
                        <span style={{ color: C.textDim, marginLeft: 4 }}>
                          @{ga.platform}
                        </span>
                      )}
                      {!ackMap[ga.accountId] && (
                        <span style={{ color: C.warning, marginLeft: 6, fontSize: 10 }}>
                          (!)
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => removeAccount(ga.accountId)}
                      style={{ ...sIconBtn, color: C.error, fontSize: 12 }}
                      title="Remove account"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* Add account dropdown */}
                {availableAccounts.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addAccount(e.target.value);
                      e.target.value = "";
                    }}
                    style={{
                      marginTop: 6,
                      width: "100%",
                      background: C.bg,
                      color: C.text,
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                      padding: "4px 8px",
                      fontSize: 12,
                    }}
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

              <hr style={sDivider} />

              {/* Tabs */}
              <div>
                <div style={panelTitle}>Tabs ({groupTabs.length})</div>
                {groupTabs.map((t, i) => (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: C.bg,
                      marginBottom: 2,
                      fontSize: 12,
                    }}
                  >
                    <button
                      onClick={() => moveTab(i, -1)}
                      disabled={i === 0}
                      style={{ ...sIconBtn, opacity: i === 0 ? 0.3 : 1, fontSize: 10 }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveTab(i, 1)}
                      disabled={i === groupTabs.length - 1}
                      style={{ ...sIconBtn, opacity: i === groupTabs.length - 1 ? 0.3 : 1, fontSize: 10 }}
                    >
                      ▼
                    </button>
                    <span style={{ flex: 1 }}>
                      {t.platform}
                      {t.url && (
                        <span style={{ color: C.textDim, marginLeft: 4, fontSize: 10 }}>
                          {t.url.length > 30
                            ? t.url.slice(0, 30) + "..."
                            : t.url}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => removeTab(t.id)}
                      style={{ ...sIconBtn, color: C.error, fontSize: 12 }}
                      title="Remove tab"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* Add tab */}
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <select
                    id="tab-platform"
                    style={{
                      flex: 1,
                      background: C.bg,
                      color: C.text,
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                      padding: "4px 8px",
                      fontSize: 12,
                    }}
                  >
                    <option value="">Platform...</option>
                    <option value="twitter">Twitter</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="reddit">Reddit</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                  <select
                    id="tab-account"
                    style={{
                      flex: 1,
                      background: C.bg,
                      color: C.text,
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                      padding: "4px 8px",
                      fontSize: 12,
                    }}
                  >
                    <option value="">Account...</option>
                    {groupAccounts.map((ga) => (
                      <option key={ga.accountId} value={ga.accountId}>
                        {ga.handle || ga.displayName || ga.accountId}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const plat = (
                        document.getElementById("tab-platform") as HTMLSelectElement
                      )?.value;
                      const acct = (
                        document.getElementById("tab-account") as HTMLSelectElement
                      )?.value;
                      if (plat && acct) addTab(plat, acct);
                    }}
                    style={{
                      background: C.accent,
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      padding: "4px 12px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    + Tab
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default WorkspaceManager;
