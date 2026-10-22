/**
 * A plugin start reads each feed's shard once and saves only to repair
 * something (#1519).
 *
 * The real plugin starts through `onload()` on a mock vault that holds a
 * Shard storage v2 setup a previous session saved, so hydration, the load's
 * save decision and the persist step all run for real. The vault adapter is
 * watched, because the cost this guards is what the plugin reads and writes:
 * a load that found nothing to repair used to save anyway, and that save
 * opened every unchanged shard a second time.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type MockApp, type PluginManifest } from "obsidian";

vi.mock("../../../src/modals/whats-new-modal", () => ({
  WhatsNewModal: class {
    open = vi.fn();
  },
}));

vi.mock("../../../src/modals/storage-migration-modal", () => ({
  StorageMigrationModal: class {
    open = vi.fn();
  },
}));

import RssDashboardPlugin from "../../../main";
import { SyncSimulator } from "../sync-simulator";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

const CONFIG_DIR = ".vault-config";
const PLUGIN_DIR = `${CONFIG_DIR}/plugins/rss-dashboard`;
const POINTER_PATH = `${PLUGIN_DIR}/data.json`;
const METADATA_FOLDER = "rss-dashboard-data";
const SHARD_FOLDER = `${METADATA_FOLDER}/feeds`;
const DATA_PATH = `${METADATA_FOLDER}/data.json`;
const USER_STATE_PATH = `${METADATA_FOLDER}/user-state.json`;
const VERSION = "2.7.0";

function shardPath(feedId: string): string {
  return `${SHARD_FOLDER}/${feedId}.json`;
}

function isShardPath(path: string): boolean {
  return path.startsWith(`${SHARD_FOLDER}/`) && path.endsWith(".json");
}

function item(feedId: string, guid: string): FeedItem {
  return {
    title: guid,
    link: `https://example.com/${feedId}/${guid}`,
    description: "",
    pubDate: "2026-01-01T00:00:00Z",
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: feedId,
    feedUrl: `https://example.com/${feedId}.xml`,
    coverImage: "",
  };
}

function feed(feedId: string, guids: string[]): Feed {
  return {
    title: feedId,
    url: `https://example.com/${feedId}.xml`,
    folder: "",
    lastUpdated: 0,
    feedId,
    items: guids.map((guid) => item(feedId, guid)),
  };
}

function v2Settings(feeds: Feed[]): RssDashboardSettings {
  const base = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  base.lastShownVersion = VERSION;
  base.storageMode = "vault-shards-v2";
  base.storageFolder = SHARD_FOLDER;
  base.metadataStorageMode = "vault-location";
  base.metadataStorageFolder = METADATA_FOLDER;
  // An hour: the startup refresh must not fire during a test.
  base.startupRefreshDelaySeconds = 3600;
  base.feeds = feeds;
  return base;
}

function manifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: VERSION,
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: PLUGIN_DIR,
  };
}

/**
 * Builds a plugin on `app` whose bootstrap `data.json` lives on that vault's
 * disk, as Obsidian does, and lets `beforeLoad` spy on it before `onload()`.
 */
async function startPlugin(
  app: MockApp,
  beforeLoad: (plugin: RssDashboardPlugin) => void = () => undefined,
): Promise<RssDashboardPlugin> {
  const plugin = new RssDashboardPlugin(app, manifest());
  plugin.loadData = vi.fn(async () => {
    const text = app.vault.filesOnDisk.get(POINTER_PATH);
    return text === undefined ? null : JSON.parse(text);
  });
  plugin.saveData = vi.fn(async (data: unknown) => {
    app.vault.filesOnDisk.set(POINTER_PATH, JSON.stringify(data));
  });
  plugin.refreshDashboardViews = vi.fn(async () => undefined);
  beforeLoad(plugin);
  await plugin.onload();
  return plugin;
}

/**
 * A vault a previous session saved as Shard storage v2, one shard per feed,
 * with one starred article: a session that recorded no article state writes
 * no `user-state.json`, and a load without that file is not saved.
 */
