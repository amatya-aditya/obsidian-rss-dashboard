import { describe, it, expect, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { shouldShowStorageDeprecationPrompt } from "../../../src/utils/storage-deprecation-prompt";
import { applyFeedRetentionLimits } from "../../../src/services/feed-parser/feed-retention";

interface VaultAdapterStub {
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<string>;
}

function vaultAdapter(app: App): VaultAdapterStub {
  return app.vault.adapter as unknown as VaultAdapterStub;
}

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(overrides?: Partial<Feed>): Feed {
  return {
    title: "Example Feed",
    url: "https://example.com/feed.xml",
    folder: "RSS",
    items: [
      {
        title: "Article 1",
        link: "https://example.com/articles/1",
        description: "One",
        pubDate: "2026-01-01T00:00:00Z",
        guid: "https://example.com/articles/1",
        read: false,
        starred: false,
        tags: [],
        feedTitle: "Example Feed",
        feedUrl: "https://example.com/feed.xml",
        coverImage: "",
      },
    ],
    lastUpdated: 0,
    ...overrides,
  };
}

function makeItem(overrides?: Partial<FeedItem>): FeedItem {
  return { ...(makeFeed().items[0] as FeedItem), ...overrides };
}

describe("FeedStorageRepository", () => {
  let app: App;
  let repository: FeedStorageRepository;
  let saveData: import("vitest").Mock<(...args: unknown[]) => Promise<void>>;

  beforeEach(() => {
    app = App.createMock();
    repository = new FeedStorageRepository(app);
    saveData = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  });

  it("returns data.json as the feed local address in legacy mode", () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";

    const address = repository.getFeedLocalStorageAddress(settings, makeFeed());

    expect(address).toEqual({
      mode: "legacy-json",
      address: "data.json",
    });
  });

  it("returns the normalized shard path as the feed local address in shard mode", () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "/RSS Data/Feeds/";

    const address = repository.getFeedLocalStorageAddress(
      settings,
      makeFeed({ feedId: "feed-1" }),
    );

    expect(address).toEqual({
      mode: "vault-shards",
      address: "RSS Data/Feeds/feed-1.json",
    });
  });

  it("treats vault-shards-v2 as shard-backed storage for feed addresses", () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards-v2";
    settings.storageFolder = "/RSS Data/Feeds/";

    const address = repository.getFeedLocalStorageAddress(
      settings,
      makeFeed({ feedId: "feed-1" }),
    );

    expect(address).toEqual({
      mode: "vault-shards-v2",
      address: "RSS Data/Feeds/feed-1.json",
    });
  });

  it("returns an empty address in shard mode when a feed has no feed ID yet", () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";

    const address = repository.getFeedLocalStorageAddress(
      settings,
      makeFeed({ feedId: "" }),
    );

    expect(address).toEqual({
      mode: "vault-shards",
      address: "",
    });
  });

  it("hydrates feed items from vault shards when shard storage is enabled", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [
      makeFeed({
        feedId: "feed-1",
        items: [],
      }),
    ];

    await vaultAdapter(app).write(
      "RSS Data/Feeds/feed-1.json",
      JSON.stringify({
        version: 1,
        feedId: "feed-1",
        feedUrl: settings.feeds[0].url,
        updatedAt: Date.now(),
        items: [makeFeed().items[0]],
      }),
    );

    const result = await repository.hydrateSettings(settings);

    expect(result.shardCount).toBe(1);
    expect(settings.feeds[0].items).toHaveLength(1);
    expect(settings.feeds[0].items[0].guid).toBe(
      "https://example.com/articles/1",
    );
  });

  it("writes only the changed feed shard for item-state updates", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [
      makeFeed({ feedId: "feed-1", title: "Feed One" }),
      makeFeed({
        feedId: "feed-2",
        title: "Feed Two",
        url: "https://example.com/feed-two.xml",
        items: [
          {
            ...makeFeed().items[0],
            guid: "https://example.com/articles/2",
            link: "https://example.com/articles/2",
            feedUrl: "https://example.com/feed-two.xml",
            feedTitle: "Feed Two",
          },
        ],
      }),
    ];

    const writeSpy = vi.spyOn(app.vault.adapter, "write");

    await repository.persistSettings(settings, saveData, {
      forceAllShards: true,
      forceMetadata: true,
    });

    writeSpy.mockClear();
    saveData.mockClear();

    settings.feeds[0].items[0].read = true;

    const result = await repository.persistSettings(settings, saveData);

    expect(result.shardWriteCount).toBe(1);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith(
      "RSS Data/Feeds/feed-1.json",
      expect.any(String),
    );
    expect(saveData).not.toHaveBeenCalled();
  });

  it("reports a missing shard after hydration", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];

    await repository.hydrateSettings(settings);

    expect(repository.getFeedShardHealth(settings.feeds[0])).toBe("missing");
  });

  it("reports a corrupted shard after hydration", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];
    await app.vault.createFolder("RSS Data/Feeds");
    await vaultAdapter(app).write("RSS Data/Feeds/feed-1.json", "not json");

    await repository.hydrateSettings(settings);

    expect(repository.getFeedShardHealth(settings.feeds[0])).toBe("corrupt");
  });

  it("reports a shard for another feed as corrupted", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];
    await app.vault.createFolder("RSS Data/Feeds");
    await vaultAdapter(app).write(
      "RSS Data/Feeds/feed-1.json",
      JSON.stringify({
        version: 1,
        feedId: "feed-2",
        feedUrl: settings.feeds[0].url,
        updatedAt: Date.now(),
        items: [],
      }),
    );

    await repository.hydrateSettings(settings);

    expect(repository.getFeedShardHealth(settings.feeds[0])).toBe("corrupt");
  });

  it("marks a missing shard as rebuilt once its feed has articles to write again", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    const feed = makeFeed({ feedId: "feed-1", items: [] });
    settings.feeds = [feed];

    await repository.hydrateSettings(settings);
    expect(repository.getFeedShardHealth(feed)).toBe("missing");

    // A refresh repopulates the feed that failed to hydrate.
    feed.items = [makeItem()];
    await repository.persistSettings(settings, saveData);

    expect(repository.getFeedShardHealth(feed)).toBe("rebuilt");
    expect(await vaultAdapter(app).read("RSS Data/Feeds/feed-1.json")).toContain(
      "Article 1",
    );
  });

  describe("shards that have not arrived yet (sync still pending)", () => {
    function adapterHas(path: string): Promise<boolean> {
      return (app.vault.adapter as unknown as {
        exists(path: string): Promise<boolean>;
      }).exists(path);
    }

    it("does not create an empty shard for a feed whose shard was missing at startup", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards";
      settings.storageFolder = "RSS Data/Feeds";
      const feed = makeFeed({ feedId: "feed-1", items: [] });
      settings.feeds = [feed];

      await repository.hydrateSettings(settings);
      settings.refreshInterval += 1; // any unrelated settings save
      const result = await repository.persistSettings(settings, saveData);

      expect(result.shardWriteCount).toBe(0);
      expect(await adapterHas("RSS Data/Feeds/feed-1.json")).toBe(false);
      expect(repository.getFeedShardHealth(feed)).toBe("missing");
    });

    it("keeps a shard that sync delivers after startup instead of overwriting it with empty data", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards";
      settings.storageFolder = "RSS Data/Feeds";
      settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];

      await repository.hydrateSettings(settings);
      const deliveredShard = JSON.stringify({
        version: 1,
        feedId: "feed-1",
        feedUrl: "https://example.com/feed.xml",
        updatedAt: Date.now(),
        items: [makeItem()],
      });
      await app.vault.createFolder("RSS Data/Feeds");
      await vaultAdapter(app).write("RSS Data/Feeds/feed-1.json", deliveredShard);

      await repository.persistSettings(settings, saveData);

      expect(await vaultAdapter(app).read("RSS Data/Feeds/feed-1.json")).toBe(
        deliveredShard,
      );
    });

    it("keeps a valid shard another device changed on disk when this device's copy of the feed is unchanged", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards";
      settings.storageFolder = "RSS Data/Feeds";
      settings.feeds = [makeFeed({ feedId: "feed-1" })];
      await repository.persistSettings(settings, saveData, {
        forceAllShards: true,
        forceMetadata: true,
      });
      const newerShard = JSON.stringify({
        version: 1,
        feedId: "feed-1",
        feedUrl: "https://example.com/feed.xml",
        updatedAt: Date.now(),
        items: [makeItem(), makeItem({ guid: "newer", title: "Newer article" })],
      });
      await vaultAdapter(app).write("RSS Data/Feeds/feed-1.json", newerShard);

      const result = await repository.persistSettings(settings, saveData);

      expect(result.shardWriteCount).toBe(0);
      expect(await vaultAdapter(app).read("RSS Data/Feeds/feed-1.json")).toBe(
        newerShard,
      );
    });

    it("repair skips feeds with nothing to rebuild from and keeps their warning", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards";
      settings.storageFolder = "RSS Data/Feeds";
      const unloaded = makeFeed({ feedId: "feed-1", items: [] });
      const loaded = makeFeed({ feedId: "feed-2", url: "https://example.com/two.xml" });
      settings.feeds = [unloaded, loaded];
      await app.vault.createFolder("RSS Data/Feeds");
      await vaultAdapter(app).write(
        "RSS Data/Feeds/feed-2.json",
        JSON.stringify({ version: 1, feedId: "feed-2", items: [makeItem()] }),
      );
      await repository.hydrateSettings(settings);

      const result = await repository.repairVaultShards(settings, saveData);

      expect(result).toEqual({ skippedFeedCount: 1 });
      expect(await adapterHas("RSS Data/Feeds/feed-1.json")).toBe(false);
      expect(repository.getFeedShardHealth(unloaded)).toBe("missing");
      expect(repository.getFeedShardHealth(loaded)).toBeNull();
    });

    it("previews repair without writing, listing skipped feeds and shards that would lose articles", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards";
      settings.storageFolder = "RSS Data/Feeds";
      const twoArticles = [
        makeItem(),
        makeItem({ guid: "second", title: "Article 2" }),
      ];
      const shrinking = makeFeed({ feedId: "feed-2", title: "Shrinking", items: twoArticles });
      settings.feeds = [
        makeFeed({ feedId: "feed-1", title: "Unloaded", items: [] }),
        shrinking,
      ];
      await repository.persistSettings(settings, saveData, {
        forceAllShards: true,
        forceMetadata: true,
      });
      await (app.vault.adapter as unknown as { remove(path: string): Promise<void> }).remove(
        "RSS Data/Feeds/feed-1.json",
      );
      await repository.hydrateSettings(settings);
      shrinking.items = twoArticles.slice(0, 1);
      const shardBefore = await vaultAdapter(app).read("RSS Data/Feeds/feed-2.json");

      const preview = await repository.previewRepairVaultShards(settings);

      expect(preview).toEqual({
        rewriteCount: 1,
        skippedFeedTitles: ["Unloaded"],
        shrinkingFeeds: [
          { title: "Shrinking", onDiskCount: 2, afterRepairCount: 1 },
        ],
      });
      expect(await vaultAdapter(app).read("RSS Data/Feeds/feed-2.json")).toBe(
        shardBefore,
      );
    });

    it("counts the feeds this device has not loaded and has nothing to rebuild from", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards-v2";
      settings.storageFolder = "RSS Data/Feeds";
      settings.feeds = [
        makeFeed({ feedId: "feed-1", items: [] }),
        makeFeed({ feedId: "feed-2", url: "https://example.com/two.xml" }),
      ];
      await app.vault.createFolder("RSS Data/Feeds");
      await vaultAdapter(app).write(
        "RSS Data/Feeds/feed-2.json",
        JSON.stringify({ version: 1, feedId: "feed-2", items: [makeItem()] }),
      );

      await repository.hydrateSettings(settings);

      expect(repository.countUnloadedFeeds(settings)).toBe(1);
    });

    it("does not create an empty user-state.json before sync delivers the real one", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards-v2";
      settings.storageFolder = "RSS Data/Feeds";
      settings.metadataStorageFolder = "RSS Data";
      settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];

      await repository.hydrateSettings(settings);
      await repository.persistSettings(settings, saveData, { forceMetadata: true });

      expect(await adapterHas("RSS Data/user-state.json")).toBe(false);
    });
  });

  describe("hidden storage folder detection", () => {
    it("flags a hidden storage folder when no feed's shard is present", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards-v2";
      settings.storageFolder = ".rss-dashboard-data/feeds";
      settings.feeds = [
        makeFeed({ feedId: "feed-1", items: [] }),
        makeFeed({ feedId: "feed-2", items: [] }),
      ];

      await repository.hydrateSettings(settings);

      expect(repository.isShardFolderHiddenFromSync()).toBe(true);
    });

    it("does not flag a visible storage folder whose shards are missing", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards-v2";
      settings.storageFolder = "rss-dashboard-data/feeds";
      settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];

      await repository.hydrateSettings(settings);

      expect(repository.isShardFolderHiddenFromSync()).toBe(false);
    });

    it("does not flag a hidden storage folder when some shards loaded", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards-v2";
      settings.storageFolder = ".rss-dashboard-data/feeds";
      settings.feeds = [
        makeFeed({ feedId: "feed-1", items: [] }),
        makeFeed({ feedId: "feed-2", items: [] }),
      ];
      await app.vault.createFolder(".rss-dashboard-data/feeds");
      await vaultAdapter(app).write(
        ".rss-dashboard-data/feeds/feed-2.json",
        JSON.stringify({ version: 1, feedId: "feed-2", items: [] }),
      );

      await repository.hydrateSettings(settings);

      expect(repository.isShardFolderHiddenFromSync()).toBe(false);
    });
  });

  it("recreates a shard removed externally even when feed data is unchanged", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    await repository.persistSettings(settings, saveData, {
      forceAllShards: true,
      forceMetadata: true,
    });
    await (app.vault.adapter as unknown as { remove(path: string): Promise<void> }).remove(
      "RSS Data/Feeds/feed-1.json",
    );

    const result = await repository.persistSettings(settings, saveData);

    expect(result.shardWriteCount).toBe(1);
    expect(
      await (app.vault.adapter as unknown as {
        exists(path: string): Promise<boolean>;
      }).exists("RSS Data/Feeds/feed-1.json"),
    ).toBe(true);
  });

  it("recreates a shard corrupted externally even when feed data is unchanged", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    await repository.persistSettings(settings, saveData, {
      forceAllShards: true,
      forceMetadata: true,
    });
    await vaultAdapter(app).write("RSS Data/Feeds/feed-1.json", "not json");

    const result = await repository.persistSettings(settings, saveData);

    expect(result.shardWriteCount).toBe(1);
    expect(await vaultAdapter(app).read("RSS Data/Feeds/feed-1.json")).toContain(
      "\"feedId\": \"feed-1\"",
    );
    expect(repository.getFeedShardHealth(settings.feeds[0])).toBe("rebuilt");
  });

  it("migrates legacy settings to shard storage and strips items from persisted metadata", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed()];

    await repository.migrateToVaultShards(settings, saveData);

    expect(settings.storageMode).toBe("vault-shards");
    expect(settings.feeds[0].feedId).toBeTruthy();
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(saveData.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        storageMode: "vault-shards",
        feeds: [
          expect.not.objectContaining({
            items: expect.anything() as unknown,
          }),
        ],
      }),
    );
  });

  it("migrates successfully when the storage folder already exists", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    await app.vault.createFolder("RSS Data/Feeds");

    await repository.migrateToVaultShards(settings, saveData);

    expect(settings.storageMode).toBe("vault-shards");
    expect(app.vault.getAbstractFileByPath("RSS Data/Feeds")).toBeTruthy();
    expect(await vaultAdapter(app).read("RSS Data/Feeds/feed-1.json")).toContain(
      '"feedId": "feed-1"',
    );
  });

  it("continues migration when createFolder throws but the folder exists afterward", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    const originalCreateFolder = app.vault.createFolder.bind(app.vault);
    const createFolderSpy = vi
      .spyOn(app.vault, "createFolder")
      .mockImplementationOnce(async (folderPath: string) => {
        await originalCreateFolder(folderPath);
        throw new Error("Folder already exists");
      });

    await repository.migrateToVaultShards(settings, saveData);

    expect(createFolderSpy).toHaveBeenCalledWith("RSS Data/Feeds");
    expect(settings.storageMode).toBe("vault-shards");
    expect(await vaultAdapter(app).read("RSS Data/Feeds/feed-1.json")).toContain(
      '"feedId": "feed-1"',
    );
  });

  it("continues migration when the adapter sees the folder but the vault cache does not", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    vi.spyOn(app.vault, "getAbstractFileByPath").mockReturnValue(null);
    vi.spyOn(app.vault, "createFolder").mockRejectedValueOnce(
      new Error("Folder already exists"),
    );
    const adapterWithExists = app.vault.adapter as unknown as { exists: (p: string) => Promise<boolean> };
    vi.spyOn(adapterWithExists, "exists").mockImplementation((path: string) => {
      if (path === "RSS Data/Feeds") {
        return Promise.resolve(true);
      }

      return Promise.resolve(false);
    });

    await repository.migrateToVaultShards(settings, saveData);

    expect(settings.storageMode).toBe("vault-shards");
    expect(saveData).toHaveBeenCalledTimes(1);
  });

  it("fails migration with a clear error when the storage path points to a file", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    await app.vault.create("RSS Data/Feeds", "not a folder");

    await expect(repository.migrateToVaultShards(settings, saveData)).rejects.toThrow(
      "Storage path points to a file, not a folder: RSS Data/Feeds",
    );
    expect(settings.storageMode).toBe("legacy-json");
  });

  it("keeps legacy mode when migration fails before persisting", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    vi.spyOn(app.vault, "createFolder").mockRejectedValueOnce(new Error("Disk full"));

    await expect(repository.migrateToVaultShards(settings, saveData)).rejects.toThrow(
      "Disk full",
    );

    expect(settings.storageMode).toBe("legacy-json");
    expect(saveData).not.toHaveBeenCalled();
  });

  it("repairs shards idempotently when the storage folder already exists", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    await app.vault.createFolder("RSS Data/Feeds");

    await repository.repairVaultShards(settings, saveData);
    saveData.mockClear();

    await expect(repository.repairVaultShards(settings, saveData)).resolves.toEqual({
      skippedFeedCount: 0,
    });
    expect(saveData).toHaveBeenCalledTimes(1);
  });

  it("reverts to legacy JSON without deleting shard files unless requested", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    await app.vault.createFolder("RSS Data/Feeds");
    await app.vault.create("RSS Data/Feeds/feed-1.json", "{\"items\":[]}");

    await repository.revertToLegacyJson(settings, saveData);

    expect(settings.storageMode).toBe("legacy-json");
    expect(app.vault.getAbstractFileByPath("RSS Data/Feeds")).toBeTruthy();
    expect(await vaultAdapter(app).read("RSS Data/Feeds/feed-1.json")).toContain(
      "\"items\":[]",
    );
  });

  it("deletes the shard folder when revert is requested with cleanup enabled", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    await app.vault.createFolder("RSS Data/Feeds/Nested");
    await app.vault.create("RSS Data/Feeds/feed-1.json", "{\"items\":[]}");
    await app.vault.create("RSS Data/Feeds/Nested/feed-2.json", "{\"items\":[]}");

    const rootFolder = app.vault.getAbstractFileByPath("RSS Data/Feeds");
    expect(rootFolder).toBeTruthy();

    await repository.revertToLegacyJson(settings, saveData, {
      deleteShardFolder: true,
    });

    expect(settings.storageMode).toBe("legacy-json");
    expect(app.vault.getAbstractFileByPath("RSS Data/Feeds")).toBeNull();
  });

  it("also removes a parent folder the revert left empty", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];
    await app.vault.createFolder("RSS Data/Feeds");
    await app.vault.create("RSS Data/Feeds/feed-1.json", "{\"items\":[]}");

    await repository.revertToLegacyJson(settings, saveData, {
      deleteShardFolder: true,
    });

    expect(
      await (app.vault.adapter as unknown as {
        exists(path: string): Promise<boolean>;
      }).exists("RSS Data"),
    ).toBe(false);
  });

  it("halts revert when the shard folder still exists after delete attempt", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    await app.vault.createFolder("RSS Data/Feeds");
    vi.spyOn(app.vault.adapter, "rmdir").mockResolvedValueOnce(undefined);
    const adapterWithExists2 = app.vault.adapter as unknown as { exists: (p: string) => Promise<boolean> };
    vi.spyOn(adapterWithExists2, "exists").mockImplementation((path: string) => {
      if (path === "RSS Data/Feeds") {
        return Promise.resolve(true);
      }

      return Promise.resolve(false);
    });

    await expect(
      repository.revertToLegacyJson(settings, saveData, {
        deleteShardFolder: true,
      }),
    ).rejects.toThrow("Shard folder still exists after delete attempt: RSS Data/Feeds");

    expect(settings.storageMode).toBe("vault-shards");
    expect(saveData).not.toHaveBeenCalled();
  });

  it("builds a portable bundle with metadata and shards", () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    const bundle = repository.buildPortableDataBundle(settings);

    expect(bundle.metadata.storageMode).toBe("vault-shards");
    expect(bundle.metadata.feeds[0]).not.toHaveProperty("items");
    expect(bundle.shards).toHaveLength(1);
    expect(bundle.markdownMirrorFallbackPlanned).toBe(true);
  });

  it("builds a feed bundle with feeds, folders, tags, and shards but no app settings", () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];
    settings.availableTags = [{ name: "example-tag", color: "#ffffff" }];

    const bundle = repository.buildFeedBundle(settings);

    expect(bundle.feeds).toHaveLength(1);
    expect(bundle.feeds[0]).not.toHaveProperty("items");
    expect(bundle.feeds[0].feedId).toBe("feed-1");
    expect(bundle.folders).toEqual(settings.folders);
    expect(bundle.availableTags).toEqual(settings.availableTags);
    expect(bundle.shards).toHaveLength(1);
    expect(bundle.shards[0].feedId).toBe("feed-1");
    expect(bundle).not.toHaveProperty("storageMode");
    expect(bundle).not.toHaveProperty("display");
    expect(bundle).not.toHaveProperty("autoBackup");
  });

  it("builds a settings bundle with app preferences but no feeds, folders, or tags", () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];
    settings.availableTags = [{ name: "example-tag", color: "#ffffff" }];

    const bundle = repository.buildSettingsBundle(settings);

    expect(bundle.settings.storageMode).toBe("vault-shards");
    expect(bundle.settings.autoBackup).toEqual(settings.autoBackup);
    expect(bundle.settings).not.toHaveProperty("feeds");
    expect(bundle.settings).not.toHaveProperty("folders");
    expect(bundle.settings).not.toHaveProperty("availableTags");
  });

  it("composes the portable data bundle from the feed bundle and settings bundle unchanged", () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.storageFolder = "RSS Data/Feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];
    settings.availableTags = [{ name: "example-tag", color: "#ffffff" }];

    const feedBundle = repository.buildFeedBundle(settings);
    const settingsBundle = repository.buildSettingsBundle(settings);
    const portableBundle = repository.buildPortableDataBundle(settings);

    expect(portableBundle.storageMode).toBe(settings.storageMode);
    expect(portableBundle.storageFolder).toBe(settings.storageFolder);
    expect(portableBundle.metadataStorageMode).toBe(
      settingsBundle.metadataStorageMode,
    );
    expect(portableBundle.metadataStorageFolder).toBe(
      settingsBundle.metadataStorageFolder,
    );
    expect(portableBundle.metadata.feeds).toEqual(feedBundle.feeds);
    expect(portableBundle.metadata.folders).toEqual(feedBundle.folders);
    expect(portableBundle.metadata.availableTags).toEqual(
      feedBundle.availableTags,
    );
    expect(portableBundle.metadata.autoBackup).toEqual(
      settingsBundle.settings.autoBackup,
    );
    expect(portableBundle.shards).toHaveLength(feedBundle.shards.length);
    expect(portableBundle.shards[0].feedId).toBe(feedBundle.shards[0].feedId);
    expect(portableBundle.shards[0].items).toEqual(feedBundle.shards[0].items);
    expect(portableBundle.markdownMirrorFallbackPlanned).toBe(true);
  });

  it("imports a portable bundle and restores metadata plus shard items", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.storageFolder = "Legacy Data";
    settings.feeds = [makeFeed({ feedId: "old-feed", items: [] })];

    const bundle = {
      version: 1,
      exportedAt: Date.now(),
      storageMode: "vault-shards",
      metadata: {
        ...cloneSettings(),
        storageMode: "vault-shards",
        storageFolder: "Imported Data/Feeds",
        feeds: [
          {
            ...makeFeed({
              feedId: "feed-1",
              title: "Imported Feed",
              url: "https://example.com/imported.xml",
              items: [],
            }),
          },
        ].map((feed) => {
          const { items: _items, ...persisted } = feed;
          void _items;
          return persisted;
        }),
      },
      shards: [
        {
          version: 1,
          feedId: "feed-1",
          feedUrl: "https://example.com/imported.xml",
          updatedAt: Date.now(),
          items: [makeFeed().items[0]],
        },
      ],
      markdownMirrorFallbackPlanned: true,
    };

    await repository.importPortableDataBundle(bundle, settings, saveData);

    expect(settings.storageMode).toBe("vault-shards");
    expect(settings.storageFolder).toBe("Imported Data/Feeds");
    expect(settings.feeds).toHaveLength(1);
    expect(settings.feeds[0].feedId).toBe("feed-1");
    expect(settings.feeds[0].items).toHaveLength(1);
    expect(
      await vaultAdapter(app).read("Imported Data/Feeds/feed-1.json"),
    ).toContain('"feedId": "feed-1"');
  });

  it("rejects portable bundle imports with unsupported schema versions", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    await expect(
      repository.importPortableDataBundle(
        {
          version: 999,
          exportedAt: Date.now(),
          storageMode: "vault-shards",
          metadata: {
            ...cloneSettings(),
            feeds: [],
          },
          shards: [],
          markdownMirrorFallbackPlanned: true,
        },
        settings,
        saveData,
      ),
    ).rejects.toThrow("Unsupported portable bundle version");
  });

  it("restores previous settings when import persistence fails", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.storageFolder = "Legacy Data";
    settings.feeds = [makeFeed({ feedId: "legacy-feed" })];

    const bundle = {
      version: 1,
      exportedAt: Date.now(),
      storageMode: "vault-shards",
      metadata: {
        ...cloneSettings(),
        storageMode: "vault-shards",
        storageFolder: "Imported Data/Feeds",
        feeds: [
          {
            ...makeFeed({
              feedId: "feed-1",
              title: "Imported Feed",
              items: [],
            }),
          },
        ].map((feed) => {
          const { items: _items, ...persisted } = feed;
          void _items;
          return persisted;
        }),
      },
      shards: [
        {
          version: 1,
          feedId: "feed-1",
          feedUrl: "https://example.com/feed.xml",
          updatedAt: Date.now(),
          items: [makeFeed().items[0]],
        },
      ],
      markdownMirrorFallbackPlanned: true,
    };

    saveData
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValue(undefined);

    await expect(
      repository.importPortableDataBundle(bundle, settings, saveData),
    ).rejects.toThrow("save failed");

    expect(settings.storageMode).toBe("legacy-json");
    expect(settings.storageFolder).toBe("Legacy Data");
    expect(settings.feeds[0].feedId).toBe("legacy-feed");
    expect(settings.feeds[0].items).toHaveLength(1);
  });

  describe("importFeedBundle", () => {
    it("applies feeds, folders, and tags but leaves app settings untouched", async () => {
      const settings = cloneSettings();
      settings.storageMode = "legacy-json";
      settings.autoBackup = true;
      settings.feeds = [makeFeed({ feedId: "old-feed", items: [] })];

      const bundle = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [
          {
            ...makeFeed({
              feedId: "feed-1",
              title: "Imported Feed",
              url: "https://example.com/imported.xml",
            }),
          },
        ].map((feed) => {
          const { items: _items, ...persisted } = feed;
          void _items;
          return persisted;
        }),
        folders: [
          {
            name: "Imported Folder",
            subfolders: [],
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          },
        ],
        availableTags: [{ name: "imported-tag", color: "#123456" }],
        shards: [
          {
            version: 1,
            feedId: "feed-1",
            feedUrl: "https://example.com/imported.xml",
            updatedAt: Date.now(),
            items: [makeFeed().items[0]],
          },
        ],
      };

      await repository.importFeedBundle(bundle, settings, saveData);

      expect(settings.feeds).toHaveLength(1);
      expect(settings.feeds[0].feedId).toBe("feed-1");
      expect(settings.feeds[0].items).toHaveLength(1);
      expect(settings.folders).toEqual(bundle.folders);
      expect(settings.availableTags).toEqual(bundle.availableTags);
      expect(settings.storageMode).toBe("legacy-json");
      expect(settings.autoBackup).toBe(true);
    });

    it("ignores settings-shaped fields present in the input", async () => {
      const settings = cloneSettings();
      settings.storageMode = "legacy-json";
      settings.autoBackup = true;
      settings.feeds = [makeFeed({ feedId: "old-feed", items: [] })];

      const bundle = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [],
        folders: [],
        availableTags: [],
        shards: [],
        storageMode: "vault-shards",
        autoBackup: false,
      };

      await repository.importFeedBundle(bundle, settings, saveData);

      expect(settings.storageMode).toBe("legacy-json");
      expect(settings.autoBackup).toBe(true);
    });

    it("rejects feed bundle imports with unsupported schema versions", async () => {
      const settings = cloneSettings();
      settings.feeds = [makeFeed({ feedId: "feed-1" })];

      await expect(
        repository.importFeedBundle(
          {
            version: 999,
            exportedAt: Date.now(),
            feeds: [],
            folders: [],
            availableTags: [],
            shards: [],
          },
          settings,
          saveData,
        ),
      ).rejects.toThrow("Unsupported feed bundle version");
    });

    it("restores previous feeds, folders, and tags when persistence fails", async () => {
      const settings = cloneSettings();
      settings.storageMode = "legacy-json";
      settings.feeds = [makeFeed({ feedId: "legacy-feed" })];
      const previousFolders = cloneSettings().folders;
      const previousTags = [{ name: "kept-tag", color: "#000000" }];
      settings.availableTags = previousTags;

      const bundle = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [
          {
            ...makeFeed({ feedId: "feed-1", items: [] }),
          },
        ].map((feed) => {
          const { items: _items, ...persisted } = feed;
          void _items;
          return persisted;
        }),
        folders: [
          {
            name: "New Folder",
            subfolders: [],
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          },
        ],
        availableTags: [{ name: "new-tag", color: "#ffffff" }],
        shards: [
          {
            version: 1,
            feedId: "feed-1",
            feedUrl: "https://example.com/feed.xml",
            updatedAt: Date.now(),
            items: [makeFeed().items[0]],
          },
        ],
      };

      saveData
        .mockRejectedValueOnce(new Error("save failed"))
        .mockResolvedValue(undefined);

      await expect(
        repository.importFeedBundle(bundle, settings, saveData),
      ).rejects.toThrow("save failed");

      expect(settings.feeds[0].feedId).toBe("legacy-feed");
      expect(settings.folders).toEqual(previousFolders);
      expect(settings.availableTags).toEqual(previousTags);
    });

    it("round-trips a feed bundle exported via buildFeedBundle with no data loss", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards";
      settings.storageFolder = "RSS Data/Feeds";
      settings.feeds = [makeFeed({ feedId: "feed-1" })];
      settings.availableTags = [{ name: "example-tag", color: "#ffffff" }];

      const bundle = repository.buildFeedBundle(settings);

      const target = cloneSettings();
      target.storageMode = "vault-shards";
      target.storageFolder = "RSS Data/Feeds";
      target.feeds = [];
      target.availableTags = [];

      await repository.importFeedBundle(bundle, target, saveData);

      expect(target.feeds).toHaveLength(1);
      expect(target.feeds[0].feedId).toBe("feed-1");
      expect(target.feeds[0].items).toEqual(settings.feeds[0].items);
      expect(target.folders).toEqual(settings.folders);
      expect(target.availableTags).toEqual(settings.availableTags);
    });
  });

  describe("importSettingsBundle", () => {
    it("applies app settings but leaves feeds, folders, and tags untouched", async () => {
      const settings = cloneSettings();
      settings.storageMode = "legacy-json";
      settings.autoBackup = false;
      const previousFeeds = [makeFeed({ feedId: "kept-feed" })];
      settings.feeds = previousFeeds;
      const previousFolders = settings.folders;
      const previousTags = settings.availableTags;

      const bundle = {
        version: 1,
        exportedAt: Date.now(),
        metadataStorageMode: "vault-location" as const,
        metadataStorageFolder: "RSS Data/Meta",
        settings: {
          ...cloneSettings(),
          storageMode: "vault-shards" as const,
          storageFolder: "RSS Data/Feeds",
          autoBackup: true,
        },
      };
      delete (bundle.settings as unknown as Record<string, unknown>).feeds;
      delete (bundle.settings as unknown as Record<string, unknown>).folders;
      delete (bundle.settings as unknown as Record<string, unknown>)
        .availableTags;

      await repository.importSettingsBundle(bundle, settings, saveData);

      expect(settings.storageMode).toBe("vault-shards");
      expect(settings.storageFolder).toBe("RSS Data/Feeds");
      expect(settings.autoBackup).toBe(true);
      expect(settings.metadataStorageMode).toBe("vault-location");
      expect(settings.metadataStorageFolder).toBe("RSS Data/Meta");
      expect(settings.feeds).toBe(previousFeeds);
      expect(settings.folders).toEqual(previousFolders);
      expect(settings.availableTags).toEqual(previousTags);
    });

    it("ignores feed, folder, and tag-shaped fields present in the input", async () => {
      const settings = cloneSettings();
      const previousFeeds = [makeFeed({ feedId: "kept-feed" })];
      settings.feeds = previousFeeds;

      const bundle = {
        version: 1,
        exportedAt: Date.now(),
        settings: cloneSettings(),
      };
      (bundle.settings as unknown as Record<string, unknown>).feeds = [
        makeFeed({ feedId: "smuggled-feed" }),
      ];
      (bundle.settings as unknown as Record<string, unknown>).folders = [];
      (bundle.settings as unknown as Record<string, unknown>).availableTags =
        [];

      await repository.importSettingsBundle(bundle, settings, saveData);

      expect(settings.feeds).toBe(previousFeeds);
      expect(settings.feeds[0].feedId).toBe("kept-feed");
    });

    it("rejects settings bundle imports with unsupported schema versions", async () => {
      const settings = cloneSettings();

      await expect(
        repository.importSettingsBundle(
          {
            version: 999,
            exportedAt: Date.now(),
            settings: cloneSettings(),
          },
          settings,
          saveData,
        ),
      ).rejects.toThrow("Unsupported settings bundle version");
    });

    it("restores previous app settings when persistence fails", async () => {
      const settings = cloneSettings();
      settings.storageMode = "legacy-json";
      settings.autoBackup = false;
      settings.feeds = [makeFeed({ feedId: "kept-feed" })];

      const bundle = {
        version: 1,
        exportedAt: Date.now(),
        settings: {
          ...cloneSettings(),
          storageMode: "vault-shards" as const,
          autoBackup: true,
        },
      };

      saveData
        .mockRejectedValueOnce(new Error("save failed"))
        .mockResolvedValue(undefined);

      await expect(
        repository.importSettingsBundle(bundle, settings, saveData),
      ).rejects.toThrow("save failed");

      expect(settings.storageMode).toBe("legacy-json");
      expect(settings.autoBackup).toBe(false);
      expect(settings.feeds[0].feedId).toBe("kept-feed");
    });

    it("round-trips a settings bundle exported via buildSettingsBundle with no data loss", async () => {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards";
      settings.storageFolder = "RSS Data/Feeds";
      settings.autoBackup = true;

      const bundle = repository.buildSettingsBundle(settings);

      const target = cloneSettings();
      target.feeds = [makeFeed({ feedId: "kept-feed" })];

      await repository.importSettingsBundle(bundle, target, saveData);

      expect(target.storageMode).toBe("vault-shards");
      expect(target.storageFolder).toBe("RSS Data/Feeds");
      expect(target.autoBackup).toBe(true);
      expect(target.feeds[0].feedId).toBe("kept-feed");
    });
  });
});

