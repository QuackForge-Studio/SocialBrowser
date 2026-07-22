/**
 * TabLruManager
 *
 * Manages LRU eviction policy for social platform renderer views (WebContentsView).
 * Keeps top N most recently used tabs "HOT" in memory, while transitioning inactive
 * tabs (> coldInactivityMs or exceeding maxHotTabs limit) to "COLD" (state saved,
 * renderer destroyed to free RAM).
 */

export type TabLifecycleState = 'HOT' | 'COLD';

export interface TabLruRecord {
  tabId: string;
  groupId: string;
  platform: string;
  accountId: string;
  state: TabLifecycleState;
  lastAccessedAt: number;
  savedUrl: string;
  isPinned?: boolean;
}

export interface TabLruManagerOptions {
  maxHotTabs?: number;
  coldInactivityMs?: number;
}

export class TabLruManager {
  private readonly records: Map<string, TabLruRecord> = new Map();
  private readonly maxHotTabs: number;
  private readonly coldInactivityMs: number;

  constructor(options: TabLruManagerOptions = {}) {
    this.maxHotTabs = options.maxHotTabs ?? 4;
    this.coldInactivityMs = options.coldInactivityMs ?? 8 * 60 * 1000; // 8 minutes
  }

  /**
   * Register or update a tab in the LRU tracker.
   */
  registerTab(info: {
    tabId: string;
    groupId: string;
    platform: string;
    accountId: string;
    savedUrl: string;
    state?: TabLifecycleState;
    isPinned?: boolean;
  }): void {
    const existing = this.records.get(info.tabId);
    if (existing) {
      existing.lastAccessedAt = Date.now();
      existing.savedUrl = info.savedUrl || existing.savedUrl;
      if (info.state) existing.state = info.state;
      if (info.isPinned !== undefined) existing.isPinned = info.isPinned;
    } else {
      this.records.set(info.tabId, {
        tabId: info.tabId,
        groupId: info.groupId,
        platform: info.platform,
        accountId: info.accountId,
        state: info.state ?? 'HOT',
        lastAccessedAt: Date.now(),
        savedUrl: info.savedUrl,
        isPinned: info.isPinned ?? false,
      });
    }
  }

  /**
   * Update the access timestamp and optional URL for a tab.
   */
  touchTab(tabId: string, currentUrl?: string): void {
    const record = this.records.get(tabId);
    if (!record) return;
    record.lastAccessedAt = Date.now();
    if (currentUrl) {
      record.savedUrl = currentUrl;
    }
  }

  /**
   * Update saved URL for a tab.
   */
  updateSavedUrl(tabId: string, url: string): void {
    const record = this.records.get(tabId);
    if (record) {
      record.savedUrl = url;
    }
  }

  /**
   * Remove a tab from LRU tracking upon tab closure.
   */
  unregisterTab(tabId: string): void {
    this.records.delete(tabId);
  }

  /**
   * Check if a tab is pinned (preventing automatic cold eviction).
   */
  setPinned(tabId: string, pinned: boolean): void {
    const record = this.records.get(tabId);
    if (record) {
      record.isPinned = pinned;
    }
  }

  /**
   * Get record for a tab.
   */
  getRecord(tabId: string): TabLruRecord | undefined {
    return this.records.get(tabId);
  }

  /**
   * Determine which HOT tabs should be evicted to COLD state.
   * Active tab or pinned tabs are never evicted.
   */
  getEvictionCandidates(activeTabIds: Set<string>): string[] {
    const now = Date.now();
    const hotRecords: TabLruRecord[] = [];

    for (const record of this.records.values()) {
      if (record.state === 'HOT') {
        hotRecords.push(record);
      }
    }

    // Sort hot tabs ascending by lastAccessedAt (oldest first)
    hotRecords.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    const candidates: string[] = [];

    for (const record of hotRecords) {
      // Never evict active tab or pinned tab
      if (activeTabIds.has(record.tabId) || record.isPinned) {
        continue;
      }

      // Check inactivity threshold
      const isInactiveTooLong = now - record.lastAccessedAt > this.coldInactivityMs;
      // Check max HOT tab count limit
      const currentHotCount = hotRecords.length - candidates.length;
      const exceedsMaxHot = currentHotCount > this.maxHotTabs;

      if (isInactiveTooLong || exceedsMaxHot) {
        candidates.push(record.tabId);
      }
    }

    return candidates;
  }

  /**
   * Mark tab state as COLD.
   */
  markCold(tabId: string): void {
    const record = this.records.get(tabId);
    if (record) {
      record.state = 'COLD';
    }
  }

  /**
   * Mark tab state as HOT.
   */
  markHot(tabId: string): void {
    const record = this.records.get(tabId);
    if (record) {
      record.state = 'HOT';
      record.lastAccessedAt = Date.now();
    }
  }

  /**
   * Get all registered records.
   */
  getAllRecords(): TabLruRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.records.clear();
  }
}
