/**
 * Article-state-only persistence (#1384).
 *
 * A read, star, tag, saved, or playback change must be able to persist without
 * the feed-content pass: no feed enumeration for shards, no shard reads, no
 * shard writes, and no shard deletes. These tests drive the public
 * hydrate/persist surface against the mock vault and assert which files change.
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
const METADATA_FOLDER = "rss-dashboard-data";
const USER_STATE_PATH = `${METADATA_FOLDER}/user-state.json`;
const SHARD_PATH = `${SHARD_FOLDER}/feed-1.json`;

interface VaultAdapterStub {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
}

function adapter(app: App): VaultAdapterStub {
  return app.vault.adapter as unknown as VaultAdapterStub;
}

/** The mock vault keeps adapter-written files in a private map. */
function adapterFiles(app: App): Map<string, string> {
  return (app.vault as unknown as { adapterFiles: Map<string, string> })
    .adapterFiles;
}

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Article",
    link: "https://example.com/a",
    description: "",
    pubDate: "2026-01-01T00:00:00Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

function makeFeed(feedId: string, items: FeedItem[]): Feed {
  return {
    title: "Example Feed",
    url: "https://example.com/feed.xml",
    folder: "RSS",
    items,
    lastUpdated: 0,
    feedId,
  };
}

function settingsFor(
  storageMode: RssDashboardSettings["storageMode"],
  feeds: Feed[],
): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.storageMode = storageMode;
  settings.storageFolder = SHARD_FOLDER;
  settings.metadataStorageFolder = METADATA_FOLDER;
  settings.feeds = feeds;
  return settings;
}

async function writeShard(app: App, items: FeedItem[]): Promise<string> {
  const content = JSON.stringify({
    version: 1,
    feedId: "feed-1",
    feedUrl: "https://example.com/feed.xml",
    updatedAt: 0,
    items,
  });
  await adapter(app).write(SHARD_PATH, content);
  return content;
}

function noopSaveData(): Promise<void> {
  return Promise.resolve();
}

function shardCalls(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map(([path]) => String(path))
    .filter((path) => path.startsWith(SHARD_FOLDER));
}

describe("article-state-only persistence (#1384)", () => {
  let app: App;

  beforeEach(async () => {
    app = App.createMock();
    await adapter(app).mkdir(SHARD_FOLDER);
  });

  it("writes only user-state.json for a scoped save in Shard storage v2", async () => {
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor("vault-shards-v2", [
      makeFeed("feed-1", [makeItem({ read: false })]),
    ]);
    await repository.persistSettings(settings, noopSaveData, {
      forceAllShards: true,
      forceMetadata: true,
    });
    const shardBefore = adapterFiles(app).get(SHARD_PATH);
    const saveData = vi
      .fn<(data: unknown) => Promise<void>>()
      .mockResolvedValue(undefined);
    const write = vi.spyOn(adapter(app), "write");
    const read = vi.spyOn(adapter(app), "read");
    settings.feeds[0].items[0].read = true;

    const result = await repository.persistSettings(settings, saveData, {
      scope: "article-state",
    });

    expect(result).toEqual({
      metadataSaved: false,
      shardWriteCount: 0,
      shardDeleteCount: 0,
    });
    expect(saveData).not.toHaveBeenCalled();
    expect(shardCalls(write)).toEqual([]);
    expect(shardCalls(read)).toEqual([]);
    expect(adapterFiles(app).get(SHARD_PATH)).toBe(shardBefore);
    const userState = JSON.parse(
      adapterFiles(app).get(USER_STATE_PATH) ?? "",
    ) as { states: Record<string, { read?: boolean }> };
    expect(userState.states["feed-1:guid-1"]?.read).toBe(true);
  });

  it("does not write the removed feed's shard or its state in a scoped save", async () => {
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor("vault-shards-v2", [
      makeFeed("feed-1", [makeItem()]),
    ]);
    await repository.persistSettings(settings, noopSaveData, {
      forceAllShards: true,
      forceMetadata: true,
    });
    const write = vi.spyOn(adapter(app), "write");
    const remove = vi.spyOn(adapter(app), "remove");

    await repository.persistSettings(settings, noopSaveData, {
      scope: "article-state",
    });

    expect(shardCalls(write)).toEqual([]);
    expect(shardCalls(remove)).toEqual([]);
  });

  it("touches no shard in Shard storage v1, which keeps state inside shard content", async () => {
    const repository = new FeedStorageRepository(app);
    const shardBefore = await writeShard(app, [makeItem()]);
    await repository.hydrateSettings(
      settingsFor("vault-shards", [makeFeed("feed-1", [])]),
    );
    const settings = settingsFor("vault-shards", [
      makeFeed("feed-1", [makeItem({ read: true })]),
    ]);
    const saveData = vi
      .fn<(data: unknown) => Promise<void>>()
      .mockResolvedValue(undefined);
    const write = vi.spyOn(adapter(app), "write");
    const read = vi.spyOn(adapter(app), "read");

    const result = await repository.persistSettings(settings, saveData, {
      scope: "article-state",
    });

    expect(result.shardWriteCount).toBe(0);
    expect(shardCalls(write)).toEqual([]);
    expect(shardCalls(read)).toEqual([]);
    expect(saveData).not.toHaveBeenCalled();
    expect(adapterFiles(app).get(SHARD_PATH)).toBe(shardBefore);
  });

  it("writes only data.json for a scoped save in Legacy JSON storage", async () => {
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor("legacy-json", [
      makeFeed("feed-1", [makeItem({ read: true })]),
    ]);
    const saveData = vi
      .fn<(data: unknown) => Promise<void>>()
      .mockResolvedValue(undefined);
    const write = vi.spyOn(adapter(app), "write");

    const result = await repository.persistSettings(settings, saveData, {
      scope: "article-state",
    });

    expect(result).toEqual({
      metadataSaved: true,
      shardWriteCount: 0,
      shardDeleteCount: 0,
    });
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(shardCalls(write)).toEqual([]);
  });

  it("keeps the full persistence pass when no scope is given", async () => {
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor("vault-shards-v2", [
      makeFeed("feed-1", [makeItem({ read: true })]),
    ]);

    await repository.persistSettings(settings, noopSaveData);

    expect(adapterFiles(app).has(SHARD_PATH)).toBe(true);
    expect(adapterFiles(app).has(USER_STATE_PATH)).toBe(true);
  });
});
