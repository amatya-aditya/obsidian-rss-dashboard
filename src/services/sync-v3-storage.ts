import { App, normalizePath } from "obsidian";
import type {
  ArticleUserState,
  Feed,
  Folder,
  HybridLogicalClock,
  PersistedFeedConfig,
  RssDashboardSettings,
  SyncV3ArticleState,
  SyncV3ConfigLog,
  SyncV3ConfigOperation,
  SyncV3Epoch,
  SyncV3StateBucket,
  SyncV3StateValue,
  SyncV3Status,
} from "../types/types";

const VERSION = 3 as const;
const DEVICE_ID_KEY = "rss-dashboard-sync-v3-device-id";
const CLOCK_KEY = "rss-dashboard-sync-v3-clock";
const ROOT = "rss-dashboard-data/sync-v3";
const CACHE_ROOT = ".rss-dashboard-cache-v3";
const STATE_FIELDS: (keyof ArticleUserState)[] = [
  "read",
  "starred",
  "tags",
  "saved",
  "savedFilePath",
  "playbackProgress",
];

interface Adapter {
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
}

interface LocalStorageApp {
  loadLocalStorage(key: string): unknown;
  saveLocalStorage(key: string, value: unknown): void;
}

interface CachedProjection {
  version: 3;
  settings: RssDashboardSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalized(path: string): string {
  return normalizePath(path.replace(/^\/+|\/+$/g, ""));
}

function isClock(value: unknown): value is HybridLogicalClock {
  return (
    isRecord(value) &&
    typeof value.wallTime === "number" &&
    typeof value.counter === "number" &&
    typeof value.deviceId === "string"
  );
}

export function compareSyncV3Clocks(
  left: HybridLogicalClock,
  right: HybridLogicalClock,
): number {
  if (left.wallTime !== right.wallTime) return left.wallTime - right.wallTime;
  if (left.counter !== right.counter) return left.counter - right.counter;
  return left.deviceId.localeCompare(right.deviceId);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createId(prefix: string): string {
  const uuid = activeWindow.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getAdapter(app: App): Adapter {
  return app.vault.adapter as unknown as Adapter;
}

function getLocalStorage(app: App): LocalStorageApp {
  return app as unknown as LocalStorageApp;
}

function toPersistedFeed(feed: Feed): PersistedFeedConfig {
  const {
    items: _items,
    lastUpdated: _lastUpdated,
    lastRefreshDiagnostics: _lastRefreshDiagnostics,
    lastFetchError: _lastFetchError,
    scanInterval: _scanInterval,
    excludeFromRefresh: _excludeFromRefresh,
    ...config
  } = cloneJson(feed);
  return { ...config, feedId: feed.feedId ?? "", lastUpdated: 0 };
}

function articleKey(feed: Feed, item: Feed["items"][number]): string {
  const identity = item.guid.trim() || item.link.trim();
  return `${feed.feedId ?? "unidentified"}:${identity}`;
}

function stateFromItem(item: Feed["items"][number]): ArticleUserState {
  return {
    read: item.read ?? false,
    starred: item.starred ?? false,
    tags: cloneJson(item.tags ?? []),
    saved: item.saved ?? false,
    savedFilePath: item.savedFilePath,
    playbackProgress: item.playbackProgress
      ? cloneJson(item.playbackProgress)
      : undefined,
  };
}

function stateValueEqual(left: unknown, right: unknown): boolean {
  return sameJson(left ?? null, right ?? null);
}

function stateBucketFor(articleStateKey: string): string {
  let hash = 0;
  for (let index = 0; index < articleStateKey.length; index += 1) {
    hash = (hash * 31 + articleStateKey.charCodeAt(index)) >>> 0;
  }
  return (hash % 16).toString(16);
}

function operationFeedId(operation: SyncV3ConfigOperation): string | null {
  if (operation.type === "upsert-feed") return operation.feed?.feedId ?? null;
  if (operation.type === "remove-feed") return operation.feedId ?? null;
  return null;
}

function isEpoch(value: unknown): value is SyncV3Epoch {
  return (
    isRecord(value) &&
    value.version === VERSION &&
    typeof value.epochId === "string" &&
    typeof value.primaryDeviceId === "string" &&
    typeof value.createdAt === "number"
  );
}

function isConfigLog(value: unknown): value is SyncV3ConfigLog {
  return (
    isRecord(value) &&
    value.version === VERSION &&
    typeof value.epochId === "string" &&
    typeof value.deviceId === "string" &&
    typeof value.revision === "number" &&
    Array.isArray(value.operations)
  );
}

function isStateBucket(value: unknown): value is SyncV3StateBucket {
  return (
    isRecord(value) &&
    value.version === VERSION &&
    typeof value.epochId === "string" &&
    typeof value.deviceId === "string" &&
    typeof value.revision === "number" &&
    isRecord(value.states)
  );
}

/**
 * Sync V3 keeps device-owned, mergeable data in visible vault files. It never
 * uses a quiet period as evidence that Obsidian Sync has finished.
 */
export class SyncV3Storage {
  private readonly app: App;
  private readonly adapter: Adapter;
  private readonly localStorage: LocalStorageApp;
  private readonly root: string;
  private readonly cacheRoot: string;
  private deviceId: string | null = null;
  private clock: HybridLogicalClock | null = null;
  private lastConfigByFeedId = new Map<string, PersistedFeedConfig>();
  private lastFoldersJson = "";
  private lastStateByKey = new Map<string, ArticleUserState>();
  private lastLocalWrite: number | null = null;
  private lastIncomingMerge: number | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(app: App, options?: { root?: string; cacheRoot?: string }) {
    this.app = app;
    this.adapter = getAdapter(app);
    this.localStorage = getLocalStorage(app);
    this.root = normalized(options?.root ?? ROOT);
    this.cacheRoot = normalized(options?.cacheRoot ?? CACHE_ROOT);
  }

  public getRootPath(): string {
    return this.root;
  }

  public getCachePath(): string {
    return normalized(`${this.cacheRoot}/runtime.json`);
  }

  public getDeviceId(): string {
    if (this.deviceId) return this.deviceId;
    const stored = this.localStorage.loadLocalStorage(DEVICE_ID_KEY);
    this.deviceId = typeof stored === "string" && stored.trim()
      ? stored
      : createId("device");
    this.localStorage.saveLocalStorage(DEVICE_ID_KEY, this.deviceId);
    return this.deviceId;
  }

  public getArticleKey(feed: Feed, item: Feed["items"][number]): string {
    return articleKey(feed, item);
  }

  public async getStatus(): Promise<SyncV3Status> {
    const epoch = await this.readEpoch();
    const replicas = await this.listReplicaDirectories();
    const invalidReplicaCount = epoch ? await this.countInvalidReplicas(epoch) : 0;
    return {
      health: !epoch
        ? "migration-required"
        : invalidReplicaCount > 0
          ? "degraded"
          : "ready",
      root: this.root,
      deviceId: this.getDeviceId(),
      replicaCount: replicas.length,
      invalidReplicaCount,
      localCachePath: this.getCachePath(),
      lastLocalWrite: this.lastLocalWrite,
      lastIncomingMerge: this.lastIncomingMerge,
    };
  }

  public async createFromSettings(settings: RssDashboardSettings): Promise<void> {
    const deviceId = this.getDeviceId();
    const epoch: SyncV3Epoch = {
      version: VERSION,
      epochId: createId("epoch"),
      createdAt: Date.now(),
      primaryDeviceId: deviceId,
    };
    await this.enqueueWrite(async () => {
      if (await this.readEpoch()) {
        throw new Error("A Sync V3 set already exists. Join it instead of reseeding.");
      }
      this.lastConfigByFeedId.clear();
      this.lastFoldersJson = "";
      this.lastStateByKey.clear();
      await this.ensureFolder(this.root);
      await this.ensureFolder(this.replicaFolder(deviceId));
      const operations = this.createInitialOperations(settings);
      const config: SyncV3ConfigLog = {
        version: VERSION,
        epochId: epoch.epochId,
        deviceId,
        revision: 1,
        operations,
      };
      await this.writeJson(this.configPath(deviceId), config);
      await this.persistStateChanges(settings, epoch);
      await this.writeJson(this.seedManifestPath(), {
        version: VERSION,
        epochId: epoch.epochId,
        primaryDeviceId: deviceId,
        createdAt: epoch.createdAt,
      });
      await this.writeJson(this.epochPath(), epoch);
      settings.storageMode = "replicated-v3";
      await this.writeLocalCache(settings);
      this.captureProjection(settings);
    });
  }

  public async join(settings: RssDashboardSettings): Promise<boolean> {
    const epoch = await this.readEpoch();
    if (!epoch) return false;
    const cached = await this.readLocalCache();
    if (cached) this.copyCachedItems(settings, cached.settings);
    await this.hydrate(settings);
    settings.storageMode = "replicated-v3";
    await this.writeLocalCache(settings);
    return true;
  }

  public async hydrate(settings: RssDashboardSettings): Promise<boolean> {
    const epoch = await this.readEpoch();
    if (!epoch) return false;
    const cached = await this.readLocalCache();
    if (cached) this.copyCachedItems(settings, cached.settings);
    const projection = await this.readProjection(epoch);
    if (!projection) return false;
    const existingItems = new Map(settings.feeds.map((feed) => [feed.feedId, feed.items]));
    settings.feeds = projection.feeds.map((feed) => ({
      ...cloneJson(feed),
      items: cloneJson(existingItems.get(feed.feedId) ?? []),
    }));
    settings.folders = cloneJson(projection.folders);
    this.applyStates(settings, projection.states);
    this.observeIncomingClocks(projection.states);
    settings.storageMode = "replicated-v3";
    this.captureProjection(settings);
    this.lastIncomingMerge = Date.now();
    return true;
  }

  public async persist(settings: RssDashboardSettings): Promise<void> {
    const epoch = await this.readEpoch();
    if (!epoch) {
      await this.persistLocalCache(settings);
      this.captureProjection(settings);
      return;
    }
    await this.enqueueWrite(async () => {
      await this.ensureFolder(this.replicaFolder(this.getDeviceId()));
      const configLog = await this.readOwnConfigLog(epoch);
      const operations = this.collectConfigOperations(settings);
      if (operations.length > 0) {
        configLog.operations.push(...operations);
        configLog.revision += 1;
        await this.writeJson(this.configPath(this.getDeviceId()), configLog);
      }
      await this.persistStateChanges(settings, epoch);
      await this.writeLocalCache(settings);
      this.captureProjection(settings);
    });
  }

  /** Refreshes local cache only; it deliberately never writes a shared replica. */
  public async persistLocalCache(settings: RssDashboardSettings): Promise<void> {
    await this.writeLocalCache(settings);
  }

  private async persistStateChanges(
    settings: RssDashboardSettings,
    epoch: SyncV3Epoch,
  ): Promise<void> {
    const changes = new Map<string, Partial<Record<keyof ArticleUserState, SyncV3StateValue>>>();
    for (const feed of settings.feeds) {
      for (const item of feed.items) {
        const key = articleKey(feed, item);
        const before = this.lastStateByKey.get(key) ?? {};
        const after = stateFromItem(item);
        const fields: Partial<Record<keyof ArticleUserState, SyncV3StateValue>> = {};
        for (const field of STATE_FIELDS) {
          if (!stateValueEqual(before[field], after[field])) {
            fields[field] = { value: cloneJson(after[field] ?? null), stamp: this.nextClock() };
          }
        }
        if (Object.keys(fields).length > 0) changes.set(key, fields);
      }
    }
    const byBucket = new Map<string, Map<string, Partial<Record<keyof ArticleUserState, SyncV3StateValue>>>>();
    for (const [key, fields] of changes) {
      const bucket = stateBucketFor(key);
      const entries = byBucket.get(bucket) ?? new Map<string, Partial<Record<keyof ArticleUserState, SyncV3StateValue>>>();
      entries.set(key, fields);
      byBucket.set(bucket, entries);
    }
    for (const [bucketId, entries] of byBucket) {
      const path = this.statePath(this.getDeviceId(), bucketId);
      const current = await this.readStateBucket(path, epoch) ?? {
        version: VERSION,
        epochId: epoch.epochId,
        deviceId: this.getDeviceId(),
        revision: 0,
        states: {},
      };
      for (const [key, fields] of entries) {
        current.states[key] = {
          fields: { ...current.states[key]?.fields, ...fields },
        };
      }
      current.revision += 1;
      await this.writeJson(path, current);
    }
  }

  private collectConfigOperations(settings: RssDashboardSettings): SyncV3ConfigOperation[] {
    const operations: SyncV3ConfigOperation[] = [];
    const current = new Map<string, PersistedFeedConfig>();
    for (const feed of settings.feeds) {
      if (!feed.feedId) continue;
      const config = toPersistedFeed(feed);
      current.set(config.feedId, config);
      if (!sameJson(this.lastConfigByFeedId.get(config.feedId), config)) {
        operations.push({ id: createId("op"), stamp: this.nextClock(), type: "upsert-feed", feed: config });
      }
    }
    for (const feedId of this.lastConfigByFeedId.keys()) {
      if (!current.has(feedId)) {
        operations.push({ id: createId("op"), stamp: this.nextClock(), type: "remove-feed", feedId });
      }
    }
    const foldersJson = JSON.stringify(settings.folders);
    if (foldersJson !== this.lastFoldersJson) {
      operations.push({ id: createId("op"), stamp: this.nextClock(), type: "set-folders", folders: cloneJson(settings.folders) });
    }
    return operations;
  }

  private createInitialOperations(settings: RssDashboardSettings): SyncV3ConfigOperation[] {
    const operations = this.collectConfigOperations(settings);
    if (!operations.some((operation) => operation.type === "set-folders")) {
      operations.push({ id: createId("op"), stamp: this.nextClock(), type: "set-folders", folders: cloneJson(settings.folders) });
    }
    return operations;
  }

  private async readProjection(epoch: SyncV3Epoch): Promise<{
    feeds: PersistedFeedConfig[];
    folders: Folder[];
    states: Record<string, SyncV3ArticleState>;
  } | null> {
    const replicaIds = await this.listReplicaDirectories();
    const operations: SyncV3ConfigOperation[] = [];
    const states: Record<string, SyncV3ArticleState> = {};
    for (const replicaId of replicaIds) {
      const config = await this.readConfigLog(this.configPath(replicaId), epoch);
      if (config) operations.push(...config.operations);
      for (let bucket = 0; bucket < 16; bucket += 1) {
        const state = await this.readStateBucket(this.statePath(replicaId, bucket.toString(16)), epoch);
        if (!state) continue;
        for (const [key, articleState] of Object.entries(state.states)) {
          states[key] = this.mergeArticleState(states[key], articleState);
        }
      }
    }
    const feeds = new Map<string, { feed?: PersistedFeedConfig; removed?: HybridLogicalClock }>();
    let folders: { value: Folder[]; stamp: HybridLogicalClock } | null = null;
    for (const operation of operations.sort((left, right) => compareSyncV3Clocks(left.stamp, right.stamp))) {
      const feedId = operationFeedId(operation);
      if (operation.type === "set-folders" && operation.folders) {
        if (!folders || compareSyncV3Clocks(folders.stamp, operation.stamp) <= 0) {
          folders = { value: cloneJson(operation.folders), stamp: operation.stamp };
        }
      } else if (operation.type === "remove-feed" && feedId) {
        const current = feeds.get(feedId) ?? {};
        if (!current.removed || compareSyncV3Clocks(current.removed, operation.stamp) <= 0) {
          feeds.set(feedId, { ...current, removed: operation.stamp, feed: undefined });
        }
      } else if (operation.type === "upsert-feed" && feedId && operation.feed) {
        const current = feeds.get(feedId) ?? {};
        const canRestore = !current.removed || Boolean(operation.observedRemoval && compareSyncV3Clocks(operation.observedRemoval, current.removed) >= 0);
        if (canRestore) feeds.set(feedId, { ...current, feed: cloneJson(operation.feed) });
      }
    }
    return {
      feeds: [...feeds.values()].flatMap((entry) => entry.feed ? [entry.feed] : []),
      folders: folders?.value ?? [],
      states,
    };
  }

  private applyStates(settings: RssDashboardSettings, states: Record<string, SyncV3ArticleState>): void {
    for (const feed of settings.feeds) {
      for (const item of feed.items) {
        const fields = states[articleKey(feed, item)]?.fields;
        if (!fields) continue;
        for (const field of STATE_FIELDS) {
          const value = fields[field]?.value;
          if (value === undefined) continue;
          if (field === "tags") item.tags = Array.isArray(value) ? cloneJson(value) : [];
          else if (field === "playbackProgress") item.playbackProgress = isRecord(value) ? cloneJson(value) as Feed["items"][number]["playbackProgress"] : undefined;
          else if (field === "savedFilePath") item.savedFilePath = typeof value === "string" ? value : undefined;
          else if (field === "read" || field === "starred" || field === "saved") item[field] = value === true;
        }
      }
    }
  }

  private mergeArticleState(current: SyncV3ArticleState | undefined, incoming: SyncV3ArticleState): SyncV3ArticleState {
    const fields = { ...(current?.fields ?? {}) };
    for (const field of STATE_FIELDS) {
      const next = incoming.fields[field];
      if (!next) continue;
      const previous = fields[field];
      if (!previous || compareSyncV3Clocks(previous.stamp, next.stamp) <= 0) fields[field] = cloneJson(next);
    }
    return { fields };
  }

  private captureProjection(settings: RssDashboardSettings): void {
    this.lastConfigByFeedId = new Map(
      settings.feeds.filter((feed) => Boolean(feed.feedId)).map((feed) => [feed.feedId ?? "", toPersistedFeed(feed)]),
    );
    this.lastFoldersJson = JSON.stringify(settings.folders);
    this.lastStateByKey.clear();
    for (const feed of settings.feeds) {
      for (const item of feed.items) this.lastStateByKey.set(articleKey(feed, item), stateFromItem(item));
    }
  }

  private copyCachedItems(target: RssDashboardSettings, source: RssDashboardSettings): void {
    const sourceItems = new Map(source.feeds.map((feed) => [feed.feedId, feed.items]));
    for (const feed of target.feeds) feed.items = cloneJson(sourceItems.get(feed.feedId) ?? feed.items);
  }

  private nextClock(): HybridLogicalClock {
    const stored = this.clock ?? this.readStoredClock();
    const now = Date.now();
    const next: HybridLogicalClock = {
      wallTime: Math.max(now, stored.wallTime),
      counter: now > stored.wallTime ? 0 : stored.counter + 1,
      deviceId: this.getDeviceId(),
    };
    this.clock = next;
    this.localStorage.saveLocalStorage(CLOCK_KEY, next);
    return next;
  }

  private observeIncomingClocks(states: Record<string, SyncV3ArticleState>): void {
    let newest = this.clock ?? this.readStoredClock();
    for (const articleState of Object.values(states)) {
      for (const field of STATE_FIELDS) {
        const incoming = articleState.fields[field]?.stamp;
        if (incoming && compareSyncV3Clocks(newest, incoming) < 0) {
          newest = incoming;
        }
      }
    }
    this.clock = {
      wallTime: newest.wallTime,
      counter: newest.counter,
      deviceId: this.getDeviceId(),
    };
    this.localStorage.saveLocalStorage(CLOCK_KEY, this.clock);
  }

  private readStoredClock(): HybridLogicalClock {
    const stored = this.localStorage.loadLocalStorage(CLOCK_KEY);
    return isClock(stored) ? stored : { wallTime: 0, counter: 0, deviceId: this.getDeviceId() };
  }

  private async readEpoch(): Promise<SyncV3Epoch | null> {
    return this.readJson(this.epochPath(), isEpoch);
  }

  private async readOwnConfigLog(epoch: SyncV3Epoch): Promise<SyncV3ConfigLog> {
    return (await this.readConfigLog(this.configPath(this.getDeviceId()), epoch)) ?? {
      version: VERSION,
      epochId: epoch.epochId,
      deviceId: this.getDeviceId(),
      revision: 0,
      operations: [],
    };
  }

  private async readConfigLog(path: string, epoch: SyncV3Epoch): Promise<SyncV3ConfigLog | null> {
    const log = await this.readJson(path, isConfigLog);
    return log?.epochId === epoch.epochId ? log : null;
  }

  private async readStateBucket(path: string, epoch: SyncV3Epoch): Promise<SyncV3StateBucket | null> {
    const bucket = await this.readJson(path, isStateBucket);
    return bucket?.epochId === epoch.epochId ? bucket : null;
  }

  private async readLocalCache(): Promise<CachedProjection | null> {
    return this.readJson(this.getCachePath(), (value): value is CachedProjection =>
      isRecord(value) && value.version === VERSION && isRecord(value.settings),
    );
  }

  private async writeLocalCache(settings: RssDashboardSettings): Promise<void> {
    await this.ensureFolder(this.cacheRoot);
    await this.writeJson(this.getCachePath(), { version: VERSION, settings: cloneJson(settings) });
  }

  private async readJson<T>(path: string, guard: (value: unknown) => value is T): Promise<T | null> {
    if (!(await this.adapter.exists(path))) return null;
    try {
      const parsed: unknown = JSON.parse(await this.adapter.read(path));
      return guard(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async writeJson(path: string, data: unknown): Promise<void> {
    await this.adapter.write(path, JSON.stringify(data, null, 2));
    this.lastLocalWrite = Date.now();
  }

  private async ensureFolder(path: string): Promise<void> {
    if (await this.adapter.exists(path)) return;
    try {
      await this.app.vault.createFolder(path);
    } catch {
      if (!(await this.adapter.exists(path))) {
        throw new Error(`Could not create Sync V3 folder: ${path}`);
      }
    }
  }

  private async listReplicaDirectories(): Promise<string[]> {
    const replicasRoot = normalized(`${this.root}/replicas`);
    if (!(await this.adapter.exists(replicasRoot))) return [];
    const listing = await this.adapter.list(replicasRoot);
    return listing.folders.map((folder) => folder.split("/").pop() ?? "").filter(Boolean);
  }

  private async countInvalidReplicas(epoch: SyncV3Epoch): Promise<number> {
    const replicaIds = await this.listReplicaDirectories();
    let invalid = 0;
    for (const replicaId of replicaIds) {
      const config = await this.readConfigLog(this.configPath(replicaId), epoch);
      if (!config) invalid += 1;
    }
    return invalid;
  }

  private enqueueWrite(work: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(work, work);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  private epochPath(): string { return normalized(`${this.root}/epoch.json`); }
  private seedManifestPath(): string { return normalized(`${this.root}/seed-manifest.json`); }
  private replicaFolder(deviceId: string): string { return normalized(`${this.root}/replicas/${deviceId}`); }
  private configPath(deviceId: string): string { return normalized(`${this.replicaFolder(deviceId)}/config-log.json`); }
  private statePath(deviceId: string, bucket: string): string { return normalized(`${this.replicaFolder(deviceId)}/state-${bucket}.json`); }
}
