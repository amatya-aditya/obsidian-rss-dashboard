import { App, TFolder } from "obsidian";
import type {
  Feed,
  FeedBundle,
  FeedItem,
  FeedItemsShard,
  PortableDataBundle,
  PersistedFeedConfig,
  PersistedRssDashboardSettings,
  RssDashboardSettings,
  SettingsBundle,
  UserStateFile,
  FeedShardHealth,
} from "../types/types";
import { OwnWriteRecord } from "./own-write-record";
import { SHARD_VERSION, cloneJson, withSyncNonce } from "./storage-json";
import {
  parseFeedBundle,
  parsePortableDataBundle,
  parseSettingsBundle,
} from "./storage-bundle-parsers";
import { UserStateStore } from "./user-state-store";
import type { UserStateJournalChange } from "./user-state-journal";
import { mergeImportedSettingsGroups } from "../utils/settings-group-merge";
import {
  createComparableFeedShardJson,
  createFeedShard,
  dropInvalidShardItems,
  getFeedShardPath,
  isHiddenFromSync,
  normalizeFolderPath,
} from "./feed-storage-shard";
import {
  hydrateFeedStorage,
  persistFeedStorage,
  type FeedStorageHydrationResult,
  type FeedStoragePersistResult,
  type FeedStorageRunnerHost,
  type FeedStorageRunnerState,
  type PersistSettingsOptions,
} from "./feed-storage-runner";

export { normalizeFolderPath, isHiddenFromSync };
export type { PersistSettingsOptions };

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

export interface RepairResult {
  /** Feeds left untouched because their shard is missing or unreadable and nothing is loaded to rebuild it from. */
  skippedFeedCount: number;
}

export interface RepairPreview {
  rewriteCount: number;
  skippedFeedTitles: string[];
  /** Feeds whose readable shard on disk holds more articles than repair would write. */
  shrinkingFeeds: {
    title: string;
    onDiskCount: number;
    afterRepairCount: number;
  }[];
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

function createFeedId(): string {
  const randomUuid = window.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid;
  }

