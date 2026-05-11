import {
  App,
  Plugin,
  Notice,
  WorkspaceLeaf,
  Platform,
  requireApiVersion,
} from "obsidian";

import {
  RssDashboardSettings,
  DEFAULT_SETTINGS,
  Feed,
  FeedItem,
  FeedMetadata,
  FeedRefreshState,
  FeedKeywordRulesSettings,
  FeedIngestionCandidate,
  FeedIngestionOptions,
} from "./src/types/types";
import { RssDashboardSettingTab } from "./src/settings/settings-tab";
import {
  RssDashboardView,
  RSS_DASHBOARD_VIEW_TYPE,
} from "./src/views/dashboard-view";
import {
  DiscoverView,
  RSS_DISCOVER_VIEW_TYPE,
} from "./src/views/discover-view";
import {
  KagiSmallwebView,
  RSS_SMALLWEB_VIEW_TYPE,
} from "./src/views/kagi-smallweb-view";
import { ReaderView, RSS_READER_VIEW_TYPE } from "./src/views/reader-view";
import {
  FeedParser,
  applyFeedRetentionLimits,
  formatFeedParseNoticeMessage,
} from "./src/services/feed-parser";
import { ArticleSaver } from "./src/services/article-saver";
import { BackupService } from "./src/services/backup-service";
import { FolderService } from "./src/services/folder-service";
import {
  FeedStorageRepository,
  type FeedStorageStatus,
} from "./src/services/feed-storage-repository";
import { ImportExportService } from "./src/services/import-export-service";
import { BackgroundImportService } from "./src/services/background-import-service";
import { FEED_REQUEST_TIMEOUT_MS } from "./src/services/feed-timeout";
import { OpmlManager } from "./src/services/opml-manager";
import { MediaService } from "./src/services/media-service";

import { ImportOpmlModal } from "./src/modals/import-opml-modal";
import { normalizeRefreshIntervalMinutes } from "./src/utils/validation";
import {
  dedupeAndNormalizeFeedItems,
  loadAndNormalizeSettings,
  migrateSettings,
} from "./src/utils/settings-loader";
import { applyAutomaticArticleTags } from "./src/utils/tag-utils";

export interface FiltersUpdatedEventPayload {
  source: string;
  feedUrl?: string;
  timestamp: number;
}

const STORAGE_LOG_PREFIX = "[RSS Dashboard][Storage]";

function storageLog(message: string, details?: unknown): void {
  if (details === undefined) {
    console.debug(`${STORAGE_LOG_PREFIX} ${message}`);
    return;
  }

  console.debug(`${STORAGE_LOG_PREFIX} ${message}`, details);
}

function storageError(message: string, error: unknown, details?: unknown): void {
  if (details === undefined) {
    console.error(`${STORAGE_LOG_PREFIX} ${message}`, error);
    return;
  }

  console.error(`${STORAGE_LOG_PREFIX} ${message}`, details, error);
}

// Re-exported for backward compatibility with callers that import from main.ts
export type {
  FeedIngestionCandidate,
  FeedIngestionOptions,
} from "./src/types/types";

export default class RssDashboardPlugin extends Plugin {
  private static readonly FACTORY_RESET_LOCAL_STORAGE_KEYS = [
    "rss-discover-filters",
    "rss-podcast-progress",
    "rss-first-launch-coachmark-shown",
  ] as const;

  settings!: RssDashboardSettings;
  feedParser!: FeedParser;
  articleSaver!: ArticleSaver;
  private backupService!: BackupService;
  private folderService!: FolderService;
  private importExportService!: ImportExportService;
  private backgroundImportService!: BackgroundImportService;
  public activeRefreshState = new Map<string, FeedRefreshState>();
  public settingTab: RssDashboardSettingTab | null = null;
  private isMultiFeedRefreshRunning = false;
  public vaultAbsolutePath = "";
  private _beforeUnloadHandler: (() => void) | null = null;
  private hasCompletedStartupSavedArticleValidation = false;
  private static readonly FEED_REFRESH_CONCURRENCY = 4;
  private static readonly FEED_REFRESH_RENDER_THROTTLE_MS = 250;
  private readonly feedStorageRepository: FeedStorageRepository;

  constructor(app: App, manifest: ConstructorParameters<typeof Plugin>[1]) {
    super(app, manifest);
    this.feedStorageRepository = new FeedStorageRepository(app);
  }

  private initializeSettingsBackedServices(): void {
    this.feedParser = new FeedParser(
      this.settings.media,
      this.settings.availableTags,
    );
    this.articleSaver = new ArticleSaver(this.app, this.settings.articleSaving);
    this.importExportService = new ImportExportService({
      settings: this.settings,
      isMobile: Platform.isMobileApp,
      getPortableDataBundle: () => this.getPortableDataBundle(),
    });
    this.backupService = new BackupService({
      settings: this.settings,
      manifest: this.manifest,
      vaultAbsolutePath: this.vaultAbsolutePath,
      vault: this.app.vault,
      getUserSettingsJson: () => this.importExportService.getUserSettingsJson(),
      getPortableDataBundleJson: () =>
        JSON.stringify(this.getPortableDataBundle(), null, 2),
    });
    this.folderService = new FolderService(this.settings);
    this.backgroundImportService = new BackgroundImportService({
      feedParser: this.feedParser,
      getSettings: () => this.settings,
      getView: () => this.getActiveDashboardView(),
      saveSettings: () => this.saveSettings(),
      ensureFolderExists: (folder, opts) =>
        this.ensureFolderExists(folder, opts),
      addStatusBarItem: () => this.addStatusBarItem(),
    });
  }

