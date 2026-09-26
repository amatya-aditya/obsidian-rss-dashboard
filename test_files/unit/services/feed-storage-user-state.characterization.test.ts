/**
 * Characterization tests for Shard storage v2 article state (#465), pinned
 * before `user-state.json` handling moves out of `FeedStorageRepository`
 * (#436, phase 5). They cover what `feed-storage-repository.test.ts` does
 * not: the written file's shape, the save's folder and write-wrapper
 * contract, hydrate's reset of items without state, and which storage modes
 * touch the file at all. They only use the repository's public methods,
 * which stay as delegates after the extraction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

const USER_STATE_PATH = ".rss-dashboard-data/user-state.json";
const SHARD_FOLDER = ".rss-dashboard-data/feeds";

interface VaultAdapterStub {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

function adapter(app: App): VaultAdapterStub {
  return app.vault.adapter as unknown as VaultAdapterStub;
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
  settings.metadataStorageFolder = ".rss-dashboard-data";
  settings.feeds = feeds;
  return settings;
}

async function writeShard(app: App, feedId: string, items: FeedItem[]) {
  await adapter(app).write(
    `${SHARD_FOLDER}/${feedId}.json`,
    JSON.stringify({
      version: 1,
      feedId,
      feedUrl: "https://example.com/feed.xml",
      updatedAt: 0,
      items,
    }),
  );
}

async function readJson(app: App, path = USER_STATE_PATH) {
  return JSON.parse(await adapter(app).read(path)) as Record<string, unknown>;
}

type WriteWrapper = <T>(fn: () => Promise<T>) => Promise<T>;

const noopSaveData = () => Promise.resolve();

describe("Shard storage v2 article state (characterization, #465)", () => {
  let app: App;

  beforeEach(async () => {
    app = App.createMock();
    await adapter(app).mkdir(SHARD_FOLDER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("the user-state.json it writes", () => {
    it("is version 3 with a sync nonce and padding, and omits empty bookkeeping maps", async () => {
      const repository = new FeedStorageRepository(app);
      const settings = settingsFor("vault-shards-v2", [
        makeFeed("feed-1", [makeItem({ read: true })]),
      ]);

      await repository.saveUserStateFromFeeds(settings);

      const written = await readJson(app);
      expect(Object.keys(written).sort()).toEqual(
        ["_syncNonce", "_syncPad", "states", "version"].sort(),
      );
      expect(written.version).toBe(3);
      expect(typeof written._syncNonce).toBe("string");
      expect(written._syncPad).toEqual(expect.stringContaining("sync-size-anchor"));
    });

    it("gets a new sync nonce on every save, even when the state is unchanged", async () => {
      const repository = new FeedStorageRepository(app);
      const settings = settingsFor("vault-shards-v2", [
        makeFeed("feed-1", [makeItem({ read: true })]),
      ]);

      await repository.saveUserStateFromFeeds(settings);
      const first = (await readJson(app))._syncNonce;
      await repository.saveUserStateFromFeeds(settings);
      const second = (await readJson(app))._syncNonce;

      expect(second).not.toBe(first);
    });

    it("records read, starred and saved on every entry, and tags, saved path and playback only when set", async () => {
      const repository = new FeedStorageRepository(app);
      const playbackProgress = { position: 42, duration: 600, lastUpdated: 1 };
      const tag = { name: "later", color: "#ff0000" };
      const settings = settingsFor("vault-shards-v2", [
        makeFeed("feed-1", [
          makeItem({ guid: "plain-read", read: true }),
          makeItem({
            guid: "everything",
            starred: true,
            saved: true,
            savedFilePath: "RSS/Article.md",
            tags: [tag],
            playbackProgress,
          }),
        ]),
      ]);

      await repository.saveUserStateFromFeeds(settings);

      const states = (await readJson(app)).states as Record<string, unknown>;
      expect(states["feed-1:plain-read"]).toEqual({
        read: true,
        starred: false,
        saved: false,
      });
      expect(states["feed-1:everything"]).toEqual({
        read: false,
        starred: true,
        saved: true,
        tags: [tag],
        savedFilePath: "RSS/Article.md",
        playbackProgress,
      });
    });

    it("leaves out articles that have no state and no entry yet, but keeps one with only a playback position", async () => {
      const repository = new FeedStorageRepository(app);
      const settings = settingsFor("vault-shards-v2", [
        makeFeed("feed-1", [
          makeItem({ guid: "untouched" }),
          makeItem({
            guid: "listened",
            playbackProgress: { position: 5, duration: 60, lastUpdated: 1 },
          }),
        ]),
      ]);

      await repository.saveUserStateFromFeeds(settings);

      const states = (await readJson(app)).states as Record<string, unknown>;
      expect(Object.keys(states)).toEqual(["feed-1:listened"]);
    });
  });

  describe("where and how it saves", () => {
    it("creates the metadata folder when it does not exist yet", async () => {
      const repository = new FeedStorageRepository(app);
      const settings = settingsFor("vault-shards-v2", [
        makeFeed("feed-1", [makeItem({ starred: true })]),
      ]);
      settings.metadataStorageFolder = "/Meta/State/";

      await repository.saveUserStateFromFeeds(settings);

      expect(await adapter(app).exists("Meta/State/user-state.json")).toBe(true);
    });

    it("falls back to .rss-dashboard-data when the metadata folder setting is blank", async () => {
      const repository = new FeedStorageRepository(app);
      const settings = settingsFor("vault-shards-v2", [
        makeFeed("feed-1", [makeItem({ starred: true })]),
      ]);
      settings.metadataStorageFolder = "   ";

      await repository.saveUserStateFromFeeds(settings);

      expect(await adapter(app).exists(USER_STATE_PATH)).toBe(true);
    });

    it("routes exactly one write per save through the write wrapper", async () => {
      const writeWrapper = vi.fn(<T,>(fn: () => Promise<T>) => fn());
      const repository = new FeedStorageRepository(app, {
        writeWrapper: writeWrapper as unknown as WriteWrapper,
      });
      const settings = settingsFor("vault-shards-v2", [
        makeFeed("feed-1", [makeItem({ starred: true })]),
      ]);

      await repository.saveUserStateFromFeeds(settings);

      expect(writeWrapper).toHaveBeenCalledTimes(1);
      expect(await adapter(app).exists(USER_STATE_PATH)).toBe(true);
    });

    it("does not call the write wrapper or create the folder when there is nothing to record", async () => {
      const writeWrapper = vi.fn(<T,>(fn: () => Promise<T>) => fn());
      const repository = new FeedStorageRepository(app, {
        writeWrapper: writeWrapper as unknown as WriteWrapper,
      });
      const settings = settingsFor("vault-shards-v2", [
        makeFeed("feed-1", [makeItem()]),
      ]);
      settings.metadataStorageFolder = "Meta";

      await repository.saveUserStateFromFeeds(settings);

      expect(writeWrapper).not.toHaveBeenCalled();
      expect(await adapter(app).exists("Meta")).toBe(false);
    });

    it("shows the unreadable-file notice once per session and never writes over the file", async () => {
      const writeWrapper = vi.fn(<T,>(fn: () => Promise<T>) => fn());
      const notices = vi.spyOn(console, "debug").mockImplementation(() => {});
      const repository = new FeedStorageRepository(app, {
        writeWrapper: writeWrapper as unknown as WriteWrapper,
      });
      const settings = settingsFor("vault-shards-v2", [
        makeFeed("feed-1", [makeItem({ starred: true })]),
      ]);
      await adapter(app).write(USER_STATE_PATH, "{not json");

      await repository.saveUserStateFromFeeds(settings);
      await repository.saveUserStateFromFeeds(settings);

      const userStateNotices = notices.mock.calls.filter(
        ([tag, message]) =>
          tag === "[Stub Notice]" &&
          String(message).includes("user-state.json could not be read"),
      );
      expect(userStateNotices).toHaveLength(1);
      expect(writeWrapper).not.toHaveBeenCalled();
    });
  });

  describe("loadUserState", () => {
    it("returns null when there is no file", async () => {
      const repository = new FeedStorageRepository(app);

      expect(
        await repository.loadUserState(settingsFor("vault-shards-v2", [])),
      ).toBeNull();
    });

    it("returns null for a file whose states are missing", async () => {
      const repository = new FeedStorageRepository(app);
      await adapter(app).write(USER_STATE_PATH, JSON.stringify({ version: 3 }));

      expect(
        await repository.loadUserState(settingsFor("vault-shards-v2", [])),
      ).toBeNull();
    });

    it("returns the file as stored, without migrating it", async () => {
      const repository = new FeedStorageRepository(app);
      const stored = { version: 1, states: { "bare-guid": { read: true } } };
      await adapter(app).write(USER_STATE_PATH, JSON.stringify(stored));

      expect(
        await repository.loadUserState(settingsFor("vault-shards-v2", [])),
      ).toEqual(stored);
    });
  });

  describe("hydrating article state", () => {
    it("resets an article with no entry to unread, unstarred, untagged and unsaved", async () => {
      const repository = new FeedStorageRepository(app);
      // The shard still carries flags from an older, pre-v2 layout.
      await writeShard(app, "feed-1", [
        makeItem({
          read: true,
          starred: true,
          saved: true,
          savedFilePath: "RSS/Old.md",
          tags: [{ name: "old", color: "#000000" }],
          playbackProgress: { position: 1, duration: 2, lastUpdated: 3 },
        }),
      ]);
      await adapter(app).write(
        USER_STATE_PATH,
        JSON.stringify({ version: 3, states: {} }),
      );
      const settings = settingsFor("vault-shards-v2", [makeFeed("feed-1", [])]);

      const result = await repository.hydrateSettings(settings);

      expect(result.userStateLoaded).toBe(true);
      const [item] = settings.feeds[0].items;
      expect(item.read).toBe(false);
      expect(item.starred).toBe(false);
      expect(item.saved).toBe(false);
      expect(item.tags).toEqual([]);
      expect(item).not.toHaveProperty("savedFilePath");
      expect(item).not.toHaveProperty("playbackProgress");
    });

    it("applies an entry's missing flags as false", async () => {
      const repository = new FeedStorageRepository(app);
      await writeShard(app, "feed-1", [makeItem({ read: true, saved: true })]);
      await adapter(app).write(
        USER_STATE_PATH,
        JSON.stringify({ version: 3, states: { "feed-1:guid-1": { starred: true } } }),
      );
      const settings = settingsFor("vault-shards-v2", [makeFeed("feed-1", [])]);

      await repository.hydrateSettings(settings);

      const [item] = settings.feeds[0].items;
      expect(item.starred).toBe(true);
      expect(item.read).toBe(false);
      expect(item.saved).toBe(false);
      expect(item.tags).toEqual([]);
    });

    it("reports userStateLoaded false when there is no file", async () => {
      const repository = new FeedStorageRepository(app);
      await writeShard(app, "feed-1", [makeItem()]);
      const settings = settingsFor("vault-shards-v2", [makeFeed("feed-1", [])]);

      const result = await repository.hydrateSettings(settings);

      expect(result.userStateLoaded).toBe(false);
    });

    it("adopts the stored state for an article that arrives after hydration, including saved path and playback", async () => {
      const repository = new FeedStorageRepository(app);
      const playbackProgress = { position: 30, duration: 90, lastUpdated: 7 };
      await adapter(app).write(
        USER_STATE_PATH,
        JSON.stringify({
          version: 3,
          states: {
            "feed-1:guid-1": {
              read: true,
              saved: true,
              savedFilePath: "RSS/Saved.md",
              playbackProgress,
            },
          },
        }),
      );
      // The shard is missing at startup, so the article is first seen later.
      const settings = settingsFor("vault-shards-v2", [makeFeed("feed-1", [])]);
      await repository.hydrateSettings(settings);
      settings.feeds[0].items = [makeItem()];

      await repository.saveUserStateFromFeeds(settings);

      const [item] = settings.feeds[0].items;
      expect(item.read).toBe(true);
      expect(item.saved).toBe(true);
      expect(item.savedFilePath).toBe("RSS/Saved.md");
      expect(item.playbackProgress).toEqual(playbackProgress);
      expect(item.starred).toBe(false);
    });
  });

  describe("storage modes other than Shard storage v2", () => {
    it("neither reads nor applies user-state.json when hydrating Shard storage v1", async () => {
      const repository = new FeedStorageRepository(app);
      await writeShard(app, "feed-1", [makeItem({ read: true })]);
      await adapter(app).write(
        USER_STATE_PATH,
        JSON.stringify({ version: 3, states: { "feed-1:guid-1": { starred: true } } }),
      );
      const settings = settingsFor("vault-shards", [makeFeed("feed-1", [])]);

      const result = await repository.hydrateSettings(settings);

      expect(result.userStateLoaded).toBe(false);
      const [item] = settings.feeds[0].items;
      expect(item.read).toBe(true);
      expect(item.starred).toBe(false);
    });

    it("does not write user-state.json when persisting Shard storage v1", async () => {
      const repository = new FeedStorageRepository(app);
      const settings = settingsFor("vault-shards", [
        makeFeed("feed-1", [makeItem({ starred: true })]),
      ]);

      await repository.persistSettings(settings, noopSaveData);

      expect(await adapter(app).exists(USER_STATE_PATH)).toBe(false);
    });

    it("does not write user-state.json when persisting Legacy JSON", async () => {
      const repository = new FeedStorageRepository(app);
      const settings = settingsFor("legacy-json", [
        makeFeed("feed-1", [makeItem({ starred: true })]),
      ]);

      await repository.persistSettings(settings, noopSaveData);

      expect(await adapter(app).exists(USER_STATE_PATH)).toBe(false);
    });
  });

  describe("expiry clocks", () => {
    it("restarts an article's missing clock when its stored timestamp is not a valid time", async () => {
      const repository = new FeedStorageRepository(app);
      const now = Date.parse("2026-06-01T00:00:00Z");
      vi.spyOn(Date, "now").mockReturnValue(now);
      // An empty, readable shard proves the article is gone from the feed.
      await writeShard(app, "feed-1", []);
      await adapter(app).write(
        USER_STATE_PATH,
        JSON.stringify({
          version: 3,
          states: { "feed-1:gone": { read: true } },
          missingSinceByStateKey: { "feed-1:gone": "yesterday" },
        }),
      );
      const settings = settingsFor("vault-shards-v2", [makeFeed("feed-1", [])]);
      await repository.hydrateSettings(settings);

      await repository.saveUserStateFromFeeds(settings);

      const written = await readJson(app);
      expect(written.states).toEqual({ "feed-1:gone": { read: true } });
      expect(written.missingSinceByStateKey).toEqual({ "feed-1:gone": now });
    });
  });
});
