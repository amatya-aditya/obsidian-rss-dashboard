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
import {
  ensureMetadataFolderExists,
  getMetadataPath,
  loadMetadata,
} from "./metadata-location";

function storageLog(_message: string, _details?: unknown): void {}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

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
  private vaultMetadataReloadTimer: number | null = null;
  private suppressWatcherUntil = 0;

  constructor(
    private readonly app: App,
    private readonly options: SettingsStoreOptions,
  ) {}

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
  }

  private async readBootstrapSettings(): Promise<{
    data: RssDashboardSettings | null;
    vaultMetadataUnreadable: boolean;
  }> {
    // Step 1: load bootstrap pointer from plugin-default location
    let data = (await this.options.loadData()) as RssDashboardSettings | null;
    let vaultMetadataUnreadable = false;
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
        // so treat the pointer like a null load instead.
        vaultMetadataUnreadable = true;
        data = structuredClone({ ...DEFAULT_SETTINGS, ...data });
        if (!this.hasNotifiedVaultMetadataFailure) {
          new Notice(
            "Could not read plugin metadata from the configured vault folder. Settings were not loaded and nothing has been overwritten.",
          );
          this.hasNotifiedVaultMetadataFailure = true;
        }
      }
    }
    return { data, vaultMetadataUnreadable };
  }

  private shouldSaveAfterLoad({
    wasNullLoad,
    hydrated,
    didMigrateKeywordRules,
    didNormalizeAndDedupeItems,
    originalSettingsJson,
  }: {
    wasNullLoad: boolean;
    hydrated: Awaited<ReturnType<FeedStorageRepository["hydrateSettings"]>>;
    didMigrateKeywordRules: boolean;
    didNormalizeAndDedupeItems: boolean;
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
        JSON.stringify(this.settings) !== originalSettingsJson);
    return shouldSave;
  }

  async loadSettings(): Promise<void> {
    const loadGeneration = ++this.settingsLoadGeneration;
    this.wasNullSettingsLoad = false;
    this.settingsLoadFailed = true;
    try {
      storageLog("Loading plugin settings");
      const { data, vaultMetadataUnreadable } =
        await this.readBootstrapSettings();
      if (loadGeneration !== this.settingsLoadGeneration) return;
      // Track whether we bootstrapped from null (possible pending sync)
      const wasNullLoad = data === null || vaultMetadataUnreadable;
      this.wasNullSettingsLoad = wasNullLoad;
      const mergedSettings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
      const originalSettingsJson = JSON.stringify(mergedSettings);
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
        const pluginDir = normalizePath(
          this.options.manifest.dir ??
            `${this.app.vault.configDir}/plugins/${this.options.manifest.id}`,
        );
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
      if (!vaultMetadataUnreadable) this.hasNotifiedVaultMetadataFailure = false;
      this.settingsLoadFailed = vaultMetadataUnreadable;
      const shouldSave = this.shouldSaveAfterLoad({
        wasNullLoad,
        hydrated,
        didMigrateKeywordRules,
        didNormalizeAndDedupeItems,
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
      this.options.getAutoRefreshScheduler()?.reschedule();
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
    const folderToCheck = metadataFolder ?? ".rss-dashboard-data";

    const normalizedBase = filePath.replace(/^\/+|\/+$/g, "");
    const normalizedFolder = folderToCheck.replace(/^\/+|\/+$/g, "");

    return (
      normalizedBase === `${normalizedFolder}/data.json` ||
      normalizedBase === `${normalizedFolder}/user-state.json`
    );
  }

  /**
   * Watches the vault for a change to the metadata folder's data files and
   * reloads the settings after a debounce. Only the plugin may register
   * events, so each `vault.on` reference goes straight to `registerEvent`.
   */
  registerVaultMetadataChangeListeners(
    registerEvent: (ref: EventRef) => void,
  ): void {
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
        window.clearTimeout(this.vaultMetadataReloadTimer);
      }

      this.vaultMetadataReloadTimer = window.setTimeout(() => {
        this.vaultMetadataReloadTimer = null;
        void (async () => {
          await this.options.loadSettings();
          await this.options.refreshDashboardViews();
        })();
      }, 1500);
    };

    registerEvent(vault.on("modify", (file) => scheduleReload(file)));
    registerEvent(vault.on("create", (file) => scheduleReload(file)));
    registerEvent(
      vault.on("rename", (file, oldPath) => scheduleReload(file, oldPath)),
    );
  }

  /**
   * Creates a save callback that persists metadata to the appropriate location
   * based on the current metadataStorageMode.
   */
  private async savePluginData(data: unknown): Promise<void> {
    if (!this.settingsLoadFailed) await this.options.saveData(data);
  }
  getMetadataSaveCallback(): (data: unknown) => Promise<void> {
    return async (data: unknown): Promise<void> => {
      if (this.settingsLoadFailed) return;
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
    if (this.settingsLoadFailed) return;
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
