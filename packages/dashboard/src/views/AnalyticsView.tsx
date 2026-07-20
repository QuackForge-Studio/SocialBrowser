import React, { useState, useEffect, useCallback } from 'react';
import type { Account, TrendDataPoint, AnalyticsPost, HeatmapCellData, AnalyticsData, DashboardBridge } from '../types';
import { MIN_ANALYTICS_POSTS } from '../types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MIN_SAMPLES_CONFIDENCE = 5;

function getBridge(): DashboardBridge | undefined {
  return window.__socialBrowserDashboard;
}

// ====== Utility: Color helpers ======

function scoreToColor(score: number | null | undefined): string {
  if (score == null) return '#444';
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped >= 70) return '#4caf50';
  if (clamped >= 40) return '#ff9800';
  return '#e94560';
}

function heatmapCellStyle(value: number | null, confidence: number, excluded: boolean): React.CSSProperties {
  if (excluded || value == null) {
    return { backgroundColor: '#2a2a3a', opacity: 0.5 };
  }
  const baseColor = scoreToColor(value);
  const opacity = Math.max(0.15, Math.min(1, confidence * 0.85 + 0.15));
  return { backgroundColor: baseColor, opacity };
}

// ====== Trend Lines Chart (SVG) ======

function TrendLines({ data }: { data: TrendDataPoint[] }) {
  if (data.length === 0) return <div className="insight-empty">No trend data available.</div>;

  const width = 600;
  const height = 200;
  const padding = { top: 10, right: 10, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const scores = data.map(d => d.avgScore).filter((s): s is number => s !== null);
  if (scores.length === 0) return <div className="insight-empty">No scored posts for trend analysis.</div>;

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
    .join(' ');

  const yTicks = 5;
  const yTickLabels: number[] = [];
  for (let i = 0; i <= yTicks; i++) {
    yTickLabels.push(minScore + (scoreRange * i) / yTicks);
  }

  const xLabelInterval = Math.max(1, Math.floor(data.length / 8));

  return (
    <div className="chart-container">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* Y-axis grid lines and labels */}
        {yTickLabels.map((val, i) => {
          const y = padding.top + chartH - ((val - minScore) / scoreRange) * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#2a2a4a" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" fill="#a0a0b8" fontSize={10}>
                {val.toFixed(0)}
              </text>
            </g>
          );
        })}
        {/* Trend line */}
        {points && <polyline points={points} fill="none" stroke="#e94560" strokeWidth={2} />}
        {/* Data dots */}
        {data.map((d, i) => {
          if (d.avgScore == null) return null;
          const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
          const y = padding.top + chartH - ((d.avgScore - minScore) / scoreRange) * chartH;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={3} fill="#e94560" />
              <title>{`Date: ${d.date}\nScore: ${d.avgScore.toFixed(1)}\nPosts: ${d.postCount}`}</title>
            </g>
          );
        })}
        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % xLabelInterval !== 0) return null;
          const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
          const label = d.date.length > 10 ? d.date.slice(5, 10) : d.date;
          return (
            <text key={i} x={x} y={height - 4} textAnchor="middle" fill="#a0a0b8" fontSize={10}>
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ====== Heatmap ======

function TimingHeatmap({ cells }: { cells: HeatmapCellData[] }) {
  const [sortBy, setSortBy] = useState<'hour' | 'confidence'>('hour');

  const cellMap = new Map<string, HeatmapCellData>();
  for (const cell of cells) {
    cellMap.set(`${cell.hourOfDay}:${cell.dayOfWeek}`, cell);
  }

  // Determine if a cell is excluded (insufficient data)
  const isExcluded = (hour: number, day: number): boolean => {
    const cell = cellMap.get(`${hour}:${day}`);
    return !cell || cell.sampleSize < MIN_SAMPLES_CONFIDENCE;
  };

  const getCellValue = (hour: number, day: number): HeatmapCellData | undefined => {
    return cellMap.get(`${hour}:${day}`);
  };

  // Compute row order
  const hours: number[] = [];
  for (let h = 0; h < 24; h++) hours.push(h);

  // Create rows sorted by confidence if requested
  const rowData = hours.map(hour => {
    const cellsForHour = Array.from({ length: 7 }, (_, day) => ({
      hour,
      day,
      cell: getCellValue(hour, day),
      excluded: isExcluded(hour, day),
    }));
    const avgConfidence = cellsForHour.reduce((sum, c) => sum + (c.cell?.confidence ?? 0), 0) / 7;
    return { hour, cells: cellsForHour, avgConfidence };
  });

  if (sortBy === 'confidence') {
    rowData.sort((a, b) => a.avgConfidence - b.avgConfidence);
  }

  return (
    <div className="heatmap-container">
      <div className="heatmap-controls">
        <span className="heatmap-label">Timing Heatmap (hour × day)</span>
        <select
          className="heatmap-sort"
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'hour' | 'confidence')}
        >
          <option value="hour">Sort by Hour</option>
          <option value="confidence">Sort by Confidence</option>
        </select>
      </div>
      <div className="heatmap-grid-wrapper">
        {/* Column headers */}
        <div className="heatmap-header-row">
          <div className="heatmap-corner"></div>
          {DAY_NAMES.map(day => (
            <div key={day} className="heatmap-col-header">{day}</div>
          ))}
        </div>
        {/* Rows */}
        {rowData.map(({ hour, cells: rowCells }) => (
          <div key={hour} className="heatmap-row">
            <div className="heatmap-row-label">{hour.toString().padStart(2, '0')}:00</div>
            {rowCells.map(({ day, cell, excluded }) => {
              const style = heatmapCellStyle(cell?.avgEngagementScore ?? null, cell?.confidence ?? 0, excluded);
              return (
                <div
                  key={day}
                  className={`heatmap-cell${excluded ? ' excluded' : ''}`}
                  style={style}
                  title={
                    excluded
                      ? `Day: ${DAY_NAMES[day]}, Hour: ${hour}:00\nInsufficient data (${cell?.sampleSize ?? 0} samples)`
                      : `Day: ${DAY_NAMES[day]}, Hour: ${hour}:00\nAvg Score: ${cell?.avgEngagementScore?.toFixed(1) ?? 'N/A'}\nSamples: ${cell?.sampleSize}\nConfidence: ${(cell?.confidence ?? 0 * 100).toFixed(0)}%`
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="heatmap-legend">
        <div className="legend-label">Low</div>
        <div className="legend-gradient">
          <div className="legend-color" style={{ background: '#e94560' }}></div>
          <div className="legend-color" style={{ background: '#ff9800' }}></div>
          <div className="legend-color" style={{ background: '#4caf50' }}></div>
        </div>
        <div className="legend-label">High</div>
        <div className="legend-divider"></div>
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: '#4caf50', opacity: 0.5 }}></div>
          <span>Low confidence</span>
        </div>
        <div className="legend-item">
          <div className="legend-swatch excluded-swatch"></div>
          <span>Excluded</span>
        </div>
      </div>
    </div>
  );
}

// ====== Top / Bottom Posts ======

function PostList({ posts, title, isTop }: { posts: AnalyticsPost[]; title: string; isTop: boolean }) {
  if (posts.length === 0) return null;

  return (
    <div className="post-list-container">
      <h3 className="post-list-title">{title}</h3>
      <div className="post-list">
        {posts.map((post, idx) => (
          <div key={post.id} className="post-list-item">
            <div className="post-list-rank">{isTop ? `#${idx + 1}` : `#${posts.length - idx}`}</div>
            <div className="post-list-content">
              <div className="post-list-text">
                {post.contentText
                  ? post.contentText.length > 120
                    ? post.contentText.slice(0, 120) + '...'
                    : post.contentText
                  : '(No text)'}
              </div>
              <div className="post-list-meta">
                <span className="post-list-platform">{post.platform}/{post.authorHandle}</span>
                {post.publishedAt && (
                  <span className="post-list-date">{new Date(post.publishedAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
            <div className="post-list-score">
              <div className={`score-badge ${isTop ? 'score-high' : 'score-low'}`}>
                {post.compositeScore?.toFixed(1) ?? post.engagementScore?.toFixed(1) ?? 'N/A'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ====== Account Selector ======

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
    <div className="account-selector">
      <label>Account: </label>
      <select value={selectedAccountId} onChange={e => onChange(e.target.value)}>
        <option value="">All Accounts</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>
            {a.platform}/{a.handle}
          </option>
        ))}
      </select>
    </div>
  );
}

// ====== Summary Cards ======

function SummaryCards({ data }: { data: AnalyticsData }) {
  const validTrendPoints = data.trendData.filter(d => d.avgScore != null);
  const avgScore =
    validTrendPoints.length > 0
      ? validTrendPoints.reduce((sum, d) => sum + (d.avgScore ?? 0), 0) / validTrendPoints.length
      : null;

  return (
    <div className="analytics-summary">
      <div className="dashboard-card">
        <h3>Total Posts</h3>
        <div className="value">{data.totalPosts}</div>
      </div>
      <div className="dashboard-card">
        <h3>Avg Score</h3>
        <div className="value">{avgScore !== null ? avgScore.toFixed(1) : 'N/A'}</div>
      </div>
      <div className="dashboard-card">
        <h3>Top Post Score</h3>
        <div className="value">{data.topPosts[0]?.compositeScore?.toFixed(1) ?? 'N/A'}</div>
      </div>
      <div className="dashboard-card">
        <h3>Days Analyzed</h3>
        <div className="value">{data.trendData.length}</div>
      </div>
    </div>
  );
}

// ====== Main AnalyticsView ======

export function AnalyticsView() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
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
        setError('Dashboard bridge not available');
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
      setError(err.message || 'Failed to load analytics data');
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

  // Loading state
  if (loading) {
    return (
      <div>
        <h2>Analytics</h2>
        <div className="loading-state" style={{ marginTop: 40, textAlign: 'center' }}>
          <div className="spinner"></div>
          <p>Loading analytics data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div>
        <h2>Analytics</h2>
        <div className="error-state" style={{ marginTop: 40 }}>
          <p style={{ color: '#e94560' }}>{error}</p>
        </div>
      </div>
    );
  }

  // Empty state: no posts at all
  if (analyticsData === null || analyticsData.totalPosts === 0) {
    return (
      <div>
        <h2>Analytics</h2>
        <div className="empty-state" style={{ marginTop: 40 }}>
          <h2>No posts captured yet</h2>
          <p>
            Add an account to start capturing posts. Analytics will become available once you
            have captured posts with engagement data.
          </p>
        </div>
      </div>
    );
  }

  // Insufficient data state: less than minimum posts
  if (analyticsData.totalPosts < MIN_ANALYTICS_POSTS) {
    return (
      <div>
        <h2>Analytics</h2>
        <div className="empty-state" style={{ marginTop: 40 }}>
          <h2>Insufficient data</h2>
          <p>
            At least {MIN_ANALYTICS_POSTS} posts with engagement data are needed for meaningful
            analytics. Currently have {analyticsData.totalPosts} post{analyticsData.totalPosts !== 1 ? 's' : ''}.
            Continue capturing to see trends, heatmap, and performance insights.
          </p>
        </div>
      </div>
    );
  }

  // Some data loaded but no scored posts for trend
  const hasTrendData = analyticsData.trendData.some(d => d.avgScore != null);

  return (
    <div className="analytics-view">
      <div className="analytics-header">
        <h2>Analytics</h2>
        <AccountSelector
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onChange={handleAccountChange}
        />
      </div>

      {/* Summary cards */}
      <SummaryCards data={analyticsData} />

      {/* Trend Lines */}
      <div className="analytics-section">
        <h3>Engagement Trend</h3>
        {hasTrendData ? (
          <TrendLines data={analyticsData.trendData} />
        ) : (
          <div className="insight-empty">
            No scored posts available. Scores are computed as engagement data is captured.
          </div>
        )}
      </div>

      {/* Heatmap */}
      <div className="analytics-section">
        {heatmapCells.length > 0 ? (
          <TimingHeatmap cells={heatmapCells} />
        ) : (
          <div className="insight-empty">
            <h3>Timing Heatmap</h3>
            <p>
              Not enough timing data yet. The heatmap will show optimal posting times once
              sufficient posts with engagement data have been captured across different hours
              and days.
            </p>
          </div>
        )}
      </div>

      {/* Top / Bottom Posts */}
      <div className="analytics-posts-grid">
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
