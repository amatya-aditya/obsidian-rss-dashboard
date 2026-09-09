const MAX_TIMEOUT_MS = 2_147_483_647;

export interface FreshRssAutoSyncSchedulerOptions {
  /** Called once, on the plugin's own window timer, when an armed delay elapses. */
  onWake: () => void;
}

/**
 * Owns one rearmable timer for automatic FreshRSS sync scheduling, mirroring
 * `FeedRefreshScheduler`'s rearmable-timer shape. Unlike that per-feed
 * scheduler, this class does not decide WHEN to next fire on its own --
 * ticket 08's coordinator computes the next delay (the configured interval
 * from a cycle's completion, or a backoff deadline read from the FreshRSS
 * sidecar) and calls `armInMs`. This keeps scheduling policy in one place
 * (the coordinator) and leaves this class as a small, purely mechanical,
 * unload-safe timer.
 */
export class FreshRssAutoSyncScheduler {
  private timeoutId: number | null = null;
  private started = false;

  constructor(private readonly options: FreshRssAutoSyncSchedulerOptions) {}

  /** Enables the scheduler. Does not itself arm a timer -- the caller decides the first delay. */
  public start(): void {
    this.started = true;
  }

  /** Disables the scheduler and cancels any armed timer. Safe to call repeatedly, including from `onunload`. */
  public stop(): void {
    this.started = false;
    this.clearTimer();
  }

  public get isStarted(): boolean {
    return this.started;
  }

  /**
   * Arms the timer to call `onWake` once after `delayMs`, replacing any
   * previously armed timer. A no-op while stopped, so a late rearm attempt
   * after `stop()` (e.g. from an in-flight cycle's completion handler)
   * cannot resurrect a timer the plugin has already torn down.
   */
  public armInMs(delayMs: number): void {
    this.clearTimer();
    if (!this.started) {
      return;
    }
    const clampedDelay = Math.min(Math.max(0, delayMs), MAX_TIMEOUT_MS);
    this.timeoutId = window.setTimeout(() => {
      this.timeoutId = null;
      this.options.onWake();
    }, clampedDelay);
  }

  /** Cancels any armed timer without disabling the scheduler outright. */
  public disarm(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
