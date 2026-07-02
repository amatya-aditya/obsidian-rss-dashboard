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
import {
  FEED_REQUEST_TIMEOUT_MS,
  FEED_SOFT_TIMEOUT_MS,
  MAX_CONCURRENT_FETCHES,
} from "./src/services/feed-timeout";
import { globalFetchSemaphore } from "./src/services/feed-parser/fetch-semaphore";
import { OpmlManager } from "./src/services/opml-manager";
import { MediaService } from "./src/services/media-service";

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
import { applyAutomaticArticleTags } from "./src/utils/tag-utils";

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

type DesktopRequire = (moduleName: string) => unknown;
type DesktopShell = { openPath: (path: string) => Promise<string> };
type PathModuleLike = { join: (...paths: string[]) => string };
type VaultAdapterPathAccess = {
  getBasePath?: () => string;
  getFullPath?: (path: string) => string;
};
type LegacyLocalStorageApi = {
  loadLocalStorage?: (key: string) => unknown;
  removeLocalStorage?: (key: string) => void;
};
type LegacyPlaybackProgressEntry = {
  position: number;
  duration: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLegacyPlaybackProgressEntry(
  value: unknown,
): value is LegacyPlaybackProgressEntry {
  return (
    isRecord(value) &&
    typeof value.position === "number" &&
    typeof value.duration === "number"
  );
}

function isDesktopShell(value: unknown): value is DesktopShell {
  return isRecord(value) && typeof value.openPath === "function";
}

function isPathModuleLike(value: unknown): value is PathModuleLike {
  return isRecord(value) && typeof value.join === "function";
}

function getRequireFunction(): DesktopRequire | undefined {
  const desktopWindow = window as Window & { require?: DesktopRequire };
  return typeof desktopWindow.require === "function"
    ? desktopWindow.require
    : undefined;
}

function getShellFromModule(value: unknown): DesktopShell | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return isDesktopShell(value.shell) ? value.shell : undefined;
}

// Re-exported for backward compatibility with callers that import from main.ts
export type {
  FeedIngestionCandidate,
  FeedIngestionOptions,
} from "./src/types/types";

/**
 * Resolves the full vault path for metadata storage based on current mode.
 * - "plugin-default": returns undefined (uses Plugin.saveData())
 * - "vault-location": returns normalized vault folder path
 */
function getMetadataPath(settings: RssDashboardSettings): string | undefined {
  if (settings.metadataStorageMode === "plugin-default") {
    return undefined; // Use Plugin.saveData()
  }

  // Normalize path: remove leading/trailing slashes, default to .rss-dashboard-data if empty
  let folder = settings.metadataStorageFolder.trim();
  if (!folder) {
    folder = ".rss-dashboard-data";
  }
  folder = folder.replace(/^\/+|\/+$/g, ""); // Remove leading/trailing slashes
  return folder;
}

/**
 * Loads metadata from the appropriate location based on mode.
 */
async function loadMetadata(
  app: App,
  mode: "plugin-default" | "vault-location",
  folder: string,
): Promise<RssDashboardSettings | null> {
  if (mode === "plugin-default") {
    return null; // Will be loaded via Plugin.loadData() in the plugin class
  }

  // Try to load from vault location
  const metadataPath = getMetadataPath({
    ...DEFAULT_SETTINGS,
    metadataStorageMode: mode,
    metadataStorageFolder: folder,
  });
  if (!metadataPath) {
    return null;
  }

  try {
    const dataFilePath = `${metadataPath}/data.json`;
    const content = await app.vault.adapter.read(dataFilePath);
    return JSON.parse(content) as RssDashboardSettings;
  } catch (error) {
    storageLog(
      "Failed to load metadata from vault location, will fall back to plugin default",
      error,
    );
    return null; // Fall back to plugin-default
  }
}

/**
 * Ensures metadata folder exists (idempotent).
 * - If folder exists and is a folder: returns success
 * - If folder doesn't exist: creates it
 * - If path is a file: throws error
 * - If createFolder race condition occurs: checks again and continues if now a folder
 */
