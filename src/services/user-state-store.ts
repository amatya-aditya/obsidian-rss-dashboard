import { App, Notice, normalizePath } from "obsidian";
import type {
  FeedItem,
  ArticleUserState,
  RssDashboardSettings,
  UserStateFile,
} from "../types/types";
import { cloneJson, withSyncNonce } from "./storage-json";

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

function feedIdOfStateKey(key: string): string {
  const separatorIndex = key.indexOf(":");
  return separatorIndex === -1 ? "" : key.slice(0, separatorIndex);
}

/**
 * Copies a persisted entry's article state onto a loaded item. Used both when
 * hydrating and when adopting disk state for an item that missed hydration.
 */
function applyPersistedState(item: FeedItem, state: ArticleUserState): void {
  item.read = state.read ?? false;
  item.starred = state.starred ?? false;
  item.tags = state.tags ? cloneJson(state.tags) : [];
  item.saved = state.saved ?? false;
  if (state.savedFilePath) item.savedFilePath = state.savedFilePath;
  if (state.playbackProgress) item.playbackProgress = cloneJson(state.playbackProgress);
}

function storageLog(_message: string, _details?: unknown): void {}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

export interface UserStateStoreOptions {
  writeWrapper?: <T>(fn: () => Promise<T>) => Promise<T>;
  onUserStateHealthChange?: () => void;
  /**
   * Feed IDs whose shard was successfully read and structurally validated in
   * this plugin session, with the GUIDs present in that validated read. Owned
   * and filled by the repository's shard hydration (issue #315).
   */
  hydratedShardGuidsByFeedId: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Article state (read, starred, tags, saved, playback position) kept in
 * `user-state.json` by Shard storage v2.
 */
export class UserStateStore {
  private hydratedShardGuidsByFeedId: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Feed IDs this device removed this session (a feed it loaded or persisted
   * that has since left its feed list) whose article state has not yet been
   * removed by a successful `user-state.json` save. Only these lose their
   * state immediately; any other feed missing from the list may exist on
   * another device (issue #374). Held in memory only.
   */
  private pendingFeedRemovals = new Set<string>();
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

  constructor(app: App, options: UserStateStoreOptions) {
    this.app = app;
    this.writeWrapper = options.writeWrapper;
    this.onUserStateHealthChange = options.onUserStateHealthChange;
    this.hydratedShardGuidsByFeedId = options.hydratedShardGuidsByFeedId;
  }

  public isUnreadable(): boolean {
    return this.userStateUnreadable;
  }

  /** Forgets a feed's article state on the next save (issue #374). */
  public markFeedRemoved(feedId: string): void {
    this.pendingFeedRemovals.add(feedId);
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

  /**
   * Applies persisted article state to every loaded item, resetting items
   * with none, and reports whether `user-state.json` was loaded.
   */
  public async applyToFeeds(settings: RssDashboardSettings): Promise<boolean> {
    const userStateResult = await this.readUserState(settings);
    this.recordUserStateHealth(userStateResult.status);
    const userState =
      userStateResult.status === "ok" ? userStateResult.file : null;
    const userStateLoaded = Boolean(userState);
    const { states: resolvedStates } = this.resolvePersistedUserState(userState, settings);
    for (const feed of settings.feeds) {
      const feedId = feed.feedId ?? "";
      for (const item of feed.items) {
        const state = resolvedStates[userStateKey(feedId, item.guid)];
        if (state) {
          applyPersistedState(item, state);
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
    return userStateLoaded;
  }

  private getMetadataFolder(settings: RssDashboardSettings): string {
    const folder = settings.metadataStorageFolder.trim() || ".rss-dashboard-data";
    return folder.replace(/^\/+|\/+$/g, "");
  }

  private getUserStatePath(settings: RssDashboardSettings): string {
    return normalizePath(`${this.getMetadataFolder(settings)}/user-state.json`);
  }

  /**
   * Path of a `user-state.json` left behind by a previous Shard storage v2
   * setup, or null when none applies.
   *
   * Only v2 reads that file, so in any other mode it is inert while still
   * holding a full copy of article state. It is surfaced rather than deleted
   * because after a revert it is the only standalone copy of that state.
   */
  public async findOrphaned(
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

  public async load(settings: RssDashboardSettings): Promise<UserStateFile | null> {
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

  public async save(settings: RssDashboardSettings): Promise<void> {
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
    const unrecognizedFeedSinceByFeedId =
      existing.status === "ok"
        ? cloneJson(existing.file.unrecognizedFeedSinceByFeedId ?? {})
        : {};
    const now = Date.now();

    const currentFeedIds = this.mergeLoadedItems(settings, states);

    const { settleRemovals, stateKeysByUnrecognizedFeedId } =
      this.applyFeedRemovals(states, missingSinceByStateKey, currentFeedIds);

    this.expireUnrecognizedFeeds(
      states,
      missingSinceByStateKey,
      unrecognizedFeedSinceByFeedId,
      stateKeysByUnrecognizedFeedId,
      now,
    );

    this.expireMissingArticles(
      states,
      missingSinceByStateKey,
      currentFeedIds,
      now,
    );

    this.expireUnattributedLegacy(
      unattributed,
      unattributedFirstObservedAtByGuid,
      now,
    );

    // With no file on disk and nothing to record, creating an empty one would
    // only race the real file still syncing in from another device.
    if (
      existing.status === "missing" &&
      Object.keys(states).length === 0 &&
      Object.keys(unattributed).length === 0
    ) {
      settleRemovals();
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
      ...(Object.keys(unrecognizedFeedSinceByFeedId).length > 0
        ? { unrecognizedFeedSinceByFeedId }
        : {}),
    });

    await this.writeUserState(settings, userStateFile);
    settleRemovals();
    storageLog("Saved user-state.json with " + Object.keys(states).length + " entries.");
  }

  private mergeLoadedItems(
    settings: RssDashboardSettings,
    states: Record<string, ArticleUserState>,
  ): Set<string> {
    const currentFeedIds = new Set<string>();
    for (const feed of settings.feeds) {
      const feedId = feed.feedId ?? "";
      currentFeedIds.add(feedId);

      for (const item of feed.items) {
        this.mergeLoadedItem(userStateKey(feedId, item.guid), item, states);
      }
    }
    return currentFeedIds;
  }

  private mergeLoadedItem(
    key: string,
    item: FeedItem,
    states: Record<string, ArticleUserState>,
  ): void {
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
        applyPersistedState(item, baseline);
        return;
      }
    }

    const hasSignal = Boolean(
      item.read || item.starred || (item.tags && item.tags.length > 0) || item.saved || item.playbackProgress,
    );
    if (!hasSignal && !baseline) {
      return;
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

  private applyFeedRemovals(
    states: Record<string, ArticleUserState>,
    missingSinceByStateKey: Record<string, number>,
    currentFeedIds: Set<string>,
  ): {
    settleRemovals: () => void;
    stateKeysByUnrecognizedFeedId: Map<string, string[]>;
  } {
    // A feed loses its article state immediately only when this device removed
    // it. A feed merely absent from this device's list may still be listed on
    // another device sharing this file (issue #374).
    const consideredRemovals = [...this.pendingFeedRemovals];
    const removedFeedIds = new Set(
      consideredRemovals.filter((feedId) => !currentFeedIds.has(feedId)),
    );
    const settleRemovals = () => {
      for (const feedId of consideredRemovals) {
        this.pendingFeedRemovals.delete(feedId);
      }
    };
    // Any other feed missing from this device's list keeps its state for the
    // same horizon as a missing article, so a device that has not received
    // the feed yet, or restored an older list, cannot erase it.
    const stateKeysByUnrecognizedFeedId = new Map<string, string[]>();
    for (const key of Object.keys(states)) {
      const feedId = feedIdOfStateKey(key);
      if (removedFeedIds.has(feedId)) {
        delete states[key];
        delete missingSinceByStateKey[key];
        continue;
      }
      if (currentFeedIds.has(feedId)) {
        continue;
      }
      const keys = stateKeysByUnrecognizedFeedId.get(feedId) ?? [];
      keys.push(key);
      stateKeysByUnrecognizedFeedId.set(feedId, keys);
    }
    return { settleRemovals, stateKeysByUnrecognizedFeedId };
  }

  private expireUnrecognizedFeeds(
    states: Record<string, ArticleUserState>,
    missingSinceByStateKey: Record<string, number>,
    unrecognizedFeedSinceByFeedId: Record<string, number>,
    stateKeysByUnrecognizedFeedId: Map<string, string[]>,
    now: number,
  ): void {
    for (const feedId of Object.keys(unrecognizedFeedSinceByFeedId)) {
      if (!stateKeysByUnrecognizedFeedId.has(feedId)) {
        delete unrecognizedFeedSinceByFeedId[feedId];
      }
    }

    for (const [feedId, keys] of stateKeysByUnrecognizedFeedId) {
      let unrecognizedSince = unrecognizedFeedSinceByFeedId[feedId];
      if (
        typeof unrecognizedSince !== "number" ||
        !Number.isFinite(unrecognizedSince)
      ) {
        unrecognizedSince = now;
        unrecognizedFeedSinceByFeedId[feedId] = unrecognizedSince;
      }

      if (now - unrecognizedSince >= USER_STATE_GC_HORIZON_MS) {
        for (const key of keys) {
          delete states[key];
          delete missingSinceByStateKey[key];
        }
        delete unrecognizedFeedSinceByFeedId[feedId];
        storageLog("Expired unrecognized feed state", {
          feedId,
          unrecognizedSince,
        });
      }
    }
  }

  private expireMissingArticles(
    states: Record<string, ArticleUserState>,
    missingSinceByStateKey: Record<string, number>,
    currentFeedIds: Set<string>,
    now: number,
  ): void {
    for (const key of Object.keys(states)) {
      const separatorIndex = key.indexOf(":");
      const feedId = separatorIndex === -1 ? "" : key.slice(0, separatorIndex);
      const guid = separatorIndex === -1 ? "" : key.slice(separatorIndex + 1);
      const hydratedGuids = this.hydratedShardGuidsByFeedId.get(feedId);

      // Missing or corrupt shards do not provide deletion evidence. Keep any
      // existing timestamp dormant until a later successful hydrate proves the
      // feed's current contents. An unrecognized feed's state follows the
      // feed-level horizon above instead.
      if (!hydratedGuids || !currentFeedIds.has(feedId)) {
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
  }

  private expireUnattributedLegacy(
    unattributed: Record<string, ArticleUserState>,
    unattributedFirstObservedAtByGuid: Record<string, number>,
    now: number,
  ): void {
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
  }

  private async writeUserState(
    settings: RssDashboardSettings,
    userStateFile: UserStateFile,
  ): Promise<void> {
    const path = this.getUserStatePath(settings);

    // Ensure metadata folder exists
    const normalizedFolder = normalizePath(this.getMetadataFolder(settings));
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
  }
}