  private cloneFactoryResetFolders(
    folders: RssDashboardSettings["folders"],
    timestamp: number,
  ): RssDashboardSettings["folders"] {
    return folders.map((folder) => ({
      ...folder,
      subfolders: this.cloneFactoryResetFolders(
        folder.subfolders ?? [],
        timestamp,
      ),
      createdAt: timestamp,
      modifiedAt: timestamp,
    }));
  }

  private buildFactoryResetSettings(): RssDashboardSettings {
    const settings = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as RssDashboardSettings;
    const timestamp = Date.now();

    settings.folders = this.cloneFactoryResetFolders(
      DEFAULT_SETTINGS.folders,
      timestamp,
    );

    return settings;
  }

  private clearFactoryResetLocalStorage(): void {
    const appWithLocalStorage = this.app as unknown as {
      removeLocalStorage?: (key: string) => void;
      saveLocalStorage?: (key: string, value: unknown) => void;
    };

    for (const key of RssDashboardPlugin.FACTORY_RESET_LOCAL_STORAGE_KEYS as readonly string[]) {
      if (typeof appWithLocalStorage.removeLocalStorage === "function") {
        appWithLocalStorage.removeLocalStorage(key);
        continue;
      }

      if (typeof appWithLocalStorage.saveLocalStorage === "function") {
        appWithLocalStorage.saveLocalStorage(key, null);
      }
    }
  }

  /** Backward-compatible getter so sidebar and tests can read the import queue */
  public get backgroundImportQueue(): FeedMetadata[] {
    return this.backgroundImportService?.backgroundImportQueue ?? [];
  }

  /** Backward-compatible setter so tests can pre-populate the import queue */
  public set backgroundImportQueue(value: FeedMetadata[]) {
    if (this.backgroundImportService) {
      this.backgroundImportService.backgroundImportQueue = value;
    }
  }

  /** Backward-compatible accessor so test assertions can read import state */
  private get isBackgroundImporting(): boolean {
    return this.backgroundImportService?.isBackgroundImporting ?? false;
  }

  private getAutoRefreshIntervalMs(): number | null {
    const normalizedMinutes = normalizeRefreshIntervalMinutes(
      this.settings.refreshInterval,
    );

    if (normalizedMinutes <= 0) {
      return null;
    }

    return normalizedMinutes * 60 * 1000;
  }

  private async reconcileSavedArticlesOnStartup(): Promise<void> {
    if (this.hasCompletedStartupSavedArticleValidation) {
      return;
    }

    this.hasCompletedStartupSavedArticleValidation = true;

    const allArticles = this.getAllArticles();
    await this.articleSaver.fixSavedFilePaths(allArticles);

    await this.validateSavedArticles();
  }

  private scheduleStartupSavedArticleValidation(): void {
    const workspaceWithLayoutReady = this.app
      .workspace as typeof this.app.workspace & {
      onLayoutReady?: (callback: () => void) => void;
    };

    if (typeof workspaceWithLayoutReady.onLayoutReady === "function") {
      workspaceWithLayoutReady.onLayoutReady(() => {
        void this.reconcileSavedArticlesOnStartup();
      });
      return;
    }

    void this.reconcileSavedArticlesOnStartup();
  }

