import { App, Plugin, Notice, TFolder, EventRef } from "obsidian";
import { RssDashboardSettings, DEFAULT_SETTINGS } from "../types/types";
import {
  loadAndNormalizeSettings,
  migrateSettings,
  dedupeAndNormalizeFeedItems,
} from "../utils/settings-loader";
import { FeedStorageRepository } from "./feed-storage-repository";
import { getVaultFilePath } from "../utils/plugin-utils";

function storageLog(_message: string, _details?: unknown): void {}
function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}



export interface IPluginForSettings {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
  registerEvent(eventRef: EventRef): void;
  feedStorageRepository?: FeedStorageRepository;
  repairMissingFolderPathsForFeeds?(): Promise<void>;
  refreshDashboardViews?(): Promise<void>;
}

export class SettingsManager {
  public settings: RssDashboardSettings = DEFAULT_SETTINGS;
  private vaultMetadataReloadTimer: number | null = null;
  private suppressWatcherUntil = 0;

  constructor(
    private app: App,
    private plugin: IPluginForSettings,
  ) {}

  public getMetadataPath(
    settings: RssDashboardSettings = this.settings,
  ): string | undefined {
    if (settings.metadataStorageMode === "plugin-default") {
      return undefined;
    }

    let folder = settings.metadataStorageFolder.trim();
    if (!folder) {
      folder = ".rss-dashboard-data";
    }
    folder = folder.replace(/^\/+|\/+$/g, "");
    return folder;
  }

  private async loadMetadata(
    mode: "plugin-default" | "vault-location",
    folder: string,
  ): Promise<RssDashboardSettings | null> {
    if (mode === "plugin-default") {
      return null;
    }

    const metadataPath = this.getMetadataPath({
      ...DEFAULT_SETTINGS,
      metadataStorageMode: mode,
      metadataStorageFolder: folder,
    });
    if (!metadataPath) {
      return null;
    }

    try {
      const dataFilePath = `${metadataPath}/data.json`;
      const content = await this.app.vault.adapter.read(dataFilePath);
      return JSON.parse(content) as RssDashboardSettings;
    } catch (error) {
      storageLog(
        "Failed to load metadata from vault location, will fall back to plugin default",
        error,
      );
      return null;
    }
  }

