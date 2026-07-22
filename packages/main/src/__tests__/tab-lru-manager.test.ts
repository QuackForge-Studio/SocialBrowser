import { describe, it, expect, beforeEach } from 'vitest';
import { TabLruManager } from '../tab-lru-manager';

describe('TabLruManager', () => {
  let lru: TabLruManager;

  beforeEach(() => {
    lru = new TabLruManager({ maxHotTabs: 3, coldInactivityMs: 1000 });
  });

  it('registers and tracks tab lifecycle states correctly', () => {
    lru.registerTab({
      tabId: 'runtime:g1:x:acc1',
      groupId: 'g1',
      platform: 'x',
      accountId: 'acc1',
      savedUrl: 'https://x.com/home',
    });

    const record = lru.getRecord('runtime:g1:x:acc1');
    expect(record).toBeDefined();
    expect(record?.state).toBe('HOT');
    expect(record?.savedUrl).toBe('https://x.com/home');
  });

  it('evicts oldest inactive HOT tabs when exceeding maxHotTabs limit', () => {
    lru.registerTab({ tabId: 'tab1', groupId: 'g1', platform: 'x', accountId: 'a1', savedUrl: 'url1' });
    lru.registerTab({ tabId: 'tab2', groupId: 'g1', platform: 'x', accountId: 'a2', savedUrl: 'url2' });
    lru.registerTab({ tabId: 'tab3', groupId: 'g1', platform: 'x', accountId: 'a3', savedUrl: 'url3' });
    lru.registerTab({ tabId: 'tab4', groupId: 'g1', platform: 'x', accountId: 'a4', savedUrl: 'url4' });

    // Touch tab4 to make it most recent
    lru.touchTab('tab4');

    const activeSet = new Set(['tab4']); // tab4 is active
    const candidates = lru.getEvictionCandidates(activeSet);

    // Should evict 1 candidate (since maxHotTabs is 3 and we have 4 tabs)
    expect(candidates.length).toBe(1);
    expect(candidates[0]).toBe('tab1'); // tab1 is oldest
  });

  it('never evicts currently active tabs or pinned tabs', () => {
    lru.registerTab({ tabId: 'tab1', groupId: 'g1', platform: 'x', accountId: 'a1', savedUrl: 'url1' });
    lru.registerTab({ tabId: 'tab2', groupId: 'g1', platform: 'x', accountId: 'a2', savedUrl: 'url2' });
    lru.registerTab({ tabId: 'tab3', groupId: 'g1', platform: 'x', accountId: 'a3', savedUrl: 'url3' });
    lru.registerTab({ tabId: 'tab4', groupId: 'g1', platform: 'x', accountId: 'a4', savedUrl: 'url4' });

    lru.setPinned('tab1', true);

    const activeSet = new Set(['tab1', 'tab2']);
    const candidates = lru.getEvictionCandidates(activeSet);

    expect(candidates).not.toContain('tab1');
    expect(candidates).not.toContain('tab2');
  });

  it('updates saved URL and transitions state between HOT and COLD', () => {
    lru.registerTab({ tabId: 'tab1', groupId: 'g1', platform: 'x', accountId: 'a1', savedUrl: 'https://x.com' });
    lru.updateSavedUrl('tab1', 'https://x.com/notifications');

    expect(lru.getRecord('tab1')?.savedUrl).toBe('https://x.com/notifications');

    lru.markCold('tab1');
    expect(lru.getRecord('tab1')?.state).toBe('COLD');

    lru.markHot('tab1');
    expect(lru.getRecord('tab1')?.state).toBe('HOT');
  });
});
