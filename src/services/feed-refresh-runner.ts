import { Notice } from "obsidian";
import type { Feed, RssDashboardSettings } from "../types/types";
import type { FeedParser } from "./feed-parser";
import type { BackgroundImportService } from "./background-import-service";
import type { FeedRefreshScheduler } from "./feed-refresh-scheduler";
import {
  FEED_REQUEST_TIMEOUT_MS,
  FEED_SOFT_TIMEOUT_MS,
  MAX_CONCURRENT_FETCHES,
} from "./feed-timeout";
import { globalFetchSemaphore } from "./feed-parser/fetch-semaphore";
import type { PreviewImageCache } from "./preview-image-cache";
import {
  FEED_REFRESH_RENDER_THROTTLE_MS,
  type FeedOperationTracker,
} from "./feed-operation-tracker";
import {
  RefreshRunTally,
  refreshFailedMessage,
  refreshFinishedMessage,
  refreshStartedMessage,
  refreshStoppedMessage,
  shouldAnnounceFinish,
  type FeedRefreshOutcome,
} from "./refresh-announcements";

/** The dashboard view methods the runner redraws through. main.ts supplies the view. */
export interface RefreshDashboardViewLike {
  refresh(): void;
  refreshSidebarOnly?: () => void;
  refreshFilterStatusBarOnly?: () => void;
  refreshGlobalRefreshProgressOnly?: () => void;
}

export type FeedRefreshIntent = "global" | "targeted" | "due" | "failed";

export interface FeedRefreshRunnerOptions {
  feedOperationTracker: FeedOperationTracker;
  previewImageCache: PreviewImageCache;
  /** Returns the live settings object; the runner never holds its own copy. */
  getSettings: () => RssDashboardSettings;
  /** Read on every call: the parser is rebuilt after a settings reload. */
  getFeedParser: () => FeedParser;
  getBackgroundImportService: () => BackgroundImportService | undefined;
  getAutoRefreshScheduler: () => FeedRefreshScheduler | null;
  saveSettings: () => Promise<void>;
  validateSavedArticles: () => Promise<void>;
  clearFeedShardHealth: (feed: Feed) => void;
  getActiveDashboardView: () => Promise<RefreshDashboardViewLike | null>;
  /** Says one refresh event to every open dashboard's live region. */
  announce: (message: string) => void;
  /**
   * The plugin's refreshFeeds facade. Retry-failed and folder refreshes go
   * through it, so a caller that replaces plugin.refreshFeeds still sees them.
   */
  refreshFeeds: (
    selectedFeeds?: Feed[],
    intent?: FeedRefreshIntent,
  ) => Promise<void>;
}

/**
 * Refreshes feeds: picks the eligible ones, fetches one directly or a batch
 * under bounded concurrency with soft and hard timeouts, merges each result
 * into settings, then saves, reschedules, redraws and reports.
 */
export class FeedRefreshRunner {
  private readonly feedOperationTracker: FeedOperationTracker;
  private readonly previewImageCache: PreviewImageCache;

  constructor(private readonly options: FeedRefreshRunnerOptions) {
    this.feedOperationTracker = options.feedOperationTracker;
    this.previewImageCache = options.previewImageCache;
  }

  private get settings(): RssDashboardSettings {
    return this.options.getSettings();
  }

  private get feedParser(): FeedParser {
    return this.options.getFeedParser();
  }

  private get backgroundImportService(): BackgroundImportService | undefined {
    return this.options.getBackgroundImportService();
  }

  private get autoRefreshScheduler(): FeedRefreshScheduler | null {
    return this.options.getAutoRefreshScheduler();
  }