  private async ensureMetadataFolderExists(
    settings: RssDashboardSettings = this.settings,
  ): Promise<void> {
    const folderPath = this.getMetadataPath(settings);
    if (!folderPath) return;

    const normalized = folderPath.replace(/^\/+|\/+$/g, "");

    try {
      const existing = this.app.vault.getAbstractFileByPath(normalized);
      if (existing) {
        if (existing instanceof TFolder) {
          return;
        } else {
          throw new Error(
            `Metadata storage path points to a file, not a folder: ${normalized}`,
          );
        }
      }

      const existsOnDisk = await this.app.vault.adapter.exists(normalized);
      if (existsOnDisk) return;

      await this.app.vault.createFolder(normalized);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("already exists")
      ) {
        return;
      }
      throw error;
    }
  }

  public async loadSettings(): Promise<void> {
    try {
      storageLog("Loading plugin settings");

      let data = (await this.plugin.loadData()) as RssDashboardSettings | null;

      if (data?.metadataStorageMode === "vault-location") {
        const vaultData = await this.loadMetadata(
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

      const wasNullLoad = data === null;
      const mergedSettings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
      const originalSettingsJson = JSON.stringify(mergedSettings);

      this.settings = loadAndNormalizeSettings(data);
      const didMigrateKeywordRules = this.migrateLegacySettings();
      
      if (this.plugin.repairMissingFolderPathsForFeeds) {
        await this.plugin.repairMissingFolderPathsForFeeds();
      }

      let hydrated: { didChange: boolean; userStateLoaded?: boolean; shardCount: number } = { didChange: false, userStateLoaded: true, shardCount: 0 };
      if (this.plugin.feedStorageRepository) {
        hydrated = await this.plugin.feedStorageRepository.hydrateSettings(
          this.settings,
        );
      }

      const didNormalizeAndDedupeItems = dedupeAndNormalizeFeedItems(
        this.settings.feeds,
      );

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

  public getMetadataSaveCallback(): (data: unknown) => Promise<void> {
    return async (data: unknown): Promise<void> => {
      const settingsData = data as RssDashboardSettings;
      const metadataPath = this.getMetadataPath(this.settings);
      if (metadataPath) {
        try {
          await this.ensureMetadataFolderExists(this.settings);
          const dataFilePath = `${metadataPath}/data.json`;
          const jsonContent = JSON.stringify(settingsData, null, 2);
          await this.app.vault.adapter.write(dataFilePath, jsonContent);
          storageLog("Metadata saved to vault location", {
            path: dataFilePath,
          });
          
          await this.plugin.saveData({
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
        await this.plugin.saveData(settingsData);
        storageLog("Metadata saved to plugin default location");
      }
    };
  }

  public async saveSettings(): Promise<void> {
    storageLog("saveSettings invoked", {
      mode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      metadataMode: this.settings.metadataStorageMode,
      feedCount: this.settings.feeds.length,
    });

    try {
      if (this.plugin.feedStorageRepository) {
        const result = await this.plugin.feedStorageRepository.persistSettings(
          this.settings,
          this.getMetadataSaveCallback(),
        );
        storageLog("saveSettings completed", result);
      } else {
        // Fallback if no repository exists (e.g. tests)
        await this.getMetadataSaveCallback()(this.settings);
      }
    } catch (error) {
      storageError("saveSettings failed", error, {
        mode: this.settings.storageMode,
        folder: this.settings.storageFolder,
        metadataMode: this.settings.metadataStorageMode,
      });
      throw error;
    }
  }

  public migrateLegacySettings(): boolean {
    return migrateSettings(this.settings);
  }

  public async migrateMetadataToVaultLocation(): Promise<void> {
    if (this.settings.metadataStorageMode === "vault-location") {
      new Notice("Already storing metadata in vault location.");
      return;
    }

    try {
      this.suppressWatcher();

      const targetSettingsForPath = {
        ...this.settings,
        metadataStorageMode: "vault-location" as const,
      };
      const metadataPath = this.getMetadataPath(targetSettingsForPath);
      if (metadataPath) {
        await this.ensureMetadataFolderExists(targetSettingsForPath);
      }

      this.settings.metadataStorageMode = "vault-location";
      await this.saveSettings();
      new Notice("Metadata storage migrated to vault location.");
    } catch (e) {
      this.settings.metadataStorageMode = "plugin-default";
      new Notice("Migration failed. Check the console for details.");
      throw e;
    }
  }

  public async revertMetadataToPluginDefault(): Promise<void> {
    if (this.settings.metadataStorageMode === "plugin-default") {
      new Notice("Already storing metadata in plugin default location.");
      return;
    }

    try {
      this.suppressWatcher();
      this.settings.metadataStorageMode = "plugin-default";
      await this.saveSettings();
      new Notice("Metadata storage reverted to plugin default location.");
    } catch (e) {
      new Notice("Revert failed. Check the console for details.");
      throw e;
    }
  }

  private suppressWatcher(): void {
    this.suppressWatcherUntil = Date.now() + 5000;
  }



  private isWatchedMetadataPath(filePath: string): boolean {
    const metadataFolder = this.getMetadataPath(this.settings ?? DEFAULT_SETTINGS);
    const folderToCheck = metadataFolder ?? ".rss-dashboard-data";

    const normalizedBase = filePath.replace(/^\/+|\/+$/g, "");
    const normalizedFolder = folderToCheck.replace(/^\/+|\/+$/g, "");

    return (
      normalizedBase === `${normalizedFolder}/data.json` ||
      normalizedBase === `${normalizedFolder}/user-state.json`
    );
  }

  public cancelPendingReload(): void {
    if (this.vaultMetadataReloadTimer !== null) {
      (
        globalThis as unknown as { clearTimeout: (id: number | null) => void }
      ).clearTimeout(this.vaultMetadataReloadTimer);
      this.vaultMetadataReloadTimer = null;
    }
  }

  public registerVaultMetadataChangeListeners(): void {
    const vault = this.app.vault as unknown as {
      on?: (event: string, callback: (...args: unknown[]) => void) => EventRef;
    };
    if (typeof vault.on !== "function") return;

    const scheduleReload = (file?: unknown, oldPath?: unknown): void => {
      if (Date.now() < this.suppressWatcherUntil) return;

      const candidatePaths: string[] = [];
      const filePath = getVaultFilePath(file);
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
          if (this.plugin.refreshDashboardViews) {
            await this.plugin.refreshDashboardViews();
          }
        })();
      }, 1500);
    };

    this.plugin.registerEvent(vault.on("modify", (file) => scheduleReload(file)));
    this.plugin.registerEvent(vault.on("create", (file) => scheduleReload(file)));
    this.plugin.registerEvent(
      vault.on("rename", (file, oldPath) => scheduleReload(file, oldPath)),
    );
  }
}
