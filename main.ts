import {
  App,
  Plugin,
  Notice,
  WorkspaceLeaf,
  Platform,
  requireApiVersion,
  type ObsidianProtocolData,
} from "obsidian";

import {
  getSettingManager,
  openSettingsOnTop,
} from "./src/utils/settings-manager";

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
  FeedEncoding,
  FeedShardHealth,
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
} from "./src/services/feed-parser";
import { ArticleSaver } from "./src/services/article-saver";
import { BackupService } from "./src/services/backup-service";
import { AutoBackupCoordinator } from "./src/services/auto-backup-coordinator";
import { FolderService } from "./src/services/folder-service";
import {
  FeedStorageRepository,
  type FeedLocalStorageAddress,
  type FeedStorageStatus,
  type PersistSettingsOptions,
  type RepairPreview,
  type RepairResult,
  ShardFolderDeletionError,
} from "./src/services/feed-storage-repository";
import {
  ImportExportService,
  type ImportConfirmation,
  type ImportDecision,
  type ImportResult,
} from "./src/services/import-export-service";
import { ImportConfirmationModal } from "./src/settings/modals/import-confirmation-modal";
import type { ExportBlobResult } from "./src/utils/export-utils";
import { BackgroundImportService } from "./src/services/background-import-service";
import { FeedRefreshScheduler } from "./src/services/feed-refresh-scheduler";
import { OpmlManager } from "./src/services/opml-manager";
import { PreviewImageCache } from "./src/services/preview-image-cache";
import { FeedOperationTracker } from "./src/services/feed-operation-tracker";
import {
  FeedRefreshRunner,
  type FeedRefreshIntent,
} from "./src/services/feed-refresh-runner";
import { FeedSubscriptionService } from "./src/services/feed-subscription-service";
import { SettingsImportApplier } from "./src/services/settings-import-applier";
import { SettingsStore } from "./src/services/settings-store";
import {
  UriActionHandler,
  type AddFeedUriRequest,
} from "./src/services/uri-action-handler";
import { getMetadataPath } from "./src/services/metadata-location";

