/**
 * FeedOrchestrator
 *
 * Owns every method that mutates or refreshes Feed objects:
 *   - refreshFeeds / refreshFeedBatch / refreshSingleFeed
 *   - addFeed / addYouTubeFeed / editFeed / addSubfolder
 *   - applyFeedLimitsToAllFeeds
 *   - all private helpers (mergeRefreshedFeed, getRefreshableFeeds, …)
 *
 * These were previously methods on RssDashboardPlugin (main.ts). They are
 * extracted here to satisfy Phase 5 of the main-refactoring-roadmap.
 *
 * Backward compatibility: main.ts retains 1-line delegating facades for every
 * public method so that the 71+ call-sites using `this.plugin.*` continue to
 * work without modification.
 */

import { Notice } from "obsidian";
import type {
  Feed,
  RssDashboardSettings,
  FeedKeywordRulesSettings,
} from "../types/types";
import { FeedParser } from "./feed-parser";
import {
  applyFeedRetentionLimits,
  formatFeedParseNoticeMessage,
} from "./feed-parser";
import { MediaService } from "./media-service";
import { FEED_REQUEST_TIMEOUT_MS } from "./feed-timeout";

// ---------------------------------------------------------------------------
// Dependency interfaces – minimal surface area for easy testing
// ---------------------------------------------------------------------------

export interface IPluginForFeedOrchestrator {
  settings: RssDashboardSettings;
  feedParser: FeedParser;
  saveSettings(): Promise<void>;
  getActiveDashboardView(): Promise<{ refresh(): void; refreshSidebarOnly?(): void } | null>;
  ensureFolderExists(
    folderPath: string,
    options?: { saveSettings?: boolean; refreshView?: boolean },
  ): Promise<boolean>;
  validateSavedArticles?(): Promise<void>;
}

// ---------------------------------------------------------------------------

export class FeedOrchestrator {
  private static readonly FEED_REFRESH_CONCURRENCY = 4;
  private static readonly FEED_REFRESH_RENDER_THROTTLE_MS = 250;

  /** Mirrors the flag on RssDashboardPlugin for sidebar query purposes. */
  public isMultiFeedRefreshRunning = false;
  /** Mirrors the Map on RssDashboardPlugin for sidebar progress display. */
  public activeRefreshState: Map<string, { status: string; startedAt: number }>;

