import { beforeEach, describe, expect, it } from "vitest";
import { App } from "obsidian";
import { SyncV3Storage } from "../../../src/services/sync-v3-storage";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";

function settingsWithFeeds(feeds: Feed[]): RssDashboardSettings {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
  settings.feeds = feeds;
  settings.storageMode = "vault-shards-v2";
  return settings;
}

function feed(feedId: string, guid: string): Feed {
  return {
    feedId,
    title: feedId,
    url: `https://example.com/${feedId}.xml`,
    folder: "RSS",
    items: [{
      title: "Article",
      link: `https://example.com/${feedId}/article`,
      description: "Description",
      pubDate: "2026-01-01T00:00:00Z",
      guid,
      feedTitle: feedId,
      feedUrl: `https://example.com/${feedId}.xml`,
      coverImage: "",
      read: false,
      starred: false,
      tags: [],
      saved: false,
    }],
    lastUpdated: 0,
  };
}

describe("SyncV3Storage", () => {
  let primaryApp: App;
  let secondaryApp: App;

  beforeEach(() => {
    primaryApp = App.createMock();
    secondaryApp = App.createMock();
    secondaryApp.vault = primaryApp.vault;
  });

  it("publishes the epoch only after the primary replica configuration exists", async () => {
    const storage = new SyncV3Storage(primaryApp);
    const settings = settingsWithFeeds([feed("feed-1", "article-1")]);

    await storage.createFromSettings(settings);

    const deviceId = storage.getDeviceId();
    const adapter = primaryApp.vault.adapter as {
      read(path: string): Promise<string>;
    };
    const epoch = JSON.parse(await adapter.read("rss-dashboard-data/sync-v3/epoch.json")) as {
      primaryDeviceId: string;
    };
    const config = JSON.parse(await adapter.read(
      `rss-dashboard-data/sync-v3/replicas/${deviceId}/config-log.json`,
    )) as { operations: unknown[] };

    expect(settings.storageMode).toBe("replicated-v3");
    expect(epoch.primaryDeviceId).toBe(deviceId);
    expect(config.operations).not.toHaveLength(0);
  });

  it("keeps state for same-GUID articles independent by feed identity", async () => {
    const primary = new SyncV3Storage(primaryApp);
    const primarySettings = settingsWithFeeds([
      feed("feed-1", "shared-guid"),
      feed("feed-2", "shared-guid"),
    ]);
    await primary.createFromSettings(primarySettings);

    const secondary = new SyncV3Storage(secondaryApp);
    const secondarySettings = settingsWithFeeds([
      feed("feed-1", "shared-guid"),
      feed("feed-2", "shared-guid"),
    ]);
    expect(await secondary.join(secondarySettings)).toBe(true);

    secondarySettings.feeds[0].items[0].read = true;
    await secondary.persist(secondarySettings);
    await primary.hydrate(primarySettings);

    expect(primarySettings.feeds[0].items[0].read).toBe(true);
    expect(primarySettings.feeds[1].items[0].read).toBe(false);
  });

  it("publishes the primary device's existing read state during migration", async () => {
    const primary = new SyncV3Storage(primaryApp);
    const primarySettings = settingsWithFeeds([feed("feed-1", "article-1")]);
    primarySettings.feeds[0].items[0].read = true;
    await primary.createFromSettings(primarySettings);

    const secondary = new SyncV3Storage(secondaryApp);
    const secondarySettings = settingsWithFeeds([feed("feed-1", "article-1")]);
    await secondary.join(secondarySettings);

    expect(secondarySettings.feeds[0].items[0].read).toBe(true);
  });

  it("replicates an explicit unread transition instead of dropping false values", async () => {
    const primary = new SyncV3Storage(primaryApp);
    const primarySettings = settingsWithFeeds([feed("feed-1", "article-1")]);
    await primary.createFromSettings(primarySettings);

    const secondary = new SyncV3Storage(secondaryApp);
    const secondarySettings = settingsWithFeeds([feed("feed-1", "article-1")]);
    await secondary.join(secondarySettings);

    secondarySettings.feeds[0].items[0].read = true;
    await secondary.persist(secondarySettings);
    await primary.hydrate(primarySettings);
    expect(primarySettings.feeds[0].items[0].read).toBe(true);

    secondarySettings.feeds[0].items[0].read = false;
    await secondary.persist(secondarySettings);
    await primary.hydrate(primarySettings);
    expect(primarySettings.feeds[0].items[0].read).toBe(false);
  });

  it("does not create shared replica writes when persisting refreshed local content", async () => {
    const storage = new SyncV3Storage(primaryApp);
    const settings = settingsWithFeeds([feed("feed-1", "article-1")]);
    await storage.createFromSettings(settings);
    const adapter = primaryApp.vault.adapter as {
      read(path: string): Promise<string>;
    };
    const before = await adapter.read(
      `rss-dashboard-data/sync-v3/replicas/${storage.getDeviceId()}/config-log.json`,
    );

    settings.feeds[0].items[0].title = "Fresh local content";
    await storage.persistLocalCache(settings);

    expect(await adapter.read(
      `rss-dashboard-data/sync-v3/replicas/${storage.getDeviceId()}/config-log.json`,
    )).toBe(before);
  });

  it("keeps uninitialized V3 changes local until the user creates or joins a set", async () => {
    const storage = new SyncV3Storage(primaryApp);
    const settings = settingsWithFeeds([feed("feed-1", "article-1")]);
    settings.storageMode = "replicated-v3";

    await storage.persist(settings);

    const adapter = primaryApp.vault.adapter as {
      exists(path: string): Promise<boolean>;
      read(path: string): Promise<string>;
    };
    expect(await adapter.exists("rss-dashboard-data/sync-v3/epoch.json")).toBe(false);
    expect(JSON.parse(await adapter.read(".rss-dashboard-cache-v3/runtime.json"))).toEqual(
      expect.objectContaining({ version: 3 }),
    );
  });
});
