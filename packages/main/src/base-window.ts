import { BrowserWindow } from 'electron';

/**
 * BaseWindow is a wrapper around BrowserWindow that serves as a native
 * view container WITHOUT a built-in renderer. No loadFile/loadURL is
 * called on the BrowserWindow — all content comes from WebContentsView
 * children managed by the ViewLayoutManager.
 */
export class BaseWindow {
  public readonly win: BrowserWindow;
  private resizeHandlers: Array<() => void> = [];
  private maximizeHandlers: Array<() => void> = [];
  private unmaximizeHandlers: Array<() => void> = [];
  private closeHandlers: Array<(event: Electron.Event) => void> = [];

  constructor() {
    this.win = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 1024,
      minHeight: 700,
      title: 'Social Browser',
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    // IMPORTANT: Do NOT call loadFile/loadURL on this BrowserWindow.
    // The BaseWindow serves as a native container only. All content
    // comes from WebContentsView children.

    this.win.on('resize', () => {
      for (const handler of this.resizeHandlers) {
        handler();
      }
    });

    this.win.on('maximize', () => {
      for (const handler of this.maximizeHandlers) {
        handler();
      }
    });

    this.win.on('unmaximize', () => {
      for (const handler of this.unmaximizeHandlers) {
        handler();
      }
    });

    this.win.on('close', (event: Electron.Event) => {
      for (const handler of this.closeHandlers) {
        handler(event);
      }
    });
  }

  /** The root contentView of the BrowserWindow. */
  get contentView() {
    return this.win.contentView;
  }

  /** Get the content area dimensions. */
  getContentBounds(): { width: number; height: number } {
    const bounds = this.win.getBounds();
    // Use the window client area size (content view bounds).
    const cb = this.win.contentView.getBounds();
    return { width: cb.width, height: cb.height };
  }

  /** Register a resize event handler. */
  onResize(handler: () => void): void {
    this.resizeHandlers.push(handler);
  }

  /** Register a maximize event handler. */
  onMaximize(handler: () => void): void {
    this.maximizeHandlers.push(handler);
  }

  /** Register an unmaximize event handler. */
  onUnmaximize(handler: () => void): void {
    this.unmaximizeHandlers.push(handler);
  }

  /** Register a close event handler. */
  onClose(handler: (event: Electron.Event) => void): void {
    this.closeHandlers.push(handler);
  }

  /** Show the window. */
  show(): void {
    this.win.show();
  }

  /** Close the window. */
  close(): void {
    this.win.close();
  }

  /** Destroy the window. */
  destroy(): void {
    this.win.destroy();
  }
}
