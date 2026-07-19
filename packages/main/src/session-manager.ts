import { session, WebContents, Session } from 'electron';

export type Platform = 'x' | 'threads' | 'instagram' | 'tiktok' | 'facebook';

export interface AccountSession {
  partition: string;
  session: Session;
  platform: Platform;
  accountId: string;
  createdAt: Date;
}

export interface PermissionConfig {
  allowlisted?: string[];
}

export const PLATFORM_DOMAINS: Record<Platform, string[]> = {
  x: ['x.com', 'twitter.com'],
  threads: ['threads.net'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  facebook: ['facebook.com', 'fb.com', 'fbcdn.net'],
};

const PARTITION_PREFIX = 'persist:social-browser';

export class SessionManager {
  private readonly sessions: Map<string, AccountSession> = new Map();
  private readonly permissionConfig: PermissionConfig;

  constructor(permissionConfig?: PermissionConfig) {
    this.permissionConfig = permissionConfig ?? { allowlisted: [] };
  }

  buildPartition(platform: Platform, accountId: string): string {
    return `${PARTITION_PREFIX}:${platform}:${accountId}`;
  }

  generateAccountId(): string {
    const { randomUUID } = require('crypto') as { randomUUID: () => string };
    return randomUUID();
  }

  getOrCreateSession(platform: Platform, accountId: string): AccountSession {
    const key = this.getKey(platform, accountId);
    const existing = this.sessions.get(key);
    if (existing) return existing;
    return this.createSession(platform, accountId);
  }

  getSession(platform: Platform, accountId: string): AccountSession | undefined {
    return this.sessions.get(this.getKey(platform, accountId));
  }

  hasSession(platform: Platform, accountId: string): boolean {
    return this.sessions.has(this.getKey(platform, accountId));
  }

  removeSession(platform: Platform, accountId: string): void {
    this.sessions.delete(this.getKey(platform, accountId));
  }

  getAllSessions(): AccountSession[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  configureWebContents(platform: Platform, wc: WebContents): void {
    const allowedDomains = PLATFORM_DOMAINS[platform] ?? [];

    wc.on('will-navigate', (event: Electron.Event, url: string) => {
      try {
        const parsedUrl = new URL(url);
        const isAllowed = allowedDomains.some(
          (domain) => parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
        );
        if (!isAllowed) event.preventDefault();
      } catch {
        event.preventDefault();
      }
    });

    wc.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
  }

  async flushAllCookies(): Promise<void> {
    const promises: Array<Promise<void>> = [];
    for (const [, s] of this.sessions) {
      promises.push(
        s.session.cookies.flushStore().catch((err: Error) => {
          console.warn(`[SessionManager] Cookie flush error for ${s.partition}:`, err.message);
        })
      );
    }
    await Promise.all(promises);
  }

  dispose(): void {
    this.sessions.clear();
  }

  private createSession(platform: Platform, accountId: string): AccountSession {
    const partition = this.buildPartition(platform, accountId);
    const sess = session.fromPartition(partition);

    sess.setPermissionRequestHandler(
      (_wc: WebContents, _perm: string, callback: (granted: boolean) => void) => {
        const allowlisted = this.permissionConfig.allowlisted ?? [];
        callback(allowlisted.includes(_perm));
      }
    );

    sess.on('will-download', (event: Electron.Event) => {
      event.preventDefault();
    });

    const accountSession: AccountSession = {
      partition, session: sess, platform, accountId, createdAt: new Date(),
    };
    this.sessions.set(this.getKey(platform, accountId), accountSession);
    return accountSession;
  }

  private getKey(platform: Platform, accountId: string): string {
    return `${platform}:${accountId}`;
  }
}