describe("storage transitions keep the deprecation prompt visible", () => {
  let app: App;
  let repository: FeedStorageRepository;
  let saveData: import("vitest").Mock<(...args: unknown[]) => Promise<void>>;

  beforeEach(() => {
    app = App.createMock();
    repository = new FeedStorageRepository(app);
    saveData = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined);
  });

  it("prompts again after reverting shard storage v1 to legacy JSON", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.feeds = [makeFeed()];

    await repository.revertToLegacyJson(settings, saveData);

    expect(settings.storageMode).toBe("legacy-json");
    expect(shouldShowStorageDeprecationPrompt(settings, "2.7.0")).toBe(true);
  });

  it("prompts again after reverting shard storage v2 to legacy JSON", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards-v2";
    settings.feeds = [makeFeed()];

    await repository.revertToLegacyJson(settings, saveData);

    expect(settings.storageMode).toBe("legacy-json");
    expect(shouldShowStorageDeprecationPrompt(settings, "2.7.0")).toBe(true);
  });

  it("prompts again after moving shard storage v2 down to v1", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards-v2";
    settings.feeds = [makeFeed()];

    await repository.migrateToVaultShards(settings, saveData);

    expect(settings.storageMode).toBe("vault-shards");
    expect(shouldShowStorageDeprecationPrompt(settings, "2.7.0")).toBe(true);
  });

  it("persists the reverted mode through the supplied save callback", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards-v2";
    settings.feeds = [makeFeed()];

    await repository.revertToLegacyJson(settings, saveData);

    expect(saveData).toHaveBeenCalledTimes(1);
    const persisted = saveData.mock.calls[0]?.[0] as RssDashboardSettings;
    expect(persisted.storageMode).toBe("legacy-json");
  });

  it("leaves the metadata location alone when reverting", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards-v2";
    settings.metadataStorageMode = "vault-location";
    settings.metadataStorageFolder = ".rss-dashboard-data";

    await repository.revertToLegacyJson(settings, saveData);

    expect(settings.metadataStorageMode).toBe("vault-location");
    expect(settings.metadataStorageFolder).toBe(".rss-dashboard-data");
  });
});

