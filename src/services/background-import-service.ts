import { Notice, setIcon, Setting } from "obsidian";
import type {
  RssDashboardSettings,
  Feed,
  FeedMetadata,
  FeedIngestionCandidate,
  FeedIngestionOptions,
} from "../types/types";
import { OpmlManager } from "./opml-manager";
import { getFeedErrorMessage } from "./feed-parser";
import {
  BACKGROUND_IMPORT_CONCURRENCY,
  BACKGROUND_IMPORT_FEED_REQUEST_TIMEOUT_MS,
  BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT,
} from "./feed-timeout";
import { setCssProps } from "../utils/platform-utils";

// ── Types ────────────────────────────────────────────────────────────────────

/** Minimum view interface required by BackgroundImportService */
interface DashboardViewLike {
  render(): void;
  refreshSidebarOnly?: () => void;
  refresh?: () => void;
}

/** Minimum feed-parser interface required by BackgroundImportService */
interface FeedParserLike {
  parseFeed(url: string): Promise<Feed>;
}

export interface BackgroundImportServiceDeps {
  feedParser: FeedParserLike;
  getSettings: () => RssDashboardSettings;
  getView: () => Promise<DashboardViewLike | null>;
  saveSettings: () => Promise<void>;
  ensureFolderExists: (
    folder: string,
    opts: { saveSettings: boolean; refreshView: boolean },
  ) => Promise<boolean>;
  addStatusBarItem: () => HTMLElement;
}

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * BackgroundImportService
 *
 * Encapsulates all background-import state and orchestration that was previously
 * scattered across RssDashboardPlugin. Extracted in Phase 3-D of the main.ts refactor.
 */
export class BackgroundImportService {
  private readonly feedParser: FeedParserLike;
  private readonly getSettings: () => RssDashboardSettings;
  private readonly getView: () => Promise<DashboardViewLike | null>;
  private readonly saveSettings: () => Promise<void>;
  private readonly ensureFolderExists: (
    folder: string,
    opts: { saveSettings: boolean; refreshView: boolean },
  ) => Promise<boolean>;
  private readonly addStatusBarItem: () => HTMLElement;

  // ── State ──────────────────────────────────────────────────────────────────

  private importStatusBarItem: HTMLElement | null = null;
  public backgroundImportQueue: FeedMetadata[] = [];
  public isBackgroundImporting = false;
  private backgroundImportInFlightUrls = new Set<string>();
  private backgroundImportProcessedCount = 0;
  private backgroundImportTotalCount = 0;
  private backgroundImportPersistMode:
    | RssDashboardSettings["storageMode"]
    | null = null;

