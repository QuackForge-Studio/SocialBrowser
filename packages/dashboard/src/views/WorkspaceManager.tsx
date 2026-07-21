import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, X, CaretUp, CaretDown, WarningCircle, Globe, CaretRight } from "@phosphor-icons/react";
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

// ── Platform definitions ──
const PLATFORMS: Record<string, { label: string; color: string; icon: string }> = {
  twitter:  { label: "Twitter",  color: "#1DA1F2", icon: "𝕏" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", icon: "in" },
  facebook: { label: "Facebook", color: "#0866FF", icon: "f" },
  instagram:{ label: "Instagram",color: "#E4405F", icon: "◉" },
  reddit:   { label: "Reddit",   color: "#FF4500", icon: "⬥" },
  tiktok:   { label: "TikTok",   color: "#00F2EA", icon: "♪" },
};

function getPlatformColor(platform: string): string {
  return PLATFORMS[platform]?.color ?? "var(--color-text-faint)";
}

// ── Inline Edit ──
function InlineEdit({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const handleBlur = () => { setEditing(false); const t = draft.trim(); if (t && t !== value) onCommit(t); else setDraft(value); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(value); setEditing(false); } };
  if (editing) return <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} placeholder={placeholder} className="w-full rounded border border-accent bg-bg-elevated px-2 py-1 text-[13px] text-text outline-none" />;
  return <span onDoubleClick={() => setEditing(true)} title="Double-click to rename" className="cursor-pointer truncate text-[13px] text-text">{value}</span>;
}

// ── Icon Button ──
function IconBtn({ onClick, disabled, title, children, danger }: { onClick: (e: React.MouseEvent) => void; disabled?: boolean; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(e); }} disabled={disabled} title={title}
      className={["flex h-6 w-6 items-center justify-center rounded transition-colors", disabled ? "cursor-default opacity-30" : danger ? "text-text-faint hover:bg-error-soft hover:text-error" : "text-text-faint hover:bg-surface-hover hover:text-text"].join(" ")}>
      {children}
    </button>
  );
}

// ── Platform Badge ──
function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORMS[platform] ?? { label: platform, color: "var(--color-text-faint)", icon: "?" };
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: p.color + "18", color: p.color, border: "1px solid " + p.color + "30" }}>
      <span className="text-[11px]">{p.icon}</span>{p.label}
    </span>
  );
}

