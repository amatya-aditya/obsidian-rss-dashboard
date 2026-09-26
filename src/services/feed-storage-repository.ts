import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type {
  Feed,
  FeedBundle,
  FeedItemsShard,
  PortableDataBundle,
  PersistedFeedConfig,
  PersistedRssDashboardSettings,
  RssDashboardSettings,
  SettingsBundle,
  UserStateFile,
  FeedShardHealth,
} from "../types/types";
import { cloneJson, withSyncNonce } from "./storage-json";
import { UserStateStore } from "./user-state-store";

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
  /**
   * The feed list was replaced wholesale (a bundle import or restore), so a
   * feed it drops is not a feed removal: its shard is deleted, but its
   * article state is kept on the unrecognized-feed horizon (issue #374).
   */
  replacesFeedList?: boolean;
}

export interface RepairResult {
  /** Feeds left untouched because their shard is missing or unreadable and nothing is loaded to rebuild it from. */
  skippedFeedCount: number;
}

export interface RepairPreview {
  rewriteCount: number;
  skippedFeedTitles: string[];
  /** Feeds whose readable shard on disk holds more articles than repair would write. */
  shrinkingFeeds: { title: string; onDiskCount: number; afterRepairCount: number }[];
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

export function normalizeFolderPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return ".rss-dashboard-data/feeds";
  }

  return normalizePath(trimmed.replace(/^\/+|\/+$/g, ""));
}

/**
 * Obsidian Sync and most file-sync tools skip files and folders whose name
 * begins with ".", so shards under such a path never reach other devices.
 */
