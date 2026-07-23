import type { WebContentsView } from 'electron';
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
export const TITLE_BAR_HEIGHT = 90; // 44px tab strip + 46px URL bar & bottom spacing

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

  setSidebarOpen(open: boolean): void {
    this.sidebarOpen = open;
    this.recalculateBounds();
  }

  // Full window bounds for shell view
  private getFullBounds(): { x: number; y: number; width: number; height: number } {
    const { width, height } = this.baseWindow.getContentBounds();
    return { x: 0, y: 0, width, height };
  }

  // Title-bar-only bounds (no overlap with browser tab below)
  private getTitleBarBounds(): { x: number; y: number; width: number; height: number } {
    const { width } = this.baseWindow.getContentBounds();
    return { x: 0, y: 0, width, height: TITLE_BAR_HEIGHT };
  }

  // Viewport bounds for browser tabs (docked below TitleBar, full width)
  private getTabBounds(): { x: number; y: number; width: number; height: number } {
    const { width, height } = this.baseWindow.getContentBounds();
    return {
      x: 0,
      y: TITLE_BAR_HEIGHT,
      width,
      height: Math.max(0, height - TITLE_BAR_HEIGHT),
    };
  }

  recalculateBounds(): void {
    if (this.activeTabId) {
      const tab = this.tabs.get(this.activeTabId);
      if (tab) {
        tab.view.setBounds(this.getTabBounds());
        tab.view.setVisible(true);
      }
      this.shellView.setBounds(this.getTitleBarBounds());
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
    }
    this.tabs.set(id, entry);
    view.setVisible(false);
    return entry;
  }

  activateTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) { console.warn('[VLM] Unknown tab: ' + id); return; }
    if (this.activeTabId) {
      const current = this.tabs.get(this.activeTabId);
      if (current) current.view.setVisible(false);
    }

    // Save sidebar state and close it so browser tab fills full width
    this.savedSidebarOpen = this.sidebarOpen;
    if (this.sidebarOpen) this.sidebarOpen = false;

    // Add browser tab view below title bar (no overlap with shell)
    if (!this.baseWindow.contentView.children.includes(tab.view)) {
      this.baseWindow.contentView.addChildView(tab.view);
    }
    tab.view.setBounds(this.getTabBounds());
    tab.view.setVisible(true);

    // Shell sits only at title bar area — no overlap with browser tab
    this.shellView.setBounds(this.getTitleBarBounds());
    if (!this.baseWindow.contentView.children.includes(this.shellView.view))
      this.baseWindow.contentView.addChildView(this.shellView.view);
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
