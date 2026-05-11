import { describe, it, expect, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";

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

describe("FeedStorageRepository", () => {
  let app: App;
  let repository: FeedStorageRepository;
  let saveData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    app = App.createMock();
    repository = new FeedStorageRepository(app);
    saveData = vi.fn().mockResolvedValue(undefined);
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

    await app.vault.adapter.write(
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
            items: expect.anything(),
          }),
        ],
      }),
    );
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
});
