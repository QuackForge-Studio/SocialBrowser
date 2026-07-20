import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockFlushStore,
  mockSession,
} = vi.hoisted(() => {
  const mockFlushStore = vi.fn().mockResolvedValue(undefined);
  const mockSession = {
    cookies: { flushStore: mockFlushStore }, setPermissionRequestHandler: vi.fn(), on: vi.fn(),
  };

  return {
    mockFlushStore,
    mockSession,
  };
});

vi.mock('electron', () => ({
  session: { fromPartition: vi.fn().mockReturnValue(mockSession) },
}));

import { SessionManager } from '../session-manager';

describe('Graceful Shutdown', () => {
  let manager: SessionManager;
  beforeEach(() => { vi.clearAllMocks(); manager = new SessionManager(); });

  it('should flush cookies for all partitions on shutdown', async () => {
    manager.getOrCreateSession('x', 'a1');
    manager.getOrCreateSession('instagram', 'a2');
    manager.getOrCreateSession('facebook', 'a3');
    await manager.flushAllCookies();
    expect(mockFlushStore).toHaveBeenCalledTimes(3);
  });

  it('should not error when flushing with no sessions', async () => {
    await expect(manager.flushAllCookies()).resolves.toBeUndefined();
  });

  it('should complete all flushes even if some fail', async () => {
    mockFlushStore.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);
    manager.getOrCreateSession('x', 'a1');
    manager.getOrCreateSession('threads', 'a2');
    manager.getOrCreateSession('facebook', 'a3');
    await manager.flushAllCookies();
    expect(mockFlushStore).toHaveBeenCalledTimes(3);
  });

  it('should use persist: prefix for durable cookie storage', () => {
    const p = manager.buildPartition('x', 'u1');
    expect(p).toMatch(/^persist:/);
  });

  it('should clean up via dispose without errors', () => {
    manager.getOrCreateSession('x', 'a1');
    manager.getOrCreateSession('threads', 'a2');
    expect(() => manager.dispose()).not.toThrow();
    expect(manager.getSessionCount()).toBe(0);
  });
});