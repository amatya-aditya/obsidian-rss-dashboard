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
  ArticleUserState,
  UserStateFile,
  FeedShardHealth,
} from "../types/types";

const SHARD_VERSION = 1;

/**
 * `user-state.json` schema version. Version 2 keys `states` by
 * `${feedId}:${guid}` instead of a bare GUID, so two feeds carrying the same
 * GUID no longer overwrite each other's article state (issue #278). Version 3
 * adds hydration-gated garbage-collection timestamps (issue #315).
 */
const USER_STATE_KEY_VERSION = 3;
const USER_STATE_QUALIFIED_VERSION = 2;
const USER_STATE_GC_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

function userStateKey(feedId: string, guid: string): string {
  return `${feedId}:${guid}`;
}

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

/**
 * Obsidian Sync and most file-sync tools skip files and folders whose name
 * begins with ".", so shards under such a path never reach other devices.
 */
function isHiddenFromSync(folderPath: string): boolean {
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

function parseFeedBundle(input: unknown): FeedBundle {
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

function parseSettingsBundle(input: unknown): SettingsBundle {
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
  private writeWrapper?: <T>(fn: () => Promise<T>) => Promise<T>;
  /**
   * `${feedId}:${guid}` keys of items whose in-memory flags are known to
   * reflect persisted user state this session (applied by `hydrateSettings`,
   * or adopted lazily by `saveUserStateFromFeeds` the first time a feed's
   * item becomes available after missing that hydration pass). Until an
   * item is in this set, its default `false` flags are unread parser output,
   * not a deliberate reset, so a persisted entry for it must not be
   * overwritten with those defaults (issue #278).
   */
  private syncedUserStateKeys = new Set<string>();
  private warnedUserStateUnreadable = false;
  private userStateUnreadable = false;
  private onUserStateHealthChange?: () => void;
  private app: App;

  constructor(
    app: App,
    options?: {
      writeWrapper?: <T>(fn: () => Promise<T>) => Promise<T>;
      onUserStateHealthChange?: () => void;
    },
  ) {
    this.app = app;
    this.writeWrapper = options?.writeWrapper;
    this.onUserStateHealthChange = options?.onUserStateHealthChange;
  }

  public isUserStateUnreadable(): boolean {
    return this.userStateUnreadable;
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

  private recordUserStateHealth(
    status: "missing" | "unreadable" | "ok",
  ): void {
    const unreadable = status === "unreadable";
    if (unreadable) {
      this.warnUserStateUnreadable();
    }
    if (unreadable === this.userStateUnreadable) {
      return;
    }
    this.userStateUnreadable = unreadable;
    this.onUserStateHealthChange?.();
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
      const userStateResult = await this.readUserState(settings);
      this.recordUserStateHealth(userStateResult.status);
      const userState =
        userStateResult.status === "ok" ? userStateResult.file : null;
      userStateLoaded = Boolean(userState);
      const { states: resolvedStates } = this.resolvePersistedUserState(userState, settings);
      for (const feed of settings.feeds) {
        const feedId = feed.feedId ?? "";
        for (const item of feed.items) {
          const state = resolvedStates[userStateKey(feedId, item.guid)];
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
          this.syncedUserStateKeys.add(userStateKey(feedId, item.guid));
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

  private getUserStatePath(settings: RssDashboardSettings): string {
    let folder = settings.metadataStorageFolder.trim();
    if (!folder) {
      folder = ".rss-dashboard-data";
    }
    return normalizePath(`${folder.replace(/^\/+|\/+$/g, "")}/user-state.json`);
  }

  /**
   * Path of a `user-state.json` left behind by a previous Shard storage v2
   * setup, or null when none applies.
   *
   * Only v2 reads that file, so in any other mode it is inert while still
   * holding a full copy of article state. It is surfaced rather than deleted
   * because after a revert it is the only standalone copy of that state.
   */
  public async findOrphanedUserState(
    settings: RssDashboardSettings,
  ): Promise<string | null> {
    if (settings.storageMode === "vault-shards-v2") {
      return null;
    }

    const path = this.getUserStatePath(settings);
    return (await this.app.vault.adapter.exists(path)) ? path : null;
  }

  private async readUserState(
    settings: RssDashboardSettings,
  ): Promise<
    | { status: "missing" }
    | { status: "unreadable" }
    | { status: "ok"; file: UserStateFile }
  > {
    const path = this.getUserStatePath(settings);
    if (!(await this.app.vault.adapter.exists(path))) {
      return { status: "missing" };
    }
    try {
      const raw = await this.app.vault.adapter.read(path);
      const parsed = JSON.parse(raw) as UserStateFile;
      if (parsed && typeof parsed.states === "object") {
        return { status: "ok", file: parsed };
      }
    } catch (e) {
      storageError("Failed to parse user-state.json", e);
    }
    return { status: "unreadable" };
  }

  public async loadUserState(settings: RssDashboardSettings): Promise<UserStateFile | null> {
    const result = await this.readUserState(settings);
    return result.status === "ok" ? result.file : null;
  }

  // An existing but unreadable file is the only copy of the user's article
  // state, so it is never overwritten; warn once per session instead.
  private warnUserStateUnreadable(): void {
    if (this.warnedUserStateUnreadable) {
      return;
    }
    this.warnedUserStateUnreadable = true;
    new Notice(
      "RSS Dashboard: user-state.json could not be read. Read, starred, and tag changes will not be saved until it is fixed or removed.",
    );
  }

  /**
   * Resolves `user-state.json` into the current `${feedId}:${guid}` keyed
   * shape, migrating a pre-#278 file (bare-GUID keys, `version: 1`) in
   * memory: every bare-GUID entry — from a legacy file's `states`, or from a
   * previous migration's leftover `unattributedLegacyStates` — is retried
   * against every feed whose shard has been successfully validated this
   * session. Because the legacy format could not distinguish feeds, a GUID
   * present in more than one validated shard is applied to each of them once,
   * reproducing the old (ambiguous) lookup; from that point each feed's copy
   * diverges independently.
   *
   * A bare-GUID entry whose feed has not hydrated yet in this session
   * matches nothing and is returned in `unattributed` instead of being
   * dropped, so it survives to be retried on a later hydrate or save once
   * that feed's items are available.
   */
  private resolvePersistedUserState(
    userState: UserStateFile | null,
    settings: RssDashboardSettings,
  ): {
    states: Record<string, ArticleUserState>;
    unattributed: Record<string, ArticleUserState>;
  } {
    if (!userState) {
      return { states: {}, unattributed: {} };
    }

    const isMigrated = userState.version >= USER_STATE_QUALIFIED_VERSION;
    const states = isMigrated ? cloneJson(userState.states) : {};
    const pendingLegacy = isMigrated
      ? cloneJson(userState.unattributedLegacyStates ?? {})
      : cloneJson(userState.states);

    const unattributed: Record<string, ArticleUserState> = {};
    for (const [guid, legacyState] of Object.entries(pendingLegacy)) {
      let matchedAny = false;
      for (const feed of settings.feeds) {
        const feedId = feed.feedId ?? "";
        const hydratedGuids = this.hydratedShardGuidsByFeedId.get(feedId);
        if (hydratedGuids?.has(guid)) {
          states[userStateKey(feedId, guid)] = cloneJson(legacyState);
          matchedAny = true;
        }
      }
      if (!matchedAny) {
        unattributed[guid] = legacyState;
      }
    }

    return { states, unattributed };
  }

  public async saveUserStateFromFeeds(settings: RssDashboardSettings): Promise<void> {
    // `user-state.json` is a durable store that gets updated, not rebuilt: an
    // item absent from memory (a feed that failed to hydrate, whose shard
    // hasn't synced yet, or whose item retention pruned) must not read as
    // intent to delete its state (issue #278). Start from what's already on
    // disk and only touch entries for items actually loaded right now.
    const existing = await this.readUserState(settings);
    this.recordUserStateHealth(existing.status);
    if (existing.status === "unreadable") {
      return;
    }
    const { states, unattributed } = this.resolvePersistedUserState(
      existing.status === "ok" ? existing.file : null,
      settings,
    );
    const missingSinceByStateKey =
      existing.status === "ok"
        ? cloneJson(existing.file.missingSinceByStateKey ?? {})
        : {};
    const unattributedFirstObservedAtByGuid =
      existing.status === "ok"
        ? cloneJson(existing.file.unattributedFirstObservedAtByGuid ?? {})
        : {};
    const now = Date.now();

    const currentFeedIds = new Set<string>();
    for (const feed of settings.feeds) {
      const feedId = feed.feedId ?? "";
      currentFeedIds.add(feedId);

      for (const item of feed.items) {
        const key = userStateKey(feedId, item.guid);
        const baseline = states[key];

        // An item this session has never synced with persisted state (it
        // arrived via a refresh after its feed missed the one
        // `hydrateSettings` pass, e.g. a shard that failed to read at
        // startup and only succeeded later) still carries default `false`
        // parser output, not a deliberate reset. Adopt the disk truth for it
        // instead of overwriting that truth with those defaults, then treat
        // it as synced from here on so a genuine later reset is trusted.
        if (!this.syncedUserStateKeys.has(key)) {
          this.syncedUserStateKeys.add(key);
          if (baseline) {
            item.read = baseline.read ?? false;
            item.starred = baseline.starred ?? false;
            item.tags = baseline.tags ? cloneJson(baseline.tags) : [];
            item.saved = baseline.saved ?? false;
            if (baseline.savedFilePath) item.savedFilePath = baseline.savedFilePath;
            if (baseline.playbackProgress) item.playbackProgress = cloneJson(baseline.playbackProgress);
            continue;
          }
        }

        const hasSignal = Boolean(
          item.read || item.starred || (item.tags && item.tags.length > 0) || item.saved || item.playbackProgress,
        );
        if (!hasSignal && !baseline) {
          continue;
        }

        const state: ArticleUserState = {
          read: Boolean(item.read),
          starred: Boolean(item.starred),
          saved: Boolean(item.saved),
        };
        if (item.tags && item.tags.length > 0) state.tags = cloneJson(item.tags);
        if (item.savedFilePath) state.savedFilePath = item.savedFilePath;
        if (item.playbackProgress) state.playbackProgress = cloneJson(item.playbackProgress);
        states[key] = state;
      }
    }

    // A feed only loses its article state when it is explicitly removed from
    // settings, never merely because it didn't hydrate this time.
    for (const key of Object.keys(states)) {
      const separatorIndex = key.indexOf(":");
      const feedId = separatorIndex === -1 ? "" : key.slice(0, separatorIndex);
      if (!currentFeedIds.has(feedId)) {
        delete states[key];
        delete missingSinceByStateKey[key];
      }
    }

    for (const key of Object.keys(states)) {
      const separatorIndex = key.indexOf(":");
      const feedId = separatorIndex === -1 ? "" : key.slice(0, separatorIndex);
      const guid = separatorIndex === -1 ? "" : key.slice(separatorIndex + 1);
      const hydratedGuids = this.hydratedShardGuidsByFeedId.get(feedId);

      // Missing or corrupt shards do not provide deletion evidence. Keep any
      // existing timestamp dormant until a later successful hydrate proves the
      // feed's current contents.
      if (!hydratedGuids) {
        continue;
      }

      if (hydratedGuids.has(guid)) {
        delete missingSinceByStateKey[key];
        continue;
      }

      let missingSince = missingSinceByStateKey[key];
      if (typeof missingSince !== "number" || !Number.isFinite(missingSince)) {
        missingSince = now;
        missingSinceByStateKey[key] = missingSince;
      }

      if (now - missingSince >= USER_STATE_GC_HORIZON_MS) {
        delete states[key];
        delete missingSinceByStateKey[key];
        storageLog("Expired missing article state", { key, missingSince });
      }
    }

    for (const guid of Object.keys(unattributedFirstObservedAtByGuid)) {
      if (!unattributed[guid]) {
        delete unattributedFirstObservedAtByGuid[guid];
      }
    }

    for (const guid of Object.keys(unattributed)) {
      let firstObservedAt = unattributedFirstObservedAtByGuid[guid];
      if (
        typeof firstObservedAt !== "number" ||
        !Number.isFinite(firstObservedAt)
      ) {
        firstObservedAt = now;
        unattributedFirstObservedAtByGuid[guid] = firstObservedAt;
      }

      if (now - firstObservedAt >= USER_STATE_GC_HORIZON_MS) {
        delete unattributed[guid];
        delete unattributedFirstObservedAtByGuid[guid];
        storageLog("Expired unattributed legacy article state", {
          guid,
          firstObservedAt,
        });
      }
    }

    // With no file on disk and nothing to record, creating an empty one would
    // only race the real file still syncing in from another device.
    if (
      existing.status === "missing" &&
      Object.keys(states).length === 0 &&
      Object.keys(unattributed).length === 0
    ) {
      return;
    }

    const userStateFile: UserStateFile = withSyncNonce({
      version: USER_STATE_KEY_VERSION,
      states,
      ...(Object.keys(unattributed).length > 0
        ? { unattributedLegacyStates: unattributed }
        : {}),
      ...(Object.keys(missingSinceByStateKey).length > 0
        ? { missingSinceByStateKey }
        : {}),
      ...(Object.keys(unattributedFirstObservedAtByGuid).length > 0
        ? { unattributedFirstObservedAtByGuid }
        : {}),
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
