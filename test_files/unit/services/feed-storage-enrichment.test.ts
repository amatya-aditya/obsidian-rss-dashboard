import { describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import { RefreshEnrichment } from "../../../src/services/refresh-enrichment";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";

function makeFeed(id: string): Feed {
  const url = `https://${id}.example/article`;
  return {
    feedId: id,
    title: id,
    url: `https://${id}.example/feed`,
    folder: "",
    lastUpdated: 0,
    items: [
      {
        guid: id,
        title: id,
        link: url,
        description: "",
        pubDate: "",
        feedTitle: id,
        feedUrl: `https://${id}.example/feed`,
        coverImage: "",
      },
    ],
  };
}

describe("persisting one enrichment shard", () => {
  it.each([undefined, "A partial page description"] as const)(
    "keeps a %s completed result through a second-device hydration without another request",
    async (description) => {
      const app = App.createMock();
      const original = makeFeed("completed");
      original.refreshEnrichment = true;
      original.items[0].refreshEnrichment = {
        url: original.items[0].link,
        ...(description ? { description } : {}),
      };
      const settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        storageMode: "vault-shards-v2",
        storageFolder: "rss/feeds",
        feeds: [original],
      } satisfies RssDashboardSettings;
      const firstDevice = new FeedStorageRepository(app);
      await firstDevice.persistSettings(
        settings,
        vi.fn(async () => {}),
        {
          forceAllShards: true,
        },
      );

      const secondDeviceSettings = structuredClone(settings);
      secondDeviceSettings.feeds[0].items = [];
      const secondDevice = new FeedStorageRepository(app);
      await secondDevice.hydrateSettings(secondDeviceSettings);
      expect(
        secondDeviceSettings.feeds[0].items[0].refreshEnrichment,
      ).toMatchObject({
        url: original.items[0].link,
        ...(description ? { description } : {}),
      });

      let requests = 0;
      const queue = new RefreshEnrichment({
        getFeeds: () => secondDeviceSettings.feeds,
        showCovers: () => true,
        fetch: async () => {
          requests++;
          return { content: "", failureType: "none" };
        },
        persist: async () => {},
        redraw: () => {},
        loadRetries: () => ({}),
        saveRetries: () => {},
        now: () => 0,
      });
      queue.enqueue(secondDeviceSettings.feeds);
      await queue.whenIdle();
      expect(requests).toBe(0);
    },
  );

  it("refuses a conflict resolution if the incoming shard changed since review", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    await repository.persistSettings(
      settings,
      vi.fn(async () => {}),
      { forceAllShards: true },
    );
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const original = JSON.parse(await app.vault.adapter.read(path));
    const newer = structuredClone(original);
    newer.items[0].title = "Newer synced edit";
    const delivered = JSON.stringify(newer);
    await app.vault.adapter.write(path, delivered);
    expect(
      await repository.persistResolvedShard(settings, feed, feed.items, {
        expected: original,
      }),
    ).toBe(false);
    expect(await app.vault.adapter.read(path)).toBe(delivered);
  });
  it("writes and reads back a chosen resolution against the reviewed shard", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    await repository.persistSettings(
      settings,
      vi.fn(async () => {}),
      { forceAllShards: true },
    );
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const incoming = JSON.parse(await app.vault.adapter.read(path));
    incoming.items[0].title = "Synced edit";
    await app.vault.adapter.write(path, JSON.stringify(incoming));
    const chosen = [{ ...feed.items[0], title: "Local choice" }];
    expect(
      await repository.persistResolvedShard(settings, feed, chosen, {
        expected: incoming,
      }),
    ).toBe(true);
    expect(JSON.parse(await app.vault.adapter.read(path)).items[0].title).toBe(
      "Local choice",
    );
    expect(feed.items[0].title).toBe("one");
  });
  it("suppresses a shared preview when synced and local histories together reach three pages", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    const preview = "Same publisher description";
    feed.items[0].refreshEnrichment = {
      url: feed.items[0].link,
      description: preview,
    };
    feed.items.push({
      ...feed.items[0],
      guid: "two",
      link: "https://one.example/two",
      refreshEnrichment: {
        url: "https://one.example/two",
        description: preview,
      },
    });
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    const saveData = vi.fn(async () => {});
    await repository.persistSettings(settings, saveData, {
      forceAllShards: true,
    });
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const remote = JSON.parse(await app.vault.adapter.read(path));
    remote.items.push({
      ...remote.items[0],
      guid: "three",
      link: "https://one.example/three",
      refreshEnrichment: {
        url: "https://one.example/three",
        description: preview,
      },
    });
    await app.vault.adapter.write(path, JSON.stringify(remote));
    feed.items[0].title = "Updated title";
    await repository.persistSettings(settings, saveData);
    expect(
      feed.items.map((item) => item.refreshEnrichment?.suppressDescription),
    ).toEqual([true, true, true]);
    const stored = JSON.parse(await app.vault.adapter.read(path));
    expect(
      stored.items.map(
        (item: Feed["items"][number]) =>
          item.refreshEnrichment?.suppressDescription,
      ),
    ).toEqual([true, true, true]);
  });
  it.each(["description", "image"] as const)(
    "recomputes %s suppression after shard hydration combines distinct URLs",
    async (field) => {
      const app = App.createMock();
      const local = makeFeed("one");
      const duplicateUrl = local.items[0].link;
      const value =
        field === "description"
          ? "Shared publisher text"
          : "https://cdn.example/shared.jpg";
      const enrichment = (url: string) =>
        field === "description"
          ? { url, description: value }
          : { url, image: value };
      local.items[0].refreshEnrichment = enrichment(duplicateUrl);
      local.items.push(
        {
          ...local.items[0],
          guid: "two",
          link: "https://one.example/two",
          refreshEnrichment: enrichment("https://one.example/two"),
        },
        {
          ...local.items[0],
          guid: "duplicate-url",
          refreshEnrichment: enrichment(duplicateUrl),
        },
      );
      const otherFeed = makeFeed("other");
      otherFeed.items[0].refreshEnrichment = enrichment(
        otherFeed.items[0].link,
      );
      const settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        storageMode: "vault-shards-v2",
        storageFolder: "rss/feeds",
        feeds: [local, otherFeed],
      } satisfies RssDashboardSettings;
      const initialRepository = new FeedStorageRepository(app);
      await initialRepository.persistSettings(
        settings,
        vi.fn(async () => {}),
        {
          forceAllShards: true,
        },
      );
      const address = initialRepository.getFeedLocalStorageAddress(
        settings,
        local,
      ).address;
      const synced = JSON.parse(await app.vault.adapter.read(address));
      const thirdUrl = "https://one.example/three";
      synced.items.push({
        ...synced.items[0],
        guid: "three",
        link: thirdUrl,
        refreshEnrichment: enrichment(thirdUrl),
      });
      await app.vault.adapter.write(address, JSON.stringify(synced));

      const reloaded = structuredClone(settings);
      const repository = new FeedStorageRepository(app);
      const hydration = await repository.hydrateSettings(reloaded);
      expect(hydration.didChange).toBe(true);
      expect(
        reloaded.feeds[0].items.map((item) =>
          field === "description"
            ? item.refreshEnrichment?.suppressDescription
            : item.refreshEnrichment?.suppressImage,
        ),
      ).toEqual([true, true, true, true]);
      expect(
        field === "description"
          ? reloaded.feeds[1].items[0].refreshEnrichment?.suppressDescription
          : reloaded.feeds[1].items[0].refreshEnrichment?.suppressImage,
      ).toBeUndefined();

      await repository.persistSettings(
        reloaded,
        vi.fn(async () => {}),
      );
      const saved = JSON.parse(await app.vault.adapter.read(address));
      expect(
        saved.items.map((item: Feed["items"][number]) =>
          field === "description"
            ? item.refreshEnrichment?.suppressDescription
            : item.refreshEnrichment?.suppressImage,
        ),
      ).toEqual([true, true, true, true]);
    },
  );
  it("keeps v1 article state when writing an enrichment outcome", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    feed.items[0].read = true;
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    await repository.persistSettings(
      settings,
      vi.fn(async () => {}),
      { forceAllShards: true },
    );
    feed.items[0].refreshEnrichment = { url: feed.items[0].link };
    expect(await repository.persistEnrichmentShard(settings, feed)).toBe(true);
    const saved = JSON.parse(
      await app.vault.adapter.read(
        repository.getFeedLocalStorageAddress(settings, feed).address,
      ),
    );
    expect(saved.items[0].read).toBe(true);
    expect(saved.items[0].refreshEnrichment.url).toBe(feed.items[0].link);
  });
  it("does not write when the feed becomes invalid while the shard is being checked", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    await repository.persistSettings(
      settings,
      vi.fn(async () => {}),
      { forceAllShards: true },
    );
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const before = await app.vault.adapter.read(path);
    feed.items[0].refreshEnrichment = {
      url: feed.items[0].link,
      description: "Page preview",
    };
    let checks = 0;
    expect(
      await repository.persistEnrichmentShard(
        settings,
        feed,
        () => ++checks === 1,
      ),
    ).toBe(false);
    expect(await app.vault.adapter.read(path)).toBe(before);
  });
  it("persists only the target shard and keeps its v2 state in user-state storage", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const first = makeFeed("one");
    const second = makeFeed("two");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [first, second],
    } satisfies RssDashboardSettings;
    const saveData = vi.fn(async () => {});
    await repository.persistSettings(settings, saveData, {
      forceAllShards: true,
    });
    const firstPath = repository.getFeedLocalStorageAddress(
      settings,
      first,
    ).address;
    const secondPath = repository.getFeedLocalStorageAddress(
      settings,
      second,
    ).address;
    const secondBefore = await app.vault.adapter.read(secondPath);
    first.items[0].read = true;
    first.items[0].refreshEnrichment = {
      url: first.items[0].link,
      description: "Local preview",
    };
    second.items[0].title = "Unsaved second-feed edit";
    saveData.mockClear();
    expect(await repository.persistEnrichmentShard(settings, first)).toBe(true);
    const saved = JSON.parse(await app.vault.adapter.read(firstPath));
    expect(saved.items[0].refreshEnrichment.description).toBe("Local preview");
    expect(saved.items[0].read).toBeUndefined();
    expect(await app.vault.adapter.read(secondPath)).toBe(secondBefore);
    expect(saveData).not.toHaveBeenCalled();
  });

  it("refuses a write without a known shard baseline", async () => {
    const app = App.createMock();
    const feed = makeFeed("one");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    await new FeedStorageRepository(app).persistSettings(
      settings,
      vi.fn(async () => {}),
      { forceAllShards: true },
    );
    const repository = new FeedStorageRepository(app);
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const before = await app.vault.adapter.read(path);
    feed.items[0].refreshEnrichment = { url: feed.items[0].link };
    expect(await repository.persistEnrichmentShard(settings, feed)).toBe(false);
    expect(await app.vault.adapter.read(path)).toBe(before);
  });
  it("does not overwrite an existing shard during an ordinary save without a baseline", async () => {
    const app = App.createMock();
    const feed = makeFeed("one");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    const writer = new FeedStorageRepository(app);
    await writer.persistSettings(
      settings,
      vi.fn(async () => {}),
      { forceAllShards: true },
    );
    const path = writer.getFeedLocalStorageAddress(settings, feed).address;
    const before = await app.vault.adapter.read(path);
    feed.items[0].title = "Unloaded local content";
    await expect(
      new FeedStorageRepository(app).persistSettings(
        settings,
        vi.fn(async () => {}),
      ),
    ).rejects.toThrow("baseline");
    expect(await app.vault.adapter.read(path)).toBe(before);
  });
  it("does not overwrite an unseen change on the target shard", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    await repository.persistSettings(
      settings,
      vi.fn(async () => {}),
      { forceAllShards: true },
    );
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const onDisk = JSON.parse(await app.vault.adapter.read(path));
    onDisk.items[0].title = "Remote title";
    const delivered = JSON.stringify(onDisk);
    await app.vault.adapter.write(path, delivered);
    feed.items[0].refreshEnrichment = {
      url: feed.items[0].link,
      description: "Local preview",
    };
    expect(await repository.persistEnrichmentShard(settings, feed)).toBe(false);
    expect(await app.vault.adapter.read(path)).toBe(delivered);
  });

  it("keeps a synced completed preview when a local feed refresh adds another article before reload", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    await repository.persistSettings(
      settings,
      vi.fn(async () => {}),
      { forceAllShards: true },
    );
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const remote = JSON.parse(await app.vault.adapter.read(path));
    remote.items[0].refreshEnrichment = {
      url: feed.items[0].link,
      description: "Synced preview",
    };
    await app.vault.adapter.write(path, JSON.stringify(remote));
    feed.items.push({
      ...feed.items[0],
      guid: "two",
      link: "https://one.example/two",
    });
    await repository.persistSettings(
      settings,
      vi.fn(async () => {}),
    );
    const saved = JSON.parse(await app.vault.adapter.read(path));
    expect(saved.items.map((item: { guid: string }) => item.guid)).toEqual([
      "one",
      "two",
    ]);
    expect(saved.items[0].refreshEnrichment.description).toBe("Synced preview");
    expect(feed.items[0].refreshEnrichment?.description).toBe("Synced preview");
  });

  it("leaves both copies intact when a remotely removed article has local edits", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    await repository.persistSettings(
      settings,
      vi.fn(async () => {}),
      { forceAllShards: true },
    );
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const remote = JSON.parse(await app.vault.adapter.read(path));
    remote.items = [];
    const delivered = JSON.stringify(remote);
    await app.vault.adapter.write(path, delivered);
    feed.items[0].title = "Local edit";
    const error = await repository
      .persistSettings(
        settings,
        vi.fn(async () => {}),
      )
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      message: expect.stringContaining("removed on another device"),
      context: {
        feedId: "one",
        local: {
          items: [
            expect.objectContaining({ guid: "one", title: "Local edit" }),
          ],
        },
        incoming: { items: [] },
        ancestor: { items: [expect.objectContaining({ guid: "one" })] },
      },
    });
    expect(await app.vault.adapter.read(path)).toBe(delivered);
    expect(feed.items[0].title).toBe("Local edit");
  });

  it("accepts a synced removal when only separate v2 user state is present", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    feed.items[0].starred = true;
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    const saveData = vi.fn(async () => {});
    await repository.persistSettings(settings, saveData, {
      forceAllShards: true,
    });
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const remote = JSON.parse(await app.vault.adapter.read(path));
    remote.items = [];
    await app.vault.adapter.write(path, JSON.stringify(remote));
    feed.items.push({
      ...feed.items[0],
      guid: "two",
      link: "https://one.example/two",
    });
    await repository.persistSettings(settings, saveData);
    expect(feed.items.map((item) => item.guid)).toEqual(["two"]);
    expect(
      JSON.parse(await app.vault.adapter.read(path)).items.map(
        (item: { guid: string }) => item.guid,
      ),
    ).toEqual(["two"]);
  });

  it("applies synced user state to a remotely added article during reconciliation", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    const saveData = vi.fn(async () => {});
    await repository.persistSettings(settings, saveData, {
      forceAllShards: true,
    });
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const remote = JSON.parse(await app.vault.adapter.read(path));
    remote.items.push({
      ...remote.items[0],
      guid: "remote",
      link: "https://one.example/remote",
    });
    await app.vault.adapter.write(path, JSON.stringify(remote));
    await app.vault.adapter.mkdir(settings.metadataStorageFolder);
    await app.vault.adapter.write(
      `${settings.metadataStorageFolder}/user-state.json`,
      JSON.stringify({
        version: 2,
        states: { "one:remote": { starred: true, read: true } },
      }),
    );
    feed.items.push({
      ...feed.items[0],
      guid: "local",
      link: "https://one.example/local",
    });
    await repository.persistSettings(settings, saveData);
    expect(feed.items.find((item) => item.guid === "remote")).toMatchObject({
      starred: true,
      read: true,
    });
    const state = JSON.parse(
      await app.vault.adapter.read(
        `${settings.metadataStorageFolder}/user-state.json`,
      ),
    );
    expect(state.states["one:remote"]).toMatchObject({
      starred: true,
      read: true,
    });
  });

  it("keeps local edits made while a reconciled shard write is pending", async () => {
    const app = App.createMock();
    const repository = new FeedStorageRepository(app);
    const feed = makeFeed("one");
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      storageMode: "vault-shards-v2",
      storageFolder: "rss/feeds",
      feeds: [feed],
    } satisfies RssDashboardSettings;
    const saveData = vi.fn(async () => {});
    await repository.persistSettings(settings, saveData, {
      forceAllShards: true,
    });
    const path = repository.getFeedLocalStorageAddress(settings, feed).address;
    const remote = JSON.parse(await app.vault.adapter.read(path));
    remote.items[0].refreshEnrichment = {
      url: feed.items[0].link,
      description: "Synced preview",
    };
    await app.vault.adapter.write(path, JSON.stringify(remote));
    feed.items.push({
      ...feed.items[0],
      guid: "two",
      link: "https://one.example/two",
    });
    const write = app.vault.adapter.write.bind(app.vault.adapter);
    let release!: () => void;
    let notify!: () => void;
    const started = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(app.vault.adapter, "write").mockImplementation(
      async (name, content) => {
        if (name === path) {
          notify();
          await proceed;
        }
        await write(name, content);
      },
    );
    const saving = repository.persistSettings(settings, saveData);
    await started;
    feed.items[0].title = "Later local edit";
    feed.items.push({
      ...feed.items[0],
      guid: "three",
      link: "https://one.example/three",
    });
    release();
    await saving;
    expect(feed.items.map((item) => item.guid)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(feed.items[0].title).toBe("Later local edit");
    expect(feed.items[0].refreshEnrichment?.description).toBe("Synced preview");
    await repository.persistSettings(settings, saveData);
    const saved = JSON.parse(await app.vault.adapter.read(path));
    expect(saved.items.map((item: { guid: string }) => item.guid)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(saved.items[0].title).toBe("Later local edit");
  });
});
