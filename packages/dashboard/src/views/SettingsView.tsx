import React, { useState, useEffect } from 'react';
import type { Account, DashboardBridge } from '../types';

const PROVIDER_OPTIONS = [
  { value: 'custom', label: 'Custom' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'kimi', label: 'Kimi' },
];

const PRIVACY_TEXT =
  'Captured data stays local. Selected text is sent to your configured AI provider when you use AI features. Cookies, credentials, and raw DOM are never sent.';

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

export function SettingsView() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [keyStatus, setKeyStatus] = useState<{ provider: string; configured: boolean } | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'glassmorphism' | 'light'>('dark');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) {
      setLoading(false);
      return;
    }

    Promise.all([
      bridge.getAccounts(),
      bridge.getKeyStatus(),
      bridge.getSettings(),
    ])
      .then(([accs, status, settings]) => {
        setAccounts(accs as Account[]);
        setKeyStatus(status);
        const s = settings as Record<string, string>;
        const savedProvider = s?.aiProvider || status?.provider || 'openai';
        setSelectedProvider(savedProvider);
        const rawTheme = s?.browser_theme;
        const activeTheme: 'dark' | 'glassmorphism' | 'light' =
          rawTheme === 'zen' || rawTheme === 'glassmorphism'
            ? 'glassmorphism'
            : rawTheme === 'light'
            ? 'light'
            : 'dark';
        setCurrentTheme(activeTheme);
      })
      .catch((err) => {
        console.error('[Settings] Failed to load:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    const bridge = getBridge();
    if (bridge) {
      bridge.updateSettings({ aiProvider: provider }).catch((err) => {
        console.error('[Settings] Failed to update provider:', err);
      });
    }
  };

  const handleThemeChange = (newTheme: 'dark' | 'glassmorphism' | 'light') => {
    setCurrentTheme(newTheme);
    const bridge = getBridge();
    if (bridge && (bridge as any).setBrowserTheme) {
      (bridge as any).setBrowserTheme(newTheme);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
        <div className="mt-10 flex flex-col items-center gap-3 text-text-dim">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-[14px]">Loading settings...</p>
        </div>
      </div>
    );
  }

  const adapterVersions = accounts
    .filter((a) => a.adapterVersion != null)
    .map((a) => ({ platform: a.platform, version: a.adapterVersion! }));
  const uniqueAdapterVersions = adapterVersions.filter(
    (v, i, arr) => arr.findIndex((x) => x.platform === v.platform && x.version === v.version) === i
  );

  return (
    <div className="max-w-3xl p-6" data-testid="settings-view">
      <h2 className="text-lg font-semibold tracking-tight">Settings</h2>

      {/* Accounts Section */}
      <section className="mt-8">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-faint">
          Accounts
        </h3>
        {accounts.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border bg-surface p-4 text-center text-[14px] text-text-dim">
            No accounts configured yet. Add an account from the platform tabs.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[14px]" data-testid="accounts-table">
              <thead>
                <tr className="bg-surface text-left text-text-dim">
                  <th className="px-4 py-2.5 font-medium">Platform</th>
                  <th className="px-4 py-2.5 font-medium">Handle</th>
                  <th className="px-4 py-2.5 font-medium">Adapter Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map((account) => (
                  <tr
                    key={account.id}
                    className="bg-bg-elevated transition-colors hover:bg-surface-hover"
                    data-testid={'account-row-' + account.id}
                  >
                    <td className="px-4 py-2.5 font-medium text-text">{account.platform}</td>
                    <td className="px-4 py-2.5 text-text-dim">{account.handle}</td>
                      <td className="px-4 py-2.5 font-mono text-[13px] text-text-dim">
                      {account.adapterVersion != null ? 'v' + account.adapterVersion : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* AI Provider Section */}
      <section className="mt-8">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-faint">
          AI Provider
        </h3>
        <div className="mt-3 flex items-center gap-3">
          <label htmlFor="provider-select" className="text-[14px] text-text-dim">
            Provider:
          </label>
          <select
            id="provider-select"
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
            data-testid="provider-select"
            className="min-w-[140px]"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span
            data-testid="key-status"
            className={[
              'rounded-full px-2.5 py-0.5 text-[12px] font-medium',
              keyStatus?.configured
                ? 'bg-success-soft text-success'
                : 'bg-warning-soft text-warning',
            ].join(' ')}
          >
            {keyStatus?.configured ? 'Configured' : 'Not configured'}
          </span>
        </div>
      </section>

      {/* Appearance & Theme Section */}
      <section className="mt-8">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-faint">
          Appearance & Theme
        </h3>
        <p className="text-[13px] text-text-dim mt-1">
          Select your preferred window theme style.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {/* Flat Dark Card */}
          <button
            type="button"
            onClick={() => handleThemeChange('dark')}
            className={`flex flex-col gap-2.5 p-3.5 rounded-xl border text-left transition-all ${
              currentTheme === 'dark'
                ? 'border-amber-500 bg-amber-500/15 ring-1 ring-amber-500/40 shadow-md'
                : 'border-border bg-surface hover:border-white/20'
            }`}
          >
            <div className="h-16 rounded-lg bg-[#0e1017] border border-[#232838] flex flex-col p-2 justify-between">
              <div className="h-2 w-12 rounded bg-[#272e42]" />
              <div className="h-7 w-full rounded bg-[#161925] border border-[#2b3247]" />
            </div>
            <div>
              <span className="text-[13.5px] font-semibold block text-text">Flat Dark</span>
              <span className="text-[11.5px] text-text-dim block leading-tight mt-0.5">
                Clean, flat solid dark UI
              </span>
            </div>
          </button>

          {/* Glassmorphism Card */}
          <button
            type="button"
            onClick={() => handleThemeChange('glassmorphism')}
            className={`flex flex-col gap-2.5 p-3.5 rounded-xl border text-left transition-all ${
              currentTheme === 'glassmorphism'
                ? 'border-amber-500 bg-amber-500/15 ring-1 ring-amber-500/40 shadow-md'
                : 'border-border bg-surface hover:border-white/20'
            }`}
          >
            <div className="h-16 rounded-lg bg-gradient-to-br from-[#8f6ead]/50 via-[#b26f48]/40 to-[#171720] border border-white/20 flex flex-col p-2 justify-between backdrop-blur-md">
              <div className="h-2 w-12 rounded bg-white/30" />
              <div className="h-7 w-full rounded bg-white/10 border border-white/20 backdrop-blur-sm" />
            </div>
            <div>
              <span className="text-[13.5px] font-semibold block text-text">Glassmorphism</span>
              <span className="text-[11.5px] text-text-dim block leading-tight mt-0.5">
                Frosted glass over glowing mesh
              </span>
            </div>
          </button>

          {/* Light Card */}
          <button
            type="button"
            onClick={() => handleThemeChange('light')}
            className={`flex flex-col gap-2.5 p-3.5 rounded-xl border text-left transition-all ${
              currentTheme === 'light'
                ? 'border-amber-500 bg-amber-500/15 ring-1 ring-amber-500/40 shadow-md'
                : 'border-border bg-surface hover:border-white/20'
            }`}
          >
            <div className="h-16 rounded-lg bg-[#f1f5f9] border border-[#cbd5e1] flex flex-col p-2 justify-between">
              <div className="h-2 w-12 rounded bg-[#cbd5e1]" />
              <div className="h-7 w-full rounded bg-[#ffffff] border border-[#cbd5e1] shadow-xs" />
            </div>
            <div>
              <span className="text-[13.5px] font-semibold block text-text">Trắng Sáng (Light)</span>
              <span className="text-[11.5px] text-text-dim block leading-tight mt-0.5">
                Clean, crisp white light theme
              </span>
            </div>
          </button>
        </div>
      </section>

      {/* Adapter Versions Section */}
      <section className="mt-8">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-faint">
          Adapter Versions
        </h3>
        {uniqueAdapterVersions.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border bg-surface p-4 text-center text-[14px] text-text-dim">
            No adapter version data available yet.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[14px]" data-testid="adapter-versions-table">
              <thead>
                <tr className="bg-surface text-left text-text-dim">
                  <th className="px-4 py-2.5 font-medium">Platform</th>
                  <th className="px-4 py-2.5 font-medium">Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {uniqueAdapterVersions.map((av) => (
                  <tr
                    key={av.platform + '-' + av.version}
                    className="bg-bg-elevated transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-2.5 font-medium text-text">{av.platform}</td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-text-dim">v{av.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Privacy Notice Section */}
      <section className="mt-8" data-testid="privacy-section">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-faint">
          Privacy
        </h3>
        <div className="mt-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-[14px] leading-relaxed text-text-dim" data-testid="privacy-text">
            {PRIVACY_TEXT}
          </p>
        </div>
      </section>
    </div>
  );
}

export { PROVIDER_OPTIONS, PRIVACY_TEXT };
