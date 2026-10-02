import { Notice } from "obsidian";
import type {
  Feed,
  FeedEncoding,
  FeedKeywordRulesSettings,
  RssDashboardSettings,
} from "../types/types";
import {
  applyFeedRetentionLimits,
  formatFeedParseNoticeMessage,
  type FeedParser,
} from "./feed-parser";
import type { FeedOperationTracker } from "./feed-operation-tracker";
import { MediaService } from "./media-service";
import type { PreviewImageCache } from "./preview-image-cache";

/** The dashboard view method the service redraws through. main.ts supplies the view. */
export interface FeedSubscriptionViewLike {
  refresh(): void;
}

export interface FeedSubscriptionAddOptions {
  showNotice?: boolean;
  feedEncoding?: FeedEncoding;
  globalOperation?: boolean;
}

export interface FeedSubscriptionServiceOptions {
  feedOperationTracker: FeedOperationTracker;
  previewImageCache: PreviewImageCache;
  /** Returns the live settings object; the service never holds its own copy. */
  getSettings: () => RssDashboardSettings;
  /** Read on every call: the parser is rebuilt after a settings reload. */
  getFeedParser: () => FeedParser;
  saveSettings: () => Promise<void>;
  ensureFolderExists: (
    folderPath: string,
    options?: { saveSettings?: boolean; refreshView?: boolean },
  ) => Promise<boolean>;
  getActiveDashboardView: () => Promise<FeedSubscriptionViewLike | null>;
}

/**
 * Changes which feeds and folders the user subscribes to: adds and edits
 * feeds, creates subfolders, and re-applies the retention limits to every
 * stored feed.
 */
export class FeedSubscriptionService {
  private readonly feedOperationTracker: FeedOperationTracker;
  private readonly previewImageCache: PreviewImageCache;
  private readonly pendingFeedUrls = new Set<string>();

  constructor(private readonly options: FeedSubscriptionServiceOptions) {
    this.feedOperationTracker = options.feedOperationTracker;
    this.previewImageCache = options.previewImageCache;
  }

  private get settings(): RssDashboardSettings {
    return this.options.getSettings();
  }

  private get feedParser(): FeedParser {
    return this.options.getFeedParser();
  }

  private reserveFeedUrl(
    url: string,
    showNotice: boolean,
    reportPendingDuplicate: boolean,
  ): (() => void) | null {
    if (this.settings.feeds.some((feed) => feed.url === url)) {
      if (showNotice) {
        new Notice("This feed URL already exists");
      }
      return null;
    }

    if (this.pendingFeedUrls.has(url)) {
      if (showNotice || reportPendingDuplicate) {
        new Notice("This feed URL already exists");
      }
      return null;
    }

    this.pendingFeedUrls.add(url);
    return () => {
      this.pendingFeedUrls.delete(url);
    };
  }

