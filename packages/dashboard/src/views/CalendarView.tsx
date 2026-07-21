import React, { useState, useEffect, useCallback } from 'react';
import type { Post, Draft, GeneratedDraft, ContextPost, Account } from '../types';
import type { DashboardBridge } from '../types';
import { PublishAssistPanel } from './PublishAssistPanel';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

function scoreToColor(score: number | null | undefined): string {
  if (score == null) return 'var(--color-text-faint)';
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped >= 70) return 'var(--color-success)';
  if (clamped >= 40) return 'var(--color-warning)';
  return 'var(--color-error)';
}
// ===== Draft Create Modal =====
function DraftCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedDraft | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const bridge = getBridge();
    if (bridge) {
      bridge.getAccounts().then((accs: any[]) => {
        setAccounts(accs);
        if (accs.length > 0) setSelectedAccount(accs[0].id);
      });
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !selectedAccount) return;
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const bridge = getBridge();
      if (!bridge) { setError('Bridge not available'); setGenerating(false); return; }
      const genResult = await bridge.generateDraft({ accountId: selectedAccount, prompt: prompt.trim() });
      setResult(genResult);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [prompt, selectedAccount]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content draft-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Draft</h3>
          <button className="modal-close" onClick={onClose}>{String.fromCharCode(215)}</button>
        </div>
        <div className="modal-body">
          {accounts.length > 0 ? (
            <div className="form-group">
              <label>Account</label>
              <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.platform}/{a.handle}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="form-group">
            <label>Prompt / Brief</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Enter a prompt for AI draft generation..."
              rows={4}
              disabled={generating}
            />
          </div>
          {error ? <div className="error-message">{error}</div> : null}

          {!result ? (
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={generating || !prompt.trim() || !selectedAccount}
            >
              {generating ? (
                <span className="loading-spinner">
                  <span className="spinner-icon"></span> Generating...
                </span>
              ) : (
                'Generate Draft'
              )}
            </button>
          ) : null}
          {result ? (
            <div className="draft-result">
              <h4>Generated Draft</h4>
              <div className="draft-text">{result.generatedText}</div>

              {result.contextPosts && result.contextPosts.length > 0 ? (
                <div className="rag-sources">
                  <h4>RAG Sources ({result.contextPosts.length})</h4>
                  {result.contextPosts.map((cp, idx) => (
                    <div key={idx} className="rag-source-item">
                      <div className="rag-source-text">{cp.contentText?.slice(0, 200)}{(cp.contentText?.length || 0) > 200 ? '...' : ''}</div>
                      <div className="rag-source-scores">
                        {cp.compositeScore !== undefined ? <span className="score-badge">Score: {cp.compositeScore.toFixed(1)}</span> : null}
                        {cp.engagementScore !== undefined ? <span className="score-badge">Eng: {cp.engagementScore.toFixed(1)}</span> : null}
                        {cp.similarity !== undefined ? <span className="score-badge">Sim: {(cp.similarity * 100).toFixed(0)}%</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {result.predictedScore !== undefined ? (
                <div className="predicted-score">
                  Predicted Score: <strong>{result.predictedScore.toFixed(1)}</strong>
                </div>
              ) : null}

              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={onClose}>Close</button>
                <button className="btn btn-primary" onClick={onCreated}>Save Draft</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ===== Draft Review Modal =====
function DraftReviewModal({ draft, accounts, onClose }: { draft: Draft; accounts: Account[]; onClose: () => void }) {
  const [scheduledDate, setScheduledDate] = useState(draft.scheduledDate?.split('T')[0] || '');
  const [updating, setUpdating] = useState(false);
  const [showPublishPanel, setShowPublishPanel] = useState(false);

  const handleSchedule = useCallback(async () => {
    if (!scheduledDate) return;
    setUpdating(true);
    try {
      const bridge = getBridge();
      if (bridge) {
        await bridge.updateDraft({ id: draft.id, scheduledDate: scheduledDate + 'T00:00:00.000Z' });
      }
    } catch (err: any) {
      console.error('Failed to schedule draft:', err);
    } finally {
      setUpdating(false);
    }
  }, [draft.id, scheduledDate]);

  const parseRagIds = (ids?: string): string[] => {
    if (!ids) return [];
    return ids.split(',').filter(Boolean);
  };

  // Find the account for this draft to determine platform
  const draftAccount = accounts.find((a) => a.id === draft.accountId);
  const platform = draftAccount?.platform || 'x';

  // If publish panel is shown, render it as an overlay
  if (showPublishPanel) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, background: 'transparent', border: 'none', boxShadow: 'none' }}>
          <PublishAssistPanel
            draftId={draft.id}
            text={draft.generatedText || ''}
            platform={platform}
            accountId={draft.accountId}
            onClose={() => setShowPublishPanel(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content draft-review-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Draft Review</h3>
          <button className="modal-close" onClick={onClose}>{String.fromCharCode(215)}</button>
        </div>
        <div className="modal-body">
          <div className="draft-meta">
            <span>Status: <strong>{draft.status}</strong></span>
            <span>Created: {new Date(draft.createdAt).toLocaleDateString()}</span>
          </div>

          <div className="draft-section">
            <h4>Generated Text</h4>
            <div className="draft-text">{draft.generatedText || '(No text generated)'}</div>
          </div>

          {draft.sourcePrompt ? (
            <div className="draft-section">
              <h4>Source Prompt</h4>
              <div className="draft-prompt">{draft.sourcePrompt}</div>
            </div>
          ) : null}

          {draft.ragContextIds && parseRagIds(draft.ragContextIds).length > 0 ? (
            <div className="draft-section">
              <h4>RAG Sources ({parseRagIds(draft.ragContextIds).length})</h4>
              <div className="rag-sources">
                {parseRagIds(draft.ragContextIds).map((id, idx) => (
                  <div key={id} className="rag-source-item clickable"
                    onClick={() => {
                      const bridge = getBridge();
                      if (bridge) {
                        // Clicking RAG source navigates to original post view
                        bridge.getPosts().then((allPosts: any) => {
                          const sourcePost = allPosts.find((p: any) => p.id === id);
                          if (sourcePost && sourcePost.accountId) {
                            bridge.navigateTo({ platform: sourcePost.platform || 'x', accountId: sourcePost.accountId });
                          }
                        });
                      }
                    }}
                  >
                    <span className="rag-source-icon">{String.fromCharCode(128279)}</span>
                    <span>Source #{idx + 1} ({id.slice(0, 8)}...)</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {draft.predictedScore !== undefined ? (
            <div className="draft-section">
              <h4>Predicted Score</h4>
              <div className="predicted-score-section">
                <div className={"score-value " + (draft.predictedScore >= 50 ? "score-high" : draft.predictedScore >= 25 ? "score-medium" : "score-low")}>
                  {draft.predictedScore.toFixed(1)}
                </div>
              </div>
            </div>
          ) : null}

          <div className="draft-section">
            <h4>Schedule</h4>
            <div className="schedule-row">
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" onClick={handleSchedule} disabled={updating || !scheduledDate}>
                {updating ? 'Scheduling...' : 'Set Date'}
              </button>
            </div>
          </div>

          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => setShowPublishPanel(true)} disabled={!draft.generatedText}>
              Publish
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Main CalendarView =====
export function CalendarView() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [posts, setPosts] = useState<Post[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<Draft | null>(null);
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);

  const isToday = (year: number, month: number, day: number) => {
    return year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
  };

  const isFuture = (year: number, month: number, day: number) => {
    const date = new Date(year, month, day);
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return date > now;
  };

  const formatDate = (year: number, month: number, day: number) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return year + '-' + m + '-' + d;
  };

  // Load data
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) { setLoading(false); return; }

    Promise.all([
      bridge.getPosts({ limit: 500 }),
      bridge.getDrafts(),
      bridge.getAccounts(),
    ]).then(([postsData, draftsData, accountsData]) => {
      setPosts(postsData as Post[]);
      setDrafts(draftsData as Draft[]);
      setAccounts(accountsData as any[]);
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load calendar data:', err);
      setLoading(false);
    });
  }, []);

  const getPostsForDate = (dateStr: string): Post[] => {
    return posts.filter(p => p.publishedAt && p.publishedAt.startsWith(dateStr));
  };

  const getDraftsForDate = (dateStr: string): Draft[] => {
    return drafts.filter(d => d.scheduledDate && d.scheduledDate.startsWith(dateStr));
  };

  const handleDateClick = useCallback((dateStr: string) => {
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
    const datePosts = getPostsForDate(dateStr);
    setFilteredPosts(datePosts);
  }, [posts]);

  const handleCreateDraft = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  const handleDraftCreated = useCallback(() => {
    const bridge = getBridge();
    if (bridge) {
      bridge.getDrafts().then((d: any) => setDrafts(d as Draft[]));
    }
  }, []);

  const handleDraftReview = useCallback((draft: Draft) => {
    setReviewDraft(draft);
  }, []);

  // Drag-and-drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, draftId: string) => {
    e.dataTransfer.setData('text/plain', draftId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const draftId = e.dataTransfer.getData('text/plain');
    if (!draftId) return;

    try {
      const bridge = getBridge();
      if (bridge) {
        await bridge.updateDraft({ id: draftId, scheduledDate: dateStr + 'T00:00:00.000Z' });
        const updatedDrafts = await bridge.getDrafts();
        setDrafts(updatedDrafts as Draft[]);
      }
    } catch (err) {
      console.error('Failed to schedule draft:', err);
    }
  }, []);

  // Calendar grid
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else { setCurrentMonth(currentMonth - 1); }
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else { setCurrentMonth(currentMonth + 1); }
  };

  const goToToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  if (loading) {
    return (
      <div className="p-6 bg-bg min-h-full">
        <h2 className="text-lg font-semibold tracking-tight text-text mb-5">Calendar</h2>
        <div className="mt-10 flex flex-col items-center gap-3 text-text-dim">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-[13px]">Loading calendar data...</p>
        </div>
      </div>
    );
  }

  // Build empty calendar days array
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  return (
    <div className="p-6 bg-bg min-h-full">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-text">Calendar</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-dim transition-colors hover:bg-surface-hover hover:text-text"
            aria-label="Previous month"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
          <span className="min-w-[140px] text-center text-[13px] font-medium text-text">
            {MONTHS[currentMonth]} {currentYear}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-dim transition-colors hover:bg-surface-hover hover:text-text"
            aria-label="Next month"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9,6 15,12 9,18"/></svg>
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="ml-1 rounded-md border border-border px-3 py-1 text-[12px] text-text-dim transition-colors hover:bg-surface-hover hover:text-text"
          >
            Today
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-7 gap-0.5">
        {DAYS.map(d => (
          <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-text-faint">{d}</div>
        ))}
        {calendarDays.map((day, idx) => {
          if (day === null) return <div key={"empty-" + idx} className="min-h-[88px] rounded-lg border border-dashed border-border/50" />;
          const dateStr = formatDate(currentYear, currentMonth, day);
          const dayPosts = getPostsForDate(dateStr);
          const dayDrafts = getDraftsForDate(dateStr);
          const isCurrentDay = isToday(currentYear, currentMonth, day);
          const isPastOrToday = !isFuture(currentYear, currentMonth, day);
          const totalItems = dayPosts.length + dayDrafts.length;
          return (
            <div
              key={dateStr}
              className={[
                "min-h-[88px] rounded-lg border p-2 transition-colors",
                isCurrentDay
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-surface hover:bg-surface-hover",
                isPastOrToday ? "cursor-pointer" : "opacity-60",
              ].join(" ")}
              onClick={() => isPastOrToday ? handleDateClick(dateStr) : undefined}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, dateStr)}
            >
              <div className={[
                "mb-1 text-[12px] font-medium",
                isCurrentDay ? "text-accent" : "text-text-dim",
              ].join(" ")}>
                {day}
              </div>
              {dayPosts.slice(0, 3).map(p => (
                <div
                  key={p.id}
                  className="mb-1 flex items-center gap-1 rounded bg-bg-elevated px-1 py-0.5 text-[10px]"
                  title={p.contentText?.slice(0, 100)}
                >
                  <span
                    className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ background: scoreToColor(p.compositeScore as number | null | undefined) }}
                  />
                  <span className="truncate text-text-dim">
                    {p.compositeScore?.toFixed(0) ?? "?"}
                  </span>
                </div>
              ))}
              {dayDrafts.slice(0, 2).map(d => (
                <div
                  key={d.id}
                  className="mb-1 flex items-center gap-1 rounded bg-accent-soft px-1 py-0.5 text-[10px] cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => handleDragStart(e, d.id)}
                  onClick={(e) => { e.stopPropagation(); handleDraftReview(d); }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0 text-accent"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                  <span className="truncate text-accent">Draft</span>
                </div>
              ))}
              {totalItems > 5 ? (
                <div className="text-[10px] text-text-faint">+{totalItems - 5} more</div>
              ) : null}
            </div>
          );
        })}
      </div>

      {selectedDate && filteredPosts.length > 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-text">
            Posts for {selectedDate}
          </h3>
          <div className="space-y-1.5">
            {filteredPosts.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-md bg-bg-elevated px-3 py-2 text-[12px]">
                <span
                  className="flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    background: p.compositeScore != null ? "var(--color-accent-soft)" : "var(--color-surface-hover)",
                    color: p.compositeScore != null ? "var(--color-accent)" : "var(--color-text-faint)",
                  }}
                >
                  {p.compositeScore?.toFixed(1) ?? "N/A"}
                </span>
                <span className="truncate text-text-dim">{p.contentText?.slice(0, 100)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleCreateDraft}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover active:translate-y-px"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Draft
      </button>

      {showCreateModal ? (
        <DraftCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); handleDraftCreated(); }}
        />
      ) : null}

      {reviewDraft ? (
        <DraftReviewModal
          draft={reviewDraft}
          accounts={accounts}
          onClose={() => setReviewDraft(null)}
        />
      ) : null}
    </div>
  );
}
