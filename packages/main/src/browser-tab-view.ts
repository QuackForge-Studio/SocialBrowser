import { WebContentsView, Menu, MenuItem, clipboard, session as electronSession } from 'electron';
import path from 'path';
import { adBlockEngine } from './adblock-engine';

const ABOUT_URL = 'socialbrowser://about-us/';
const aboutProtocolPartitions = new Set<string>();

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
  public pendingNavUrl: string | null = null;

  constructor(config: BrowserTabViewConfig) {
    this.profileId = config.profileId;
    this.partition = config.partition;

    const sess = electronSession.fromPartition(config.partition);
    adBlockEngine.attachToSession(sess);
    registerAboutProtocol(sess, config.partition);

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
        this.pendingNavUrl = url;
        if (url.startsWith('socialbrowser://')) {
          this.favicon = '';
          this.pageTitle = 'About Social Browser';
        } else {
          try {
            const u = new URL(url);
            if (u.hostname) {
              this.favicon = `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
            }
          } catch {
            // ignore
          }
        }
      }
    });
    this.view.webContents.on('did-stop-loading', () => {
      this.isLoading = false;
      this.pendingNavUrl = null;
    });
    this.view.webContents.on('did-finish-load', () => {
      this.isLoading = false;
      this.pendingNavUrl = null;
    });
    this.view.webContents.on('did-fail-load', () => {
      this.isLoading = false;
      this.pendingNavUrl = null;
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
      void this.loadURL(config.initialUrl);
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
    if (targetUrl === 'about:social-browser' || targetUrl === 'about:about') {
      targetUrl = ABOUT_URL;
    }
    if (targetUrl === ABOUT_URL) {
      this.pageTitle = 'About Social Browser';
      this.pendingNavUrl = ABOUT_URL;
      await this.view.webContents.loadURL(ABOUT_URL);
      return;
    }
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('about:') && !targetUrl.startsWith('socialbrowser://')) {
      targetUrl = 'https://' + targetUrl;
    }
    this.pendingNavUrl = targetUrl;
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
    return this.pendingNavUrl || this.view.webContents.getURL();
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

function registerAboutProtocol(sess: Electron.Session, partition: string): void {
  if (aboutProtocolPartitions.has(partition)) return;

  sess.protocol.handle('socialbrowser', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'about-us') {
      return new Response('Not found', { status: 404 });
    }
    return new Response(getAboutPageHtml(), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  });
  aboutProtocolPartitions.add(partition);
}

function getAboutPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About Social Browser</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0c0e14;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .card {
      background: #161925;
      border: 1px solid #2d3345;
      border-radius: 20px;
      max-width: 650px;
      width: 100%;
      padding: 36px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-bottom: 24px;
      border-bottom: 1px solid #272d3e;
      margin-bottom: 24px;
    }
    .logo {
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 24px;
      color: #0c0e14;
      box-shadow: 0 8px 16px rgba(245, 158, 11, 0.3);
    }
    .title-area h1 {
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 4px;
    }
    .badge {
      display: inline-block;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .feature-box {
      background: #1d2130;
      border: 1px solid #282f42;
      border-radius: 14px;
      padding: 16px;
    }
    .feature-box h3 {
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .feature-box p {
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .footer-box {
      background: #11131c;
      border: 1px solid #222736;
      border-radius: 14px;
      padding: 16px;
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
    .footer-box strong {
      color: #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">SB</div>
      <div class="title-area">
        <h1>Social Browser</h1>
        <span class="badge">Version 0.2.0 • Stable Release</span>
      </div>
    </div>

    <div class="grid">
      <div class="feature-box">
        <h3>🛡️ Brave AdBlock Engine</h3>
        <p>Built-in high performance ad and tracker blocking powered by Rust & Brave AdBlock rules.</p>
      </div>
      <div class="feature-box">
        <h3>🔒 Isolated Profiles</h3>
        <p>Independent browser partitions for complete privacy, multi-account isolation, and separate cookies.</p>
      </div>
      <div class="feature-box">
        <h3>🤖 AI RAG Assistant</h3>
        <p>Integrated local AI assistant with sqlite-vec vector memory and automated context indexing.</p>
      </div>
      <div class="feature-box">
        <h3>⚡ Electron & Vite Core</h3>
        <p>Ultra-fast GPU accelerated browser architecture with instant tab switching and smooth UI motion.</p>
      </div>
    </div>

    <div class="footer-box">
      <strong>Social Browser Architecture</strong><br>
      © 2026 Social Browser Team. All rights reserved.<br>
      Engine: Electron WebContentsView • AdBlocker Engine: adblock-rs • License: MIT / Proprietary Core
    </div>
  </div>
</body>
</html>`;
}
