import React, { useState, useCallback } from "react";
import type { DashboardBridge } from "../types";

// ── helpers ──

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

// ── palette ──

const C = {
  bg: "#1a1a2e",
  surface: "#16213e",
  primary: "#0f3460",
  accent: "#e94560",
  text: "#eee",
  textDim: "#888",
  success: "#2ecc71",
  error: "#e74c3c",
  warning: "#f39c12",
  border: "#2a2a4a",
};

// ── types ──

export type PublishStatus = "idle" | "confirming" | "navigating" | "prefilling" | "success" | "error";

export interface PublishAssistPanelProps {
  draftId: string;
  text: string;
  platform: string;
  accountId: string;
  onClose?: () => void;
  onPublished?: () => void;
}

const SUCCESS_MESSAGE =
  "Text inserted. Click Publish on the platform to post.";

export function PublishAssistPanel({
  draftId: _draftId,
  text,
  platform,
  accountId,
  onClose,
  onPublished,
}: PublishAssistPanelProps) {
  const bridge = getBridge();
  const [status, setStatus] = useState<PublishStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── confirm → navigate → prefill ──

  const handleConfirm = useCallback(async () => {
    if (!bridge) {
      setStatus("error");
      setErrorMsg("Dashboard bridge not available");
      return;
    }

    setStatus("navigating");
    setErrorMsg(null);

    try {
      // Step 1: Navigate to the platform compose page
      await bridge.navigateTo({ platform, accountId });
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message ?? "Navigation failed");
      return;
    }

    setStatus("prefilling");

    try {
      // Step 2: Prefill the compose field
      await bridge.prefillCompose({ platform, accountId, text });
      setStatus("success");
      onPublished?.();
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message ?? "Prefill failed");
    }
  }, [bridge, platform, accountId, text, onPublished]);

  const handleCopy = useCallback(async () => {
    try {
      if (bridge) {
        await bridge.copyToClipboard({ text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: show text for manual copy
      setCopied(false);
    }
  }, [bridge, text]);

  // ── render ──

  const containerStyle: React.CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 20,
    maxWidth: 520,
    width: "100%",
    color: C.text,
    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
  };

  const btnPrimary: React.CSSProperties = {
    background: C.accent,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 20px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };

  const btnSecondary: React.CSSProperties = {
    background: "transparent",
    color: C.textDim,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "8px 20px",
    fontSize: 13,
    cursor: "pointer",
  };

  // ── idle / initial state ──

  if (status === "idle") {
    return (
      <div style={containerStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px 0" }}>
          Publish Draft
        </h3>
        <p style={{ fontSize: 12, color: C.textDim, margin: "0 0 12px 0" }}>
          Platform: <strong style={{ color: C.text }}>{platform}</strong>
        </p>

        {/* Text preview */}
        <div
          style={{
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 12,
            lineHeight: 1.6,
            maxHeight: 160,
            overflowY: "auto",
            marginBottom: 16,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: C.text,
          }}
        >
          {text}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {onClose && (
            <button onClick={onClose} style={btnSecondary}>
              Cancel
            </button>
          )}
          <button
            onClick={() => setStatus("confirming")}
            style={btnPrimary}
          >
            Publish
          </button>
        </div>
      </div>
    );
  }

  // ── confirming ──

  if (status === "confirming") {
    return (
      <div style={containerStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px 0" }}>
          Confirm Publication
        </h3>
        <p style={{ fontSize: 13, color: C.textDim, margin: "0 0 16px 0", lineHeight: 1.5 }}>
          This will open {platform} and insert your text into the compose field.
          <br />
          <strong style={{ color: C.warning }}>
            You must manually click the Publish button on the platform.
          </strong>
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={() => { setStatus("idle"); setErrorMsg(null); }}
            style={btnSecondary}
          >
            Back
          </button>
          <button onClick={handleConfirm} style={btnPrimary}>
            Yes, Open &amp; Insert
          </button>
        </div>
      </div>
    );
  }

  // ── navigating / prefilling ──

  if (status === "navigating" || status === "prefilling") {
    return (
      <div style={containerStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px 0" }}>
          Publishing...
        </h3>
        <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>
          {status === "navigating"
            ? `Navigating to ${platform}...`
            : "Inserting text into compose field..."}
        </p>
        <div
          style={{
            marginTop: 12,
            width: "100%",
            height: 3,
            background: C.border,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "40%",
              background: C.accent,
              borderRadius: 2,
              animation: "publishProgress 1s ease-in-out infinite",
            }}
          />
        </div>
      </div>
    );
  }

  // ── success ──

  if (status === "success") {
    return (
      <div style={containerStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 20,
              color: C.success,
            }}
          >
            ✓
          </span>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              margin: 0,
              color: C.success,
            }}
          >
            Text Inserted
          </h3>
        </div>
        <p
          style={{
            fontSize: 13,
            color: C.text,
            margin: "0 0 16px 0",
            lineHeight: 1.5,
          }}
        >
          {SUCCESS_MESSAGE}
        </p>

        {/* Clipboard fallback */}
        <button
          onClick={handleCopy}
          style={{
            ...btnPrimary,
            background: copied ? C.success : C.primary,
            marginRight: 10,
          }}
        >
          {copied ? "Copied!" : "Copy to Clipboard"}
        </button>

        {onClose && (
          <button onClick={onClose} style={btnSecondary}>
            Close
          </button>
        )}
      </div>
    );
  }

  // ── error ──

  return (
    <div style={containerStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 20, color: C.error }}>✕</span>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.error }}>
          Publication Failed
        </h3>
      </div>
      {errorMsg && (
        <p style={{ fontSize: 12, color: C.error, margin: "0 0 12px 0" }}>
          {errorMsg}
        </p>
      )}
      <p style={{ fontSize: 12, color: C.textDim, margin: "0 0 16px 0" }}>
        You can still copy the text to your clipboard and paste it manually.
      </p>

      {/* Clipboard fallback */}
      <button
        onClick={handleCopy}
        style={{
          ...btnPrimary,
          background: copied ? C.success : C.primary,
          marginRight: 10,
        }}
      >
        {copied ? "Copied!" : "Copy to Clipboard"}
      </button>

      <button
        onClick={() => { setStatus("idle"); setErrorMsg(null); }}
        style={btnSecondary}
      >
        Try Again
      </button>
    </div>
  );
}

export default PublishAssistPanel;
