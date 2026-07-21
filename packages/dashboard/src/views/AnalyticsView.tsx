import React, { useState, useEffect, useCallback } from "react";
import type { Account, TrendDataPoint, AnalyticsPost, HeatmapCellData, AnalyticsData, DashboardBridge } from "../types";
import { MIN_ANALYTICS_POSTS } from "../types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MIN_SAMPLES_CONFIDENCE = 5;

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--color-text-faint)";
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped >= 70) return "var(--color-success)";
  if (clamped >= 40) return "var(--color-warning)";
  return "var(--color-error)";
}

function heatmapStyle(value: number | null, confidence: number, excluded: boolean): React.CSSProperties {
  if (excluded || value == null) {
    return { backgroundColor: "var(--color-border)", opacity: 0.4 };
  }
  return {
    backgroundColor: scoreColor(value),
    opacity: Math.max(0.2, Math.min(1, confidence * 0.85 + 0.15)),
  };
}

function TrendLines({ data }: { data: TrendDataPoint[] }) {
  if (data.length === 0) {
    return <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-[13px] text-text-dim">No trend data available.</div>;
  }

  const width = 600;
  const height = 200;
  const padding = { top: 10, right: 10, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const scores = data.map((d) => d.avgScore).filter((s): s is number => s !== null);
  if (scores.length === 0) {
    return <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-[13px] text-text-dim">No scored posts for trend analysis.</div>;
  }

  const minScore = Math.max(0, Math.min(...scores) - 5);
  const maxScore = Math.min(100, Math.max(...scores) + 5);
  const scoreRange = maxScore - minScore || 1;

  const points = data
    .map((d, i) => {
      if (d.avgScore == null) return null;
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
      const y = padding.top + chartH - ((d.avgScore - minScore) / scoreRange) * chartH;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  const yTicks = 5;
  const yTickLabels: number[] = [];
  for (let i = 0; i <= yTicks; i++) yTickLabels.push(minScore + (scoreRange * i) / yTicks);

  const xLabelInterval = Math.max(1, Math.floor(data.length / 8));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {yTickLabels.map((val, i) => {
          const y = padding.top + chartH - ((val - minScore) / scoreRange) * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--color-border)" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="var(--color-text-faint)" fontSize={10}>
                {val.toFixed(0)}
              </text>
            </g>
          );
        })}
        {points && <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth={2} />}
        {data.map((d, i) => {
          if (d.avgScore == null) return null;
          const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
          const y = padding.top + chartH - ((d.avgScore - minScore) / scoreRange) * chartH;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={3} fill="var(--color-accent)" />
              <title>{`Date: ${d.date}\nScore: ${d.avgScore.toFixed(1)}\nPosts: ${d.postCount}`}</title>
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % xLabelInterval !== 0) return null;
          const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
          const label = d.date.length > 10 ? d.date.slice(5, 10) : d.date;
          return (
            <text key={i} x={x} y={height - 4} textAnchor="middle" fill="var(--color-text-faint)" fontSize={10}>
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function TimingHeatmap({ cells }: { cells: HeatmapCellData[] }) {
  const [sortBy, setSortBy] = useState<"hour" | "confidence">("hour");

  const cellMap = new Map<string, HeatmapCellData>();
  for (const cell of cells) cellMap.set(`${cell.hourOfDay}:${cell.dayOfWeek}`, cell);

  const isExcluded = (hour: number, day: number): boolean => {
    const cell = cellMap.get(`${hour}:${day}`);
    return !cell || cell.sampleSize < MIN_SAMPLES_CONFIDENCE;
  };

  const getCellValue = (hour: number, day: number): HeatmapCellData | undefined => cellMap.get(`${hour}:${day}`);

  const hours: number[] = [];
  for (let h = 0; h < 24; h++) hours.push(h);

  const rowData = hours.map((hour) => {
    const cellsForHour = Array.from({ length: 7 }, (_, day) => ({
      hour,
      day,
      cell: getCellValue(hour, day),
      excluded: isExcluded(hour, day),
    }));
    const avgConfidence = cellsForHour.reduce((sum, c) => sum + (c.cell?.confidence ?? 0), 0) / 7;
    return { hour, cells: cellsForHour, avgConfidence };
  });

  if (sortBy === "confidence") rowData.sort((a, b) => a.avgConfidence - b.avgConfidence);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-text">Timing Heatmap (hour x day)</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "hour" | "confidence")}
        >
          <option value="hour">Sort by Hour</option>
          <option value="confidence">Sort by Confidence</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        {/* Column headers */}
        <div className="mb-0.5 flex gap-0.5" style={{ marginLeft: 44 }}>
          <div className="w-8 flex-shrink-0" />
          {DAY_NAMES.map((day) => (
            <div key={day} className="w-8 flex-shrink-0 pb-1 text-center text-[10px] text-text-faint">{day}</div>
          ))}
        </div>
        {/* Rows */}
        {rowData.map(({ hour, cells: rowCells }) => (
          <div key={hour} className="mb-0.5 flex gap-0.5">
            <div className="w-10 flex-shrink-0 pr-1 text-right text-[9px] text-text-faint" style={{ lineHeight: "24px" }}>
              {hour.toString().padStart(2, "0")}:00
            </div>
            {rowCells.map(({ day, cell, excluded }) => {
              const style = heatmapStyle(cell?.avgEngagementScore ?? null, cell?.confidence ?? 0, excluded);
              return (
                <div
                  key={day}
                  className="h-6 w-8 flex-shrink-0 cursor-pointer rounded-sm transition-transform duration-100 hover:scale-110"
                  style={style}
                  title={
                    excluded
                      ? `Day: ${DAY_NAMES[day]}, Hour: ${hour}:00\nInsufficient data (${cell?.sampleSize ?? 0} samples)`
                      : `Day: ${DAY_NAMES[day]}, Hour: ${hour}:00\nAvg Score: ${cell?.avgEngagementScore?.toFixed(1) ?? "N/A"}\nSamples: ${cell?.sampleSize}\nConfidence: ${(cell?.confidence ?? 0 * 100).toFixed(0)}%`
                  }
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-text-faint">
        <span>Low</span>
        <div className="flex gap-px">
          <div className="h-3 w-5 rounded-sm" style={{ background: "var(--color-error)" }} />
          <div className="h-3 w-5 rounded-sm" style={{ background: "var(--color-warning)" }} />
          <div className="h-3 w-5 rounded-sm" style={{ background: "var(--color-success)" }} />
        </div>
        <span>High</span>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm" style={{ background: "var(--color-success)", opacity: 0.5 }} />
          <span>Low confidence</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm" style={{ background: "var(--color-border)", opacity: 0.4 }} />
          <span>Excluded</span>
        </div>
      </div>
    </div>
  );
}

function PostList({ posts, title, isTop }: { posts: AnalyticsPost[]; title: string; isTop: boolean }) {
  if (posts.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-[15px] font-semibold text-text">{title}</h3>
      <div className="flex flex-col gap-2">
        {posts.map((post, idx) => {
          const score = post.compositeScore ?? post.engagementScore;
          const scoreCls = score != null && score >= 70
            ? "bg-success-soft text-success"
            : score != null && score >= 40
              ? "bg-warning-soft text-warning"
              : "bg-error-soft text-error";
          return (
            <div key={post.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:bg-surface-hover">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-hover text-[12px] font-bold text-text-dim">
                {isTop ? idx + 1 : posts.length - idx}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-text" style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {post.contentText
                    ? post.contentText.length > 120
                      ? post.contentText.slice(0, 120) + "..."
                      : post.contentText
                    : "(No text)"}
                </p>
                <div className="mt-1 flex gap-2 text-[11px] text-text-faint">
                  <span>{post.platform}/{post.authorHandle}</span>
                  {post.publishedAt && (
                    <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0">
                <span className={"inline-block rounded-full px-2.5 py-1 text-[12px] font-bold " + scoreCls}>
                  {post.compositeScore?.toFixed(1) ?? post.engagementScore?.toFixed(1) ?? "N/A"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountSelector({
  accounts,
  selectedAccountId,
  onChange,
}: {
  accounts: Account[];
  selectedAccountId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-text-dim">
      <label htmlFor="analytics-account">Account:</label>
      <select id="analytics-account" value={selectedAccountId} onChange={(e) => onChange(e.target.value)}>
        <option value="">All Accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.platform}/{a.handle}</option>
        ))}
      </select>
    </div>
  );
}

function SummaryCards({ data }: { data: AnalyticsData }) {
  const validTrendPoints = data.trendData.filter((d) => d.avgScore != null);
  const avgScore =
    validTrendPoints.length > 0
      ? validTrendPoints.reduce((sum, d) => sum + (d.avgScore ?? 0), 0) / validTrendPoints.length
      : null;

  const cards = [
    { label: "Total Posts", value: String(data.totalPosts) },
    { label: "Avg Score", value: avgScore !== null ? avgScore.toFixed(1) : "N/A" },
    { label: "Top Post Score", value: data.topPosts[0]?.compositeScore?.toFixed(1) ?? "N/A" },
    { label: "Days Analyzed", value: String(data.trendData.length) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-[12px] font-medium text-text-dim">{c.label}</h3>
          <div className="mt-1 font-mono text-2xl font-bold text-text">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsView() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [heatmapCells, setHeatmapCells] = useState<HeatmapCellData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (accountId: string) => {
    setLoading(true);
    setError(null);
    try {
      const bridge = getBridge();
      if (!bridge) {
        setError("Dashboard bridge not available");
        setLoading(false);
        return;
      }

      const params = accountId ? { accountId } : undefined;
      const [accountsData, analytics, heatmap] = await Promise.all([
        bridge.getAccounts(),
        bridge.getAnalytics(params),
        bridge.getHeatmap(params),
      ]);

      setAccounts(accountsData);
      setAnalyticsData(analytics as AnalyticsData);
      setHeatmapCells(heatmap as HeatmapCellData[]);
    } catch (err: any) {
      setError(err.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(selectedAccountId);
  }, [selectedAccountId, loadData]);

  const handleAccountChange = useCallback((id: string) => {
    setSelectedAccountId(id);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
        <div className="mt-10 flex flex-col items-center gap-3 text-text-dim">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-[13px]">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
        <div className="mt-10 rounded-lg border border-error/30 bg-error-soft p-4 text-[13px] text-error">
          {error}
        </div>
      </div>
    );
  }

  if (analyticsData === null || analyticsData.totalPosts === 0) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
        <div className="mt-10 flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[17px] font-medium text-text">No posts captured yet</p>
          <p className="mt-1.5 max-w-md text-[13px] text-text-dim">
            Add an account to start capturing posts. Analytics will become available once you have captured posts with engagement data.
          </p>
        </div>
      </div>
    );
  }

  if (analyticsData.totalPosts < MIN_ANALYTICS_POSTS) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
        <div className="mt-10 flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[17px] font-medium text-text">Insufficient data</p>
          <p className="mt-1.5 max-w-md text-[13px] text-text-dim">
            At least {MIN_ANALYTICS_POSTS} posts with engagement data are needed for meaningful analytics. Currently have {analyticsData.totalPosts} post{analyticsData.totalPosts !== 1 ? "s" : ""}. Continue capturing to see trends, heatmap, and performance insights.
          </p>
        </div>
      </div>
    );
  }

  const hasTrendData = analyticsData.trendData.some((d) => d.avgScore != null);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
        <AccountSelector
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onChange={handleAccountChange}
        />
      </div>

      {/* Summary cards */}
      <SummaryCards data={analyticsData} />

      {/* Trend Lines */}
      <div>
        <h3 className="mb-3 text-[15px] font-semibold text-text">Engagement Trend</h3>
        {hasTrendData ? (
          <TrendLines data={analyticsData.trendData} />
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-[13px] text-text-dim">
            No scored posts available. Scores are computed as engagement data is captured.
          </div>
        )}
      </div>

      {/* Heatmap */}
      <div>
        {heatmapCells.length > 0 ? (
          <TimingHeatmap cells={heatmapCells} />
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
            <h3 className="text-[14px] font-semibold text-text">Timing Heatmap</h3>
            <p className="mt-1.5 text-[13px] text-text-dim">
              Not enough timing data yet. The heatmap will show optimal posting times once sufficient posts with engagement data have been captured across different hours and days.
            </p>
          </div>
        )}
      </div>

      {/* Top / Bottom Posts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {analyticsData.topPosts.length > 0 && (
          <PostList posts={analyticsData.topPosts} title="Top Performing Posts" isTop={true} />
        )}
        {analyticsData.bottomPosts.length > 0 && (
          <PostList posts={analyticsData.bottomPosts} title="Bottom Performing Posts" isTop={false} />
        )}
      </div>
    </div>
  );
}
