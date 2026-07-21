import React, { useState, useEffect, useCallback } from "react";
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

const NOTICE_TEXT =
  "Session isolation is not anti-detection and does not evade platform enforcement. Capture is read-only observation of owned content only.";

export interface ToSAcknowledgmentProps {
  accountId: string;
  accountLabel?: string;
  onAcknowledged: () => void;
  onCancel: () => void;
}

export function ToSAcknowledgment({
  accountId,
  accountLabel,
  onAcknowledged,
  onCancel,
}: ToSAcknowledgmentProps) {
  const bridge = getBridge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAcknowledge = useCallback(async () => {
    if (!bridge) {
      setError("Bridge not available");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await bridge.acknowledgeAccount({ accountId });
      if (result.acknowledged) {
        onAcknowledged();
      } else {
        setError("Acknowledgment was not recorded. Please try again.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Acknowledgment failed");
    } finally {
      setLoading(false);
    }
  }, [bridge, accountId, onAcknowledged]);

  // ── overlay + modal ──

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 28,
          maxWidth: 480,
          width: "90%",
          color: C.text,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            margin: "0 0 12px 0",
            color: C.warning,
          }}
        >
          Account Risk Acknowledgment
        </h3>

        {accountLabel && (
          <p style={{ fontSize: 13, color: C.textDim, margin: "0 0 8px 0" }}>
            Account: <strong style={{ color: C.text }}>{accountLabel}</strong>
          </p>
        )}

        <div
          style={{
            background: C.bg,
            border: `1px solid ${C.warning}`,
            borderLeft: `4px solid ${C.warning}`,
            borderRadius: 6,
            padding: "12px 16px",
            margin: "0 0 20px 0",
            fontSize: 13,
            lineHeight: 1.6,
            color: C.text,
          }}
        >
          {NOTICE_TEXT}
        </div>

        {error && (
          <p
            style={{
              color: C.error,
              fontSize: 12,
              margin: "0 0 12px 0",
            }}
          >
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              background: "transparent",
              color: C.textDim,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "8px 20px",
              fontSize: 13,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleAcknowledge}
            disabled={loading}
            style={{
              background: C.accent,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Acknowledging..." : "I Acknowledge"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook that checks whether an account needs acknowledgment
 * and returns whether the acknowledgment modal should be shown.
 */
export function useAccountAcknowledgment(
  accountIds: string[],
  onAcknowledged?: (accountId: string) => void
) {
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const checkAll = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge || accountIds.length === 0) return;
    const unacked: string[] = [];
    await Promise.all(
      accountIds.map(async (id) => {
        try {
          const r = await bridge.checkAcknowledged({ accountId: id });
          if (!r.acknowledged) unacked.push(id);
        } catch {
          // assume not acknowledged on error
          unacked.push(id);
        }
      })
    );
    setPendingIds(unacked);
    if (unacked.length > 0) setCurrentId(unacked[0]);
  }, [accountIds]);

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  const handleAcknowledged = useCallback(() => {
    if (currentId) {
      onAcknowledged?.(currentId);
      const remaining = pendingIds.filter((id) => id !== currentId);
      setPendingIds(remaining);
      setCurrentId(remaining.length > 0 ? remaining[0] : null);
    }
  }, [currentId, pendingIds, onAcknowledged]);

  const handleCancel = useCallback(() => {
    const remaining = pendingIds.filter((id) => id !== currentId);
    setPendingIds(remaining);
    setCurrentId(remaining.length > 0 ? remaining[0] : null);
  }, [currentId, pendingIds]);

  return {
    needsAcknowledgment: currentId !== null,
    currentAccountId: currentId,
    pendingCount: pendingIds.length,
    handleAcknowledged,
    handleCancel,
    recheck: checkAll,
  };
}

export default ToSAcknowledgment;