  constructor(deps: BackgroundImportServiceDeps) {
    this.feedParser = deps.feedParser;
    this.getSettings = deps.getSettings;
    this.getView = deps.getView;
    this.saveSettings = deps.saveSettings;
    this.ensureFolderExists = deps.ensureFolderExists;
    this.addStatusBarItem = deps.addStatusBarItem;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  public startBackgroundImport(feeds: Feed[]): void {
    const queuedUrls = new Set(
      this.backgroundImportQueue.map((feed) => feed.url),
    );
    const newQueueItems = feeds
      .filter(
        (feed) =>
          !queuedUrls.has(feed.url) &&
          !this.backgroundImportInFlightUrls.has(feed.url),
      )
      .map((feed) => ({
        ...feed,
        importStatus: "pending" as const,
      }));

    if (newQueueItems.length === 0) {
      return;
    }

    if (
      !this.isBackgroundImporting &&
      this.backgroundImportPersistMode === null
    ) {
      this.backgroundImportPersistMode = this.getSettings().storageMode;
    }

    this.backgroundImportQueue.push(...newQueueItems);
    this.backgroundImportTotalCount += newQueueItems.length;

    if (!this.isBackgroundImporting) {
      void this.processBackgroundImportQueue();
    }
  }

  public async ingestFeedsForBackgroundImport(
    candidates: FeedIngestionCandidate[],
    options?: FeedIngestionOptions,
  ): Promise<{
    addedCount: number;
    skippedCount: number;
    queuedFeeds: Feed[];
  }> {
    const mode = options?.mode || "update";
    const importPersistMode = this.getSettings().storageMode;
    const placeholders: Feed[] = [];
    let skippedCount = 0;
    const seenUrls = new Set<string>();

    if (mode === "overwrite") {
      this.getSettings().feeds = [];
      if (options?.folders) {
        this.getSettings().folders = options.folders;
      }
    } else if (options?.folders) {
      this.getSettings().folders = OpmlManager.mergeFolders(
        this.getSettings().folders,
        options.folders,
      );
    }

    const existingUrls = new Set(
      this.getSettings().feeds.map((feed) => feed.url),
    );
    const totalCandidates = candidates.length;

    for (const candidate of candidates) {
      if (existingUrls.has(candidate.url) || seenUrls.has(candidate.url)) {
        skippedCount += 1;
        options?.onProgress?.(
          placeholders.length + skippedCount,
          totalCandidates,
        );
        continue;
      }

      const placeholder = this.createPlaceholderFeed(candidate);
      placeholders.push(placeholder);
      this.getSettings().feeds.push(placeholder);
      existingUrls.add(candidate.url);
      seenUrls.add(candidate.url);

      if (placeholder.folder) {
        await this.ensureFolderExists(placeholder.folder, {
          saveSettings: false,
          refreshView: false,
        });
      }

      options?.onProgress?.(
        placeholders.length + skippedCount,
        totalCandidates,
      );
    }

    await this.saveSettingsWithMode(importPersistMode);
    const view = await this.getView();
    if (view) {
      view.refresh?.();
    }

    this.backgroundImportPersistMode = importPersistMode;
    this.startBackgroundImport(placeholders);

    return {
      addedCount: placeholders.length,
      skippedCount,
      queuedFeeds: placeholders,
    };
  }

  // ── Private orchestration ──────────────────────────────────────────────────

  private async processBackgroundImportQueue(): Promise<void> {
    if (this.isBackgroundImporting || this.backgroundImportQueue.length === 0) {
      return;
    }

    this.isBackgroundImporting = true;

    if (!this.importStatusBarItem) {
      this.importStatusBarItem = this.addStatusBarItem();
      this.importStatusBarItem.textContent = "";
      const iconSpan = this.importStatusBarItem.createSpan({
        cls: "rss-dashboard-import-statusbar-icon",
      });
      setIcon(iconSpan, "rss");
      this.importStatusBarItem.createSpan({
        cls: "import-statusbar-text",
      });
    }

    const totalFeeds = this.backgroundImportTotalCount;
    const saveEvery =
      totalFeeds >= 20000
        ? 200
        : totalFeeds >= 5000
          ? 100
          : totalFeeds >= 1000
            ? 25
            : 5;
    const renderEvery =
      totalFeeds >= 20000
        ? 500
        : totalFeeds >= 5000
          ? 150
          : totalFeeds >= 1000
            ? 40
            : 3;
    const shouldRenderDuringImport = totalFeeds < 5000;
    const workerCount = Math.min(
      BACKGROUND_IMPORT_CONCURRENCY,
      this.backgroundImportQueue.length,
    );

    try {
      await Promise.all(
        Array.from({ length: workerCount }, () =>
          this.processBackgroundImportWorker(
            saveEvery,
            renderEvery,
            shouldRenderDuringImport,
          ),
        ),
      );

      await this.saveSettingsWithMode(this.getPersistModeForBackgroundImport());
      const view = await this.getView();
      if (view) {
        view.render();
      }

      new Notice(
        `Background import completed. Processed ${this.backgroundImportProcessedCount} feeds.`,
      );
    } finally {
      if (this.importStatusBarItem) {
        this.importStatusBarItem.remove();
        this.importStatusBarItem = null;
      }

      this.isBackgroundImporting = false;
      this.backgroundImportProcessedCount = 0;
      this.backgroundImportTotalCount = 0;
      this.backgroundImportInFlightUrls.clear();

      if (this.backgroundImportQueue.length === 0) {
        this.backgroundImportPersistMode = null;
      }

      if (this.backgroundImportQueue.length > 0) {
        void this.processBackgroundImportQueue();
      }
    }
  }

  private async processBackgroundImportWorker(
    saveEvery: number,
    renderEvery: number,
    shouldRenderDuringImport: boolean,
  ): Promise<void> {
    while (true) {
      const feedMetadata = this.backgroundImportQueue.shift();
      if (!feedMetadata) {
        return;
      }

      this.backgroundImportInFlightUrls.add(feedMetadata.url);

      try {
        feedMetadata.importStatus = "processing";
        this.updateBackgroundImportProgress(
          this.backgroundImportProcessedCount,
          this.backgroundImportTotalCount,
          feedMetadata.title,
        );

        const parsedFeed = await this.parseFeedWithTimeout(feedMetadata.url);
        this.mergeBackgroundImportedFeed(feedMetadata, parsedFeed);
        feedMetadata.importStatus = "completed";
      } catch (error) {
        if (error instanceof Error && error.message === "Timed out") {
          feedMetadata.importStatus = "timed_out";
        } else {
          feedMetadata.importStatus = "failed";
        }
        feedMetadata.importError = getFeedErrorMessage(
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        this.backgroundImportInFlightUrls.delete(feedMetadata.url);
        this.backgroundImportProcessedCount += 1;
      }

      if (this.backgroundImportProcessedCount % saveEvery === 0) {
        await this.saveSettingsWithMode(
          this.getPersistModeForBackgroundImport(),
        );
      }

      if (
        shouldRenderDuringImport &&
        this.backgroundImportProcessedCount % renderEvery === 0
      ) {
        const view = await this.getView();
        if (view) {
          if (typeof view.refreshSidebarOnly === "function") {
            view.refreshSidebarOnly();
          } else {
            view.render();
          }
        }
      }
    }
  }

  private async parseFeedWithTimeout(url: string): Promise<Feed> {
    let lastError: Error | null = null;

    for (
      let attempt = 0;
      attempt <= BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT;
      attempt += 1
    ) {
      try {
        return await this.parseFeedAttemptWithTimeout(url);
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        lastError = normalizedError;

        const shouldRetry =
          normalizedError.message === "Timed out" &&
          attempt < BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT;

        if (!shouldRetry) {
          throw normalizedError;
        }
      }
    }

    throw lastError ?? new Error("Timed out");
  }

  private async parseFeedAttemptWithTimeout(url: string): Promise<Feed> {
    let timeoutId: number | null = null;

    try {
      return await Promise.race([
        this.feedParser.parseFeed(url),
        new Promise<Feed>((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error("Timed out")),
            BACKGROUND_IMPORT_FEED_REQUEST_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  private mergeBackgroundImportedFeed(
    feedMetadata: FeedMetadata,
    parsedFeed: Feed,
  ): void {
    const feedIndex = this.getSettings().feeds.findIndex(
      (f) => f.url === feedMetadata.url,
    );
    if (feedIndex < 0) {
      return;
    }

    const existingFeed = this.getSettings().feeds[feedIndex];
    this.getSettings().feeds[feedIndex] = {
      ...existingFeed,
      title: parsedFeed.title || existingFeed.title || feedMetadata.title,
      author: parsedFeed.author ?? existingFeed.author,
      siteUrl: parsedFeed.siteUrl ?? existingFeed.siteUrl,
      iconUrl: parsedFeed.iconUrl ?? existingFeed.iconUrl,
      mediaType: parsedFeed.mediaType ?? existingFeed.mediaType,
      items: parsedFeed.items.slice(
        0,
        existingFeed.maxItemsLimit || this.getSettings().maxItems,
      ),
      lastUpdated: Date.now(),
    };
  }

  private updateBackgroundImportProgress(
    current: number,
    total: number,
    currentFeedTitle: string,
  ): void {
    if (this.importStatusBarItem) {
      const textSpan = this.importStatusBarItem.querySelector(
        ".import-statusbar-text",
      );
      if (textSpan) {
        textSpan.textContent = `  Fetching articles: ${current}/${total} - ${currentFeedTitle}`;
      }
    }
  }

  private createPlaceholderFeed(candidate: FeedIngestionCandidate): Feed {
    const mediaType = this.resolveCandidateMediaType(candidate);
    let folder = candidate.folder || "Uncategorized";

    if (mediaType === "video" && (!folder || folder === "Uncategorized")) {
      folder = this.getSettings().media.defaultYouTubeFolder;
    } else if (
      mediaType === "podcast" &&
      (!folder || folder === "Uncategorized")
    ) {
      folder = this.getSettings().media.defaultPodcastFolder;
    }

    return {
      title: candidate.title,
      url: candidate.url,
      folder,
      items: [],
      lastUpdated: Date.now(),
      author: candidate.author,
      mediaType,
      autoDetect: candidate.autoDetect,
      customTemplate: candidate.customTemplate,
      customFolder: candidate.customFolder,
      customTags: candidate.customTags,
      autoDeleteDuration:
        typeof candidate.autoDeleteDuration === "number"
          ? candidate.autoDeleteDuration
          : this.getSettings().defaultAutoDeleteDuration,
      maxItemsLimit:
        typeof candidate.maxItemsLimit === "number"
          ? candidate.maxItemsLimit
          : this.getSettings().maxItems,
      scanInterval:
        typeof candidate.scanInterval === "number" ? candidate.scanInterval : 0,
      excludeFromRefresh: candidate.excludeFromRefresh === true,
      keywordRules: candidate.keywordRules || {
        overrideGlobalRules: false,
        includeLogic: "AND",
        rules: [],
      },
    };
  }

  private getPersistModeForBackgroundImport(): RssDashboardSettings["storageMode"] {
    return this.backgroundImportPersistMode ?? this.getSettings().storageMode;
  }

  private async saveSettingsWithMode(
    mode: RssDashboardSettings["storageMode"],
  ): Promise<void> {
    const settings = this.getSettings();
    const previousMode = settings.storageMode;

    if (previousMode !== mode) {
      settings.storageMode = mode;
    }

    try {
      await this.saveSettings();
    } finally {
      if (settings.storageMode !== previousMode) {
        settings.storageMode = previousMode;
      }
    }
  }

  private resolveCandidateMediaType(
    candidate: FeedIngestionCandidate,
  ): "article" | "video" | "podcast" {
    return candidate.mediaType ?? "article";
  }

  private showImportProgressModal(
    totalFeeds: number,
    onMinimize: () => void,
    onAbort: () => void,
  ): HTMLElement {
    const modal = document.body.createDiv({
      cls: "rss-dashboard-modal rss-dashboard-modal-container rss-dashboard-import-modal",
    });

    const modalContent = modal.createDiv({
      cls: "rss-dashboard-modal-content",
    });

    const modalHeader = modalContent.createDiv({
      cls: "rss-dashboard-import-modal-header",
    });

    new Setting(modalHeader).setName("Importing opml feeds").setHeading();

    const minimizeButton = modalHeader.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": "Minimize" },
    });
    setIcon(minimizeButton, "minus");
    minimizeButton.onclick = onMinimize;

    const abortButton = modalHeader.createEl("button", {
      text: "Abort",
      cls: "rss-dashboard-import-abort-button",
    });
    abortButton.onclick = onAbort;

    const buttonGroup = modalHeader.createDiv({
      cls: "import-modal-header-buttons",
    });
    buttonGroup.appendChild(minimizeButton);
    buttonGroup.appendChild(abortButton);

    modalContent.createDiv({
      attr: { id: "import-progress-text" },
      cls: "rss-dashboard-center-text rss-dashboard-import-progress-text",
      text: `Preparing to import ${totalFeeds} feeds...`,
    });

    const progressBar = modalContent.createDiv({
      cls: "rss-dashboard-import-progress-bar",
    });

    const progressFill = progressBar.createDiv({
      attr: { id: "import-progress-fill" },
      cls: "rss-dashboard-import-progress-fill",
    });
    setCssProps(progressFill, { "--progress-width": "0%" });

    modalContent.createDiv({
      attr: { id: "import-current-feed" },
      cls: "rss-dashboard-center-text rss-dashboard-import-current-feed",
    });

    return modal;
  }
}