  constructor(
    private readonly plugin: IPluginForFeedOrchestrator,
    sharedRefreshState: Map<string, { status: string; startedAt: number }>,
  ) {
    this.activeRefreshState = sharedRefreshState;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  public async refreshFeeds(selectedFeeds?: Feed[]): Promise<void> {
    try {
      const candidateFeeds = selectedFeeds || this.plugin.settings.feeds;
      if (candidateFeeds.length === 0) return;

      const feedsToRefresh = this.getRefreshableFeeds(candidateFeeds);
      if (feedsToRefresh.length === 0) {
        new Notice(
          selectedFeeds
            ? "All selected feeds are excluded from refresh."
            : "All feeds are excluded from refresh.",
        );
        return;
      }

      if (!this.plugin.feedParser) {
        console.warn(
          "[RSS dashboard] Feed parser not initialized; skipping refresh.",
        );
        return;
      }

      let feedNoticeText = "";
      if (feedsToRefresh.length === 1) {
        feedNoticeText = feedsToRefresh[0].title;
      } else {
        feedNoticeText = `${feedsToRefresh.length} feeds`;
      }

      new Notice(`Refreshing ${feedNoticeText}...`);
      if (feedsToRefresh.length === 1) {
        await this.refreshSingleFeed(feedsToRefresh[0], feedNoticeText);
        return;
      }

      await this.refreshFeedBatch(feedsToRefresh, feedNoticeText);
    } catch (error) {
      console.error("[RSS dashboard] Error refreshing feeds:", error);
      new Notice(
        `Error refreshing  ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async refreshSelectedFeed(feed: Feed): Promise<void> {
    try {
      if (!this.plugin.feedParser) {
        console.warn(
          "[RSS dashboard] Feed parser not initialized; skipping refresh.",
        );
        return;
      }

      new Notice(`Refreshing ${feed.title}...`);
      await this.refreshSingleFeed(feed, feed.title);
    } catch (error) {
      console.error(`[RSS dashboard] Error refreshing feeds:`, error);
      new Notice(
        `Error refreshing  ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async applyFeedLimitsToAllFeeds(): Promise<void> {
    try {
      let updatedCount = 0;

      for (const feed of this.plugin.settings.feeds) {
        const originalCount = feed.items.length;
        const updated = applyFeedRetentionLimits(feed);
        feed.items = updated.items;

        if (feed.items.length !== originalCount) {
          updatedCount++;
        }
      }

      await this.plugin.saveSettings();
      const view = await this.plugin.getActiveDashboardView();
      if (view) {
        view.refresh();
      }

      if (updatedCount > 0) {
        new Notice(`Applied limits to ${updatedCount} feeds`);
      } else {
        new Notice("No feeds needed limit adjustments");
      }
    } catch (error) {
      new Notice(
        `Error applying feed limits: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async addFeed(
    title: string,
    url: string,
    folder: string,
    autoDeleteDuration?: number,
    maxItemsLimit?: number,
    scanInterval?: number,
    feedKeywordRules?: FeedKeywordRulesSettings,
    customTemplate?: string,
    excludeFromRefresh?: boolean,
    customTags?: string[],
    options?: { showNotice?: boolean },
  ): Promise<boolean> {
    const showNotice = options?.showNotice !== false;
    try {
      if (this.plugin.settings.feeds.some((f) => f.url === url)) {
        if (showNotice) {
          new Notice("This feed URL already exists");
        }
        return false;
      }

      let mediaType: "article" | "video" | "podcast" = "article";
      if (folder === this.plugin.settings.media.defaultYouTubeFolder) {
        mediaType = "video";
      } else if (folder === this.plugin.settings.media.defaultPodcastFolder) {
        mediaType = "podcast";
      }

      const newFeed: Feed = {
        title,
        url,
        folder,
        items: [],
        lastUpdated: Date.now(),
        autoDeleteDuration:
          typeof autoDeleteDuration === "number"
            ? autoDeleteDuration
            : this.plugin.settings.defaultAutoDeleteDuration,
        maxItemsLimit:
          typeof maxItemsLimit === "number"
            ? maxItemsLimit
            : this.plugin.settings.maxItems,
        scanInterval: typeof scanInterval === "number" ? scanInterval : 0,
        excludeFromRefresh: excludeFromRefresh === true,
        mediaType: mediaType,
        customTemplate: customTemplate || undefined,
        customTags:
          Array.isArray(customTags) && customTags.length > 0
            ? [...customTags]
            : undefined,
        keywordRules: feedKeywordRules || {
          overrideGlobalRules: false,
          includeLogic: "AND",
          rules: [],
        },
      };

      try {
        const parsedFeed = await this.plugin.feedParser.parseFeed(url, newFeed, {
          allowEmpty: true,
        });
        const feedToStore: Feed = {
          ...newFeed,
          ...parsedFeed,
          autoDeleteDuration:
            typeof parsedFeed.autoDeleteDuration === "number"
              ? parsedFeed.autoDeleteDuration
              : newFeed.autoDeleteDuration,
          maxItemsLimit:
            typeof parsedFeed.maxItemsLimit === "number"
              ? parsedFeed.maxItemsLimit
              : newFeed.maxItemsLimit,
          scanInterval:
            typeof parsedFeed.scanInterval === "number"
              ? parsedFeed.scanInterval
              : newFeed.scanInterval,
          excludeFromRefresh:
            parsedFeed.excludeFromRefresh ?? newFeed.excludeFromRefresh,
          customTemplate: parsedFeed.customTemplate ?? newFeed.customTemplate,
          customTags: parsedFeed.customTags ?? newFeed.customTags,
          keywordRules: parsedFeed.keywordRules ?? newFeed.keywordRules,
        };
        if (feedToStore.folder) {
          await this.plugin.ensureFolderExists(feedToStore.folder, {
            saveSettings: false,
            refreshView: false,
          });
        }

        const feedWithTags = MediaService.applyMediaTags(
          feedToStore,
          this.plugin.settings.availableTags,
          this.plugin.settings.media,
          this.plugin.settings.folders,
        );

        this.plugin.settings.feeds.push(feedWithTags);
        await this.plugin.saveSettings();

        const view = await this.plugin.getActiveDashboardView();
        if (view) {
          void view.refresh();
        }
        if (showNotice) {
          new Notice(`Feed "${title}" added`);
        }
        return true;
      } catch (error) {
        if (showNotice) {
          new Notice(formatFeedParseNoticeMessage(error));
        }
        return false;
      }
    } catch (error) {
      if (showNotice) {
        new Notice(
          `Error adding feed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
      return false;
    }
  }

  public async addYouTubeFeed(
    input: string,
    customTitle?: string,
  ): Promise<void> {
    try {
      const feedUrl = await MediaService.getYouTubeRssFeed(input);

      if (!feedUrl) {
        new Notice("Unable to determine YouTube feed URL from input");
        return;
      }

      if (this.plugin.settings.feeds.some((f) => f.url === feedUrl)) {
        new Notice("This YouTube feed already exists");
        return;
      }

      const title = customTitle || `YouTube: ${input}`;
      await this.addFeed(
        title,
        feedUrl,
        this.plugin.settings.media.defaultYouTubeFolder,
      );
    } catch (error) {
      new Notice(
        `Error adding YouTube feed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async editFeed(
    feed: Feed,
    newTitle: string,
    newUrl: string,
    newFolder: string,
  ): Promise<void> {
    if (newFolder) {
      await this.plugin.ensureFolderExists(newFolder, {
        saveSettings: false,
        refreshView: false,
      });
    }

    const oldTitle = feed.title;
    feed.title = newTitle;
    feed.url = newUrl;
    feed.folder = newFolder;

    if (oldTitle !== newTitle) {
      for (const item of feed.items) {
        item.feedTitle = newTitle;
      }
    }

    await this.plugin.saveSettings();

    const view = await this.plugin.getActiveDashboardView();
    if (view) {
      void view.refresh();
      new Notice(`Feed "${newTitle}" updated`);
    }
  }

  public async addSubfolder(
    parentFolderName: string,
    subfolderName: string,
  ): Promise<void> {
    const parentFolder = this.plugin.settings.folders.find(
      (f) => f.name === parentFolderName,
    );

    if (parentFolder) {
      if (!parentFolder.subfolders.some((sf) => sf.name === subfolderName)) {
        parentFolder.subfolders.push({
          name: subfolderName,
          subfolders: [],
        });

        await this.plugin.saveSettings();

        const view = await this.plugin.getActiveDashboardView();
        if (view) {
          void view.refresh();
          new Notice(
            `Subfolder "${subfolderName}" created under "${parentFolderName}"`,
          );
        }
      } else {
        new Notice(
          `Subfolder "${subfolderName}" already exists in "${parentFolderName}"`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private isFeedExcludedFromRefresh(feed: Feed): boolean {
    return feed.excludeFromRefresh === true;
  }

  private getRefreshableFeeds(feeds: Feed[]): Feed[] {
    return feeds.filter((feed) => !this.isFeedExcludedFromRefresh(feed));
  }

  private mergeRefreshedFeed(updatedFeed: Feed): void {
    const index = this.plugin.settings.feeds.findIndex(
      (f) => f.url === updatedFeed.url,
    );
    if (index >= 0) {
      this.plugin.settings.feeds[index] = {
        ...updatedFeed,
        excludeFromRefresh:
          updatedFeed.excludeFromRefresh ??
          this.plugin.settings.feeds[index].excludeFromRefresh,
      };
    }
  }

  private async refreshSingleFeed(
    feed: Feed,
    feedNoticeText: string,
  ): Promise<void> {
    const updatedFeed = await this.refreshFeedWithTimeout(feed);
    this.mergeRefreshedFeed(updatedFeed);

    if (this.plugin.validateSavedArticles) {
      await this.plugin.validateSavedArticles();
    }
    this.plugin.settings.lastRefreshTimestamp = Date.now();
    await this.plugin.saveSettings();
    const view = await this.plugin.getActiveDashboardView();
    if (view) {
      view.refresh();
      new Notice(`Feeds refreshed: ${feedNoticeText}`);
    }
  }

  private async refreshFeedBatch(
    feedsToRefresh: Feed[],
    feedNoticeText: string,
  ): Promise<void> {
    if (this.isMultiFeedRefreshRunning) {
      new Notice("A multi-feed refresh is already in progress.");
      return;
    }

    this.isMultiFeedRefreshRunning = true;
    this.activeRefreshState.clear();
    const refreshSummary = { failed: 0, timedOut: 0 };

    for (const feed of feedsToRefresh) {
      this.activeRefreshState.set(feed.url, {
        status: "pending",
        startedAt: Date.now(),
      });
    }

    let nextFeedIndex = 0;
    let lastRenderAt = 0;

    const refreshView = async (force = false): Promise<void> => {
      const now = Date.now();
      if (
        !force &&
        now - lastRenderAt < FeedOrchestrator.FEED_REFRESH_RENDER_THROTTLE_MS
      ) {
        return;
      }

      const view = await this.plugin.getActiveDashboardView();
      if (view) {
        if (typeof view.refreshSidebarOnly === "function") {
          view.refreshSidebarOnly();
        } else {
          view.refresh();
        }
      }
      lastRenderAt = now;
    };

    const worker = async (): Promise<void> => {
      while (true) {
        const currentFeed = feedsToRefresh[nextFeedIndex];
        nextFeedIndex += 1;
        if (!currentFeed) return;

        this.activeRefreshState.set(currentFeed.url, {
          status: "processing",
          startedAt: Date.now(),
        });

        try {
          const updatedFeed = await this.refreshFeedWithTimeout(currentFeed);
          this.mergeRefreshedFeed(updatedFeed);
        } catch (error) {
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
          this.activeRefreshState.delete(currentFeed.url);

          if (this.activeRefreshState.size > 0) {
            await refreshView();
          }
        }
      }
    };

    const workerCount = Math.min(
      FeedOrchestrator.FEED_REFRESH_CONCURRENCY,
      feedsToRefresh.length,
    );

    try {
      const workers = Array.from({ length: workerCount }, () => worker());
      await refreshView(true);
      await Promise.all(workers);

      if (this.plugin.validateSavedArticles) {
        await this.plugin.validateSavedArticles();
      }
      this.plugin.settings.lastRefreshTimestamp = Date.now();
      await this.plugin.saveSettings();
      this.activeRefreshState.clear();
      this.isMultiFeedRefreshRunning = false;
      const view = await this.plugin.getActiveDashboardView();
      if (view) {
        view.refresh();
      }

      const failureSuffix = this.buildRefreshFailureSummary(refreshSummary);
      new Notice(`Feeds refreshed: ${feedNoticeText}${failureSuffix}`);
    } finally {
      this.activeRefreshState.clear();
      this.isMultiFeedRefreshRunning = false;
    }
  }

  private buildRefreshFailureSummary(summary: {
    failed: number;
    timedOut: number;
  }): string {
    const parts: string[] = [];
    if (summary.timedOut > 0) {
      parts.push(`${summary.timedOut} timed out`);
    }
    if (summary.failed > 0) {
      parts.push(`${summary.failed} failed`);
    }
    if (parts.length === 0) return "";
    return ` (${parts.join(", ")})`;
  }

  private async refreshFeedWithTimeout(feed: Feed): Promise<Feed> {
    return await Promise.race([
      this.refreshFeedDirect(feed),
      new Promise<Feed>((_, reject) => {
        activeWindow.setTimeout(
          () => reject(new Error("Timed out")),
          FEED_REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  }

  private async refreshFeedDirect(feed: Feed): Promise<Feed> {
    const parser = this.plugin.feedParser;
    if (typeof (parser as { refreshFeed?: unknown }).refreshFeed === "function") {
      return await (parser as { refreshFeed(feed: Feed): Promise<Feed> }).refreshFeed(feed);
    }

    const updatedFeeds = await parser.refreshAllFeeds([feed]);
    return updatedFeeds[0] ?? feed;
  }
}