  /**
   * Apply feed limits (maxItemsLimit and autoDeleteDuration) to all feeds
   * This is useful when users want to apply their current settings to existing feeds
   */
  async applyFeedLimitsToAllFeeds(): Promise<void> {
    try {
      let updatedCount = 0;

      for (const feed of this.settings.feeds) {
        const originalCount = feed.items.length;
        const updated = applyFeedRetentionLimits(feed, {
          protections: {
            protectStarred: this.settings.protectStarred,
            protectSaved: this.settings.protectSaved,
            protectTagged: this.settings.protectTagged,
            protectUnread: this.settings.protectUnread,
          },
          useFirstSeenDateFallback: this.settings.useFirstSeenDateFallback,
        });
        feed.items = updated.items;

        if (feed.items.length !== originalCount) {
          updatedCount++;
        }
      }

      await this.options.saveSettings();
      const view = await this.options.getActiveDashboardView();
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

  async addFeed(
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
    options?: FeedSubscriptionAddOptions,
  ): Promise<boolean> {
    const showNotice = options?.showNotice !== false;
    let releaseReservation = () => {};
    try {
      const reservation = this.reserveFeedUrl(
        url,
        showNotice,
        options?.globalOperation === true,
      );
      if (!reservation) return false;
      releaseReservation = reservation;

      const newFeed = this.buildNewFeed(
        title,
        url,
        folder,
        autoDeleteDuration,
        maxItemsLimit,
        scanInterval,
        feedKeywordRules,
        customTemplate,
        excludeFromRefresh,
        customTags,
        options,
      );

      const operationSignal = options?.globalOperation
        ? this.feedOperationTracker.begin(1)
        : null;
      if (options?.globalOperation && !operationSignal) {
        return false;
      }

      // Try to parse the feed BEFORE adding it to settings
      try {
        const parsedFeed = await this.feedParser.parseFeed(url, newFeed, {
          allowEmpty: true,
          signal: operationSignal ?? undefined,
        });
        if (operationSignal?.aborted || this.feedOperationTracker.isCancelled) {
          return false;
        }
        const feedToStore = this.mergeParsedFeed(newFeed, parsedFeed);
        await this.storeAddedFeed(feedToStore, title, showNotice);
        return true;
      } catch (error) {
        if (showNotice) {
          new Notice(formatFeedParseNoticeMessage(error));
        }
        return false;
      } finally {
        if (operationSignal) {
          await this.feedOperationTracker.end();
        }
      }
    } catch (error) {
      if (showNotice) {
        new Notice(
          `Error adding feed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
      return false;
    } finally {
      releaseReservation();
    }
  }

  private buildNewFeed(
    title: string,
    url: string,
    folder: string,
    autoDeleteDuration: number | undefined,
    maxItemsLimit: number | undefined,
    scanInterval: number | undefined,
    feedKeywordRules: FeedKeywordRulesSettings | undefined,
    customTemplate: string | undefined,
    excludeFromRefresh: boolean | undefined,
    customTags: string[] | undefined,
    options: FeedSubscriptionAddOptions | undefined,
  ): Feed {
    let mediaType: "article" | "video" | "podcast" = "article";
    if (folder === this.settings.media.defaultYouTubeFolder) {
      mediaType = "video";
    } else if (folder === this.settings.media.defaultPodcastFolder) {
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
          : this.settings.defaultAutoDeleteDuration,
      maxItemsLimit:
        typeof maxItemsLimit === "number"
          ? maxItemsLimit
          : this.settings.maxItems,
      scanInterval: typeof scanInterval === "number" ? scanInterval : 0,
      excludeFromRefresh: excludeFromRefresh === true,
      mediaType: mediaType,
      customTemplate: customTemplate || undefined,
      customTags:
        Array.isArray(customTags) && customTags.length > 0
          ? [...customTags]
          : undefined,
      feedEncoding:
        options?.feedEncoding === "windows-1251"
          ? options.feedEncoding
          : undefined,
      keywordRules: feedKeywordRules || {
        overrideGlobalRules: false,
        includeLogic: "AND",
        rules: [],
      },
    };
    return newFeed;
  }

  private mergeParsedFeed(newFeed: Feed, parsedFeed: Feed): Feed {
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
    return feedToStore;
  }

  private async storeAddedFeed(
    feedToStore: Feed,
    title: string,
    showNotice: boolean,
  ): Promise<void> {
    if (feedToStore.folder) {
      await this.options.ensureFolderExists(feedToStore.folder, {
        saveSettings: false,
        refreshView: false,
      });
    }

    // Re-apply tags after ensureFolderExists so folder auto-tags resolve
    // against the current folder tree (parseFeed also tags, but may run
    // before missing folder paths are created).
    const feedWithTags = MediaService.applyMediaTags(
      feedToStore,
      this.settings.availableTags,
      this.settings.media,
      this.settings.folders,
    );

    // Only add to settings if parsing succeeded
    this.settings.feeds.push(feedWithTags);
    await this.options.saveSettings();
    this.previewImageCache.warmFeed(feedWithTags);

    const view = await this.options.getActiveDashboardView();
    if (view) {
      void view.refresh();
    }
    if (showNotice) {
      new Notice(`Feed "${title}" added`);
    }
  }

  async addSubfolder(
    parentFolderName: string,
    subfolderName: string,
  ): Promise<void> {
    const parentFolder = this.settings.folders.find(
      (f) => f.name === parentFolderName,
    );

    if (parentFolder) {
      if (!parentFolder.subfolders.some((sf) => sf.name === subfolderName)) {
        parentFolder.subfolders.push({
          name: subfolderName,
          subfolders: [],
        });

        await this.options.saveSettings();

        const view = await this.options.getActiveDashboardView();
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

  async editFeed(
    feed: Feed,
    newTitle: string,
    newUrl: string,
    newFolder: string,
  ): Promise<void> {
    if (
      newUrl !== feed.url &&
      this.settings.feeds.some((other) => other !== feed && other.url === newUrl)
    ) {
      new Notice("This feed URL already exists");
      return;
    }

    if (newFolder) {
      await this.options.ensureFolderExists(newFolder, {
        saveSettings: false,
        refreshView: false,
      });
    }

    const oldTitle = feed.title;
    const oldUrl = feed.url;
    feed.title = newTitle;
    feed.url = newUrl;
    feed.folder = newFolder;

    if (oldUrl !== newUrl) {
      feed.lastRefreshAttemptCompletedAt = 0;
      feed.lastFetchError = undefined;
    }

    // Update feedTitle for all articles in this feed when the title changes
    if (oldTitle !== newTitle) {
      for (const item of feed.items) {
        item.feedTitle = newTitle;
      }
    }

    await this.options.saveSettings();

    const view = await this.options.getActiveDashboardView();
    if (view) {
      void view.refresh();
      new Notice(`Feed "${newTitle}" updated`);
    }
  }
}
