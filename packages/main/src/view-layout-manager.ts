import type { WebContentsView } from 'electron';
import type { BaseWindow } from './base-window';
import type { ShellView } from './shell-view';

export interface TabEntry {
  id: string;
  label: string;
  view: WebContentsView;
  onClose?: () => void;
}

export const SIDEBAR_WIDTH = 240;
export const TAB_BAR_HEIGHT = 40;

export class ViewLayoutManager {
  private readonly baseWindow: BaseWindow;
  private readonly shellView: ShellView;
  private readonly tabs: Map<string, TabEntry> = new Map();
  private activeTabId: string | null = null;

  constructor(baseWindow: BaseWindow, shellView: ShellView) {
    this.baseWindow = baseWindow;
    this.shellView = shellView;

    this.baseWindow.contentView.addChildView(this.shellView.view);

    this.baseWindow.onResize(() => this.recalculateBounds());
    this.baseWindow.onMaximize(() => this.recalculateBounds());
    this.baseWindow.onUnmaximize(() => this.recalculateBounds());

    this.recalculateBounds();
  }

  private getFullBounds(): { x: number; y: number; width: number; height: number } {
    const { width, height } = this.baseWindow.getContentBounds();
    return {
      x: 0,
      y: 0,
      width,
      height,
    };
  }

  private getContentBounds(): { x: number; y: number; width: number; height: number } {
    const { width, height } = this.baseWindow.getContentBounds();
    return {
      x: SIDEBAR_WIDTH,
      y: TAB_BAR_HEIGHT,
      width: Math.max(0, width - SIDEBAR_WIDTH),
      height: Math.max(0, height - TAB_BAR_HEIGHT),
    };
  }

  recalculateBounds(): void {
    const fullBounds = this.getFullBounds();
    const contentBounds = this.getContentBounds();
    this.shellView.setBounds(fullBounds);

    if (this.activeTabId) {
      const tab = this.tabs.get(this.activeTabId);
      if (tab) {
        tab.view.setBounds(contentBounds);
      }
    }
  }

  addTab(id: string, label: string, view: WebContentsView, onClose?: () => void): TabEntry {
    const entry: TabEntry = { id, label, view, onClose };
    this.tabs.set(id, entry);
    view.setVisible(false);
    return entry;
  }

  activateTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) {
      console.warn('[ViewLayoutManager] Cannot activate unknown tab: ' + id);
      return;
    }

    if (this.activeTabId) {
      const current = this.tabs.get(this.activeTabId);
      if (current) {
        current.view.setVisible(false);
      }
    }

    this.shellView.setVisible(false);

    const children = this.baseWindow.contentView.children;
    if (!children.includes(tab.view)) {
      this.baseWindow.contentView.addChildView(tab.view);
    }

    tab.view.setBounds(this.getContentBounds());
    tab.view.setVisible(true);

    this.activeTabId = id;
  }

  activateDashboard(): void {
    if (this.activeTabId) {
      const current = this.tabs.get(this.activeTabId);
      if (current) {
        current.view.setVisible(false);
      }
      this.activeTabId = null;
    }

    this.shellView.setBounds(this.getFullBounds());
    this.shellView.setVisible(true);
  }

  closeTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;

    const children = this.baseWindow.contentView.children;
    if (children.includes(tab.view)) {
      this.baseWindow.contentView.removeChildView(tab.view);
    }

    if (!tab.view.webContents.isDestroyed()) {
      tab.view.webContents.close();
    }

    if (tab.onClose) {
      tab.onClose();
    }

    this.tabs.delete(id);

    if (this.activeTabId === id) {
      this.activeTabId = null;
      this.activateDashboard();
    }
  }

  closeAllTabs(): void {
    for (const [id] of this.tabs) {
      const tab = this.tabs.get(id);
      if (!tab) continue;

      const children = this.baseWindow.contentView.children;
      if (children.includes(tab.view)) {
        this.baseWindow.contentView.removeChildView(tab.view);
      }

      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.close();
      }
    }
    this.tabs.clear();
    this.activeTabId = null;
  }

  closeAllViews(): void {
    this.closeAllTabs();

    if (!this.shellView.isDestroyed()) {
      this.shellView.close();
    }

    const children = this.baseWindow.contentView.children;
    if (children.includes(this.shellView.view)) {
      this.baseWindow.contentView.removeChildView(this.shellView.view);
    }
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  hasTab(id: string): boolean {
    return this.tabs.has(id);
  }

  getTabCount(): number {
    return this.tabs.size;
  }

  getTabs(): TabEntry[] {
    return Array.from(this.tabs.values());
  }
}
