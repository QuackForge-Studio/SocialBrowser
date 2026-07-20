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
      <div>
        <h2>Settings</h2>
        <div className="loading-state" style={{ marginTop: 40 }}>
          <div className="spinner" />
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  // Collect unique adapter versions from accounts
  const adapterVersions = accounts
    .filter((a) => a.adapterVersion != null)
    .map((a) => ({ platform: a.platform, version: a.adapterVersion! }));
  const uniqueAdapterVersions = adapterVersions.filter(
    (v, i, arr) => arr.findIndex((x) => x.platform === v.platform && x.version === v.version) === i
  );

  return (
    <div className="settings-view" data-testid="settings-view">
      <h2>Settings</h2>

      {/* Accounts Section */}
      <section className="settings-section">
        <h3>Accounts</h3>
        {accounts.length === 0 ? (
          <div className="insight-empty">
            <p>No accounts configured yet. Add an account from the platform tabs.</p>
          </div>
        ) : (
          <div className="settings-table-wrapper">
            <table className="settings-table" data-testid="accounts-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Handle</th>
                  <th>Adapter Version</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} data-testid={'account-row-' + account.id}>
                    <td className="settings-platform-cell">{account.platform}</td>
                    <td>{account.handle}</td>
                    <td>{account.adapterVersion != null ? 'v' + account.adapterVersion : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* AI Provider Section */}
      <section className="settings-section">
        <h3>AI Provider</h3>
        <div className="settings-provider-row">
          <label className="settings-label" htmlFor="provider-select">
            Provider:
          </label>
          <select
            id="provider-select"
            className="settings-select"
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
            data-testid="provider-select"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span
            className={'settings-key-status' + (keyStatus?.configured ? ' configured' : ' not-configured')}
            data-testid="key-status"
          >
            {keyStatus?.configured ? 'Configured' : 'Not configured'}
          </span>
        </div>
      </section>

      {/* Adapter Versions Section */}
      <section className="settings-section">
        <h3>Adapter Versions</h3>
        {uniqueAdapterVersions.length === 0 ? (
          <div className="insight-empty">
            <p>No adapter version data available yet.</p>
          </div>
        ) : (
          <div className="settings-table-wrapper">
            <table className="settings-table" data-testid="adapter-versions-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {uniqueAdapterVersions.map((av) => (
                  <tr key={av.platform + '-' + av.version}>
                    <td className="settings-platform-cell">{av.platform}</td>
                    <td>v{av.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Privacy Notice Section */}
      <section className="settings-section settings-privacy-section" data-testid="privacy-section">
        <h3>Privacy</h3>
        <div className="settings-privacy-notice">
          <p data-testid="privacy-text">{PRIVACY_TEXT}</p>
        </div>
      </section>
    </div>
  );
}

export { PROVIDER_OPTIONS, PRIVACY_TEXT };
