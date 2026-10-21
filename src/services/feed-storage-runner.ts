import { App, Notice, TFile, TFolder } from "obsidian";
import type {
  Feed,
  FeedItem,
  FeedItemsShard,
  FeedShardHealth,
  PersistedRssDashboardSettings,
  RssDashboardSettings,
} from "../types/types";
import { comparableFromText, type OwnWriteRecord } from "./own-write-record";
import { cloneJson, withSyncNonce } from "./storage-json";
import type { UserStateStore } from "./user-state-store";
import {
  createComparableFeedShardJson,
  createFeedShard,
  dropInvalidShardItems,
  getFeedShardPath,
  isHiddenFromSync,
  normalizeFolderPath,
} from "./feed-storage-shard";

function storageLog(_message: string, _details?: unknown): void {}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

export interface PersistSettingsOptions {
  /**
   * Persist article state (read, starred, tags, saved, playback) only. This
   * scope never enumerates feeds for shards, deep-clones feed items, reads
   * shard files, or writes/deletes shards: Shard storage v2 writes its
   * article-state snapshot, Legacy JSON writes the `data.json` that holds the
   * state, and Shard storage v1 (whose state lives in shard content) writes
   * nothing.
   */
  scope?: "article-state";
  forceMetadata?: boolean;
  forceAllShards?: boolean;
  /**
   * The feed list was replaced wholesale (a bundle import or restore), so a
   * feed it drops is not a feed removal: its shard is deleted, but its
   * article state is kept on the unrecognized-feed horizon (issue #374).
   */
  replacesFeedList?: boolean;
  /** Imported article state replaces existing values, including explicit resets. */
  authoritativeArticleState?: boolean;
  /** A confirmed bundle restore invalidates prior absence evidence; rollback does not. */
  restoresArticlePresence?: boolean;
}

export interface FeedStorageHydrationResult {
  didChange: boolean;
  shardCount: number;
  userStateLoaded?: boolean;
}

export interface FeedStoragePersistResult {
  metadataSaved: boolean;
  shardWriteCount: number;
  shardDeleteCount: number;
}

interface RemovedFeedShardBaseline {
  shardPath: string;
  comparable: string;
}

/**
 * Workflow state the owning repository keeps and the runner reads and writes
 * through `host.state`. The owner may reassign any field (for example
 * `lastPersistedShardJsonByFeedId`), so the runner always reads the current
 * value off the state object rather than holding a copy.
 */
export interface FeedStorageRunnerState {
  feedShardHealthById: Map<string, FeedShardHealth>;
  /**
   * Feeds whose shard vanished on a reload while their articles were loaded
   * (renamed or deleted outside Obsidian, #1441). The articles stay in memory
   * and a save leaves the shard alone until Repair/rebuild storage writes it.
   */
  retainedMissingFeedIds: Set<string>;
  hydratedShardGuidsByFeedId: Map<string, Set<string>>;
  lastPersistedShardJsonByFeedId: Map<string, string>;
  ownWrites: OwnWriteRecord;
  /**
   * Shards this device last wrote or read for feeds that an arriving
   * `data.json` removed, with the comparable content seen (#1444, #1422). Hydration only
   * records; the next shard-writing save deletes a shard still equal to its
   * baseline. In memory and session-scoped on purpose: an orphan that outlives
   * a restart belongs to the storage health check (#318).
   */
  removedFeedShardBaselines: Map<string, RemovedFeedShardBaseline>;
  lastPersistedMetadataJson: string | null;
  lastStorageFolderPath: string | null;
  shardFolderHiddenFromSync: boolean;
}

/**
 * Collaborators and state the moved code needs, supplied by the owning
 * repository. The runner never reaches for `this`; every read and write goes
 * through this host.
 */
export interface FeedStorageRunnerHost {
  app: App;
  userState: UserStateStore;
  state: FeedStorageRunnerState;
  ensureFeedIds(settings: RssDashboardSettings): boolean;
  capturePersistedState(settings: RssDashboardSettings): void;
  hasNothingToRebuild(feed: Feed & { feedId: string }): boolean;
  removeShardFile(shardPath: string): Promise<boolean>;
  removeFolderIfEmpty(folderPath: string): Promise<boolean>;
  pruneEmptyParentFolders(folderPath: string): Promise<void>;
  createPersistedSettings(
    settings: RssDashboardSettings,
  ): PersistedRssDashboardSettings;
}