describe("findOrphanedUserState", () => {
  let app: App;
  let repository: FeedStorageRepository;

  function stubExists(result: boolean) {
    const adapter = app.vault.adapter as unknown as {
      exists: (path: string) => Promise<boolean>;
    };
    return vi.spyOn(adapter, "exists").mockResolvedValue(result);
  }

  beforeEach(() => {
    app = App.createMock();
    repository = new FeedStorageRepository(app);
  });

  it("reports nothing while shard storage v2 is active, since the file is in use", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards-v2";
    settings.metadataStorageFolder = ".rss-dashboard-data";
    stubExists(true);

    await expect(repository.findOrphanedUserState(settings)).resolves.toBeNull();
  });

  it("reports the leftover file after reverting to legacy JSON", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.metadataStorageFolder = ".rss-dashboard-data";
    stubExists(true);

    await expect(repository.findOrphanedUserState(settings)).resolves.toBe(
      ".rss-dashboard-data/user-state.json",
    );
  });

  it("reports the leftover file after stepping down to shard storage v1", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards";
    settings.metadataStorageFolder = ".rss-dashboard-data";
    stubExists(true);

    await expect(repository.findOrphanedUserState(settings)).resolves.toBe(
      ".rss-dashboard-data/user-state.json",
    );
  });

  it("reports nothing when no such file is present", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.metadataStorageFolder = ".rss-dashboard-data";
    stubExists(false);

    await expect(repository.findOrphanedUserState(settings)).resolves.toBeNull();
  });

  it("falls back to the default metadata folder when none is configured", async () => {
    const settings = cloneSettings();
    settings.storageMode = "legacy-json";
    settings.metadataStorageFolder = "";
    stubExists(true);

    await expect(repository.findOrphanedUserState(settings)).resolves.toBe(
      ".rss-dashboard-data/user-state.json",
    );
  });
});