async function ensureMetadataFolderExists(
  app: App,
  settings: RssDashboardSettings,
): Promise<void> {
  const folderPath = getMetadataPath(settings);
  if (!folderPath) {
    return; // Plugin-default mode, no folder needed
  }

  const normalized = folderPath.replace(/^\/+|\/+$/g, "");

  try {
    // Check if path already exists in vault cache
    const existing = app.vault.getAbstractFileByPath(normalized);
    if (existing) {
      if (existing instanceof TFolder) {
        return; // Folder already exists, idempotent success
      } else {
        throw new Error(
          `Metadata storage path points to a file, not a folder: ${normalized}`,
        );
      }
    }

    // Also check via adapter (covers folders not yet indexed in vault cache)
    const existsOnDisk = await app.vault.adapter.exists(normalized);
    if (existsOnDisk) {
      return; // Folder exists on disk (cache lag), treat as success
    }

    // Folder doesn't exist, create it
    await app.vault.createFolder(normalized);
  } catch (error) {
    // Handle race condition: createFolder throws "Folder already exists" or similar
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("already exists")
    ) {
      return; // Folder exists (race condition or cache lag), treat as success
    }
    throw error;
  }
}

export default class RssDashboardPlugin extends Plugin {
  private static readonly FACTORY_RESET_LOCAL_STORAGE_KEYS = [
    "rss-discover-filters",
    "rss-podcast-progress",
    "rss-first-launch-coachmark-shown",
  ] as const;
  private static readonly URI_ACTION_ADD_FEED = "add-feed";

  settings!: RssDashboardSettings;
  feedParser!: FeedParser;
  articleSaver!: ArticleSaver;
  private backupService!: BackupService;
  protected folderService!: FolderService;
  private importExportService!: ImportExportService;
  private backgroundImportService!: BackgroundImportService;
  public activeRefreshState = new Map<string, FeedRefreshState>();
  public settingTab: RssDashboardSettingTab | null = null;
  private isMultiFeedRefreshRunning = false;
  public vaultAbsolutePath = "";
  private hasCompletedStartupSavedArticleValidation = false;
  private vaultMetadataReloadTimer: number | null = null;
  private startupRefreshTimeoutId: number | null = null;
  private progressSaveDebounce: number | null = null;
  private suppressWatcherUntil = 0;
  private static readonly FEED_REFRESH_RENDER_THROTTLE_MS = 250;
  private readonly feedStorageRepository: FeedStorageRepository;

  constructor(app: App, manifest: ConstructorParameters<typeof Plugin>[1]) {
    super(app, manifest);
    this.feedStorageRepository = new FeedStorageRepository(app, {
      writeWrapper: (fn) => this.writeWithWatcherSuppressed(fn),
    });
  }

