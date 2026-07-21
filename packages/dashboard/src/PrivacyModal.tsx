import React from 'react';

interface PrivacyModalProps {
  onAcknowledge: () => void;
}

const PRIVACY_TEXT =
  'Captured data stays local. Selected text is sent to your configured AI provider when you use AI features. Cookies, credentials, and raw DOM are never sent.';

export function PrivacyModal({ onAcknowledge }: PrivacyModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-testid="privacy-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-7 shadow-lg"
        data-testid="privacy-modal"
      >
        <h2
          id="privacy-modal-title"
          className="text-base font-semibold tracking-tight text-text"
        >
          Privacy Notice
        </h2>

        <div className="mt-4 space-y-3">
          <p className="text-[13px] leading-relaxed text-text">{PRIVACY_TEXT}</p>
          <p className="text-[12px] leading-relaxed text-text-dim">
            This application processes your social media data entirely on your local machine.
            No data is shared with third parties except when you explicitly use AI features,
            in which case only the text you select is sent to your configured AI provider.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onAcknowledge}
            data-testid="privacy-acknowledge-btn"
            className="rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-accent-foreground transition-colors duration-150 hover:bg-accent-hover active:translate-y-px"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}

export { PRIVACY_TEXT };
