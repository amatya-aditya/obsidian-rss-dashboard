import type { Feed } from "../types/types";
import { getDueFeeds, getNextRefreshDueAt } from "../utils/refresh-intervals";

const MAX_TIMEOUT_MS = 2_147_483_647;
const ACTIVE_BATCH_RECHECK_MS = 1_000;

export interface FeedRefreshSchedulerOptions {
  getFeeds: () => Feed[];
  getGlobalIntervalMinutes: () => number;
  isBatchRunning: () => boolean;
  requestDueFeeds: (feeds: Feed[]) => Promise<void>;
}

/** Owns one rearmable timer for automatic, per-feed refresh scheduling. */
export class FeedRefreshScheduler {
  private timeoutId: number | null = null;
  private started = false;

  constructor(private readonly options: FeedRefreshSchedulerOptions) {}

  public start(): void {
    this.started = true;
    this.reschedule();
  }

  public stop(): void {
    this.started = false;
    this.clearTimer();
  }

  public reschedule(): void {
    this.clearTimer();
    if (!this.started) {
      return;
    }

    const now = Date.now();
    const dueTimes = this.options
      .getFeeds()
      .map((feed) =>
        getNextRefreshDueAt(feed, this.options.getGlobalIntervalMinutes()),
      )
      .filter((dueAt): dueAt is number => dueAt !== null);

    if (dueTimes.length === 0) {
      return;
    }

    const earliestDueAt = Math.min(...dueTimes);
    const delay = Math.min(Math.max(0, earliestDueAt - now), MAX_TIMEOUT_MS);
    this.timeoutId = window.setTimeout(() => {
      this.timeoutId = null;
      void this.handleWakeup();
    }, delay);
  }

  private async handleWakeup(): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.options.isBatchRunning()) {
      this.timeoutId = window.setTimeout(() => {
        this.timeoutId = null;
        void this.handleWakeup();
      }, ACTIVE_BATCH_RECHECK_MS);
      return;
    }

    const dueFeeds = getDueFeeds(
      this.options.getFeeds(),
      this.options.getGlobalIntervalMinutes(),
      Date.now(),
    );
    try {
      if (dueFeeds.length > 0) {
        await this.options.requestDueFeeds(dueFeeds);
      }
    } finally {
      this.reschedule();
    }
  }

  private clearTimer(): void {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
