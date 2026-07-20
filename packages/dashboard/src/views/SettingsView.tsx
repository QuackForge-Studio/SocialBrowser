import React from 'react';

export function SettingsView() {
  return (
    <div>
      <h2>Settings</h2>
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h3>AI Provider</h3>
          <div className="value">OpenAI</div>
          <div className="sub">Status: Not configured</div>
        </div>
        <div className="dashboard-card">
          <h3>Platforms</h3>
          <div className="value">0</div>
          <div className="sub">Active accounts</div>
        </div>
      </div>
      <p
        style={{
          marginTop: 20,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        Captured data stays local. Selected text is sent to your configured AI
        provider when you use AI features. Cookies, credentials, and raw DOM are
        never sent.
      </p>
    </div>
  );
}
