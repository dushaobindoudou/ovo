export type SchedulerTaskFn = () => Promise<void> | void;

export interface SchedulerTaskConfig {
  id: string;
  intervalMs: number;
  task: SchedulerTaskFn;
  runImmediately?: boolean;
  onError?: (error: unknown) => void;
  /** optional queue-size probe used for monitoring (e.g. EventProcessor buffer length) */
  queueSize?: () => number;
}

export interface SchedulerTaskStatus {
  id: string;
  intervalMs: number;
  lastRunAt: number;
  lastDurationMs: number;
  runCount: number;
  errorCount: number;
  running: boolean;
  lastError?: string;
  queueSize?: number;
}

interface SchedulerEntry {
  config: SchedulerTaskConfig;
  timer: NodeJS.Timeout | null;
  status: SchedulerTaskStatus;
}

/**
 * Unified timer manager for recurring main-process tasks.
 * Supports concurrency dedupe, error capture, and status readouts for observability.
 */
export class Scheduler {
  private readonly tasks = new Map<string, SchedulerEntry>();

  register(config: SchedulerTaskConfig) {
    this.unregister(config.id);
    const status: SchedulerTaskStatus = {
      id: config.id,
      intervalMs: config.intervalMs,
      lastRunAt: 0,
      lastDurationMs: 0,
      runCount: 0,
      errorCount: 0,
      running: false
    };
    const entry: SchedulerEntry = { config, timer: null, status };
    this.tasks.set(config.id, entry);

    const run = async () => {
      if (entry.status.running) return; // concurrency dedupe
      entry.status.running = true;
      const start = Date.now();
      try {
        await config.task();
      } catch (error) {
        entry.status.errorCount += 1;
        entry.status.lastError = error instanceof Error ? error.message : String(error);
        try {
          config.onError?.(error);
        } catch {
          /* swallow onError errors to avoid cascade */
        }
      } finally {
        entry.status.lastRunAt = Date.now();
        entry.status.lastDurationMs = entry.status.lastRunAt - start;
        entry.status.runCount += 1;
        entry.status.running = false;
      }
    };

    if (config.runImmediately) {
      void run();
    }
    entry.timer = setInterval(() => {
      void run();
    }, config.intervalMs);
  }

  unregister(id: string) {
    const entry = this.tasks.get(id);
    if (!entry) return;
    if (entry.timer) clearInterval(entry.timer);
    this.tasks.delete(id);
  }

  setInterval(id: string, intervalMs: number) {
    const entry = this.tasks.get(id);
    if (!entry) return;
    const config = { ...entry.config, intervalMs };
    this.register(config);
  }

  has(id: string) {
    return this.tasks.has(id);
  }

  getStatus(): SchedulerTaskStatus[] {
    return Array.from(this.tasks.values()).map((entry) => ({
      ...entry.status,
      queueSize: entry.config.queueSize ? entry.config.queueSize() : undefined
    }));
  }

  stopAll() {
    for (const id of Array.from(this.tasks.keys())) this.unregister(id);
  }
}

export const scheduler = new Scheduler();
