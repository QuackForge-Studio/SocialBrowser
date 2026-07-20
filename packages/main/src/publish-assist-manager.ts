/**
 * PublishAssistManager
 *
 * Manages the publish-assist flow in the main process:
 * - Creates and tracks PlatformViews by (platform, accountId)
 * - Navigates to platform URLs
 * - Waits for capture:adapter-ready
 * - Pre-fills compose boxes via executeJavaScript
 * - Verifies text insertion via read-back
 *
 * HARD GATES:
 * - NEVER auto-clicks Publish button (code-reviewed)
 * - NEVER bypasses platform protections (no form submit, no POST)
 */

import { ipcMain } from 'electron';
import { PlatformView } from './platform-view';
import { platformViewRegistry } from './platform-view-registry';
import type { Platform } from './session-manager';

// --- Types ---

export interface NavigateToParams {
  platform: string;
  accountId: string;
  url?: string;
}

export interface PrefillComposeParams {
  platform: string;
  accountId: string;
  text: string;
}

export interface NavigateToResult {
  success: boolean;
  error?: string;
}

export interface PrefillComposeResult {
  success: boolean;
  verificationMatch: boolean;
  insertedText?: string;
  error?: string;
}

// --- Constants ---

const ADAPTER_READY_TIMEOUT_MS = 30000;
const PREPILL_VERIFY_DELAY_MS = 500;

const COMPOSE_SELECTORS: Record<string, string> = {
  x: '[data-testid="tweetTextarea_0"], [data-testid="pillar_custom_compose"] [role="textbox"]',
  threads: 'div[role="textbox"]',
  instagram: 'div[role="textbox"]',
  tiktok: 'div[role="textbox"]',
  facebook: 'div[role="textbox"][contenteditable="true"]',
};

const PLATFORM_URLS: Record<string, string> = {
  x: 'https://x.com/home',
  threads: 'https://www.threads.net/',
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/',
  facebook: 'https://www.facebook.com/',
};

// --- Adapter Ready Promise Map ---

interface AdapterReadyEntry {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// --- PublishAssistManager Class ---

export class PublishAssistManager {
  private views: Map<string, PlatformView> = new Map();
  private adapterReadyWaiters: Map<string, AdapterReadyEntry> = new Map();
  private initialized = false;

  /**
   * Initialize the manager.
   * Sets up IPC listeners for adapter-ready events.
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    ipcMain.on('capture:adapter-ready', (_event, body: unknown) => {
      const data = body as { platform: string; accountId: string; adapterVersion: number };
      if (!data || !data.platform || !data.accountId) return;

      const key = data.platform + ':' + data.accountId;
      const waiter = this.adapterReadyWaiters.get(key);
      if (waiter) {
        console.log('[PublishAssist] Adapter ready received for ' + key + ' (v' + (data.adapterVersion || '?') + ')');
        clearTimeout(waiter.timer);
        this.adapterReadyWaiters.delete(key);
        waiter.resolve();
      }
    });
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    for (const [, entry] of this.adapterReadyWaiters) {
      clearTimeout(entry.timer);
    }
    this.adapterReadyWaiters.clear();

    for (const [, pv] of this.views) {
      pv.close();
    }
    this.views.clear();
    this.initialized = false;
  }

  /**
   * Navigate to a platform and wait for adapter-ready.
   */
  async navigateTo(params: NavigateToParams): Promise<NavigateToResult> {
    const { platform, accountId, url } = params;
    const key = platform + ':' + accountId;

    try {
      let pv = this.views.get(key);
      if (!pv) {
        pv = new PlatformView({
          platform: platform as Platform,
          accountId,
        });

        const partition = 'persist:social-browser:' + platform + ':' + accountId;
        platformViewRegistry.register({
          webContentsId: pv.view.webContents.id,
          platform,
          accountId,
          partition,
        });

        this.views.set(key, pv);
        console.log('[PublishAssist] Created PlatformView for ' + key);
      }

      const targetUrl = url || PLATFORM_URLS[platform];
      if (!targetUrl) {
        return { success: false, error: 'No URL configured for platform: ' + platform };
      }

      pv.view.webContents.loadURL(targetUrl);
      console.log('[PublishAssist] Navigated ' + key + ' to ' + targetUrl);

      const adapterResult = await this.waitForAdapterReady(platform, accountId, ADAPTER_READY_TIMEOUT_MS);
      if (!adapterResult) {
        return { success: false, error: 'Timed out waiting for page to load on ' + platform };
      }

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[PublishAssist] navigateTo error for ' + key + ':', msg);
      return { success: false, error: msg };
    }
  }

