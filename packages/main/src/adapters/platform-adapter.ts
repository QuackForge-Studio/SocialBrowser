/**
 * PlatformAdapter Interface & Types
 *
 * Defines the contract for all social platform adapters.
 * Each adapter handles ownership detection, content extraction,
 * and engagement metrics for a specific platform.
 */

export type OwnershipStatus = "owned" | "not-owned" | "unknown";

export interface OwnershipResult {
  status: OwnershipStatus;
}

export interface NormalizedPost {
  platformPostId: string;
  contentText?: string;
  mediaRefs?: string;
  authorHandle?: string;
  publishedAt?: string;
}

export interface EngagementMetrics {
  views?: number;
  likes?: number;
  commentsCount?: number;
  shares?: number;
}

export interface CommentData {
  platformCommentId?: string;
  authorHandle?: string;
  text?: string;
}

export interface AdapterInfo {
  platform: string;
  accountId: string;
  adapterVersion: number;
}

export interface PlatformAdapter {
  readonly platform: string;
  readonly version: number;
  readonly contentSelectors: string[];
  readonly composeSelector: string;
  detectOwnership(node: Element, accountHandle: string): OwnershipResult;
  extractPost(node: Element): NormalizedPost | null;
  extractEngagementSnapshot(node: Element): EngagementMetrics | null;
  extractComments(node: Element): CommentData[];
}