  public async getActiveDashboardView(): Promise<RssDashboardView | null> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof RssDashboardView) {
        return view;
      }
    }
    return null;
  }

  public async refreshDashboardViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof RssDashboardView) {
        view.refresh();
      }
    }
  }

  public get isMultiFeedRefreshActive(): boolean {
    return this.isMultiFeedRefreshRunning;
  }

  public notifyFiltersUpdated(payload: FiltersUpdatedEventPayload): void {
    this.app.workspace.trigger("rss-dashboard:filters-updated", payload);
  }

  public async getActiveDiscoverView(): Promise<DiscoverView | null> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DISCOVER_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof DiscoverView) {
        return view;
      }
    }
    return null;
  }

  public async getActiveReaderView(): Promise<ReaderView | null> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof ReaderView) {
        return view;
      }
    }
    return null;
  }

  public async refreshOpenTagColorViews(): Promise<void> {
    const dashboardLeaves = this.app.workspace.getLeavesOfType(
      RSS_DASHBOARD_VIEW_TYPE,
    );
    for (const leaf of dashboardLeaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof RssDashboardView) {
        view.refreshTagColors();
      }
    }

    const readerLeaves =
      this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
    for (const leaf of readerLeaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof ReaderView) {
        view.refreshTagColors();
      }
    }
  }

  public async performFactoryReset(): Promise<void> {
    const resetSettings = this.buildFactoryResetSettings();
    this.settings = resetSettings;
    this.activeRefreshState.clear();
    this.isMultiFeedRefreshRunning = false;
    this.initializeSettingsBackedServices();
    this.clearFactoryResetLocalStorage();

    await this.saveSettings();

    const dashboardView = await this.getActiveDashboardView();
    if (dashboardView) {
      dashboardView.refresh();
    }

    const discoverView = await this.getActiveDiscoverView();
    if (discoverView) {
      discoverView.render();
    }

    if (this.settingTab) {
      this.settingTab.display();
    }

    new Notice("RSS Dashboard restored to factory defaults.");
  }

  public async openTagsSettings(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const setting = (this.app as any).setting;
    if (setting) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      setting.open();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      setting.openTabById(this.manifest.id);
      if (this.settingTab) {
        this.settingTab.activateTab("Tags");
      }
    }
  }

  public async openSettingsToTab(
    tabName: string,
    sectionName?: string,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const setting = (this.app as any).setting;
    if (setting) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      setting.open();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      setting.openTabById(this.manifest.id);
      if (this.settingTab) {
        this.settingTab.activateTab(tabName, sectionName);
      }
    }
  }

  async onload() {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    const adapter = this.app.vault.adapter as any;
    if (adapter.getBasePath)
      this.vaultAbsolutePath = adapter.getBasePath() as string;
    else if (adapter.getFullPath)
      this.vaultAbsolutePath = adapter.getFullPath(".") as string;
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

    await this.loadSettings();

    const shouldRefreshOnOpen = (): boolean => {
      const intervalMs = this.getAutoRefreshIntervalMs();
      if (intervalMs === null) return false;
      if (!this.settings.lastRefreshTimestamp) return true;
      const elapsed = Date.now() - this.settings.lastRefreshTimestamp;
      return elapsed >= intervalMs;
    };

    // Register a window-level beforeunload listener for reliable backup
    // on Obsidian quit. onunload is NOT reliably called by Electron on window close.
    this._beforeUnloadHandler = () => {
      this.backupService.performAutoBackupsSyncDesktop();
    };
    window.addEventListener("beforeunload", this._beforeUnloadHandler);

    const view = await this.getActiveDashboardView();
    if (view) {
      view.render();
    }

    try {
      this.initializeSettingsBackedServices();

      if (Platform.isMobile) {
        this.applyMobileOptimizations();
      }

      this.scheduleStartupSavedArticleValidation();

      this.registerView(
        RSS_DASHBOARD_VIEW_TYPE,
        (leaf) => new RssDashboardView(leaf, this),
      );

      this.registerView(
        RSS_DISCOVER_VIEW_TYPE,
        (leaf) => new DiscoverView(leaf, this),
      );

      this.registerView(
        RSS_READER_VIEW_TYPE,
        (leaf) =>
          new ReaderView(
            leaf,
            this.settings,
            this.articleSaver,
            (item: FeedItem) => {
              void this.onArticleSaved(item);
            },
            (
              item: FeedItem,
              updates: Partial<FeedItem>,
              shouldRerender?: boolean,
            ) => {
              void this.updateArticleFromReader(item, updates, shouldRerender);
            },
          ),
      );

      this.registerView(
        RSS_SMALLWEB_VIEW_TYPE,
        (leaf) => new KagiSmallwebView(leaf, this),
      );

      this.addRibbonIcon("compass", "RSS dashboard", () => {
        void this.activateView();
      });

      this.settingTab = new RssDashboardSettingTab(this.app, this);
      this.addSettingTab(this.settingTab);

      this.addCommand({
        id: "open-dashboard",
        name: "Open dashboard",
        callback: () => {
          void this.activateView();
        },
      });

      this.addCommand({
        id: "open-discover",
        name: "Open discover",
        callback: () => {
          void this.activateDiscoverView();
        },
      });

      this.addCommand({
        id: "refresh-feeds",
        name: "Refresh feeds",
        callback: () => {
          void this.refreshFeeds();
        },
      });

      this.addCommand({
        id: "import-opml",
        name: "Import opml",
        callback: () => {
          new ImportOpmlModal(this.app, this).open();
        },
      });

      this.addCommand({
        id: "export-opml",
        name: "Export opml",
        callback: () => {
          void this.exportOpml();
        },
      });

      this.addCommand({
        id: "import-usersettings-json",
        name: "Import usersettings.json",
        callback: () => {
          this.importUserSettingsJson();
        },
      });

      this.addCommand({
        id: "export-usersettings-json",
        name: "Export usersettings.json",
        callback: () => {
          void this.exportUserSettingsJson();
        },
      });

      this.addCommand({
        id: "apply-feed-limits",
        name: "Apply feed limits to all feeds",
        callback: () => {
          void this.applyFeedLimitsToAllFeeds();
        },
      });

      this.addCommand({
        id: "toggle-sidebar",
        name: "Toggle sidebar",
        checkCallback: (checking: boolean) => {
          const leaves = this.app.workspace.getLeavesOfType(
            RSS_DASHBOARD_VIEW_TYPE,
          );
          if (leaves.length > 0) {
            if (!checking) {
              void (async () => {
                const view = await this.getActiveDashboardView();
                if (view) {
                  this.settings.sidebarCollapsed =
                    !this.settings.sidebarCollapsed;
                  await this.saveSettings();
                  view.render();
                }
              })();
            }
            return true;
          }
          return false;
        },
      });

      const autoRefreshIntervalMs = this.getAutoRefreshIntervalMs();
      if (autoRefreshIntervalMs !== null) {
        this.registerInterval(
          window.setInterval(() => {
            void this.refreshFeeds();
          }, autoRefreshIntervalMs),
        );
      }

      if (shouldRefreshOnOpen()) {
        void this.refreshFeeds();
      }
    } catch (e) {
      console.error("[RSS Dashboard] onload initialization failed:", e);
      new Notice("Error initializing RSS dashboard plugin.");
    }
  }

  private applyMobileOptimizations(): void {
    if (
      this.settings.refreshInterval > 0 &&
      this.settings.refreshInterval < 60
    ) {
      this.settings.refreshInterval = 60;
    }

    if (this.settings.maxItems > 50) {
      this.settings.maxItems = 50;
    }

    if (!this.settings.sidebarCollapsed) {
      this.settings.sidebarCollapsed = true;
    }
  }

  async activateView() {
    const { workspace } = this.app;

    try {
      let leaf: WorkspaceLeaf | null = null;
      const leaves = workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);

      if (leaves.length > 0) {
        leaf = leaves[0];
      } else {
        switch (this.settings.viewLocation) {
          case "left-sidebar":
            leaf = workspace.getLeftLeaf(false);
            break;
          case "right-sidebar":
            leaf = workspace.getRightLeaf(false);
            break;
          default:
            leaf = workspace.getLeaf("tab");
            break;
        }
      }

      if (leaf) {
        await leaf.setViewState({
          type: RSS_DASHBOARD_VIEW_TYPE,
          active: true,
        });
        void workspace.revealLeaf(leaf);
      }
    } catch {
      new Notice("Error opening RSS dashboard view");
    }
  }

  async activateDiscoverView() {
    const { workspace } = this.app;

    try {
      let leaf: WorkspaceLeaf | null = null;
      const leaves = workspace.getLeavesOfType(RSS_DISCOVER_VIEW_TYPE);

      if (leaves.length > 0) {
        leaf = leaves[0];
      } else {
        leaf = workspace.getLeaf("tab");
      }

      if (leaf) {
        await leaf.setViewState({
          type: RSS_DISCOVER_VIEW_TYPE,
          active: true,
        });
        void workspace.revealLeaf(leaf);
      }
    } catch {
      new Notice("Error opening RSS discover view");
    }
  }

  async activateSmallwebView() {
    const { workspace } = this.app;

    try {
      let leaf: WorkspaceLeaf | null = null;
      const leaves = workspace.getLeavesOfType(RSS_SMALLWEB_VIEW_TYPE);

      if (leaves.length > 0) {
        leaf = leaves[0];
      } else {
        leaf = workspace.getLeaf("tab");
      }

      if (leaf) {
        await leaf.setViewState({
          type: RSS_SMALLWEB_VIEW_TYPE,
          active: true,
        });
        void workspace.revealLeaf(leaf);
      }
    } catch {
      new Notice("Error opening kagi smallweb");
    }
  }

  private async onArticleSaved(item: FeedItem): Promise<void> {
    if (item.feedUrl) {
      const feed = this.settings.feeds.find((f) => f.url === item.feedUrl);
      if (feed) {
        const originalItem = feed.items.find((i) => i.guid === item.guid);
        if (originalItem) {
          originalItem.saved = true;
          originalItem.savedFilePath = item.savedFilePath;

          if (this.settings.articleSaving.addSavedTag) {
            if (!originalItem.tags) {
              originalItem.tags = [];
            }

            if (
              !originalItem.tags.some((t) => t.name.toLowerCase() === "saved")
            ) {
              const savedTag = this.settings.availableTags.find(
                (t) => t.name.toLowerCase() === "saved",
              );
              if (savedTag) {
                originalItem.tags.push({ ...savedTag });
              } else {
                originalItem.tags.push({ name: "saved", color: "#3498db" });
              }
            }
          }

          await this.saveSettings();

          await this.syncDashboardArticleUpdate(
            item.guid,
            item.feedUrl,
            {
              saved: true,
              savedFilePath: originalItem.savedFilePath,
              tags: originalItem.tags ? [...originalItem.tags] : [],
            },
            false,
          );
          await this.syncReaderArticleUpdate(item.guid, {
            saved: true,
            savedFilePath: originalItem.savedFilePath,
            tags: originalItem.tags ? [...originalItem.tags] : [],
          });
        }
      }
    }
  }

  private async updateArticleFromReader(
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ): Promise<void> {
    if (item.feedUrl) {
      const normalizedUpdates = applyAutomaticArticleTags(
        item,
        updates,
        this.settings,
      );
      const feed = this.settings.feeds.find((f) => f.url === item.feedUrl);
      if (!feed) return;

      const originalItem = feed.items.find((i) => i.guid === item.guid);
      if (!originalItem) return;

      await this.updateArticle(
        item.guid,
        item.feedUrl,
        normalizedUpdates,
        false,
      );
      await this.syncDashboardArticleUpdate(
        item.guid,
        item.feedUrl,
        normalizedUpdates,
        !!shouldRerender,
      );
      await this.syncReaderArticleUpdate(item.guid, normalizedUpdates);
    }
  }

  private async syncReaderArticleUpdate(
    articleGuid: string,
    updates: Partial<FeedItem>,
  ): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof ReaderView) {
        view.applyExternalUpdate(articleGuid, updates);
      }
    }
  }

  private async syncDashboardArticleUpdate(
    articleGuid: string,
    feedUrl: string,
    updates: Partial<FeedItem>,
    shouldRerender: boolean,
  ): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof RssDashboardView) {
        view.applyExternalArticleUpdate(
          articleGuid,
          feedUrl,
          updates,
          shouldRerender,
        );
      }
    }
  }

  async refreshFeeds(selectedFeeds?: Feed[]) {
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
      console.error(`[RSS dashboard] Error refreshing feeds:`, error);
      new Notice(
        `Error refreshing  ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Apply feed limits (maxItemsLimit and autoDeleteDuration) to all feeds
   * This is useful when users want to apply their current settings to existing feeds
   */
  async applyFeedLimitsToAllFeeds() {
    try {
      let updatedCount = 0;

      for (const feed of this.settings.feeds) {
        const originalCount = feed.items.length;
        const updated = applyFeedRetentionLimits(feed);
        feed.items = updated.items;

        if (feed.items.length !== originalCount) {
          updatedCount++;
        }
      }

      await this.saveSettings();
      const view = await this.getActiveDashboardView();
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

  async refreshSelectedFeed(feed: Feed) {
    try {
      if (!this.feedParser) {
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

  async refreshFeedsInFolder(folderPath: string) {
    const feedsInFolder = this.settings.feeds.filter((feed) => {
      if (!feed.folder) return false;
      return (
        feed.folder === folderPath || feed.folder.startsWith(folderPath + "/")
      );
    });

    if (feedsInFolder.length > 0) {
      await this.refreshFeeds(feedsInFolder);
    } else {
      new Notice("No feeds found in the selected folder");
    }
  }

  async updateArticle(
    articleGuid: string,
    feedUrl: string,
    updates: Partial<FeedItem>,
    shouldRefreshView = true,
  ) {
    const feed = this.settings.feeds.find((f) => f.url === feedUrl);
    if (!feed) return;

    const article = feed.items.find((item) => item.guid === articleGuid);
    if (!article) return;

    Object.assign(article, updates);

    await this.saveSettings();

    if (shouldRefreshView) {
      const view = await this.getActiveDashboardView();
      if (view) {
        view.refresh();
      }
    }

    await this.syncReaderArticleUpdate(articleGuid, updates);
  }

  importOpml(): void {
    const handleImportOpmlFile = async (file: File) => {
      const fileName = file.name.toLowerCase() || "";
      if (fileName.endsWith(".opml") || fileName.endsWith(".xml")) {
        const content = await file.text();
        try {
          const { feeds: newFeedsMetadata, folders: newFolders } =
            OpmlManager.parseOpmlMetadata(content);
          const result = await this.ingestFeedsForBackgroundImport(
            newFeedsMetadata,
            {
              mode: "update",
              folders: newFolders,
            },
          );

          if (result.addedCount === 0) {
            new Notice("No new feeds found in the file.");
            return;
          }

          new Notice(
            `Imported ${result.addedCount} feeds. Articles will be fetched in the background.`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          new Notice(message);
        }
      } else {
        new Notice("Please select a valid OPML or XML file.");
      }
    };

    /**
     * NOTE for future developers: The following block uses Electron's native dialog via 'window.require'
     * to support multiple file extension filters simultaneously (e.g., .opml, .xml) on Windows.
     * This is a known desktop-only pattern in Obsidian. We use 'any' casts and disable ESLint
     * rules here because these Electron-specific APIs are not in the standard Obsidian type
     * definitions. The surrounding try...catch is CRITICAL to ensure the plugin doesn't
     * crash on mobile where these APIs are absent.
     */
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
      const remote =
        (window as any).require?.("@electron/remote") ||
        (window as any).require?.("electron")?.remote;
      if (remote && remote.dialog) {
        const filePaths = remote.dialog.showOpenDialogSync({
          title: "Import feeds from OPML or XML",
          properties: ["openFile"],
          filters: [
            {
              name: "OPML, XML, or Backup Files",
              extensions: ["opml", "xml", "backup"],
            },
            { name: "All Files", extensions: ["*"] },
          ],
        });

        if (filePaths && filePaths.length > 0) {
          const filePath = filePaths[0];
          const fs = (window as any).require("fs");
          const content = fs.readFileSync(filePath, "utf-8");
          const fileName = filePath.split(/[/\\]/).pop() || "file";
          const file = new File([content], fileName, { type: "text/xml" });
          void handleImportOpmlFile(file);
          return;
        } else if (filePaths === undefined) {
          return; // Dialog was cancelled
        }
      }
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
    } catch {
      // Ignore errors and fallback
    }

    const input = document.body.createEl("input", {
      attr: { type: "file", accept: ".opml,.xml" },
    });
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        void handleImportOpmlFile(file);
      }
      input.remove();
    };
    input.click();
  }

  public startBackgroundImport(feeds: Feed[]): void {
    // ✅ BackgroundImportService extracted — all 882 currently green tests passing
    this.backgroundImportService.startBackgroundImport(feeds);
  }

  public async ingestFeedsForBackgroundImport(
    candidates: FeedIngestionCandidate[],
    options?: FeedIngestionOptions,
  ): Promise<{
    addedCount: number;
    skippedCount: number;
    queuedFeeds: Feed[];
  }> {
    return this.backgroundImportService.ingestFeedsForBackgroundImport(
      candidates,
      options,
    );
  }

  public importUserSettingsJson(): void {
    const input = document.body.createEl("input", {
      attr: {
        type: "file",
        accept: ".json,.backup,application/json",
      },
    });

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void this.importUserSettingsJsonFromFile(file);
    };

    input.click();
  }

  public async importUserSettingsJsonFromFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<RssDashboardSettings>;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid usersettings.json");
      }

      const parsedWithCollections = parsed as Partial<RssDashboardSettings> & {
        feeds?: unknown;
        folders?: unknown;
        availableTags?: unknown;
      };
      const hasFeedCollections =
        Array.isArray(parsedWithCollections.feeds) ||
        Array.isArray(parsedWithCollections.folders) ||
        Array.isArray(parsedWithCollections.availableTags);

      if (hasFeedCollections) {
        this.settings = Object.assign(
          {},
          DEFAULT_SETTINGS,
          this.settings,
          parsed,
        );
        this.settings.feeds = Array.isArray(parsedWithCollections.feeds)
          ? parsedWithCollections.feeds
          : [];
        this.settings.folders = Array.isArray(parsedWithCollections.folders)
          ? parsedWithCollections.folders
          : this.settings.folders;
        this.settings.availableTags = Array.isArray(
          parsedWithCollections.availableTags,
        )
          ? parsedWithCollections.availableTags
          : this.settings.availableTags;

        this.migrateLegacySettings();
        for (const feed of this.settings.feeds) {
          if (!feed.keywordRules) {
            feed.keywordRules = {
              overrideGlobalRules: false,
              includeLogic: "AND",
              rules: [],
            };
            continue;
          }
          feed.keywordRules = Object.assign(
            {},
            {
              overrideGlobalRules: false,
              includeLogic: "AND",
              rules: [],
            },
            feed.keywordRules,
          );

          // Migrate legacy feeds: apply default auto-delete and maxItems if not set
          // This ensures feeds imported before the fix will respect the global defaults
          if (typeof feed.autoDeleteDuration !== "number") {
            feed.autoDeleteDuration = this.settings.defaultAutoDeleteDuration;
          }
          if (typeof feed.maxItemsLimit !== "number") {
            feed.maxItemsLimit = this.settings.maxItems;
          }
        }

        this.initializeSettingsBackedServices();
        await this.saveSettings();
        await this.refreshDashboardViews();
        const discoverView = await this.getActiveDiscoverView();
        discoverView?.render();

        new Notice("Imported JSON with feeds and settings");
        return;
      }

      const {
        feeds: _feeds,
        folders: _folders,
        availableTags: _availableTags,
        ...settingsOnly
      } = parsed as Partial<RssDashboardSettings> & {
        feeds?: unknown;
        folders?: unknown;
        availableTags?: unknown;
      };
      void _feeds;
      void _folders;
      void _availableTags;

      this.settings = Object.assign(
        {},
        DEFAULT_SETTINGS,
        this.settings,
        settingsOnly,
      );

      // Keep legacy keys and nested defaults normalized after import.
      this.migrateLegacySettings();

      this.initializeSettingsBackedServices();
      await this.saveSettings();
      await this.refreshDashboardViews();
      const discoverView = await this.getActiveDiscoverView();
      discoverView?.render();

      new Notice("Imported usersettings.json");
    } catch (error) {
      new Notice(
        `Invalid usersettings.json file${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }
  }

  // ✅ ImportExportService extracted — delegates to service
  public getUserSettingsJson(): string {
    return this.importExportService.getUserSettingsJson();
  }

  public getPortableDataBundle() {
    return this.feedStorageRepository.buildPortableDataBundle(this.settings);
  }

  public async exportUserSettingsJson(): Promise<void> {
    return this.importExportService.exportUserSettingsJson();
  }

  public async exportDataJson(): Promise<void> {
    return this.importExportService.exportDataJson();
  }

  public async exportPortableDataBundle(): Promise<void> {
    return this.importExportService.exportPortableDataBundle();
  }

  exportOpml(): void {
    void this.importExportService.exportOpml();
  }

  public async copyDataJsonToClipboard(): Promise<void> {
    return this.importExportService.copyDataJsonToClipboard();
  }

  public async copyUserSettingsJsonToClipboard(): Promise<void> {
    return this.importExportService.copyUserSettingsJsonToClipboard();
  }

  public async copyOpmlToClipboard(): Promise<void> {
    return this.importExportService.copyOpmlToClipboard();
  }

  public getStorageStatus(): FeedStorageStatus {
    return this.feedStorageRepository.getStatus(this.settings);
  }

  public async migrateToVaultStorage(): Promise<void> {
    storageLog("Plugin migration requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });

    try {
      await this.feedStorageRepository.migrateToVaultShards(this.settings, (data) =>
        this.saveData(data),
      );
      this.initializeSettingsBackedServices();
      if (this.settingTab) {
        this.settingTab.display();
      }
      await this.refreshDashboardViews();
      storageLog("Plugin migration completed", {
        currentMode: this.settings.storageMode,
      });
    } catch (error) {
      storageError("Plugin migration failed", error, {
        currentMode: this.settings.storageMode,
        folder: this.settings.storageFolder,
      });
      throw error;
    }
  }

  public async repairVaultStorage(): Promise<void> {
    storageLog("Plugin repair requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });

    try {
      await this.feedStorageRepository.repairVaultShards(this.settings, (data) =>
        this.saveData(data),
      );
      if (this.settingTab) {
        this.settingTab.display();
      }
      storageLog("Plugin repair completed");
    } catch (error) {
      storageError("Plugin repair failed", error, {
        currentMode: this.settings.storageMode,
        folder: this.settings.storageFolder,
      });
      throw error;
    }
  }

  public async revertToLegacyJsonStorage(): Promise<void> {
    storageLog("Plugin revert requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });

    try {
      await this.feedStorageRepository.revertToLegacyJson(this.settings, (data) =>
        this.saveData(data),
      );
      this.initializeSettingsBackedServices();
      if (this.settingTab) {
        this.settingTab.display();
      }
      await this.refreshDashboardViews();
      storageLog("Plugin revert completed", {
        currentMode: this.settings.storageMode,
      });
    } catch (error) {
      storageError("Plugin revert failed", error, {
        currentMode: this.settings.storageMode,
        folder: this.settings.storageFolder,
      });
      throw error;
    }
  }

  // ✅ ImportExportService extracted — all 875 tests passing

  // ✅ FolderService extracted — delegates to service
  private folderPathExists(folderPath: string): boolean {
    return this.folderService.folderPathExists(folderPath);
  }

  private async repairMissingFolderPathsForFeeds(): Promise<void> {
    if (!this.folderService) return; // guard: service not yet initialized during first loadSettings()
    // ✅ FolderService extracted — delegates to service
    await this.folderService.repairMissingFolderPathsForFeeds({
      onSaveSettings: () => this.saveSettings(),
    });
  }

  /**
   * Ensures a folder path exists in the settings hierarchy
   * Handles nested paths like "News/Tech"
   */
  async ensureFolderExists(
    folderPath: string,
    options?: { saveSettings?: boolean; refreshView?: boolean },
  ): Promise<boolean> {
    // ✅ FolderService extracted — delegates to service
    return this.folderService.ensureFolderExists(folderPath, {
      saveSettings: options?.saveSettings,
      refreshView: options?.refreshView,
      onSaveSettings: () => this.saveSettings(),
      onRefreshView: async () => {
        const view = await this.getActiveDashboardView();
        if (view) {
          void view.refresh();
        }
      },
    });
  }

  // ✅ FolderService extracted — all 865 tests passing

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
    options?: { showNotice?: boolean },
  ) {
    const showNotice = options?.showNotice !== false;
    try {
      if (this.settings.feeds.some((f) => f.url === url)) {
        if (showNotice) {
          new Notice("This feed URL already exists");
        }
        return false;
      }

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
        keywordRules: feedKeywordRules || {
          overrideGlobalRules: false,
          includeLogic: "AND",
          rules: [],
        },
      };

      // Try to parse the feed BEFORE adding it to settings
      try {
        const parsedFeed = await this.feedParser.parseFeed(url, newFeed, {
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
          keywordRules: parsedFeed.keywordRules ?? newFeed.keywordRules,
        };
        if (feedToStore.folder) {
          await this.ensureFolderExists(feedToStore.folder, {
            saveSettings: false,
            refreshView: false,
          });
        }
        // Only add to settings if parsing succeeded
        this.settings.feeds.push(feedToStore);
        await this.saveSettings();

        const view = await this.getActiveDashboardView();
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

  async addYouTubeFeed(input: string, customTitle?: string) {
    try {
      const feedUrl = await MediaService.getYouTubeRssFeed(input);

      if (!feedUrl) {
        new Notice("Unable to determine YouTube feed URL from input");
        return;
      }

      if (this.settings.feeds.some((f) => f.url === feedUrl)) {
        new Notice("This YouTube feed already exists");
        return;
      }

      const title = customTitle || `YouTube: ${input}`;
      await this.addFeed(
        title,
        feedUrl,
        this.settings.media.defaultYouTubeFolder,
      );
    } catch (error) {
      new Notice(
        `Error adding YouTube feed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async addSubfolder(parentFolderName: string, subfolderName: string) {
    const parentFolder = this.settings.folders.find(
      (f) => f.name === parentFolderName,
    );

    if (parentFolder) {
      if (!parentFolder.subfolders.some((sf) => sf.name === subfolderName)) {
        parentFolder.subfolders.push({
          name: subfolderName,
          subfolders: [],
        });

        await this.saveSettings();

        const view = await this.getActiveDashboardView();
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
  ) {
    if (newFolder) {
      await this.ensureFolderExists(newFolder, {
        saveSettings: false,
        refreshView: false,
      });
    }

    const oldTitle = feed.title;
    feed.title = newTitle;
    feed.url = newUrl;
    feed.folder = newFolder;

    // Update feedTitle for all articles in this feed when the title changes
    if (oldTitle !== newTitle) {
      for (const item of feed.items) {
        item.feedTitle = newTitle;
      }
    }

    await this.saveSettings();

    const view = await this.getActiveDashboardView();
    if (view) {
      void view.refresh();
      new Notice(`Feed "${newTitle}" updated`);
    }
  }

  async loadSettings() {
    try {
      storageLog("Loading plugin settings");
      const data = (await this.loadData()) as RssDashboardSettings | null;
      const mergedSettings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
      const originalSettingsJson = JSON.stringify(mergedSettings);

      // ✅ settings-loader extracted — all 896 tests passing
      this.settings = loadAndNormalizeSettings(data);
      const didMigrateKeywordRules = this.migrateLegacySettings();

      await this.repairMissingFolderPathsForFeeds();
      const hydrated = await this.feedStorageRepository.hydrateSettings(
        this.settings,
      );
      storageLog("Settings hydrated", {
        mode: this.settings.storageMode,
        folder: this.settings.storageFolder,
        feedCount: this.settings.feeds.length,
        hydratedShardCount: hydrated.shardCount,
      });

      const didNormalizeAndDedupeItems = dedupeAndNormalizeFeedItems(
        this.settings.feeds,
      );

      if (
        didMigrateKeywordRules ||
        hydrated.didChange ||
        didNormalizeAndDedupeItems ||
        JSON.stringify(this.settings) !== originalSettingsJson
      ) {
        await this.saveSettings();
      }
    } catch (error) {
      storageError("Error loading plugin settings", error);
      new Notice(
        `Error loading settings: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      this.settings = DEFAULT_SETTINGS;
    }
  }

  private migrateLegacySettings(): boolean {
    return migrateSettings(this.settings);
  }

  async saveSettings() {
    storageLog("saveSettings invoked", {
      mode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });

    try {
      const result = await this.feedStorageRepository.persistSettings(
        this.settings,
        (data) => this.saveData(data),
      );
      storageLog("saveSettings completed", result);
    } catch (error) {
      storageError("saveSettings failed", error, {
        mode: this.settings.storageMode,
        folder: this.settings.storageFolder,
      });
      throw error;
    }
  }

  private isFeedExcludedFromRefresh(feed: Feed): boolean {
    return feed.excludeFromRefresh === true;
  }

  private getRefreshableFeeds(feeds: Feed[]): Feed[] {
    return feeds.filter((feed) => !this.isFeedExcludedFromRefresh(feed));
  }

  private mergeRefreshedFeed(updatedFeed: Feed): void {
    const index = this.settings.feeds.findIndex(
      (f) => f.url === updatedFeed.url,
    );
    if (index >= 0) {
      this.settings.feeds[index] = {
        ...updatedFeed,
        excludeFromRefresh:
          updatedFeed.excludeFromRefresh ??
          this.settings.feeds[index].excludeFromRefresh,
      };
    }
  }

  private async refreshSingleFeed(
    feed: Feed,
    feedNoticeText: string,
  ): Promise<void> {
    const updatedFeed = await this.refreshFeedWithTimeout(feed);
    this.mergeRefreshedFeed(updatedFeed);

    await this.validateSavedArticles();
    this.settings.lastRefreshTimestamp = Date.now();
    await this.saveSettings();
    const view = await this.getActiveDashboardView();
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
    const refreshSummary = {
      failed: 0,
      timedOut: 0,
    };

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
        now - lastRenderAt < RssDashboardPlugin.FEED_REFRESH_RENDER_THROTTLE_MS
      ) {
        return;
      }

      const view = await this.getActiveDashboardView();
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
        if (!currentFeed) {
          return;
        }

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
      RssDashboardPlugin.FEED_REFRESH_CONCURRENCY,
      feedsToRefresh.length,
    );

    try {
      const workers = Array.from({ length: workerCount }, () => worker());
      await refreshView(true);
      await Promise.all(workers);

      await this.validateSavedArticles();
      this.settings.lastRefreshTimestamp = Date.now();
      await this.saveSettings();
      this.activeRefreshState.clear();
      this.isMultiFeedRefreshRunning = false;
      const view = await this.getActiveDashboardView();
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

    if (parts.length === 0) {
      return "";
    }

    return ` (${parts.join(", ")})`;
  }

  private async refreshFeedWithTimeout(feed: Feed): Promise<Feed> {
    return await Promise.race([
      this.refreshFeedDirect(feed),
      new Promise<Feed>((_, reject) => {
        window.setTimeout(
          () => reject(new Error("Timed out")),
          FEED_REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  }

  private async refreshFeedDirect(feed: Feed): Promise<Feed> {
    if (typeof this.feedParser.refreshFeed === "function") {
      return await this.feedParser.refreshFeed(feed);
    }

    const updatedFeeds = await this.feedParser.refreshAllFeeds([feed]);
    return updatedFeeds[0] ?? feed;
  }

  public async performAutoBackups(): Promise<void> {
    // ✅ BackupService extracted — delegates to service
    await this.backupService.performAutoBackups();
  }

  public performAutoBackupsSyncDesktop(): boolean {
    // ✅ BackupService extracted — delegates to service
    return this.backupService.performAutoBackupsSyncDesktop();
  }

  onunload() {
    // Remove the beforeunload listener to avoid it firing when the plugin
    // is manually disabled (onunload handles it instead).
    if (this._beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
    // Run backups synchronously on plugin disable
    const synced = this.backupService.performAutoBackupsSyncDesktop();
    if (!synced) {
      void this.backupService.performAutoBackups();
    }
  }

  private async validateSavedArticles(): Promise<void> {
    let updatedCount = 0;

    for (const feed of this.settings.feeds) {
      for (const item of feed.items) {
        if (item.saved) {
          const fileExists = this.articleSaver.checkSavedFileExists(item);
          if (!fileExists) {
            item.saved = false;
            item.savedFilePath = undefined;

            if (item.tags) {
              item.tags = item.tags.filter(
                (tag) => tag.name.toLowerCase() !== "saved",
              );
            }
            updatedCount++;
          }
        }
      }
    }

    if (updatedCount > 0) {
      await this.saveSettings();

      const view = await this.getActiveDashboardView();
      if (view) {
        view.render();
      }
    }
  }

  private getAllArticles(): FeedItem[] {
    let allArticles: FeedItem[] = [];
    for (const feed of this.settings.feeds) {
      allArticles = allArticles.concat(feed.items);
    }
    return allArticles;
  }
}