  /**
   * Pre-fill the compose box with the given text.
   *
   * HARD GATE: ONLY inserts text. NEVER clicks Publish, submits forms, or makes POST requests.
   */
  async prefillCompose(params: PrefillComposeParams): Promise<PrefillComposeResult> {
    const { platform, accountId, text } = params;
    const key = platform + ':' + accountId;

    try {
      const pv = this.views.get(key);
      if (!pv) {
        return { success: false, verificationMatch: false, error: 'No platform view found. Navigate to the platform first.' };
      }

      const composeSelector = COMPOSE_SELECTORS[platform];
      if (!composeSelector) {
        return { success: false, verificationMatch: false, error: 'No compose selector for platform: ' + platform };
      }

      const escapedText = JSON.stringify(text);
      const escapedSelector = JSON.stringify(composeSelector);

      // Step 2: Insert text via executeJavaScript
      // HARD GATE: The injected JS ONLY sets textContent and dispatches input events.
      const insertResult = await pv.view.webContents.executeJavaScript(
        '(' + prefillJavaScript.toString() + ')(' + escapedSelector + ', ' + escapedText + ')'
      );

      if (!insertResult || !insertResult.success) {
        return {
          success: false,
          verificationMatch: false,
          error: insertResult?.error || 'Failed to fill compose box on ' + platform,
        };
      }

      await delay(PREPILL_VERIFY_DELAY_MS);

      // Step 3: Read back to verify
      const verifyResult = await pv.view.webContents.executeJavaScript(
        '(' + verifyPrefillJavaScript.toString() + ')(' + escapedSelector + ')'
      );

      const insertedText = verifyResult?.text || '';
      const verificationMatch = insertedText.length > 0 && text.includes(insertedText);

      // HARD GATE confirmation logging
      console.log('[PublishAssist] HARD GATE: Text inserted. Publish button was NOT clicked.');
      console.log('[PublishAssist] HARD GATE: No form submission or POST request was made.');
      console.log('[PublishAssist] HARD GATE: User must click Publish manually on the platform page.');

      return {
        success: true,
        verificationMatch,
        insertedText: insertedText || undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[PublishAssist] prefillCompose error for ' + key + ':', msg);
      return { success: false, verificationMatch: false, error: msg };
    }
  }

  getView(platform: string, accountId: string): PlatformView | undefined {
    return this.views.get(platform + ':' + accountId);
  }

  private waitForAdapterReady(platform: string, accountId: string, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const key = platform + ':' + accountId;

      const timer = setTimeout(() => {
        this.adapterReadyWaiters.delete(key);
        console.warn('[PublishAssist] Adapter-ready timeout for ' + key + ' (' + timeoutMs + 'ms)');
        resolve(false);
      }, timeoutMs);

      this.adapterReadyWaiters.set(key, {
        resolve: () => resolve(true),
        reject: () => { clearTimeout(timer); this.adapterReadyWaiters.delete(key); resolve(false); },
        timer,
      });
    });
  }
}

// --- Singleton ---

let instance: PublishAssistManager | null = null;

export function getPublishAssistManager(): PublishAssistManager {
  if (!instance) {
    instance = new PublishAssistManager();
    instance.init();
  }
  return instance;
}

export function resetPublishAssistManager(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}

// --- Helper ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Prefill JavaScript ---
// HARD GATE: This function ONLY finds the compose element and sets text content.
// It NEVER clicks buttons, submits forms, or makes POST requests.

function prefillJavaScript(selector: string, text: string): { success: boolean; error?: string } {
  'use strict';
  try {
    const elements = document.querySelectorAll(selector);
    if (!elements || elements.length === 0) {
      return { success: false, error: 'Compose element not found' };
    }

    let target: Element | null = null;
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        target = el;
        break;
      }
    }
    if (!target) target = elements[0] as HTMLElement;

    const el = target as HTMLElement;
    el.focus();

    const tagName = el.tagName;
    const role = el.getAttribute('role') || '';
    const isContentEditable = el.isContentEditable || role === 'textbox';
    const isTextarea = tagName === 'TEXTAREA';
    const isInput = tagName === 'INPUT';

    if (isContentEditable) {
      el.textContent = text;
      el.dispatchEvent(new Event('focus', { bubbles: true }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: text }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    } else if (isTextarea || isInput) {
      (el as HTMLTextAreaElement | HTMLInputElement).value = text;
      el.dispatchEvent(new Event('focus', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    } else {
      return { success: false, error: 'Unsupported element type: ' + tagName };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// --- Verify Prefill JavaScript ---

function verifyPrefillJavaScript(selector: string): { text: string } {
  'use strict';
  try {
    const elements = document.querySelectorAll(selector);
    if (!elements || elements.length === 0) return { text: '' };

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      const tagName = el.tagName;
      const role = el.getAttribute('role') || '';

      if (el.isContentEditable || role === 'textbox') {
        const t = el.textContent || '';
        if (t.trim().length > 0) return { text: t };
      } else if (tagName === 'TEXTAREA' || tagName === 'INPUT') {
        const v = (el as HTMLTextAreaElement | HTMLInputElement).value || '';
        if (v.trim().length > 0) return { text: v };
      }
    }

    const first = elements[0] as HTMLElement;
    return { text: first.textContent || (first as HTMLTextAreaElement).value || '' };
  } catch (err) {
    return { text: '' };
  }
}
