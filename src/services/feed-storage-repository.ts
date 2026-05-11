import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type {
  Feed,
  FeedItemsShard,
  PortableDataBundle,
  PersistedFeedConfig,
  PersistedRssDashboardSettings,
  RssDashboardSettings,
} from "../types/types";

const SHARD_VERSION = 1;
const STORAGE_LOG_PREFIX = "[RSS Dashboard][Storage]";

export interface FeedStorageStatus {
  mode: RssDashboardSettings["storageMode"];
  folder: string;
  shardCount: number;
  feedCount: number;
  migrationReady: boolean;
  lastRepairResult: string;
}

export interface PersistSettingsOptions {
  forceMetadata?: boolean;
  forceAllShards?: boolean;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createFeedId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
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

function createFeedShard(feed: Feed): FeedItemsShard {
  return {
    version: SHARD_VERSION,
    feedId: feed.feedId ?? "",
    feedUrl: feed.url,
    updatedAt: Date.now(),
    items: cloneJson(feed.items ?? []),
  };
}

function storageLog(message: string, details?: unknown): void {
  if (details === undefined) {
    console.debug(`${STORAGE_LOG_PREFIX} ${message}`);
    return;
  }

  console.debug(`${STORAGE_LOG_PREFIX} ${message}`, details);
}

function storageError(message: string, error: unknown, details?: unknown): void {
  if (details === undefined) {
    console.error(`${STORAGE_LOG_PREFIX} ${message}`, error);
    return;
  }

  console.error(`${STORAGE_LOG_PREFIX} ${message}`, details, error);
}

export class FeedStorageRepository {
  private lastPersistedMetadataJson: string | null = null;
  private lastPersistedShardJsonByFeedId = new Map<string, string>();
  private lastStorageFolderPath: string | null = null;
  private lastRepairResult = "Not yet run";

  constructor(private readonly app: App) {}

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

  public async hydrateSettings(
    settings: RssDashboardSettings,
  ): Promise<{ didChange: boolean; shardCount: number }> {
    storageLog("Hydrating settings", {
      mode: settings.storageMode,
      folder: normalizeFolderPath(settings.storageFolder),
      feedCount: settings.feeds.length,
    });
    const didAssignFeedIds = this.ensureFeedIds(settings);
    let shardCount = 0;

    if (settings.storageMode !== "vault-shards") {
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
      const shardPath = getFeedShardPath(settings.storageFolder, feed.feedId ?? "");
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
    this.capturePersistedState(settings);
    return { didChange: didAssignFeedIds, shardCount };
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

    if (settings.storageMode !== "vault-shards") {
      await saveData(cloneJson(settings));
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
      const shard = createFeedShard(feed);
      const shardJson = JSON.stringify(shard, null, 2);
      const previousJson = this.lastPersistedShardJsonByFeedId.get(feed.feedId);

      if (forceAllShards || previousJson !== shardJson) {
        const shardPath = getFeedShardPath(normalizedStorageFolder, feed.feedId);
        await this.app.vault.adapter.write(
          shardPath,
          shardJson,
        );
        this.lastPersistedShardJsonByFeedId.set(feed.feedId, shardJson);
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
        const previousShard = this.app.vault.getAbstractFileByPath(
          previousShardPath,
        );
        if (previousShard) {
          await this.app.fileManager.trashFile(previousShard);
          storageLog("Deleted shard from previous storage folder", {
            feedId: feed.feedId,
            previousShardPath,
          });
        }
      }
    }

    for (const previousFeedId of [...this.lastPersistedShardJsonByFeedId.keys()]) {
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
      await saveData(persistedSettings);
      this.lastPersistedMetadataJson = metadataJson;
      storageLog("Saved shard metadata to data.json", {
        feedCount: persistedSettings.feeds.length,
      });
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
    storageLog("Starting migration to vault shards", {
      currentMode: settings.storageMode,
      folder: normalizeFolderPath(settings.storageFolder),
      feedCount: settings.feeds.length,
    });
    settings.storageMode = "vault-shards";
    settings.storageFolder = normalizeFolderPath(settings.storageFolder);
    this.lastRepairResult = "Migration completed";

    await this.persistSettings(settings, saveData, {
      forceAllShards: true,
      forceMetadata: true,
    });
    storageLog("Completed migration to vault shards");
  }

  public async revertToLegacyJson(
    settings: RssDashboardSettings,
    saveData: (data: unknown) => Promise<void>,
  ): Promise<void> {
    const storageFolder = normalizeFolderPath(settings.storageFolder);
    storageLog("Reverting to legacy JSON storage", {
      storageFolder,
      feedCount: settings.feeds.length,
    });

    await this.deleteShardFilesInFolder(storageFolder);

    settings.storageMode = "legacy-json";
    await saveData(cloneJson(settings));

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
      metadata: this.createPersistedSettings(settings),
      shards: settings.feeds
        .filter((feed): feed is Feed & { feedId: string } => Boolean(feed.feedId))
        .map((feed) => createFeedShard(feed)),
      markdownMirrorFallbackPlanned: true,
    };
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
    if (settings.storageMode === "vault-shards") {
      this.lastPersistedMetadataJson = JSON.stringify(
        this.createPersistedSettings(settings),
        null,
        2,
      );
      this.lastPersistedShardJsonByFeedId = new Map(
        settings.feeds
          .filter((feed): feed is Feed & { feedId: string } => Boolean(feed.feedId))
          .map((feed) => [feed.feedId, JSON.stringify(createFeedShard(feed), null, 2)]),
      );
      this.lastStorageFolderPath = normalizeFolderPath(settings.storageFolder);
      return;
    }

    this.lastPersistedMetadataJson = JSON.stringify(cloneJson(settings), null, 2);
    this.lastPersistedShardJsonByFeedId.clear();
    this.lastStorageFolderPath = null;
  }

  private async ensureStorageFolderExists(storageFolder: string): Promise<void> {
    const normalizedFolder = normalizeFolderPath(storageFolder);
    if (!normalizedFolder) {
      return;
    }

    if (this.app.vault.getAbstractFileByPath(normalizedFolder) === null) {
      await this.app.vault.createFolder(normalizedFolder);
      storageLog("Created storage folder", { folder: normalizedFolder });
      return;
    }

    storageLog("Storage folder already exists", { folder: normalizedFolder });
  }

  private async deleteShardFilesInFolder(folderPath: string): Promise<void> {
    const target = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(target instanceof TFolder)) {
      storageLog("No shard folder found to clean", { folderPath });
      this.lastPersistedShardJsonByFeedId.clear();
      this.lastStorageFolderPath = null;
      return;
    }

    const deletedCount = await this.deleteShardFilesRecursive(target);
    this.lastPersistedShardJsonByFeedId.clear();
    this.lastStorageFolderPath = null;
    storageLog("Deleted shard files from storage folder", {
      folderPath,
      deletedCount,
    });
  }

  private async deleteShardFilesRecursive(folder: TFolder): Promise<number> {
    const children = [...folder.children];
    let deletedCount = 0;

    for (const child of children) {
      if (child instanceof TFolder) {
        deletedCount += await this.deleteShardFilesRecursive(child);
        continue;
      }

      if (child instanceof TFile && child.path.toLowerCase().endsWith(".json")) {
        await this.app.fileManager.trashFile(child);
        deletedCount += 1;
        storageLog("Deleted shard file", { path: child.path });
      }
    }

    return deletedCount;
  }
}
