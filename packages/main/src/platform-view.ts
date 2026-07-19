import { WebContentsView, session as electronSession } from 'electron';
import path from 'path';
import type { Platform } from './session-manager';

export interface PlatformViewConfig {
  /** Platform identifier (x, threads, instagram, tiktok, facebook). */
  platform: Platform;
  /** UUID account identifier. */
  accountId: string;
  /** Optional preload path. Defaults to preload-capture.js alongside this module. */
  preloadPath?: string;
}

/**
 * PlatformView wraps a WebContentsView with strict security settings for
 * hosting social platform pages. Each PlatformView gets its own session
 * partition for cookie and storage isolation.
 *
 * Security flags:
 * - nodeIntegration: false  — No Node.js in renderer
 * - contextIsolation: true  — Renderer isolated from preload
 * - sandbox: true           — Fully sandboxed renderer
 * - webSecurity: true       — Same-origin policy enforced
 */
export class PlatformView {
  public readonly view: WebContentsView;
  private readonly platform: Platform;
  private readonly accountId: string;

  constructor(config: PlatformViewConfig) {
    this.platform = config.platform;
    this.accountId = config.accountId;

    // Build partition string matching the SessionManager format
    const partition = 'persist:social-browser:' + config.platform + ':' + config.accountId;
    const sess = electronSession.fromPartition(partition);

    // Configure session permission handler (deny all by default)
    sess.setPermissionRequestHandler(
      (_wc: Electron.WebContents, _permission: string, callback: (granted: boolean) => void) => {
        callback(false);
      }
    );

    // Deny all downloads
    sess.on('will-download', (event: Electron.Event) => {
      event.preventDefault();
    });

    // Resolve preload path
    const preloadPath = config.preloadPath ?? path.join(__dirname, 'preload-capture.js');

    this.view = new WebContentsView({
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        session: sess,
      },
    });

    // Configure webContents navigation restrictions
    this.configureWebContents(config.platform);
  }

  /**
   * Configure navigation restrictions and popup handling for this view's webContents.
   */
  private configureWebContents(platform: Platform): void {
    const platformDomains = this.getPlatformDomains(platform);

    this.view.webContents.on('will-navigate', (event: Electron.Event, url: string) => {
      try {
        const parsedUrl = new URL(url);
        const isAllowed = platformDomains.some(
          (domain) => parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
        );
        if (!isAllowed) {
          event.preventDefault();
        }
      } catch {
        event.preventDefault();
      }
    });

    this.view.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
  }

  /**
   * Return the platform domains for navigation allowlisting.
   */
  private getPlatformDomains(platform: Platform): string[] {
    const domains: Record<Platform, string[]> = {
      x: ['x.com', 'twitter.com'],
      threads: ['threads.net'],
      instagram: ['instagram.com'],
      tiktok: ['tiktok.com'],
      facebook: ['facebook.com', 'fb.com', 'fbcdn.net'],
    };
    return domains[platform] ?? [];
  }

  /** Get the underlying WebContentsView. */
  getView(): WebContentsView {
    return this.view;
  }

  /** Get the platform identifier. */
  getPlatform(): Platform {
    return this.platform;
  }

  /** Get the account UUID. */
  getAccountId(): string {
    return this.accountId;
  }

  /** Close the webContents and clean up. */
  close(): void {
    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.close();
    }
  }
}
