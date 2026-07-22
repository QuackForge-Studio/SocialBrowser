import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, X, Globe, CaretLeft, MagnifyingGlass, SquaresFour, List, RocketLaunch, ShareNetwork, ShoppingBag, MagicWand, FolderPlus, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import type { Workspace, TabGroup, GroupAccountInfo, GroupTab, Account, DashboardBridge } from "../types";
import { WORKSPACE_TEMPLATES, WorkspaceTemplate } from "../WorkspaceTemplates";

function getBridge(): DashboardBridge | undefined { return window.__socialBrowserDashboard; }

const PLATFORMS: Record<string, { label: string; color: string; icon: string; badgeClass: string }> = {
  twitter: { label: "Twitter", color: "#1DA1F2", icon: "\u{1D54F}", badgeClass: "platform-pill-twitter" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", icon: "in", badgeClass: "platform-pill-linkedin" },
  facebook: { label: "Facebook", color: "#0866FF", icon: "f", badgeClass: "platform-pill-facebook" },
  instagram: { label: "Instagram", color: "#E4405F", icon: "\u25C9", badgeClass: "platform-pill-instagram" },
  reddit: { label: "Reddit", color: "#FF4500", icon: "\u2B25", badgeClass: "platform-pill-reddit" },
  tiktok: { label: "TikTok", color: "#00F2EA", icon: "\u266A", badgeClass: "platform-pill-tiktok" },
};

function InlineEdit({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) return <span onDoubleClick={() => setEditing(true)} title="Double-click to rename" className="cursor-pointer hover:underline underline-offset-4 decoration-accent/50">{value}</span>;
  return (
    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); const t = draft.trim(); if (t && t !== value) onCommit(t); else setDraft(value); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
      className="w-full rounded-md border border-accent bg-bg-elevated px-2 py-0.5 text-[15px] text-text outline-none shadow-sm" />
  );
}