async function savedVault(feeds: Feed[]): Promise<MockApp> {
  const app = App.createMock();
  const settings = v2Settings(feeds);
  app.vault.addFolderOnDisk(METADATA_FOLDER);
  app.vault.filesOnDisk.set(DATA_PATH, JSON.stringify(settings));
  app.vault.filesOnDisk.set(
    POINTER_PATH,
    JSON.stringify({
      metadataStorageMode: settings.metadataStorageMode,
      metadataStorageFolder: settings.metadataStorageFolder,
      metadataStorageSchemaVersion: settings.metadataStorageSchemaVersion,
    }),
  );
  const previous = await startPlugin(app);
  await previous.saveSettings({ forceAllShards: true, forceMetadata: true });
  const starred = feeds[0]?.items[0];
  if (starred) {
    await previous.updateArticle(
      starred.guid,
      starred.feedUrl,
      { starred: true },
      false,
    );
    await previous.flushPendingWrites();
  }
  previous.onunload();
  return app;
}

/** Edits the saved `data.json` the way an older or hand-synced vault holds it. */
function editSavedSettings(
  app: MockApp,
  edit: (settings: Record<string, unknown>) => void,
): void {
  const text = app.vault.filesOnDisk.get(DATA_PATH) ?? "{}";
  const settings = JSON.parse(text) as Record<string, unknown>;
  edit(settings);
  app.vault.filesOnDisk.set(DATA_PATH, JSON.stringify(settings));
}

/** Watches the adapter calls a start makes, from this moment on. */
function watchAdapter(app: MockApp) {
  const reads: string[] = [];
  const writes: string[] = [];
  const adapter = app.vault.adapter as unknown as {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
  };
  const read = adapter.read.bind(adapter);
  const write = adapter.write.bind(adapter);
  vi.spyOn(adapter, "read").mockImplementation((path: string) => {
    reads.push(path);
    return read(path);
  });
  vi.spyOn(adapter, "write").mockImplementation(
    (path: string, content: string) => {
      writes.push(path);
      return write(path, content);
    },
  );
  return {
    shardReads: () => reads.filter(isShardPath),
    writes: () => writes,
  };
}

