import { WebContentsView, Menu, MenuItem, clipboard, session as electronSession } from 'electron';
import path from 'path';
import { adBlockEngine } from './adblock-engine';

export interface BrowserTabViewConfig {
  /** Unique BrowserProfile ID */
  profileId: string;
  /** Session partition string (persist:social-browser:profile:<id>) */
  partition: string;
  /** Optional initial URL to load. Defaults to about:blank */
  initialUrl?: string;
  /** Optional preload script path. Defaults to preload-capture.js */
  preloadPath?: string;
  /** Callback when user requests Peek Link Preview */
  onOpenPeek?: (url: string) => void;
  /** Callback when user requests opening link in new tab */
  onOpenNewTab?: (url: string) => void;
}

/**
 * BrowserTabView wraps a WebContentsView representing a single browser tab
 * inside an isolated BrowserProfile session.
 *
 * Provides full browser navigation freedom (any URL, back/forward/reload, popups).
 */
export class BrowserTabView {
  public readonly view: WebContentsView;
  private readonly profileId: string;
  private readonly partition: string;
  public favicon: string = '';
  public isLoading: boolean = false;
  public pageTitle: string = '';

  constructor(config: BrowserTabViewConfig) {
    this.profileId = config.profileId;
    this.partition = config.partition;

    const sess = electronSession.fromPartition(config.partition);
    adBlockEngine.attachToSession(sess);

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

    // Track loading, favicon, and title states
    this.view.webContents.on('did-start-loading', () => {
      this.isLoading = true;
    });
    this.view.webContents.on('did-start-navigation', (_event, url, _isInPlace, isMainFrame) => {
      if (isMainFrame && url && !url.startsWith('about:')) {
        this.isLoading = true;
        try {
          const u = new URL(url);
          if (u.hostname) {
            this.favicon = `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
          }
        } catch {
          // ignore
        }
      }
    });
    this.view.webContents.on('did-stop-loading', () => {
      this.isLoading = false;
    });
    this.view.webContents.on('did-finish-load', () => {
      this.isLoading = false;
    });
    this.view.webContents.on('did-fail-load', () => {
      this.isLoading = false;
    });
    this.view.webContents.on('page-favicon-updated', (_event, favicons) => {
      if (favicons && favicons.length > 0) {
        this.favicon = favicons[0];
      }
    });
    this.view.webContents.on('page-title-updated', (_event, title) => {
      this.pageTitle = title;
    });

    // Handle Context Menu (Right Click on Link / Text / Page)
    this.view.webContents.on('context-menu', (_event, params) => {
      const menu = new Menu();

      if (params.linkURL) {
        menu.append(new MenuItem({
          label: '👁️ Xem Nhanh Link Trong Tab (Peek Preview)',
          click: () => {
            if (config.onOpenPeek) config.onOpenPeek(params.linkURL);
          },
        }));
        menu.append(new MenuItem({
          label: '🔗 Mở trong Tab mới',
          click: () => {
            if (config.onOpenNewTab) config.onOpenNewTab(params.linkURL);
          },
        }));
        menu.append(new MenuItem({
          label: '📋 Sao chép đường dẫn',
          click: () => {
            clipboard.writeText(params.linkURL);
          },
        }));
        menu.append(new MenuItem({ type: 'separator' }));
      }

      if (params.selectionText) {
        menu.append(new MenuItem({ role: 'copy', label: 'Sao chép' }));
        menu.append(new MenuItem({
          label: `🔍 Tìm kiếm "${params.selectionText.length > 25 ? params.selectionText.slice(0, 25) + '...' : params.selectionText}" trên Google`,
          click: () => {
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(params.selectionText)}`;
            if (config.onOpenNewTab) config.onOpenNewTab(searchUrl);
          },
        }));
        menu.append(new MenuItem({ type: 'separator' }));
      }

      if (!params.linkURL && !params.selectionText) {
        menu.append(new MenuItem({ role: 'reload', label: 'Tải lại trang' }));
        menu.append(new MenuItem({ role: 'forceReload', label: 'Tải lại hoàn toàn' }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({
          label: '🔍 Kiểm tra phần tử (Inspect Element)',
          click: () => {
            this.view.webContents.inspectElement(params.x, params.y);
          },
        }));
      }

      menu.popup();
    });

    // Enable background throttling to conserve memory & CPU on hidden tabs
    this.view.webContents.setBackgroundThrottling(true);

    // Allow popups to navigate inside the view
    this.view.webContents.setWindowOpenHandler(({ url }) => {
      if (!this.isDestroyed()) {
        void this.view.webContents.loadURL(url);
      }
      return { action: 'deny' };
    });

    // Load initial URL if provided
    if (config.initialUrl) {
      void this.view.webContents.loadURL(config.initialUrl);
    }
  }

  /** Get underlying WebContentsView. */
  getView(): WebContentsView {
    return this.view;
  }

  /** Get profile ID. */
  getProfileId(): string {
    return this.profileId;
  }

  /** Get session partition. */
  getPartition(): string {
    return this.partition;
  }

  /** Navigate to specified URL. */
  async loadURL(url: string): Promise<void> {
    if (this.isDestroyed()) return;
    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('about:')) {
      targetUrl = 'https://' + targetUrl;
    }
    await this.view.webContents.loadURL(targetUrl);
  }

  /** Go back in navigation history. */
  goBack(): void {
    if (!this.isDestroyed() && this.view.webContents.navigationHistory.canGoBack()) {
      this.view.webContents.navigationHistory.goBack();
    }
  }

  /** Go forward in navigation history. */
  goForward(): void {
    if (!this.isDestroyed() && this.view.webContents.navigationHistory.canGoForward()) {
      this.view.webContents.navigationHistory.goForward();
    }
  }

  /** Reload current page. */
  reload(): void {
    if (!this.isDestroyed()) {
      this.view.webContents.reload();
    }
  }

  /** Set view visibility and apply audio muting + visibility IPC. */
  setVisible(visible: boolean): void {
    if (this.isDestroyed()) return;
    this.view.setVisible(visible);
    this.view.webContents.setAudioMuted(!visible);
    try {
      this.view.webContents.send('tab:visibility-changed', visible);
    } catch {
      // Ignore if webContents is being destroyed
    }
  }

  /** Check if webContents is destroyed. */
  isDestroyed(): boolean {
    return this.view.webContents.isDestroyed();
  }

  /** Get current active URL string. */
  getUrl(): string {
    if (this.isDestroyed()) return '';
    return this.view.webContents.getURL();
  }

  /** Get current page title. */
  getTitle(): string {
    if (this.isDestroyed()) return '';
    return this.view.webContents.getTitle();
  }

  /** Close the webContents and clean up. */
  close(): void {
    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.close();
    }
  }
}
