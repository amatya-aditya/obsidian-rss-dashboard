import { beforeEach, describe, expect, it } from "vitest";
import { App } from "obsidian";
import { isSyncConflictCopyPath, SyncV3Storage } from "../../../src/services/sync-v3-storage";
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

  describe("deleteSet", () => {
    it("lets a device delete an existing Sync v3 set so create/join can start fresh", async () => {
      const storage = new SyncV3Storage(primaryApp);
      const settings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await storage.createFromSettings(settings);

      const adapter = primaryApp.vault.adapter as {
        exists(path: string): Promise<boolean>;
      };
      expect(await adapter.exists("rss-dashboard-data/sync-v3/epoch.json")).toBe(true);

      await storage.deleteSet();

      expect(await adapter.exists("rss-dashboard-data/sync-v3/epoch.json")).toBe(false);
      expect(await adapter.exists("rss-dashboard-data/sync-v3")).toBe(false);

      const freshSettings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await expect(storage.createFromSettings(freshSettings)).resolves.toBeUndefined();
    });

    it("does nothing when no set exists yet", async () => {
      const storage = new SyncV3Storage(primaryApp);

      await expect(storage.deleteSet()).resolves.toBeUndefined();
    });

    it("removes every device's replica, not just the deleting device's own", async () => {
      const primary = new SyncV3Storage(primaryApp);
      const primarySettings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await primary.createFromSettings(primarySettings);

      const secondary = new SyncV3Storage(secondaryApp);
      const secondarySettings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await secondary.join(secondarySettings);
      await secondary.persist(secondarySettings);

      const adapter = primaryApp.vault.adapter as {
        exists(path: string): Promise<boolean>;
      };
      expect(
        await adapter.exists(`rss-dashboard-data/sync-v3/replicas/${secondary.getDeviceId()}`),
      ).toBe(true);

      await primary.deleteSet();

      expect(await adapter.exists("rss-dashboard-data/sync-v3")).toBe(false);
    });
  });

  describe("isSyncConflictCopyPath", () => {
    it("matches Obsidian Sync's conflict-copy naming", () => {
      expect(isSyncConflictCopyPath(
        "rss-dashboard-data/sync-v3/epoch.sync-conflict-20260916-143022.json",
      )).toBe(true);
    });

    it("does not match an ordinary replica file", () => {
      expect(isSyncConflictCopyPath(
        "rss-dashboard-data/sync-v3/replicas/device-a/config-log.json",
      )).toBe(false);
    });
  });

  describe("Sync v3 health report", () => {
    it("reports epochId and no conflict copies for a healthy set", async () => {
      const storage = new SyncV3Storage(primaryApp);
      const settings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await storage.createFromSettings(settings);

      const report = await storage.buildHealthReport(settings);

      expect(report.status.health).toBe("ready");
      expect(report.status.epochId).not.toBeNull();
      expect(report.status.conflictCopyPaths).toEqual([]);
    });

    it("degrades health and lists paths when a sync conflict copy is present", async () => {
      const storage = new SyncV3Storage(primaryApp);
      const settings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await storage.createFromSettings(settings);
      const adapter = primaryApp.vault.adapter as { write(path: string, data: string): Promise<void> };
      const conflictPath = "rss-dashboard-data/sync-v3/epoch.sync-conflict-20260916-143022.json";
      await adapter.write(conflictPath, "{}");

      const status = await storage.getStatus(settings);

      expect(status.health).toBe("degraded");
      expect(status.conflictCopyPaths).toEqual([conflictPath]);
    });

    it("reports not-adopted when this device has not committed to Sync v3", async () => {
      const storage = new SyncV3Storage(primaryApp);
      const settings = settingsWithFeeds([feed("feed-1", "article-1")]);

      const status = await storage.getStatus(settings);

      expect(status.health).toBe("not-adopted");
    });

    it("reports waiting-for-primary when this device joined but no epoch has synced in yet", async () => {
      const storage = new SyncV3Storage(primaryApp);
      const settings = settingsWithFeeds([feed("feed-1", "article-1")]);
      settings.storageMode = "replicated-v3";

      const status = await storage.getStatus(settings);

      expect(status.health).toBe("waiting-for-primary");
    });
  });

  describe("recover", () => {
    it("reports no-epoch when no Sync v3 set exists yet", async () => {
      const storage = new SyncV3Storage(primaryApp);
      const settings = settingsWithFeeds([feed("feed-1", "article-1")]);

      const result = await storage.recover(settings);

      expect(result).toEqual({ recovered: false, reason: "no-epoch", clearedConflictCopies: 0 });
    });

    it("re-hydrates when this device's replica already matches the current epoch", async () => {
      const primary = new SyncV3Storage(primaryApp);
      const primarySettings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await primary.createFromSettings(primarySettings);

      const secondary = new SyncV3Storage(secondaryApp);
      const secondarySettings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await secondary.join(secondarySettings);
      // Persist a real config change so this device writes its own replica
      // under the current epoch — otherwise a fresh join with no replica yet
      // is indistinguishable from one left behind by an adoption race, and
      // recover() correctly treats both the same way (re-adopt via join).
      secondarySettings.folders = [...secondarySettings.folders, { name: "Local", subfolders: [] }];
      await secondary.persist(secondarySettings);
      primarySettings.feeds[0].items[0].read = true;
      await primary.persist(primarySettings);

      const result = await secondary.recover(secondarySettings);

      expect(result).toEqual({ recovered: true, reason: "rehydrated", clearedConflictCopies: 0 });
      expect(secondarySettings.feeds[0].items[0].read).toBe(true);
    });

    it("re-joins the current epoch when this device was left behind by an adoption race", async () => {
      const loser = new SyncV3Storage(secondaryApp);
      const loserSettings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await loser.createFromSettings(loserSettings);

      const winner = new SyncV3Storage(primaryApp);
      const adapter = primaryApp.vault.adapter as { write(path: string, data: string): Promise<void> };
      await adapter.write(
        "rss-dashboard-data/sync-v3/epoch.json",
        JSON.stringify({ version: 3, epochId: "epoch-winner", createdAt: Date.now(), primaryDeviceId: winner.getDeviceId() }),
      );

      const result = await loser.recover(loserSettings);

      expect(result).toEqual({ recovered: true, reason: "rejoined-current-epoch", clearedConflictCopies: 0 });
    });

    it("clears detected sync conflict copies as part of recovery", async () => {
      const storage = new SyncV3Storage(primaryApp);
      const settings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await storage.createFromSettings(settings);
      const adapter = primaryApp.vault.adapter as {
        write(path: string, data: string): Promise<void>;
        exists(path: string): Promise<boolean>;
      };
      const conflictPath = "rss-dashboard-data/sync-v3/epoch.sync-conflict-20260916-143022.json";
      await adapter.write(conflictPath, "{}");

      const result = await storage.recover(settings);

      expect(result.clearedConflictCopies).toBe(1);
      expect(await adapter.exists(conflictPath)).toBe(false);
    });

    it("never clears a conflict copy inside another device's replica folder", async () => {
      const primary = new SyncV3Storage(primaryApp);
      const primarySettings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await primary.createFromSettings(primarySettings);

      const secondary = new SyncV3Storage(secondaryApp);
      const secondarySettings = settingsWithFeeds([feed("feed-1", "article-1")]);
      await secondary.join(secondarySettings);

      const adapter = primaryApp.vault.adapter as {
        write(path: string, data: string): Promise<void>;
        exists(path: string): Promise<boolean>;
      };
      const foreignConflictPath =
        `rss-dashboard-data/sync-v3/replicas/${secondary.getDeviceId()}/config-log.sync-conflict-20260916-143022.json`;
      await adapter.write(foreignConflictPath, "{}");
      const ownConflictPath = "rss-dashboard-data/sync-v3/epoch.sync-conflict-20260916-143022.json";
      await adapter.write(ownConflictPath, "{}");

      const result = await primary.recover(primarySettings);

      expect(result.clearedConflictCopies).toBe(1);
      expect(await adapter.exists(ownConflictPath)).toBe(false);
      expect(await adapter.exists(foreignConflictPath)).toBe(true);
    });
  });
});
