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

import {
  BUNDLE_KINDS,
  type BundleKind,
  buildBundle,
  importBundle,
  failNextStateWrite,
} from "./bundle-import-fixture";

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

async function prepareRestore(
  kind: BundleKind,
  restoredState: ArticleUserState = RESTORED_STATE,
) {
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
  const saveAuthoritatively = () =>
    repository.persistSettings(settings, saveData, {
      authoritativeArticleState: true,
    });
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
  const markRestoredRead = () => {
    const restored = settings.feeds[0].items.find(
      (item) => item.guid === "guid-restored",
    );
    if (!restored) throw new Error("Expected restored fixture article");
    restored.read = true;
  };
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
  exported.feeds[0].items[0] = {
    ...makeItem("guid-restored", "2020-01-01"),
    ...clone(restoredState),
  };
  const bundle = buildBundle(repository, kind, exported);
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

  const restore = () =>
    importBundle(repository, kind, bundle, settings, saveData);
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
    saveAuthoritatively,
    reload,
    state,
    prune,
    restore,
    expectRestored,
    addParserItem,
    markRestoredRead,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.empty();
});

describe.each(BUNDLE_KINDS)(
  "%s bundle restored article state garbage collection (issue #963)",
  (kind) => {
    it("clears prior absence evidence for a restored article with no signal or state baseline", async () => {
      const fixture = await prepareRestore(kind, {
        read: false,
        starred: false,
        saved: false,
      });
      const persisted = await fixture.state();
      if (!persisted) throw new Error("Expected persisted state fixture");
      delete persisted.states[STATE_KEY];
      await fixture.app.vault.adapter.write(
        USER_STATE_PATH,
        JSON.stringify(persisted),
      );
      fixture.atDay(91);
      await fixture.restore();
      expect((await fixture.state())?.states[STATE_KEY]).toBeUndefined();
      expect(
        (await fixture.state())?.missingSinceByStateKey?.[STATE_KEY],
      ).toBeUndefined();
      await fixture.reload();
      expect((await fixture.state())?.states[STATE_KEY]).toBeUndefined();
    });

    it("keeps stateless restoration evidence when no user-state file needs writing", async () => {
      const fixture = await prepareRestore(kind, {
        read: false,
        starred: false,
        saved: false,
      });
      await fixture.app.vault.adapter.remove(USER_STATE_PATH);
      fixture.atDay(89);
      await fixture.restore();
      expect(await fixture.app.vault.adapter.exists(USER_STATE_PATH)).toBe(
        false,
      );
      fixture.markRestoredRead();
      fixture.atDay(91);
      await fixture.save();
      expect(
        (await fixture.state())?.missingSinceByStateKey?.[STATE_KEY],
      ).toBeUndefined();
      fixture.atDay(181);
      await fixture.save();
      await fixture.reload();
      expect((await fixture.state())?.states[STATE_KEY]?.read).toBe(true);
    });

    it("retains a prior confirmed restoration across a later failed import and rollback", async () => {
      const fixture = await prepareRestore(kind);
      fixture.atDay(89);
      await fixture.restore();
      failNextStateWrite(fixture.app, USER_STATE_PATH);
      await expect(fixture.restore()).rejects.toThrow("state write failed");
      fixture.atDay(181);
      await fixture.save();
      await fixture.expectRestored();
    });

    it("does not exempt backup articles when a failed import rolls back", async () => {
      const fixture = await prepareRestore(kind);
      // The backup includes an item that arrived since hydration, but this is
      // parser output, not a confirmed restoration of the missing article.
      fixture.addParserItem();
      failNextStateWrite(fixture.app, USER_STATE_PATH);
      fixture.atDay(89);
      await expect(fixture.restore()).rejects.toThrow("state write failed");
      expect((await fixture.state())?.missingSinceByStateKey?.[STATE_KEY]).toBe(
        BASE_TIME,
      );
      fixture.atDay(91);
      await fixture.save();
      await fixture.reload();
      expect((await fixture.state())?.states[STATE_KEY]).toBeUndefined();
    });

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
      failNextStateWrite(fixture.app, USER_STATE_PATH);
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

it("does not treat authoritative state alone as a confirmed article restoration", async () => {
  const fixture = await prepareRestore("feed");
  fixture.atDay(89);
  fixture.addParserItem();
  await fixture.saveAuthoritatively();
  expect((await fixture.state())?.missingSinceByStateKey?.[STATE_KEY]).toBe(
    BASE_TIME,
  );
  fixture.atDay(91);
  await fixture.save();
  await fixture.reload();
  expect((await fixture.state())?.states[STATE_KEY]).toBeUndefined();
});
