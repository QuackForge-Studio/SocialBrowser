import { BrowserWindow } from 'electron';

export class BaseWindow {
  public readonly win: BrowserWindow;
  private resizeHandlers: Array<() => void> = [];
  private maximizeHandlers: Array<() => void> = [];
  private unmaximizeHandlers: Array<() => void> = [];
  private closeHandlers: Array<(event: Electron.Event) => void> = [];

  constructor() {
    this.win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      frame: false,
      title: '',
      show: false,
      backgroundColor: '#0f1117',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    this.win.on('resize', () => { for (const h of this.resizeHandlers) h(); });
    this.win.on('maximize', () => { for (const h of this.maximizeHandlers) h(); });
    this.win.on('unmaximize', () => { for (const h of this.unmaximizeHandlers) h(); });
    this.win.on('close', (event: Electron.Event) => { for (const h of this.closeHandlers) h(event); });
  }

  get contentView() { return this.win.contentView; }
  getContentBounds(): { width: number; height: number } {
    const cb = this.win.contentView.getBounds();
    return { width: cb.width, height: cb.height };
  }
  onResize(handler: () => void): void { this.resizeHandlers.push(handler); }
  onMaximize(handler: () => void): void { this.maximizeHandlers.push(handler); }
  onUnmaximize(handler: () => void): void { this.unmaximizeHandlers.push(handler); }
  onClose(handler: (event: Electron.Event) => void): void { this.closeHandlers.push(handler); }
  show(): void { this.win.show(); }
  close(): void { this.win.close(); }
  destroy(): void { this.win.destroy(); }
}