function isShardBackedMode(mode: RssDashboardSettings["storageMode"]): boolean {
  return mode === "vault-shards" || mode === "vault-shards-v2";
}

// ── Hydration ────────────────────────────────────────────────────────────────

/**
 * Loads every feed's articles from its shard, recording missing/corrupt shard
 * health, and applies Shard storage v2 article state from user-state.json.
 * Extracted from `FeedStorageRepository.hydrateSettings`.
 */
export async function hydrateFeedStorage(
  settings: RssDashboardSettings,
  host: FeedStorageRunnerHost,
  loadedItemsByFeedId: ReadonlyMap<string, FeedItem[]> = new Map(),
): Promise<FeedStorageHydrationResult> {
  storageLog("Hydrating settings", {
    mode: settings.storageMode,
    folder: normalizeFolderPath(settings.storageFolder),
    feedCount: settings.feeds.length,
  });
  const didAssignFeedIds = host.ensureFeedIds(settings);
  let shardCount = 0;

  host.state.shardFolderHiddenFromSync = false;
  if (!isShardBackedMode(settings.storageMode)) {
    host.state.feedShardHealthById.clear();
    host.state.retainedMissingFeedIds.clear();
    host.state.hydratedShardGuidsByFeedId.clear();
    host.state.ownWrites.forgetShardsIn(settings.storageFolder);
    host.state.removedFeedShardBaselines.clear();
    storageLog("Skipping shard hydration because legacy JSON mode is active");
    host.capturePersistedState(settings);
    return { didChange: didAssignFeedIds, shardCount };
  }

  // Read before the maps below are cleared and replaced: a feed that left
  // the list is forgotten there, and its baseline with it.
  const previousFeedIds = [...host.state.lastPersistedShardJsonByFeedId.keys()];

  const feedsById = new Map<string, Feed>();
  host.state.feedShardHealthById.clear();
  host.state.retainedMissingFeedIds.clear();
  host.state.hydratedShardGuidsByFeedId.clear();
  for (const feed of settings.feeds) {
    if (feed.feedId) {
      feedsById.set(feed.feedId, feed);
    }
  }

  // Shard storage v2 only: v1 is deprecated and gets no new write logic.
  if (settings.storageMode === "vault-shards-v2") {
    recordRemovedFeedShards(settings, host, feedsById, previousFeedIds);
  } else {
    host.state.removedFeedShardBaselines.clear();
  }
  // The baselines above read the record, so hydration clears it only now.
  host.state.ownWrites.forgetShardsIn(settings.storageFolder);

  const {
    shardCount: hydratedShardCount,
    repairedFeedIds,
    didDropInvalidItems,
  } = await hydrateFeedShards(settings, host, loadedItemsByFeedId);
  shardCount = hydratedShardCount;

  host.state.shardFolderHiddenFromSync = computeShardFolderHiddenFromSync(
    settings,
    host.state.feedShardHealthById,
  );

  storageLog("Completed shard hydration", {
    didAssignFeedIds,
    shardCount,
  });

  let userStateLoaded = false;
  if (settings.storageMode === "vault-shards-v2") {
    userStateLoaded = await host.userState.applyToFeeds(settings);
  }

  host.capturePersistedState(settings);
  // The on-disk shard still holds the dropped entries; leave its baseline
  // empty so the next save sees a difference and rewrites it.
  for (const feedId of repairedFeedIds) {
    host.state.lastPersistedShardJsonByFeedId.delete(feedId);
  }
  return {
    didChange: didAssignFeedIds || didDropInvalidItems,
    shardCount,
    userStateLoaded,
  };
}

/**
 * Notes the shard of each feed an arriving feed list dropped, with the
 * comparable content the Own write record holds for it (what this device last
 * wrote or read), so a later save can tell an untouched shard
 * from one another device changed. Deletes nothing.
 */
function recordRemovedFeedShards(
  settings: RssDashboardSettings,
  host: FeedStorageRunnerHost,
  feedsById: ReadonlyMap<string, Feed>,
  previousFeedIds: readonly string[],
): void {
  const baselines = host.state.removedFeedShardBaselines;
  for (const feedId of feedsById.keys()) {
    baselines.delete(feedId);
  }
  for (const feedId of previousFeedIds) {
    if (feedsById.has(feedId)) {
      continue;
    }
    const shardPath = getFeedShardPath(settings.storageFolder, feedId);
    const comparable = host.state.ownWrites.comparableOf(shardPath);
    if (comparable !== undefined) {
      baselines.set(feedId, { shardPath, comparable });
    }
  }
}

