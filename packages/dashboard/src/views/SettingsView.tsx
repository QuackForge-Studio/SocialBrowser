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
        const savedProvider = (settings as Record<string, string>)?.aiProvider || status?.provider || 'openai';
        setSelectedProvider(savedProvider);
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

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
        <div className="mt-10 flex flex-col items-center gap-3 text-text-dim">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-[13px]">Loading settings...</p>
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
          <div className="mt-3 rounded-lg border border-dashed border-border bg-surface p-6 text-center text-[13px] text-text-dim">
            No accounts configured yet. Add an account from the platform tabs.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[13px]" data-testid="accounts-table">
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
                    <td className="px-4 py-2.5 font-mono text-[12px] text-text-dim">
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
          <label htmlFor="provider-select" className="text-[13px] text-text-dim">
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
              'rounded-full px-2.5 py-0.5 text-[11px] font-medium',
              keyStatus?.configured
                ? 'bg-success-soft text-success'
                : 'bg-warning-soft text-warning',
            ].join(' ')}
          >
            {keyStatus?.configured ? 'Configured' : 'Not configured'}
          </span>
        </div>
      </section>

      {/* Adapter Versions Section */}
      <section className="mt-8">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-faint">
          Adapter Versions
        </h3>
        {uniqueAdapterVersions.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border bg-surface p-6 text-center text-[13px] text-text-dim">
            No adapter version data available yet.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[13px]" data-testid="adapter-versions-table">
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
                    <td className="px-4 py-2.5 font-mono text-[12px] text-text-dim">v{av.version}</td>
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
          <p className="text-[13px] leading-relaxed text-text-dim" data-testid="privacy-text">
            {PRIVACY_TEXT}
          </p>
        </div>
      </section>
    </div>
  );
}

export { PROVIDER_OPTIONS, PRIVACY_TEXT };
