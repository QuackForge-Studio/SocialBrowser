import { WebContentsView } from 'electron';
import type { BaseWindow } from './base-window';
import type { ShellView } from './shell-view';

export interface TabEntry {
  id: string;
  label: string;
  view: WebContentsView;
  onClose?: () => void;
  favicon?: string;
}

export const SIDEBAR_WIDTH = 232;
export const TITLE_BAR_HEIGHT = 91; // 40px tab strip + 5px top gap + 46px URL bar
const SIDEBAR_TRANSITION_MS = 200;

export class ViewLayoutManager {
  private readonly baseWindow: BaseWindow;
  private readonly shellView: ShellView;
  private readonly tabs: Map<string, TabEntry> = new Map();
  private activeTabId: string | null = null;
  private savedSidebarOpen = false;

  constructor(baseWindow: BaseWindow, shellView: ShellView) {
    this.baseWindow = baseWindow;
    this.shellView = shellView;
    this.baseWindow.contentView.addChildView(this.shellView.view);
    this.baseWindow.onResize(() => this.recalculateBounds());
    this.baseWindow.onMaximize(() => this.recalculateBounds());
    this.baseWindow.onUnmaximize(() => this.recalculateBounds());
    this.recalculateBounds();
  }

  private sidebarOpen = false;
  private sidebarTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private popoverOpen = false;
  private peekView: WebContentsView | null = null;
  private peekUrl: string | null = null;

  setSidebarOpen(open: boolean): void {
    if (this.sidebarTransitionTimer) {
      clearTimeout(this.sidebarTransitionTimer);
      this.sidebarTransitionTimer = null;
    }

    const activeTab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    const fromBounds = activeTab?.view.getBounds();
    this.sidebarOpen = open;
    this.shellView.setBounds(open || this.popoverOpen || this.peekView ? this.getFullBounds() : this.getTitleBarBounds());

    if (!activeTab || !fromBounds) {
      this.recalculateBounds();
      return;
    }

    const toBounds = this.getTabBounds();
    const startedAt = Date.now();
    const animate = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / SIDEBAR_TRANSITION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      activeTab.view.setBounds({
        x: Math.round(fromBounds.x + (toBounds.x - fromBounds.x) * eased),
        y: toBounds.y,
        width: Math.round(fromBounds.width + (toBounds.width - fromBounds.width) * eased),
        height: toBounds.height,
      });

      if (progress < 1) {
        this.sidebarTransitionTimer = setTimeout(animate, 16);
      } else {
        this.sidebarTransitionTimer = null;
      }
    };

