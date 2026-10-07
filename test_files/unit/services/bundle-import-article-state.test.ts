import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

const statePath = ".rss-dashboard-data/user-state.json";
const shardPath = ".rss-dashboard-data/feeds/feed-1.json";
const emptyState = { read: false, starred: false, saved: false, tags: [] };
const restoredState = {
  read: false,
  starred: true,
  saved: true,
  savedFilePath: "Notes/article.md",
  tags: [{ name: "Favorite", color: "#112233" }],
  playbackProgress: { position: 42, duration: 100, lastUpdated: 123456 },
};

function item(state: Partial<FeedItem>): FeedItem {
  return {
    guid: "article-1",
    title: "Article",
    link: "https://example.com/article-1",
    description: "Content",
    pubDate: "2026-01-01T00:00:00Z",
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...state,
  };
}

function settings(items: FeedItem[]): RssDashboardSettings {
  const result = structuredClone(DEFAULT_SETTINGS);
  result.storageMode = "vault-shards-v2";
  result.storageFolder = ".rss-dashboard-data/feeds";
  result.metadataStorageFolder = ".rss-dashboard-data";
  const feed: Feed = {
    feedId: "feed-1",
    title: "Feed",
    url: "https://example.com/feed.xml",
    folder: "RSS",
    lastUpdated: 0,
    items,
  };
  result.feeds = [feed];
  return result;
}

describe("bundle replacement article state (issue #853)", () => {
  let app: App;
  const saveData = vi.fn(async (_data: unknown) => {});

  beforeEach(async () => {
    vi.restoreAllMocks();
    saveData.mockClear();
    app = App.createMock();
    await app.vault.adapter.mkdir(".rss-dashboard-data/feeds");
  });

  for (const kind of ["feed", "portable"] as const) {
    for (const startup of ["missing", "healthy", "fresh"] as const) {
      it.each(["restore", "clear"] as const)(
        `${kind} import can %s article state with a ${startup} startup shard`,
        async (direction) => {
          const imported = direction === "restore" ? restoredState : emptyState;
          const baseline =
            direction === "restore"
              ? { ...emptyState, read: true }
              : restoredState;
          if (startup !== "fresh") {
            await new FeedStorageRepository(app).persistSettings(
              settings([item(baseline)]),
              saveData,
            );
            if (startup === "missing")
              await app.vault.adapter.remove(shardPath);
          }

          const repository = new FeedStorageRepository(app);
          const destination = settings([]);
          await repository.hydrateSettings(destination);
          const source = settings([item(imported)]);
          // Exercise the real serialized export and public import boundary.
          const bundle: unknown = JSON.parse(
            JSON.stringify(
              kind === "feed"
                ? repository.buildFeedBundle(source)
                : repository.buildPortableDataBundle(source),
            ),
          );
          if (kind === "feed") {
            await repository.importFeedBundle(bundle, destination, saveData);
          } else {
            await repository.importPortableDataBundle(
              bundle,
              destination,
              saveData,
            );
          }

          expect(destination.feeds[0].items).toEqual(source.feeds[0].items);
          const persisted = await repository.loadUserState(destination);
          if (direction === "restore") {
            expect(persisted?.states["feed-1:article-1"]).toEqual(
              restoredState,
            );
          } else {
            expect(
              persisted?.states["feed-1:article-1"]?.savedFilePath,
            ).toBeUndefined();
            expect(
              persisted?.states["feed-1:article-1"]?.playbackProgress,
            ).toBeUndefined();
          }
          const restarted = settings([]);
          await new FeedStorageRepository(app).hydrateSettings(restarted);
          expect(restarted.feeds[0].items).toEqual(source.feeds[0].items);
        },
      );
    }
  }

  it("still adopts disk state for an ordinary refresh after a bundle import", async () => {
    const preserved = item({ ...restoredState, guid: "later-article" });
    await new FeedStorageRepository(app).persistSettings(
      settings([preserved]),
      saveData,
    );
    await app.vault.adapter.remove(shardPath);
    const repository = new FeedStorageRepository(app);
    const destination = settings([]);
    await repository.hydrateSettings(destination);
    await repository.importFeedBundle(
      repository.buildFeedBundle(settings([item(restoredState)])),
      destination,
      saveData,
    );
    destination.feeds[0].items.push(
      item({ ...emptyState, guid: "later-article" }),
    );
    await repository.persistSettings(destination, saveData);
    expect(destination.feeds[0].items[1]).toEqual(preserved);
  });

  it.each(["feed", "portable"] as const)(
    "%s import restores prior article state when its state write fails",
    async (kind) => {
      const prior = settings([item({ ...emptyState, read: true })]);
      const repository = new FeedStorageRepository(app);
      await repository.persistSettings(prior, saveData);
      const source = settings([item(restoredState)]);
      const bundle =
        kind === "feed"
          ? repository.buildFeedBundle(source)
          : repository.buildPortableDataBundle(source);
      const write = app.vault.adapter.write.bind(app.vault.adapter);
      let failed = false;
      vi.spyOn(app.vault.adapter, "write").mockImplementation(
        async (path, data) => {
          if (path === statePath && !failed) {
            failed = true;
            throw new Error("state write failed");
          }
          await write(path, data);
        },
      );
      const importing =
        kind === "feed"
          ? repository.importFeedBundle(bundle, prior, saveData)
          : repository.importPortableDataBundle(bundle, prior, saveData);
      await expect(importing).rejects.toThrow("state write failed");
      expect(prior.feeds[0].items).toEqual([
        item({ ...emptyState, read: true }),
      ]);
      const restarted = settings([]);
      await new FeedStorageRepository(app).hydrateSettings(restarted);
      expect(restarted.feeds[0].items).toEqual(prior.feeds[0].items);
    },
  );

  it("does not overwrite an unreadable state file during a replacing import", async () => {
    const corrupt = "{not json";
    await app.vault.adapter.write(statePath, corrupt);
    const repository = new FeedStorageRepository(app);
    const destination = settings([]);
    await repository.hydrateSettings(destination);
    await repository.importFeedBundle(
      repository.buildFeedBundle(settings([item(restoredState)])),
      destination,
      saveData,
    );
    expect(await app.vault.adapter.read(statePath)).toBe(corrupt);
  });
});
