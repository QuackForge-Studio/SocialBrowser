import React, { useState, useEffect, useCallback } from "react";
import { X } from "@phosphor-icons/react";
import type { Draft, GeneratedDraft, ContextPost, Account, DashboardBridge } from "../types";
import { PublishAssistPanel } from "./PublishAssistPanel";

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

const MODAL_OVERLAY = "fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4";
const MODAL_CONTENT = "w-full max-w-lg rounded-lg border border-border bg-surface shadow-lg";
const BTN_PRIMARY = "inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover active:translate-y-px disabled:opacity-50";
const BTN_SECONDARY = "rounded-md border border-border px-4 py-2 text-[13px] text-text-dim transition-colors hover:bg-surface-hover";

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
      <h3 className="text-[15px] font-semibold tracking-tight text-text">{title}</h3>
      <button
        type="button"
        onClick={onClose}
        className="flex h-6 w-6 items-center justify-center rounded-sm text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}

export function DraftCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedDraft | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const bridge = getBridge();
    if (bridge) {
      bridge.getAccounts().then((accs: Account[]) => {
        setAccounts(accs);
        if (accs.length > 0) setSelectedAccount(accs[0].id);
      });
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !selectedAccount) return;
    setGenerating(true);
    setError("");
    setResult(null);
    try {
      const bridge = getBridge();
      if (!bridge) { setError("Bridge not available"); setGenerating(false); return; }
      const genResult = await bridge.generateDraft({ accountId: selectedAccount, prompt: prompt.trim() });
      setResult(genResult);
    } catch (err: any) {
      setError(err.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [prompt, selectedAccount]);

  return (
    <div className={MODAL_OVERLAY} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={MODAL_CONTENT} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title="Create Draft" onClose={onClose} />
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {accounts.length > 0 ? (
            <div className="mb-4">
              <label className="mb-1.5 block text-[12px] text-text-dim">Account</label>
              <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="w-full">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.platform}/{a.handle}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] text-text-dim">Prompt / Brief</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter a prompt for AI draft generation..."
              rows={4}
              disabled={generating}
              className="w-full resize-y"
            />
          </div>

          {error && (
            <p className="mb-3 flex items-center gap-1.5 text-[12px] text-error">
              <X size={12} weight="bold" /> {error}
            </p>
          )}

          {!result ? (
            <button type="button" className={BTN_PRIMARY} onClick={handleGenerate} disabled={generating || !prompt.trim() || !selectedAccount}>
              {generating ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground" />
                  Generating...
                </>
              ) : "Generate Draft"}
            </button>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-text-faint">Generated Draft</h4>
                <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-bg p-3 text-[13px] leading-relaxed text-text whitespace-pre-wrap break-words">
                  {result.generatedText}
                </div>
              </div>

              {result.contextPosts && result.contextPosts.length > 0 ? (
                <div>
                  <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-text-faint">
                    RAG Sources ({result.contextPosts.length})
                  </h4>
                  <div className="space-y-2">
                    {result.contextPosts.map((cp: ContextPost, idx: number) => (
                      <div key={idx} className="rounded-md border border-border bg-bg p-2.5">
                        <p className="text-[12px] leading-relaxed text-text-dim">
                          {cp.contentText?.slice(0, 200)}{(cp.contentText?.length || 0) > 200 ? "..." : ""}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {cp.compositeScore !== undefined ? (
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">Score: {cp.compositeScore.toFixed(1)}</span>
                          ) : null}
                          {cp.engagementScore !== undefined ? (
                            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-text-dim">Eng: {cp.engagementScore.toFixed(1)}</span>
                          ) : null}
                          {cp.similarity !== undefined ? (
                            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-text-dim">Sim: {(cp.similarity * 100).toFixed(0)}%</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.predictedScore !== undefined ? (
                <p className="text-[13px] text-text-dim">
                  Predicted Score: <span className="font-semibold text-text">{result.predictedScore.toFixed(1)}</span>
                </p>
              ) : null}

              <div className="flex justify-end gap-2.5">
                <button type="button" className={BTN_SECONDARY} onClick={onClose}>Close</button>
                <button type="button" className={BTN_PRIMARY} onClick={onCreated}>Save Draft</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DraftReviewModal({ draft, accounts, onClose }: { draft: Draft; accounts: Account[]; onClose: () => void }) {
  const [scheduledDate, setScheduledDate] = useState(draft.scheduledDate?.split("T")[0] || "");
  const [updating, setUpdating] = useState(false);
  const [showPublishPanel, setShowPublishPanel] = useState(false);

  const handleSchedule = useCallback(async () => {
    if (!scheduledDate) return;
    setUpdating(true);
    try {
      const bridge = getBridge();
      if (bridge) {
        await bridge.updateDraft({ id: draft.id, scheduledDate: scheduledDate + "T00:00:00.000Z" });
      }
    } catch (err: any) {
      console.error("Failed to schedule draft:", err);
    } finally {
      setUpdating(false);
    }
  }, [draft.id, scheduledDate]);

  const parseRagIds = (ids?: string): string[] => {
    if (!ids) return [];
    return ids.split(",").filter(Boolean);
  };

  const draftAccount = accounts.find((a) => a.id === draft.accountId);
  const platform = draftAccount?.platform || "x";

  if (showPublishPanel) {
    return (
      <div className={MODAL_OVERLAY} onClick={onClose}>
        <div className="bg-transparent border-none shadow-none" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
          <PublishAssistPanel
            draftId={draft.id}
            text={draft.generatedText || ""}
            platform={platform}
            accountId={draft.accountId}
            onClose={() => setShowPublishPanel(false)}
          />
        </div>
      </div>
    );
  }

  const ragIds = draft.ragContextIds ? parseRagIds(draft.ragContextIds) : [];
  const scoreBg = draft.predictedScore !== undefined
    ? (draft.predictedScore >= 50 ? "var(--color-success-soft)" : draft.predictedScore >= 25 ? "var(--color-warning-soft)" : "var(--color-error-soft)")
    : "";
  const scoreColor = draft.predictedScore !== undefined
    ? (draft.predictedScore >= 50 ? "var(--color-success)" : draft.predictedScore >= 25 ? "var(--color-warning)" : "var(--color-error)")
    : "";

  return (
    <div className={MODAL_OVERLAY} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={MODAL_CONTENT} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title="Draft Review" onClose={onClose} />
        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="mb-4 flex items-center gap-4 text-[12px] text-text-dim">
            <span>Status: <span className="font-medium text-text">{draft.status}</span></span>
            <span>Created: {new Date(draft.createdAt).toLocaleDateString()}</span>
          </div>

          <div className="mb-4">
            <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-text-faint">Generated Text</h4>
            <div className="rounded-md border border-border bg-bg p-3 text-[13px] leading-relaxed text-text whitespace-pre-wrap break-words">
              {draft.generatedText || "(No text generated)"}
            </div>
          </div>

          {draft.sourcePrompt ? (
            <div className="mb-4">
              <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-text-faint">Source Prompt</h4>
              <div className="rounded-md border border-border bg-bg p-3 text-[12px] leading-relaxed text-text-dim italic">
                {draft.sourcePrompt}
              </div>
            </div>
          ) : null}

          {ragIds.length > 0 ? (
            <div className="mb-4">
              <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-text-faint">
                RAG Sources ({ragIds.length})
              </h4>
              <div className="space-y-1">
                {ragIds.map((id, idx) => (
                  <button
                    key={id}
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-left text-[12px] text-text-dim transition-colors hover:bg-surface-hover"
                    onClick={() => {
                      const bridge = getBridge();
                      if (bridge) {
                        bridge.getPosts().then((allPosts: any) => {
                          const sourcePost = allPosts.find((p: any) => p.id === id);
                          if (sourcePost && sourcePost.accountId) {
                            bridge.navigateTo({ platform: sourcePost.platform || "x", accountId: sourcePost.accountId });
                          }
                        });
                      }
                    }}
                  >
                    <span className="text-accent">#</span>
                    <span className="truncate">Source {idx + 1} ({id.slice(0, 8)}...)</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {draft.predictedScore !== undefined ? (
            <div className="mb-4">
              <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-text-faint">Predicted Score</h4>
              <div className="inline-flex items-baseline gap-1 rounded-md px-3 py-1.5" style={{ background: scoreBg }}>
                <span className="text-xl font-bold" style={{ color: scoreColor }}>
                  {draft.predictedScore.toFixed(1)}
                </span>
              </div>
            </div>
          ) : null}

          <div className="mb-4">
            <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-text-faint">Schedule</h4>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="flex-1"
              />
              <button type="button" className={BTN_PRIMARY} onClick={handleSchedule} disabled={updating || !scheduledDate}>
                {updating ? "Scheduling..." : "Set Date"}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2.5">
            <button type="button" className={BTN_PRIMARY} onClick={() => setShowPublishPanel(true)} disabled={!draft.generatedText}>
              Publish
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
