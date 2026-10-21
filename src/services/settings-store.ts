import {
  type App,
  type EventRef,
  Notice,
  type PluginManifest,
  TFolder,
  normalizePath,
} from "obsidian";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../types/types";
import {
  dedupeAndNormalizeFeedItems,
  loadAndNormalizeSettings,
} from "../utils/settings-loader";
import type { AutoBackupCoordinator } from "./auto-backup-coordinator";
import type {
  FeedStorageRepository,
  PersistSettingsOptions,
} from "./feed-storage-repository";
import type { FeedRefreshScheduler } from "./feed-refresh-scheduler";
import type { SavedArticleAssociationUpdate } from "./saved-article-association-service";
import type { UserStateJournalChange } from "./user-state-journal";
import {
  ensureMetadataFolderExists,
  getMetadataPath,
  loadMetadata,
} from "./metadata-location";
import { comparableSnapshotJson } from "./storage-json";
import { normalizeFolderPath } from "./feed-storage-shard";

function storageLog(_message: string, _details?: unknown): void {}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

/**
 * How long a queued article-state change waits for the next one before it is
 * written. The window starts at the first change and is not restarted by
 * later ones, so continuous playback still gets a flush every window.
 */
const ARTICLE_STATE_FLUSH_WINDOW_MS = 2_000;

/**
 * Queued changes that force a flush before the window ends, so a long burst is
 * not held in memory indefinitely.
 */
const ARTICLE_STATE_FLUSH_THRESHOLD = 25;

/**
 * How long playback-progress journal records are coalesced by article. Progress
 * events arrive several times a second; journaling each one would add a write
 * path per event (#1380). The snapshot write keeps its own, longer window.
 */
const PLAYBACK_JOURNAL_WINDOW_MS = 500;

/**
 * Serializes settings for the "did loading change anything" comparison,
 * leaving out each feed's articles. In shard storage `data.json` holds no
 * articles and loading fills them in from the shards, so counting them would
 * make every load look changed. Shard changes and merged duplicate articles
 * are reported separately by `hydrateSettings` and `dedupeAndNormalizeFeedItems`.
 */
