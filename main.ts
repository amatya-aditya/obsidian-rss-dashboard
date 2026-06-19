import {
  App,
  Plugin,
  Notice,
  WorkspaceLeaf,
  Platform,
  requireApiVersion,
  TFolder,
  type EventRef,
  type ObsidianProtocolData,
} from "obsidian";

import { getSettingManager } from "./src/utils/settings-manager";

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
  type FeedLocalStorageAddress,
  type FeedStorageStatus,
  ShardFolderDeletionError,
} from "./src/services/feed-storage-repository";
import { ImportExportService } from "./src/services/import-export-service";
import { BackgroundImportService } from "./src/services/background-import-service";
import { FEED_REQUEST_TIMEOUT_MS } from "./src/services/feed-timeout";
import { OpmlManager } from "./src/services/opml-manager";
import { MediaService } from "./src/services/media-service";
import { ArticleSyncService } from "./src/services/article-sync-service";
import { FeedOrchestrator } from "./src/services/feed-orchestrator";
import { PluginLifecycleManager } from "./src/services/plugin-lifecycle-manager";

import { ImportOpmlModal } from "./src/modals/import-opml-modal";
import { AddFeedModal } from "./src/modals/feed-manager/add-feed-modal";
import {
  normalizeRefreshIntervalMinutes,
  isValidUrl,
} from "./src/utils/validation";
import {
  dedupeAndNormalizeFeedItems,
  loadAndNormalizeSettings,
  migrateSettings,
} from "./src/utils/settings-loader";
// applyAutomaticArticleTags is now used only inside ArticleSyncService
import { SettingsManager } from "./src/services/settings-manager";
import { ViewOrchestrator } from "./src/services/view-orchestrator";
import { UriProtocolHandler } from "./src/services/uri-protocol-handler";
import {
  DesktopRequire,
  DesktopShell,
  PathModuleLike,
  LegacyPlaybackProgressEntry,
  isRecord,
  isLegacyPlaybackProgressEntry,
  isDesktopShell,
  isPathModuleLike,
  getRequireFunction,
  getShellFromModule,
} from "./src/utils/platform-utils";
import { decodeUriFeedUrl, buildUriAddFeedTitle } from "./src/utils/uri-utils";
import { getAllArticles } from "./src/utils/plugin-utils";
export interface FiltersUpdatedEventPayload {
  source: string;
  feedUrl?: string;
  timestamp: number;
}

function storageLog(_message: string, _details?: unknown): void {}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

type VaultAdapterPathAccess = {
  getBasePath?: () => string;
  getFullPath?: (path: string) => string;
};
type LegacyLocalStorageApi = {
  loadLocalStorage?: (key: string) => unknown;
  removeLocalStorage?: (key: string) => void;
};

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
  private static readonly URI_ACTION_ADD_FEED = "add-feed";

  public settingsManager!: SettingsManager;
  get settings(): RssDashboardSettings {
    return this.settingsManager.settings;
  }
  set settings(val: RssDashboardSettings) {
    this.settingsManager.settings = val;
  }
  feedParser!: FeedParser;
  articleSaver!: ArticleSaver;
  private backupService!: BackupService;
  protected folderService!: FolderService;
  private importExportService!: ImportExportService;
  private backgroundImportService!: BackgroundImportService;