  public async refreshFeeds(
    selectedFeeds?: Feed[],
    intent: FeedRefreshIntent = selectedFeeds ? "targeted" : "global",
  ) {
    try {
      const candidateFeeds = selectedFeeds || this.settings.feeds;
      if (candidateFeeds.length === 0) {
        return;
      }

      const feedsToRefresh = this.getRefreshableFeeds(candidateFeeds);
      if (feedsToRefresh.length === 0) {
        new Notice(
          selectedFeeds
            ? "All selected feeds are excluded from refresh."
            : "All feeds are excluded from refresh.",
        );
        return;
      }

      if (!this.feedParser) {
        console.warn(
          "[RSS dashboard] Feed parser not initialized; skipping refresh.",
        );
        return;
      }

      let feedNoticeText = "";
      if (feedsToRefresh.length === 1) {
        const singleFeed = feedsToRefresh[0];
        if (!singleFeed) {
          return;
        }
        feedNoticeText = singleFeed.title;
      } else {
        feedNoticeText = `${feedsToRefresh.length} feeds`;
      }

      new Notice(`Refreshing ${feedNoticeText}...`);
      if (feedsToRefresh.length === 1 && intent !== "global") {
        const singleFeed = feedsToRefresh[0];
        if (!singleFeed) {
          return;
        }
        await this.refreshSingleFeed(
          singleFeed,
          feedNoticeText,
          false,
          intent === "due",
        );
        return;
      }

      await this.refreshFeedBatch(feedsToRefresh, feedNoticeText, intent);
    } catch (error) {
      console.error(`[RSS dashboard] Error refreshing feeds:`, error);
      new Notice(
        `Error refreshing  ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      this.options.announce(refreshFailedMessage(error));
    }
  }

  public async refreshFailedFeeds(): Promise<void> {
    const failedFeeds = this.settings.feeds.filter(
      (feed) =>
        Boolean(feed.lastFetchError) && !this.isFeedExcludedFromRefresh(feed),
    );

    if (failedFeeds.length === 0) {
      new Notice("No failed feeds to retry.");
      return;
    }

    await this.options.refreshFeeds(failedFeeds, "failed");
  }

  public async refreshSelectedFeed(feed: Feed) {
    try {
      if (!this.feedParser) {
        console.warn(
          "[RSS dashboard] Feed parser not initialized; skipping refresh.",
        );
        return;
      }

      new Notice(`Refreshing ${feed.title}...`);
      await this.refreshSingleFeed(feed, feed.title, false);
    } catch (error) {
      console.error(`[RSS dashboard] Error refreshing feeds:`, error);
      new Notice(
        `Error refreshing  ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      this.options.announce(refreshFailedMessage(error));
    }
  }

  public async refreshFeedsInFolder(folderPath: string) {
    const feedsInFolder = this.settings.feeds.filter((feed) => {
      if (!feed.folder) return false;
      return (
        feed.folder === folderPath || feed.folder.startsWith(folderPath + "/")
      );
    });

    if (feedsInFolder.length > 0) {
      await this.options.refreshFeeds(feedsInFolder);
    } else {
      new Notice("No feeds found in the selected folder");
    }
  }

  private isFeedExcludedFromRefresh(feed: Feed): boolean {
    return feed.excludeFromRefresh === true;
  }

  private getRefreshableFeeds(feeds: Feed[]): Feed[] {
    return feeds.filter(
      (feed) =>
        !this.isFeedExcludedFromRefresh(feed) &&
        !this.backgroundImportService?.isFeedPendingImport(feed.url),
    );
  }

  private mergeRefreshedFeed(updatedFeed: Feed): void {
    const index = this.settings.feeds.findIndex(
      (f) => f.url === updatedFeed.url,
    );
    if (index >= 0) {
      const storedFeed = this.settings.feeds[index];
      if (!storedFeed) {
        return;
      }
      this.settings.feeds[index] = {
        ...updatedFeed,
        feedId: updatedFeed.feedId ?? storedFeed.feedId,
        excludeFromRefresh:
          updatedFeed.excludeFromRefresh ?? storedFeed.excludeFromRefresh,
      };
    }
  }

  /**
   * The guids a feed holds before its fetch. The parser rewrites the stored
   * feed's items in place, so this has to be read before the fetch starts, not
   * when the result comes back.
   */
  private snapshotGuids(feed: Feed): Set<string> {
    return new Set(feed.items.map((item) => item.guid));
  }

  private finalizeRefreshAttempt(
    feed: Feed,
    updatedFeed?: Feed,
    error?: unknown,
    guidsBeforeFetch?: Set<string>,
  ): FeedRefreshOutcome {
    const completedAt = Date.now();
    if (updatedFeed) {
      const newArticles = guidsBeforeFetch
        ? updatedFeed.items.filter((item) => !guidsBeforeFetch.has(item.guid))
            .length
        : 0;
      this.mergeRefreshedFeed({
        ...updatedFeed,
        lastRefreshAttemptCompletedAt: completedAt,
        lastFetchError: updatedFeed.lastFetchError,
      });
      if (!updatedFeed.lastFetchError) {
        this.options.clearFeedShardHealth(feed);
      }
      this.previewImageCache.warmFeed(updatedFeed);
      return { newArticles, failed: Boolean(updatedFeed.lastFetchError) };
    }

    const failedOutcome: FeedRefreshOutcome = { newArticles: 0, failed: true };
    const index = this.settings.feeds.findIndex(
      (storedFeed) => storedFeed === feed || storedFeed.url === feed.url,
    );
    if (index < 0) {
      return failedOutcome;
    }

    const storedFeed = this.settings.feeds[index];
    if (!storedFeed) {
      return failedOutcome;
    }

    this.settings.feeds[index] = {
      ...storedFeed,
      lastRefreshAttemptCompletedAt: completedAt,
      lastFetchError: error instanceof Error ? error.message : String(error),
    };
    return failedOutcome;
  }

  private async refreshSingleFeed(
    feed: Feed,
    feedNoticeText: string,
    isExplicitGlobalRefresh: boolean,
    quiet = false,
  ): Promise<void> {
    const operation = this.feedOperationTracker.trackOperation();
    const cancelSignal = operation.signal;
    const tally = new RefreshRunTally();
    try {
      if (!quiet) {
        this.options.announce(refreshStartedMessage(feedNoticeText));
      }
      this.feedOperationTracker.setFeedStatus(feed.url, {
        status: "processing",
        startedAt: Date.now(),
      });
      try {
        await this.feedOperationTracker.renderStatus();
        if (cancelSignal.aborted) return;
        const guidsBeforeFetch = this.snapshotGuids(feed);
        const updatedFeed = await this.refreshFeedWithTimeout(feed, {
          signal: cancelSignal,
        });
        tally.recordFeed(
          this.finalizeRefreshAttempt(
            feed,
            updatedFeed,
            undefined,
            guidsBeforeFetch,
          ),
        );
      } catch (error) {
        if (cancelSignal.aborted) return;
        this.finalizeRefreshAttempt(feed, undefined, error);
        if (isExplicitGlobalRefresh) {
          this.settings.lastGlobalRefreshCompletedAt = Date.now();
        }
        await this.options.saveSettings();
        if (cancelSignal.aborted) return;
        this.autoRefreshScheduler?.reschedule();
        throw error;
      } finally {
        this.feedOperationTracker.clearFeedStatus(feed.url);
        await this.feedOperationTracker.renderStatus();
      }
      if (cancelSignal.aborted) return;
      await this.options.validateSavedArticles();
      if (cancelSignal.aborted) return;
      if (isExplicitGlobalRefresh) {
        this.settings.lastGlobalRefreshCompletedAt = Date.now();
      }
      await this.options.saveSettings();
      if (cancelSignal.aborted) return;
      this.autoRefreshScheduler?.reschedule();
      const view = await this.options.getActiveDashboardView();
      if (cancelSignal.aborted) return;
      if (view) {
        view.refresh();
        new Notice(`Feeds refreshed: ${feedNoticeText}`);
      }
      if (shouldAnnounceFinish(tally, quiet)) {
        this.options.announce(refreshFinishedMessage(tally));
      }
    } finally {
      operation.release();
    }
  }

  private async refreshFeedBatch(
    feedsToRefresh: Feed[],
    feedNoticeText: string,
    intent: FeedRefreshIntent,
  ): Promise<void> {
    if (this.feedOperationTracker.isDisposed) return;
    if (this.feedOperationTracker.isRunning) {
      new Notice("A multi-feed refresh is already in progress.");
      return;
    }

    const cancelSignal = this.feedOperationTracker.startBatch(
      feedsToRefresh.length,
      intent === "global",
    );
    if (!cancelSignal) return;

    const refreshSummary = {
      failed: 0,
      timedOut: 0,
    };
    const tally = new RefreshRunTally();
    const quiet = intent === "due";
    if (!quiet) {
      this.options.announce(refreshStartedMessage(feedNoticeText));
    }

    for (const feed of feedsToRefresh) {
      this.feedOperationTracker.setFeedStatus(feed.url, {
        status: "pending",
        startedAt: Date.now(),
      });
    }

    let nextFeedIndex = 0;
    let lastRenderAt = 0;

    const refreshView = async (force = false): Promise<void> => {
      const now = Date.now();
      if (!force && now - lastRenderAt < FEED_REFRESH_RENDER_THROTTLE_MS) {
        return;
      }

      const view = await this.options.getActiveDashboardView();
      if (view) {
        if (force) {
          if (typeof view.refreshSidebarOnly === "function") {
            view.refreshSidebarOnly();
            if (typeof view.refreshFilterStatusBarOnly === "function") {
              view.refreshFilterStatusBarOnly();
            }
          } else {
            view.refresh();
          }
        } else if (
          typeof view.refreshGlobalRefreshProgressOnly === "function"
        ) {
          view.refreshGlobalRefreshProgressOnly();
        }
      }
      lastRenderAt = now;
    };

    const backgroundPromises: Promise<void>[] = [];

    const worker = async (): Promise<void> => {
      while (true) {
        await globalFetchSemaphore.acquire();

        if (this.feedOperationTracker.isCancelled) {
          globalFetchSemaphore.release();
          return;
        }

        const currentFeed = feedsToRefresh[nextFeedIndex];
        nextFeedIndex += 1;
        if (!currentFeed) {
          globalFetchSemaphore.release();
          return;
        }

        const refreshPromise = this.processRefreshBatchFeed(
          currentFeed,
          refreshSummary,
          tally,
          refreshView,
          cancelSignal,
        ).finally(() => {
          globalFetchSemaphore.release();
        });

        const softTimeout = this.feedOperationTracker.createSoftTimeout(
          FEED_SOFT_TIMEOUT_MS,
          cancelSignal,
        );
        const winner = await Promise.race([
          refreshPromise.then(() => "fetch" as const),
          softTimeout.promise,
        ]);
        softTimeout.cancel();

        if (winner === "timeout") backgroundPromises.push(refreshPromise);
        if (winner === "cancelled") return;
      }
    };

    const workerCount = Math.min(MAX_CONCURRENT_FETCHES, feedsToRefresh.length);

    try {
      const workers = Array.from({ length: workerCount }, () => worker());
      await refreshView(true);
      await Promise.all(workers);
      await Promise.all(backgroundPromises);

      if (this.feedOperationTracker.isDisposed) return;
      await this.options.validateSavedArticles();
      if (this.feedOperationTracker.isDisposed) return;
      if (intent === "global" && !this.feedOperationTracker.isCancelled) {
        this.settings.lastGlobalRefreshCompletedAt = Date.now();
      }
      await this.options.saveSettings();
      if (this.feedOperationTracker.isDisposed) return;
      this.autoRefreshScheduler?.reschedule();
      this.feedOperationTracker.markIdle();
      const view = await this.options.getActiveDashboardView();
      if (view) {
        view.refresh();
      }

      if (!this.feedOperationTracker.isCancelled) {
        const failureSuffix = this.buildRefreshFailureSummary(
          refreshSummary,
          intent === "global",
        );
        new Notice(`Feeds refreshed: ${feedNoticeText}${failureSuffix}`);
        if (shouldAnnounceFinish(tally, quiet)) {
          this.options.announce(refreshFinishedMessage(tally));
        }
      } else {
        this.options.announce(refreshStoppedMessage());
      }
    } finally {
      await this.feedOperationTracker.end();
    }
  }

  private buildRefreshFailureSummary(
    summary: { failed: number; timedOut: number },
    includeRetryHint: boolean,
  ): string {
    const parts: string[] = [];
    if (summary.timedOut > 0) {
      parts.push(`${summary.timedOut} timed out`);
    }
    if (summary.failed > 0) {
      parts.push(`${summary.failed} failed`);
    }

    if (parts.length === 0) {
      return "";
    }

    const suffix = ` (${parts.join(", ")})`;
    return includeRetryHint
      ? `${suffix} Shift+click Refresh all feeds to retry failed feeds.`
      : suffix;
  }

  private async processRefreshBatchFeed(
    currentFeed: Feed,
    refreshSummary: { failed: number; timedOut: number },
    tally: RefreshRunTally,
    refreshView: () => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    this.feedOperationTracker.setFeedStatus(currentFeed.url, {
      status: "processing",
      startedAt: Date.now(),
    });
    this.feedOperationTracker.scheduleSidebarRender();

    try {
      const guidsBeforeFetch = this.snapshotGuids(currentFeed);
      const updatedFeed = await this.refreshFeedWithTimeout(currentFeed, {
        signal,
      });
      this.feedOperationTracker.recordSettled();
      if (!this.feedOperationTracker.isCancelled) {
        tally.recordFeed(
          this.finalizeRefreshAttempt(
            currentFeed,
            updatedFeed,
            undefined,
            guidsBeforeFetch,
          ),
        );
      }
    } catch (error) {
      this.feedOperationTracker.recordSettled();
      if (!this.feedOperationTracker.isCancelled) {
        this.finalizeRefreshAttempt(currentFeed, undefined, error);
        tally.recordThrown(error);
      }
      const isTimedOut =
        error instanceof Error && error.message === "Timed out";
      if (isTimedOut) {
        refreshSummary.timedOut += 1;
      } else {
        refreshSummary.failed += 1;
      }

      console.error(
        `[RSS dashboard] Error refreshing feed ${currentFeed.title}:`,
        error,
      );
    } finally {
      this.feedOperationTracker.clearFeedStatus(currentFeed.url);
      this.feedOperationTracker.scheduleSidebarRender(
        this.feedOperationTracker.activeFeedCount === 0,
      );
      if (!this.feedOperationTracker.isDisposed) await refreshView();
    }
  }

  private async refreshFeedWithTimeout(
    feed: Feed,
    options?: { signal?: AbortSignal },
  ): Promise<Feed> {
    const timeout = this.feedOperationTracker.createSoftTimeout(
      FEED_REQUEST_TIMEOUT_MS,
      options?.signal,
    );
    try {
      const winner = await Promise.race([
        this.refreshFeedDirect(feed, options).then((value) => ({
          kind: "feed" as const,
          value,
        })),
        timeout.promise,
      ]);
      if (winner === "timeout") throw new Error("Timed out");
      if (winner === "cancelled") throw new Error("Refresh stopped");
      return winner.value;
    } finally {
      timeout.cancel();
    }
  }

  private async refreshFeedDirect(
    feed: Feed,
    options?: { signal?: AbortSignal },
  ): Promise<Feed> {
    if (typeof this.feedParser.refreshFeed === "function") {
      return await this.feedParser.refreshFeed(feed, options);
    }

    const updatedFeeds = await this.feedParser.refreshAllFeeds([feed]);
    return updatedFeeds[0] ?? feed;
  }
}