describe("plugin start over a Shard storage v2 vault (#1519)", () => {
  const feeds = () => [
    feed("feed-a", ["a1", "a2"]),
    feed("feed-b", ["b1"]),
    feed("feed-c", ["c1", "c2", "c3"]),
  ];
  let started: RssDashboardPlugin[];

  async function start(
    app: MockApp,
  ): Promise<{ plugin: RssDashboardPlugin; save: ReturnType<typeof vi.fn> }> {
    let save: ReturnType<typeof vi.fn> = vi.fn();
    const plugin = await startPlugin(app, (candidate) => {
      save = vi.spyOn(candidate, "saveSettings") as unknown as ReturnType<
        typeof vi.fn
      >;
    });
    started.push(plugin);
    return { plugin, save };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    started = [];
  });

  afterEach(() => {
    for (const plugin of started) plugin.onunload();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads each feed's shard once, and saves nothing, when the only difference from the stored settings is a field the load derives", async () => {
    const app = await savedVault(feeds());
    // A vault from before feeds carried this field: the load derives it from
    // `lastUpdated` on every start, but nothing needs saving because of it.
    editSavedSettings(app, (settings) => {
      for (const stored of settings.feeds as Record<string, unknown>[]) {
        delete stored.lastRefreshAttemptCompletedAt;
      }
    });
    const watch = watchAdapter(app);

    const { save } = await start(app);

    expect(save).not.toHaveBeenCalled();
    expect(watch.shardReads()).toHaveLength(3);
    expect(
      watch.writes().filter((path) => isShardPath(path) || path === DATA_PATH),
    ).toEqual([]);
  });

  it("derives the same settings from that vault as before", async () => {
    const app = await savedVault(feeds());
    editSavedSettings(app, (settings) => {
      for (const stored of settings.feeds as Record<string, unknown>[]) {
        delete stored.lastRefreshAttemptCompletedAt;
      }
    });

    const { plugin } = await start(app);

    expect(
      plugin.settings.feeds.map((f) => f.lastRefreshAttemptCompletedAt),
    ).toEqual([0, 0, 0]);
    expect(plugin.settings.feeds.map((f) => f.items.length)).toEqual([2, 1, 3]);
  });

  it("saves once and rewrites the shard when a shard holds a duplicate article", async () => {
    const app = await savedVault(feeds());
    app.vault.filesOnDisk.set(
      shardPath("feed-a"),
      JSON.stringify({
        ...JSON.parse(app.vault.filesOnDisk.get(shardPath("feed-a")) ?? "{}"),
        items: [
          item("feed-a", "a1"),
          item("feed-a", "a1"),
          item("feed-a", "a2"),
        ],
      }),
    );
    const watch = watchAdapter(app);

    const { plugin, save } = await start(app);

    expect(save).toHaveBeenCalledTimes(1);
    expect(plugin.settings.feeds[0]?.items.map((i) => i.guid).sort()).toEqual([
      "a1",
      "a2",
    ]);
    expect(watch.writes().filter(isShardPath)).toEqual([shardPath("feed-a")]);
  });

  it("saves once when a shard holds an entry the load has to drop", async () => {
    const app = await savedVault(feeds());
    app.vault.filesOnDisk.set(
      shardPath("feed-b"),
      JSON.stringify({
        ...JSON.parse(app.vault.filesOnDisk.get(shardPath("feed-b")) ?? "{}"),
        items: [null, item("feed-b", "b1")],
      }),
    );

    const { plugin, save } = await start(app);

    expect(save).toHaveBeenCalledTimes(1);
    expect(plugin.settings.feeds[1]?.items.map((i) => i.guid)).toEqual(["b1"]);
  });

  it("keeps an article change that was journaled but not yet checkpointed, and writes it to user-state.json at the next save", async () => {
    const app = await savedVault(feeds());
    // A session that closed abruptly: the star reached the device-local
    // journal, but the coalesced write to user-state.json never ran.
    const closedAbruptly = await startPlugin(app);
    started.push(closedAbruptly);
    await closedAbruptly.updateArticle(
      "b1",
      "https://example.com/feed-b.xml",
      { starred: true },
      false,
    );
    const stored = JSON.parse(
      app.vault.filesOnDisk.get(USER_STATE_PATH) ?? "{}",
    ) as { states?: Record<string, { starred?: boolean }> };
    expect(stored.states?.["feed-b:b1"]?.starred).toBeUndefined();

    const { plugin } = await start(app);

    expect(plugin.settings.feeds[1]?.items[0]?.starred).toBe(true);
    await plugin.saveSettings();
    const written = JSON.parse(
      app.vault.filesOnDisk.get(USER_STATE_PATH) ?? "{}",
    ) as { states?: Record<string, { starred?: boolean }> };
    expect(written.states?.["feed-b:b1"]?.starred).toBe(true);
  });

  it("loads the same feeds and article state as the base commit did, including a change that was journaled but not yet checkpointed", async () => {
    // The golden was captured from the commit before #1519. Regenerate it from
    // a checkout of that commit with WRITE_STARTUP_GOLDEN=1, never from this one.
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
    const app = await savedVault(feeds());
    const earlier = await startPlugin(app);
    started.push(earlier);
    await earlier.updateArticle(
      "a2",
      "https://example.com/feed-a.xml",
      { read: true },
      false,
    );
    await earlier.updateArticle(
      "b1",
      "https://example.com/feed-b.xml",
      { tags: [{ name: "keep", color: "#ff0000" }] },
      false,
    );
    await earlier.flushPendingWrites();
    // Closed abruptly: this star reached only the device-local journal.
    await earlier.updateArticle(
      "c2",
      "https://example.com/feed-c.xml",
      { starred: true },
      false,
    );
    editSavedSettings(app, (settings) => {
      for (const stored of settings.feeds as Record<string, unknown>[]) {
        delete stored.lastRefreshAttemptCompletedAt;
      }
    });

    const { plugin } = await start(app);

    const loaded = JSON.parse(JSON.stringify(plugin.settings.feeds)) as unknown;
    const goldenPath = resolve(
      process.cwd(),
      "test_files/unit/fixtures/startup-load-feeds.golden.json",
    );
    if (process.env.WRITE_STARTUP_GOLDEN === "1") {
      writeFileSync(goldenPath, `${JSON.stringify(loaded, null, 2)}\n`);
    }
    expect(loaded).toEqual(JSON.parse(readFileSync(goldenPath, "utf8")));
  });

  /**
   * A mobile that synced `feeds` and started, after a desktop removed
   * `feed-c` and saved. The desktop's `data.json` reaches the mobile as an
   * outside write; with `olderDevice` it lacks the field a load derives, as
   * one saved by a device from before feeds carried it.
   */
  async function mobileAfterDesktopRemovesFeedC(olderDevice: boolean) {
    const desktopApp = await savedVault(feeds());
    const mobileApp = App.createMock();
    await new SyncSimulator(desktopApp, mobileApp).deliver();
    const { plugin: mobile } = await start(mobileApp);

    const desktop = await startPlugin(desktopApp);
    started.push(desktop);
    desktop.settings.feeds = desktop.settings.feeds.filter(
      (candidate) => candidate.feedId !== "feed-c",
    );
    await desktop.saveSettings();
    const delivered = JSON.parse(
      desktopApp.vault.filesOnDisk.get(DATA_PATH) ?? "{}",
    ) as { feeds: Record<string, unknown>[] };
    if (olderDevice) {
      for (const stored of delivered.feeds) {
        delete stored.lastRefreshAttemptCompletedAt;
      }
    }
    mobileApp.vault.externalWrite(DATA_PATH, JSON.stringify(delivered));
    // The watcher reloads once its debounce passes.
    await vi.advanceTimersByTimeAsync(1_500);
    return { mobile, mobileApp };
  }

  it("deletes the unchanged shard of a feed that a delivered data.json removes at the next save, not at the reload", async () => {
    const { mobile, mobileApp } = await mobileAfterDesktopRemovesFeedC(false);

    expect(mobile.settings.feeds.map((f) => f.feedId)).toEqual([
      "feed-a",
      "feed-b",
    ]);
    expect(mobileApp.vault.filesOnDisk.has(shardPath("feed-c"))).toBe(true);
    await mobile.saveSettings();
    expect(mobileApp.vault.filesOnDisk.has(shardPath("feed-c"))).toBe(false);
  });

  it("waits for the next save to delete that shard even when the delivered data.json makes the load derive a field", async () => {
    // The load used to save here, and that save deleted the shard at once
    // (#1519). Cleanup at the next save is what the glossary promises for an
    // orphan shard, and what a vault whose load did not save already had.
    const { mobile, mobileApp } = await mobileAfterDesktopRemovesFeedC(true);

    expect(mobile.settings.feeds.map((f) => f.feedId)).toEqual([
      "feed-a",
      "feed-b",
    ]);
    expect(mobileApp.vault.filesOnDisk.has(shardPath("feed-c"))).toBe(true);
    await mobile.saveSettings();
    expect(mobileApp.vault.filesOnDisk.has(shardPath("feed-c"))).toBe(false);
  });

  it("saves nothing while user-state.json has not arrived", async () => {
    const app = await savedVault(feeds());
    app.vault.filesOnDisk.delete(USER_STATE_PATH);
    const watch = watchAdapter(app);

    const { save } = await start(app);

    expect(save).not.toHaveBeenCalled();
    expect(
      watch.writes().filter((path) => isShardPath(path) || path === DATA_PATH),
    ).toEqual([]);
  });
});