export function isHiddenFromSync(folderPath: string): boolean {
  return normalizeFolderPath(folderPath)
    .split("/")
    .some(segment => segment.startsWith("."));
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

export function parsePortableDataBundle(input: unknown): PortableDataBundle {
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
    bundle.storageMode !== "vault-shards" &&
    bundle.storageMode !== "vault-shards-v2"
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

function assertValidShards(shards: unknown): asserts shards is FeedItemsShard[] {
  if (!Array.isArray(shards)) {
    throw new Error("Bundle is missing shards");
  }

  for (const shard of shards) {
    if (!shard || typeof shard !== "object") {
      throw new Error("Bundle has an invalid shard entry");
    }

    const shardLike = shard as Partial<FeedItemsShard>;
    if (typeof shardLike.feedId !== "string" || !shardLike.feedId.trim()) {
      throw new Error("Bundle shard is missing feedId");
    }

    if (!Array.isArray(shardLike.items)) {
      throw new Error(`Bundle shard ${shardLike.feedId} is missing items`);
    }
  }
}

export function parseFeedBundle(input: unknown): FeedBundle {
  if (!input || typeof input !== "object") {
    throw new Error("Feed bundle must be a JSON object");
  }

  const bundle = input as Partial<FeedBundle>;
  if (bundle.version !== SHARD_VERSION) {
    throw new Error(
      `Unsupported feed bundle version: ${String(bundle.version)} (expected ${SHARD_VERSION})`,
    );
  }

  if (typeof bundle.exportedAt !== "number") {
    throw new Error("Feed bundle is missing a valid exportedAt timestamp");
  }

  if (!Array.isArray(bundle.feeds)) {
    throw new Error("Feed bundle is missing feeds");
  }

  if (!Array.isArray(bundle.folders)) {
    throw new Error("Feed bundle is missing folders");
  }

  if (!Array.isArray(bundle.availableTags)) {
    throw new Error("Feed bundle is missing availableTags");
  }

  assertValidShards(bundle.shards);

  return {
    version: bundle.version,
    exportedAt: bundle.exportedAt,
    feeds: bundle.feeds,
    folders: bundle.folders,
    availableTags: bundle.availableTags,
    shards: bundle.shards,
  };
}

export function parseSettingsBundle(input: unknown): SettingsBundle {
  if (!input || typeof input !== "object") {
    throw new Error("Settings bundle must be a JSON object");
  }

  const bundle = input as Partial<SettingsBundle>;
  if (bundle.version !== SHARD_VERSION) {
    throw new Error(
      `Unsupported settings bundle version: ${String(bundle.version)} (expected ${SHARD_VERSION})`,
    );
  }

  if (typeof bundle.exportedAt !== "number") {
    throw new Error(
      "Settings bundle is missing a valid exportedAt timestamp",
    );
  }

  if (!bundle.settings || typeof bundle.settings !== "object") {
    throw new Error("Settings bundle is missing settings");
  }

  const {
    feeds: _feeds,
    folders: _folders,
    availableTags: _availableTags,
    ...settingsOnly
  } = bundle.settings as Record<string, unknown>;
  void _feeds;
  void _folders;
  void _availableTags;

  if (
    settingsOnly.storageMode !== "legacy-json" &&
    settingsOnly.storageMode !== "vault-shards" &&
    settingsOnly.storageMode !== "vault-shards-v2"
  ) {
    throw new Error("Settings bundle has an invalid storageMode value");
  }

  return {
    version: bundle.version,
    exportedAt: bundle.exportedAt,
    metadataStorageMode: bundle.metadataStorageMode,
    metadataStorageFolder: bundle.metadataStorageFolder,
    settings: settingsOnly as SettingsBundle["settings"],
  };
}

export class FeedStorageRepository {
  private lastPersistedMetadataJson: string | null = null;
  private lastPersistedShardJsonByFeedId = new Map<string, string>();
  private lastStorageFolderPath: string | null = null;
  private lastRepairResult = "Not yet run";
  private feedShardHealthById = new Map<string, FeedShardHealth>();
  private shardFolderHiddenFromSync = false;
  /**
   * Feed IDs whose shard was successfully read and structurally validated in
   * this plugin session, with the GUIDs present in that validated read.
   */
  private hydratedShardGuidsByFeedId = new Map<string, Set<string>>();
  private userState: UserStateStore;
  private app: App;

  constructor(
    app: App,
    options?: {
      writeWrapper?: <T>(fn: () => Promise<T>) => Promise<T>;
      onUserStateHealthChange?: () => void;
    },
  ) {
    this.app = app;
    this.userState = new UserStateStore(app, {
      writeWrapper: options?.writeWrapper,
      onUserStateHealthChange: options?.onUserStateHealthChange,
      hydratedShardGuidsByFeedId: this.hydratedShardGuidsByFeedId,
    });
  }

  public isUserStateUnreadable(): boolean {
    return this.userState.isUnreadable();
  }

  public getFeedShardHealth(feed: Feed): FeedShardHealth | null {
    return feed.feedId ? (this.feedShardHealthById.get(feed.feedId) ?? null) : null;
  }

  public clearFeedShardHealth(feed: Feed): void {
    if (feed.feedId) this.feedShardHealthById.delete(feed.feedId);
  }

  /**
   * True when the last hydration found no shard for any feed and the storage
   * folder is hidden, the signature of a second device whose sync tool skips
   * dot-prefixed folders rather than of individually damaged shards.
   */
  public isShardFolderHiddenFromSync(): boolean {
    return this.shardFolderHiddenFromSync;
  }

  /**
   * Number of feeds this device has neither loaded from their shard nor
   * refetched since, i.e. feeds it holds no articles for.
   */
  public countUnloadedFeeds(settings: RssDashboardSettings): number {
    return settings.feeds.filter(
      feed =>
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
    const health = this.feedShardHealthById.get(feed.feedId);
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

    this.shardFolderHiddenFromSync = false;
    if (settings.storageMode !== "vault-shards" && settings.storageMode !== "vault-shards-v2") {
      this.feedShardHealthById.clear();
      this.hydratedShardGuidsByFeedId.clear();
      storageLog("Skipping shard hydration because legacy JSON mode is active");
      this.capturePersistedState(settings);
      return { didChange: didAssignFeedIds, shardCount };
    }

    const feedsById = new Map<string, Feed>();
    this.feedShardHealthById.clear();
    this.hydratedShardGuidsByFeedId.clear();
    for (const feed of settings.feeds) {
      if (feed.feedId) {
        feedsById.set(feed.feedId, feed);
      }
    }

    for (const feed of settings.feeds) {
      if (feed.feedId) {
        this.hydratedShardGuidsByFeedId.delete(feed.feedId);
      }
      const shardPath = getFeedShardPath(
        settings.storageFolder,
        feed.feedId ?? "",
      );
      const shardExists = await this.app.vault.adapter.exists(shardPath);
      if (!shardExists) {
        if (feed.feedId) this.feedShardHealthById.set(feed.feedId, "missing");
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
        if (
          !parsed ||
          parsed.feedId !== feed.feedId ||
          !Array.isArray(parsed.items)
        ) {
          throw new Error("Invalid shard data");
        }

        feed.items = parsed.items;
        if (feed.feedId) {
          this.feedShardHealthById.delete(feed.feedId);
          this.hydratedShardGuidsByFeedId.set(
            feed.feedId,
            new Set(feed.items.map(item => item.guid)),
          );
        }
        shardCount += 1;
        storageLog("Hydrated feed from shard", {
          feedId: feed.feedId,
          title: feed.title,
          shardPath,
          itemCount: feed.items.length,
        });
      } catch (error) {
        if (feed.feedId) this.feedShardHealthById.set(feed.feedId, "corrupt");
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

    const feedsWithIds = settings.feeds.filter(feed => Boolean(feed.feedId));
    this.shardFolderHiddenFromSync =
      feedsWithIds.length > 0 &&
      isHiddenFromSync(settings.storageFolder) &&
      feedsWithIds.every(
        feed => this.feedShardHealthById.get(feed.feedId ?? "") === "missing",
      );

    storageLog("Completed shard hydration", {
      didAssignFeedIds,
      shardCount,
    });

    let userStateLoaded = false;
    if (settings.storageMode === "vault-shards-v2") {
      userStateLoaded = await this.userState.applyToFeeds(settings);
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
      // Also leaves the shard in a previous storage folder in place: it may
      // be the only copy of this feed's articles.
      if (this.hasNothingToRebuild(feed as Feed & { feedId: string })) {
        storageLog("Skipped writing empty shard for unloaded feed", {
          feedId: feed.feedId,
          title: feed.title,
        });
        continue;
      }
      const isV2 = settings.storageMode === "vault-shards-v2";
      const shard = createFeedShard(feed, isV2);
      const shardJson = JSON.stringify(shard, null, 2);
      const currentComparableJson = createComparableFeedShardJson(feed, isV2);
      const previousJson = this.lastPersistedShardJsonByFeedId.get(feed.feedId);

      const shardPath = getFeedShardPath(
        normalizedStorageFolder,
        feed.feedId,
      );
      const shardWriteDecision = await this.getShardWriteDecision(
        shardPath,
        forceAllShards || previousJson !== currentComparableJson,
        feed.feedId,
      );

      if (shardWriteDecision.needsWrite) {
        await this.app.vault.adapter.write(shardPath, shardJson);
        this.lastPersistedShardJsonByFeedId.set(
          feed.feedId,
          currentComparableJson,
        );
        const recoveredHealth =
          shardWriteDecision.recoveredHealth ??
          this.feedShardHealthById.get(feed.feedId);
        if (recoveredHealth === "missing" || recoveredHealth === "corrupt") {
          this.feedShardHealthById.set(feed.feedId, "rebuilt");
          // A feed has articles again, so the folder is no longer wholly
          // unsynced; per-feed warnings cover the feeds still missing.
          this.shardFolderHiddenFromSync = false;
        }
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
        if (await this.removeShardFile(previousShardPath)) {
          storageLog("Deleted shard from previous storage folder", {
            feedId: feed.feedId,
            previousShardPath,
          });
        }
      }
    }

    if (storageFolderChanged && this.lastStorageFolderPath) {
      // Once every shard has moved out, drop the emptied folder and any
      // parent the move left empty.
      if (await this.removeFolderIfEmpty(this.lastStorageFolderPath)) {
        await this.pruneEmptyParentFolders(this.lastStorageFolderPath);
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
      if (await this.removeShardFile(shardPath)) {
        storageLog("Deleted shard for removed feed", {
          feedId: previousFeedId,
          shardPath,
        });
      }
      this.lastPersistedShardJsonByFeedId.delete(previousFeedId);
      if (!options.replacesFeedList) {
        this.userState.markFeedRemoved(previousFeedId);
      }
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
      if (feed.feedId && this.hasNothingToRebuild(feed as Feed & { feedId: string })) {
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
        ? parsed.items.length
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
    const { feeds: _feeds, folders: _folders, availableTags: _availableTags, ...rest } =
      settings;
    void _feeds;
    void _folders;
    void _availableTags;
    const settingsOnly = cloneJson(rest);
    settingsOnly.storageFolder = normalizeFolderPath(settingsOnly.storageFolder);

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
      Object.assign(settings, cloneJson(bundle.settings));
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

  private async getShardWriteDecision(
    shardPath: string,
    alreadyChanged: boolean,
    feedId: string,
  ): Promise<{
    needsWrite: boolean;
    recoveredHealth: "missing" | "corrupt" | null;
  }> {
    if (alreadyChanged) {
      return { needsWrite: true, recoveredHealth: null };
    }

    if (!(await this.app.vault.adapter.exists(shardPath))) {
      return { needsWrite: true, recoveredHealth: "missing" };
    }

    try {
      const parsed = JSON.parse(await this.app.vault.adapter.read(shardPath)) as {
        updatedAt?: unknown;
        feedId?: unknown;
        items?: unknown;
      };
      if (parsed.feedId !== feedId || !Array.isArray(parsed.items)) {
        return { needsWrite: true, recoveredHealth: "corrupt" };
      }
      // A valid shard whose content differs while this device's copy of the
      // feed is unchanged was written elsewhere, typically by another device
      // through sync. Rewriting it would replace newer data with this
      // device's stale copy.
      return { needsWrite: false, recoveredHealth: null };
    } catch {
      return { needsWrite: true, recoveredHealth: "corrupt" };
    }
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

  public async loadUserState(settings: RssDashboardSettings): Promise<UserStateFile | null> {
    return this.userState.load(settings);
  }

  public async saveUserStateFromFeeds(settings: RssDashboardSettings): Promise<void> {
    return this.userState.save(settings);
  }
}
