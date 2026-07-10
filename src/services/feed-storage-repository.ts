import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type {
  Feed,
  FeedItemsShard,
  PortableDataBundle,
  PersistedFeedConfig,
  PersistedRssDashboardSettings,
  RssDashboardSettings,
  ArticleUserState,
  UserStateFile,
} from "../types/types";

const SHARD_VERSION = 1;

export interface FeedStorageStatus {
  mode: RssDashboardSettings["storageMode"];
  folder: string;
  shardCount: number;
  feedCount: number;
  migrationReady: boolean;
  lastRepairResult: string;
}

export interface FeedLocalStorageAddress {
  mode: RssDashboardSettings["storageMode"];
  address: string;
}

export interface PersistSettingsOptions {
  forceMetadata?: boolean;
  forceAllShards?: boolean;
}

export interface RevertToLegacyJsonOptions {
  deleteShardFolder?: boolean;
}

export class ShardFolderDeletionError extends Error {
  public readonly folderPath: string;

  constructor(folderPath: string, message?: string) {
    super(message ?? `Failed to delete shard folder: ${folderPath}`);
    this.name = "ShardFolderDeletionError";
    this.folderPath = folderPath;
  }
}

interface MigrationSnapshot {
  storageMode: RssDashboardSettings["storageMode"];
  storageFolder: string;
  lastRepairResult: string;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

let syncNonceCounter = 0;

function withSyncNonce<T extends object>(
  data: T,
): T & { _syncNonce: string; _syncPad: string } {
  syncNonceCounter++;
  const paddingSize = 1024 + (syncNonceCounter % 1024);
  return {
    ...data,
    _syncNonce: `${Date.now()}-${syncNonceCounter}`,
    _syncPad: "sync-size-anchor "
      .repeat(Math.ceil(paddingSize / 18))
      .slice(0, paddingSize),
  };
}

function createFeedId(): string {
  const randomUuid = window.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid;
  }

