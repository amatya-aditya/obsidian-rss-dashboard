import type { Feed } from "../types/types";
import {
  getDueFeeds,
  getNextGlobalRefreshDueAt,
  getNextRefreshDueAt,
  usesGlobalRefreshInterval,
} from "../utils/refresh-intervals";

const MAX_TIMEOUT_MS = 2_147_483_647;
const ACTIVE_BATCH_RECHECK_MS = 1_000;

export interface FeedRefreshSchedulerOptions {
  getFeeds: () => Feed[];
  getGlobalIntervalMinutes: () => number;
  getLastGlobalRefreshCompletedAt: () => number;
  isBatchRunning: () => boolean;
  requestGlobalRefresh: () => Promise<void>;
  requestDueFeeds: (feeds: Feed[]) => Promise<void>;
}

/** Owns one rearmable timer for automatic, per-feed refresh scheduling. */
export class FeedRefreshScheduler {
  private timeoutId: number | null = null;
  private started = false;
  private globalRefreshDeferredUntil: number | null = null;

  constructor(private readonly options: FeedRefreshSchedulerOptions) {}

  public start(): void {
    this.started = true;
    this.reschedule();
  }

  public stop(): void {
    this.started = false;
    this.clearTimer();
  }

  /** Delays the next automatic global attempt after the user cancels one. */
  public deferGlobalRefresh(): void {
    const intervalMinutes = this.options.getGlobalIntervalMinutes();
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      return;
    }

    this.globalRefreshDeferredUntil =
      Date.now() + intervalMinutes * 60 * 1000;
    this.reschedule();
  }

  public reschedule(): void {
    this.clearTimer();
    if (!this.started) {
      return;
    }

    const now = Date.now();
    const feeds = this.options.getFeeds();
    const globalIntervalMinutes = this.options.getGlobalIntervalMinutes();
    const globalDueAt = this.getEffectiveGlobalRefreshDueAt(
      getNextGlobalRefreshDueAt(
        feeds,
        globalIntervalMinutes,
        this.options.getLastGlobalRefreshCompletedAt(),
      ),
      now,
    );
    const dueTimes = [
      globalDueAt,
      ...feeds
        .filter((feed) => !usesGlobalRefreshInterval(feed))
        .map((feed) =>
          getNextRefreshDueAt(feed, globalIntervalMinutes),
        ),
    ].filter((dueAt): dueAt is number => dueAt !== null);

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

    try {
      const feeds = this.options.getFeeds();
      const globalIntervalMinutes = this.options.getGlobalIntervalMinutes();
      const globalDueAt = this.getEffectiveGlobalRefreshDueAt(
        getNextGlobalRefreshDueAt(
          feeds,
          globalIntervalMinutes,
          this.options.getLastGlobalRefreshCompletedAt(),
        ),
        Date.now(),
      );
      if (globalDueAt !== null && globalDueAt <= Date.now()) {
        await this.options.requestGlobalRefresh();
        return;
      }

      const dueFeeds = getDueFeeds(
        feeds.filter((feed) => !usesGlobalRefreshInterval(feed)),
        globalIntervalMinutes,
        Date.now(),
      );
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

  private getEffectiveGlobalRefreshDueAt(
    globalDueAt: number | null,
    now: number,
  ): number | null {
    if (globalDueAt === null) {
      this.globalRefreshDeferredUntil = null;
      return null;
    }

    if (
      this.globalRefreshDeferredUntil !== null &&
      now < this.globalRefreshDeferredUntil
    ) {
      return Math.max(globalDueAt, this.globalRefreshDeferredUntil);
    }

    this.globalRefreshDeferredUntil = null;
    return globalDueAt;
  }
}
