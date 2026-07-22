import React, { useState, useEffect, useRef } from 'react';
import type { BrowserProfile, Workspace } from '../types';
import { Plus, Globe, Shield, Trash, Play, MagnifyingGlass, Folder, Check } from '@phosphor-icons/react';

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
];

export function ProfileLauncher() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileColor, setNewProfileColor] = useState(PRESET_COLORS[0]);
  const [newProxyUrl, setNewProxyUrl] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('default');
  const autoLaunchedRef = useRef(false);

  useEffect(() => {
    loadDataAndAutoLaunch();
  }, []);

  const loadDataAndAutoLaunch = async () => {
    const bridge = window.__socialBrowserDashboard;
    if (!bridge) return;
    try {
      let profData = (bridge as any).getProfiles ? await (bridge as any).getProfiles() : [];
      const wsData = await bridge.getWorkspaces();

      // If no profile exists, automatically create a Default Profile immediately
      if (!profData || profData.length === 0) {
        if ((bridge as any).createProfile) {
          await (bridge as any).createProfile({
            name: 'Default Profile',
            color: '#6366f1',
            icon: 'globe',
            groupId: wsData && wsData.length > 0 ? wsData[0].id : 'default',
          });
          if ((bridge as any).getProfiles) {
            profData = await (bridge as any).getProfiles();
          }
        }
      }

      setProfiles(profData || []);
      setWorkspaces(wsData || []);
      if (wsData && wsData.length > 0) {
        setSelectedWorkspaceId(wsData[0].id);
      }

      // Auto-launch the first profile into the internal browser view immediately on startup
      if (!autoLaunchedRef.current && profData && profData.length > 0) {
        autoLaunchedRef.current = true;
        handleLaunchProfile(profData[0]);
      }
    } catch {
      // Fallback empty list
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;

    const bridge = window.__socialBrowserDashboard;
    if (bridge && (bridge as any).createProfile) {
      await (bridge as any).createProfile({
        name: newProfileName.trim(),
        color: newProfileColor,
        icon: 'globe',
        groupId: selectedWorkspaceId,
        proxyUrl: newProxyUrl.trim() || undefined,
      });
    }

    setNewProfileName('');
    setNewProxyUrl('');
    setIsCreating(false);
    loadDataAndAutoLaunch();
  };

  const handleDeleteProfile = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete profile "${name}"?`)) return;
    const bridge = window.__socialBrowserDashboard;
    if (bridge && (bridge as any).deleteProfile) {
      await (bridge as any).deleteProfile({ id });
      loadDataAndAutoLaunch();
    }
  };

  const handleLaunchProfile = async (profile: BrowserProfile) => {
    const bridge = window.__socialBrowserDashboard;
    if (!bridge) return;
    // Launch default tab or google homepage in profile
    await bridge.navigateTo({
      platform: 'google',
      accountId: profile.id,
      url: 'https://google.com',
    });
  };

  const filteredProfiles = profiles.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Browser Profiles</h1>
          <p className="text-sm text-text-dim mt-1">
            Manage isolated multi-login browser profiles with separate cookies, storage, and proxies.
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition-all hover:bg-accent-hover active:translate-y-px"
        >
          <Plus size={18} weight="bold" />
          New Profile
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search profiles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-surface border border-border pl-10 pr-4 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Profile Grid */}
      {filteredProfiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Globe size={48} className="mx-auto text-text-muted opacity-50 mb-3" />
          <h3 className="text-base font-medium text-text">No profiles found</h3>
          <p className="text-sm text-text-dim mt-1 max-w-sm mx-auto">
            Create your first isolated browser profile to launch multi-account sessions.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-surface-hover border border-border px-4 py-2 text-sm font-medium text-text hover:bg-border/40"
          >
            <Plus size={16} /> Create Profile
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProfiles.map((profile) => (
            <div
              key={profile.id}
              onClick={() => handleLaunchProfile(profile)}
              className="group relative rounded-2xl border border-border bg-surface p-5 transition-all hover:border-accent/50 hover:shadow-lg flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
                      style={{ backgroundColor: profile.color || '#6366f1' }}
                    >
                      {profile.name.substring(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-text text-base leading-snug">{profile.name}</h3>
                      <span className="text-xs text-text-dim flex items-center gap-1 mt-0.5">
                        <Folder size={12} /> Default Group
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteProfile(profile.id, profile.name); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-surface-hover transition-all cursor-pointer"
                    title="Delete profile"
                  >
                    <Trash size={16} />
                  </button>
                </div>

                {profile.proxyUrl && (
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 w-fit">
                    <Shield size={13} /> Proxy Configured
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border/50 pt-4">
                <span className="text-xs text-text-muted">
                  Partition: <code className="text-[11px] bg-bg-elevated px-1.5 py-0.5 rounded">{profile.partition.substring(0, 22)}...</code>
                </span>

                <button
                  onClick={() => handleLaunchProfile(profile)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-transform active:scale-95 shadow-sm"
                >
                  <Play size={13} weight="fill" /> Launch
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Profile Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            <h3 className="text-lg font-bold text-text">Create Browser Profile</h3>

            <form onSubmit={handleCreateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-dim mb-1.5">Profile Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. QuackForge Main, IntentLoop Brand"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="w-full rounded-xl bg-bg-elevated border border-border px-3.5 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-dim mb-1.5">Accent Color</label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewProfileColor(c)}
                      className="w-7 h-7 rounded-full transition-transform flex items-center justify-center"
                      style={{ backgroundColor: c }}
                    >
                      {newProfileColor === c && <Check size={14} className="text-white" weight="bold" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-dim mb-1.5">
                  Proxy URL <span className="text-text-muted">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="http://user:pass@proxy.example.com:8080"
                  value={newProxyUrl}
                  onChange={(e) => setNewProxyUrl(e.target.value)}
                  className="w-full rounded-xl bg-bg-elevated border border-border px-3.5 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
                >
                  Create & Launch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
