import React, { useState, useEffect, useCallback } from "react";
import { WarningOctagon, X } from "@phosphor-icons/react";
import type { DashboardBridge } from "../types";

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-7 shadow-lg">
        <div className="mb-3 flex items-start gap-2.5">
          <WarningOctagon size={20} weight="fill" className="mt-0.5 flex-shrink-0 text-warning" />
          <h3 className="text-base font-semibold tracking-tight text-text">
            Account Risk Acknowledgment
          </h3>
        </div>

        {accountLabel && (
          <p className="mb-2 text-[19px] text-text-dim">
            Account: <span className="font-medium text-text">{accountLabel}</span>
          </p>
        )}

        <div className="mb-5 rounded-md border border-warning border-l-4 bg-warning-soft p-4 text-[19px] leading-relaxed text-text">
          {NOTICE_TEXT}
        </div>

        {error && (
          <p className="mb-3 flex items-center gap-1.5 text-[16px] text-error">
            <X size={12} weight="bold" /> {error}
          </p>
        )}

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-border px-5 py-2 text-[19px] text-text-dim transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={loading}
            className="rounded-md bg-accent px-5 py-2 text-[19px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover active:translate-y-px disabled:opacity-70"
          >
            {loading ? "Acknowledging..." : "I Acknowledge"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
