/**
 * #1521 AC-020: a start that no save or watcher event touches computes no
 * comparable form of any shard; the first save writes exactly the shards that
 * changed and still detects a shard that changed on disk.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import * as shardModule from "../../../src/services/feed-storage-shard";
import * as storageJson from "../../../src/services/storage-json";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

vi.mock("../../../src/services/feed-storage-shard", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../../src/services/feed-storage-shard")
    >();
  return {
    ...actual,
    createComparableFeedShardJson: vi.fn(actual.createComparableFeedShardJson),
  };
});

vi.mock("../../../src/services/storage-json", async (importActual) => {
  const actual =
    await importActual<typeof import("../../../src/services/storage-json")>();
  return {
    ...actual,
    comparableSnapshotJson: vi.fn(actual.comparableSnapshotJson),
  };
});

const SHARD_FOLDER = "rss-dashboard-data/feeds";

function adapterFiles(app: App): Map<string, string> {
  return (app.vault as unknown as { adapterFiles: Map<string, string> })
    .adapterFiles;
}

function makeItem(guid: string): FeedItem {
  return {
    title: "Article",
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: "2026-01-01T00:00:00Z",
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
  };
}

function makeFeed(feedId: string, items: FeedItem[]): Feed {
  return {
    title: feedId,
    url: `https://example.com/${feedId}.xml`,
    folder: "RSS",
    items,
    lastUpdated: 0,
    feedId,
  };
}

function makeSettings(feeds: Feed[]): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.storageMode = "vault-shards-v2";
  settings.storageFolder = SHARD_FOLDER;
  settings.feeds = feeds;
  return settings;
}

function emptyFeeds(count: number): RssDashboardSettings {
  return makeSettings(
    Array.from({ length: count }, (_, i) => makeFeed(`feed-${i}`, [])),
  );
}

describe("lazy change-detection record (#1521)", () => {
  let app: App;
  let repository: FeedStorageRepository;
  const saveData = vi.fn(() => Promise.resolve());

  beforeEach(async () => {
    app = new App();
    repository = new FeedStorageRepository(app);
    const seeded = makeSettings(
      Array.from({ length: 4 }, (_, i) =>
        makeFeed(`feed-${i}`, [makeItem(`g${i}`)]),
      ),
    );
    await repository.persistSettings(seeded, saveData, {
      forceAllShards: true,
    });
    repository = new FeedStorageRepository(app);
    vi.mocked(shardModule.createComparableFeedShardJson).mockClear();
    vi.mocked(storageJson.comparableSnapshotJson).mockClear();
  });

  it("computes no comparable form of any shard while hydrating", async () => {
    const settings = emptyFeeds(4);
    await repository.hydrateSettings(settings);

    expect(settings.feeds.every((f) => f.items.length === 1)).toBe(true);
    expect(shardModule.createComparableFeedShardJson).not.toHaveBeenCalled();
    const shardComparables = vi
      .mocked(storageJson.comparableSnapshotJson)
      .mock.calls.filter(([value]) => "feedUrl" in value);
    expect(shardComparables).toHaveLength(0);
  });

  it("writes exactly the changed shard on the first save", async () => {
    const settings = emptyFeeds(4);
    await repository.hydrateSettings(settings);
    settings.feeds[2].items.push(makeItem("new"));

    const result = await repository.persistSettings(settings, saveData);

    expect(result.shardWriteCount).toBe(1);
    expect(adapterFiles(app).get(`${SHARD_FOLDER}/feed-2.json`)).toContain(
      '"new"',
    );
  });

  it("detects a shard that changed on disk after the load", async () => {
    const settings = emptyFeeds(4);
    await repository.hydrateSettings(settings);
    const path = `${SHARD_FOLDER}/feed-1.json`;
    const onDisk = adapterFiles(app).get(path) ?? "";
    const foreign = JSON.parse(onDisk) as { items: FeedItem[] };
    foreign.items.push(makeItem("foreign"));

    expect(
      await repository.ownWrites.hasUnseenChange(path, () =>
        Promise.resolve(JSON.stringify(foreign)),
      ),
    ).toBe(true);
    expect(
      await repository.ownWrites.hasUnseenChange(path, () =>
        Promise.resolve(onDisk),
      ),
    ).toBe(false);
  });
});