describe("shard storage v2 user-state.json persistence (issue #278)", () => {
  let app: App;
  let repository: FeedStorageRepository;
  const userStatePath = ".rss-dashboard-data/user-state.json";

  beforeEach(() => {
    vi.restoreAllMocks();
    app = App.createMock();
    repository = new FeedStorageRepository(app);
  });

  function v2Settings(): RssDashboardSettings {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards-v2";
    settings.metadataStorageFolder = ".rss-dashboard-data";
    return settings;
  }

  async function readUserState(): Promise<{
    version: number;
    states: Record<
      string,
      {
        read?: boolean;
        starred?: boolean;
        tags?: unknown[];
        saved?: boolean;
        savedFilePath?: string;
        playbackProgress?: {
          position: number;
          duration: number;
          lastUpdated: number;
        };
      }
    >;
    unattributedLegacyStates?: Record<
      string,
      { read?: boolean; starred?: boolean }
    >;
    missingSinceByStateKey?: Record<string, number>;
    unattributedFirstObservedAtByGuid?: Record<string, number>;
    unrecognizedFeedSinceByFeedId?: Record<string, number>;
  }> {
    const raw = await vaultAdapter(app).read(userStatePath);
    return JSON.parse(raw) as {
      version: number;
      states: Record<
        string,
        {
          read?: boolean;
          starred?: boolean;
          tags?: unknown[];
          saved?: boolean;
          savedFilePath?: string;
          playbackProgress?: {
            position: number;
            duration: number;
            lastUpdated: number;
          };
        }
      >;
      unattributedLegacyStates?: Record<
        string,
        { read?: boolean; starred?: boolean }
      >;
      missingSinceByStateKey?: Record<string, number>;
      unattributedFirstObservedAtByGuid?: Record<string, number>;
      unrecognizedFeedSinceByFeedId?: Record<string, number>;
    };
  }

  async function writeFeedShard(
    settings: RssDashboardSettings,
    feedId: string,
    items: Feed["items"],
  ): Promise<void> {
    await vaultAdapter(app).write(
      `${settings.storageFolder}/${feedId}.json`,
      JSON.stringify({
        version: 1,
        feedId,
        feedUrl: "https://example.com/feed.xml",
        updatedAt: Date.now(),
        items,
      }),
    );
  }

  it("does not drop a feed's article state when its shard is corrupt and it hydrates with no items", async () => {
    const settings = v2Settings();
    settings.feeds = [
      makeFeed({ feedId: "feed-ok", items: [] }),
      makeFeed({ feedId: "feed-corrupt", items: [] }),
    ];

    await vaultAdapter(app).write(
      ".rss-dashboard-data/feeds/feed-corrupt.json",
      "{not valid json",
    );
    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({
        version: 2,
        states: { "feed-corrupt:guid-1": { starred: true } },
      }),
    );

    await repository.hydrateSettings(settings);
    await repository.saveUserStateFromFeeds(settings);

    const written = await readUserState();
    expect(written.states["feed-corrupt:guid-1"]).toMatchObject({
      starred: true,
    });
  });

  it("keeps state when a corrupt shard leaves a stale in-memory item list in place", async () => {
    const settings = v2Settings();
    // The feed already has items in memory (defaults) when its shard fails.
    const staleItem = { ...makeFeed().items[0], guid: "guid-1" };
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [staleItem] })];

    await vaultAdapter(app).write(
      ".rss-dashboard-data/feeds/feed-1.json",
      "{not valid json",
    );
    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({
        version: 2,
        states: { "feed-1:guid-1": { read: true, starred: true } },
      }),
    );

    await repository.hydrateSettings(settings);
    await repository.saveUserStateFromFeeds(settings);

    const written = await readUserState();
    expect(written.states["feed-1:guid-1"]).toMatchObject({
      read: true,
      starred: true,
    });
    expect(settings.feeds[0].items[0].read).toBe(true);
  });

  it("does not drop state for an item that real retention pruning removed from a feed", async () => {
    const settings = v2Settings();
    const saveData = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined);
    const base = makeFeed().items[0];
    const oldItem = {
      ...base,
      guid: "guid-old",
      pubDate: "2020-01-01T00:00:00Z",
      read: true,
    };
    const newItem = {
      ...base,
      guid: "guid-new",
      pubDate: "2026-01-01T00:00:00Z",
    };
    const feed = makeFeed({
      feedId: "feed-1",
      maxItemsLimit: 1,
      items: [oldItem, newItem],
    });
    settings.feeds = [feed];

    await repository.persistSettings(settings, saveData);
    expect((await readUserState()).states["feed-1:guid-old"]).toMatchObject({
      read: true,
    });

    settings.feeds = [applyFeedRetentionLimits(feed)];
    expect(settings.feeds[0].items.map((item) => item.guid)).toEqual([
      "guid-new",
    ]);

    await repository.persistSettings(settings, saveData);

    expect((await readUserState()).states["feed-1:guid-old"]).toMatchObject({
      read: true,
    });
  });

  it("migrates version-2 state values to version 3 without changing them", async () => {
    const settings = v2Settings();
    settings.storageFolder = ".rss-dashboard-data/feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];
    const state = {
      read: false,
      starred: true,
      tags: [],
      saved: true,
      savedFilePath: "Saved/article.md",
      playbackProgress: { position: 12, duration: 60, lastUpdated: 42 },
    };

    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({ version: 2, states: { "feed-1:guid-1": state } }),
    );

    await repository.saveUserStateFromFeeds(settings);

    const written = await readUserState();
    expect(written.version).toBe(3);
    expect(written.states["feed-1:guid-1"]).toEqual(state);
  });

  it("starts and expires missing-state cleanup only after a proved empty shard", async () => {
    const settings = v2Settings();
    settings.storageFolder = ".rss-dashboard-data/feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];
    const baseTime = Date.parse("2026-01-01T00:00:00Z");
    const horizon = 90 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(baseTime);

    await writeFeedShard(settings, "feed-1", []);
    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({
        version: 2,
        states: { "feed-1:guid-old": { starred: true } },
      }),
    );

    await repository.hydrateSettings(settings);
    await repository.saveUserStateFromFeeds(settings);
    let written = await readUserState();
    expect(written.states["feed-1:guid-old"]).toEqual({ starred: true });
    expect(written.missingSinceByStateKey?.["feed-1:guid-old"]).toBe(baseTime);

    vi.spyOn(Date, "now").mockReturnValue(baseTime + horizon - 1);
    await repository.saveUserStateFromFeeds(settings);
    expect((await readUserState()).states["feed-1:guid-old"]).toEqual({
      starred: true,
    });

    vi.spyOn(Date, "now").mockReturnValue(baseTime + horizon);
    await repository.saveUserStateFromFeeds(settings);
    written = await readUserState();
    expect(written.states["feed-1:guid-old"]).toBeUndefined();
    expect(written.missingSinceByStateKey?.["feed-1:guid-old"]).toBeUndefined();
  });

  it("expires every supported article-state signal through the same lifecycle", async () => {
    const settings = v2Settings();
    settings.storageFolder = ".rss-dashboard-data/feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];
    const states = {
      "feed-1:read": { read: true },
      "feed-1:starred": { starred: true },
      "feed-1:tagged": { tags: [{ name: "keep", color: "#fff" }] },
      "feed-1:saved": { saved: true },
      "feed-1:saved-file": { savedFilePath: "Saved/article.md" },
      "feed-1:playback": {
        playbackProgress: { position: 12, duration: 60, lastUpdated: 42 },
      },
    };
    const baseTime = Date.parse("2026-01-01T00:00:00Z");
    const horizon = 90 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(baseTime);

    await writeFeedShard(settings, "feed-1", []);
    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({ version: 2, states }),
    );
    await repository.hydrateSettings(settings);
    await repository.saveUserStateFromFeeds(settings);

    vi.spyOn(Date, "now").mockReturnValue(baseTime + horizon);
    await repository.saveUserStateFromFeeds(settings);

    expect((await readUserState()).states).toEqual({});
  });

  it("clears a missing marker when a later proved hydrate contains the article", async () => {
    const settings = v2Settings();
    settings.storageFolder = ".rss-dashboard-data/feeds";
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];
    const baseTime = Date.parse("2026-01-01T00:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(baseTime);

    await writeFeedShard(settings, "feed-1", []);
    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({
        version: 2,
        states: { "feed-1:guid-reappeared": { starred: true } },
      }),
    );
    await repository.hydrateSettings(settings);
    await repository.saveUserStateFromFeeds(settings);
    expect(
      (await readUserState()).missingSinceByStateKey?.[
        "feed-1:guid-reappeared"
      ],
    ).toBe(baseTime);

    await writeFeedShard(settings, "feed-1", [
      { ...makeFeed().items[0], guid: "guid-reappeared" },
    ]);
    await repository.hydrateSettings(settings);
    await repository.saveUserStateFromFeeds(settings);

    const written = await readUserState();
    expect(written.states["feed-1:guid-reappeared"]).toMatchObject({
      starred: true,
    });
    expect(
      written.missingSinceByStateKey?.["feed-1:guid-reappeared"],
    ).toBeUndefined();
  });

  it.each(["missing", "corrupt", "never-hydrated"] as const)(
    "preserves state and creates no deletion metadata for a %s shard",
    async (shardStatus) => {
      const settings = v2Settings();
      settings.storageFolder = ".rss-dashboard-data/feeds";
      settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];
      await vaultAdapter(app).write(
        userStatePath,
        JSON.stringify({
          version: 2,
          states: { "feed-1:guid-preserved": { starred: true } },
        }),
      );
      if (shardStatus === "corrupt") {
        await vaultAdapter(app).write(
          ".rss-dashboard-data/feeds/feed-1.json",
          "{not valid json",
        );
      }
      if (shardStatus !== "never-hydrated") {
        await repository.hydrateSettings(settings);
      }

      await repository.saveUserStateFromFeeds(settings);

      const written = await readUserState();
      expect(written.states["feed-1:guid-preserved"]).toEqual({
        starred: true,
      });
      expect(written.missingSinceByStateKey).toBeUndefined();
    },
  );

  it("never overwrites a user-state.json that exists but cannot be read", async () => {
    const settings = v2Settings();
    settings.feeds = [
      makeFeed({
        feedId: "feed-1",
        items: [{ ...makeFeed().items[0], guid: "guid-1", starred: true }],
      }),
    ];
    const corrupt = "{not valid json";
    await vaultAdapter(app).write(userStatePath, corrupt);

    await repository.saveUserStateFromFeeds(settings);

    expect(await vaultAdapter(app).read(userStatePath)).toBe(corrupt);
  });

  it("keeps a read-then-unread article unread after a real persist and rehydrate", async () => {
    const settings = v2Settings();
    const saveData = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined);
    const item = { ...makeFeed().items[0], guid: "guid-toggle", read: true };
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [item] })];

    await repository.persistSettings(settings, saveData);
    item.read = false;
    await repository.persistSettings(settings, saveData);

    expect(
      (await readUserState()).states["feed-1:guid-toggle"].read,
    ).toBe(false);

    // A fresh repository stands in for a restart: nothing is remembered but
    // what was written to the vault.
    const restarted = new FeedStorageRepository(app);
    const reloaded = v2Settings();
    reloaded.feeds = [makeFeed({ feedId: "feed-1", items: [] })];
    await restarted.hydrateSettings(reloaded);

    expect(reloaded.feeds[0].items[0].guid).toBe("guid-toggle");
    expect(reloaded.feeds[0].items[0].read).toBe(false);
  });

  it("preserves starred state and tags independently across a real persist and rehydrate (GH Issue #334)", async () => {
    const settings = v2Settings();
    const saveData = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined);
    const item = {
      ...makeFeed().items[0],
      guid: "guid-star-tag-independence",
      starred: false,
      tags: [],
    };
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [item] })];

    // Tag the article without starring it; the tag must survive on its own.
    item.tags = [{ name: "Favorite", color: "#111111" }];
    await repository.persistSettings(settings, saveData);

    let written = await readUserState();
    expect(written.states["feed-1:guid-star-tag-independence"]).toEqual({
      read: false,
      starred: false,
      saved: false,
      tags: [{ name: "Favorite", color: "#111111" }],
    });

    // Star the article without touching its tags; both must now persist.
    item.starred = true;
    await repository.persistSettings(settings, saveData);

    written = await readUserState();
    expect(written.states["feed-1:guid-star-tag-independence"]).toEqual({
      read: false,
      starred: true,
      saved: false,
      tags: [{ name: "Favorite", color: "#111111" }],
    });

    // Unstar the article; its tag must be untouched by the star change.
    item.starred = false;
    await repository.persistSettings(settings, saveData);

    written = await readUserState();
    expect(written.states["feed-1:guid-star-tag-independence"]).toEqual({
      read: false,
      starred: false,
      saved: false,
      tags: [{ name: "Favorite", color: "#111111" }],
    });

    // A fresh repository stands in for a restart: nothing is remembered but
    // what was written to the vault.
    const restarted = new FeedStorageRepository(app);
    const reloaded = v2Settings();
    reloaded.feeds = [makeFeed({ feedId: "feed-1", items: [] })];
    await restarted.hydrateSettings(reloaded);

    expect(reloaded.feeds[0].items[0].guid).toBe(
      "guid-star-tag-independence",
    );
    expect(reloaded.feeds[0].items[0].starred).toBe(false);
    expect(reloaded.feeds[0].items[0].tags).toEqual([
      { name: "Favorite", color: "#111111" },
    ]);
  });

  describe("feed removal versus unrecognized feed state (issue #374)", () => {
    const saveData = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined);

    it("keeps article state for a feed this device has never had", async () => {
      const settings = v2Settings();
      settings.feeds = [makeFeed({ feedId: "feed-kept", items: [] })];

      await vaultAdapter(app).write(
        userStatePath,
        JSON.stringify({
          version: 2,
          states: {
            "feed-kept:guid-1": { starred: true },
            "feed-elsewhere:guid-1": { starred: true },
          },
        }),
      );

      await repository.persistSettings(settings, saveData);

      const written = await readUserState();
      expect(written.states["feed-kept:guid-1"]).toEqual({ starred: true });
      expect(written.states["feed-elsewhere:guid-1"]).toEqual({ starred: true });
    });

    it("never lets two devices with different feed lists erase each other's state", async () => {
      // Two repositories over one vault stand in for two devices, or two
      // plugin folders, sharing user-state.json but not their feed lists.
      const desktop = v2Settings();
      desktop.feeds = [
        makeFeed({
          feedId: "desktop-feed",
          items: [makeItem({ guid: "desktop-guid", read: true })],
        }),
      ];
      const phone = v2Settings();
      phone.feeds = [
        makeFeed({
          feedId: "phone-feed",
          url: "https://example.com/phone.xml",
          items: [makeItem({ guid: "phone-guid", starred: true })],
        }),
      ];
      const phoneRepository = new FeedStorageRepository(app);

      await repository.persistSettings(desktop, saveData);
      await phoneRepository.persistSettings(phone, saveData);
      await repository.persistSettings(desktop, saveData);

      const written = await readUserState();
      expect(written.states["desktop-feed:desktop-guid"]?.read).toBe(true);
      expect(written.states["phone-feed:phone-guid"]?.starred).toBe(true);
    });

    it("removes a feed's article state and shard as soon as this device removes the feed", async () => {
      const settings = v2Settings();
      settings.storageFolder = ".rss-dashboard-data/feeds";
      settings.feeds = [
        makeFeed({
          feedId: "feed-kept",
          items: [makeItem({ guid: "kept-guid", starred: true })],
        }),
        makeFeed({
          feedId: "feed-removed",
          url: "https://example.com/removed.xml",
          items: [makeItem({ guid: "removed-guid", starred: true })],
        }),
      ];
      await repository.persistSettings(settings, saveData);

      settings.feeds = settings.feeds.filter((f) => f.feedId !== "feed-removed");
      await repository.persistSettings(settings, saveData);

      const written = await readUserState();
      expect(written.states["feed-kept:kept-guid"]?.starred).toBe(true);
      expect(written.states["feed-removed:removed-guid"]).toBeUndefined();
      expect(
        await (app.vault.adapter as unknown as {
          exists: (path: string) => Promise<boolean>;
        }).exists(".rss-dashboard-data/feeds/feed-removed.json"),
      ).toBe(false);
    });

    function threeStarredFeeds(): Feed[] {
      return ["feed-a", "feed-b", "feed-c"].map((feedId) =>
        makeFeed({
          feedId,
          url: `https://example.com/${feedId}.xml`,
          folder: feedId === "feed-a" ? "Keep" : "Drop",
          items: [makeItem({ guid: `${feedId}-guid`, starred: true })],
        }),
      );
    }

    it("removes the state of every feed when a folder of feeds is deleted at once", async () => {
      const settings = v2Settings();
      settings.feeds = threeStarredFeeds();
      await repository.persistSettings(settings, saveData);

      settings.feeds = settings.feeds.filter((f) => f.folder !== "Drop");
      await repository.persistSettings(settings, saveData);

      const written = await readUserState();
      expect(Object.keys(written.states)).toEqual(["feed-a:feed-a-guid"]);
    });

    it("removes nothing when the sidebar re-sorts the same feeds", async () => {
      const settings = v2Settings();
      settings.feeds = threeStarredFeeds();
      await repository.persistSettings(settings, saveData);

      // Sorting a folder filters its feeds out, then pushes them back sorted.
      const dropFeeds = settings.feeds.filter((f) => f.folder === "Drop");
      settings.feeds = settings.feeds.filter((f) => f.folder !== "Drop");
      settings.feeds.push(...dropFeeds.reverse());
      await repository.persistSettings(settings, saveData);

      const written = await readUserState();
      expect(Object.keys(written.states).sort()).toEqual([
        "feed-a:feed-a-guid",
        "feed-b:feed-b-guid",
        "feed-c:feed-c-guid",
      ]);
    });

    it("keeps a feed's state when a synced feed list without it is reloaded", async () => {
      const settings = v2Settings();
      settings.feeds = threeStarredFeeds();
      await repository.persistSettings(settings, saveData);

      // Another device's data.json arrives without feed-c and is reloaded.
      const reloaded = v2Settings();
      reloaded.feeds = threeStarredFeeds().filter((f) => f.feedId !== "feed-c");
      await repository.hydrateSettings(reloaded);
      await repository.persistSettings(reloaded, saveData);

      const written = await readUserState();
      expect(written.states["feed-c:feed-c-guid"]).toEqual({
        read: false,
        starred: true,
        saved: false,
      });
    });

    it("applies a removal on the next successful save when the first save was skipped", async () => {
      const settings = v2Settings();
      settings.feeds = threeStarredFeeds();
      await repository.persistSettings(settings, saveData);
      const healthy = await vaultAdapter(app).read(userStatePath);

      // An unreadable user-state.json is never overwritten, so the save that
      // follows the removal is skipped.
      await vaultAdapter(app).write(userStatePath, "{ not json");
      settings.feeds = settings.feeds.filter((f) => f.feedId !== "feed-c");
      await repository.persistSettings(settings, saveData);
      expect(await vaultAdapter(app).read(userStatePath)).toBe("{ not json");

      await vaultAdapter(app).write(userStatePath, healthy);
      await repository.persistSettings(settings, saveData);

      const written = await readUserState();
      expect(written.states["feed-c:feed-c-guid"]).toBeUndefined();
      expect(written.states["feed-b:feed-b-guid"]?.starred).toBe(true);
    });

    describe("expiry of unrecognized feed state", () => {
      const baseTime = Date.parse("2026-01-01T00:00:00Z");
      const horizon = 90 * 24 * 60 * 60 * 1000;

      async function seedStateFor(feedIds: string[]): Promise<void> {
        await vaultAdapter(app).write(
          userStatePath,
          JSON.stringify({
            version: 3,
            states: Object.fromEntries(
              feedIds.map((feedId) => [`${feedId}:guid-1`, { starred: true }]),
            ),
          }),
        );
      }

      function feedWithoutItems(feedId: string): Feed {
        return makeFeed({
          feedId,
          url: `https://example.com/${feedId}.xml`,
          items: [],
        });
      }

      it("expires state for a feed this device never lists once 90 days pass", async () => {
        const settings = v2Settings();
        settings.feeds = [feedWithoutItems("feed-here")];
        await seedStateFor(["feed-here", "feed-elsewhere"]);

        vi.spyOn(Date, "now").mockReturnValue(baseTime);
        await repository.persistSettings(settings, saveData);
        vi.spyOn(Date, "now").mockReturnValue(baseTime + horizon - 1);
        await repository.persistSettings(settings, saveData);
        expect(
          (await readUserState()).states["feed-elsewhere:guid-1"],
        ).toEqual({ starred: true });

        vi.spyOn(Date, "now").mockReturnValue(baseTime + horizon);
        await repository.persistSettings(settings, saveData);

        const written = await readUserState();
        expect(written.states["feed-elsewhere:guid-1"]).toBeUndefined();
        expect(written.states["feed-here:guid-1"]).toEqual({ starred: true });
      });

      it("restarts the clock when an unrecognized feed joins this device's list and later leaves it", async () => {
        const settings = v2Settings();
        settings.feeds = [feedWithoutItems("feed-here")];
        await seedStateFor(["feed-here", "feed-arriving"]);

        vi.spyOn(Date, "now").mockReturnValue(baseTime);
        await repository.persistSettings(settings, saveData);

        // The synced feed list that includes the feed arrives 60 days later.
        const later = baseTime + horizon * (2 / 3);
        vi.spyOn(Date, "now").mockReturnValue(later);
        const arrived = v2Settings();
        arrived.feeds = [
          feedWithoutItems("feed-here"),
          feedWithoutItems("feed-arriving"),
        ];
        await repository.hydrateSettings(arrived);
        await repository.persistSettings(arrived, saveData);
        let written = await readUserState();
        expect(written.states["feed-arriving:guid-1"]).toEqual({ starred: true });
        expect(written.unrecognizedFeedSinceByFeedId).toBeUndefined();

        // A later reload drops it again: a fresh 90-day clock, not the old one.
        const dropped = v2Settings();
        dropped.feeds = [feedWithoutItems("feed-here")];
        await repository.hydrateSettings(dropped);
        await repository.persistSettings(dropped, saveData);
        vi.spyOn(Date, "now").mockReturnValue(baseTime + horizon);
        await repository.persistSettings(dropped, saveData);

        written = await readUserState();
        expect(written.states["feed-arriving:guid-1"]).toEqual({ starred: true });
        expect(written.unrecognizedFeedSinceByFeedId?.["feed-arriving"]).toBe(
          later,
        );
      });

      it("restarts the clock when the stored timestamp is not a valid time", async () => {
        const settings = v2Settings();
        settings.feeds = [feedWithoutItems("feed-here")];
        await vaultAdapter(app).write(
          userStatePath,
          JSON.stringify({
            version: 3,
            states: { "feed-elsewhere:guid-1": { starred: true } },
            unrecognizedFeedSinceByFeedId: { "feed-elsewhere": "soon" },
          }),
        );

        vi.spyOn(Date, "now").mockReturnValue(baseTime + horizon * 2);
        await repository.persistSettings(settings, saveData);

        const written = await readUserState();
        expect(written.states["feed-elsewhere:guid-1"]).toEqual({ starred: true });
        expect(written.unrecognizedFeedSinceByFeedId?.["feed-elsewhere"]).toBe(
          baseTime + horizon * 2,
        );
      });
    });

    it("keeps a removed feed's state when the feed returns before the removal is saved", async () => {
      const settings = v2Settings();
      settings.feeds = threeStarredFeeds();
      await repository.persistSettings(settings, saveData);
      const healthy = await vaultAdapter(app).read(userStatePath);

      await vaultAdapter(app).write(userStatePath, "{ not json");
      const removed = settings.feeds.find((f) => f.feedId === "feed-c") as Feed;
      settings.feeds = settings.feeds.filter((f) => f !== removed);
      await repository.persistSettings(settings, saveData);

      settings.feeds.push(removed);
      await vaultAdapter(app).write(userStatePath, healthy);
      await repository.persistSettings(settings, saveData);

      const written = await readUserState();
      expect(written.states["feed-c:feed-c-guid"]?.starred).toBe(true);
    });
  });

  it("does not clobber preserved state with default flags when a feed's items become available mid-session", async () => {
    const settings = v2Settings();
    // "feed-1" starts with no items in memory (its shard failed to read, or
    // hadn't synced yet), so its preserved state can't be applied to any
    // item by hydrateSettings this session.
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];

    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({
        version: 2,
        states: {
          "feed-1:guid-1": { read: true, starred: true },
        },
      }),
    );

    // A save while the feed is still empty must preserve the entry untouched.
    await repository.saveUserStateFromFeeds(settings);
    let written = await readUserState();
    expect(written.states["feed-1:guid-1"]).toEqual({
      read: true,
      starred: true,
    });

    // The feed's shard now reads successfully mid-session (e.g. a refresh),
    // populating it with a freshly parsed item that carries only parser
    // defaults, not the previously persisted read/starred state.
    settings.feeds[0].items = [
      { ...makeFeed().items[0], guid: "guid-1", read: false, starred: false },
    ];

    await repository.saveUserStateFromFeeds(settings);
    written = await readUserState();

    expect(written.states["feed-1:guid-1"]).toEqual({
      read: true,
      starred: true,
    });
    expect(settings.feeds[0].items[0].read).toBe(true);
    expect(settings.feeds[0].items[0].starred).toBe(true);
  });

  it("keeps independent state for two feeds that carry an identical GUID", async () => {
    const settings = v2Settings();
    const sharedGuid = "https://example.com/shared-guid";
    settings.feeds = [
      makeFeed({
        feedId: "feed-a",
        items: [
          { ...makeFeed().items[0], guid: sharedGuid, starred: true, read: false },
        ],
      }),
      makeFeed({
        feedId: "feed-b",
        items: [
          { ...makeFeed().items[0], guid: sharedGuid, starred: false, read: true },
        ],
      }),
    ];

    await repository.saveUserStateFromFeeds(settings);

    const written = await readUserState();
    expect(written.states[`feed-a:${sharedGuid}`]).toMatchObject({
      starred: true,
      read: false,
    });
    expect(written.states[`feed-b:${sharedGuid}`]).toMatchObject({
      starred: false,
      read: true,
    });
  });

  it("persists an explicit false when an article is marked read then unread, and keeps the entry", async () => {
    const settings = v2Settings();
    const item = { ...makeFeed().items[0], guid: "guid-toggle", read: true };
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [item] })];

    await repository.saveUserStateFromFeeds(settings);
    let written = await readUserState();
    expect(written.states["feed-1:guid-toggle"]).toMatchObject({ read: true });

    item.read = false;
    await repository.saveUserStateFromFeeds(settings);
    written = await readUserState();

    expect(written.states["feed-1:guid-toggle"]).toBeDefined();
    expect(written.states["feed-1:guid-toggle"].read).toBe(false);
  });

  it("re-hydrates an explicit unread state instead of treating the missing entry as never-read", async () => {
    const settings = v2Settings();
    settings.storageMode = "vault-shards-v2";
    const item = { ...makeFeed().items[0], guid: "guid-toggle", read: false };
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [item] })];

    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({
        version: 2,
        states: {
          "feed-1:guid-toggle": { read: false, starred: true },
        },
      }),
    );

    // Simulate another device's stale in-memory copy still marking it read,
    // then re-hydrating from the persisted (explicit-false) state.
    item.read = true;
    await repository.hydrateSettings(settings);

    expect(settings.feeds[0].items[0].read).toBe(false);
    expect(settings.feeds[0].items[0].starred).toBe(true);
  });

  it("migrates a legacy bare-GUID user-state.json to the feed-qualified shape without losing state", async () => {
    const settings = v2Settings();
    settings.storageFolder = ".rss-dashboard-data/feeds";
    const item = { ...makeFeed().items[0], guid: "guid-legacy" };
    settings.feeds = [makeFeed({ feedId: "feed-1", items: [] })];

    await vaultAdapter(app).write(
      ".rss-dashboard-data/feeds/feed-1.json",
      JSON.stringify({
        version: 1,
        feedId: "feed-1",
        feedUrl: settings.feeds[0].url,
        updatedAt: Date.now(),
        items: [item],
      }),
    );
    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({
        version: 1,
        states: {
          "guid-legacy": { starred: true, read: true },
        },
      }),
    );

    await repository.hydrateSettings(settings);

    expect(settings.feeds[0].items[0].starred).toBe(true);
    expect(settings.feeds[0].items[0].read).toBe(true);

    await repository.saveUserStateFromFeeds(settings);
    const written = await readUserState();

    expect(written.version).toBe(3);
    expect(written.states["guid-legacy"]).toBeUndefined();
    expect(written.states["feed-1:guid-legacy"]).toMatchObject({
      starred: true,
      read: true,
    });
  });

  it("retains legacy bare-GUID state for a feed that has not hydrated yet, then attributes it once it does", async () => {
    const settings = v2Settings();
    // "feed-late" isn't configured/hydrated in this session yet.
    settings.feeds = [makeFeed({ feedId: "feed-ready", items: [] })];

    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({
        version: 1,
        states: {
          "guid-late": { starred: true },
        },
      }),
    );

    await repository.saveUserStateFromFeeds(settings);
    let written = await readUserState();
    expect(written.states["guid-late"]).toBeUndefined();
    expect(written.unattributedLegacyStates?.["guid-late"]).toEqual({
      starred: true,
    });

    settings.feeds.push(
      makeFeed({
        feedId: "feed-late",
        items: [],
      }),
    );
    await writeFeedShard(settings, "feed-late", [
      { ...makeFeed().items[0], guid: "guid-late" },
    ]);
    await repository.hydrateSettings(settings);
    await repository.saveUserStateFromFeeds(settings);
    written = await readUserState();

    expect(written.states["feed-late:guid-late"]).toMatchObject({
      starred: true,
    });
    expect(written.unattributedLegacyStates?.["guid-late"]).toBeUndefined();
  });

  it("does not let an unproved in-memory item claim legacy state, then expires it", async () => {
    const settings = v2Settings();
    settings.storageFolder = ".rss-dashboard-data/feeds";
    settings.feeds = [
      makeFeed({
        feedId: "feed-stale",
        items: [{ ...makeFeed().items[0], guid: "guid-legacy" }],
      }),
    ];
    const baseTime = Date.parse("2026-01-01T00:00:00Z");
    const horizon = 90 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(baseTime);
    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({
        version: 1,
        states: { "guid-legacy": { starred: true } },
      }),
    );

    await repository.hydrateSettings(settings);
    await repository.saveUserStateFromFeeds(settings);
    let written = await readUserState();
    expect(written.states["feed-stale:guid-legacy"]).toBeUndefined();
    expect(written.unattributedLegacyStates?.["guid-legacy"]).toEqual({
      starred: true,
    });
    expect(written.unattributedFirstObservedAtByGuid?.["guid-legacy"]).toBe(
      baseTime,
    );

    vi.spyOn(Date, "now").mockReturnValue(baseTime + horizon);
    await repository.saveUserStateFromFeeds(settings);
    written = await readUserState();
    expect(written.unattributedLegacyStates?.["guid-legacy"]).toBeUndefined();
    expect(
      written.unattributedFirstObservedAtByGuid?.["guid-legacy"],
    ).toBeUndefined();
  });
});

