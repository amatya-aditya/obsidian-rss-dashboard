/**
 * Characterization tests for `FeedStorageRepository`'s hydrate/persist storage
 * mechanics, pinned before `hydrateSettings` and `persistSettings` move into a
 * runner module (#1144). They drive the public hydrate/persist surface against
 * the mock vault and assert the files on disk, covering the boundaries the
 * extraction's scoped checklist names: a full hydrate, a missing shard, a
 * corrupt shard, the v2 user-state round-trip, a storage-folder move, removed
 * feed shard GC, the "nothing to rebuild" skip, and the legacy early returns.
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

interface VaultAdapterStub {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
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
  storageFolder = SHARD_FOLDER,
): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.storageMode = storageMode;
  settings.storageFolder = storageFolder;
  settings.metadataStorageFolder = METADATA_FOLDER;
  settings.feeds = feeds;
  return settings;
}

async function writeShard(
  app: App,
  feedId: string,
  items: FeedItem[],
  folder = SHARD_FOLDER,
): Promise<void> {
  await adapter(app).write(
    `${folder}/${feedId}.json`,
    JSON.stringify({
      version: 1,
      feedId,
      feedUrl: "https://example.com/feed.xml",
      updatedAt: 0,
      items,
    }),
  );
}

function noopSaveData(): Promise<void> {
  return Promise.resolve();
}

describe("FeedStorageRepository hydrate/persist storage mechanics (characterization, #1144)", () => {
  let app: App;

  beforeEach(async () => {
    app = App.createMock();
    await adapter(app).mkdir(SHARD_FOLDER);
  });

  it("hydrates every feed from its shard and reports the shard count", async () => {
    const repository = new FeedStorageRepository(app);
    await writeShard(app, "feed-1", [makeItem({ guid: "a", read: true })]);
    await writeShard(app, "feed-2", [makeItem({ guid: "b" })]);
    const settings = settingsFor("vault-shards", [
      makeFeed("feed-1", []),
      makeFeed("feed-2", []),
    ]);

    const result = await repository.hydrateSettings(settings);

    expect(result).toEqual({
      didChange: false,
      shardCount: 2,
      userStateLoaded: false,
    });
    expect(settings.feeds.map((feed) => feed.items.length)).toEqual([1, 1]);
    expect(settings.feeds[0].items[0].read).toBe(true);
    expect(repository.getFeedShardHealth(settings.feeds[0])).toBeNull();
    expect(repository.isShardFolderHiddenFromSync()).toBe(false);
  });

  it("marks a genuinely missing shard missing and leaves its feed empty", async () => {
    const repository = new FeedStorageRepository(app);
    await writeShard(app, "feed-1", [makeItem()]);
    const settings = settingsFor("vault-shards", [
      makeFeed("feed-1", []),
      makeFeed("feed-2", []),
    ]);

    const result = await repository.hydrateSettings(settings);

    expect(result.shardCount).toBe(1);
    expect(settings.feeds[1].items).toEqual([]);
    expect(repository.getFeedShardHealth(settings.feeds[1])).toBe("missing");
  });

  it("marks a corrupt shard corrupt, warns once, and leaves its feed empty", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const repository = new FeedStorageRepository(app);
    await adapter(app).write(`${SHARD_FOLDER}/feed-1.json`, "{not json");
    const settings = settingsFor("vault-shards", [makeFeed("feed-1", [])]);

    await repository.hydrateSettings(settings);

    expect(repository.getFeedShardHealth(settings.feeds[0])).toBe("corrupt");
    expect(settings.feeds[0].items).toEqual([]);
    const notices = debug.mock.calls.filter(([tag]) => tag === "[Stub Notice]");
    expect(notices).toHaveLength(1);
    expect(String(notices[0][1])).toContain(
      'Failed to read shard for "Example Feed"',
    );
  });

  it("flags a hidden storage folder when no feed's shard is present", async () => {
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor(
      "vault-shards",
      [makeFeed("feed-1", [])],
      ".rss-dashboard-data/feeds",
    );

    await repository.hydrateSettings(settings);

    expect(repository.isShardFolderHiddenFromSync()).toBe(true);
  });

  it("round-trips read, starred, saved, tags, and playback through user-state.json", async () => {
    const tag = { name: "later", color: "#ff0000" };
    const playbackProgress = { position: 42, duration: 600, lastUpdated: 1 };
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor("vault-shards-v2", [
      makeFeed("feed-1", [
        makeItem({
          guid: "guid-1",
          read: true,
          starred: true,
          saved: true,
          savedFilePath: "RSS/Article.md",
          tags: [tag],
          playbackProgress,
        }),
      ]),
    ]);

    await repository.persistSettings(settings, noopSaveData, {
      forceAllShards: true,
      forceMetadata: true,
    });

    const written = JSON.parse(
      await adapter(app).read(USER_STATE_PATH),
    ) as Record<string, unknown>;
    expect(
      (written.states as Record<string, unknown>)["feed-1:guid-1"],
    ).toEqual({
      read: true,
      starred: true,
      saved: true,
      tags: [tag],
      savedFilePath: "RSS/Article.md",
      playbackProgress,
    });

    // A fresh session reads the state back from user-state.json.
    const rehydrated = settingsFor("vault-shards-v2", [makeFeed("feed-1", [])]);
    await new FeedStorageRepository(app).hydrateSettings(rehydrated);

    const [item] = rehydrated.feeds[0].items;
    expect(item).toMatchObject({
      read: true,
      starred: true,
      saved: true,
      savedFilePath: "RSS/Article.md",
      tags: [tag],
      playbackProgress,
    });
  });

  it("moves shards to the new folder and prunes the emptied previous folder", async () => {
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor(
      "vault-shards",
      [makeFeed("feed-1", [makeItem()])],
      "old-data/feeds",
    );

    await repository.persistSettings(settings, noopSaveData);
    expect(adapterFiles(app).has("old-data/feeds/feed-1.json")).toBe(true);

    settings.storageFolder = "new-data/feeds";
    await repository.persistSettings(settings, noopSaveData);

    expect(adapterFiles(app).has("old-data/feeds/feed-1.json")).toBe(false);
    expect(adapterFiles(app).has("new-data/feeds/feed-1.json")).toBe(true);
    expect(await adapter(app).exists("old-data/feeds")).toBe(false);
    expect(await adapter(app).exists("old-data")).toBe(false);
  });

  it("deletes a removed feed's shard and article state", async () => {
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor("vault-shards-v2", [
      makeFeed("feed-1", [makeItem({ guid: "a", read: true })]),
      makeFeed("feed-2", [makeItem({ guid: "b", starred: true })]),
    ]);

    await repository.persistSettings(settings, noopSaveData, {
      forceAllShards: true,
      forceMetadata: true,
    });
    expect(adapterFiles(app).has(`${SHARD_FOLDER}/feed-2.json`)).toBe(true);

    settings.feeds = [settings.feeds[0]];
    await repository.persistSettings(settings, noopSaveData);

    expect(adapterFiles(app).has(`${SHARD_FOLDER}/feed-2.json`)).toBe(false);
    const written = JSON.parse(
      await adapter(app).read(USER_STATE_PATH),
    ) as Record<string, unknown>;
    expect(Object.keys(written.states as object)).not.toContain(
      "feed-2:guid-b",
    );
  });

  it("does not write an empty shard for a feed whose shard was missing at startup", async () => {
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor("vault-shards", [makeFeed("feed-1", [])]);

    await repository.hydrateSettings(settings);
    await repository.persistSettings(settings, noopSaveData);

    expect(adapterFiles(app).has(`${SHARD_FOLDER}/feed-1.json`)).toBe(false);
  });

  it("returns the legacy early results and writes no shards in legacy JSON mode", async () => {
    const saveData = vi
      .fn<(data: unknown) => Promise<void>>()
      .mockResolvedValue(undefined);
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor("legacy-json", [
      makeFeed("feed-1", [makeItem()]),
    ]);

    const hydrated = await repository.hydrateSettings(settings);

    expect(hydrated).toMatchObject({ didChange: false, shardCount: 0 });
    expect(settings.feeds[0].items).toHaveLength(1);

    await repository.persistSettings(settings, saveData);

    expect(saveData).toHaveBeenCalledTimes(1);
    expect(adapterFiles(app).has(`${SHARD_FOLDER}/feed-1.json`)).toBe(false);
  });

  it("assigns a missing feed ID on hydrate and reports didChange", async () => {
    const repository = new FeedStorageRepository(app);
    const settings = settingsFor("legacy-json", [makeFeed("", [])]);

    const hydrated = await repository.hydrateSettings(settings);

    expect(hydrated.didChange).toBe(true);
    expect(settings.feeds[0].feedId).toBeTruthy();
  });
});