// ── WorkspaceManager ──
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

  // Tab creation state
  const [newTabPlatform, setNewTabPlatform] = useState("");
  const [newTabAccountId, setNewTabAccountId] = useState("");

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

  // Load groups when workspace changes
  useEffect(() => {
    if (!bridge || !selWsId) { setGroups([]); return; }
    bridge.getTabGroups({ workspaceId: selWsId }).then(setGroups).catch(() => {});
  }, [bridge, selWsId]);

  // Load accounts & tabs when group changes
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

  // Compute available accounts (not already in group)
  const availableAccounts = useMemo(() =>
    allAccounts.filter((a) => !groupAccounts.some((ga) => ga.accountId === a.id)),
  [allAccounts, groupAccounts]);

  // Filter tab-account by selected platform
  const tabAccountsFiltered = useMemo(() => {
    if (!newTabPlatform) return groupAccounts;
    return groupAccounts.filter((ga) => ga.platform === newTabPlatform);
  }, [groupAccounts, newTabPlatform]);

  // Reset tab account when platform changes
  useEffect(() => { setNewTabAccountId(""); }, [newTabPlatform]);

  // ── CRUD Actions ──
  const createWs = async () => {
    if (!bridge) { setError("Bridge not ready — try again."); return; }
    try {
      const ws = await bridge.createWorkspace({ name: "New Workspace" });
      setWorkspaces((p) => [...p, ws].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (e: any) { setError(e?.message ?? "Create workspace failed"); }
  };
  const renameWs = async (id: string, name: string) => { if (!bridge) return; try { await bridge.renameWorkspace({ id, name }); setWorkspaces((p) => p.map((w) => (w.id === id ? { ...w, name } : w))); } catch (e: any) { setError(e?.message ?? "Rename failed"); } };
  const deleteWs = async (id: string) => { if (!bridge || !confirm("Delete this workspace and all its groups?")) return; try { await bridge.deleteWorkspace({ id }); setWorkspaces((p) => p.filter((w) => w.id !== id)); if (selWsId === id) { setSelWsId(null); setSelGrpId(null); } } catch (e: any) { setError(e?.message ?? "Delete failed"); } };

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

  // ── Ack ──
  const handleAckOpen = useCallback((accountId: string) => setAckModalAccountId(accountId), []);
  const handleAckClose = useCallback(() => setAckModalAccountId(null), []);
  const handleAckConfirmed = useCallback(() => { if (!ackModalAccountId) return; setAckMap((prev) => ({ ...prev, [ackModalAccountId]: true })); setAckModalAccountId(null); }, [ackModalAccountId]);

  // ── Loading ──
  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-text-dim">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-[13px]">Loading workspaces...</p>
      </div>
    </div>
  );

  // ── Empty State ──
  if (workspaces.length === 0) return (
    <div className="flex h-full flex-col items-center justify-center px-10 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Globe size={28} weight="duotone" />
      </div>
      <p className="text-[18px] font-semibold text-text">Welcome to Social Browser</p>
      <p className="mt-2 max-w-sm text-[13px] text-text-dim leading-relaxed">
        Organize your social accounts into workspaces. Each workspace contains groups of accounts that you can launch side by side.
      </p>
      <button type="button" onClick={createWs}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-[14px] font-semibold text-accent-foreground transition-all hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/20 active:scale-[0.98]">
        <Plus size={16} weight="bold" /> Create your first workspace
      </button>
      {error && <p className="mt-4 text-[12px] text-error">{error}</p>}
    </div>
  );

  // ── Main UI ──
  return (
    <div className="flex h-full flex-col">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-text">Workspaces</h2>
          {selWsId && <span className="text-text-faint"><CaretRight size={12} weight="bold" /></span>}
          {selWsId && <span className="text-[13px] text-text-dim">{workspaces.find((w) => w.id === selWsId)?.name ?? ""}</span>}
        </div>
        <button type="button" onClick={createWs} title="New workspace"
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover">
          <Plus size={13} weight="bold" /> New
        </button>
      </div>

      {/* ── Error toast ── */}
      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-md bg-error-soft px-3 py-2 text-[12px] text-error">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-text-faint hover:text-text"><X size={14} /></button>
        </div>
      )}

      {/* ── Three-column layout ── */}
      <div className="flex flex-1 min-h-0 gap-0 border-t border-border">
        {/* COL 1: Workspaces + Groups */}
        <div className="flex w-56 flex-col border-r border-border bg-bg-elevated/50">
          <div className="p-3 pb-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-faint">Workspaces</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {workspaces.map((w) => {
              const active = w.id === selWsId;
              const wsGroups = groups.filter((g) => g.workspaceId === w.id);
              return (
                <div key={w.id} className="mb-3">
                  <div onClick={() => { setSelWsId(w.id); setSelGrpId(null); }}
                    className={["group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors", active ? "bg-accent-soft" : "hover:bg-surface-hover"].join(" ")}>
                    <div className={["flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold", active ? "bg-accent text-accent-foreground" : "bg-surface text-text-faint"].join(" ")}>
                      {active ? <span>&#x25BC;</span> : <span>&#x25B6;</span>}
                    </div>
                    <InlineEdit value={w.name} onCommit={(v) => renameWs(w.id, v)} />
                    <button onClick={(e) => { e.stopPropagation(); deleteWs(w.id); }} className="ml-auto hidden rounded p-0.5 text-text-faint hover:text-error group-hover:inline-flex"><X size={12} weight="bold" /></button>
                  </div>
                  {active && (
                    <div className="ml-4 mt-0.5 space-y-0.5">
                      {wsGroups.map((g) => (
                        <div key={g.id} onClick={() => setSelGrpId(g.id)}
                          className={["group flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer transition-colors text-[12px]", g.id === selGrpId ? "bg-accent/10 text-accent" : "text-text-dim hover:bg-surface-hover hover:text-text"].join(" ")}>
                          <div className={["h-1.5 w-1.5 rounded-full", g.id === selGrpId ? "bg-accent" : "bg-text-faint"].join(" ")} />
                          <InlineEdit value={g.name} onCommit={(v) => renameGroup(g.id, v)} />
                          <button onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }} className="ml-auto hidden rounded p-0.5 text-text-faint hover:text-error group-hover:inline-flex"><X size={10} weight="bold" /></button>
                        </div>
                      ))}
                      <button onClick={createGroup}
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-text-faint transition-colors hover:bg-surface-hover hover:text-text">
                        <Plus size={12} weight="bold" /> New group
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* COL 2: Group detail (Accounts + Tabs) */}
        <div className="flex-1 flex flex-col min-w-0 bg-bg">
          {!selGrpId ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-text-dim">
              <Globe size={36} weight="duotone" className="opacity-30" />
              <p className="mt-3 text-[13px]">Select a workspace, then a group to manage accounts and tabs</p>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 gap-3 p-4">
              {/* Accounts panel */}
              <div className="flex w-64 flex-col rounded-xl border border-border bg-surface p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">Accounts</h4>
                  <span className="text-[10px] text-text-faint">{groupAccounts.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {groupAccounts.map((ga) => (
                    <div key={ga.id} className="flex items-center gap-2 rounded-md bg-bg-elevated px-2 py-1.5">
                      <div className={["h-2 w-2 flex-shrink-0 rounded-full", ackMap[ga.accountId] ? "bg-success" : "bg-warning"].join(" ")} title={ackMap[ga.accountId] ? "Acknowledged" : "Needs acknowledgment"} />
                      <span className="flex-1 truncate text-[12px] text-text">{ga.displayName || ga.handle}</span>
                      {ga.platform && <PlatformBadge platform={ga.platform} />}
                      {!ackMap[ga.accountId] && (
                        <button onClick={() => handleAckOpen(ga.accountId)} className="text-warning hover:text-warning-hover"><WarningCircle size={12} weight="fill" /></button>
                      )}
                      <IconBtn onClick={() => removeAccount(ga.accountId)} title="Remove" danger><X size={10} weight="bold" /></IconBtn>
                    </div>
                  ))}
                </div>
                {availableAccounts.length > 0 && (
                  <select value="" onChange={(e) => { if (e.target.value) addAccount(e.target.value); e.target.value = ""; }}
                    className="mt-2 w-full rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent">
                    <option value="">+ Link account...</option>
                    {availableAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.displayName || a.handle}{a.platform ? "  (" + a.platform + ")" : ""}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Tabs panel */}
              <div className="flex flex-1 flex-col rounded-xl border border-border bg-surface p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">Browser Tabs</h4>
                  <span className="text-[10px] text-text-faint">{groupTabs.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {groupTabs.length === 0 && (
                    <p className="py-8 text-center text-[12px] text-text-faint">No tabs yet. Add one below to launch a browser view.</p>
                  )}
                  {groupTabs.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 rounded-md bg-bg-elevated px-2 py-1.5">
                      <div className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
                        style={{ background: getPlatformColor(t.platform) + "20", color: getPlatformColor(t.platform) }}>
                        {PLATFORMS[t.platform]?.icon ?? "?"}
                      </div>
                      <span className="flex-1 truncate text-[12px] text-text">
                        {PLATFORMS[t.platform]?.label ?? t.platform}
                      </span>
                      <span className="text-[11px] text-text-faint">
                        {(groupAccounts.find((ga) => ga.accountId === t.accountId)?.handle ?? t.accountId).slice(0, 15)}
                      </span>
                      <IconBtn onClick={() => removeTab(t.id)} title="Close tab" danger><X size={10} weight="bold" /></IconBtn>
                    </div>
                  ))}
                </div>

                {/* Add tab row */}
                <div className="mt-3 rounded-lg border border-dashed border-border p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-faint">New Tab</p>
                  <div className="flex gap-2">
                    <select value={newTabPlatform} onChange={(e) => setNewTabPlatform(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent">
                      <option value="">1. Pick platform</option>
                      {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                    </select>
                    <select value={newTabAccountId} onChange={(e) => setNewTabAccountId(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent"
                      disabled={!newTabPlatform || tabAccountsFiltered.length === 0}>
                      <option value="">
                        {!newTabPlatform ? "Pick platform first" : tabAccountsFiltered.length === 0 ? "No matching accounts" : "2. Pick account"}
                      </option>
                      {tabAccountsFiltered.map((ga) => <option key={ga.accountId} value={ga.accountId}>{ga.handle || ga.displayName}</option>)}
                    </select>
                    <button type="button" onClick={addTab} disabled={!newTabPlatform || !newTabAccountId}
                      className="rounded-md bg-accent px-4 py-1.5 text-[12px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40">
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