  return `feed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeFolderPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return ".rss-dashboard-data/feeds";
  }

  return normalizePath(trimmed.replace(/^\/+|\/+$/g, ""));
}

function getFeedShardPath(storageFolder: string, feedId: string): string {
  return normalizePath(`${normalizeFolderPath(storageFolder)}/${feedId}.json`);
}

function createFeedShard(feed: Feed, stripState = false): FeedItemsShard {
  return {
    version: SHARD_VERSION,
    feedId: feed.feedId ?? "",
    feedUrl: feed.url,
    updatedAt: Date.now(),
    items: cloneJson(feed.items ?? []).map(item => {
      if (stripState) {
        delete item.read;
        delete item.starred;
        delete item.tags;
        delete item.saved;
        delete item.savedFilePath;
        delete item.playbackProgress;
      }
      return item;
    }),
  };
}

function createComparableFeedShardJson(feed: Feed, stripState = false): string {
  const { updatedAt: _updatedAt, ...shardWithoutTimestamp } =
    createFeedShard(feed, stripState);
  void _updatedAt;
  return JSON.stringify(shardWithoutTimestamp, null, 2);
}

function storageLog(_message: string, _details?: unknown): void {}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

function parsePortableDataBundle(input: unknown): PortableDataBundle {
  if (!input || typeof input !== "object") {
    throw new Error("Portable bundle must be a JSON object");
  }

  const bundle = input as Partial<PortableDataBundle>;
  if (bundle.version !== SHARD_VERSION) {
    throw new Error(
      `Unsupported portable bundle version: ${String(bundle.version)} (expected ${SHARD_VERSION})`,
    );
  }

  if (typeof bundle.exportedAt !== "number") {
    throw new Error("Portable bundle is missing a valid exportedAt timestamp");
  }

  if (
    bundle.storageMode !== "legacy-json" &&
    bundle.storageMode !== "vault-shards"
  ) {
    throw new Error("Portable bundle has an invalid storageMode value");
  }

  if (!bundle.metadata || typeof bundle.metadata !== "object") {
    throw new Error("Portable bundle is missing metadata");
  }

  if (!Array.isArray(bundle.shards)) {
    throw new Error("Portable bundle is missing shards");
  }

  for (const shard of bundle.shards) {
    if (!shard || typeof shard !== "object") {
      throw new Error("Portable bundle has an invalid shard entry");
    }

    const shardLike = shard as Partial<FeedItemsShard>;
    if (typeof shardLike.feedId !== "string" || !shardLike.feedId.trim()) {
      throw new Error("Portable bundle shard is missing feedId");
    }

    if (!Array.isArray(shardLike.items)) {
      throw new Error(
        `Portable bundle shard ${shardLike.feedId} is missing items`,
      );
    }
  }

  return bundle as PortableDataBundle;
}

export class FeedStorageRepository {
  private lastPersistedMetadataJson: string | null = null;
  private lastPersistedShardJsonByFeedId = new Map<string, string>();
  private lastStorageFolderPath: string | null = null;
  private lastRepairResult = "Not yet run";
  private writeWrapper?: <T>(fn: () => Promise<T>) => Promise<T>;
  private app: App;

  constructor(app: App, options?: { writeWrapper?: <T>(fn: () => Promise<T>) => Promise<T> }) {
    this.app = app;
    this.writeWrapper = options?.writeWrapper;
  }

  public ensureFeedIds(settings: RssDashboardSettings): boolean {
    let didChange = false;
    let assignedCount = 0;
    for (const feed of settings.feeds) {
      if (!feed.feedId) {
        feed.feedId = createFeedId();
        didChange = true;
        assignedCount += 1;
      }

      feed.items = Array.isArray(feed.items) ? feed.items : [];
    }

    if (didChange) {
      storageLog("Assigned missing feed IDs", { assignedCount });
    }

    return didChange;
  }

  public getFeedLocalStorageAddress(
    settings: RssDashboardSettings,
    feed: Feed,
  ): FeedLocalStorageAddress {
    const isShardBackedMode =
      settings.storageMode === "vault-shards" ||
      settings.storageMode === "vault-shards-v2";

    if (!isShardBackedMode) {
      return {
        mode: "legacy-json",
        address: "data.json",
      };
    }

    const feedId = (feed.feedId ?? "").trim();
    return {
      mode: settings.storageMode,
      address: feedId ? getFeedShardPath(settings.storageFolder, feedId) : "",
    };
  }

  public async hydrateSettings(
    settings: RssDashboardSettings,
  ): Promise<{ didChange: boolean; shardCount: number; userStateLoaded?: boolean }> {
    storageLog("Hydrating settings", {
      mode: settings.storageMode,
      folder: normalizeFolderPath(settings.storageFolder),
      feedCount: settings.feeds.length,
    });
    const didAssignFeedIds = this.ensureFeedIds(settings);
    let shardCount = 0;

    if (settings.storageMode !== "vault-shards" && settings.storageMode !== "vault-shards-v2") {
      storageLog("Skipping shard hydration because legacy JSON mode is active");
      this.capturePersistedState(settings);
      return { didChange: didAssignFeedIds, shardCount };
    }

    const feedsById = new Map<string, Feed>();
    for (const feed of settings.feeds) {
      if (feed.feedId) {
        feedsById.set(feed.feedId, feed);
      }
    }

    for (const feed of settings.feeds) {
      const shardPath = getFeedShardPath(
        settings.storageFolder,
        feed.feedId ?? "",
      );
      const shardExists = await this.app.vault.adapter.exists(shardPath);
      if (!shardExists) {
        storageLog("Shard file not found during hydration", {
          feedId: feed.feedId,
          title: feed.title,
          shardPath,
        });
        continue;
      }

      try {
        const raw = await this.app.vault.adapter.read(shardPath);
        const parsed = JSON.parse(raw) as Partial<FeedItemsShard>;
        if (!parsed || !Array.isArray(parsed.items)) {
          throw new Error("Invalid shard data");
        }

        feed.items = parsed.items;
        shardCount += 1;
        storageLog("Hydrated feed from shard", {
          feedId: feed.feedId,
          title: feed.title,
          shardPath,
          itemCount: feed.items.length,
        });
      } catch (error) {
        storageError("Failed to hydrate feed shard", error, {
          feedId: feed.feedId,
          title: feed.title,
          shardPath,
        });
        feed.items = Array.isArray(feed.items) ? feed.items : [];
        new Notice(
          `RSS Dashboard: Failed to read shard for "${feed.title}". ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }

    storageLog("Completed shard hydration", {
      didAssignFeedIds,
      shardCount,
    });
    
    let userStateLoaded = false;
    if (settings.storageMode === "vault-shards-v2") {
      const userState = await this.loadUserState(settings);
      if (userState) {
        userStateLoaded = true;
        for (const feed of settings.feeds) {
          for (const item of feed.items) {
            const state = userState.states[item.guid];
            if (state) {
              item.read = state.read ?? false;
              item.starred = state.starred ?? false;
              item.tags = state.tags ? cloneJson(state.tags) : [];
              item.saved = state.saved ?? false;
              if (state.savedFilePath) item.savedFilePath = state.savedFilePath;
              if (state.playbackProgress) item.playbackProgress = cloneJson(state.playbackProgress);
            } else {
              item.read = false;
              item.starred = false;
              item.tags = [];
              item.saved = false;
              delete item.savedFilePath;
              delete item.playbackProgress;
            }
          }
        }
      } else {
        // Fallback to default if missing
        for (const feed of settings.feeds) {
          for (const item of feed.items) {
            item.read = false;
            item.starred = false;
            item.tags = [];
            item.saved = false;
            delete item.savedFilePath;
            delete item.playbackProgress;
          }
        }
      }
    }

    this.capturePersistedState(settings);
    return { didChange: didAssignFeedIds, shardCount, userStateLoaded };
  }

  public async persistSettings(
    settings: RssDashboardSettings,
    saveData: (data: unknown) => Promise<void>,
    options: PersistSettingsOptions = {},
  ): Promise<{
    metadataSaved: boolean;
    shardWriteCount: number;
    shardDeleteCount: number;
  }> {
    this.ensureFeedIds(settings);
    storageLog("Persisting settings", {
      mode: settings.storageMode,
      folder: normalizeFolderPath(settings.storageFolder),
      feedCount: settings.feeds.length,
      forceMetadata: Boolean(options.forceMetadata),
      forceAllShards: Boolean(options.forceAllShards),
    });

    if (settings.storageMode !== "vault-shards" && settings.storageMode !== "vault-shards-v2") {
      await saveData(withSyncNonce(cloneJson(settings)));
      storageLog("Saved full settings to legacy data.json");
      this.capturePersistedState(settings);
      return {
        metadataSaved: true,
        shardWriteCount: 0,
        shardDeleteCount: 0,
      };
    }

    const normalizedStorageFolder = normalizeFolderPath(settings.storageFolder);
    const storageFolderChanged =
      this.lastStorageFolderPath !== null &&
      this.lastStorageFolderPath !== normalizedStorageFolder;
    const forceAllShards = Boolean(
      options.forceAllShards || storageFolderChanged,
    );

    if (storageFolderChanged) {
      storageLog("Storage folder changed; forcing shard rewrite", {
        previousFolder: this.lastStorageFolderPath,
        nextFolder: normalizedStorageFolder,
      });
    }

    await this.ensureStorageFolderExists(normalizedStorageFolder);

    let shardWriteCount = 0;
    let shardDeleteCount = 0;

    const currentFeedIds = new Set<string>();
    for (const feed of settings.feeds) {
      if (!feed.feedId) {
        continue;
      }

      currentFeedIds.add(feed.feedId);
      const isV2 = settings.storageMode === "vault-shards-v2";
      const shard = createFeedShard(feed, isV2);
      const shardJson = JSON.stringify(shard, null, 2);
      const currentComparableJson = createComparableFeedShardJson(feed, isV2);
      const previousJson = this.lastPersistedShardJsonByFeedId.get(feed.feedId);

      if (forceAllShards || previousJson !== currentComparableJson) {
        const shardPath = getFeedShardPath(
          normalizedStorageFolder,
          feed.feedId,
        );
        await this.app.vault.adapter.write(shardPath, shardJson);
        this.lastPersistedShardJsonByFeedId.set(
          feed.feedId,
          currentComparableJson,
        );
        shardWriteCount += 1;
        storageLog("Wrote feed shard", {
          feedId: feed.feedId,
          title: feed.title,
          shardPath,
          itemCount: feed.items.length,
        });
      }

      if (storageFolderChanged && this.lastStorageFolderPath) {
        const previousShardPath = getFeedShardPath(
          this.lastStorageFolderPath,
          feed.feedId,
        );
        const previousShard =
          this.app.vault.getAbstractFileByPath(previousShardPath);
        if (previousShard) {
          await this.app.fileManager.trashFile(previousShard);
          storageLog("Deleted shard from previous storage folder", {
            feedId: feed.feedId,
            previousShardPath,
          });
        }
      }
    }

    for (const previousFeedId of [
      ...this.lastPersistedShardJsonByFeedId.keys(),
    ]) {
      if (currentFeedIds.has(previousFeedId)) {
        continue;
      }

      const shardPath = getFeedShardPath(
        normalizedStorageFolder,
        previousFeedId,
      );
      const existing = this.app.vault.getAbstractFileByPath(shardPath);
      if (existing) {
        await this.app.fileManager.trashFile(existing);
        storageLog("Deleted shard for removed feed", {
          feedId: previousFeedId,
          shardPath,
        });
      }
      this.lastPersistedShardJsonByFeedId.delete(previousFeedId);
      shardDeleteCount += 1;
    }

    const persistedSettings = this.createPersistedSettings(settings);
    const metadataJson = JSON.stringify(persistedSettings, null, 2);
    const shouldSaveMetadata =
      options.forceMetadata || this.lastPersistedMetadataJson !== metadataJson;

    if (shouldSaveMetadata) {
      await saveData(withSyncNonce(persistedSettings));
      this.lastPersistedMetadataJson = metadataJson;
      storageLog("Saved shard metadata to data.json", {
        feedCount: persistedSettings.feeds.length,
      });
    }

    if (settings.storageMode === "vault-shards-v2") {
      await this.saveUserStateFromFeeds(settings);
    }

    this.lastStorageFolderPath = normalizedStorageFolder;
    storageLog("Finished persisting settings", {
      metadataSaved: shouldSaveMetadata,
      shardWriteCount,
      shardDeleteCount,
    });

    return {
      metadataSaved: shouldSaveMetadata,
      shardWriteCount,
      shardDeleteCount,
    };
  }

  public async migrateToVaultShards(
    settings: RssDashboardSettings,
    saveData: (data: unknown) => Promise<void>,
  ): Promise<void> {
    const snapshot = this.captureMigrationSnapshot(settings);
    storageLog("Starting migration to vault shards", {
      currentMode: settings.storageMode,
      folder: normalizeFolderPath(settings.storageFolder),
      feedCount: settings.feeds.length,
    });
    settings.storageMode = "vault-shards";
    settings.storageFolder = normalizeFolderPath(settings.storageFolder);

    try {
      await this.persistSettings(settings, saveData, {
        forceAllShards: true,
        forceMetadata: true,
      });
      this.lastRepairResult = "Migration completed";
      storageLog("Completed migration to vault shards");
    } catch (error) {
      this.restoreMigrationSnapshot(settings, snapshot);
      storageError(
        "Migration to vault shards failed; restored legacy state",
        error,
        {
          restoredMode: settings.storageMode,
          restoredFolder: settings.storageFolder,
        },
      );
      throw error;
    }
  }

  public async migrateToVaultShardsV2(
    settings: RssDashboardSettings,
    saveData: (data: unknown) => Promise<void>,
  ): Promise<void> {
    const snapshot = this.captureMigrationSnapshot(settings);
    storageLog("Starting migration to vault shards v2 (split state)", {
      currentMode: settings.storageMode,
      folder: normalizeFolderPath(settings.storageFolder),
      feedCount: settings.feeds.length,
    });
    settings.storageMode = "vault-shards-v2";
    settings.storageFolder = normalizeFolderPath(settings.storageFolder);
    settings.metadataStorageMode = "vault-location";
    // Usually metadataStorageFolder is set by the user, but fallback to parent of feeds folder
    const parentFolder = this.getParentFolderPath(settings.storageFolder) || ".rss-dashboard-data";
    settings.metadataStorageFolder = normalizeFolderPath(parentFolder);
    settings.metadataStorageSchemaVersion = 2;

    try {
      // persistSettings will handle saving shards (without state) and user-state.json
      await this.persistSettings(settings, saveData, {
        forceAllShards: true,
        forceMetadata: true,
      });
      this.lastRepairResult = "Migration completed (v2)";
      storageLog("Completed migration to vault shards v2");
    } catch (error) {
      this.restoreMigrationSnapshot(settings, snapshot);
      storageError(
        "Migration to vault shards v2 failed; restored state",
        error,
        {
          restoredMode: settings.storageMode,
          restoredFolder: settings.storageFolder,
        },
      );
      throw error;
    }
  }

  public async revertToLegacyJson(
    settings: RssDashboardSettings,
    saveData: (data: unknown) => Promise<void>,
    options: RevertToLegacyJsonOptions = {},
  ): Promise<void> {
    const storageFolder = normalizeFolderPath(settings.storageFolder);
    storageLog("Reverting to legacy JSON storage", {
      storageFolder,
      feedCount: settings.feeds.length,
      deleteShardFolder: Boolean(options.deleteShardFolder),
    });

    if (options.deleteShardFolder) {
      await this.deleteShardFolder(storageFolder);
    }

    settings.storageMode = "legacy-json";
    await saveData(withSyncNonce(cloneJson(settings)));

    this.lastRepairResult = "Reverted to legacy JSON";
    this.capturePersistedState(settings);
    storageLog("Completed revert to legacy JSON storage");
  }

  public async repairVaultShards(
    settings: RssDashboardSettings,
    saveData: (data: unknown) => Promise<void>,
  ): Promise<void> {
    storageLog("Repairing vault shards", {
      mode: settings.storageMode,
      folder: normalizeFolderPath(settings.storageFolder),
      feedCount: settings.feeds.length,
    });
    settings.storageFolder = normalizeFolderPath(settings.storageFolder);
    await this.persistSettings(settings, saveData, {
      forceAllShards: true,
      forceMetadata: true,
    });
    this.lastRepairResult = `Last repair succeeded at ${new Date().toLocaleString()}`;
    storageLog("Completed vault shard repair", {
      folder: settings.storageFolder,
    });
  }

  public buildPortableDataBundle(
    settings: RssDashboardSettings,
  ): PortableDataBundle {
    this.ensureFeedIds(settings);

    return {
      version: SHARD_VERSION,
      exportedAt: Date.now(),
      storageMode: settings.storageMode,
      storageFolder: settings.storageFolder,
      metadataStorageMode: settings.metadataStorageMode,
      metadataStorageFolder: settings.metadataStorageFolder,
      metadata: this.createPersistedSettings(settings),
      shards: settings.feeds
        .filter((feed): feed is Feed & { feedId: string } =>
          Boolean(feed.feedId),
        )
        .map((feed) => createFeedShard(feed)),
      markdownMirrorFallbackPlanned: true,
    };
  }

  public validatePortableDataBundle(input: unknown): PortableDataBundle {
    return parsePortableDataBundle(input);
  }

  public async importPortableDataBundle(
    input: unknown,
    settings: RssDashboardSettings,
    saveData: (data: unknown) => Promise<void>,
  ): Promise<void> {
    const bundle = this.validatePortableDataBundle(input);
    const backupBundle = this.buildPortableDataBundle(settings);

    storageLog("Starting portable bundle import", {
      sourceMode: bundle.storageMode,
      sourceFeedCount: bundle.metadata.feeds.length,
      sourceShardCount: bundle.shards.length,
    });

    try {
      const shardItemsByFeedId = new Map(
        bundle.shards.map((shard) => [shard.feedId, cloneJson(shard.items)]),
      );
      const importedMetadata = cloneJson(bundle.metadata);
      const importedFeeds = importedMetadata.feeds.map((feed) => {
        const feedItems = feed.feedId
          ? shardItemsByFeedId.get(feed.feedId)
          : undefined;
        return {
          ...feed,
          items: Array.isArray(feedItems) ? feedItems : [],
        };
      });

      const nextSettings = {
        ...settings,
        ...importedMetadata,
        storageMode: bundle.storageMode,
        storageFolder: normalizeFolderPath(importedMetadata.storageFolder),
        metadataStorageMode:
          bundle.metadataStorageMode ?? settings.metadataStorageMode,
        metadataStorageFolder:
          bundle.metadataStorageFolder ?? settings.metadataStorageFolder,
        feeds: importedFeeds,
      } as RssDashboardSettings;

      Object.assign(settings, cloneJson(nextSettings));

      await this.persistSettings(settings, saveData, {
        forceAllShards: true,
        forceMetadata: true,
      });

      storageLog("Completed portable bundle import", {
        mode: settings.storageMode,
        folder: settings.storageFolder,
        feedCount: settings.feeds.length,
      });
    } catch (error) {
      storageError(
        "Portable bundle import failed; restoring previous state",
        error,
      );

      try {
        const backupShardItemsByFeedId = new Map(
          backupBundle.shards.map((shard) => [
            shard.feedId,
            cloneJson(shard.items),
          ]),
        );
        const rollbackSettings = {
          ...settings,
          ...backupBundle.metadata,
          storageMode: backupBundle.storageMode,
          storageFolder: normalizeFolderPath(
            backupBundle.metadata.storageFolder,
          ),
          metadataStorageMode:
            backupBundle.metadataStorageMode ?? settings.metadataStorageMode,
          metadataStorageFolder:
            backupBundle.metadataStorageFolder ??
            settings.metadataStorageFolder,
          feeds: backupBundle.metadata.feeds.map((feed) => ({
            ...feed,
            items: feed.feedId
              ? (backupShardItemsByFeedId.get(feed.feedId) ?? [])
              : [],
          })),
        } as RssDashboardSettings;

        Object.assign(settings, cloneJson(rollbackSettings));
        await this.persistSettings(settings, saveData, {
          forceAllShards: true,
          forceMetadata: true,
        });
        storageLog(
          "Restored previous state after failed portable bundle import",
        );
      } catch (rollbackError) {
        storageError(
          "Rollback failed after portable bundle import failure",
          rollbackError,
        );
      }

      throw error;
    }
  }

  public getStatus(settings: RssDashboardSettings): FeedStorageStatus {
    const shardCount = settings.feeds.filter((feed) => feed.feedId).length;
    return {
      mode: settings.storageMode,
      folder: normalizeFolderPath(settings.storageFolder),
      shardCount,
      feedCount: settings.feeds.length,
      migrationReady:
        settings.storageMode === "legacy-json" &&
        settings.feeds.some((feed) => (feed.items?.length ?? 0) > 0),
      lastRepairResult: this.lastRepairResult,
    };
  }

  private createPersistedSettings(
    settings: RssDashboardSettings,
  ): PersistedRssDashboardSettings {
    const cloned = cloneJson(settings);
    const feeds: PersistedFeedConfig[] = cloned.feeds.map((feed) => {
      const { items: _items, feedId, ...config } = feed;
      void _items;
      return {
        ...config,
        feedId: feedId ?? createFeedId(),
      };
    });

    return {
      ...cloned,
      storageFolder: normalizeFolderPath(cloned.storageFolder),
      feeds,
    };
  }

  private capturePersistedState(settings: RssDashboardSettings): void {
    if (settings.storageMode === "vault-shards" || settings.storageMode === "vault-shards-v2") {
      this.lastPersistedMetadataJson = JSON.stringify(
        this.createPersistedSettings(settings),
        null,
        2,
      );
      const isV2 = settings.storageMode === "vault-shards-v2";
      this.lastPersistedShardJsonByFeedId = new Map(
        settings.feeds
          .filter((feed): feed is Feed & { feedId: string } =>
            Boolean(feed.feedId),
          )
          .map((feed) => [feed.feedId, createComparableFeedShardJson(feed, isV2)]),
      );
      this.lastStorageFolderPath = normalizeFolderPath(settings.storageFolder);
      return;
    }

    this.lastPersistedMetadataJson = JSON.stringify(
      cloneJson(settings),
      null,
      2,
    );
    this.lastPersistedShardJsonByFeedId.clear();
    this.lastStorageFolderPath = null;
  }

  private captureMigrationSnapshot(
    settings: RssDashboardSettings,
  ): MigrationSnapshot {
    return {
      storageMode: settings.storageMode,
      storageFolder: settings.storageFolder,
      lastRepairResult: this.lastRepairResult,
    };
  }

  private restoreMigrationSnapshot(
    settings: RssDashboardSettings,
    snapshot: MigrationSnapshot,
  ): void {
    settings.storageMode = snapshot.storageMode;
    settings.storageFolder = snapshot.storageFolder;
    this.lastRepairResult = snapshot.lastRepairResult;
  }

  private async ensureStorageFolderExists(
    storageFolder: string,
  ): Promise<void> {
    const normalizedFolder = normalizeFolderPath(storageFolder);
    if (!normalizedFolder) {
      return;
    }

    const existing = this.app.vault.getAbstractFileByPath(normalizedFolder);
    if (existing instanceof TFolder) {
      storageLog("Storage folder already exists", { folder: normalizedFolder });
      return;
    }

    if (existing instanceof TFile) {
      throw new Error(
        `Storage path points to a file, not a folder: ${normalizedFolder}`,
      );
    }

    try {
      await this.app.vault.createFolder(normalizedFolder);
    } catch (error) {
      const resolved = this.app.vault.getAbstractFileByPath(normalizedFolder);
      if (resolved instanceof TFolder) {
        storageLog("Storage folder became available after createFolder error", {
          folder: normalizedFolder,
        });
        return;
      }

      if (await this.app.vault.adapter.exists(normalizedFolder)) {
        storageLog(
          "Storage folder exists on adapter after createFolder error",
          {
            folder: normalizedFolder,
          },
        );
        return;
      }

      throw error;
    }

    const created = this.app.vault.getAbstractFileByPath(normalizedFolder);
    if (!(created instanceof TFolder)) {
      if (await this.app.vault.adapter.exists(normalizedFolder)) {
        storageLog("Storage folder exists on adapter after creation", {
          folder: normalizedFolder,
        });
        return;
      }

      throw new Error(`Failed to create storage folder: ${normalizedFolder}`);
    }

    storageLog("Created storage folder", { folder: normalizedFolder });
  }

  private async deleteShardFolder(folderPath: string): Promise<void> {
    const existsBeforeDelete = await this.app.vault.adapter.exists(folderPath);
    if (!existsBeforeDelete) {
      storageLog("No shard folder found to clean", { folderPath });
      this.lastPersistedShardJsonByFeedId.clear();
      this.lastStorageFolderPath = null;
      return;
    }

    try {
      await this.app.vault.adapter.rmdir(folderPath, true);
    } catch (error) {
      storageError("Adapter shard folder delete failed", error, { folderPath });
      throw new ShardFolderDeletionError(
        folderPath,
        error instanceof Error
          ? `Failed to delete shard folder "${folderPath}": ${error.message}`
          : `Failed to delete shard folder "${folderPath}"`,
      );
    }

    if (await this.app.vault.adapter.exists(folderPath)) {
      throw new ShardFolderDeletionError(
        folderPath,
        `Shard folder still exists after delete attempt: ${folderPath}`,
      );
    }

    await this.pruneEmptyParentFolders(folderPath);

    this.lastPersistedShardJsonByFeedId.clear();
    this.lastStorageFolderPath = null;
    storageLog("Deleted shard storage folder", {
      folderPath,
    });
  }

  private async pruneEmptyParentFolders(folderPath: string): Promise<void> {
    let currentPath = this.getParentFolderPath(folderPath);

    while (currentPath) {
      const exists = await this.app.vault.adapter.exists(currentPath);
      if (!exists) {
        currentPath = this.getParentFolderPath(currentPath);
        continue;
      }

      const contents = await this.app.vault.adapter.list(currentPath);
      const hasChildren =
        contents.files.length > 0 || contents.folders.length > 0;
      if (hasChildren) {
        break;
      }

      try {
        await this.app.vault.adapter.rmdir(currentPath, false);
        storageLog("Deleted empty parent storage folder", {
          folderPath: currentPath,
        });
      } catch (error) {
        storageError("Failed to delete empty parent storage folder", error, {
          folderPath: currentPath,
        });
        break;
      }

      currentPath = this.getParentFolderPath(currentPath);
    }
  }

  private getParentFolderPath(folderPath: string): string | null {
    const lastSlashIndex = folderPath.lastIndexOf("/");
    if (lastSlashIndex <= 0) {
      return null;
    }

    return folderPath.slice(0, lastSlashIndex);
  }

  private getUserStatePath(settings: RssDashboardSettings): string {
    let folder = settings.metadataStorageFolder.trim();
    if (!folder) {
      folder = ".rss-dashboard-data";
    }
    return normalizePath(`${folder.replace(/^\/+|\/+$/g, "")}/user-state.json`);
  }

  public async loadUserState(settings: RssDashboardSettings): Promise<UserStateFile | null> {
    const path = this.getUserStatePath(settings);
    if (!(await this.app.vault.adapter.exists(path))) {
      return null;
    }
    try {
      const raw = await this.app.vault.adapter.read(path);
      const parsed = JSON.parse(raw) as UserStateFile;
      if (parsed && typeof parsed.states === "object") {
        return parsed;
      }
    } catch (e) {
      storageError("Failed to parse user-state.json", e);
    }
    return null;
  }

  public async saveUserStateFromFeeds(settings: RssDashboardSettings): Promise<void> {
    const activeGuids = new Set<string>();
    const states: Record<string, ArticleUserState> = {};

    for (const feed of settings.feeds) {
      for (const item of feed.items) {
        activeGuids.add(item.guid);
        const hasState = item.read || item.starred || (item.tags && item.tags.length > 0) || item.saved || item.playbackProgress;
        if (hasState) {
          const state: ArticleUserState = {};
          if (item.read) state.read = true;
          if (item.starred) state.starred = true;
          if (item.tags && item.tags.length > 0) state.tags = cloneJson(item.tags);
          if (item.saved) {
            state.saved = true;
            if (item.savedFilePath) state.savedFilePath = item.savedFilePath;
          }
          if (item.playbackProgress) state.playbackProgress = cloneJson(item.playbackProgress);
          states[item.guid] = state;
        }
      }
    }

    // Attempt to load existing to preserve any items that are currently pruned from feed shards
    // wait, the GC logic says "cross-reference active GUIDs in all feeds... if GUID doesn't exist in any feed, delete it"
    // So we don't preserve items not in activeGuids. This implicitly handles GC!
    // But wait, are there items in user-state that are NOT in feeds but we WANT to keep? No, the plan says GC them.

    const userStateFile: UserStateFile = withSyncNonce({
      version: 1,
      states
    });

    const path = this.getUserStatePath(settings);
    
    // Ensure metadata folder exists
    let folder = settings.metadataStorageFolder.trim();
    if (!folder) {
      folder = ".rss-dashboard-data";
    }
    const normalizedFolder = normalizePath(folder.replace(/^\/+|\/+$/g, ""));
    const folderExists = await this.app.vault.adapter.exists(normalizedFolder);
    if (!folderExists) {
      try {
        await this.app.vault.createFolder(normalizedFolder);
      } catch {
        // ignore race conditions
      }
    }

    const writeUserState = () =>
      this.app.vault.adapter.write(path, JSON.stringify(userStateFile, null, 2));
    if (this.writeWrapper) {
      await this.writeWrapper(writeUserState);
    } else {
      await writeUserState();
    }
    storageLog("Saved user-state.json with " + Object.keys(states).length + " entries.");
  }
}