interface HydratedShardResult {
  hydrated: boolean;
  droppedCount: number;
}

async function hydrateFeedShards(
  settings: RssDashboardSettings,
  host: FeedStorageRunnerHost,
  loadedItemsByFeedId: ReadonlyMap<string, FeedItem[]>,
): Promise<{
  shardCount: number;
  repairedFeedIds: Set<string>;
  didDropInvalidItems: boolean;
}> {
  let shardCount = 0;
  let didDropInvalidItems = false;
  const repairedFeedIds = new Set<string>();
  for (const feed of settings.feeds) {
    const result = await hydrateFeedShard(
      feed,
      settings,
      host,
      loadedItemsByFeedId,
    );
    if (result.hydrated) {
      shardCount += 1;
    }
    if (noteDroppedShardItems(feed, result.droppedCount, repairedFeedIds)) {
      didDropInvalidItems = true;
    }
  }
  return { shardCount, repairedFeedIds, didDropInvalidItems };
}

async function hydrateFeedShard(
  feed: Feed,
  settings: RssDashboardSettings,
  host: FeedStorageRunnerHost,
  loadedItemsByFeedId: ReadonlyMap<string, FeedItem[]>,
): Promise<HydratedShardResult> {
  if (feed.feedId) {
    host.state.hydratedShardGuidsByFeedId.delete(feed.feedId);
  }
  const shardPath = getFeedShardPath(settings.storageFolder, feed.feedId ?? "");
  const shardExists = await host.app.vault.adapter.exists(shardPath);
  if (!shardExists) {
    host.state.ownWrites.forget(shardPath);
    if (feed.feedId) host.state.feedShardHealthById.set(feed.feedId, "missing");
    // A reload that loses the shard keeps the articles already on screen.
    const loadedItems = feed.feedId
      ? loadedItemsByFeedId.get(feed.feedId)
      : undefined;
    if (feed.feedId && loadedItems && loadedItems.length > 0) {
      feed.items = loadedItems;
      host.state.retainedMissingFeedIds.add(feed.feedId);
    }
    storageLog("Shard file not found during hydration", {
      feedId: feed.feedId,
      title: feed.title,
      shardPath,
    });
    return { hydrated: false, droppedCount: 0 };
  }

  try {
    const raw = await host.app.vault.adapter.read(shardPath);
    const parsed = JSON.parse(raw) as Partial<FeedItemsShard>;
    if (
      !parsed ||
      parsed.feedId !== feed.feedId ||
      !Array.isArray(parsed.items)
    ) {
      throw new Error("Invalid shard data");
    }

    // A hand-edited or damaged shard can hold nullish entries; drop them
    // before any `.guid` access and report the repair so the load saves it.
    const validItems = dropInvalidShardItems(parsed.items);
    const droppedCount = parsed.items.length - validItems.length;
    feed.items = validItems;
    if (feed.feedId) {
      host.state.feedShardHealthById.delete(feed.feedId);
      host.state.hydratedShardGuidsByFeedId.set(
        feed.feedId,
        new Set(feed.items.map((item) => item.guid)),
      );
    }
    host.state.ownWrites.recordRead(shardPath, raw);
    storageLog("Hydrated feed from shard", {
      feedId: feed.feedId,
      title: feed.title,
      shardPath,
      itemCount: feed.items.length,
    });
    return { hydrated: true, droppedCount };
  } catch (error) {
    host.state.ownWrites.forget(shardPath);
    if (feed.feedId) host.state.feedShardHealthById.set(feed.feedId, "corrupt");
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
    return { hydrated: false, droppedCount: 0 };
  }
}

/** Logs and records a shard repair; returns whether anything was dropped. */
function noteDroppedShardItems(
  feed: Feed,
  droppedCount: number,
  repairedFeedIds: Set<string>,
): boolean {
  if (droppedCount === 0) return false;
  if (feed.feedId) repairedFeedIds.add(feed.feedId);
  storageLog("Dropped invalid items from feed shard", {
    feedId: feed.feedId,
    title: feed.title,
    droppedCount,
  });
  return true;
}

function computeShardFolderHiddenFromSync(
  settings: RssDashboardSettings,
  feedShardHealthById: Map<string, FeedShardHealth>,
): boolean {
  const feedsWithIds = settings.feeds.filter((feed) => Boolean(feed.feedId));
  return (
    feedsWithIds.length > 0 &&
    isHiddenFromSync(settings.storageFolder) &&
    feedsWithIds.every(
      (feed) => feedShardHealthById.get(feed.feedId ?? "") === "missing",
    )
  );
}