    animate();
  }

  setPopoverOpen(open: boolean): void {
    this.popoverOpen = open;
    this.recalculateBounds();
  }

  openPeekPreview(url: string): void {
    this.closePeekPreview();

    this.peekUrl = url;
    this.peekView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.peekView.webContents.loadURL(url).catch(() => {});
    this.baseWindow.contentView.addChildView(this.peekView);

    // Re-add shellView on top so header overlay & controls capture interaction
    if (this.baseWindow.contentView.children.includes(this.shellView.view)) {
      this.baseWindow.contentView.removeChildView(this.shellView.view);
    }
    this.baseWindow.contentView.addChildView(this.shellView.view);

    this.shellView.webContents.send('peek:opened', { url });
    this.recalculateBounds();
  }

  closePeekPreview(): void {
    if (this.peekView) {
      if (this.baseWindow.contentView.children.includes(this.peekView)) {
        this.baseWindow.contentView.removeChildView(this.peekView);
      }
      if (!this.peekView.webContents.isDestroyed()) {
        this.peekView.webContents.close();
      }
      this.peekView = null;
      this.peekUrl = null;
    }
    this.shellView.webContents.send('peek:closed');
    this.recalculateBounds();
  }

  getPeekUrl(): string | null {
    return this.peekUrl;
  }

  // Full window bounds for shell view
  private getFullBounds(): { x: number; y: number; width: number; height: number } {
    const { width, height } = this.baseWindow.getContentBounds();
    return { x: 0, y: 0, width, height };
  }

  // Keep the shell above browser tabs only where it renders browser controls.
  // A full-window shell view consumes pointer input even when its DOM is transparent.
  private getTitleBarBounds(): { x: number; y: number; width: number; height: number } {
    const { width } = this.baseWindow.getContentBounds();
    return { x: 0, y: 0, width, height: TITLE_BAR_HEIGHT };
  }

  // Viewport bounds for browser tabs (docked inside unified card below URL toolbar)
  private getTabBounds(): { x: number; y: number; width: number; height: number } {
    const { width, height } = this.baseWindow.getContentBounds();
    const SIDEBAR_OFFSET = this.sidebarOpen ? 238 : 6;
    const TOTAL_MARGIN_X = this.sidebarOpen ? 244 : 12;
    const BOTTOM_OFFSET = 97; // 91px top + 5px window bottom margin + 1px border
    return {
      x: SIDEBAR_OFFSET,
      y: TITLE_BAR_HEIGHT,
      width: Math.max(0, width - TOTAL_MARGIN_X),
      height: Math.max(0, height - BOTTOM_OFFSET),
    };
  }

  recalculateBounds(): void {
    const { width, height } = this.baseWindow.getContentBounds();
    if (this.activeTabId) {
      const tab = this.tabs.get(this.activeTabId);
      if (tab) {
        tab.view.setBounds(this.getTabBounds());
        tab.view.setVisible(true);
      }
      this.shellView.setBounds(this.peekView || this.sidebarOpen || this.popoverOpen ? this.getFullBounds() : this.getTitleBarBounds());

      if (this.peekView) {
        const PEEK_MARGIN_X = Math.max(40, Math.floor(width * 0.1));
        const PEEK_MARGIN_TOP = 145; // Below URL toolbar & Peek Header
        const PEEK_MARGIN_BOTTOM = 25;
        this.peekView.setBounds({
          x: PEEK_MARGIN_X,
          y: PEEK_MARGIN_TOP,
          width: Math.max(200, width - PEEK_MARGIN_X * 2),
          height: Math.max(100, height - PEEK_MARGIN_TOP - PEEK_MARGIN_BOTTOM),
        });
        this.peekView.setVisible(true);
      }
    } else {
      this.shellView.setBounds(this.getFullBounds());
    }
  }

  addTab(id: string, label: string, view: WebContentsView, onClose?: () => void): TabEntry {
    const entry: TabEntry = { id, label, view, onClose };
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      view.webContents.on('page-favicon-updated', (_event, favicons) => {
        if (favicons && favicons.length > 0) {
          entry.favicon = favicons[0];
        }
      });
      view.webContents.on('focus', () => {
        if (this.shellView && !this.shellView.isDestroyed()) {
          this.shellView.webContents.send('dash:close-popovers');
        }
      });
    }
    this.tabs.set(id, entry);
    view.setVisible(false);
    return entry;
  }

  activateTab(id: string): void {
    if (this.activeTabId === id) return;

    const tab = this.tabs.get(id);
    if (!tab) { console.warn('[VLM] Unknown tab: ' + id); return; }
    if (this.activeTabId) {
      const current = this.tabs.get(this.activeTabId);
      if (current) current.view.setVisible(false);
    }

    // Add browser tab view if not already added
    if (!this.baseWindow.contentView.children.includes(tab.view)) {
      this.baseWindow.contentView.addChildView(tab.view);
    }
    tab.view.setBounds(this.getTabBounds());
    tab.view.setVisible(true);

    // Ensure shell sits on top of tab.view in contentView z-stack
    if (this.baseWindow.contentView.children.includes(this.shellView.view)) {
      this.baseWindow.contentView.removeChildView(this.shellView.view);
    }
    this.baseWindow.contentView.addChildView(this.shellView.view);
    this.shellView.setBounds(this.sidebarOpen || this.popoverOpen || this.peekView ? this.getFullBounds() : this.getTitleBarBounds());
    this.shellView.setVisible(true);

    this.activeTabId = id;
  }

  activateDashboard(): void {
    if (this.activeTabId) {
      const current = this.tabs.get(this.activeTabId);
      if (current) {
        current.view.setVisible(false);
        if (this.baseWindow.contentView.children.includes(current.view))
          this.baseWindow.contentView.removeChildView(current.view);
      }
      this.activeTabId = null;
    }
    // Restore sidebar state
    this.sidebarOpen = this.savedSidebarOpen;
    this.shellView.setBounds(this.getFullBounds());
    this.shellView.setVisible(true);
  }

  closeTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    if (this.baseWindow.contentView.children.includes(tab.view))
      this.baseWindow.contentView.removeChildView(tab.view);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    if (tab.onClose) tab.onClose();
    this.tabs.delete(id);
    if (this.activeTabId === id) { this.activeTabId = null; this.activateDashboard(); }
  }

  closeAllTabs(): void {
    for (const [, tab] of this.tabs) {
      if (this.baseWindow.contentView.children.includes(tab.view))
        this.baseWindow.contentView.removeChildView(tab.view);
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    }
    this.tabs.clear();
    this.activeTabId = null;
  }

  closeAllViews(): void {
    this.closeAllTabs();
    if (!this.shellView.isDestroyed()) this.shellView.close();
    if (this.baseWindow.contentView.children.includes(this.shellView.view))
      this.baseWindow.contentView.removeChildView(this.shellView.view);
  }

  getActiveTabId(): string | null { return this.activeTabId; }
  hasTab(id: string): boolean { return this.tabs.has(id); }
  getTabCount(): number { return this.tabs.size; }
  getTabs(): TabEntry[] { return Array.from(this.tabs.values()); }
}
