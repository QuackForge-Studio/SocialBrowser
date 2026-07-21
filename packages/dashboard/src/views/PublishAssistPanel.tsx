import React, { useState, useCallback } from "react";
import { Check, X, ClipboardText, WarningCircle } from "@phosphor-icons/react";
import type { DashboardBridge } from "../types";

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

export type PublishStatus = "idle" | "confirming" | "navigating" | "prefilling" | "success" | "error";

export interface PublishAssistPanelProps {
  draftId: string;
  text: string;
  platform: string;
  accountId: string;
  onClose?: () => void;
  onPublished?: () => void;
}

const SUCCESS_MESSAGE = "Text inserted. Click Publish on the platform to post.";

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

  const handleConfirm = useCallback(async () => {
    if (!bridge) {
      setStatus("error");
      setErrorMsg("Dashboard bridge not available");
      return;
    }

    setStatus("navigating");
    setErrorMsg(null);

    try {
      await bridge.navigateTo({ platform, accountId });
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message ?? "Navigation failed");
      return;
    }

    setStatus("prefilling");

    try {
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
      setCopied(false);
    }
  }, [bridge, text]);

  const containerCls = "w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg";
  const btnPrimaryCls =
    "inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover active:translate-y-px";
  const btnPrimarySurfaceCls =
    "inline-flex items-center gap-1.5 rounded-md bg-bg-elevated border border-border px-5 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-hover active:translate-y-px";
  const btnSecondaryCls =
    "rounded-md border border-border px-5 py-2 text-[13px] text-text-dim transition-colors hover:bg-surface-hover";

  if (status === "idle") {
    return (
      <div className={containerCls}>
        <h3 className="text-[15px] font-semibold tracking-tight text-text">Publish Draft</h3>
        <p className="mt-1 text-[12px] text-text-dim">
          Platform: <span className="font-medium text-text">{platform}</span>
        </p>

        <div className="mt-3 max-h-40 overflow-y-auto rounded-md border border-border bg-bg p-3 text-[12px] leading-relaxed text-text whitespace-pre-wrap break-words">
          {text}
        </div>

        <div className="mt-4 flex justify-end gap-2.5">
          {onClose && (
            <button type="button" onClick={onClose} className={btnSecondaryCls}>Cancel</button>
          )}
          <button type="button" onClick={() => setStatus("confirming")} className={btnPrimaryCls}>
            Publish
          </button>
        </div>
      </div>
    );
  }

  if (status === "confirming") {
    return (
      <div className={containerCls}>
        <h3 className="text-[15px] font-semibold tracking-tight text-text">Confirm Publication</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
          This will open {platform} and insert your text into the compose field.
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-warning">
          <WarningCircle size={14} weight="fill" />
          You must manually click the Publish button on the platform.
        </p>
        <div className="mt-4 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => { setStatus("idle"); setErrorMsg(null); }}
            className={btnSecondaryCls}
          >
            Back
          </button>
          <button type="button" onClick={handleConfirm} className={btnPrimaryCls}>
            Yes, Open and Insert
          </button>
        </div>
      </div>
    );
  }

  if (status === "navigating" || status === "prefilling") {
    return (
      <div className={containerCls}>
        <h3 className="text-[15px] font-semibold tracking-tight text-text">Publishing...</h3>
        <p className="mt-2 text-[13px] text-text-dim">
          {status === "navigating" ? `Navigating to ${platform}...` : "Inserting text into compose field..."}
        </p>
        <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full w-2/5 rounded-full bg-accent"
            style={{ animation: "publishProgress 1s ease-in-out infinite" }}
          />
        </div>
        <style>{`@keyframes publishProgress { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className={containerCls}>
        <div className="mb-3 flex items-center gap-2">
          <Check size={18} weight="bold" className="text-success" />
          <h3 className="text-[15px] font-semibold text-success">Text Inserted</h3>
        </div>
        <p className="mb-4 text-[13px] leading-relaxed text-text">{SUCCESS_MESSAGE}</p>

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className={copied ? btnPrimaryCls : btnPrimarySurfaceCls}
          >
            {copied ? <><Check size={13} weight="bold" /> Copied</> : <><ClipboardText size={13} /> Copy to Clipboard</>}
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className={btnSecondaryCls}>Close</button>
          )}
        </div>
      </div>
    );
  }

  // error
  return (
    <div className={containerCls}>
      <div className="mb-3 flex items-center gap-2">
        <X size={18} weight="bold" className="text-error" />
        <h3 className="text-[15px] font-semibold text-error">Publication Failed</h3>
      </div>
      {errorMsg && (
        <p className="mb-3 text-[12px] text-error">{errorMsg}</p>
      )}
      <p className="mb-4 text-[12px] text-text-dim">
        You can still copy the text to your clipboard and paste it manually.
      </p>

      <div className="flex justify-end gap-2.5">
        <button
          type="button"
          onClick={handleCopy}
          className={copied ? btnPrimaryCls : btnPrimarySurfaceCls}
        >
          {copied ? <><Check size={13} weight="bold" /> Copied</> : <><ClipboardText size={13} /> Copy to Clipboard</>}
        </button>
        <button
          type="button"
          onClick={() => { setStatus("idle"); setErrorMsg(null); }}
          className={btnSecondaryCls}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

export default PublishAssistPanel;
