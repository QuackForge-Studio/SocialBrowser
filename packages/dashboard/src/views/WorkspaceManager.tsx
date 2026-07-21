import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, X, WarningCircle, Globe, CaretLeft, CaretDown, PencilSimple } from "@phosphor-icons/react";
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

// â”€â”€ Platform config â”€â”€
const PLATFORMS: Record<string, { label: string; color: string; icon: string }> = {
  twitter:  { label: "Twitter",  color: "#1DA1F2", icon: "ð•" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", icon: "in" },
  facebook: { label: "Facebook", color: "#0866FF", icon: "f" },
  instagram:{ label: "Instagram",color: "#E4405F", icon: "â—‰" },
  reddit:   { label: "Reddit",   color: "#FF4500", icon: "â¬¥" },
  tiktok:   { label: "TikTok",   color: "#00F2EA", icon: "â™ª" },
};

// â”€â”€ Inline Edit â”€â”€
function InlineEdit({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const handleBlur = () => { setEditing(false); const t = draft.trim(); if (t && t !== value) onCommit(t); else setDraft(value); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(value); setEditing(false); } };
  if (editing) return <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} className="w-full rounded border px-2 py-0.5 text-[13px] outline-none" style={{ borderColor: "var(--color-accent)", background: "var(--color-bg-hover)", color: "var(--color-text-primary)" }} />;
  return <span onDoubleClick={() => setEditing(true)} title="Double-click to rename" className="cursor-pointer truncate text-[12px]" style={{ color: "var(--color-text-primary)" }}>{value}</span>;
}

// â”€â”€ Platform Badge â”€â”€
function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORMS[platform] ?? { label: platform, color: "var(--color-text-muted)", icon: "?" };
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: p.color + "15", color: p.color, border: "1px solid " + p.color + "25" }}>
      <span style={{ fontSize: "11px" }}>{p.icon}</span>{p.label}
    </span>
  );
}

// â”€â”€ Section Header â”€â”€
function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="section-header">
      <span>{title}</span>
      <span className="count-badge">{count}</span>
      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
    </div>
  );
}

// â”€â”€ Reusable Panel Section component â”€â”€
function PanelSection({ title, count, children, className }: { title: string; count: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={"flex flex-col " + (className ?? "")}>
      <SectionHeader title={title} count={count} />
      {children}
    </div>
  );
}

// â”€â”€ Empty State â”€â”€
function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon animate-float">{icon}</div>
      <p className="empty-state-title">{title}</p>
      {subtitle && <p className="empty-state-sub">{subtitle}</p>}
    </div>
  );
}