export function WorkspaceManager() {
  const bridge = getBridge();

  // Top-level state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & View Controls
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Drill-down: selected workspace → its groups → selected group detail
  const [selWsId, setSelWsId] = useState<string | null>(null);
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [selGrpId, setSelGrpId] = useState<string | null>(null);
  const [groupAccounts, setGroupAccounts] = useState<GroupAccountInfo[]>([]);
  const [groupTabs, setGroupTabs] = useState<GroupTab[]>([]);

  // New tab form
  const [newTabPlatform, setNewTabPlatform] = useState("");
  const [newTabAccountId, setNewTabAccountId] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  // ── Load workspaces ──
  const loadData = useCallback(async () => {
    if (!bridge) return;
    try {
      const [ws, accts] = await Promise.all([bridge.getWorkspaces(), bridge.getAccounts()]);
      setWorkspaces(ws);
      setAllAccounts(accts);
    } catch (e: any) { setError(e?.message ?? "Failed to load data"); }
    finally { setLoading(false); }
  }, [bridge]);
  useEffect(() => { loadData(); }, [loadData]);

  // ── Load groups when workspace selected ──
  useEffect(() => {
    if (!bridge || !selWsId) { setGroups([]); setSelGrpId(null); return; }
    bridge.getTabGroups({ workspaceId: selWsId }).then(setGroups).catch(() => {});
  }, [bridge, selWsId]);

  // ── Load group detail ──
  useEffect(() => {
    if (!bridge || !selGrpId) { setGroupAccounts([]); setGroupTabs([]); return; }
    Promise.all([bridge.getGroupAccounts({ groupId: selGrpId }), bridge.getGroupTabs({ groupId: selGrpId })])
      .then(([ga, gt]) => { setGroupAccounts(ga); setGroupTabs(gt); }).catch(() => {});
  }, [bridge, selGrpId]);

  const availableAccounts = useMemo(() => allAccounts.filter(a => !groupAccounts.some(ga => ga.accountId === a.id)), [allAccounts, groupAccounts]);
  const tabAccountsFiltered = useMemo(() => newTabPlatform ? groupAccounts.filter(ga => ga.platform === newTabPlatform) : groupAccounts, [groupAccounts, newTabPlatform]);
  useEffect(() => { setNewTabAccountId(""); }, [newTabPlatform]);

  // ── Filtered Workspaces ──
  const filteredWorkspaces = useMemo(() => {
    if (!searchQuery.trim()) return workspaces;
    const q = searchQuery.toLowerCase();
    return workspaces.filter(w => w.name.toLowerCase().includes(q));
  }, [workspaces, searchQuery]);

  // ── CRUD Operations ──
  const createWs = async (customName?: string): Promise<Workspace | undefined> => { 
    if (!bridge) return undefined; 
    try { 
      const name = customName || `Workspace ${workspaces.length + 1}`;
      const ws = await bridge.createWorkspace({ name }); 
      setWorkspaces(p => [...p, ws]); 
      return ws;
    } catch (e: any) { 
      setError(e?.message); 
      return undefined;
    } 
  };

  const createFromTemplate = async (template: WorkspaceTemplate) => {
    if (!bridge) return;
    setCreatingTemplate(true);
    try {
      const ws = await bridge.createWorkspace({ name: template.name });
      setWorkspaces(p => [...p, ws]);
      
      for (const grp of template.groups) {
        await bridge.createTabGroup({ workspaceId: ws.id, name: grp.name });
      }
      setSelWsId(ws.id);
    } catch (e: any) {
      setError(e?.message ?? "Failed to apply template");
    } finally {
      setCreatingTemplate(false);
    }
  };

  const renameWs = async (id: string, name: string) => { if (!bridge) return; await bridge.renameWorkspace({ id, name }); setWorkspaces(p => p.map(w => w.id === id ? { ...w, name } : w)); };
  const deleteWs = async (id: string) => { if (!bridge || !confirm("Delete this workspace?")) return; await bridge.deleteWorkspace({ id }); setWorkspaces(p => p.filter(w => w.id !== id)); if (selWsId === id) { setSelWsId(null); setSelGrpId(null); } };
  const createGroup = async () => { if (!bridge || !selWsId) return; const g = await bridge.createTabGroup({ workspaceId: selWsId, name: "New Group" }); setGroups(p => [...p, g]); };
  const renameGroup = async (id: string, name: string) => { if (!bridge) return; await bridge.renameTabGroup({ id, name }); setGroups(p => p.map(g => g.id === id ? { ...g, name } : g)); };
  const deleteGroup = async (id: string) => { if (!bridge || !confirm("Delete this group?")) return; await bridge.deleteTabGroup({ id }); setGroups(p => p.filter(g => g.id !== id)); if (selGrpId === id) setSelGrpId(null); };
  const addAccount = async (id: string) => { if (!bridge || !selGrpId) return; await bridge.addAccountToGroup({ groupId: selGrpId, accountId: id }); setGroupAccounts(await bridge.getGroupAccounts({ groupId: selGrpId })); };
  const removeAccount = async (id: string) => { if (!bridge || !selGrpId) return; await bridge.removeAccountFromGroup({ groupId: selGrpId, accountId: id }); setGroupAccounts(p => p.filter(a => a.accountId !== id)); };
  const addTab = async () => { if (!bridge || !selGrpId || !newTabPlatform || !newTabAccountId) return; const t = await bridge.addGroupTab({ groupId: selGrpId, platform: newTabPlatform, accountId: newTabAccountId }); setGroupTabs(p => [...p, t]); setNewTabPlatform(""); setNewTabAccountId(""); };
  const removeTab = async (id: string) => { if (!bridge) return; await bridge.removeGroupTab({ id }); setGroupTabs(p => p.filter(t => t.id !== id)); };

  // ── Loading ──
  if (loading) return (
    <div className="flex h-full flex-col items-center justify-center text-text-muted gap-3 ambient-bg">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <span className="text-[14px] font-medium tracking-wide">Loading workspace manager...</span>
    </div>
  );

  // ── EMPTY STATE: No workspaces ──
  if (workspaces.length === 0) return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center select-none ambient-bg overflow-y-auto"
      style={{ WebkitAppRegion: 'no-drag' as any }}>
      
      {/* Hero Badge */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-accent-soft text-accent shadow-2xl shadow-accent/20 border border-accent/20 animate-float">
        <RocketLaunch size={40} weight="duotone" />
      </div>

      <h1 className="text-[26px] font-bold text-text tracking-tight">Organize Your Social Footprint</h1>
      <p className="mt-2.5 max-w-md text-[15px] text-text-muted leading-relaxed">
        Group your brand accounts, manage multi-channel tabs, and switch between social platforms effortlessly.
      </p>

      {/* Action CTA */}
      <button onClick={() => createWs()}
        className="btn-accent-gradient mt-6 rounded-xl px-8 py-3.5 text-[15px] font-semibold flex items-center gap-2.5 shadow-lg">
        <Plus size={18} weight="bold" /> Create Blank Workspace
      </button>

      {/* Quick Starter Templates */}
      <div className="mt-12 w-full max-w-3xl">
        <div className="flex items-center gap-2 mb-4 justify-center">
          <MagicWand size={16} weight="duotone" className="text-accent" />
          <span className="text-[13px] font-semibold uppercase tracking-wider text-text-faint">Or start with a preset template</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          {WORKSPACE_TEMPLATES.map((tmpl) => (
            <div key={tmpl.id} onClick={() => createFromTemplate(tmpl)}
              className="template-card rounded-2xl p-5 cursor-pointer flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[12px] font-bold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: tmpl.badgeColor }}>
                    Preset
                  </span>
                  <ArrowRight size={16} className="text-text-faint group-hover:text-accent group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="text-[16px] font-bold text-text mb-1">{tmpl.name}</h3>
                <p className="text-[13px] text-text-muted leading-snug">{tmpl.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-[12px] text-text-faint">
                <span>{tmpl.groups.length} Pre-built Groups</span>
                <span className="text-accent font-semibold flex items-center gap-1">Use <Plus size={12} /></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="mt-6 text-[14px] text-error bg-error-soft px-4 py-2 rounded-lg">{error}</p>}
    </div>
  );

  // ── WORKSPACE LIST (Main Dashboard View) ──
  if (!selWsId) return (
    <div className="flex h-full flex-col ambient-bg" style={{ WebkitAppRegion: 'no-drag' as any }}>
      
      {/* Top Banner / Stats Overview Bar */}
      <div className="border-b border-border/60 bg-surface/40 backdrop-blur-md px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-[24px] font-bold text-text tracking-tight">Workspaces Overview</h2>
              <span className="rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-[12px] font-semibold text-accent">
                {workspaces.length} active
              </span>
            </div>
            <p className="mt-1 text-[14px] text-text-muted">Manage your social brands, groups, and multi-channel accounts.</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
              <input
                type="text"
                placeholder="Filter workspaces..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-48 lg:w-64 rounded-xl border border-border bg-bg-elevated/80 pl-9 pr-3 py-2 text-[14px] text-text outline-none focus:border-accent focus:w-64 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-border bg-bg-elevated p-1">
              <button onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-accent text-white" : "text-text-faint hover:text-text"}`}>
                <SquaresFour size={16} />
              </button>
              <button onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "list" ? "bg-accent text-white" : "text-text-faint hover:text-text"}`}>
                <List size={16} />
              </button>
            </div>

            {/* Primary Action Button */}
            <button onClick={() => createWs()} className="btn-accent-gradient rounded-xl px-5 py-2.5 text-[14px] font-semibold flex items-center gap-2 shadow-md">
              <Plus size={16} weight="bold" /> New workspace
            </button>
          </div>
        </div>

        {/* Quick Stats Metric Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="glass-panel rounded-xl px-4 py-3">
            <span className="text-[12px] font-medium text-text-faint uppercase tracking-wider">Total Workspaces</span>
            <div className="text-[20px] font-bold text-text mt-0.5">{workspaces.length}</div>
          </div>
          <div className="glass-panel rounded-xl px-4 py-3">
            <span className="text-[12px] font-medium text-text-faint uppercase tracking-wider">Connected Accounts</span>
            <div className="text-[20px] font-bold text-accent mt-0.5">{allAccounts.length}</div>
          </div>
          <div className="glass-panel rounded-xl px-4 py-3">
            <span className="text-[12px] font-medium text-text-faint uppercase tracking-wider">Supported Platforms</span>
            <div className="text-[20px] font-bold text-success mt-0.5">6 Channels</div>
          </div>
          <div className="glass-panel rounded-xl px-4 py-3">
            <span className="text-[12px] font-medium text-text-faint uppercase tracking-wider">Status</span>
            <div className="text-[14px] font-semibold text-success flex items-center gap-1.5 mt-1.5">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Ready & Active
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-8 mt-4 flex items-center gap-2 rounded-xl bg-error-soft border border-error/20 px-4 py-3 text-[14px] text-error">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-text-faint hover:text-text"><X size={16} /></button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        
        {/* Preset Starter Bar (if fewer than 3 workspaces exist) */}
        {workspaces.length < 3 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <MagicWand size={16} weight="duotone" className="text-accent" />
              <h3 className="text-[14px] font-semibold text-text uppercase tracking-wider">Quick Preset Generators</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {WORKSPACE_TEMPLATES.map((tmpl) => (
                <div key={tmpl.id} onClick={() => createFromTemplate(tmpl)}
                  className="template-card rounded-xl p-4 cursor-pointer flex items-center justify-between border border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-[14px] font-bold" style={{ backgroundColor: tmpl.badgeColor }}>
                      {tmpl.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-[14px] font-semibold text-text">{tmpl.name}</h4>
                      <p className="text-[12px] text-text-faint">{tmpl.groups.length} groups preconfigured</p>
                    </div>
                  </div>
                  <button className="text-[12px] text-accent font-semibold hover:underline">Add +</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-text uppercase tracking-wider">Your Workspaces ({filteredWorkspaces.length})</h3>
        </div>

        {filteredWorkspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center glass-panel rounded-2xl">
            <Globe size={44} weight="duotone" className="text-text-faint opacity-40 mb-3" />
            <h4 className="text-[16px] font-semibold text-text">No workspaces match "{searchQuery}"</h4>
            <p className="text-[14px] text-text-muted mt-1">Try clearing your search query or create a new workspace.</p>
            <button onClick={() => setSearchQuery("")} className="mt-4 rounded-lg bg-bg-elevated border border-border px-4 py-2 text-[13px] text-text">
              Clear Search
            </button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredWorkspaces.map((w, idx) => {
              const wsGrpList = groups.filter(g => g.workspaceId === w.id);
              const avatarClass = `gradient-avatar-${idx % 5}`;
              
              return (
                <div key={w.id}
                  onClick={() => setSelWsId(w.id)}
                  className="glass-card group rounded-2xl p-6 cursor-pointer flex flex-col justify-between min-h-[190px]"
                >
                  <div>
                    {/* Header Row */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-[16px] font-extrabold shadow-md ${avatarClass}`}>
                          {w.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[17px] font-bold text-text truncate group-hover:text-accent transition-colors">
                            {w.name}
                          </h3>
                          <span className="text-[12px] font-medium text-text-faint">
                            {wsGrpList.length} {wsGrpList.length === 1 ? 'group' : 'groups'}
                          </span>
                        </div>
                      </div>

                      <button onClick={e => { e.stopPropagation(); deleteWs(w.id); }}
                        title="Delete Workspace"
                        className="opacity-0 group-hover:opacity-100 h-8 w-8 flex items-center justify-center rounded-lg text-text-faint hover:bg-error-soft hover:text-error transition-all">
                        <X size={15} weight="bold" />
                      </button>
                    </div>

                    {/* Social Platform Badges Preview */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {Object.entries(PLATFORMS).slice(0, 4).map(([key, info]) => (
                        <span key={key} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${info.badgeClass}`}>
                          {info.label}
                        </span>
                      ))}
                    </div>

                    {/* Group names preview */}
                    <div className="space-y-1.5">
                      {wsGrpList.slice(0, 2).map(g => (
                        <div key={g.id} className="flex items-center gap-2 text-[13px] text-text-muted bg-bg-base/40 px-2.5 py-1 rounded-lg">
                          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-accent" />
                          <span className="truncate">{g.name}</span>
                        </div>
                      ))}
                      {wsGrpList.length === 0 && (
                        <p className="text-[13px] text-text-faint italic py-1">No groups configured yet</p>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom CTA */}
                  <div className="mt-5 pt-4 border-t border-border/40 flex items-center justify-between text-[13px]">
                    <span className="text-text-faint">Click to manage &rarr;</span>
                    <span className="font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      Open Workspace
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-3">
            {filteredWorkspaces.map((w, idx) => {
              const wsGrpList = groups.filter(g => g.workspaceId === w.id);
              const avatarClass = `gradient-avatar-${idx % 5}`;

              return (
                <div key={w.id} onClick={() => setSelWsId(w.id)}
                  className="glass-card group rounded-xl p-4 cursor-pointer flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-[15px] font-bold ${avatarClass}`}>
                      {w.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-[16px] font-bold text-text group-hover:text-accent transition-colors">{w.name}</h3>
                      <p className="text-[13px] text-text-faint">{wsGrpList.length} groups &middot; Active status</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-1.5">
                      {Object.entries(PLATFORMS).slice(0, 3).map(([key, info]) => (
                        <span key={key} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${info.badgeClass}`}>
                          {info.label}
                        </span>
                      ))}
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteWs(w.id); }}
                      className="opacity-0 group-hover:opacity-100 h-8 w-8 flex items-center justify-center rounded-lg text-text-faint hover:bg-error-soft hover:text-error">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ── WORKSPACE DETAIL (drilled into a specific workspace) ──
  const ws = workspaces.find(w => w.id === selWsId)!;
  const wsGroups = groups.filter(g => g.workspaceId === selWsId);

  return (
    <div className="flex h-full flex-col ambient-bg" style={{ WebkitAppRegion: 'no-drag' as any }}>
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border/60 bg-surface/40 backdrop-blur-md px-8 py-4">
        <button onClick={() => { setSelWsId(null); setSelGrpId(null); }}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-bg-elevated text-text-muted hover:bg-bg-hover hover:text-text transition-colors">
          <CaretLeft size={20} weight="bold" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[20px] font-bold text-text">
            <InlineEdit value={ws.name} onCommit={v => renameWs(ws.id, v)} />
          </div>
          <p className="text-[13px] text-text-muted mt-0.5">
            {wsGroups.length} groups &middot; {allAccounts.length} total accounts connected
          </p>
        </div>
        <button onClick={createGroup} className="btn-accent-gradient rounded-xl px-5 py-2.5 text-[14px] font-semibold flex items-center gap-2">
          <Plus size={16} weight="bold" /> New group
        </button>
      </div>

      {error && (
        <div className="mx-8 mt-4 flex items-center gap-2 rounded-xl bg-error-soft border border-error/20 px-4 py-3 text-[14px] text-error">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-text-faint hover:text-text"><X size={14} /></button>
        </div>
      )}

      {/* Content: groups or group detail */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        {!selGrpId ? (
          /* ── Group list ── */
          <div>
            {wsGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center glass-panel rounded-2xl">
                <Globe size={48} weight="duotone" className="text-accent opacity-60 mb-4 animate-float" />
                <h3 className="text-[18px] font-bold text-text">No Groups in {ws.name}</h3>
                <p className="mt-1 text-[14px] text-text-muted max-w-sm">Create a group to categorize social channels and launch synchronized browser tabs.</p>
                <button onClick={createGroup} className="btn-accent-gradient mt-6 rounded-xl px-6 py-3 text-[14px] font-semibold flex items-center gap-2">
                  <Plus size={16} weight="bold" /> Create your first group
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {wsGroups.map(g => (
                  <div key={g.id} onClick={() => setSelGrpId(g.id)}
                    className="glass-card group rounded-2xl p-6 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent text-[15px] font-bold">
                            {g.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-[16px] font-bold text-text truncate"><InlineEdit value={g.name} onCommit={v => renameGroup(g.id, v)} /></h3>
                            <p className="text-[12px] text-text-faint mt-0.5">Click to configure accounts</p>
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteGroup(g.id); }}
                          className="opacity-0 group-hover:opacity-100 h-8 w-8 flex items-center justify-center rounded-lg text-text-faint hover:bg-error-soft hover:text-error transition-all">
                          <X size={14} weight="bold" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[13px] text-text-muted">
                      <span>Group Settings</span>
                      <span className="text-accent font-semibold flex items-center gap-1">Manage &rarr;</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Group detail ── */
          <div>
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setSelGrpId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-elevated text-text-muted hover:bg-bg-hover hover:text-text transition-colors">
                <CaretLeft size={18} weight="bold" />
              </button>
              <h2 className="text-[20px] font-bold text-text">
                {groups.find(g => g.id === selGrpId)?.name ?? "Group Settings"}
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Accounts */}
              <div className="glass-panel rounded-2xl p-5 border border-border">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[13px] font-bold uppercase tracking-wider text-text-faint">
                    Linked Accounts ({groupAccounts.length})
                  </h4>
                </div>
                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {groupAccounts.map(ga => {
                    const pInfo = ga.platform ? PLATFORMS[ga.platform] : undefined;
                    return (
                      <div key={ga.id} className="flex items-center gap-3 rounded-xl bg-bg-elevated/80 border border-border px-3.5 py-2.5 text-[14px]">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pInfo?.badgeClass || 'bg-accent/10 text-accent'}`}>
                          {pInfo?.label || ga.platform}
                        </span>
                        <span className="flex-1 truncate text-text font-medium">{ga.displayName || ga.handle}</span>
                        <button onClick={() => removeAccount(ga.accountId)} className="text-text-faint hover:text-error transition-colors p-1"><X size={14} /></button>
                      </div>
                    );
                  })}
                </div>
                {availableAccounts.length > 0 && (
                  <select value="" onChange={e => { if (e.target.value) addAccount(e.target.value); e.target.value = ""; }}
                    className="mt-4 w-full rounded-xl bg-bg-elevated border border-border px-3 py-2 text-[14px] text-text outline-none focus:border-accent">
                    <option value="">+ Attach Social Account to Group</option>
                    {availableAccounts.map(a => <option key={a.id} value={a.id}>{a.displayName || a.handle} ({a.platform})</option>)}
                  </select>
                )}
              </div>

              {/* Browser Tabs */}
              <div className="glass-panel rounded-2xl p-5 border border-border">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[13px] font-bold uppercase tracking-wider text-text-faint">
                    Synchronized Browser Tabs ({groupTabs.length})
                  </h4>
                </div>
                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {groupTabs.length === 0 && (
                    <div className="py-8 text-center text-[14px] text-text-muted">
                      No browser tabs attached to this group yet
                    </div>
                  )}
                  {groupTabs.map(t => {
                    const p = PLATFORMS[t.platform];
                    return (
                      <div key={t.id} className="flex items-center gap-3 rounded-xl bg-bg-elevated/80 border border-border px-3.5 py-2.5 text-[14px]">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p?.color ?? '#555' }} />
                        <span className="flex-1 font-semibold text-text">{p?.label ?? t.platform}</span>
                        <span className="text-[13px] text-text-muted">{groupAccounts.find(ga => ga.accountId === t.accountId)?.handle?.slice(0, 15) ?? t.accountId.slice(0, 15)}</span>
                        <button onClick={() => removeTab(t.id)} className="text-text-faint hover:text-error transition-colors p-1"><X size={14} /></button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 border-t border-border/50 pt-4">
                  <div className="flex gap-2">
                    <select value={newTabPlatform} onChange={e => setNewTabPlatform(e.target.value)}
                      className="flex-1 rounded-xl bg-bg-elevated border border-border px-3 py-2 text-[14px] text-text outline-none focus:border-accent">
                      <option value="">Platform</option>
                      {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                    </select>
                    <select value={newTabAccountId} onChange={e => setNewTabAccountId(e.target.value)}
                      disabled={!newTabPlatform || tabAccountsFiltered.length === 0}
                      className="flex-1 rounded-xl bg-bg-elevated border border-border px-3 py-2 text-[14px] text-text outline-none focus:border-accent disabled:opacity-40">
                      <option value="">{!newTabPlatform ? 'Pick platform' : 'Select Account'}</option>
                      {tabAccountsFiltered.map(ga => <option key={ga.accountId} value={ga.accountId}>{ga.handle || ga.displayName}</option>)}
                    </select>
                    <button onClick={addTab} disabled={!newTabPlatform || !newTabAccountId}
                      className="btn-accent-gradient rounded-xl px-5 py-2 text-[14px] font-semibold disabled:opacity-40">Launch Tab</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkspaceManager;