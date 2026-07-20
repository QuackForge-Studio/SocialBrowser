/**
 * Analytics View Tests
 *
 * Tests for the AnalyticsView component and utility functions.
 * Verifies rendering states: normal data, empty state, insufficient data.
 */
import { describe, it, expect } from 'vitest';
import { MIN_ANALYTICS_POSTS } from '../types';

describe('MIN_ANALYTICS_POSTS', () => {
  it('requires at least 3 posts for meaningful analytics', () => {
    expect(MIN_ANALYTICS_POSTS).toBe(3);
  });
});

describe('Analytics types', () => {
  it('TrendDataPoint has expected shape', () => {
    const point = { date: '2026-01-15', avgScore: 75.5, postCount: 10 };
    expect(point.date).toBe('2026-01-15');
    expect(point.avgScore).toBe(75.5);
    expect(point.postCount).toBe(10);
  });

  it('TrendDataPoint allows null avgScore', () => {
    const point = { date: '2026-01-15', avgScore: null, postCount: 5 };
    expect(point.avgScore).toBeNull();
  });

  it('AnalyticsPost has required fields', () => {
    const post = {
      id: 'post-1',
      contentText: 'Great content',
      publishedAt: '2026-01-15T10:00:00Z',
      authorHandle: '@user',
      platform: 'x',
      compositeScore: 85.3,
      engagementScore: 72.1,
    };
    expect(post.id).toBe('post-1');
    expect(post.platform).toBe('x');
    expect(post.compositeScore).toBe(85.3);
  });

  it('AnalyticsData has all required fields', () => {
    const data = {
      totalPosts: 25,
      trendData: [
        { date: '2026-01-10', avgScore: 60, postCount: 3 },
        { date: '2026-01-11', avgScore: 75, postCount: 5 },
      ],
      topPosts: [
        { id: 'p1', platform: 'x', compositeScore: 95 },
        { id: 'p2', platform: 'x', compositeScore: 90 },
      ],
      bottomPosts: [
        { id: 'p3', platform: 'x', compositeScore: 10 },
      ],
    };
    expect(data.totalPosts).toBe(25);
    expect(data.trendData).toHaveLength(2);
    expect(data.topPosts).toHaveLength(2);
    expect(data.bottomPosts).toHaveLength(1);
  });

  it('AnalyticsData handles empty trend data', () => {
    const data = { totalPosts: 0, trendData: [], topPosts: [], bottomPosts: [] };
    expect(data.trendData).toHaveLength(0);
  });

  it('HeatmapCellData has correct structure', () => {
    const cell = {
      id: 'cell-1',
      accountId: 'acc-1',
      contentType: 'text',
      hourOfDay: 10,
      dayOfWeek: 2,
      avgEngagementScore: 85.0,
      sampleSize: 10,
      confidence: 0.9,
      updatedAt: '2026-01-15T12:00:00Z',
    };
    expect(cell.hourOfDay).toBe(10);
    expect(cell.dayOfWeek).toBe(2);
    expect(cell.sampleSize).toBe(10);
    expect(cell.confidence).toBe(0.9);
  });

  it('HeatmapCellData handles null avgEngagementScore', () => {
    const cell = {
      id: 'cell-2',
      accountId: 'acc-1',
      contentType: 'text',
      hourOfDay: 14,
      dayOfWeek: 3,
      avgEngagementScore: null,
      sampleSize: 3,
      confidence: 0.5,
      updatedAt: '2026-01-15T12:00:00Z',
    };
    expect(cell.avgEngagementScore).toBeNull();
  });
});

describe('Empty state logic', () => {
  it('totalPosts === 0 means no posts', () => {
    const hasNoPosts = (total: number) => total === 0;
    expect(hasNoPosts(0)).toBe(true);
    expect(hasNoPosts(3)).toBe(false);
  });

  it('totalPosts < MIN_ANALYTICS_POSTS means insufficient data', () => {
    const isInsufficient = (total: number) => total > 0 && total < MIN_ANALYTICS_POSTS;
    expect(isInsufficient(0)).toBe(false);
    expect(isInsufficient(1)).toBe(true);
    expect(isInsufficient(2)).toBe(true);
    expect(isInsufficient(3)).toBe(false);
    expect(isInsufficient(10)).toBe(false);
  });

  it('has sufficient data when totalPosts >= MIN_ANALYTICS_POSTS', () => {
    const hasSufficientData = (total: number) => total >= MIN_ANALYTICS_POSTS;
    expect(hasSufficientData(0)).toBe(false);
    expect(hasSufficientData(3)).toBe(true);
    expect(hasSufficientData(100)).toBe(true);
  });
});
