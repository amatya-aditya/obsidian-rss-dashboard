import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import { applyFeedRetentionLimits } from "../../../src/services/feed-parser/feed-retention";
import {
  DEFAULT_SETTINGS,
  type ArticleUserState,
  type Feed,
  type FeedItem,
  type PersistedRssDashboardSettings,
  type RssDashboardSettings,
} from "../../../src/types/types";

const DAY = 24 * 60 * 60 * 1000;
const BASE_TIME = Date.parse("2026-01-01T00:00:00Z");
const STATE_KEY = "feed-1:guid-restored";
const OMITTED_KEY = "feed-1:guid-omitted";
const USER_STATE_PATH = "RSS Data/user-state.json";
const SHARD_PATH = "RSS Data/Feeds/feed-1.json";
const SAVED_NOTE_PATH = "Saved/article.md";
const RESTORED_STATE: ArticleUserState = {
  read: true,
  starred: true,
  tags: [{ name: "keep", color: "#fff" }],
  saved: true,
  savedFilePath: SAVED_NOTE_PATH,
  playbackProgress: { position: 12, duration: 60, lastUpdated: BASE_TIME },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeItem(guid: string, pubDate: string): FeedItem {
  return {
    guid,
    title: guid,
    link: `https://example.com/${guid}`,
    pubDate,
    description: "Article description",
    content: "Restored article content",
    feedTitle: "Example feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
  };
}

async function prepareRestore(kind: "feed" | "portable") {
  const clock = vi.spyOn(Date, "now").mockReturnValue(BASE_TIME);
  const app = App.createMock();
  let repository = new FeedStorageRepository(app);
  let settings: RssDashboardSettings = {
    ...clone(DEFAULT_SETTINGS),
    storageMode: "vault-shards-v2",
    storageFolder: "RSS Data/Feeds",
    metadataStorageFolder: "RSS Data",
    feeds: [
      {
        feedId: "feed-1",
        title: "Example feed",
        url: "https://example.com/feed.xml",
        folder: "RSS",
        lastUpdated: BASE_TIME,
        maxItemsLimit: 1,
        items: [
          {
            ...makeItem("guid-restored", "2020-01-01"),
            ...clone(RESTORED_STATE),
          },
          { ...makeItem("guid-omitted", "2020-01-02"), read: true },
          makeItem("guid-recent", "2026-01-01"),
        ],
      },
    ],
  };
  let metadataJson = "";
  const saveData = (data: unknown): Promise<void> => {
    // Persist bytes, not a reference to live settings that import can mutate.
    metadataJson = JSON.stringify(data);
    return Promise.resolve();
  };
  const save = () => repository.persistSettings(settings, saveData);
  const reload = async (freshRepository = true) => {
    const metadata = JSON.parse(metadataJson) as PersistedRssDashboardSettings;
    settings = {
      ...metadata,
      feeds: metadata.feeds.map((feed): Feed => ({ ...feed, items: [] })),
    };
    if (freshRepository) repository = new FeedStorageRepository(app);
    await repository.hydrateSettings(settings);
  };
  const state = () => repository.loadUserState(settings);
  const atDay = (day: number) => clock.mockReturnValue(BASE_TIME + day * DAY);
  const addParserItem = () => {
    settings.feeds[0].items.push(makeItem("guid-restored", "2020-01-01"));
  };

  await app.vault.adapter.mkdir("Saved");
  await app.vault.adapter.write(SAVED_NOTE_PATH, "Saved article contents");
  await save();
  const exported = clone(settings);
  // This second missing article is deliberately not part of the restoration.
  exported.feeds[0].items = exported.feeds[0].items.filter(
    (item) => item.guid !== "guid-omitted",
  );
  const bundle = clone(
    kind === "feed"
      ? repository.buildFeedBundle(exported)
      : repository.buildPortableDataBundle(exported),
  );
  const prune = () => {
    settings.feeds = settings.feeds.map((feed) =>
      applyFeedRetentionLimits(feed, {
        protections: {
          protectStarred: false,
          protectSaved: false,
          protectTagged: false,
          protectUnread: false,
        },
      }),
    );
  };
  prune();
  expect(settings.feeds[0].items.map((item) => item.guid)).toEqual([
    "guid-recent",
  ]);
  await save();
  await reload();
  await save();
  expect((await state())?.missingSinceByStateKey?.[STATE_KEY]).toBe(BASE_TIME);
  expect((await state())?.missingSinceByStateKey?.[OMITTED_KEY]).toBe(
    BASE_TIME,
  );

  const restore = async () => {
    if (kind === "feed") {
      await repository.importFeedBundle(bundle, settings, saveData);
    } else {
      await repository.importPortableDataBundle(bundle, settings, saveData);
    }
  };
  const expectRestored = async () => {
    // Reload immediately after the tested save. A second save of the live
    // imported flags could repair the deleted state and mask this regression.
    await reload();
    expect(
      settings.feeds[0].items.find((item) => item.guid === "guid-restored"),
    ).toMatchObject({ ...RESTORED_STATE, content: "Restored article content" });
    expect((await state())?.states[STATE_KEY]).toEqual(RESTORED_STATE);
    expect(await app.vault.adapter.read(SAVED_NOTE_PATH)).toBe(
      "Saved article contents",
    );
  };
  return {
    app,
    atDay,
    save,
    reload,
    state,
    prune,
    restore,
    expectRestored,
    addParserItem,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.empty();
});

describe.each(["feed", "portable"] as const)(
  "%s bundle restored-state GC",
  (kind) => {
    it("preserves restored state on the first import after the old timer expires", async () => {
      const fixture = await prepareRestore(kind);
      fixture.atDay(91);
      await fixture.reload();
      await fixture.restore();
      await fixture.expectRestored();
    });

    it("preserves restored state on a later save across the old deadline", async () => {
      const fixture = await prepareRestore(kind);
      fixture.atDay(89);
      await fixture.reload();
      await fixture.restore();
      fixture.atDay(91);
      await fixture.save();
      await fixture.expectRestored();
    });

    it("does not start another absence timer from the pre-import shard snapshot", async () => {
      const fixture = await prepareRestore(kind);
      fixture.atDay(89);
      await fixture.restore();
      fixture.atDay(181);
      await fixture.save();
      await fixture.expectRestored();
    });

    it("still expires absent state that the bundle did not restore", async () => {
      const fixture = await prepareRestore(kind);
      fixture.atDay(91);
      await fixture.restore();
      expect((await fixture.state())?.states[OMITTED_KEY]).toBeUndefined();
      expect(
        (await fixture.state())?.missingSinceByStateKey?.[OMITTED_KEY],
      ).toBeUndefined();
    });

    it("starts a fresh horizon when a later hydration proves the restored article absent again", async () => {
      const fixture = await prepareRestore(kind);
      fixture.atDay(89);
      await fixture.restore();
      fixture.atDay(92);
      fixture.prune();
      await fixture.save();
      await fixture.reload(false);
      await fixture.save();
      expect((await fixture.state())?.missingSinceByStateKey?.[STATE_KEY]).toBe(
        BASE_TIME + 92 * DAY,
      );
      fixture.atDay(181);
      await fixture.save();
      expect((await fixture.state())?.states[STATE_KEY]).toEqual(
        RESTORED_STATE,
      );
      fixture.atDay(182);
      await fixture.save();
      expect((await fixture.state())?.states[STATE_KEY]).toBeUndefined();
    });

    it("preserves restored state before the old deadline", async () => {
      const fixture = await prepareRestore(kind);
      fixture.atDay(89);
      await fixture.restore();
      await fixture.expectRestored();
    });

    it("preserves state when the restored shard is hydrated before the old deadline", async () => {
      const fixture = await prepareRestore(kind);
      fixture.atDay(89);
      await fixture.restore();
      await fixture.reload();
      fixture.atDay(91);
      await fixture.save();
      await fixture.expectRestored();
    });

    it("preserves an import after an earlier save already collected the old state", async () => {
      const fixture = await prepareRestore(kind);
      fixture.atDay(91);
      await fixture.save();
      expect((await fixture.state())?.states[STATE_KEY]).toBeUndefined();
      await fixture.restore();
      await fixture.expectRestored();
    });

    it.each(["missing", "corrupt"])(
      "does not make a %s shard proof for unrelated missing state",
      async (health) => {
        const fixture = await prepareRestore(kind);
        if (health === "missing") {
          await fixture.app.vault.adapter.remove(SHARD_PATH);
        } else {
          await fixture.app.vault.adapter.write(SHARD_PATH, "{not valid json");
        }
        fixture.atDay(91);
        await fixture.reload();
        await fixture.restore();
        expect((await fixture.state())?.states[OMITTED_KEY]).toMatchObject({
          read: true,
        });
        expect(
          (await fixture.state())?.missingSinceByStateKey?.[OMITTED_KEY],
        ).toBe(BASE_TIME);
        await fixture.expectRestored();
      },
    );

    it("never overwrites unreadable user state during a replacing import", async () => {
      const fixture = await prepareRestore(kind);
      const unreadable = "{not valid json";
      await fixture.app.vault.adapter.write(USER_STATE_PATH, unreadable);
      fixture.atDay(91);
      await fixture.restore();
      expect(await fixture.app.vault.adapter.read(USER_STATE_PATH)).toBe(
        unreadable,
      );
    });
    it("does not invalidate absence evidence when the import state write fails and rolls back", async () => {
      const fixture = await prepareRestore(kind);
      const write = fixture.app.vault.adapter.write.bind(
        fixture.app.vault.adapter,
      );
      let failed = false;
      vi.spyOn(fixture.app.vault.adapter, "write").mockImplementation(
        async (path, data) => {
          if (path === USER_STATE_PATH && !failed) {
            failed = true;
            throw new Error("state write failed");
          }
          await write(path, data);
        },
      );
      fixture.atDay(89);
      await expect(fixture.restore()).rejects.toThrow("state write failed");
      expect((await fixture.state())?.missingSinceByStateKey?.[STATE_KEY]).toBe(
        BASE_TIME,
      );
      fixture.atDay(91);
      await fixture.save();
      expect((await fixture.state())?.states[STATE_KEY]).toBeUndefined();
    });
  },
);

it("does not let ordinary parser items invalidate the prior absence evidence", async () => {
  const fixture = await prepareRestore("feed");
  fixture.atDay(89);
  fixture.addParserItem();
  await fixture.save();
  expect((await fixture.state())?.states[STATE_KEY]).toEqual(RESTORED_STATE);
  expect((await fixture.state())?.missingSinceByStateKey?.[STATE_KEY]).toBe(
    BASE_TIME,
  );
  fixture.atDay(91);
  await fixture.save();
  expect((await fixture.state())?.states[STATE_KEY]).toBeUndefined();
});
