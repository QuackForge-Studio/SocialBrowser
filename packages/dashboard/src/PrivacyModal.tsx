import React from 'react';

interface PrivacyModalProps {
  onAcknowledge: () => void;
}

const PRIVACY_TEXT =
  'Captured data stays local. Selected text is sent to your configured AI provider when you use AI features. Cookies, credentials, and raw DOM are never sent.';

export function PrivacyModal({ onAcknowledge }: PrivacyModalProps) {
  return (
    <div className="privacy-modal-overlay" data-testid="privacy-modal-overlay">
      <div className="privacy-modal" data-testid="privacy-modal">
        <div className="privacy-modal-header">
          <h2>Privacy Notice</h2>
        </div>
        <div className="privacy-modal-body">
          <p className="privacy-modal-text">{PRIVACY_TEXT}</p>
          <p className="privacy-modal-sub">
            This application processes your social media data entirely on your local machine.
            No data is shared with third parties except when you explicitly use AI features,
            in which case only the text you select is sent to your configured AI provider.
          </p>
        </div>
        <div className="privacy-modal-footer">
          <button
            className="btn btn-primary"
            onClick={onAcknowledge}
            data-testid="privacy-acknowledge-btn"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}

export { PRIVACY_TEXT };