// â”€â”€ WorkspaceManager â”€â”€
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
  const [newTabPlatform, setNewTabPlatform] = useState("");
  const [newTabAccountId, setNewTabAccountId] = useState("");

  // Previous badge counts for pulse animation
  const prevTabCount = useRef(0);
  const [tabCountChanged, setTabCountChanged] = useState(false);

  // Initial load
  const loadData = useCallback(async () => {
    if (!bridge) return;
    try {
      const [ws, accts, wsState] = await Promise.all([bridge.getWorkspaces(), bridge.getAccounts(), bridge.getWorkspaceState()]);
      setWorkspaces(ws);
      setAllAccounts(accts);
      if (wsState?.activeWorkspaceId && ws.some((w: Workspace) => w.id === wsState.activeWorkspaceId)) {
        setSelWsId(wsState.activeWorkspaceId);
        if (wsState.activeGroupId) setSelGrpId(wsState.activeGroupId);
      }
    } catch (e: any) { setError(e?.message ?? "Failed to load data"); }
    finally { setLoading(false); }
  }, [bridge]);
  useEffect(() => { loadData(); }, [loadData]);

  // Load groups
  useEffect(() => {
    if (!bridge || !selWsId) { setGroups([]); return; }
    bridge.getTabGroups({ workspaceId: selWsId }).then(setGroups).catch(() => {});
  }, [bridge, selWsId]);

  // Load accounts & tabs
  useEffect(() => {
    if (!bridge || !selGrpId) { setGroupAccounts([]); setGroupTabs([]); return; }
    Promise.all([bridge.getGroupAccounts({ groupId: selGrpId }), bridge.getGroupTabs({ groupId: selGrpId })])
      .then(([ga, gt]) => { setGroupAccounts(ga); setGroupTabs(gt); }).catch(() => {});
  }, [bridge, selGrpId]);

  // Ack status
  useEffect(() => {
    if (!bridge || !selGrpId || groupAccounts.length === 0) return;
    (async () => {
      const map: Record<string, boolean> = {};
      for (const m of groupAccounts) {
        try { const r = await bridge.checkAcknowledged({ accountId: m.accountId }); map[m.accountId] = !!r.acknowledged; } catch { /* ignore */ }
      }
      setAckMap(map);
    })();
  }, [bridge, selGrpId, groupAccounts]);

  // Tab count pulse
  useEffect(() => {
    if (groupTabs.length !== prevTabCount.current) {
      setTabCountChanged(true);
      prevTabCount.current = groupTabs.length;
      const t = setTimeout(() => setTabCountChanged(false), 300);
      return () => clearTimeout(t);
    }
  }, [groupTabs.length]);

  const availableAccounts = useMemo(() => allAccounts.filter((a) => !groupAccounts.some((ga) => ga.accountId === a.id)), [allAccounts, groupAccounts]);
  const tabAccountsFiltered = useMemo(() => {
    if (!newTabPlatform) return groupAccounts;
    return groupAccounts.filter((ga) => ga.platform === newTabPlatform);
  }, [groupAccounts, newTabPlatform]);
  useEffect(() => { setNewTabAccountId(""); }, [newTabPlatform]);

  // â”€â”€ CRUD â”€â”€
  const createWs = async () => {
    if (!bridge) { setError("Bridge not ready."); return; }
    try { const ws = await bridge.createWorkspace({ name: "New Workspace" }); setWorkspaces((p) => [...p, ws].sort((a, b) => a.sortOrder - b.sortOrder)); } catch (e: any) { setError(e?.message ?? "Create failed"); }
  };
  const renameWs = async (id: string, name: string) => { if (!bridge) return; try { await bridge.renameWorkspace({ id, name }); setWorkspaces((p) => p.map((w) => (w.id === id ? { ...w, name } : w))); } catch (e: any) { setError(e?.message ?? "Rename failed"); } };
  const deleteWs = async (id: string) => { if (!bridge || !confirm("Delete this workspace?")) return; try { await bridge.deleteWorkspace({ id }); setWorkspaces((p) => p.filter((w) => w.id !== id)); if (selWsId === id) { setSelWsId(null); setSelGrpId(null); } } catch (e: any) { setError(e?.message ?? "Delete failed"); } };

  const createGroup = async () => {
    if (!bridge || !selWsId) return;
    try { const g = await bridge.createTabGroup({ workspaceId: selWsId, name: "New Group" }); setGroups((p) => [...p, g].sort((a, b) => a.sortOrder - b.sortOrder)); } catch (e: any) { setError(e?.message ?? "Create group failed"); }
  };
  const renameGroup = async (id: string, name: string) => { if (!bridge) return; try { await bridge.renameTabGroup({ id, name }); setGroups((p) => p.map((g) => (g.id === id ? { ...g, name } : g))); } catch (e: any) { setError(e?.message ?? "Rename failed"); } };
  const deleteGroup = async (id: string) => { if (!bridge || !confirm("Delete this group?")) return; try { await bridge.deleteTabGroup({ id }); setGroups((p) => p.filter((g) => g.id !== id)); if (selGrpId === id) setSelGrpId(null); } catch (e: any) { setError(e?.message ?? "Delete failed"); } };

  const addAccount = async (accountId: string) => { if (!bridge || !selGrpId) return; try { await bridge.addAccountToGroup({ groupId: selGrpId, accountId }); const ga = await bridge.getGroupAccounts({ groupId: selGrpId }); setGroupAccounts(ga); } catch (e: any) { setError(e?.message ?? "Add account failed"); } };
  const removeAccount = async (accountId: string) => { if (!bridge || !selGrpId) return; try { await bridge.removeAccountFromGroup({ groupId: selGrpId, accountId }); setGroupAccounts((p) => p.filter((a) => a.accountId !== accountId)); } catch (e: any) { setError(e?.message ?? "Remove failed"); } };

  const addTab = async () => {
    if (!bridge || !selGrpId || !newTabPlatform || !newTabAccountId) return;
    try { const t = await bridge.addGroupTab({ groupId: selGrpId, platform: newTabPlatform, accountId: newTabAccountId }); setGroupTabs((p) => [...p, t]); setNewTabPlatform(""); setNewTabAccountId(""); } catch (e: any) { setError(e?.message ?? "Add tab failed"); }
  };
  const removeTab = async (id: string) => { if (!bridge) return; try { await bridge.removeGroupTab({ id }); setGroupTabs((p) => p.filter((t) => t.id !== id)); } catch (e: any) { setError(e?.message ?? "Remove tab failed"); } };

  const handleAckOpen = useCallback((accountId: string) => setAckModalAccountId(accountId), []);
  const handleAckClose = useCallback(() => setAckModalAccountId(null), []);
  const handleAckConfirmed = useCallback(() => { if (!ackModalAccountId) return; setAckMap((prev) => ({ ...prev, [ackModalAccountId]: true })); setAckModalAccountId(null); }, [ackModalAccountId]);

  // â”€â”€ Loading â”€â”€
  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4" style={{ color: "var(--color-text-muted)" }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-current" style={{ borderColor: "var(--color-border)" }} />
        <p className="text-[13px]">Loading</p>
      </div>
    </div>
  );

  // â”€â”€ Empty State â”€â”€
  if (workspaces.length === 0) return (
    <div className="empty-state" style={{ height: "100%", padding: "64px 24px" }}>
      <div className="empty-state-icon animate-float" style={{ marginBottom: 4 }}>
        <Globe size={40} weight="duotone" />
      </div>
      <p className="empty-state-title" style={{ fontSize: 15, color: "var(--color-text-primary)" }}>Welcome to Social Browser</p>
      <p className="empty-state-sub">Organize social accounts into workspaces. Each workspace contains groups that you can launch side by side.</p>
      <button type="button" onClick={createWs} className="btn-accent-gradient mt-3 rounded-lg px-6 py-2.5 text-[13px]">
        <span className="flex items-center gap-2"><Plus size={14} weight="bold" /> Create your first workspace</span>
      </button>
      {error && <p className="mt-3 text-[11px]" style={{ color: "var(--color-error)" }}>{error}</p>}
    </div>
  );

  // â”€â”€ Main UI â”€â”€
  const activeWs = workspaces.find((w) => w.id === selWsId);
  const activeGrp = groups.find((g) => g.id === selGrpId);

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-base)" }}>
      {/* â”€â”€ Top bar with breadcrumb â”€â”€ */}
      <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-2 text-[13px]">
          <span className="breadcrumb-parent">Workspaces</span>
          {activeWs && (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="breadcrumb-separator"><polyline points="9,6 15,12 9,18" /></svg>
              <span className="breadcrumb-current">{activeWs.name}</span>
            </>
          )}
          {activeGrp && (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="breadcrumb-separator"><polyline points="9,6 15,12 9,18" /></svg>
              <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>{activeGrp.name}</span>
            </>
          )}
        </div>
        <button type="button" onClick={createWs} className="btn-accent-gradient rounded-lg px-4 py-2 text-[12px]">
          <span className="flex items-center gap-1.5"><Plus size={13} weight="bold" /> New</span>
        </button>
      </div>

      {/* â”€â”€ Error toast â”€â”€ */}
      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-[12px]" style={{ background: "var(--color-error-soft)", color: "var(--color-error)" }}>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} style={{ color: "var(--color-text-faint)" }}><X size={14} /></button>
        </div>
      )}

      {/* â”€â”€ Three-column layout â”€â”€ */}
      <div className="flex flex-1 min-h-0" style={{ borderTop: "1px solid var(--color-border)" }}>
        {/* COL 1: Workspaces + Groups sidebar */}
        <div className="flex w-[200px] flex-col border-r" style={{ borderColor: "var(--color-border)", background: "var(--color-bg-base)" }}>
          <div className="p-3 pb-1">
            <div className="section-header">
              <span>Workspaces</span>
              <span className="count-badge">{workspaces.length}</span>
              <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {workspaces.map((w, wi) => {
              const active = w.id === selWsId;
              const wsGroups = groups.filter((g) => g.workspaceId === w.id);
              return (
                <div key={w.id} className="mb-2.5 animate-sidebar-item" style={{ animationDelay: wi * 30 + "ms" }}>
                  <div onClick={() => { setSelWsId(w.id); setSelGrpId(null); }}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer"
                    style={{
                      color: active ? "var(--color-accent)" : "var(--color-text-muted)",
                      background: active ? "var(--color-bg-hover)" : "transparent",
                      fontSize: "11px",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      transition: "background var(--motion-fast) var(--motion-spring), color var(--motion-fast) var(--motion-spring)",
                      position: "relative",
                    }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "var(--color-bg-hover)"; }}
                    onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    {active && (
                      <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 2, height: 18, borderRadius: "0 2px 2px 0", background: "var(--color-accent)" }} />
                    )}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="truncate">{w.name}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteWs(w.id); }}
                      className="hidden rounded p-0.5 group-hover:inline-flex hover:text-current"
                      style={{ color: "var(--color-text-faint)" }}><X size={12} weight="bold" /></button>
                  </div>
                  {active && (
                    <div className="ml-4 mt-0.5 space-y-0.5">
                      {wsGroups.map((g) => (
                        <div key={g.id} onClick={() => setSelGrpId(g.id)}
                          className="group flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer text-[12px]"
                          style={{
                            color: g.id === selGrpId ? "var(--color-accent)" : "var(--color-text-muted)",
                            background: g.id === selGrpId ? "var(--color-bg-hover)" : "transparent",
                            transition: "background var(--motion-fast) var(--motion-spring)",
                          }}
                          onMouseEnter={(e) => { if (g.id !== selGrpId) (e.currentTarget as HTMLDivElement).style.background = "var(--color-bg-hover)"; }}
                          onMouseLeave={(e) => { if (g.id !== selGrpId) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                        >
                          <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: g.id === selGrpId ? "var(--color-accent)" : "var(--color-text-faint)" }} />
                          <span className="flex-1 truncate" style={{ textTransform: "none", letterSpacing: 0 }}>{g.name}</span>
                          <button onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}
                            className="hidden rounded p-0.5 group-hover:inline-flex hover:text-current"
                            style={{ color: "var(--color-text-faint)" }}><X size={10} weight="bold" /></button>
                        </div>
                      ))}
                      <button onClick={createGroup}
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px]"
                        style={{ color: "var(--color-text-faint)", transition: "background var(--motion-fast) var(--motion-spring)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg-hover)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
                      >
                        <Plus size={11} weight="bold" /> New group
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* COL 2: Group detail */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: "var(--color-bg-elevated)" }}>
          {!selGrpId ? (
            <EmptyState icon={<Globe size={36} weight="duotone" />} title="Select a group to manage" subtitle="Pick a workspace, then a group to see accounts and browser tabs." />
          ) : (
            <div className="flex flex-1 min-h-0 gap-0">
              {/* Accounts panel */}
              <div className="flex w-[220px] flex-col border-r p-4" style={{ borderColor: "var(--color-border)" }}>
                <SectionHeader title="Accounts" count={groupAccounts.length} />
                <div className="flex-1 overflow-y-auto space-y-1">
                  {groupAccounts.length === 0 && (
                    <p className="py-4 text-center text-[11px]" style={{ color: "var(--color-text-faint)" }}>Add accounts from the dropdown below</p>
                  )}
                  {groupAccounts.map((ga, i) => (
                    <div key={ga.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 animate-sidebar-item"
                      style={{ background: "var(--color-bg-base)", animationDelay: i * 20 + "ms" }}>
                      <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: ackMap[ga.accountId] ? "var(--color-success)" : "var(--color-warning)" }} />
                      <span className="flex-1 truncate text-[12px]" style={{ color: "var(--color-text-primary)" }}>{ga.displayName || ga.handle}</span>
                      {ga.platform && <PlatformBadge platform={ga.platform} />}
                      {!ackMap[ga.accountId] && (
                        <button onClick={() => handleAckOpen(ga.accountId)} style={{ color: "var(--color-warning)" }}><WarningCircle size={11} weight="fill" /></button>
                      )}
                      <button onClick={() => removeAccount(ga.accountId)} title="Remove" className="rounded p-0.5 hover:text-current" style={{ color: "var(--color-text-faint)" }}><X size={10} weight="bold" /></button>
                    </div>
                  ))}
                </div>
                {availableAccounts.length > 0 && (
                  <select value="" onChange={(e) => { if (e.target.value) addAccount(e.target.value); e.target.value = ""; }}
                    className="mt-3 w-full">
                    <option value="">+ Link account...</option>
                    {availableAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.displayName || a.handle}{a.platform ? "  (" + a.platform + ")" : ""}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Tabs panel */}
              <div className="flex flex-1 flex-col p-4">
                <SectionHeader title="Browser Tabs" count={groupTabs.length} />
                <div className="flex-1 overflow-y-auto space-y-1">
                  {groupTabs.length === 0 ? (
                    <EmptyState icon={<Globe size={28} weight="duotone" />} title="No browser tabs yet" subtitle="Create a tab below to open a platform view." />
                  ) : (
                    groupTabs.map((t, i) => {
                      const p = PLATFORMS[t.platform];
                      const account = groupAccounts.find((ga) => ga.accountId === t.accountId);
                      return (
                        <div key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 animate-sidebar-item"
                          style={{ background: "var(--color-bg-base)", animationDelay: i * 20 + "ms" }}>
                          <div className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold flex-shrink-0"
                            style={{ background: (p?.color ?? "#555") + "18", color: p?.color ?? "#555" }}>{p?.icon ?? "?"}</div>
                          <span className="flex-1 truncate text-[12px]" style={{ color: "var(--color-text-primary)" }}>{p?.label ?? t.platform}</span>
                          <span className="text-[11px] truncate max-w-[100px]" style={{ color: "var(--color-text-muted)" }}>
                            {(account?.handle ?? t.accountId).slice(0, 15)}
                          </span>
                          <button onClick={() => removeTab(t.id)} title="Close" className="rounded p-0.5 hover:text-current" style={{ color: "var(--color-text-faint)" }}><X size={10} weight="bold" /></button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* â”€â”€ Bottom New Tab bar â”€â”€ */}
                <div className="mt-auto border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>New Tab</p>
                  <div className="flex gap-2">
                    <select value={newTabPlatform} onChange={(e) => setNewTabPlatform(e.target.value)} className="flex-1">
                      <option value="">1. Pick platform</option>
                      {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                    </select>
                    <select value={newTabAccountId} onChange={(e) => setNewTabAccountId(e.target.value)} className="flex-1"
                      disabled={!newTabPlatform || tabAccountsFiltered.length === 0}>
                      <option value="">{!newTabPlatform ? "Pick platform first" : tabAccountsFiltered.length === 0 ? "No matching accounts" : "2. Pick account"}</option>
                      {tabAccountsFiltered.map((ga) => <option key={ga.accountId} value={ga.accountId}>{ga.handle || ga.displayName}</option>)}
                    </select>
                    <button type="button" onClick={addTab} disabled={!newTabPlatform || !newTabAccountId}
                      className="btn-accent-gradient rounded-md px-5 py-2 text-[12px]">
                      Launch
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ToS Modal */}
      {ackModalAccountId && (
        <ToSAcknowledgment
          accountId={ackModalAccountId}
          accountLabel={groupAccounts.find((ga) => ga.accountId === ackModalAccountId)?.displayName || ackModalAccountId}
          onAcknowledged={handleAckConfirmed}
          onCancel={handleAckClose}
        />
      )}
    </div>
  );
}

export default WorkspaceManager;