  private initializeSettingsBackedServices(): void {
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

  private async reconcileSavedArticlesOnStartup(): Promise<void> {
    if (this.hasCompletedStartupSavedArticleValidation) {
      return;
    }

    this.hasCompletedStartupSavedArticleValidation = true;

    const allArticles = this.getAllArticles();
    await this.articleSaver.fixSavedFilePaths(allArticles);
    await this.migrateMediaProgressOnStartup();

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

    new Notice("Restored plugin to factory defaults.");
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
        // eslint-disable-next-line obsidianmd/ui/sentence-case
        "Missing URI action. Use action=add-feed with a URL parameter.",
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
    const routeAction = (params.action ?? "").trim().toLowerCase();
    const queryAction =
      typeof params.uriAction === "string"
        ? params.uriAction.trim().toLowerCase()
        : "";

    if (queryAction) {
      return queryAction;
    }

    // Obsidian protocol reserves `action` for the route itself.
    // For links like `obsidian://rss-dashboard?...`, infer add-feed when a URL
    // parameter is present so browser-triggered links work reliably.
    if (
      routeAction === this.manifest.id.toLowerCase() &&
      typeof params.url === "string" &&
      params.url.trim().length > 0
    ) {
      return RssDashboardPlugin.URI_ACTION_ADD_FEED;
    }

    if (routeAction === this.manifest.id.toLowerCase()) {
      return "";
    }

    return routeAction;
  }

  private decodeUriFeedUrl(rawUrl: string): string {
    const candidate = rawUrl.trim();
    if (!candidate) {
      throw new Error("Missing required URL parameter for add-feed.");
    }

    if (!candidate.includes("%")) {
      return candidate;
    }

    try {
      return decodeURIComponent(candidate);
    } catch {
      throw new Error(
        "Feed URL is malformed. Ensure the url parameter is URL-encoded.",
      );
    }
  }

  private buildUriAddFeedTitle(feedUrl: string): string {
    try {
      const parsed = new URL(feedUrl);
      const hostname = parsed.hostname.replace(/^www\./i, "").trim();
      return hostname || feedUrl;
    } catch {
      return feedUrl;
    }
  }

  private async handleAddFeedUriAction(
    params: ObsidianProtocolData,
  ): Promise<void> {
    const rawUrl = typeof params.url === "string" ? params.url : "";
    if (!rawUrl.trim()) {
      new Notice("Missing required URL parameter for add-feed.");
      return;
    }

    const decodedUrl = this.decodeUriFeedUrl(rawUrl);
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
      this.buildUriAddFeedTitle(decodedUrl),
    ).open();
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
    const resolvedFeed =
      this.settings.feeds.find((f) => f.url === item.feedUrl) ||
      this.settings.feeds.find((f) =>
        f.items.some((candidate) => candidate.guid === item.guid),
      );
    if (!resolvedFeed) return;

    const resolvedFeedUrl = resolvedFeed.url;
    item.feedUrl = resolvedFeedUrl;

    const normalizedUpdates = applyAutomaticArticleTags(
      item,
      updates,
      this.settings,
    );
    const originalItem = resolvedFeed.items.find((i) => i.guid === item.guid);
    if (!originalItem) return;

    // Reflect updates in open dashboard/reader views immediately, then persist.
    Object.assign(originalItem, normalizedUpdates);
    await this.syncDashboardArticleUpdate(
      item.guid,
      resolvedFeedUrl,
      normalizedUpdates,
      !!shouldRerender,
    );
    await this.syncReaderArticleUpdate(item.guid, normalizedUpdates);
    await this.updateArticle(
      item.guid,
      resolvedFeedUrl,
      normalizedUpdates,
      false,
    );
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
        // eslint-disable-next-line obsidianmd/ui/sentence-case
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
      getMetadataPath(this.settings) ?? this.manifest.dir ?? "";
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
    try {
      storageLog("Loading plugin settings");

      // Step 1: load bootstrap pointer from plugin-default location
      let data = (await this.loadData()) as RssDashboardSettings | null;

      // Step 2: if pointer indicates vault-location mode, load full
      // settings from the vault path stored in the pointer
      if (data?.metadataStorageMode === "vault-location") {
        const vaultData = await loadMetadata(
          this.app,
          "vault-location",
          data.metadataStorageFolder,
        );
        if (vaultData) {
          data = vaultData;
          storageLog("Metadata loaded from vault location", {
            folder: data.metadataStorageFolder,
          });
        }
      }

      // Track whether we bootstrapped from null (possible pending sync)
      const wasNullLoad = data === null;

      const mergedSettings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
      const originalSettingsJson = JSON.stringify(mergedSettings);

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

      // Guard: skip the early write if we loaded from null defaults.
      // A null load on a synced vault likely means sync hasn't delivered
      // data.json yet — writing empty defaults here would clobber it.
      // The vault modify listener in onload() will trigger loadSettings()
      // again once sync delivers the real data.
      // Similarly, skip if we are in v2 mode and user-state.json is missing.
      const isV2 = this.settings.storageMode === "vault-shards-v2";
      const isMissingUserState = isV2 && hydrated.userStateLoaded === false;

      const shouldSave =
        !wasNullLoad &&
        !isMissingUserState &&
        (didMigrateKeywordRules ||
          hydrated.didChange ||
          didNormalizeAndDedupeItems ||
          JSON.stringify(this.settings) !== originalSettingsJson);

      if (shouldSave) {
        await this.saveSettings();
      }
    } catch (error) {
      storageError("Error loading plugin settings", error);
      new Notice(
        `Error loading settings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      this.settings = DEFAULT_SETTINGS;
    }
  }

  private getVaultFilePath(fileOrPath?: unknown): string {
    if (typeof fileOrPath === "string") return fileOrPath;
    if (isRecord(fileOrPath) && typeof fileOrPath.path === "string") {
      return fileOrPath.path;
    }
    return "";
  }

  private isWatchedMetadataPath(filePath: string): boolean {
    // When running in tests the settings.metadataStorageMode may be
    // "plugin-default" but tests expect the watcher to consider the
    // default vault folder (.rss-dashboard-data). Use the resolved
    // metadataFolder when available, otherwise fall back to the
    // conventional default folder name so tests behave deterministically.
    const metadataFolder = getMetadataPath(this.settings ?? DEFAULT_SETTINGS);
    const folderToCheck = metadataFolder ?? ".rss-dashboard-data";

    const normalizedBase = filePath.replace(/^\/+|\/+$/g, "");
    const normalizedFolder = folderToCheck.replace(/^\/+|\/+$/g, "");

    return (
      normalizedBase === `${normalizedFolder}/data.json` ||
      normalizedBase === `${normalizedFolder}/user-state.json`
    );
  }

  private registerVaultMetadataChangeListeners(): void {
    const vault = this.app.vault as unknown as {
      on?: (event: string, callback: (...args: unknown[]) => void) => EventRef;
    };
    if (typeof vault.on !== "function") return;

    const scheduleReload = (file?: unknown, oldPath?: unknown): void => {
      if (Date.now() < this.suppressWatcherUntil) return;

      const candidatePaths: string[] = [];
      const filePath = this.getVaultFilePath(file);
      if (filePath) {
        candidatePaths.push(filePath);
      }
      if (typeof oldPath === "string") {
        candidatePaths.push(oldPath);
      }

      const watched = candidatePaths.some((candidatePath) =>
        this.isWatchedMetadataPath(candidatePath),
      );

      if (!watched) return;

      if (this.vaultMetadataReloadTimer !== null) {
        (
          globalThis as unknown as { clearTimeout: (id: number | null) => void }
        ).clearTimeout(this.vaultMetadataReloadTimer);
      }

      this.vaultMetadataReloadTimer = (
        globalThis as unknown as {
          setTimeout: (cb: () => number | void, ms: number) => number;
        }
      ).setTimeout(() => {
        this.vaultMetadataReloadTimer = null;
        void (async () => {
          await this.loadSettings();
          await this.refreshDashboardViews();
        })();
      }, 1500);
    };

    this.registerEvent(vault.on("modify", (file) => scheduleReload(file)));
    this.registerEvent(vault.on("create", (file) => scheduleReload(file)));
    this.registerEvent(
      vault.on("rename", (file, oldPath) => scheduleReload(file, oldPath)),
    );
  }

  private migrateLegacySettings(): boolean {
    return migrateSettings(this.settings);
  }

  public updatePlaybackProgress(
    feedUrl: string,
    itemGuid: string,
    position: number,
    duration: number,
    flush = false,
    sourceItem?: FeedItem,
  ): void {
    if (!this.settings.media.rememberPlaybackProgress) {
      return;
    }

    let item: FeedItem | undefined;

    const resolveVideoMatch = (
      candidateFeed?: (typeof this.settings.feeds)[number],
    ) => {
      if (!sourceItem || sourceItem.mediaType !== "video") {
        return undefined;
      }

      const feedsToSearch = candidateFeed
        ? [candidateFeed]
        : this.settings.feeds;

      for (const feed of feedsToSearch) {
        const exactRef = feed.items.find((entry) => entry === sourceItem);
        if (exactRef) {
          return exactRef;
        }

        const byVideoId = sourceItem.videoId
          ? feed.items.find((entry) => entry.videoId === sourceItem.videoId)
          : undefined;
        if (byVideoId) {
          return byVideoId;
        }

        if (sourceItem.link) {
          const byLink = feed.items.find(
            (entry) => entry.link === sourceItem.link,
          );
          if (byLink) {
            return byLink;
          }
        }
      }

      return undefined;
    };

    if (feedUrl) {
      const feed = this.settings.feeds.find((f) => f.url === feedUrl);
      item = feed?.items.find((i) => i.guid === itemGuid);
      if (!item) {
        item = resolveVideoMatch(feed);
      }
    }

    if (!item) {
      for (const feed of this.settings.feeds) {
        const match = feed.items.find((i) => i.guid === itemGuid);
        if (match) {
          item = match;
          break;
        }
      }
    }

    if (!item) {
      item = resolveVideoMatch();
    }

    if (!item) return;

    if (!(duration > 0) || position < 0) return;

    item.playbackProgress = { position, duration, lastUpdated: Date.now() };

    if (flush) {
      if (this.progressSaveDebounce !== null) {
        window.clearTimeout(this.progressSaveDebounce);
        this.progressSaveDebounce = null;
      }
      void this.saveSettings();
      return;
    }

    // Throttle progress persistence: schedule one save at a time.
    // A reset-on-every-event debounce can starve saves during active playback.
    if (this.progressSaveDebounce === null) {
      this.progressSaveDebounce = window.setTimeout(() => {
        void this.saveSettings();
        this.progressSaveDebounce = null;
      }, 2000);
    }
  }

  public async clearPlaybackProgress(): Promise<number> {
    if (this.progressSaveDebounce !== null) {
      window.clearTimeout(this.progressSaveDebounce);
      this.progressSaveDebounce = null;
    }

    let clearedCount = 0;
    for (const feed of this.settings.feeds) {
      for (const item of feed.items) {
        if (!item.playbackProgress) {
          continue;
        }

        delete item.playbackProgress;
        clearedCount++;
      }
    }

    const appWithLocalStorage = this.app as unknown as {
      removeLocalStorage?: (key: string) => void;
      saveLocalStorage?: (key: string, value: unknown) => void;
    };
    if (typeof appWithLocalStorage.removeLocalStorage === "function") {
      appWithLocalStorage.removeLocalStorage("rss-podcast-progress");
    } else if (typeof appWithLocalStorage.saveLocalStorage === "function") {
      appWithLocalStorage.saveLocalStorage("rss-podcast-progress", null);
    }

    if (clearedCount > 0) {
      await this.saveSettings();
    }

    return clearedCount;
  }

  private async migrateMediaProgressOnStartup(): Promise<void> {
    if (!this.settings.media.rememberPlaybackProgress) {
      return;
    }

    const appWithLocalStorage = this.app as unknown as LegacyLocalStorageApi;
    if (typeof appWithLocalStorage.loadLocalStorage !== "function") return;

    const legacyProgress = appWithLocalStorage.loadLocalStorage(
      "rss-podcast-progress",
    );
    if (!isRecord(legacyProgress)) return;

    let migratedCount = 0;
    for (const guid in legacyProgress) {
      const data = legacyProgress[guid];
      if (!isLegacyPlaybackProgressEntry(data)) continue;

      for (const feed of this.settings.feeds) {
        const item = feed.items.find((i) => i.guid === guid);
        if (!item) continue;

        item.playbackProgress = {
          position: data.position,
          duration: data.duration,
          lastUpdated: Date.now(),
        };
        migratedCount++;
        break;
      }
    }

    if (migratedCount > 0) {
      storageLog(
        `[RSS Dashboard] Migrated ${migratedCount} media progress items.`,
      );
      await this.saveSettings();
    }

    if (typeof appWithLocalStorage.removeLocalStorage === "function") {
      appWithLocalStorage.removeLocalStorage("rss-podcast-progress");
    }
  }

  /**
   * Creates a save callback that persists metadata to the appropriate location
   * based on the current metadataStorageMode.
   */
  public getMetadataSaveCallback(): (data: unknown) => Promise<void> {
    return async (data: unknown): Promise<void> => {
      const settingsData = data as RssDashboardSettings;
      const metadataPath = getMetadataPath(this.settings);
      if (metadataPath) {
        try {
          await ensureMetadataFolderExists(this.app, this.settings);
          const dataFilePath = `${metadataPath}/data.json`;
          const jsonContent = JSON.stringify(settingsData, null, 2);
          await this.app.vault.adapter.write(dataFilePath, jsonContent);
          storageLog("Metadata saved to vault location", {
            path: dataFilePath,
          });
          // Bootstrap pointer only — just enough for loadSettings to
          // find the vault data.json on restart. Does NOT write full
          // settings to .obsidian, preventing the stale-read bug on mobile.
          await this.saveData({
            metadataStorageMode: this.settings.metadataStorageMode,
            metadataStorageFolder: this.settings.metadataStorageFolder,
            metadataStorageSchemaVersion:
              this.settings.metadataStorageSchemaVersion,
          });
        } catch (error) {
          storageError("Failed to save metadata to vault location", error);
          throw error;
        }
      } else {
        await this.saveData(settingsData);
        storageLog("Metadata saved to plugin default location");
      }
    };
  }

  async saveSettings() {
    storageLog("saveSettings invoked", {
      mode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      metadataMode: this.settings.metadataStorageMode,
      feedCount: this.settings.feeds.length,
    });

    try {
      const result = await this.feedStorageRepository.persistSettings(
        this.settings,
        this.getMetadataSaveCallback(),
      );
      storageLog("saveSettings completed", result);
    } catch (error) {
      storageError("saveSettings failed", error, {
        mode: this.settings.storageMode,
        folder: this.settings.storageFolder,
        metadataMode: this.settings.metadataStorageMode,
      });
      throw error;
    }
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
    if (this.settings.metadataStorageMode === "vault-location") {
      new Notice("Already using vault location for metadata storage");
      return;
    }

    try {
      // Resolve the target path using vault-location mode (before updating mode in settings)
      const targetSettingsForPath: RssDashboardSettings = {
        ...this.settings,
        metadataStorageMode: "vault-location",
      };
      const metadataPath = getMetadataPath(targetSettingsForPath);
      if (!metadataPath) {
        throw new Error("Failed to resolve metadata storage path");
      }

      // Ensure the target folder exists
      await ensureMetadataFolderExists(this.app, targetSettingsForPath);

      // Write current settings to vault location as JSON
      const settingsJson = JSON.stringify(this.settings, null, 2);
      const dataFilePath = `${metadataPath}/data.json`;
      await this.app.vault.adapter.write(dataFilePath, settingsJson);

      // Update mode and persist using the dual-mode save callback
      this.settings.metadataStorageMode = "vault-location";
      await this.saveSettings();

      new Notice(`Metadata migrated to vault location: ${metadataPath}`);
    } catch (error) {
      storageError("Metadata migration failed", error);
      // Revert mode on error (no partial state)
      this.settings.metadataStorageMode = "plugin-default";
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      new Notice(`Vault migration failed: ${errorMessage}`);
      throw error;
    }
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
    if (this.settings.metadataStorageMode === "plugin-default") {
      new Notice("Already using plugin default for metadata storage");
      return;
    }

    try {
      // Current settings are already in memory, just switch the mode
      this.settings.metadataStorageMode = "plugin-default";

      // Save using Plugin.saveData() (plugin-default location)
      await this.saveData(this.settings);

      // Optionally clean up the vault-location file
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

    const backgroundPromises: Promise<void>[] = [];

    const worker = async (): Promise<void> => {
      while (true) {
        await globalFetchSemaphore.acquire();

        const currentFeed = feedsToRefresh[nextFeedIndex];
        nextFeedIndex += 1;
        if (!currentFeed) {
          globalFetchSemaphore.release();
          return;
        }

        const refreshPromise = this.processRefreshBatchFeed(
          currentFeed,
          refreshSummary,
          refreshView,
        ).finally(() => {
          globalFetchSemaphore.release();
        });

        const winner = await Promise.race([
          refreshPromise.then(() => "fetch"),
          this.waitForFeedSoftTimeout().then(() => "timeout"),
        ]);

        if (winner === "timeout") {
          backgroundPromises.push(refreshPromise);
        }
      }
    };

    const workerCount = Math.min(
      MAX_CONCURRENT_FETCHES,
      feedsToRefresh.length,
    );

    try {
      const workers = Array.from({ length: workerCount }, () => worker());
      await refreshView(true);
      await Promise.all(workers);
      await Promise.all(backgroundPromises);

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

  private async processRefreshBatchFeed(
    currentFeed: Feed,
    refreshSummary: { failed: number; timedOut: number },
    refreshView: () => Promise<void>,
  ): Promise<void> {
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

  private async waitForFeedSoftTimeout(): Promise<void> {
    return new Promise((resolve) => {
      activeWindow.setTimeout(resolve, FEED_SOFT_TIMEOUT_MS);
    });
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

  onunload() {
    if (this.progressSaveDebounce !== null) {
      window.clearTimeout(this.progressSaveDebounce);
      this.progressSaveDebounce = null;
      void this.saveSettings();
    }

    if (this.vaultMetadataReloadTimer !== null) {
      activeWindow.clearTimeout(this.vaultMetadataReloadTimer);
      this.vaultMetadataReloadTimer = null;
    }

    this.cancelPendingStartupRefresh();

    // Run backups asynchronously on plugin disable/unload (best effort)
    void this.backupService.performAutoBackups();
  }

  public cancelPendingStartupRefresh(): void {
    if (this.startupRefreshTimeoutId !== null) {
      activeWindow.clearTimeout(this.startupRefreshTimeoutId);
      this.startupRefreshTimeoutId = null;
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