  return `feed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function storageLog(_message: string, _details?: unknown): void {}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

export class FeedStorageRepository {
  /**
   * Workflow state the hydrate/persist runner reads and writes through the
   * host. It stays on the repository and is passed by reference; the runner
   * never holds a copy, so reassigning a field here is safe.
   */
  private readonly state: FeedStorageRunnerState = {
    lastPersistedMetadataJson: null,
    lastPersistedShardJsonByFeedId: new Map<string, string>(),
    ownWrites: new OwnWriteRecord(),
    lastStorageFolderPath: null,
    feedShardHealthById: new Map<string, FeedShardHealth>(),
    retainedMissingFeedIds: new Set<string>(),
    shardFolderHiddenFromSync: false,
    /**
     * Feed IDs whose shard was successfully read and structurally validated
     * in this plugin session, with the GUIDs present in that validated read.
     */
    hydratedShardGuidsByFeedId: new Map<string, Set<string>>(),
  };
  private lastRepairResult = "Not yet run";
  private userState: UserStateStore;
  private app: App;
  private readonly runnerHost: FeedStorageRunnerHost;

  constructor(
    app: App,
    options?: {
      writeWrapper?: <T>(
        target: { path: string; content: string },
        fn: () => Promise<T>,
      ) => Promise<T>;
      onFileRead?: (path: string, text: string) => void;
      onUserStateHealthChange?: () => void;
    },
  ) {
    this.app = app;
    this.userState = new UserStateStore(app, {
      writeWrapper: options?.writeWrapper,
      onFileRead: options?.onFileRead,
      onUserStateHealthChange: options?.onUserStateHealthChange,
      hydratedShardGuidsByFeedId: this.state.hydratedShardGuidsByFeedId,
    });
    this.runnerHost = {
      app: this.app,
      userState: this.userState,
      state: this.state,
      ensureFeedIds: (settings) => this.ensureFeedIds(settings),
      capturePersistedState: (settings) => this.capturePersistedState(settings),
      hasNothingToRebuild: (feed) => this.hasNothingToRebuild(feed),
      removeShardFile: (shardPath) => this.removeShardFile(shardPath),
      removeFolderIfEmpty: (folderPath) => this.removeFolderIfEmpty(folderPath),
      pruneEmptyParentFolders: (folderPath) =>
        this.pruneEmptyParentFolders(folderPath),
      createPersistedSettings: (settings) =>
        this.createPersistedSettings(settings),
    };
  }

  public isUserStateUnreadable(): boolean {
    return this.userState.isUnreadable();
  }

  /**
   * Points the article-state store at the device-local journal folder and the
   * settings store's one persistence gate. Called by the settings store, which
   * owns the plugin folder and that gate.
   */
  public configureDeviceLocalJournal(options: {
    pluginDir: string;
    isPersistenceSuppressed: () => boolean;
    getStorageMode: () => RssDashboardSettings["storageMode"];
  }): void {
    this.userState.configureDeviceLocalJournal(options);
  }

  /**
   * Appends article-state changes to the device-local journal so they survive
   * an abrupt close before the shared snapshot is rewritten. #1387 calls this
   * from the coalesced article-state queue.
   */
  public async recordArticleStateChanges(
    changes: readonly UserStateJournalChange[],
  ): Promise<void> {
    return this.userState.appendChanges(changes);
  }

  public getFeedShardHealth(feed: Feed): FeedShardHealth | null {
    return feed.feedId
      ? (this.state.feedShardHealthById.get(feed.feedId) ?? null)
      : null;
  }

  public clearFeedShardHealth(feed: Feed): void {
    if (feed.feedId) {
      this.state.feedShardHealthById.delete(feed.feedId);
      this.state.retainedMissingFeedIds.delete(feed.feedId);
    }
  }

  /**
   * The Own write record of every watched file, shards included (#1422). The
   * settings store reads and writes it for `data.json` and `user-state.json`.
   */
  public get ownWrites(): OwnWriteRecord {
    return this.state.ownWrites;
  }

  /**
   * True when the last hydration found no shard for any feed and the storage
   * folder is hidden, the signature of a second device whose sync tool skips
   * dot-prefixed folders rather than of individually damaged shards.
   */
  public isShardFolderHiddenFromSync(): boolean {
    return this.state.shardFolderHiddenFromSync;
  }

  /**
   * Number of feeds this device has neither loaded from their shard nor
   * refetched since, i.e. feeds it holds no articles for.
   */
  public countUnloadedFeeds(settings: RssDashboardSettings): number {
    return settings.feeds.filter(
      (feed) =>
        Boolean(feed.feedId) &&
        this.hasNothingToRebuild(feed as Feed & { feedId: string }),
    ).length;
  }

  /**
   * A feed whose shard could not be loaded at startup and that has gained no
   * articles since has nothing real to write. Writing its empty in-memory
   * copy would replace a shard that is still syncing in, or that another
   * device holds, with an empty one.
   */
  private hasNothingToRebuild(feed: Feed & { feedId: string }): boolean {
    const health = this.state.feedShardHealthById.get(feed.feedId);
    return (
      (health === "missing" || health === "corrupt") && feed.items.length === 0
    );
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

  /**
   * `loadedItemsByFeedId` holds the articles already in memory when this is a
   * reload; a feed whose shard is gone keeps them instead of loading empty.
   */
  public async hydrateSettings(
    settings: RssDashboardSettings,
    loadedItemsByFeedId?: ReadonlyMap<string, FeedItem[]>,
  ): Promise<FeedStorageHydrationResult> {
    return hydrateFeedStorage(settings, this.runnerHost, loadedItemsByFeedId);
  }

  /**
   * Re-applies the persisted article state to the loaded items in place,
   * replaying the device-local journal over it. Unlike a full settings load it
   * keeps the settings object, so a pending settings edit survives (#1418).
   */
  public async refreshArticleState(
    settings: RssDashboardSettings,
  ): Promise<void> {
    await this.userState.applyToFeeds(settings);
  }

  public async persistSettings(
    settings: RssDashboardSettings,
    saveData: (data: unknown) => Promise<void>,
    options: PersistSettingsOptions = {},
  ): Promise<FeedStoragePersistResult> {
    return persistFeedStorage(settings, saveData, options, this.runnerHost);
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
    const parentFolder =
      this.getParentFolderPath(settings.storageFolder) || ".rss-dashboard-data";
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
  ): Promise<RepairResult> {
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
    let skippedFeedCount = 0;
    for (const feed of settings.feeds) {
      if (
        feed.feedId &&
        this.hasNothingToRebuild(feed as Feed & { feedId: string })
      ) {
        skippedFeedCount += 1;
      } else {
        this.clearFeedShardHealth(feed);
      }
    }
    this.lastRepairResult =
      skippedFeedCount > 0
        ? `Last repair at ${new Date().toLocaleString()} skipped ${skippedFeedCount} feeds with no articles to rebuild from`
        : `Last repair succeeded at ${new Date().toLocaleString()}`;
    storageLog("Completed vault shard repair", {
      folder: settings.storageFolder,
      skippedFeedCount,
    });
    return { skippedFeedCount };
  }

  /**
   * Describes what `repairVaultShards` would do without writing anything, so
   * the user can back out before shards are rewritten from memory.
   */
  public async previewRepairVaultShards(
    settings: RssDashboardSettings,
  ): Promise<RepairPreview> {
    const preview: RepairPreview = {
      rewriteCount: 0,
      skippedFeedTitles: [],
      shrinkingFeeds: [],
    };
    for (const feed of settings.feeds) {
      if (!feed.feedId) continue;
      if (this.hasNothingToRebuild(feed as Feed & { feedId: string })) {
        preview.skippedFeedTitles.push(feed.title);
        continue;
      }
      preview.rewriteCount += 1;
      const onDiskCount = await this.readShardItemCount(
        getFeedShardPath(settings.storageFolder, feed.feedId),
        feed.feedId,
      );
      if (onDiskCount !== null && onDiskCount > feed.items.length) {
        preview.shrinkingFeeds.push({
          title: feed.title,
          onDiskCount,
          afterRepairCount: feed.items.length,
        });
      }
    }
    return preview;
  }

  /** Article count of a readable shard for `feedId`, otherwise null. */
  private async readShardItemCount(
    shardPath: string,
    feedId: string,
  ): Promise<number | null> {
    if (!(await this.app.vault.adapter.exists(shardPath))) return null;
    try {
      const parsed = JSON.parse(
        await this.app.vault.adapter.read(shardPath),
      ) as Partial<FeedItemsShard>;
      return parsed.feedId === feedId && Array.isArray(parsed.items)
        ? dropInvalidShardItems(parsed.items).length
        : null;
    } catch {
      return null;
    }
  }

  public buildFeedBundle(settings: RssDashboardSettings): FeedBundle {
    this.ensureFeedIds(settings);

    return {
      version: SHARD_VERSION,
      exportedAt: Date.now(),
      feeds: cloneJson(this.toPersistedFeeds(settings.feeds)),
      folders: cloneJson(settings.folders),
      availableTags: cloneJson(settings.availableTags),
      shards: settings.feeds
        .filter((feed): feed is Feed & { feedId: string } =>
          Boolean(feed.feedId),
        )
        .map((feed) => createFeedShard(feed)),
    };
  }

  public buildSettingsBundle(settings: RssDashboardSettings): SettingsBundle {
    const {
      feeds: _feeds,
      folders: _folders,
      availableTags: _availableTags,
      ...rest
    } = settings;
    void _feeds;
    void _folders;
    void _availableTags;
    const settingsOnly = cloneJson(rest);
    settingsOnly.storageFolder = normalizeFolderPath(
      settingsOnly.storageFolder,
    );

    return {
      version: SHARD_VERSION,
      exportedAt: Date.now(),
      metadataStorageMode: settings.metadataStorageMode,
      metadataStorageFolder: settings.metadataStorageFolder,
      settings: settingsOnly,
    };
  }

  public buildPortableDataBundle(
    settings: RssDashboardSettings,
  ): PortableDataBundle {
    const feedBundle = this.buildFeedBundle(settings);
    const settingsBundle = this.buildSettingsBundle(settings);

    return {
      version: SHARD_VERSION,
      exportedAt: Date.now(),
      storageMode: settings.storageMode,
      storageFolder: settings.storageFolder,
      metadataStorageMode: settingsBundle.metadataStorageMode,
      metadataStorageFolder: settingsBundle.metadataStorageFolder,
      metadata: {
        ...settingsBundle.settings,
        feeds: feedBundle.feeds,
        folders: feedBundle.folders,
        availableTags: feedBundle.availableTags,
      },
      shards: feedBundle.shards,
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
        replacesFeedList: true,
        authoritativeArticleState: true,
        restoresArticlePresence: true,
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
          replacesFeedList: true,
          authoritativeArticleState: true,
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

  public validateFeedBundle(input: unknown): FeedBundle {
    return parseFeedBundle(input);
  }

  public async importFeedBundle(
    input: unknown,
    settings: RssDashboardSettings,
    saveData: (data: unknown) => Promise<void>,
  ): Promise<void> {
    const bundle = this.validateFeedBundle(input);
    const backupBundle = this.buildFeedBundle(settings);

    storageLog("Starting feed bundle import", {
      sourceFeedCount: bundle.feeds.length,
      sourceShardCount: bundle.shards.length,
    });

    try {
      const shardItemsByFeedId = new Map(
        bundle.shards.map((shard) => [shard.feedId, cloneJson(shard.items)]),
      );
      const importedFeeds = cloneJson(bundle.feeds).map((feed) => {
        const feedItems = feed.feedId
          ? shardItemsByFeedId.get(feed.feedId)
          : undefined;
        return {
          ...feed,
          items: Array.isArray(feedItems) ? feedItems : [],
        };
      });

      settings.feeds = importedFeeds;
      settings.folders = cloneJson(bundle.folders);
      settings.availableTags = cloneJson(bundle.availableTags);

      await this.persistSettings(settings, saveData, {
        forceAllShards: true,
        forceMetadata: true,
        replacesFeedList: true,
        authoritativeArticleState: true,
        restoresArticlePresence: true,
      });

      storageLog("Completed feed bundle import", {
        feedCount: settings.feeds.length,
      });
    } catch (error) {
      storageError(
        "Feed bundle import failed; restoring previous state",
        error,
      );

      try {
        const backupShardItemsByFeedId = new Map(
          backupBundle.shards.map((shard) => [
            shard.feedId,
            cloneJson(shard.items),
          ]),
        );
        settings.feeds = cloneJson(backupBundle.feeds).map((feed) => ({
          ...feed,
          items: feed.feedId
            ? (backupShardItemsByFeedId.get(feed.feedId) ?? [])
            : [],
        }));
        settings.folders = cloneJson(backupBundle.folders);
        settings.availableTags = cloneJson(backupBundle.availableTags);

        await this.persistSettings(settings, saveData, {
          forceAllShards: true,
          forceMetadata: true,
          replacesFeedList: true,
          authoritativeArticleState: true,
        });
        storageLog("Restored previous state after failed feed bundle import");
      } catch (rollbackError) {
        storageError(
          "Rollback failed after feed bundle import failure",
          rollbackError,
        );
      }

      throw error;
    }
  }

  public validateSettingsBundle(input: unknown): SettingsBundle {
    return parseSettingsBundle(input);
  }

  public async importSettingsBundle(
    input: unknown,
    settings: RssDashboardSettings,
    saveData: (data: unknown) => Promise<void>,
  ): Promise<void> {
    const bundle = this.validateSettingsBundle(input);
    const backupBundle = this.buildSettingsBundle(settings);

    storageLog("Starting settings bundle import", {
      sourceStorageMode: bundle.settings.storageMode,
    });

    try {
      // Merge nested groups while the current settings are still intact, so a
      // group the bundle carries only in part keeps its omitted keys.
      Object.assign(
        settings,
        mergeImportedSettingsGroups(settings, cloneJson(bundle.settings)),
      );
      settings.storageFolder = normalizeFolderPath(settings.storageFolder);
      settings.metadataStorageMode =
        bundle.metadataStorageMode ?? settings.metadataStorageMode;
      settings.metadataStorageFolder =
        bundle.metadataStorageFolder ?? settings.metadataStorageFolder;

      await this.persistSettings(settings, saveData, {
        forceAllShards: true,
        forceMetadata: true,
      });

      storageLog("Completed settings bundle import", {
        mode: settings.storageMode,
      });
    } catch (error) {
      storageError(
        "Settings bundle import failed; restoring previous state",
        error,
      );

      try {
        Object.assign(settings, cloneJson(backupBundle.settings));
        settings.storageFolder = normalizeFolderPath(settings.storageFolder);
        settings.metadataStorageMode =
          backupBundle.metadataStorageMode ?? settings.metadataStorageMode;
        settings.metadataStorageFolder =
          backupBundle.metadataStorageFolder ?? settings.metadataStorageFolder;

        await this.persistSettings(settings, saveData, {
          forceAllShards: true,
          forceMetadata: true,
        });
        storageLog(
          "Restored previous state after failed settings bundle import",
        );
      } catch (rollbackError) {
        storageError(
          "Rollback failed after settings bundle import failure",
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

  private toPersistedFeeds(feeds: Feed[]): PersistedFeedConfig[] {
    return feeds.map((feed) => {
      const { items: _items, feedId, ...config } = feed;
      void _items;
      return {
        ...config,
        feedId: feedId ?? createFeedId(),
      };
    });
  }

  private createPersistedSettings(
    settings: RssDashboardSettings,
  ): PersistedRssDashboardSettings {
    const cloned = cloneJson(settings);

    return {
      ...cloned,
      storageFolder: normalizeFolderPath(cloned.storageFolder),
      feeds: this.toPersistedFeeds(cloned.feeds),
    };
  }

  private capturePersistedState(settings: RssDashboardSettings): void {
    if (
      settings.storageMode === "vault-shards" ||
      settings.storageMode === "vault-shards-v2"
    ) {
      this.state.lastPersistedMetadataJson = JSON.stringify(
        this.createPersistedSettings(settings),
        null,
        2,
      );
      const isV2 = settings.storageMode === "vault-shards-v2";
      this.state.lastPersistedShardJsonByFeedId = new Map(
        settings.feeds
          .filter((feed): feed is Feed & { feedId: string } =>
            Boolean(feed.feedId),
          )
          .map((feed) => [
            feed.feedId,
            createComparableFeedShardJson(feed, isV2),
          ]),
      );
      this.state.lastStorageFolderPath = normalizeFolderPath(
        settings.storageFolder,
      );
      return;
    }

    this.state.lastPersistedMetadataJson = JSON.stringify(
      cloneJson(settings),
      null,
      2,
    );
    this.state.lastPersistedShardJsonByFeedId.clear();
    this.state.lastStorageFolderPath = null;
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

  private async deleteShardFolder(folderPath: string): Promise<void> {
    const existsBeforeDelete = await this.app.vault.adapter.exists(folderPath);
    if (!existsBeforeDelete) {
      storageLog("No shard folder found to clean", { folderPath });
      this.state.lastPersistedShardJsonByFeedId.clear();
      this.state.lastStorageFolderPath = null;
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

    this.state.lastPersistedShardJsonByFeedId.clear();
    this.state.lastStorageFolderPath = null;
    storageLog("Deleted shard storage folder", {
      folderPath,
    });
  }

  /**
   * Removes `folderPath` if it is empty and reports whether it did. A folder
   * that still holds anything (a shard skipped because its feed never loaded,
   * `user-state.json`, or a user's own file) is kept.
   *
   * An indexed folder goes to the user's trash through the file manager, as
   * Obsidian's guidelines require for deletions. A dot-prefixed folder is not
   * indexed, so it can only be removed by path. That call passes
   * `recursive: true` because desktop Obsidian implements `rmdir` with
   * `fs.rm`, which refuses any directory otherwise, even an empty one, and
   * mobile always removes recursively. The emptiness check just before it is
   * therefore the only guard, on every platform.
   */
  private async removeFolderIfEmpty(folderPath: string): Promise<boolean> {
    if (!(await this.app.vault.adapter.exists(folderPath))) return false;
    // `adapter.list` also sees hidden entries the vault index leaves out.
    const { files, folders } = await this.app.vault.adapter.list(folderPath);
    if (files.length > 0 || folders.length > 0) return false;

    try {
      const indexed = this.app.vault.getAbstractFileByPath(folderPath);
      if (indexed instanceof TFolder) {
        await this.app.fileManager.trashFile(indexed);
      } else {
        await this.app.vault.adapter.rmdir(folderPath, true);
      }
    } catch (error) {
      storageError("Failed to remove empty storage folder", error, {
        folderPath,
      });
      return false;
    }
    storageLog("Removed empty storage folder", { folderPath });
    return true;
  }

  private async pruneEmptyParentFolders(folderPath: string): Promise<void> {
    let currentPath = this.getParentFolderPath(folderPath);

    while (currentPath) {
      if (
        (await this.app.vault.adapter.exists(currentPath)) &&
        !(await this.removeFolderIfEmpty(currentPath))
      ) {
        break;
      }
      currentPath = this.getParentFolderPath(currentPath);
    }
  }

  private async removeShardFile(shardPath: string): Promise<boolean> {
    this.state.ownWrites.forget(shardPath);
    const indexed = this.app.vault.getAbstractFileByPath(shardPath);
    if (indexed) {
      await this.app.fileManager.trashFile(indexed);
      return true;
    }

    // Obsidian never indexes dot-folders, so a shard in the default
    // `.rss-dashboard-data/feeds` has no TFile and can only be removed by path.
    if (await this.app.vault.adapter.exists(shardPath)) {
      await this.app.vault.adapter.remove(shardPath);
      return true;
    }
    return false;
  }

  private getParentFolderPath(folderPath: string): string | null {
    const lastSlashIndex = folderPath.lastIndexOf("/");
    if (lastSlashIndex <= 0) {
      return null;
    }

    return folderPath.slice(0, lastSlashIndex);
  }

  public async findOrphanedUserState(
    settings: RssDashboardSettings,
  ): Promise<string | null> {
    return this.userState.findOrphaned(settings);
  }

  public async loadUserState(
    settings: RssDashboardSettings,
  ): Promise<UserStateFile | null> {
    return this.userState.load(settings);
  }

  public async saveUserStateFromFeeds(
    settings: RssDashboardSettings,
  ): Promise<void> {
    return this.userState.save(settings);
  }
}
