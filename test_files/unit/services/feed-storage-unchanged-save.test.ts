/**
 * A save that changes no feed still has to notice a shard that went missing or
 * corrupt on disk. It does so by comparing the shard's size and modified time
 * with what this device last verified, and reads the file only when they
 * differ, so an idle save does not read every shard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

const SHARD_FOLDER = "rss-dashboard-data/feeds";
const SHARD_PATH = `${SHARD_FOLDER}/feed-1.json`;

function adapterFiles(app: App): Map<string, string> {
  return (app.vault as unknown as { adapterFiles: Map<string, string> })
    .adapterFiles;
}

function shardReads(readSpy: { mock: { calls: unknown[][] } }): string[] {
  return readSpy.mock.calls
    .map(([path]) => String(path))
    .filter((path) => path.startsWith(`${SHARD_FOLDER}/`));
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

function makeSettings(): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.storageMode = "vault-shards-v2";
  settings.storageFolder = SHARD_FOLDER;
  settings.feeds = Array.from({ length: 3 }, (_, i) =>
    makeFeed(`feed-${i}`, [makeItem(`g${i}`)]),
  );
  return settings;
}

describe("save of unchanged feeds", () => {
  let app: App;
  let repository: FeedStorageRepository;
  let settings: RssDashboardSettings;
  const saveData = vi.fn(() => Promise.resolve());

  beforeEach(async () => {
    app = new App();
    repository = new FeedStorageRepository(app);
    settings = makeSettings();
    await repository.persistSettings(settings, saveData, {
      forceAllShards: true,
    });
  });

  it("reads each unchanged shard at most once across repeated saves", async () => {
    const readSpy = vi.spyOn(app.vault.adapter, "read");

    const first = await repository.persistSettings(settings, saveData);
    const second = await repository.persistSettings(settings, saveData);
    const third = await repository.persistSettings(settings, saveData);

    expect(first.shardWriteCount).toBe(0);
    expect(second.shardWriteCount).toBe(0);
    expect(third.shardWriteCount).toBe(0);
    expect(shardReads(readSpy).length).toBeLessThanOrEqual(3);
    readSpy.mockClear();
    await repository.persistSettings(settings, saveData);
    expect(shardReads(readSpy)).toEqual([]);
  });

  it("rewrites a shard that was deleted from disk", async () => {
    await repository.persistSettings(settings, saveData);
    await repository.persistSettings(settings, saveData);
    adapterFiles(app).delete(SHARD_PATH);

    const result = await repository.persistSettings(settings, saveData);

    expect(result.shardWriteCount).toBe(1);
    expect(adapterFiles(app).get(SHARD_PATH)).toContain('"g1"');
  });

  it("rewrites a shard that was truncated on disk after it was verified", async () => {
    await repository.persistSettings(settings, saveData);
    await repository.persistSettings(settings, saveData);
    await app.vault.adapter.write(SHARD_PATH, '{"feedId":"feed-1","ite');

    const result = await repository.persistSettings(settings, saveData);

    expect(result.shardWriteCount).toBe(1);
    expect(adapterFiles(app).get(SHARD_PATH)).toContain('"g1"');
  });

  it("leaves a valid shard that another device changed, and reads it once", async () => {
    await repository.persistSettings(settings, saveData);
    await repository.persistSettings(settings, saveData);
    const foreign = JSON.stringify({
      feedId: "feed-1",
      feedUrl: "https://example.com/feed-1.xml",
      updatedAt: 1,
      items: [makeItem("from-another-device")],
    });
    await app.vault.adapter.write(SHARD_PATH, foreign);
    const readSpy = vi.spyOn(app.vault.adapter, "read");

    const result = await repository.persistSettings(settings, saveData);
    await repository.persistSettings(settings, saveData);

    expect(result.shardWriteCount).toBe(0);
    expect(adapterFiles(app).get(SHARD_PATH)).toBe(foreign);
    expect(shardReads(readSpy)).toEqual([SHARD_PATH]);
  });

  it("still writes only the feed whose articles changed", async () => {
    await repository.persistSettings(settings, saveData);
    settings.feeds[2].items.push(makeItem("new"));

    const result = await repository.persistSettings(settings, saveData);

    expect(result.shardWriteCount).toBe(1);
    expect(adapterFiles(app).get(`${SHARD_FOLDER}/feed-2.json`)).toContain(
      '"new"',
    );
  });
});
