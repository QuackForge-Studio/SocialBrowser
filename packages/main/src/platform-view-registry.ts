export interface PlatformViewEntry {
  webContentsId: number;
  platform: string;
  accountId: string;
  partition: string;
}

class PlatformViewRegistry {
  private readonly entries: Map<number, PlatformViewEntry> = new Map();

  register(entry: PlatformViewEntry): void {
    this.entries.set(entry.webContentsId, entry);
  }

  unregister(webContentsId: number): void {
    this.entries.delete(webContentsId);
  }

  get(webContentsId: number): PlatformViewEntry | undefined {
    return this.entries.get(webContentsId);
  }

  has(webContentsId: number): boolean {
    return this.entries.has(webContentsId);
  }

  getAll(): PlatformViewEntry[] {
    return Array.from(this.entries.values());
  }

  getCount(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const platformViewRegistry = new PlatformViewRegistry();
