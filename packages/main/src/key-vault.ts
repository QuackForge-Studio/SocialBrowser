import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const VAULT_FILENAME = 'social-browser-keys.json';

/**
 * In-memory key store used as fallback when safeStorage is unavailable
 * (e.g., in test environments or headless setups).
 */
class InMemoryStore {
  private readonly data = new Map<string, string>();

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

/**
 * KeyVault stores and retrieves API keys using OS-level encryption.
 *
 * On supported platforms (Windows with DPAPI, macOS with Keychain),
 * Electron's safeStorage encrypts the key before writing to disk.
 * The encrypted blob is stored in a JSON file in the app's userData directory.
 *
 * For environments where safeStorage is not available (CI, tests, headless),
 * an in-memory fallback is used.
 *
 * The renderer process never receives key values — only { configured: boolean }.
 */
export class KeyVault {
  private readonly vaultPath: string | null = null;
  private readonly inMemory: InMemoryStore;
  private data: Record<string, string> = {};
  private loaded = false;

  constructor(options?: { vaultPath?: string; inMemory?: boolean }) {
    this.inMemory = new InMemoryStore();

    if (options?.inMemory) {
      return; // Use in-memory store exclusively
    }

    if (options?.vaultPath) {
      this.vaultPath = options.vaultPath;
    } else {
      try {
        const userData = app.getPath('userData');
        this.vaultPath = path.join(userData, VAULT_FILENAME);
      } catch {
        // app.getPath may not be available outside Electron main process
        this.vaultPath = null;
      }
    }
  }

  private load(): void {
    if (this.loaded || !this.vaultPath) return;
    this.loaded = true;

    try {
      if (fs.existsSync(this.vaultPath)) {
        const raw = fs.readFileSync(this.vaultPath, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch {
      this.data = {};
    }
  }

  private save(): void {
    if (!this.vaultPath) return;
    try {
      const dir = path.dirname(this.vaultPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.vaultPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch {
      // Best-effort persistence
    }
  }

  private storageKey(provider: string): string {
    return `ai:${provider}:api-key`;
  }

  setApiKey(provider: string, apiKey: string): void {
    if (!apiKey) return;
    const key = this.storageKey(provider);

    if (!this.vaultPath || !this.canEncrypt()) {
      this.inMemory.set(key, apiKey);
      return;
    }

    this.load();
    try {
      const encrypted = safeStorage.encryptString(apiKey);
      this.data[key] = encrypted.toString('base64');
      this.save();
    } catch {
      this.inMemory.set(key, apiKey);
    }
  }

  getApiKey(provider: string): string | null {
    const key = this.storageKey(provider);

    const memValue = this.inMemory.get(key);
    if (memValue !== null) return memValue;

    if (!this.vaultPath) return null;
    this.load();
    const entry = this.data[key];
    if (!entry) return null;

    try {
      if (this.canEncrypt()) {
        return safeStorage.decryptString(Buffer.from(entry, 'base64'));
      }
      return Buffer.from(entry, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }

  hasApiKey(provider: string): boolean {
    const key = this.storageKey(provider);
    if (this.inMemory.has(key)) return true;
    if (!this.vaultPath) return false;
    this.load();
    return this.data[key] !== undefined;
  }

  deleteApiKey(provider: string): void {
    const key = this.storageKey(provider);
    this.inMemory.delete(key);
    if (this.vaultPath) {
      this.load();
      delete this.data[key];
      this.save();
    }
  }

  private canEncrypt(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  clear(): void {
    this.inMemory.clear();
    this.data = {};
    this.loaded = false;
    if (this.vaultPath) {
      try {
        if (fs.existsSync(this.vaultPath)) {
          fs.unlinkSync(this.vaultPath);
        }
      } catch { /* best effort */ }
    }
  }

  getVaultPath(): string | null {
    return this.vaultPath;
  }
}

let defaultInstance: KeyVault | null = null;

export function getKeyVault(): KeyVault {
  if (!defaultInstance) {
    defaultInstance = new KeyVault();
  }
  return defaultInstance;
}

export function setKeyVaultInstance(vault: KeyVault): void {
  defaultInstance = vault;
}