import { WebContentsView } from 'electron';
import path from 'path';

/**
 * ShellView is a WebContentsView that hosts the React Dashboard UI.
 * It is always present as the first child view in the BaseWindow.
 * Security: nodeIntegration=false, contextIsolation=true, sandbox=false,
 * webSecurity=true. Sandbox is false because the dashboard preload script
 * needs to communicate via contextBridge IPC.
 *
 * Note: The dashboard dist files are copied into __dirname/dashboard/
 * during the build process via scripts/copy-assets.js.
 */
export class ShellView {
  public readonly view: WebContentsView;

  constructor() {
    this.view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload-shell.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: true,
      },
    });

    // Load the built dashboard HTML from __dirname/dashboard/index.html.
    // Assets are copied here by scripts/copy-assets.js during build.
    const indexPath = path.join(__dirname, 'dashboard', 'index.html');
    this.view.webContents.loadFile(indexPath);
  }

  get webContents() {
    return this.view.webContents;
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.view.setBounds(bounds);
  }

  setVisible(visible: boolean): void {
    this.view.setVisible(visible);
  }

  close(): void {
    this.view.webContents.close();
  }

  isDestroyed(): boolean {
    return this.view.webContents.isDestroyed();
  }
}