describe("user-state.json health flag", () => {
  const userStatePath = ".rss-dashboard-data/user-state.json";
  let app: App;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = App.createMock();
  });

  function v2Settings(): RssDashboardSettings {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards-v2";
    settings.feeds = [
      makeFeed({
        feedId: "feed-1",
        items: [{ ...makeFeed().items[0], guid: "guid-1", starred: true }],
      }),
    ];
    return settings;
  }

  it("reports unreadable and notifies once when hydrate finds a corrupt file", async () => {
    const onUserStateHealthChange = vi.fn();
    const repository = new FeedStorageRepository(app, {
      onUserStateHealthChange,
    });
    await vaultAdapter(app).write(userStatePath, "{not valid json");

    expect(repository.isUserStateUnreadable()).toBe(false);
    await repository.hydrateSettings(v2Settings());

    expect(repository.isUserStateUnreadable()).toBe(true);
    expect(onUserStateHealthChange).toHaveBeenCalledTimes(1);
  });

  it("keeps the flag set without re-notifying while the file stays corrupt", async () => {
    const onUserStateHealthChange = vi.fn();
    const repository = new FeedStorageRepository(app, {
      onUserStateHealthChange,
    });
    const settings = v2Settings();
    await vaultAdapter(app).write(userStatePath, "{not valid json");

    await repository.hydrateSettings(settings);
    await repository.saveUserStateFromFeeds(settings);
    await repository.saveUserStateFromFeeds(settings);

    expect(repository.isUserStateUnreadable()).toBe(true);
    expect(onUserStateHealthChange).toHaveBeenCalledTimes(1);
  });

  it("clears the flag and notifies once the file is readable again", async () => {
    const onUserStateHealthChange = vi.fn();
    const repository = new FeedStorageRepository(app, {
      onUserStateHealthChange,
    });
    const settings = v2Settings();
    await vaultAdapter(app).write(userStatePath, "{not valid json");
    await repository.hydrateSettings(settings);

    await vaultAdapter(app).write(
      userStatePath,
      JSON.stringify({ version: 2, states: {} }),
    );
    await repository.saveUserStateFromFeeds(settings);

    expect(repository.isUserStateUnreadable()).toBe(false);
    expect(onUserStateHealthChange).toHaveBeenCalledTimes(2);
  });

  it("stays healthy when there is simply no user-state.json yet", async () => {
    const onUserStateHealthChange = vi.fn();
    const repository = new FeedStorageRepository(app, {
      onUserStateHealthChange,
    });
    const settings = v2Settings();

    await repository.hydrateSettings(settings);
    await repository.saveUserStateFromFeeds(settings);

    expect(repository.isUserStateUnreadable()).toBe(false);
    expect(onUserStateHealthChange).not.toHaveBeenCalled();
  });
});