import { ImportOpmlModal } from "./src/modals/import-opml-modal";
import { ImportStarredModal } from "./src/modals/import-starred-modal";
import { AddFeedModal } from "./src/modals/feed-manager/add-feed-modal";
import { StorageMigrationModal } from "./src/modals/storage-migration-modal";
import { WhatsNewModal } from "./src/modals/whats-new-modal";
import { shouldShowStorageDeprecationPrompt } from "./src/utils/storage-deprecation-prompt";
import { decideWhatsNew } from "./src/utils/whats-new";
import {
  getReleaseNoteForVersion,
  hasExactReleaseNoteForVersion,
} from "./src/release-notes";
import { migrateSettings } from "./src/utils/settings-loader";
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
  saveLocalStorage?: (key: string, value: unknown) => void;
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
  return isRecord(value) && typeof value.position === "number" &&
    Number.isFinite(value.position) && value.position >= 0 &&
    typeof value.duration === "number" && Number.isFinite(value.duration) &&
    value.duration > 0;
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
  private readonly autoBackupCoordinator: AutoBackupCoordinator;
  protected folderService!: FolderService;
  private importExportService!: ImportExportService;
  private backgroundImportService!: BackgroundImportService;
  public activeRefreshState = new Map<string, FeedRefreshState>();
  public settingTab: RssDashboardSettingTab | null = null;
  public vaultAbsolutePath = "";
  private hasCompletedStartupSavedArticleValidation = false;
  private hasShownStorageDeprecationPromptThisSession = false;
  private whatsNewHandledThisSession = false;
  private startupRefreshTimeoutId: number | null = null;
  private progressSaveDebounce: number | null = null;
  private autoRefreshScheduler: FeedRefreshScheduler | null = null;
  private readonly feedStorageRepository: FeedStorageRepository;
  private readonly settingsStore: SettingsStore;
  private readonly uriActionHandler: UriActionHandler;
  private readonly feedOperationTracker: FeedOperationTracker;
  private readonly previewImageCache: PreviewImageCache;
  private readonly feedRefreshRunner: FeedRefreshRunner;
  private readonly feedSubscriptionService: FeedSubscriptionService;
  private readonly settingsImportApplier: SettingsImportApplier;

  constructor(app: App, manifest: ConstructorParameters<typeof Plugin>[1]) {
    super(app, manifest);
    this.autoBackupCoordinator = new AutoBackupCoordinator({
      writeSnapshot: () => this.backupService.performAutoBackups(),
      shouldWriteSnapshot: () => {
        const autoBackup = this.settings.autoBackup;
        return Boolean(
          autoBackup &&
            (autoBackup.backupDataJson ||
              autoBackup.backupOpml ||
              autoBackup.backupUserdata),
        );
      },
    });
    this.feedStorageRepository = new FeedStorageRepository(app, {
      writeWrapper: (fn) => this.writeWithWatcherSuppressed(fn),
      onUserStateHealthChange: () => {
        void this.notifyRefreshStatusChanged();
      },
    });
    this.settingsStore = new SettingsStore(app, {
      manifest,
      feedStorageRepository: this.feedStorageRepository,
      autoBackupCoordinator: this.autoBackupCoordinator,
      getSettings: () => this.settings,
      setSettings: (settings) => {
        this.settings = settings;
      },
      loadData: () => this.loadData(),
      saveData: (data) => this.saveData(data),
      loadSettings: () => this.loadSettings(),
      saveSettings: () => this.saveSettings(),
      migrateLegacySettings: () => this.migrateLegacySettings(),
      repairMissingFolderPathsForFeeds: () =>
        this.repairMissingFolderPathsForFeeds(),
      hasFolderService: () => Boolean(this.folderService),
      hasBackupService: () => Boolean(this.backupService),
      bindSettingsBackedServices: () => this.bindSettingsBackedServices(),
      initializeSettingsBackedServices: () =>
        this.initializeSettingsBackedServices(),
      getAutoRefreshScheduler: () => this.autoRefreshScheduler,
      refreshDashboardViews: () => this.refreshDashboardViews(),
    });
    this.uriActionHandler = new UriActionHandler({
      pluginId: manifest.id,
      openAddFeed: (request) => this.openAddFeedFromUri(request),
      getDefaultRssFolder: () => this.settings.media.defaultRssFolder,
    });
    this.feedOperationTracker = new FeedOperationTracker(app, {
      activeRefreshState: this.activeRefreshState,
      renderStatus: () => this.notifyRefreshStatusChanged(),
      renderSidebar: () => this.notifySidebarRefreshStatusChanged(),
      onCancelled: () => this.autoRefreshScheduler?.deferGlobalRefresh(),
    });
    this.previewImageCache = new PreviewImageCache(app, {
      manifest,
      getSettings: () => this.settings,
      saveSettings: () => this.saveSettings(),
      isRefreshBatchRunning: () => this.feedOperationTracker.isRunning,
      getDashboardView: () => this.getActiveDashboardView(),
    });
    this.feedRefreshRunner = new FeedRefreshRunner({
      feedOperationTracker: this.feedOperationTracker,
      previewImageCache: this.previewImageCache,
      getSettings: () => this.settings,
      getFeedParser: () => this.feedParser,
      getBackgroundImportService: () => this.backgroundImportService,
      getAutoRefreshScheduler: () => this.autoRefreshScheduler,
      saveSettings: () => this.saveSettings(),
      validateSavedArticles: () => this.validateSavedArticles(),
      clearFeedShardHealth: (feed) => this.clearFeedShardHealth(feed),
      getActiveDashboardView: () => this.getActiveDashboardView(),
      refreshFeeds: (selectedFeeds, intent) =>
        this.refreshFeeds(selectedFeeds, intent),
    });
    this.feedSubscriptionService = new FeedSubscriptionService({
      feedOperationTracker: this.feedOperationTracker,
      previewImageCache: this.previewImageCache,
      getSettings: () => this.settings,
      getFeedParser: () => this.feedParser,
      saveSettings: () => this.saveSettings(),
      ensureFolderExists: (folderPath, options) =>
        this.ensureFolderExists(folderPath, options),
      getActiveDashboardView: () => this.getActiveDashboardView(),
    });
    this.settingsImportApplier = new SettingsImportApplier({
      getSettings: () => this.settings,
      setSettings: (settings) => {
        this.settings = settings;
      },
      isSettingsLoadFailed: () => this.settingsLoadFailed,
      getFeedStorageRepository: () => this.feedStorageRepository,
      getMetadataSaveCallback: () => this.getMetadataSaveCallback(),
      saveSettings: (...args) => this.saveSettings(...args),
      migrateLegacySettings: () => this.migrateLegacySettings(),
      initializeSettingsBackedServices: () =>
        this.initializeSettingsBackedServices(),
      refreshSettingTab: () => this.settingTab?.refresh(),
      refreshDashboardViews: () => this.refreshDashboardViews(),
      renderDiscoverView: async () => {
        const discoverView = await this.getActiveDiscoverView();
        discoverView?.render();
      },
    });
  }

  /** Forwards to the settings store, which owns the load-failure flag. */
  private get settingsLoadFailed(): boolean {
    return this.settingsStore.settingsLoadFailed;
  }

  private set settingsLoadFailed(value: boolean) {
    this.settingsStore.settingsLoadFailed = value;
  }

  private get wasNullSettingsLoad(): boolean {
    return this.settingsStore.wasNullSettingsLoad;
  }

  private initializeSettingsBackedServices(): void {
    this.bindSettingsBackedServices();
    this.backgroundImportService = new BackgroundImportService({
      // Forward to the current parser so a rebind after a settings reload
      // reaches an import that is already running.
      feedParser: {
        parseFeed: (url, existingFeed, options) =>
          this.feedParser.parseFeed(url, existingFeed, options),
      },
      getSettings: () => this.settings,
      getView: () => this.getActiveDashboardView(),
      saveSettings: () => this.saveSettings(),
      ensureFolderExists: (folder, opts) =>
        this.ensureFolderExists(folder, opts),
      addStatusBarItem: () => this.addStatusBarItem(),
      beginGlobalOperation: (total) => this.feedOperationTracker.begin(total),
      updateGlobalOperationProgress: (completed, total) =>
        this.feedOperationTracker.updateProgress(completed, total),
      endGlobalOperation: () => this.feedOperationTracker.end(),
      isGlobalOperationCancelled: () => this.feedOperationTracker.isCancelled,
      onFeedImported: (feed) => this.previewImageCache.warmFeed(feed),
      onImportQueueDrained: (processedCount) => {
        new Notice(
          `Background import completed. Processed ${processedCount} feeds.`,
        );
      },
    });
  }

  /**
   * Rebuild the services that hold the settings object, or parts of it, so
   * they follow a reassigned `this.settings`. BackgroundImportService is left
   * alone because replacing it would drop a running import's queue.
   */
  private bindSettingsBackedServices(): void {
    this.feedParser = new FeedParser(
      this.settings.display,
      this.settings.availableTags,
      this.settings.media,
      () => this.settings.folders,
      () => this.settings.corsProxyEnabled,
      () => ({
        protectStarred: this.settings.protectStarred,
        protectSaved: this.settings.protectSaved,
        protectTagged: this.settings.protectTagged,
        protectUnread: this.settings.protectUnread,
      }),
      () => this.settings.useFirstSeenDateFallback,
    );
    this.articleSaver = new ArticleSaver(
      this.app,
      this.settings.articleSaving,
      undefined,
      () => this.settings.useFirstSeenDateFallback,
    );
    this.importExportService = new ImportExportService({
      settings: this.settings,
      isMobile: Platform.isMobileApp,
      getPortableDataBundle: () => this.getPortableDataBundle(),
      importPortableDataBundle: (bundle) =>
        this.settingsImportApplier.applyPortableDataBundleImport(bundle),
      getFeedBundle: () => this.getFeedBundle(),
      importFeedBundle: (bundle) =>
        this.settingsImportApplier.applyFeedBundleImport(bundle),
      getSettingsBundle: () => this.getSettingsBundle(),
      importSettingsBundle: (bundle) =>
        this.settingsImportApplier.applySettingsBundleImport(bundle),
      importUserPreferences: (preferences, kind) =>
        this.settingsImportApplier.applyUserPreferencesImport(preferences, kind),
      confirmImport: (confirmation) => this.confirmImport(confirmation),
      getUnloadedFeedCount: () => this.getUnloadedShardFeedCount(),
    });
    this.backupService = new BackupService({
      settings: this.settings,
      manifest: this.manifest,
      vaultAbsolutePath: this.vaultAbsolutePath,
      vault: this.app.vault,
      getUserSettingsJson: () => this.importExportService.getUserSettingsJson(),
    });
    this.folderService = new FolderService(this.settings);
  }

  public resolveCachedImageUrl(remoteUrl: string): string | null {
    return this.previewImageCache.resolveCachedUrl(remoteUrl);
  }

  public getImageCacheSizeBytes(): number {
    return this.previewImageCache.getSizeBytes();
  }

  public onImageCacheChanged(listener: () => void): () => void {
    return this.previewImageCache.onChange(listener);
  }

  public setImageCacheLimit(
    limitMiB: number,
    unlimited: boolean,
  ): Promise<void> {
    return this.previewImageCache.setLimit(limitMiB, unlimited);
  }

  public clearImageCache(): Promise<{ cleared: number; failed: number }> {
    return this.previewImageCache.clear();
  }

  public removeCachedImagesForDeletedFeed(feed: Feed): Promise<void> {
    return this.previewImageCache.forgetFeed(feed);
  }

  public setImageCachingEnabled(enabled: boolean): Promise<void> {
    return this.previewImageCache.setEnabled(enabled);
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

  public writeWithWatcherSuppressed<T>(
    writeFn: () => Promise<T>,
    windowMs?: number,
  ): Promise<T> {
    return this.settingsStore.writeWithWatcherSuppressed(writeFn, windowMs);
  }

  private ensureAutoRefreshScheduler(): FeedRefreshScheduler {
    if (!this.autoRefreshScheduler) {
      this.autoRefreshScheduler = new FeedRefreshScheduler({
        getFeeds: () => this.settings.feeds,
        getGlobalIntervalMinutes: () => this.settings.refreshInterval,
        getLastGlobalRefreshCompletedAt: () =>
          this.settings.lastGlobalRefreshCompletedAt,
        isBatchRunning: () => this.feedOperationTracker.isRunning,
        requestGlobalRefresh: async () =>
          await this.refreshFeeds(undefined, "global"),
        requestDueFeeds: async (feeds) => await this.refreshFeeds(feeds, "due"),
      });
    }

    return this.autoRefreshScheduler;
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

  /**
   * Shown when the RSS Dashboard view opens, not on every Obsidian launch:
   * Obsidian restores background panes before the user ever looks at them, so
   * gating on the view itself (rather than `workspace.onLayoutReady`) keeps
   * the prompt tied to actually using the plugin.
   */
  public maybeShowStorageDeprecationPrompt(): void {
    if (this.hasShownStorageDeprecationPromptThisSession) {
      return;
    }
    if (!this.settings) {
      return;
    }
    if (!shouldShowStorageDeprecationPrompt(this.settings, this.manifest.version)) {
      return;
    }

    this.hasShownStorageDeprecationPromptThisSession = true;
    // The storage warning owns the session: What's New is dropped for now and
    // is not queued behind it. Because nothing is recorded here, the note is
    // shown in a later session once the warning no longer applies.
    this.whatsNewHandledThisSession = true;
    new StorageMigrationModal(this.app, this).open();
  }

  /**
   * Entry point for the What's New popup. Runs once per session, and only
   * once the dashboard view is the active tab, so a restored background pane
   * never interrupts an Obsidian launch the user is not using the plugin in.
   */
  public maybeShowWhatsNewForActiveDashboard(): void {
    if (this.whatsNewHandledThisSession) {
      return;
    }
    if (!this.settings) {
      return;
    }
    if (!this.app.workspace.getActiveViewOfType(RssDashboardView)) {
      return;
    }

    // The storage warning takes precedence even if it has not opened yet, so
    // the two never stack. Marking it handled here is what keeps What's New
    // from being queued behind the warning for this session.
    if (shouldShowStorageDeprecationPrompt(this.settings, this.manifest.version)) {
      this.whatsNewHandledThisSession = true;
      return;
    }

    this.whatsNewHandledThisSession = true;
    void this.maybeShowWhatsNew();
  }

  /**
   * Shows a due curated release note. Skipped on a null settings load (a
   * genuine fresh install, or a synced vault whose data.json has not arrived
   * yet) and on a failed load, because both cases would write
   * `lastShownVersion` into settings that are not the user's real data.
   */
  private async maybeShowWhatsNew(): Promise<void> {
    if (!this.settings || this.wasNullSettingsLoad || this.settingsLoadFailed) {
      return;
    }

    const note = getReleaseNoteForVersion(this.manifest.version);
    const decision = decideWhatsNew({
      currentVersion: this.manifest.version,
      lastShownVersion: this.settings.lastShownVersion,
      hasNote: note !== null,
      hasExactPatchNote: hasExactReleaseNoteForVersion(this.manifest.version),
    });

    if (decision.shouldShow && note) {
      new WhatsNewModal(this.app, this.manifest.version, note).open();
    }

    if (
      decision.nextLastShownVersion !== undefined &&
      decision.nextLastShownVersion !== this.settings.lastShownVersion
    ) {
      this.settings.lastShownVersion = decision.nextLastShownVersion;
      await this.saveSettings();
    }
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

  /** Updates only refresh affordances so active work never resets article scroll. */
  private async notifyRefreshStatusChanged(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof RssDashboardView) {
        view.refreshSidebarOnly();
        view.refreshFilterStatusBarOnly();
      }
    }
  }

  /** Updates navigation affordances without rebuilding dashboard content. */
  private async notifySidebarRefreshStatusChanged(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof RssDashboardView) {
        view.refreshSidebarOnly();
      }
    }
  }

  public get isUserStateUnreadable(): boolean {
    return this.feedStorageRepository.isUserStateUnreadable();
  }

  public get isShardFolderHiddenFromSync(): boolean {
    return this.feedStorageRepository.isShardFolderHiddenFromSync();
  }

  public get isMultiFeedRefreshActive(): boolean {
    return this.feedOperationTracker.isRunning;
  }

  public get isGlobalRefreshCancellable(): boolean {
    return this.feedOperationTracker.isCancellable;
  }

  public get globalRefreshProgress(): { completed: number; total: number } {
    return this.feedOperationTracker.progress;
  }

  public cancelGlobalRefresh(): void {
    this.feedOperationTracker.cancel();
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
    this.feedOperationTracker.markIdle();
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
      this.settingTab.refresh();
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
      openSettingsOnTop(setting);
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
      openSettingsOnTop(setting);
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
    await this.previewImageCache.initialize();
    this.settingsStore.registerVaultMetadataChangeListeners((ref) =>
      this.registerEvent(ref),
    );

    const view = await this.getActiveDashboardView();
    if (view) {
      view.render();
    }

    try {
      this.initializeSettingsBackedServices();
      const autoRefreshScheduler = this.ensureAutoRefreshScheduler();

      if (Platform.isMobile) {
        this.applyMobileOptimizations();
      }

      this.scheduleStartupSavedArticleValidation();

      // What's New is gated on the dashboard being the active tab, unlike the
      // storage warning's own trigger. A restored session can already have the
      // dashboard active without an `active-leaf-change`, so check both.
      this.registerEvent(
        this.app.workspace.on("active-leaf-change", () => {
          this.maybeShowWhatsNewForActiveDashboard();
        }),
      );
      this.app.workspace.onLayoutReady(() => {
        this.maybeShowWhatsNewForActiveDashboard();
      });

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
            () => this.settings,
            () => this.articleSaver,
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
        name: "Import OPML/XML",
        callback: () => {
          new ImportOpmlModal(this.app, this).open();
        },
      });

      this.addCommand({
        id: "import-starred",
        name: "Import starred articles",
        callback: () => {
          new ImportStarredModal(this.app, this).open();
        },
      });

      this.addCommand({
        id: "export-opml",
        name: "Export OPML",
        callback: () => {
          void this.exportOpml();
        },
      });

      this.addCommand({
        id: "import-usersettings-json",
        name: "Import user preferences",
        callback: () => {
          this.importUserSettingsJson();
        },
      });

      this.addCommand({
        id: "export-usersettings-json",
        name: "Export user preferences",
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

      const delay = Number.isFinite(this.settings.startupRefreshDelaySeconds)
        ? this.settings.startupRefreshDelaySeconds
        : DEFAULT_SETTINGS.startupRefreshDelaySeconds;
      if (delay > 0) {
        this.startupRefreshTimeoutId = window.setTimeout(() => {
          this.startupRefreshTimeoutId = null;
          this.backgroundImportService.resumePendingImports();
          autoRefreshScheduler.start();
        }, delay * 1000);
      } else {
        this.backgroundImportService.resumePendingImports();
        autoRefreshScheduler.start();
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
    return this.uriActionHandler.dispatch(params);
  }

  private async openAddFeedFromUri(request: AddFeedUriRequest): Promise<void> {
    await this.activateView();

    new AddFeedModal(
      this.app,
      this.settings.folders,
      async (addRequest) =>
        await this.addFeed(
          addRequest.title,
          addRequest.url,
          addRequest.folder,
          addRequest.autoDeleteDuration,
          addRequest.maxItemsLimit,
          addRequest.scanInterval,
          addRequest.feedKeywordRules,
          addRequest.customTemplate,
          addRequest.excludeFromRefresh,
          addRequest.customTags,
          { feedEncoding: addRequest.feedEncoding },
        ),
      () => {
        void this.refreshDashboardViews();
      },
      request.defaultFolder,
      this,
      request.url,
      request.title,
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
        leaf = leaves[0] ?? null;
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
        leaf = leaves[0] ?? null;
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
        leaf = leaves[0] ?? null;
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

  refreshFeeds(
    selectedFeeds?: Feed[],
    intent?: FeedRefreshIntent,
  ): Promise<void> {
    return this.feedRefreshRunner.refreshFeeds(selectedFeeds, intent);
  }

  refreshFailedFeeds(): Promise<void> {
    return this.feedRefreshRunner.refreshFailedFeeds();
  }

  /**
   * Apply feed limits (maxItemsLimit and autoDeleteDuration) to all feeds
   * This is useful when users want to apply their current settings to existing feeds
   */
  applyFeedLimitsToAllFeeds(): Promise<void> {
    return this.feedSubscriptionService.applyFeedLimitsToAllFeeds();
  }

  refreshSelectedFeed(feed: Feed): Promise<void> {
    return this.feedRefreshRunner.refreshSelectedFeed(feed);
  }

  refreshFeedsInFolder(folderPath: string): Promise<void> {
    return this.feedRefreshRunner.refreshFeedsInFolder(folderPath);
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
              globalOperation: true,
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
      void this.importUserSettingsJsonFromFile(file).catch((error) => {
        new Notice(
          `Invalid rss-dashboard-user-preferences.json file${error instanceof Error ? `: ${error.message}` : ""}`,
        );
      });
    };

    input.click();
  }

  public async importUserSettingsJsonFromFile(file: File): Promise<ImportResult> {
    const result =
      await this.importExportService.importUserPreferencesFromFile(file);
    if (result === "canceled") this.showImportCanceledNotice();
    return result;
  }

  // ✅ ImportExportService extracted — delegates to service
  public getUserSettingsJson(): string {
    return this.importExportService.getUserSettingsJson();
  }

  public getPortableDataBundle() {
    return this.feedStorageRepository.buildPortableDataBundle(this.settings);
  }

  public getFeedBundle() {
    return this.feedStorageRepository.buildFeedBundle(this.settings);
  }

  public getSettingsBundle() {
    return this.feedStorageRepository.buildSettingsBundle(this.settings);
  }

  /**
   * Ask the user to confirm a Replacing or Overwriting import (issue #377).
   * The dialog's backup action exports a full Portable data bundle, the only
   * format that also covers article state and storage configuration.
   */
  private confirmImport(
    confirmation: ImportConfirmation,
  ): Promise<ImportDecision> {
    const modal = new ImportConfirmationModal(this.app, {
      confirmation,
      exportBackup: () => this.exportPortableDataBundle(),
    });
    const decision = modal.waitForClose();
    modal.open();
    return decision;
  }

  private showImportCanceledNotice(): void {
    new Notice("Import canceled. Nothing was changed.");
  }

  /**
   * Show a Notice reflecting the outcome of an export attempt. Export
   * services return their result rather than notifying directly; this is the
   * caller-side translation into user-facing feedback.
   * @param {ExportBlobResult} result The result of the export operation
   * @param {string} filename Name of the exported file
   * @returns {void}
   */
  private showExportNotice(result: ExportBlobResult, filename: string): void {
    if (result === "downloaded") {
      new Notice(`Downloading ${filename}`);
      return;
    }
    if (result === "shared" || result === "opened") {
      new Notice(`Opened save menu for ${filename}`);
      return;
    }
    if (result === "canceled") {
      new Notice("Export canceled");
      return;
    }
    new Notice(`Unable to export ${filename}`);
  }

  /**
   * Show a Notice reflecting the outcome of a clipboard copy attempt. Export
   * services return their result rather than notifying directly; this is the
   * caller-side translation into user-facing feedback.
   * @param {"copied" | "failed"} result The result of the copy operation
   * @param {string} filename Name of the data that was copied
   * @returns {void}
   */
  private showCopyNotice(result: "copied" | "failed", filename: string): void {
    if (result === "copied") {
      new Notice(`Copied ${filename} to clipboard`);
      return;
    }
    new Notice(`Unable to copy ${filename}`);
  }

  public async exportUserSettingsJson(): Promise<void> {
    const result = await this.importExportService.exportUserSettingsJson();
    this.showExportNotice(result, "rss-dashboard-user-preferences.json");
  }

  public async exportDataJson(): Promise<void> {
    const result = await this.importExportService.exportDataJson();
    this.showExportNotice(result, "data.json");
  }

  public async exportPortableDataBundle(): Promise<void> {
    const result = await this.importExportService.exportPortableDataBundle();
    this.showExportNotice(result, "rss-dashboard-portable-bundle.json");
  }

  public async importPortableDataBundleFromFile(file: File): Promise<ImportResult> {
    const result = await this.importExportService.importPortableDataBundleFromFile(file);
    if (result === "canceled") {
      this.showImportCanceledNotice();
    } else {
      new Notice("Portable data bundle imported");
    }
    return result;
  }

  public async exportFeedBundle(): Promise<void> {
    const result = await this.importExportService.exportFeedBundle();
    this.showExportNotice(result, "rss-dashboard-feed-bundle.json");
  }

  public async importFeedBundleFromFile(file: File): Promise<ImportResult> {
    const result = await this.importExportService.importFeedBundleFromFile(file);
    if (result === "canceled") {
      this.showImportCanceledNotice();
    } else {
      new Notice("Feed bundle imported");
    }
    return result;
  }

  public async exportSettingsBundle(): Promise<void> {
    const result = await this.importExportService.exportSettingsBundle();
    this.showExportNotice(result, "rss-dashboard-settings-bundle.json");
  }

  public async importSettingsBundleFromFile(file: File): Promise<ImportResult> {
    const result = await this.importExportService.importSettingsBundleFromFile(file);
    if (result === "canceled") {
      this.showImportCanceledNotice();
    } else {
      new Notice("Settings bundle imported");
    }
    return result;
  }

  exportOpml(): void {
    void (async () => {
      const result = await this.importExportService.exportOpml();
      this.showExportNotice(result, "feeds.opml");
    })();
  }

  public async copyDataJsonToClipboard(): Promise<void> {
    const result = await this.importExportService.copyDataJsonToClipboard();
    this.showCopyNotice(result, "data.json");
  }

  public async copyUserSettingsJsonToClipboard(): Promise<void> {
    const result =
      await this.importExportService.copyUserSettingsJsonToClipboard();
    this.showCopyNotice(result, "rss-dashboard-user-preferences.json");
  }

  public async copyOpmlToClipboard(): Promise<void> {
    const result = await this.importExportService.copyOpmlToClipboard();
    this.showCopyNotice(result, "feeds.opml");
  }

  public async copyPortableDataBundleToClipboard(): Promise<void> {
    const result =
      await this.importExportService.copyPortableDataBundleToClipboard();
    this.showCopyNotice(result, "rss-dashboard-portable-bundle.json");
  }

  public async copyFeedBundleToClipboard(): Promise<void> {
    const result = await this.importExportService.copyFeedBundleToClipboard();
    this.showCopyNotice(result, "rss-dashboard-feed-bundle.json");
  }

  public async copySettingsBundleToClipboard(): Promise<void> {
    const result =
      await this.importExportService.copySettingsBundleToClipboard();
    this.showCopyNotice(result, "rss-dashboard-settings-bundle.json");
  }

  public getOrphanedUserStatePath(): Promise<string | null> {
    return this.feedStorageRepository.findOrphanedUserState(this.settings);
  }

  public getStorageStatus(): FeedStorageStatus {
    return this.feedStorageRepository.getStatus(this.settings);
  }

  /** Vault-relative path of the data.json that metadata is actually written to. */
  public getMetadataFilePath(): string {
    const metadataFolder =
      getMetadataPath(this.settings) ?? this.manifest.dir ?? "";
    const trimmed = metadataFolder.replace(/[\\/]+$/g, "");
    return trimmed ? `${trimmed}/data.json` : "data.json";
  }

  public getFeedLocalStorageAddress(feed: Feed): FeedLocalStorageAddress {
    const resolved = this.feedStorageRepository.getFeedLocalStorageAddress(
      this.settings,
      feed,
    );

    if (resolved.mode !== "legacy-json") {
      return resolved;
    }

    const relativeDataPath = this.getMetadataFilePath();

    return {
      ...resolved,
      address:
        this.resolveVaultRelativePathToOsPath(relativeDataPath) ??
        relativeDataPath,
    };
  }

  public getFeedShardHealth(feed: Feed): FeedShardHealth | null {
    return this.feedStorageRepository.getFeedShardHealth(feed);
  }

  public clearFeedShardHealth(feed: Feed): void {
    this.feedStorageRepository.clearFeedShardHealth(feed);
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
    if (this.settingsLoadFailed) return;
    storageLog("Plugin migration requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });
    try {
      await this.feedStorageRepository.migrateToVaultShards(
        this.settings,
        this.getMetadataSaveCallback(),
      );
      this.initializeSettingsBackedServices();
      await this.refreshDashboardViews();
      if (this.settingTab) {
        this.settingTab.refresh();
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
    if (this.settingsLoadFailed) return;
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
        this.settingTab.refresh();
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

  public async backupAndMigrateStorageToV2(): Promise<void> {
    if (this.settingsLoadFailed) return;
    storageLog("Running backup before migrating to vault-shards-v2");
    try {
      await this.autoBackupCoordinator.backupBeforeMigration();
    } catch (e) {
      storageError("Backup failed before migration", e);
      new Notice("Backup failed, proceeding with migration...");
    }
    await this.migrateToVaultShardsV2();
  }

  public getUnloadedShardFeedCount(): number {
    return this.feedStorageRepository.countUnloadedFeeds(this.settings);
  }

  public previewRepairVaultStorage(): Promise<RepairPreview> {
    return this.feedStorageRepository.previewRepairVaultShards(this.settings);
  }

  public async repairVaultShards(): Promise<RepairResult> {
    if (this.settingsLoadFailed) {
      return { skippedFeedCount: this.settings.feeds.length };
    }
    storageLog("Plugin repair requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });
    try {
      const result = await this.feedStorageRepository.repairVaultShards(
        this.settings,
        this.getMetadataSaveCallback(),
      );
      if (this.settingTab) {
        this.settingTab.refresh();
      }
      storageLog("Plugin repair completed");
      return result;
    } catch (error) {
      storageError("Plugin repair failed", error, {
        currentMode: this.settings.storageMode,
        folder: this.settings.storageFolder,
      });
      throw error;
    }
  }

  /** Alias required by StorageSettingsPlugin interface. Delegates to repairVaultShards(). */
  public async repairVaultStorage(): Promise<RepairResult> {
    return this.repairVaultShards();
  }

  public async revertToLegacyJsonStorage(): Promise<void> {
    return this.revertToLegacyJsonStorageWithOptions();
  }

  public async revertToLegacyJsonStorageWithOptions(options?: {
    deleteShardFolder?: boolean;
  }): Promise<void> {
    if (this.settingsLoadFailed) return;
    storageLog("Plugin revert requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
      deleteShardFolder: Boolean(options?.deleteShardFolder),
    });
    try {
      await this.feedStorageRepository.revertToLegacyJson(
        this.settings,
        this.getMetadataSaveCallback(),
        options,
      );
      this.initializeSettingsBackedServices();
      await this.refreshDashboardViews();
      if (this.settingTab) {
        this.settingTab.refresh();
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

  addFeed(
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
    options?: {
      showNotice?: boolean;
      feedEncoding?: FeedEncoding;
      globalOperation?: boolean;
    },
  ): Promise<boolean> {
    return this.feedSubscriptionService.addFeed(
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
  }

  addSubfolder(
    parentFolderName: string,
    subfolderName: string,
  ): Promise<void> {
    return this.feedSubscriptionService.addSubfolder(
      parentFolderName,
      subfolderName,
    );
  }

  editFeed(
    feed: Feed,
    newTitle: string,
    newUrl: string,
    newFolder: string,
  ): Promise<void> {
    return this.feedSubscriptionService.editFeed(
      feed,
      newTitle,
      newUrl,
      newFolder,
    );
  }

  loadSettings(): Promise<void> {
    return this.settingsStore.loadSettings();
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
    const migrationProgress = isRecord(legacyProgress) ? legacyProgress : {};
    let migratedCount = 0;
    for (const guid in migrationProgress) {
      const data = migrationProgress[guid];
      if (!isLegacyPlaybackProgressEntry(data)) continue;

      for (const feed of this.settings.feeds) {
        const item = feed.items.find((i) => i.guid === guid);
        if (!item || item.playbackProgress) continue;

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
    } else {
      appWithLocalStorage.saveLocalStorage?.("rss-podcast-progress", null);
    }
  }

  public getMetadataSaveCallback(): (data: unknown) => Promise<void> {
    return this.settingsStore.getMetadataSaveCallback();
  }

  saveSettings(options: PersistSettingsOptions = {}): Promise<void> {
    return this.settingsStore.saveSettings(options);
  }

  migrateMetadataToVaultLocation(): Promise<void> {
    return this.settingsStore.migrateMetadataToVaultLocation();
  }

  revertMetadataToPluginDefault(): Promise<void> {
    return this.settingsStore.revertMetadataToPluginDefault();
  }

  /**
   * @returns {Promise<void>}
   * @throws {Error} If any backup write fails; the caller decides whether to notify the user, retry, or proceed anyway
   */
  public async performAutoBackups(): Promise<void> {
    // ✅ BackupService extracted — delegates to service
    await this.backupService.performAutoBackups();
  }

  onunload() {
    this.autoRefreshScheduler?.stop();
    const flushBackups = async (): Promise<void> => {
      if (this.progressSaveDebounce !== null) {
        window.clearTimeout(this.progressSaveDebounce);
        this.progressSaveDebounce = null;
        await this.saveSettings();
      }

      await this.autoBackupCoordinator.flushOnUnload();
    };

    this.settingsStore.dispose();

    this.previewImageCache.dispose();
    this.feedOperationTracker.dispose();

    this.cancelPendingStartupRefresh();

    // Obsidian does not await onunload. Request the final stale snapshot on a
    // best-effort basis after any pending progress persistence completes.
    void flushBackups().catch((e: unknown) => {
      console.error("[RSS Dashboard] Backup on unload failed:", e);
    });
  }

  public cancelPendingStartupRefresh(): void {
    if (this.startupRefreshTimeoutId !== null) {
      window.clearTimeout(this.startupRefreshTimeoutId);
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