function serializeWithoutArticles(settings: RssDashboardSettings): string {
  return JSON.stringify({
    ...settings,
    feeds: (settings.feeds ?? []).map((feed) => ({ ...feed, items: [] })),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface SettingsStoreOptions {
  /** Never changes. */
  manifest: PluginManifest;
  /** Built first in the plugin constructor. */
  feedStorageRepository: FeedStorageRepository;
  autoBackupCoordinator: AutoBackupCoordinator;
  /** Returns the live settings object; the store never holds its own copy. */
  getSettings: () => RssDashboardSettings;
  /** The plugin owns the settings reference; a load reassigns it. */
  setSettings: (settings: RssDashboardSettings) => void;
  loadData: () => Promise<unknown>;
  saveData: (data: unknown) => Promise<void>;
  /** The watcher's reload goes through the plugin facade. */
  loadSettings: () => Promise<void>;
  /** Load, move and revert save through the plugin facade. */
  saveSettings: () => Promise<void>;
  migrateLegacySettings: () => boolean;
  repairMissingFolderPathsForFeeds: () => Promise<void>;
  /** A reload rebinds the services only when they already exist. */
  hasFolderService: () => boolean;
  /** A first-load save builds the services first when they do not exist. */
  hasBackupService: () => boolean;
  bindSettingsBackedServices: () => void;
  initializeSettingsBackedServices: () => void;
  getAutoRefreshScheduler: () => FeedRefreshScheduler | null;
  refreshDashboardViews: () => Promise<void>;
  clearMissingSavedArticlePaths: () => SavedArticleAssociationUpdate[];
  notifySavedArticleAssociationUpdates: (
    updates: SavedArticleAssociationUpdate[],
  ) => Promise<void>;
}

/**
 * Reads and writes the plugin's settings object to disk: the startup and
 * reload load (bootstrap pointer, vault metadata location, null-load and
 * failed-load guards), every save through the metadata location with watcher
 * suppression, the watcher that reloads a synced data file, and moving the
 * metadata location.
 */
export class SettingsStore {
  /** Read by the plugin; only a load writes it. */
  wasNullSettingsLoad = false;
  /** Read and written by the plugin; a failed load blocks every save. */
  settingsLoadFailed = false;
  private hasNotifiedVaultMetadataFailure = false;
  private settingsLoadGeneration = 0;
  /**
   * Whether a load has started already. A later load keeps the settings
   * already in memory when it cannot read the folder a new pointer names;
   * the first one keeps the startup fallback.
   */
  private hasStartedSettingsLoad = false;
  /**
   * Comparable content of the plugin's own `data.json`, as last loaded or
   * written, so an external callback can tell a synced change from a write
   * this plugin made (#1400).
   */
  private pluginDataBaseline: string | null = null;
  /**
   * The metadata folder a reload could not read, while the settings still in
   * memory name the previous one. Watched alongside the current folder so
   * its `data.json` arriving later can recover the session without a restart.
   */
  private pendingMetadataFolder: string | null = null;
  private vaultMetadataReloadTimer: number | null = null;
  private suppressWatcherUntil = 0;
  private articleStateFlushTimer: number | null = null;
  private queuedArticleStateChanges = 0;
  private articleStateFlush: Promise<void> | null = null;
  /**
   * Latest playback-progress change per article, journaled once per short
   * window instead of once per player event (#1380).
   */
  private pendingPlaybackChanges = new Map<string, UserStateJournalChange>();
  private playbackJournalTimer: number | null = null;
  /** One journal-failure notice per run of failures, not per append (#1380). */
  private warnedJournalAppendFailure = false;
  /**
   * Serialized journal appends from queued changes. A checkpoint, a settings
   * load, and an unload all wait for this before reading or rewriting the
   * snapshot, so a change is either folded in or replayed, never lost (#1387).
   */
  private journalAppendChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly app: App,
    private readonly options: SettingsStoreOptions,
  ) {
    // The journal is device-local and obeys this store's one write gate, so
    // the store that owns the plugin folder and the gate configures it.
    this.options.feedStorageRepository.configureDeviceLocalJournal({
      pluginDir: this.resolvePluginDir(),
      isPersistenceSuppressed: () => this.isPersistenceSuppressed(),
      getStorageMode: () => this.settings.storageMode,
    });
  }

  private resolvePluginDir(): string {
    return (
      this.options.manifest.dir ??
      `${this.app.vault.configDir}/plugins/${this.options.manifest.id}`
    );
  }

  private get settings(): RssDashboardSettings {
    return this.options.getSettings();
  }

  private get autoBackupCoordinator(): AutoBackupCoordinator {
    return this.options.autoBackupCoordinator;
  }

  private get feedStorageRepository(): FeedStorageRepository {
    return this.options.feedStorageRepository;
  }

  async writeWithWatcherSuppressed<T>(
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

  /** Clears the pending reload timer. */
  dispose(): void {
    if (this.vaultMetadataReloadTimer !== null) {
      window.clearTimeout(this.vaultMetadataReloadTimer);
      this.vaultMetadataReloadTimer = null;
    }
    this.clearArticleStateFlushTimer();
    this.clearPlaybackJournalTimer();
  }

  /**
   * The one gate every write path checks. The 3.0 read-only cutoff joins
   * `settingsLoadFailed` here when that predicate lands (ADR 0024), so every
   * path that consults this method inherits it.
   */
  private isPersistenceSuppressed(): boolean {
    return this.settingsLoadFailed;
  }

  private clearArticleStateFlushTimer(): void {
    if (this.articleStateFlushTimer === null) return;
    window.clearTimeout(this.articleStateFlushTimer);
    this.articleStateFlushTimer = null;
  }

  private clearPlaybackJournalTimer(): void {
    if (this.playbackJournalTimer === null) return;
    window.clearTimeout(this.playbackJournalTimer);
    this.playbackJournalTimer = null;
  }

  /**
   * The persistence options that carry article state for the current storage
   * mode.
   *
   * Intentional exceptions (#1380):
   * - Shard storage v1 keeps state inside shard content, so an
   *   article-state-only pass cannot carry a change. That mode keeps the full
   *   save rather than dropping the read mark (deprecated by ADR 0006).
   * - Legacy JSON serializes the whole live settings object, so its state can
   *   only be written by the full `data.json` save.
   * - The device-local journal covers only the v2 shared `user-state.json`
   *   snapshot; the deprecated modes get no journal entry.
   */
  private queuedArticleStateScope(): PersistSettingsOptions {
    return this.settings.storageMode === "vault-shards"
      ? {}
      : { scope: "article-state" };
  }

  /** A value that compares two snapshots by content, for the plugin data. */
  private describePluginData(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (isRecord(value)) return comparableSnapshotJson(value);
    return JSON.stringify(value);
  }

  private async readBootstrapSettings(isInitialLoad: boolean): Promise<{
    data: RssDashboardSettings | null;
    vaultMetadataUnreadable: boolean;
    keepCurrentSettings: boolean;
  }> {
    // Step 1: load bootstrap pointer from plugin-default location
    let data = (await this.options.loadData()) as RssDashboardSettings | null;
    // Record what the file held so an external callback can compare against
    // it, whether this load read a pointer or the full settings (#1400).
    this.pluginDataBaseline = this.describePluginData(data);
    let vaultMetadataUnreadable = false;
    let keepCurrentSettings = false;
    // Step 2: load full settings from the vault path named by the pointer
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
      } else {
        // Falling through would save defaults over the unreadable vault file,
        // so treat the pointer like a null load instead. A reload keeps the
        // settings already in memory rather than replacing them with
        // defaults that would then be saved over the synced copy.
        vaultMetadataUnreadable = true;
        keepCurrentSettings = !isInitialLoad;
        if (keepCurrentSettings) {
          // Remember where the new pointer pointed. The settings still in
          // memory name the old folder, so the watcher has to know both
          // until a later load succeeds.
          this.pendingMetadataFolder = getMetadataPath(data) ?? null;
        }
        data = keepCurrentSettings
          ? null
          : structuredClone({ ...DEFAULT_SETTINGS, ...data });
        if (!this.hasNotifiedVaultMetadataFailure) {
          new Notice(
            "Could not read plugin metadata from the configured vault folder. Settings were not loaded and nothing has been overwritten.",
          );
          this.hasNotifiedVaultMetadataFailure = true;
        }
      }
    }
    return { data, vaultMetadataUnreadable, keepCurrentSettings };
  }

  private shouldSaveAfterLoad({
    wasNullLoad,
    hydrated,
    didMigrateKeywordRules,
    didNormalizeAndDedupeItems,
    didClearMissingSavedArticlePaths,
    originalSettingsJson,
  }: {
    wasNullLoad: boolean;
    hydrated: Awaited<ReturnType<FeedStorageRepository["hydrateSettings"]>>;
    didMigrateKeywordRules: boolean;
    didNormalizeAndDedupeItems: boolean;
    didClearMissingSavedArticlePaths: boolean;
    originalSettingsJson: string;
  }): boolean {
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
        didClearMissingSavedArticlePaths ||
        serializeWithoutArticles(this.settings) !== originalSettingsJson);
    return shouldSave;
  }

  async loadSettings(): Promise<void> {
    const loadGeneration = ++this.settingsLoadGeneration;
    const isInitialLoad = !this.hasStartedSettingsLoad;
    this.hasStartedSettingsLoad = true;
    this.wasNullSettingsLoad = false;
    try {
      // A synced reload replaces the in-memory snapshot. Pending local changes
      // must already be in the journal before it is read, or this load would
      // drop them; replay then applies them over the reloaded snapshot
      // (#1387). Close the failed-load write gate before waiting, so a save
      // requested while an append settles cannot write over the load. An
      // append accepted by the previous state still lands: its gate check ran
      // when it was queued (#1380).
      this.settingsLoadFailed = true;
      await this.settleJournalAppends();
      storageLog("Loading plugin settings");
      const { data, vaultMetadataUnreadable, keepCurrentSettings } =
        await this.readBootstrapSettings(isInitialLoad);
      if (loadGeneration !== this.settingsLoadGeneration) return;
      if (keepCurrentSettings) {
        // A reload could not read the folder its new pointer names. Keep the
        // live settings and close the write gate so nothing overwrites them
        // with a fallback; a later successful load opens the gate again.
        this.settingsLoadFailed = true;
        return;
      }
      // Track whether we bootstrapped from null (possible pending sync)
      const wasNullLoad = data === null || vaultMetadataUnreadable;
      this.wasNullSettingsLoad = wasNullLoad;
      const mergedSettings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
      const originalSettingsJson = serializeWithoutArticles(mergedSettings);
      this.options.setSettings(loadAndNormalizeSettings(data));
      // A fresh install has no data.json yet. Record the installed release
      // in memory so the first real save stores it, and What's New does not
      // treat a brand-new user as upgrading on their next launch. A synced
      // data.json that arrives later replaces these settings entirely.
      if (data === null) {
        this.settings.lastShownVersion = this.options.manifest.version;
      }
      // A reload after startup (e.g. a synced data.json) replaces the settings
      // object, so services built from the previous one must follow it.
      if (this.options.hasFolderService()) {
        this.options.bindSettingsBackedServices();
      }
      // A fresh install keeps its feed shards and article state inside the
      // plugin folder, so uninstalling the plugin removes them too. Only a
      // null load is changed: existing installs keep the vault folder they
      // already use, and a synced data.json that arrives later replaces this.
      if (data === null) {
        const pluginDir = normalizePath(this.resolvePluginDir());
        this.settings.metadataStorageFolder = `${pluginDir}/data`;
        this.settings.storageFolder = `${pluginDir}/data/feeds`;
      }
      const didMigrateKeywordRules = this.options.migrateLegacySettings();
      await this.options.repairMissingFolderPathsForFeeds();
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
        { useFirstSeenDateFallback: this.settings.useFirstSeenDateFallback },
      );
      if (loadGeneration !== this.settingsLoadGeneration) return;
      const savedArticleAssociationUpdates =
        !vaultMetadataUnreadable && hydrated.userStateLoaded !== false
          ? this.options.clearMissingSavedArticlePaths()
          : [];
      if (!vaultMetadataUnreadable)
        this.hasNotifiedVaultMetadataFailure = false;
      this.settingsLoadFailed = vaultMetadataUnreadable;
      const shouldSave = this.shouldSaveAfterLoad({
        wasNullLoad,
        hydrated,
        didMigrateKeywordRules,
        didNormalizeAndDedupeItems,
        didClearMissingSavedArticlePaths:
          savedArticleAssociationUpdates.length > 0,
        originalSettingsJson,
      });
      if (shouldSave) {
        // On the first load, onload() has not initialized the services yet,
        // and this save's backup snapshot needs the backup service.
        if (!this.options.hasBackupService()) {
          this.options.initializeSettingsBackedServices();
        }
        await this.options.saveSettings();
      }
      if (savedArticleAssociationUpdates.length > 0) {
        await this.options.notifySavedArticleAssociationUpdates(
          savedArticleAssociationUpdates,
        );
      }
      this.options.getAutoRefreshScheduler()?.reschedule();
      // A successful load ends any recovery from an unreadable pointer.
      this.pendingMetadataFolder = null;
    } catch (error) {
      if (loadGeneration !== this.settingsLoadGeneration) return;
      storageError("Error loading plugin settings", error);
      new Notice(
        `Error loading settings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      this.options.setSettings(structuredClone(DEFAULT_SETTINGS));
      if (this.options.hasFolderService()) {
        this.options.bindSettingsBackedServices();
      }
      this.settingsLoadFailed = true;
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
    const folders = new Set([metadataFolder ?? ".rss-dashboard-data"]);
    if (this.pendingMetadataFolder) {
      // The new pointer's folder is still watched while the old settings
      // are in memory, so its files arriving later end the recovery.
      folders.add(this.pendingMetadataFolder);
    }

    const normalizedBase = filePath.replace(/^\/+|\/+$/g, "");

    return [...folders].some((folder) => {
      const normalizedFolder = folder.replace(/^\/+|\/+$/g, "");
      return (
        normalizedBase === `${normalizedFolder}/data.json` ||
        normalizedBase === `${normalizedFolder}/user-state.json`
      );
    });
  }

  /** Queues one debounced reload shared by the watcher and the callback. */
  private scheduleMetadataReload(): void {
    if (this.vaultMetadataReloadTimer !== null) {
      window.clearTimeout(this.vaultMetadataReloadTimer);
    }

    this.vaultMetadataReloadTimer = window.setTimeout(() => {
      this.vaultMetadataReloadTimer = null;
      void (async () => {
        await this.options.loadSettings();
        await this.options.refreshDashboardViews();
      })();
    }, 1500);
  }

  /**
   * Reacts to Obsidian's callback for the plugin's own `data.json` changing
   * outside the plugin, for example when Obsidian Sync delivers another
   * device's copy. Obsidian doesn't index the config folder, so no vault
   * event fires for it (probe #1403, row c1).
   *
   * The content comparison already filters out the plugin's own writes, so
   * this path does not honor `suppressWatcherUntil`: doing so would drop a
   * real synced pointer that arrives just after a save (#1400).
   */
  async handleExternalSettingsChange(): Promise<void> {
    let current: unknown;
    try {
      current = await this.options.loadData();
    } catch (error) {
      storageError(
        "Could not read plugin settings after an external change",
        error,
      );
      return;
    }
    if (this.describePluginData(current) === this.pluginDataBaseline) return;
    this.scheduleMetadataReload();
  }

  private isWatchedShardPath(filePath: string): boolean {
    const currentSettings = this.settings ?? DEFAULT_SETTINGS;
    if (currentSettings.storageMode !== "vault-shards-v2") {
      return false;
    }

    const storageFolder =
      currentSettings.storageFolder || DEFAULT_SETTINGS.storageFolder;
    const normalizedFolder = normalizeFolderPath(storageFolder);
    if (!normalizedFolder) return false;

    const normalizedFile = normalizePath(
      filePath.trim().replace(/\\/g, "/"),
    ).replace(/^\/+|\/+$/g, "");

    const folderPrefix = `${normalizedFolder.replace(/^\/+|\/+$/g, "")}/`;
    if (!normalizedFile.startsWith(folderPrefix)) {
      return false;
    }

    const remainder = normalizedFile.slice(folderPrefix.length);
    if (remainder.includes("/") || !remainder.endsWith(".json")) {
      return false;
    }

    return remainder.length > 5;
  }

  /**
   * Watches the vault for a change to the metadata folder's data files and
   * reloads the settings after a debounce. Only the plugin may register
   * events, so each `vault.on` reference goes straight to `registerEvent`.
   */
  registerVaultMetadataChangeListeners(
    registerEvent: (ref: EventRef) => void,
    onRename?: (
      file: { path: string },
      oldPath: string,
      isFolder: boolean,
    ) => void,
  ): void {
    const vault = this.app.vault as unknown as {
      on?: (event: string, callback: (...args: unknown[]) => void) => EventRef;
    };
    if (typeof vault.on !== "function") return;

    const scheduleReload = async (
      file?: unknown,
      oldPath?: unknown,
    ): Promise<void> => {
      const filePath = this.getVaultFilePath(file);

      // Shard events do not honor suppressWatcherUntil; content comparison
      // replaces it for shards (#1412).
      if (filePath && this.isWatchedShardPath(filePath)) {
        let content: string | null = null;
        try {
          content = await this.app.vault.adapter.read(filePath);
        } catch {
          content = null;
        }

        // Identical: ignore. Different, unreadable, or no baseline: reload.
        if (
          content !== null &&
          this.feedStorageRepository.isLastSeenShardContent(filePath, content)
        ) {
          return;
        }

        this.scheduleMetadataReload();
        return;
      }

      if (Date.now() < this.suppressWatcherUntil) return;

      const candidatePaths: string[] = [];
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

      this.scheduleMetadataReload();
    };

    registerEvent(vault.on("modify", (file) => void scheduleReload(file)));
    registerEvent(vault.on("create", (file) => void scheduleReload(file)));
    registerEvent(
      vault.on("rename", (file, oldPath) => {
        void scheduleReload(file, oldPath);
        const path = this.getVaultFilePath(file);
        if (!path || typeof oldPath !== "string") return;
        onRename?.({ path }, oldPath, file instanceof TFolder);
      }),
    );
  }

  /**
   * Creates a save callback that persists metadata to the appropriate location
   * based on the current metadataStorageMode.
   */
  private async savePluginData(data: unknown): Promise<void> {
    if (this.settingsLoadFailed) return;
    // Record what this save writes before it lands, so the external callback
    // treats the file it produces as our own write, not a synced change.
    const previousBaseline = this.pluginDataBaseline;
    const writtenBaseline = this.describePluginData(data);
    this.pluginDataBaseline = writtenBaseline;
    try {
      await this.options.saveData(data);
    } catch (error) {
      // Only restore if no later save replaced the baseline meanwhile.
      if (this.pluginDataBaseline === writtenBaseline) {
        this.pluginDataBaseline = previousBaseline;
      }
      throw error;
    }
  }
  getMetadataSaveCallback(): (data: unknown) => Promise<void> {
    return async (data: unknown): Promise<void> => {
      if (this.isPersistenceSuppressed()) return;
      const settingsData = data as RssDashboardSettings;
      const metadataPath = getMetadataPath(this.settings);
      if (metadataPath) {
        try {
          await ensureMetadataFolderExists(this.app, this.settings);
          const dataFilePath = `${metadataPath}/data.json`;
          const jsonContent = JSON.stringify(settingsData, null, 2);
          await this.writeWithWatcherSuppressed(
            async () =>
              await this.app.vault.adapter.write(dataFilePath, jsonContent),
          );
          storageLog("Metadata saved to vault location", {
            path: dataFilePath,
          });
          // Bootstrap pointer only — just enough for loadSettings to
          // find the vault data.json on restart. Does NOT write full
          // settings to .obsidian, preventing the stale-read bug on mobile.
          await this.savePluginData({
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
        await this.savePluginData(settingsData);
        storageLog("Metadata saved to plugin default location");
      }
    };
  }

  async saveSettings(options: PersistSettingsOptions = {}): Promise<void> {
    if (this.isPersistenceSuppressed()) return;
    // Any queued change must be on disk before this write folds the journal
    // into the snapshot and advances its checkpoint (#1387).
    await this.settleJournalAppends();
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
        options,
      );
      storageLog("saveSettings completed", result);
      try {
        await this.autoBackupCoordinator.recordPersistedChange();
      } catch (error) {
        console.error("[RSS Dashboard] Backup after save failed:", error);
      }
      this.options.getAutoRefreshScheduler()?.reschedule();
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
   * Appends the change to the device-local journal, serially and behind the
   * same gate as every other write. The gate is read synchronously here, when
   * the change is queued, so a load that closes it while an earlier append is
   * still settling does not discard the change that was already accepted
   * (#1380). Errors are logged rather than rejecting: the coalesced snapshot
   * write that follows still carries the change while this session lasts, and
   * callers ignore this promise.
   */
  private appendJournalChanges(
    changes: readonly UserStateJournalChange[],
  ): Promise<void> {
    if (changes.length === 0) return this.journalAppendChain;
    if (this.isPersistenceSuppressed()) return this.journalAppendChain;
    return this.appendAcceptedJournalChanges(changes);
  }

  /**
   * Queues a change that was accepted while the write gate was open. Callers
   * have already checked the gate; the append must still land if the gate
   * closes before it runs (#1380).
   */
  private appendAcceptedJournalChanges(
    changes: readonly UserStateJournalChange[],
  ): Promise<void> {
    if (changes.length === 0) return this.journalAppendChain;
    const run = this.journalAppendChain.then(async () => {
      try {
        await this.feedStorageRepository.recordArticleStateChanges(changes);
        this.warnedJournalAppendFailure = false;
      } catch (error) {
        storageError("Failed to append to the user-state journal", error);
        // A silent failure would leave the user believing a change is durable.
        // Notify once per run of failures rather than on every event (#1380).
        if (!this.warnedJournalAppendFailure) {
          this.warnedJournalAppendFailure = true;
          new Notice(
            `RSS Dashboard: Failed to record an article state change: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      }
    });
    this.journalAppendChain = run;
    return run;
  }

  /**
   * Remembers the latest playback position for one article. Player events
   * arrive far too often to journal each one, so articles are coalesced and
   * appended after a short window; a flush, a load, or a save settles them
   * immediately (#1380).
   */
  public recordPlaybackProgressChange(change: UserStateJournalChange): void {
    if (this.isPersistenceSuppressed()) return;
    this.pendingPlaybackChanges.set(`${change.feedId}:${change.guid}`, change);
    if (this.playbackJournalTimer !== null) return;
    this.playbackJournalTimer = window.setTimeout(() => {
      this.playbackJournalTimer = null;
      void this.flushPlaybackChanges();
    }, PLAYBACK_JOURNAL_WINDOW_MS);
  }

  private flushPlaybackChanges(): Promise<void> {
    this.clearPlaybackJournalTimer();
    if (this.pendingPlaybackChanges.size === 0) return this.journalAppendChain;
    const changes = [...this.pendingPlaybackChanges.values()];
    this.pendingPlaybackChanges.clear();
    return this.appendAcceptedJournalChanges(changes);
  }

  /** Resolves once every journal append requested so far has finished. */
  private async settleJournalAppends(): Promise<void> {
    await this.flushPlaybackChanges();
    await this.journalAppendChain;
  }

  /**
   * Records that article state changed (read, starred, tags, saved, or
   * playback progress). The changed identity and fields are appended to the
   * device-local journal immediately so they survive an abrupt close, then the
   * snapshot write runs after the interaction: changes inside one window share
   * one checkpoint, and passing the size threshold flushes without waiting for
   * the window (#1387). Callers never await this.
   *
   * @returns the journal append, which resolves even on failure; production
   * callers ignore it, tests may await it to observe durability.
   */
  queueArticleStateSave(
    changes: readonly UserStateJournalChange[] = [],
  ): Promise<void> {
    if (this.isPersistenceSuppressed()) return Promise.resolve();
    const appended = this.appendJournalChanges(changes);
    this.queuedArticleStateChanges += 1;
    if (this.queuedArticleStateChanges >= ARTICLE_STATE_FLUSH_THRESHOLD) {
      void this.flushPendingWrites();
      return appended;
    }
    if (this.articleStateFlushTimer !== null) return appended;
    this.articleStateFlushTimer = window.setTimeout(() => {
      this.articleStateFlushTimer = null;
      void this.flushPendingWrites();
    }, ARTICLE_STATE_FLUSH_WINDOW_MS);
    return appended;
  }

  /**
   * Writes every queued article-state change now and resolves only once the
   * write has landed. Unload, export, migration, and repair use it for a
   * consistent snapshot. A failed write shows one Notice and never rejects:
   * the next load reconciles from the last persisted snapshot.
   */
  async flushPendingWrites(): Promise<void> {
    this.clearArticleStateFlushTimer();
    await this.settleJournalAppends();
    if (this.articleStateFlush) await this.articleStateFlush;
    if (this.queuedArticleStateChanges === 0) return;
    this.queuedArticleStateChanges = 0;
    if (this.isPersistenceSuppressed()) return;
    const flush = this.persistQueuedArticleState();
    this.articleStateFlush = flush;
    try {
      await flush;
    } finally {
      if (this.articleStateFlush === flush) this.articleStateFlush = null;
    }
  }

  /**
   * Appends article-state changes to the device-local journal and resolves when
   * they are durable. Callers that are followed by a full save use this so the
   * save can fold the records it just queued (#1387).
   */
  recordArticleStateChanges(
    changes: readonly UserStateJournalChange[],
  ): Promise<void> {
    return this.appendJournalChanges(changes);
  }

  /**
   * The persistence options that carry article state for the current storage
   * mode. The coalesced queue uses them; a caller that must observe failure
   * (the Reader's rollback) passes them to `saveSettings` directly.
   */
  articleStatePersistOptions(): PersistSettingsOptions {
    return this.queuedArticleStateScope();
  }

  private async persistQueuedArticleState(): Promise<void> {
    try {
      await this.saveSettings(this.articleStatePersistOptions());
    } catch (error) {
      storageError("Queued article-state save failed", error, {
        mode: this.settings.storageMode,
      });
      new Notice(
        `RSS Dashboard: Failed to save article state changes: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
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
    if (this.settingsLoadFailed) return;
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
      await this.options.saveSettings();

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
    if (this.settingsLoadFailed) return;
    if (this.settings.metadataStorageMode === "plugin-default") {
      new Notice("Already using plugin default for metadata storage");
      return;
    }
    try {
      // Current settings are already in memory, just switch the mode
      this.settings.metadataStorageMode = "plugin-default";
      // Save using Plugin.saveData() (plugin-default location)
      await this.savePluginData(this.settings);
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

      await this.options.saveSettings();
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
}