describe("removing a feed deletes its shard file", () => {
  let app: App;
  let repository: FeedStorageRepository;
  const saveData = vi
    .fn<(...args: unknown[]) => Promise<void>>()
    .mockResolvedValue(undefined);

  beforeEach(() => {
    vi.restoreAllMocks();
    app = App.createMock();
    repository = new FeedStorageRepository(app);
  });

  async function shardExists(feedId: string): Promise<boolean> {
    const adapter = app.vault.adapter as unknown as {
      exists: (path: string) => Promise<boolean>;
    };
    return adapter.exists(`.rss-dashboard-data/feeds/${feedId}.json`);
  }

  for (const storageMode of ["vault-shards", "vault-shards-v2"] as const) {
    it(`removes the shard from disk after the feed is deleted (${storageMode})`, async () => {
      const settings = cloneSettings();
      settings.storageMode = storageMode;
      settings.feeds = [
        makeFeed({ feedId: "feed-keep" }),
        makeFeed({ feedId: "feed-delete", url: "https://example.com/other.xml" }),
      ];

      await repository.persistSettings(settings, saveData);
      expect(await shardExists("feed-delete")).toBe(true);

      settings.feeds = settings.feeds.filter((f) => f.feedId !== "feed-delete");
      await repository.persistSettings(settings, saveData);

      expect(await shardExists("feed-delete")).toBe(false);
      expect(await shardExists("feed-keep")).toBe(true);
    });
  }

  it("removes shards from the previous folder when the storage folder changes", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards-v2";
    settings.feeds = [makeFeed({ feedId: "feed-1" })];

    await repository.persistSettings(settings, saveData);
    expect(await shardExists("feed-1")).toBe(true);

    settings.storageFolder = ".rss-dashboard-data/moved-feeds";
    await repository.persistSettings(settings, saveData);

    expect(await shardExists("feed-1")).toBe(false);
    const adapter = app.vault.adapter as unknown as {
      exists: (path: string) => Promise<boolean>;
    };
    expect(
      await adapter.exists(".rss-dashboard-data/moved-feeds/feed-1.json"),
    ).toBe(true);
  });

  describe("the previous storage folder after a folder change", () => {
    const adapter = () =>
      app.vault.adapter as unknown as {
        exists: (path: string) => Promise<boolean>;
        write: (path: string, content: string) => Promise<void>;
      };

    async function moveFeeds(from: string, to: string, extraFile?: string) {
      const settings = cloneSettings();
      settings.storageMode = "vault-shards-v2";
      settings.storageFolder = from;
      settings.metadataStorageFolder = ".rss-dashboard-data";
      settings.feeds = [makeFeed({ feedId: "feed-1" })];
      await repository.persistSettings(settings, saveData);
      if (extraFile) await adapter().write(extraFile, "user content");

      settings.storageFolder = to;
      await repository.persistSettings(settings, saveData);
    }

    it("is removed once the move leaves it empty", async () => {
      await moveFeeds(".rss-dashboard-data/feeds", ".rss-test/feeds");

      expect(await adapter().exists(".rss-dashboard-data/feeds")).toBe(false);
      expect(await adapter().exists(".rss-test/feeds/feed-1.json")).toBe(true);
    });

    it("keeps its parent while the parent still holds user-state.json", async () => {
      await moveFeeds(
        ".rss-dashboard-data/feeds",
        ".rss-test/feeds",
        ".rss-dashboard-data/user-state.json",
      );

      expect(await adapter().exists(".rss-dashboard-data/user-state.json")).toBe(true);
      expect(await adapter().exists(".rss-dashboard-data")).toBe(true);
    });

    it("removes a parent folder the move left empty", async () => {
      await moveFeeds(".rss-test/feeds", ".rss-test2/feeds");

      expect(await adapter().exists(".rss-test")).toBe(false);
    });

    it("sends a visible folder to the user's trash rather than deleting it", async () => {
      const trashFile = vi.spyOn(app.fileManager, "trashFile");

      await moveFeeds("RSS Data/Feeds", "RSS Data/Moved");

      expect(trashFile).toHaveBeenCalledWith(
        expect.objectContaining({ path: "RSS Data/Feeds" }),
      );
      expect(await adapter().exists("RSS Data/Feeds")).toBe(false);
    });

    it("is kept when it still contains a file that is not a moved shard", async () => {
      await moveFeeds(
        ".rss-dashboard-data/feeds",
        ".rss-test/feeds",
        ".rss-dashboard-data/feeds/notes.txt",
      );

      expect(await adapter().exists(".rss-dashboard-data/feeds/notes.txt")).toBe(true);
    });
  });

  it("still trashes an indexed shard through the file manager", async () => {
    const settings = cloneSettings();
    settings.storageMode = "vault-shards-v2";
    settings.feeds = [
      makeFeed({ feedId: "feed-keep" }),
      makeFeed({ feedId: "feed-delete", url: "https://example.com/other.xml" }),
    ];
    await repository.persistSettings(settings, saveData);

    // Outside a dot-folder Obsidian indexes the file, giving it a TFile.
    await app.vault.create(".rss-dashboard-data/feeds/feed-delete.json", "{}");
    const trashSpy = vi.spyOn(app.fileManager, "trashFile");
    const removeSpy = vi.spyOn(app.vault.adapter, "remove");

    settings.feeds = settings.feeds.filter((f) => f.feedId !== "feed-delete");
    await repository.persistSettings(settings, saveData);

    expect(trashSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).not.toHaveBeenCalled();
    expect(await shardExists("feed-delete")).toBe(false);
  });
});