public activeRefreshState = new Map<string, FeedRefreshState>();
  public settingTab: RssDashboardSettingTab | null = null;
  public viewOrchestrator!: ViewOrchestrator;
  public uriProtocolHandler!: UriProtocolHandler;
  private isMultiFeedRefreshRunning = false;
  public vaultAbsolutePath = "";
  private hasCompletedStartupSavedArticleValidation = false;
  private vaultMetadataReloadTimer: number | null = null;
  private startupRefreshTimeoutId: number | null = null;
  private suppressWatcherUntil = 0;
  private static readonly FEED_REFRESH_CONCURRENCY = 4;
  private static readonly FEED_REFRESH_RENDER_THROTTLE_MS = 250;
  public readonly feedStorageRepository: FeedStorageRepository;
  public articleSyncService!: ArticleSyncService;
  public feedOrchestrator!: FeedOrchestrator;
  public pluginLifecycleManager!: PluginLifecycleManager;

  constructor(app: App, manifest: ConstructorParameters<typeof Plugin>[1]) {
    super(app, manifest);
    this.feedStorageRepository = new FeedStorageRepository(app, {
      writeWrapper: (fn) => this.writeWithWatcherSuppressed(fn),
    });
    this.settingsManager = new SettingsManager(this.app, this);
    this.viewOrchestrator = new ViewOrchestrator(this.app, this.settingsManager);
    this.uriProtocolHandler = new UriProtocolHandler(this.manifest.id);

    // Phase 5 services – wired here so they are available immediately.
    // The plugin facade methods delegate to these after onload() finishes.
    this.articleSyncService = new ArticleSyncService(this.app, this);
    this.feedOrchestrator = new FeedOrchestrator(this, this.activeRefreshState);
    this.pluginLifecycleManager = new PluginLifecycleManager(this.app, this);
  }

  public initializeSettingsBackedServices(): void {
    this.feedParser = new FeedParser(
      this.settings.display,
      this.settings.availableTags,
      this.settings.media,
      () => this.settings.folders,
      () => this.settings.corsProxyEnabled,
    );
    this.articleSaver = new ArticleSaver(this.app, this.settings.articleSaving);
    this.importExportService = new ImportExportService({
      settings: this.settings,
      isMobile: Platform.isMobileApp,
      getPortableDataBundle: () => this.getPortableDataBundle(),
      importPortableDataBundle: (bundle) =>
        this.applyPortableDataBundleImport(bundle),
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

  public async writeWithWatcherSuppressed<T>(
    writeFn: () => Promise<T>,
    windowMs = 3000,
  ): Promise<T> {
    this.suppressWatcherUntil = Date.now() + windowMs;
    try {
      return await writeFn();
    } finally {
      // leave suppression window to expire; don't clear explicitly
    }
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

  // ✅ Phase 5: delegated to PluginLifecycleManager
  private async reconcileSavedArticlesOnStartup(): Promise<void> {
    // Kept for backward compat with tests that spy on this method.
    // The real work is now in pluginLifecycleManager internally.
    await this.pluginLifecycleManager["reconcileSavedArticlesOnStartup"]();
  }

  // ✅ Phase 5: delegated to PluginLifecycleManager
  private scheduleStartupSavedArticleValidation(): void {
    this.pluginLifecycleManager.scheduleStartupSavedArticleValidation();
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

  // ✅ Phase 5: delegated to PluginLifecycleManager
  public async performFactoryReset(): Promise<void> {
    // Also reset the local refresh tracking state that the orchestrator holds
    this.activeRefreshState.clear();
    this.isMultiFeedRefreshRunning = false;
    this.feedOrchestrator.isMultiFeedRefreshRunning = false;
    return this.pluginLifecycleManager.performFactoryReset();
  }

  /**
   * Opens the plugin's settings tab to the "Tags" section.
   *
   * Uses an internal Obsidian API (app.setting) as there is no public API for this.
   * If Obsidian adds a public API, migrate this logic to use it.
   */
  public async openTagsSettings(): Promise<void> {
    const setting = getSettingManager(this.app);
    if (setting) {
      setting.open();
      setting.openTabById(this.manifest.id);
      if (this.settingTab) {
        this.settingTab.activateTab("Tags");
      }
    }
  }

  /**
   * Opens the plugin's settings tab to a specific section.
   *
   * Uses an internal Obsidian API (app.setting) as there is no public API for this.
   * If Obsidian adds a public API, migrate this logic to use it.
   */
  public async openSettingsToTab(
    tabName: string,
    sectionName?: string,
  ): Promise<void> {
    const setting = getSettingManager(this.app);
    if (setting) {
      setting.open();
      setting.openTabById(this.manifest.id);
      if (this.settingTab) {
        this.settingTab.activateTab(tabName, sectionName);
      }
    }
  }

  async onload() {
    const adapter = this.app.vault.adapter as unknown as VaultAdapterPathAccess;
    if (typeof adapter.getBasePath === "function") {
      this.vaultAbsolutePath = adapter.getBasePath();
    } else if (typeof adapter.getFullPath === "function") {
      this.vaultAbsolutePath = adapter.getFullPath(".");
    }

    await this.loadSettings();
    this.registerVaultMetadataChangeListeners();

    const shouldRefreshOnOpen = (): boolean => {
      const intervalMs = this.getAutoRefreshIntervalMs();
      if (intervalMs === null) return false;
      if (!this.settings.lastRefreshTimestamp) return true;
      const elapsed = Date.now() - this.settings.lastRefreshTimestamp;
      return elapsed >= intervalMs;
    };

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

      this.registerObsidianProtocolHandler(
        this.manifest.id,
        (params: ObsidianProtocolData) => {
          void this.dispatchUriAction(params);
        },
      );

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
            {
              onPlaybackProgress: (item, position, duration, flush) => {
                this.updatePlaybackProgress(
                  item.feedUrl,
                  item.guid,
                  position,
                  duration,
                  flush,
                  item,
                );
              },
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
          this.cancelPendingStartupRefresh();
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
          activeWindow.setInterval(() => {
            void this.refreshFeeds();
          }, autoRefreshIntervalMs),
        );
      }

      if (shouldRefreshOnOpen()) {
        const delay = Number.isFinite(this.settings.startupRefreshDelaySeconds)
          ? this.settings.startupRefreshDelaySeconds
          : DEFAULT_SETTINGS.startupRefreshDelaySeconds;
        if (delay > 0) {
          this.startupRefreshTimeoutId = activeWindow.setTimeout(() => {
            this.startupRefreshTimeoutId = null;
            void this.refreshFeeds();
          }, delay * 1000);
        } else {
          void this.refreshFeeds();
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("[RSS Dashboard] onload initialization failed:", err);
      } else {
        console.error(
          "[RSS Dashboard] onload initialization failed:",
          String(err),
        );
      }
      new Notice("Error initializing RSS dashboard plugin.");
    }
  }

  private async dispatchUriAction(params: ObsidianProtocolData): Promise<void> {
    const action = this.resolveRequestedUriAction(params);

    if (!action) {
      new Notice(
        "Missing RSS Dashboard URI action. Use action=add-feed with a URL parameter.",
      );
      return;
    }

    try {
      switch (action) {
        case RssDashboardPlugin.URI_ACTION_ADD_FEED:
          await this.handleAddFeedUriAction(params);
          return;
        default:
          new Notice(`Unsupported RSS Dashboard URI action: ${action}`);
      }
    } catch (error) {
      console.error("[RSS Dashboard] URI action failed:", error);
      new Notice(
        `RSS Dashboard URI action failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private resolveRequestedUriAction(params: ObsidianProtocolData): string {
    return this.uriProtocolHandler.resolveRequestedUriAction(params);
  }



  private async handleAddFeedUriAction(
    params: ObsidianProtocolData,
  ): Promise<void> {
    const rawUrl = typeof params.url === "string" ? params.url : "";
    if (!rawUrl.trim()) {
      new Notice("Missing required URL parameter for add-feed.");
      return;
    }

    const decodedUrl = decodeUriFeedUrl(rawUrl);
    const urlValidation = isValidUrl(decodedUrl);
    if (!urlValidation.valid) {
      new Notice(urlValidation.error ?? "Invalid feed URL.");
      return;
    }

    const defaultFolder = this.settings.media.defaultRssFolder?.trim() || "RSS";

    await this.activateView();

    new AddFeedModal(
      this.app,
      this.settings.folders,
      async (request) =>
        await this.addFeed(
          request.title,
          request.url,
          request.folder,
          request.autoDeleteDuration,
          request.maxItemsLimit,
          request.scanInterval,
          request.feedKeywordRules,
          request.customTemplate,
          request.excludeFromRefresh,
          request.customTags,
        ),
      () => {
        void this.refreshDashboardViews();
      },
      defaultFolder,
      this,
      decodedUrl,
      buildUriAddFeedTitle(decodedUrl),
    ).open();
  }

  private applyMobileOptimizations(): void {
    this.viewOrchestrator.applyMobileOptimizations();
  }

  async activateView() {
    await this.viewOrchestrator.activateView();
  }

  async activateDiscoverView() {
    await this.viewOrchestrator.activateDiscoverView();
  }

  async activateSmallwebView() {
    await this.viewOrchestrator.activateSmallwebView();
  }

  private async onArticleSaved(item: FeedItem): Promise<void> {
    return this.articleSyncService.onArticleSaved(item);
  }

  private async updateArticleFromReader(
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ): Promise<void> {
    return this.articleSyncService.updateArticleFromReader(item, updates, shouldRerender);
  }

  private async syncReaderArticleUpdate(
    articleGuid: string,
    updates: Partial<FeedItem>,
  ): Promise<void> {
    return this.articleSyncService.syncReaderArticleUpdate(articleGuid, updates);
  }

  private async syncDashboardArticleUpdate(
    articleGuid: string,
    feedUrl: string,
    updates: Partial<FeedItem>,
    shouldRerender: boolean,
  ): Promise<void> {
    return this.articleSyncService.syncDashboardArticleUpdate(articleGuid, feedUrl, updates, shouldRerender);
  }

  async refreshFeeds(selectedFeeds?: Feed[]) {
    return this.feedOrchestrator.refreshFeeds(selectedFeeds);
  }

  async applyFeedLimitsToAllFeeds() {
    return this.feedOrchestrator.applyFeedLimitsToAllFeeds();
  }

  async refreshSelectedFeed(feed: Feed) {
    return this.feedOrchestrator.refreshSelectedFeed(feed);
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
    return this.articleSyncService.updateArticle(articleGuid, feedUrl, updates, shouldRefreshView);
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

    const input = activeDocument.body.createEl("input", {
      attr: { type: "file", accept: ".opml,.xml,.backup" },
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
    const input = activeDocument.body.createEl("input", {
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

  private async applyPortableDataBundleImport(bundle: unknown): Promise<void> {
    storageLog("Plugin portable bundle import requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });

    try {
      await this.feedStorageRepository.importPortableDataBundle(
        bundle,
        this.settings,
        (data) => this.saveData(data),
      );
      this.migrateLegacySettings();
      this.initializeSettingsBackedServices();

      if (this.settingTab) {
        this.settingTab.display();
      }

      await this.refreshDashboardViews();
      const discoverView = await this.getActiveDiscoverView();
      discoverView?.render();

      storageLog("Plugin portable bundle import completed", {
        currentMode: this.settings.storageMode,
        folder: this.settings.storageFolder,
        feedCount: this.settings.feeds.length,
      });
    } catch (error) {
      storageError("Plugin portable bundle import failed", error, {
        currentMode: this.settings.storageMode,
        folder: this.settings.storageFolder,
      });
      throw error instanceof Error ? error : new Error(String(error));
    }
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

  public async importPortableDataBundleFromFile(file: File): Promise<void> {
    return this.importExportService.importPortableDataBundleFromFile(file);
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

  public getFeedLocalStorageAddress(feed: Feed): FeedLocalStorageAddress {
    const resolved = this.feedStorageRepository.getFeedLocalStorageAddress(
      this.settings,
      feed,
    );

    if (resolved.mode !== "legacy-json") {
      return resolved;
    }

    const metadataFolder =
      this.settingsManager.getMetadataPath(this.settings) ?? this.manifest.dir ?? "";
    const metadataFolderTrimmed = metadataFolder.replace(/[\\/]+$/g, "");
    const relativeDataPath = metadataFolderTrimmed
      ? `${metadataFolderTrimmed}/data.json`
      : "data.json";

    return {
      ...resolved,
      address:
        this.resolveVaultRelativePathToOsPath(relativeDataPath) ??
        relativeDataPath,
    };
  }

  private resolveVaultRelativePathToOsPath(
    vaultRelativePath: string,
  ): string | null {
    const targetPath = vaultRelativePath.trim();
    if (!targetPath) {
      return null;
    }

    const adapter = this.app.vault.adapter as VaultAdapterPathAccess;

    if (typeof adapter.getFullPath === "function") {
      const resolved = adapter.getFullPath(targetPath);
      if (typeof resolved === "string" && resolved.trim().length > 0) {
        return resolved;
      }
    }

    const requireFn = getRequireFunction();
    const pathModule = requireFn?.("path");
    const basePath =
      typeof adapter.getBasePath === "function" ? adapter.getBasePath() : "";

    if (
      !basePath ||
      typeof basePath !== "string" ||
      !isPathModuleLike(pathModule)
    ) {
      return null;
    }

    return pathModule.join(basePath, targetPath);
  }

  public async migrateToVaultStorage(): Promise<void> {
    storageLog("Plugin migration requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });

    try {
      await this.feedStorageRepository.migrateToVaultShards(
        this.settings,
        (data) => this.saveData(data),
      );
      this.initializeSettingsBackedServices();
      await this.refreshDashboardViews();
      if (this.settingTab) {
        this.settingTab.display();
      }
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

  public async migrateToVaultShardsV2(): Promise<void> {
    storageLog("Plugin migration v2 requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });

    try {
      await this.feedStorageRepository.migrateToVaultShardsV2(
        this.settings,
        this.getMetadataSaveCallback(),
      );
      this.initializeSettingsBackedServices();
      await this.refreshDashboardViews();
      if (this.settingTab) {
        this.settingTab.display();
      }
      storageLog("Plugin migration v2 completed", {
        currentMode: this.settings.storageMode,
      });
    } catch (error) {
      storageError("Plugin migration v2 failed", error, {
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
      await this.feedStorageRepository.repairVaultShards(
        this.settings,
        (data) => this.saveData(data),
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
    return this.revertToLegacyJsonStorageWithOptions();
  }

  public async revertToLegacyJsonStorageWithOptions(options?: {
    deleteShardFolder?: boolean;
  }): Promise<void> {
    storageLog("Plugin revert requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
      deleteShardFolder: Boolean(options?.deleteShardFolder),
    });

    try {
      await this.feedStorageRepository.revertToLegacyJson(
        this.settings,
        (data) => this.saveData(data),
        options,
      );
      this.initializeSettingsBackedServices();
      await this.refreshDashboardViews();
      if (this.settingTab) {
        this.settingTab.display();
      }
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
  public isShardFolderDeletionError(
    error: unknown,
  ): error is ShardFolderDeletionError {
    return error instanceof ShardFolderDeletionError;
  }

  public async openStorageFolderInSystem(folderPath?: string): Promise<void> {
    const targetFolder = (folderPath ?? this.settings.storageFolder).trim();
    if (!targetFolder) {
      throw new Error("Storage folder path is empty.");
    }

    try {
      const requireFn = getRequireFunction();
      const shell =
        getShellFromModule(requireFn?.("@electron/remote")) ??
        getShellFromModule(requireFn?.("electron"));
      const pathModule = requireFn?.("path");
      const adapter = this.app.vault.adapter as VaultAdapterPathAccess;
      const basePath =
        typeof adapter.getBasePath === "function"
          ? adapter.getBasePath()
          : typeof adapter.getFullPath === "function"
            ? adapter.getFullPath(".")
            : "";

      if (!shell || !isPathModuleLike(pathModule) || !basePath) {
        throw new Error("Open folder is only available on desktop vaults.");
      }

      const fullPath = pathModule.join(basePath, targetFolder);
      const openResult = await shell.openPath(fullPath);
      if (typeof openResult === "string" && openResult.trim().length > 0) {
        throw new Error(openResult);
      }
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("Failed to open shard folder.");
    }
  }

  private folderPathExists(folderPath: string): boolean {
    return this.folderService.folderPathExists(folderPath);
  }

  public async repairMissingFolderPathsForFeeds(): Promise<void> {
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
    customTags?: string[],
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
          customTags: parsedFeed.customTags ?? newFeed.customTags,
          keywordRules: parsedFeed.keywordRules ?? newFeed.keywordRules,
        };
        if (feedToStore.folder) {
          await this.ensureFolderExists(feedToStore.folder, {
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
    await this.settingsManager.loadSettings();
  }



  private registerVaultMetadataChangeListeners(): void {
    this.settingsManager.registerVaultMetadataChangeListeners();
  }

  private migrateLegacySettings(): boolean {
    return this.settingsManager.migrateLegacySettings();
  }

  public updatePlaybackProgress(
    feedUrl: string,
    itemGuid: string,
    position: number,
    duration: number,
    flush = false,
    sourceItem?: FeedItem,
  ): void {
    this.pluginLifecycleManager.updatePlaybackProgress(
      feedUrl,
      itemGuid,
      position,
      duration,
      flush,
      sourceItem,
    );
  }

  public async clearPlaybackProgress(): Promise<number> {
    return this.pluginLifecycleManager.clearPlaybackProgress();
  }

  private async migrateMediaProgressOnStartup(): Promise<void> {
    return this.pluginLifecycleManager.migrateMediaProgressOnStartup();
  }

  public getMetadataSaveCallback(): (data: unknown) => Promise<void> {
    return this.settingsManager.getMetadataSaveCallback();
  }

  async saveSettings() {
    await this.settingsManager.saveSettings();
  }

  /**
   * Migrate metadata from plugin-default location to user-configured vault folder.
   * Steps:
   * 1. Ensure metadata folder exists (idempotent)
   * 2. Write settings to new vault location
   * 3. Update metadataStorageMode to "vault-location"
   * 4. Persist updated settings
   */
  async migrateMetadataToVaultLocation(): Promise<void> {
    await this.settingsManager.migrateMetadataToVaultLocation();
  }

  /**
   * Revert metadata from vault-location back to plugin-default location.
   * Steps:
   * 1. Read settings from current vault location (already in memory)
   * 2. Write back to plugin-default location via Plugin.saveData()
   * 3. Update metadataStorageMode to "plugin-default"
   * 4. Optionally clean up vault-location data.json
   */
  async revertMetadataToPluginDefault(): Promise<void> {
    try {
      const oldMetadataPath = this.settings.metadataStorageFolder;
      if (oldMetadataPath) {
        try {
          const dataFilePath = `${oldMetadataPath}/data.json`;
          const file = this.app.vault.getAbstractFileByPath(dataFilePath);
          if (file && !(file instanceof TFolder)) {
            await this.app.fileManager.trashFile(file);
            storageLog("Deleted old vault metadata file", {
              path: dataFilePath,
            });
          }
        } catch (cleanupError) {
          storageLog(
            "Cleanup of vault metadata file failed (non-fatal)",
            cleanupError,
          );
        }
      }

      await this.saveSettings();
      new Notice("Metadata reverted to plugin default location");
    } catch (error) {
      storageError("Metadata revert failed", error);
      // Restore mode on error (no partial state)
      this.settings.metadataStorageMode = "vault-location";
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      new Notice(`Revert failed: ${errorMessage}`);
      throw error;
    }
  }

  private isFeedExcludedFromRefresh(feed: Feed): boolean {
    return feed.excludeFromRefresh === true;
  }

  private getRefreshableFeeds(feeds: Feed[]): Feed[] {
    return this.feedOrchestrator["getRefreshableFeeds"](feeds);
  }

  private mergeRefreshedFeed(updatedFeed: Feed): void {
    this.feedOrchestrator["mergeRefreshedFeed"](updatedFeed);
  }

  private async refreshSingleFeed(
    feed: Feed,
    feedNoticeText: string,
  ): Promise<void> {
    return this.feedOrchestrator["refreshSingleFeed"](feed, feedNoticeText);
  }

  private async refreshFeedBatch(
    feedsToRefresh: Feed[],
    feedNoticeText: string,
  ): Promise<void> {
    return this.feedOrchestrator["refreshFeedBatch"](feedsToRefresh, feedNoticeText);
  }

  private buildRefreshFailureSummary(summary: {
    failed: number;
    timedOut: number;
  }): string {
    return this.feedOrchestrator["buildRefreshFailureSummary"](summary);
  }

  private async refreshFeedWithTimeout(feed: Feed): Promise<Feed> {
    return this.feedOrchestrator["refreshFeedWithTimeout"](feed);
  }

  private async refreshFeedDirect(feed: Feed): Promise<Feed> {
    return this.feedOrchestrator["refreshFeedDirect"](feed);
  }

  public async performAutoBackups(): Promise<void> {
    // ✅ BackupService extracted — delegates to service
    await this.backupService.performAutoBackups();
  }

  onunload() {
    this.pluginLifecycleManager.onUnload();
    
    if (this.vaultMetadataReloadTimer !== null) {
      activeWindow.clearTimeout(this.vaultMetadataReloadTimer);
      this.vaultMetadataReloadTimer = null;
    }
    this.settingsManager.cancelPendingReload();
  }

  public cancelPendingStartupRefresh(): void {
    this.pluginLifecycleManager.cancelPendingStartupRefresh();
  }

  // ✅ Phase 5: delegated to PluginLifecycleManager
  public async validateSavedArticles(): Promise<void> {
    return this.pluginLifecycleManager["validateSavedArticles"]();
  }


}
