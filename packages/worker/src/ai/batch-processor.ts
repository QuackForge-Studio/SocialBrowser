import { AiRunTracker } from './ai-run-tracker';

export interface BatchProcessorOptions {
  maxConcurrent: number;
  maxRetries: number;
  costLimitDaily: number;
}

export class BatchProcessor {
  private maxConcurrent: number;
  private maxRetries: number;
  private costLimitDaily: number;
  private running: number = 0;
  private queue: Array<() => void> = [];
  private tracker: AiRunTracker | null = null;
  private shutdownRequested: boolean = false;

  constructor(options: BatchProcessorOptions) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent);
    this.maxRetries = Math.max(0, options.maxRetries);
    this.costLimitDaily = Math.max(0, options.costLimitDaily);
  }

  setRunTracker(tracker: AiRunTracker): void {
    this.tracker = tracker;
  }

  updateOptions(options: Partial<BatchProcessorOptions>): void {
    if (options.maxConcurrent !== undefined) {
      this.maxConcurrent = Math.max(1, options.maxConcurrent);
    }
    if (options.maxRetries !== undefined) {
      this.maxRetries = Math.max(0, options.maxRetries);
    }
    if (options.costLimitDaily !== undefined) {
      this.costLimitDaily = Math.max(0, options.costLimitDaily);
    }
    this.drainQueue();
  }

  getOptions(): BatchProcessorOptions {
    return {
      maxConcurrent: this.maxConcurrent,
      maxRetries: this.maxRetries,
      costLimitDaily: this.costLimitDaily,
    };
  }

  get activeCount(): number {
    return this.running;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.shutdownRequested) {
      throw new Error('BatchProcessor is shutting down');
    }
    if (this.tracker && this.costLimitDaily > 0) {
      if (this.tracker.isDailyCostExceeded(this.costLimitDaily)) {
        throw new Error('Daily cost limit exceeded ($' + this.costLimitDaily.toFixed(4) + ')');
      }
    }
    if (this.running < this.maxConcurrent) {
      return this.runWithRetry(fn, 0);
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        this.runWithRetry(fn, 0).then(resolve).catch(reject);
      });
    });
  }

  private async runWithRetry<T>(fn: () => Promise<T>, attempt: number): Promise<T> {
    this.running++;
    try {
      const result = await fn();
      return result;
    } catch (err) {
      if (attempt < this.maxRetries && !this.shutdownRequested) {
        const baseDelay = Math.min(100 * Math.pow(2, attempt), 30000);
        const jitter = Math.random() * 50;
        const delay = baseDelay + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.runWithRetry(fn, attempt + 1);
      }
      throw err;
    } finally {
      this.running--;
      this.drainQueue();
    }
  }

  private drainQueue(): void {
    if (this.shutdownRequested) return;
    while (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) setImmediate(next);
    }
  }

  requestShutdown(): void {
    this.shutdownRequested = true;
    const remaining = this.queue;
    this.queue = [];
    for (const item of remaining) {
      setImmediate(() => {
        try { throw new Error('BatchProcessor is shutting down'); } catch { }
      });
    }
  }
}