// ── Persistence ──────────────────────────────────────────────────────────────

/**
 * Writes changed feed shards, deletes removed feeds' shards, saves the shard
 * metadata, and (in Shard storage v2) saves user-state.json. Extracted from
 * `FeedStorageRepository.persistSettings`.
 */
export async function persistFeedStorage(
  settings: RssDashboardSettings,
  saveData: (data: unknown) => Promise<void>,
  options: PersistSettingsOptions,
  host: FeedStorageRunnerHost,
): Promise<FeedStoragePersistResult> {
  host.ensureFeedIds(settings);
  if (options.scope === "article-state") {
    return persistArticleState(settings, saveData, host);
  }
  storageLog("Persisting settings", {
    mode: settings.storageMode,
    folder: normalizeFolderPath(settings.storageFolder),
    feedCount: settings.feeds.length,
    forceMetadata: Boolean(options.forceMetadata),
    forceAllShards: Boolean(options.forceAllShards),
  });

  if (!isShardBackedMode(settings.storageMode)) {
    await saveData(withSyncNonce(cloneJson(settings)));
    storageLog("Saved full settings to legacy data.json");
    host.capturePersistedState(settings);
    return {
      metadataSaved: true,
      shardWriteCount: 0,
      shardDeleteCount: 0,
    };
  }

  const normalizedStorageFolder = normalizeFolderPath(settings.storageFolder);
  const storageFolderChanged =
    host.state.lastStorageFolderPath !== null &&
    host.state.lastStorageFolderPath !== normalizedStorageFolder;
  const forceAllShards = Boolean(
    options.forceAllShards || storageFolderChanged,
  );

  if (storageFolderChanged) {
    storageLog("Storage folder changed; forcing shard rewrite", {
      previousFolder: host.state.lastStorageFolderPath,
      nextFolder: normalizedStorageFolder,
    });
  }

  await ensureStorageFolderExists(host.app, normalizedStorageFolder);

  const { shardWriteCount, currentFeedIds } = await writeFeedShards(
    settings,
    normalizedStorageFolder,
    forceAllShards,
    storageFolderChanged,
    host,
  );

  if (storageFolderChanged && host.state.lastStorageFolderPath) {
    // Once every shard has moved out, drop the emptied folder and any
    // parent the move left empty.
    if (await host.removeFolderIfEmpty(host.state.lastStorageFolderPath)) {
      await host.pruneEmptyParentFolders(host.state.lastStorageFolderPath);
    }
  }

  let shardDeleteCount = await deleteRemovedFeedShards(
    normalizedStorageFolder,
    currentFeedIds,
    Boolean(options.replacesFeedList),
    host,
  );
  shardDeleteCount += await deleteOrphanShardsOnRemovalArrival(
    currentFeedIds,
    host,
  );

  const persistedSettings = host.createPersistedSettings(settings);
  const metadataJson = JSON.stringify(persistedSettings, null, 2);
  const shouldSaveMetadata =
    options.forceMetadata ||
    host.state.lastPersistedMetadataJson !== metadataJson;

  if (shouldSaveMetadata) {
    await saveData(withSyncNonce(persistedSettings));
    host.state.lastPersistedMetadataJson = metadataJson;
    storageLog("Saved shard metadata to data.json", {
      feedCount: persistedSettings.feeds.length,
    });
  }

  if (settings.storageMode === "vault-shards-v2") {
    await host.userState.save(settings, {
      authoritativeLoadedState: options.authoritativeArticleState,
      restoresArticlePresence: options.restoresArticlePresence,
    });
  }

  host.state.lastStorageFolderPath = normalizedStorageFolder;
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

/**
 * Writes only the snapshot that holds article state. Shard-backed feeds are
 * not visited at all, so a read, star, tag, saved, or playback change does not
 * wait on feed content (issue #1384).
 */
async function persistArticleState(
  settings: RssDashboardSettings,
  saveData: (data: unknown) => Promise<void>,
  host: FeedStorageRunnerHost,
): Promise<FeedStoragePersistResult> {
  if (settings.storageMode === "vault-shards-v2") {
    await host.userState.save(settings);
    storageLog("Saved article state to user-state.json");
    return { metadataSaved: false, shardWriteCount: 0, shardDeleteCount: 0 };
  }

  if (!isShardBackedMode(settings.storageMode)) {
    // Legacy JSON keeps article state inside the settings snapshot itself.
    await saveData(withSyncNonce(cloneJson(settings)));
    host.capturePersistedState(settings);
    storageLog("Saved article state to legacy data.json");
    return { metadataSaved: true, shardWriteCount: 0, shardDeleteCount: 0 };
  }

  // Shard storage v1 keeps article state inside shard content, which this
  // scope must not write. Nothing to persist; the caller decides whether a
  // full save is needed for that mode.
  storageLog("Skipped article-state-only write in shard storage v1");
  return { metadataSaved: false, shardWriteCount: 0, shardDeleteCount: 0 };
}

interface FeedShardWriteContext {
  storageFolder: string;
  forceAllShards: boolean;
  storageFolderChanged: boolean;
  isV2: boolean;
}

async function writeFeedShards(
  settings: RssDashboardSettings,
  normalizedStorageFolder: string,
  forceAllShards: boolean,
  storageFolderChanged: boolean,
  host: FeedStorageRunnerHost,
): Promise<{ shardWriteCount: number; currentFeedIds: Set<string> }> {
  let shardWriteCount = 0;
  const currentFeedIds = new Set<string>();
  const isV2 = settings.storageMode === "vault-shards-v2";
  for (const feed of settings.feeds) {
    if (!feed.feedId) {
      continue;
    }

    currentFeedIds.add(feed.feedId);
    const wroteShard = await writeFeedShard(
      feed as Feed & { feedId: string },
      {
        storageFolder: normalizedStorageFolder,
        forceAllShards,
        storageFolderChanged,
        isV2,
      },
      host,
    );
    if (wroteShard) {
      shardWriteCount += 1;
    }
  }
  return { shardWriteCount, currentFeedIds };
}

async function writeFeedShard(
  feed: Feed & { feedId: string },
  context: FeedShardWriteContext,
  host: FeedStorageRunnerHost,
): Promise<boolean> {
  // Also leaves the shard in a previous storage folder in place: it may
  // be the only copy of this feed's articles.
  if (host.hasNothingToRebuild(feed)) {
    storageLog("Skipped writing empty shard for unloaded feed", {
      feedId: feed.feedId,
      title: feed.title,
    });
    return false;
  }

  // Only a full rewrite (Repair/rebuild storage) recreates a shard that
  // vanished while its articles were loaded: it may be a rename in flight.
  if (
    host.state.retainedMissingFeedIds.has(feed.feedId) &&
    !context.forceAllShards
  ) {
    storageLog("Skipped writing shard for feed whose shard went missing", {
      feedId: feed.feedId,
      title: feed.title,
    });
    return false;
  }

  const shard = createFeedShard(feed, context.isV2);
  const shardJson = JSON.stringify(shard, null, 2);
  const currentComparableJson = createComparableFeedShardJson(
    feed,
    context.isV2,
  );
  const previousJson = host.state.lastPersistedShardJsonByFeedId.get(
    feed.feedId,
  );

  const shardPath = getFeedShardPath(context.storageFolder, feed.feedId);
  const shardWriteDecision = await getShardWriteDecision(
    host.app,
    shardPath,
    context.forceAllShards || previousJson !== currentComparableJson,
    feed.feedId,
  );

  if (shardWriteDecision.needsWrite) {
    const rollbackOwnWrite = host.state.ownWrites.recordPendingWrite(
      shardPath,
      shardJson,
    );
    try {
      await host.app.vault.adapter.write(shardPath, shardJson);
    } catch (error) {
      rollbackOwnWrite();
      throw error;
    }
    host.state.lastPersistedShardJsonByFeedId.set(
      feed.feedId,
      currentComparableJson,
    );
    const recoveredHealth =
      shardWriteDecision.recoveredHealth ??
      host.state.feedShardHealthById.get(feed.feedId);
    host.state.retainedMissingFeedIds.delete(feed.feedId);
    if (recoveredHealth === "missing" || recoveredHealth === "corrupt") {
      host.state.feedShardHealthById.set(feed.feedId, "rebuilt");
      // A feed has articles again, so the folder is no longer wholly
      // unsynced; per-feed warnings cover the feeds still missing.
      host.state.shardFolderHiddenFromSync = false;
    }
    storageLog("Wrote feed shard", {
      feedId: feed.feedId,
      title: feed.title,
      shardPath,
      itemCount: feed.items.length,
    });
  }

  if (context.storageFolderChanged && host.state.lastStorageFolderPath) {
    const previousShardPath = getFeedShardPath(
      host.state.lastStorageFolderPath,
      feed.feedId,
    );
    if (await host.removeShardFile(previousShardPath)) {
      storageLog("Deleted shard from previous storage folder", {
        feedId: feed.feedId,
        previousShardPath,
      });
    }
  }

  return shardWriteDecision.needsWrite;
}

async function deleteRemovedFeedShards(
  normalizedStorageFolder: string,
  currentFeedIds: Set<string>,
  replacesFeedList: boolean,
  host: FeedStorageRunnerHost,
): Promise<number> {
  let shardDeleteCount = 0;
  for (const previousFeedId of [
    ...host.state.lastPersistedShardJsonByFeedId.keys(),
  ]) {
    if (currentFeedIds.has(previousFeedId)) {
      continue;
    }

    const shardPath = getFeedShardPath(normalizedStorageFolder, previousFeedId);
    if (await host.removeShardFile(shardPath)) {
      storageLog("Deleted shard for removed feed", {
        feedId: previousFeedId,
        shardPath,
      });
    }
    host.state.lastPersistedShardJsonByFeedId.delete(previousFeedId);
    host.state.ownWrites.forget(shardPath);
    if (!replacesFeedList) {
      host.userState.markFeedRemoved(previousFeedId);
    }
    shardDeleteCount += 1;
  }
  return shardDeleteCount;
}

/**
 * Removal-arrival cleanup (#1444): deletes the shard of a feed that an
 * arriving `data.json` removed, but only while the file still holds exactly
 * what this device last wrote or read. A changed, missing, or unreadable file
 * is left alone; it is an unrecognized shard for the health check (#318).
 */
async function deleteOrphanShardsOnRemovalArrival(
  currentFeedIds: ReadonlySet<string>,
  host: FeedStorageRunnerHost,
): Promise<number> {
  let shardDeleteCount = 0;
  const baselines = host.state.removedFeedShardBaselines;
  for (const [feedId, baseline] of [...baselines]) {
    baselines.delete(feedId);
    if (currentFeedIds.has(feedId)) {
      continue;
    }
    try {
      if (!(await host.app.vault.adapter.exists(baseline.shardPath))) {
        continue;
      }
      const raw = await host.app.vault.adapter.read(baseline.shardPath);
      if (comparableFromText(raw) !== baseline.comparable) {
        storageLog("Kept changed shard for removed feed", { feedId });
        continue;
      }
      if (await host.removeShardFile(baseline.shardPath)) {
        host.state.lastPersistedShardJsonByFeedId.delete(feedId);
        shardDeleteCount += 1;
      }
    } catch (error) {
      storageLog("Could not clean up shard for removed feed", {
        feedId,
        error,
      });
    }
  }
  return shardDeleteCount;
}

async function ensureStorageFolderExists(
  app: App,
  storageFolder: string,
): Promise<void> {
  const normalizedFolder = normalizeFolderPath(storageFolder);
  if (!normalizedFolder) {
    return;
  }

  const existing = app.vault.getAbstractFileByPath(normalizedFolder);
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
    await app.vault.createFolder(normalizedFolder);
  } catch (error) {
    const resolved = app.vault.getAbstractFileByPath(normalizedFolder);
    if (resolved instanceof TFolder) {
      storageLog("Storage folder became available after createFolder error", {
        folder: normalizedFolder,
      });
      return;
    }

    if (await app.vault.adapter.exists(normalizedFolder)) {
      storageLog("Storage folder exists on adapter after createFolder error", {
        folder: normalizedFolder,
      });
      return;
    }

    throw error;
  }

  const created = app.vault.getAbstractFileByPath(normalizedFolder);
  if (!(created instanceof TFolder)) {
    if (await app.vault.adapter.exists(normalizedFolder)) {
      storageLog("Storage folder exists on adapter after creation", {
        folder: normalizedFolder,
      });
      return;
    }

    throw new Error(`Failed to create storage folder: ${normalizedFolder}`);
  }

  storageLog("Created storage folder", { folder: normalizedFolder });
}

async function getShardWriteDecision(
  app: App,
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

  if (!(await app.vault.adapter.exists(shardPath))) {
    return { needsWrite: true, recoveredHealth: "missing" };
  }

  try {
    const parsed = JSON.parse(await app.vault.adapter.read(shardPath)) as {
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
