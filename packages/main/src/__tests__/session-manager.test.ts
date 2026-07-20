import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted() so mock variables are available when the factory runs
const {
  mockFlushStore,
  mockSetPermissionRequestHandler,
  mockSessionOn,
  mockWcOn,
  mockSetWindowOpenHandler,
  mockSession,
} = vi.hoisted(() => {
  const mockFlushStore = vi.fn().mockResolvedValue(undefined);
  const mockSetPermissionRequestHandler = vi.fn();
  const mockSessionOn = vi.fn();
  const mockWcOn = vi.fn();
  const mockSetWindowOpenHandler = vi.fn();

  const mockSession = {
    cookies: { flushStore: mockFlushStore },
    setPermissionRequestHandler: mockSetPermissionRequestHandler,
    on: mockSessionOn,
  };

  return {
    mockFlushStore,
    mockSetPermissionRequestHandler,
    mockSessionOn,
    mockWcOn,
    mockSetWindowOpenHandler,
    mockSession,
  };
});

vi.mock('electron', () => ({
  session: {
    fromPartition: vi.fn().mockReturnValue(mockSession),
  },
}));

// Import after mocking
import { session as electronSession } from 'electron';
import { SessionManager, PLATFORM_DOMAINS } from '../session-manager';
import type { Platform } from '../session-manager';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SessionManager();
  });

  describe('buildPartition', () => {
    it('should return persist:social-browser:x:<uuid> format', () => {
      const partition = manager.buildPartition('x', '550e8400-e29b-41d4-a716-446655440000');
      expect(partition).toBe('persist:social-browser:x:550e8400-e29b-41d4-a716-446655440000');
    });

    it('should include platform in partition string (VAL-FOUND-064)', () => {
      const xPartition = manager.buildPartition('x', 'uuid-1');
      const threadsPartition = manager.buildPartition('threads', 'uuid-1');
      expect(xPartition).toContain(':x:');
      expect(threadsPartition).toContain(':threads:');
      expect(xPartition).not.toBe(threadsPartition);
    });
  });

  describe('generateAccountId', () => {
    it('should generate a valid UUID v4 (VAL-FOUND-062)', () => {
      const id = manager.generateAccountId();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidV4Regex);
    });

    it('should generate unique IDs on successive calls', () => {
      const id1 = manager.generateAccountId();
      const id2 = manager.generateAccountId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('getOrCreateSession', () => {
    it('should create a session and return it (VAL-FOUND-061)', () => {
      const mockSessionForImport = electronSession;
      const accountSession = manager.getOrCreateSession('x', 'uuid-1');

      expect(accountSession.platform).toBe('x');
      expect(accountSession.accountId).toBe('uuid-1');
      expect(accountSession.partition).toBe('persist:social-browser:x:uuid-1');
      expect(mockSessionForImport.fromPartition).toHaveBeenCalledWith(
        'persist:social-browser:x:uuid-1'
      );
    });

    it('should return same session for same (platform, accountId) (VAL-FOUND-065)', () => {
      const accountSession1 = manager.getOrCreateSession('x', 'uuid-1');
      const accountSession2 = manager.getOrCreateSession('x', 'uuid-1');

      expect(accountSession1).toBe(accountSession2);
      // fromPartition should only be called once
      const mockSessionForImport = electronSession;
      expect(mockSessionForImport.fromPartition).toHaveBeenCalledTimes(1);
    });

    it('should create different sessions for different accounts (VAL-FOUND-063)', () => {
      const session1 = manager.getOrCreateSession('x', 'uuid-1');
      const session2 = manager.getOrCreateSession('x', 'uuid-2');

      expect(session1.partition).not.toBe(session2.partition);
      expect(session1.accountId).not.toBe(session2.accountId);
    });

    it('should create different sessions for different platforms (VAL-FOUND-064)', () => {
      const xSession = manager.getOrCreateSession('x', 'uuid-1');
      const threadsSession = manager.getOrCreateSession('threads', 'uuid-1');

      expect(xSession.partition).not.toBe(threadsSession.partition);
      expect(xSession.platform).not.toBe(threadsSession.platform);
      expect(xSession.partition).toContain(':x:');
      expect(threadsSession.partition).toContain(':threads:');
    });
  });

  describe('getSession', () => {
    it('should return undefined for non-existent session', () => {
      const result = manager.getSession('x', 'non-existent');
      expect(result).toBeUndefined();
    });

    it('should return existing session without creating new one', () => {
      manager.getOrCreateSession('x', 'uuid-1');
      const result = manager.getSession('x', 'uuid-1');
      expect(result).toBeDefined();
      expect(result!.accountId).toBe('uuid-1');
    });
  });

  describe('hasSession', () => {
    it('should return false for non-existent session', () => {
      expect(manager.hasSession('x', 'uuid-1')).toBe(false);
    });

    it('should return true for existing session', () => {
      manager.getOrCreateSession('x', 'uuid-1');
      expect(manager.hasSession('x', 'uuid-1')).toBe(true);
    });
  });

  describe('removeSession', () => {
    it('should remove a session from the manager', () => {
      manager.getOrCreateSession('x', 'uuid-1');
      expect(manager.getSessionCount()).toBe(1);
      manager.removeSession('x', 'uuid-1');
      expect(manager.getSessionCount()).toBe(0);
      expect(manager.getSession('x', 'uuid-1')).toBeUndefined();
    });
  });

  describe('getAllSessions', () => {
    it('should return all managed sessions', () => {
      manager.getOrCreateSession('x', 'uuid-1');
      manager.getOrCreateSession('threads', 'uuid-2');
      const all = manager.getAllSessions();
      expect(all).toHaveLength(2);
    });
  });

  describe('configureWebContents', () => {
    it('should set up will-navigate handler (VAL-FOUND-077)', () => {
      const mockWc = {
        on: mockWcOn,
        setWindowOpenHandler: mockSetWindowOpenHandler,
      } as any;

      manager.configureWebContents('x', mockWc);

      expect(mockWcOn).toHaveBeenCalledWith('will-navigate', expect.any(Function));
      expect(mockSetWindowOpenHandler).toHaveBeenCalled();

      // Verify the will-navigate handler blocks cross-origin URLs
      const navigateHandler = mockWcOn.mock.calls[0][1];
      const preventDefault = vi.fn();
      const mockEvent = { preventDefault };

      // Should block unknown domain
      navigateHandler(mockEvent, 'https://evil.com/page');
      expect(preventDefault).toHaveBeenCalled();
    });

    it('should allow navigation to platform domain (VAL-FOUND-077)', () => {
      const mockWc = {
        on: mockWcOn,
        setWindowOpenHandler: mockSetWindowOpenHandler,
      } as any;

      manager.configureWebContents('x', mockWc);

      const navigateHandler = mockWcOn.mock.calls[0][1];
      const preventDefault = vi.fn();
      const mockEvent = { preventDefault };

      // Should allow x.com
      navigateHandler(mockEvent, 'https://x.com/home');
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('should allow subdomains of platform domain', () => {
      const mockWc = {
        on: mockWcOn,
        setWindowOpenHandler: mockSetWindowOpenHandler,
      } as any;

      manager.configureWebContents('x', mockWc);

      const navigateHandler = mockWcOn.mock.calls[0][1];
      const preventDefault = vi.fn();
      const mockEvent = { preventDefault };

      // Should allow subdomain
      navigateHandler(mockEvent, 'https://api.x.com/v1');
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('should block all popups (VAL-FOUND-078)', () => {
      const mockWc = {
        on: mockWcOn,
        setWindowOpenHandler: mockSetWindowOpenHandler,
      } as any;

      manager.configureWebContents('x', mockWc);

      const popupHandler = mockSetWindowOpenHandler.mock.calls[0][0];
      const result = popupHandler({ url: 'https://evil.com' });
      expect(result).toEqual({ action: 'deny' });
    });
  });

  describe('permission handler', () => {
    it('should deny permission requests by default (VAL-FOUND-071)', () => {
      manager.getOrCreateSession('x', 'uuid-1');

      // Get the callback passed to setPermissionRequestHandler
      const permissionHandler = mockSetPermissionRequestHandler.mock.calls[0][0];
      const callback = vi.fn();

      permissionHandler({} as any, 'camera', callback);
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('should allow allowlisted permissions (VAL-FOUND-076)', () => {
      const managerWithAllowlist = new SessionManager({ allowlisted: ['clipboard-read'] });
      managerWithAllowlist.getOrCreateSession('x', 'uuid-1');

      const permissionHandler = mockSetPermissionRequestHandler.mock.calls[0][0];
      const callback = vi.fn();

      permissionHandler({} as any, 'clipboard-read', callback);
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should deny non-allowlisted permissions even with allowlist', () => {
      const managerWithAllowlist = new SessionManager({ allowlisted: ['clipboard-read'] });
      managerWithAllowlist.getOrCreateSession('x', 'uuid-1');

      const permissionHandler = mockSetPermissionRequestHandler.mock.calls[0][0];
      const callback = vi.fn();

      permissionHandler({} as any, 'geolocation', callback);
      expect(callback).toHaveBeenCalledWith(false);
    });
  });

  describe('download policy (VAL-FOUND-079)', () => {
    it('should deny all downloads', () => {
      manager.getOrCreateSession('x', 'uuid-1');

      const downloadHandler = mockSessionOn.mock.calls.find(
        (call: any) => call[0] === 'will-download'
      );
      expect(downloadHandler).toBeDefined();

      const preventDefault = vi.fn();
      downloadHandler[1]({ preventDefault });
      expect(preventDefault).toHaveBeenCalled();
    });
  });

  describe('flushAllCookies (VAL-FOUND-059)', () => {
    it('should call flushStore for all managed sessions', async () => {
      manager.getOrCreateSession('x', 'uuid-1');
      manager.getOrCreateSession('threads', 'uuid-2');

      await manager.flushAllCookies();

      expect(mockFlushStore).toHaveBeenCalledTimes(2);
    });

    it('should not throw when no sessions exist', async () => {
      await expect(manager.flushAllCookies()).resolves.toBeUndefined();
    });

    it('should handle flushStore errors gracefully', async () => {
      mockFlushStore.mockRejectedValueOnce(new Error('Flush failed'));
      manager.getOrCreateSession('x', 'uuid-1');

      await expect(manager.flushAllCookies()).resolves.toBeUndefined();
    });
  });

  describe('PLATFORM_DOMAINS', () => {
    it('should define domains for all platforms', () => {
      const platforms: Platform[] = ['x', 'threads', 'instagram', 'tiktok', 'facebook'];
      for (const p of platforms) {
        expect(PLATFORM_DOMAINS[p]).toBeDefined();
        expect(PLATFORM_DOMAINS[p].length).toBeGreaterThan(0);
      }
    });
  });

  describe('dispose', () => {
    it('should clear all sessions', () => {
      manager.getOrCreateSession('x', 'uuid-1');
      manager.getOrCreateSession('threads', 'uuid-2');
      expect(manager.getSessionCount()).toBe(2);

      manager.dispose();
      expect(manager.getSessionCount()).toBe(0);
    });
  });
});