/**
 * Shard storage v2 arrival-order scenarios through the real plugin (#1429).
 *
 * A "desktop" plugin saves a Shard storage v2 vault; the `SyncSimulator`
 * delivers its files to a running "mobile" plugin started through
 * `plugin.onload()`, so Obsidian's own events (`create`, `modify`, `delete`
 * and the `onExternalSettingsChange` callback for the bootstrap `data.json`)
 * reach the real watcher wiring instead of hand-called handlers. Fake timers
 * decide when each file lands relative to the 1.5 s reload debounce.
 *
 * Coverage survey (what the watcher tests already pin, and what this adds):
 *
 * | Candidate order                              | Already covered?                                                                                          |
 * | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
 * | `data.json` before shards / `user-state.json` | Reload decisions per path only (hand-called handlers, settings-store.characterization). Added here.       |
 * | a shard arriving after startup               | Modify of a shard that existed at startup is pinned (#1412). A never-seen shard arriving is added here.   |
 * | `user-state.json` arriving late              | Own-write skip and external edit reload are pinned (#1413). Late arrival as the last file is added here.  |
 * | an empty newer `data.json` winning           | Not covered. Added here.                                                                                  |
 * | delete then create on one path               | Not covered (the watcher registers no `delete` listener). Added here, with the external rename.           |
 *
 * The 1.5 s debounce, rename handling and own-write recognition are pinned in
 * `settings-store.characterization.test.ts` and are not repeated.
 */
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
// A visible folder: Sync skips dot-folders, so the default one never travels.
const METADATA_FOLDER = "rss-dashboard-data";
const SHARD_FOLDER = `${METADATA_FOLDER}/feeds`;
const DATA_PATH = `${METADATA_FOLDER}/data.json`;
const USER_STATE_PATH = `${METADATA_FOLDER}/user-state.json`;
const RELOAD_MS = 1_500;

function shardPath(feedId: string): string {
  return `${SHARD_FOLDER}/${feedId}.json`;
}

function item(feedId: string, guid: string, extra: Partial<FeedItem> = {}) {
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
    ...extra,
  } satisfies FeedItem;
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
  base.lastShownVersion = "2.7.0";
  base.storageMode = "vault-shards-v2";
  base.storageFolder = SHARD_FOLDER;
  // The supported sync setup (#1401 DEC-020): a bootstrap pointer in the
  // plugin folder, the settings in a visible vault folder.
  base.metadataStorageMode = "vault-location";
  base.metadataStorageFolder = METADATA_FOLDER;
  base.startupRefreshDelaySeconds = 3600;
  base.feeds = feeds;
  return base;
}

interface Device {
  app: MockApp;
  plugin: RssDashboardPlugin;
  redraws: ReturnType<typeof vi.fn>;
}

function manifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: PLUGIN_DIR,
  };
}

/**
 * Starts a plugin through `onload()` on `app`. `loadData`/`saveData` read and
 * write the bootstrap `data.json` on that vault's disk, as Obsidian does, so
 * a delivered pointer file is what the next load reads.
 */
async function startDevice(app: MockApp): Promise<Device> {
  const plugin = new RssDashboardPlugin(app, manifest());
  plugin.loadData = vi.fn(async () => {
    const text = app.vault.filesOnDisk.get(POINTER_PATH);
    return text === undefined ? null : JSON.parse(text);
  });
  plugin.saveData = vi.fn(async (data: unknown) => {
    app.vault.filesOnDisk.set(POINTER_PATH, JSON.stringify(data));
  });
  const redraws = vi.fn(async () => undefined);
  plugin.refreshDashboardViews = redraws;
  await plugin.onload();
  return { app, plugin, redraws };
}

/** A desktop that saved `feeds` as Shard storage v2, every file written. */
async function savedDesktop(feeds: Feed[]): Promise<Device> {
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
  const desktop = await startDevice(app);
  await desktop.plugin.saveSettings({
    forceAllShards: true,
    forceMetadata: true,
  });
  return desktop;
}

function feedOf(device: Device, feedId: string): Feed | undefined {
  return device.plugin.settings.feeds.find((f) => f.feedId === feedId);
}

function guidsOf(device: Device, feedId: string): string[] {
  return (feedOf(device, feedId)?.items ?? []).map((i) => i.guid);
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(RELOAD_MS);
}

describe("Shard storage v2 arrival orders through the real plugin (#1429)", () => {
  let devices: Device[];

  /**
   * A mobile that already holds the first sync of `feeds`, started through
   * `onload()`, plus the desktop it syncs from.
   */
  async function pairedDevices(baseline: Feed[]): Promise<{
    desktop: Device;
    mobile: Device;
    sync: SyncSimulator;
  }> {
    const desktop = await savedDesktop(baseline);
    const mobileApp = App.createMock();
    const sync = new SyncSimulator(desktop.app, mobileApp);
    await sync.deliver();
    const mobile = await startDevice(mobileApp);
    devices.push(desktop, mobile);
    return { desktop, mobile, sync };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    devices = [];
  });

  afterEach(() => {
    for (const device of devices) device.plugin.onunload();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** The desktop adds `feed-b` and stars `a1`, each synced file written. */
  async function desktopAddsFeedBAndStarsA1(desktop: Device): Promise<void> {
    desktop.plugin.settings.feeds.push(feed("feed-b", ["b1", "b2"]));
    await desktop.plugin.saveSettings({ forceAllShards: true });
    await desktop.plugin.updateArticle(
      "a1",
      "https://example.com/feed-a.xml",
      { starred: true },
      false,
    );
    await desktop.plugin.flushPendingWrites();
  }

  function starredOf(device: Device, feedId: string): string[] {
    return (feedOf(device, feedId)?.items ?? [])
      .filter((i) => i.starred)
      .map((i) => i.guid);
  }

  function filesIn(vault: MockApp["vault"], folder: string): string[] {
    return [...vault.filesOnDisk.keys()]
      .filter((path) => path.startsWith(`${folder}/`))
      .sort();
  }

  it("shows the new feed empty when data.json lands before its shard, then fills it when the shard and user-state.json arrive", async () => {
    const { desktop, mobile, sync } = await pairedDevices([
      feed("feed-a", ["a1", "a2"]),
    ]);
    await desktopAddsFeedBAndStarsA1(desktop);
    const redrawsBefore = mobile.redraws.mock.calls.length;

    await sync.deliver({ only: [DATA_PATH] });
    await settle();
    expect(guidsOf(mobile, "feed-a")).toEqual(["a1", "a2"]);
    expect(feedOf(mobile, "feed-b")).toBeDefined();
    expect(guidsOf(mobile, "feed-b")).toEqual([]);
    expect(starredOf(mobile, "feed-a")).toEqual([]);
    expect(mobile.redraws.mock.calls.length).toBe(redrawsBefore + 1);

    await sync.deliver({ only: [shardPath("feed-b")] });
    await settle();
    expect(guidsOf(mobile, "feed-b")).toEqual(["b1", "b2"]);
    expect(starredOf(mobile, "feed-a")).toEqual([]);

    await sync.deliver({ only: [USER_STATE_PATH] });
    await settle();
    expect(starredOf(mobile, "feed-a")).toEqual(["a1"]);
    expect(guidsOf(mobile, "feed-b")).toEqual(["b1", "b2"]);
  });

  it("applies a late user-state.json to articles that are already loaded, without a restart", async () => {
    const { desktop, mobile, sync } = await pairedDevices([
      feed("feed-a", ["a1", "a2"]),
    ]);
    await desktopAddsFeedBAndStarsA1(desktop);

    const delivery = sync.deliver({
      order: [DATA_PATH, shardPath("feed-b"), USER_STATE_PATH],
      delayMs: 5 * RELOAD_MS,
    });
    // The delivery sleeps between files under fake timers; the first two
    // files land and reload before user-state.json arrives.
    await vi.advanceTimersByTimeAsync(6 * RELOAD_MS);
    expect(guidsOf(mobile, "feed-b")).toEqual(["b1", "b2"]);
    expect(starredOf(mobile, "feed-a")).toEqual([]);

    await vi.advanceTimersByTimeAsync(5 * RELOAD_MS);
    await delivery;
    await settle();
    expect(starredOf(mobile, "feed-a")).toEqual(["a1"]);
  });

  it("loads a shard that arrives after startup for a feed that had none", async () => {
    const desktop = await savedDesktop([
      feed("feed-a", ["a1", "a2"]),
      feed("feed-b", ["b1", "b2"]),
    ]);
    const mobileApp = App.createMock();
    const sync = new SyncSimulator(desktop.app, mobileApp);
    await sync.deliver({
      only: [DATA_PATH, POINTER_PATH, shardPath("feed-a"), USER_STATE_PATH],
    });
    const mobile = await startDevice(mobileApp);
    devices.push(desktop, mobile);
    const loads = vi.spyOn(mobile.plugin, "loadSettings");

    expect(guidsOf(mobile, "feed-b")).toEqual([]);

    await sync.deliver({ only: [shardPath("feed-b")] });
    await settle();

    expect(loads).toHaveBeenCalledTimes(1);
    expect(guidsOf(mobile, "feed-b")).toEqual(["b1", "b2"]);
    expect(guidsOf(mobile, "feed-a")).toEqual(["a1", "a2"]);
  });

  it("lets an empty, newer data.json win, and does not bring the feeds back when an old shard lands after it", async () => {
    const { desktop, mobile, sync } = await pairedDevices([
      feed("feed-a", ["a1", "a2"]),
    ]);
    desktop.plugin.settings.feeds = [];
    await desktop.plugin.saveSettings({ forceAllShards: true });
    const staleShard = mobile.app.vault.filesOnDisk.get(shardPath("feed-a"));

    await sync.deliver({ only: [DATA_PATH] });
    await settle();
    expect(mobile.plugin.settings.feeds).toEqual([]);

    mobile.app.vault.externalWrite(shardPath("feed-a"), staleShard as string);
    await settle();
    expect(mobile.plugin.settings.feeds).toEqual([]);
  });

  it("reloads a shard a sync replaced by deleting then creating it, in separate events or in one", async () => {
    const { mobile } = await pairedDevices([feed("feed-a", ["a1", "a2"])]);
    const vault = mobile.app.vault;
    const path = shardPath("feed-a");
    const loads = vi.spyOn(mobile.plugin, "loadSettings");
    const text = JSON.parse(vault.filesOnDisk.get(path) as string);
    text.items.push(item("feed-a", "a3"));

    // A delete alone raises no watched event: the articles stay as loaded.
    vault.externalDelete(path);
    await settle();
    expect(loads).not.toHaveBeenCalled();
    expect(guidsOf(mobile, "feed-a")).toEqual(["a1", "a2"]);

    // The create that follows is new content, so it reloads.
    vault.externalWrite(path, JSON.stringify(text));
    await settle();
    expect(loads).toHaveBeenCalledTimes(1);
    expect(guidsOf(mobile, "feed-a")).toEqual(["a1", "a2", "a3"]);

    // A delete and a create inside one watcher tick arrive as one modify.
    text.items.push(item("feed-a", "a4"));
    vault.externalTick(() => {
      vault.externalDelete(path);
      vault.externalWrite(path, JSON.stringify(text));
    });
    await settle();
    expect(loads).toHaveBeenCalledTimes(2);
    expect(guidsOf(mobile, "feed-a")).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("leaves the feed empty after an external rename of its shard, and writes no empty shard over it", async () => {
    const { mobile } = await pairedDevices([feed("feed-a", ["a1", "a2"])]);
    const vault = mobile.app.vault;
    const renamed = `${SHARD_FOLDER}/feed-a-old.json`;

    // An external rename arrives as a create at the new path, then a delete.
    vault.externalRename(shardPath("feed-a"), renamed);
    await settle();
    expect(guidsOf(mobile, "feed-a")).toEqual([]);

    await mobile.plugin.saveSettings();
    expect(filesIn(vault, SHARD_FOLDER)).toEqual([renamed]);
  });

  it("keeps showing a shard another device deleted, and the next save writes it back", async () => {
    const { mobile } = await pairedDevices([feed("feed-a", ["a1", "a2"])]);
    const vault = mobile.app.vault;
    const loads = vi.spyOn(mobile.plugin, "loadSettings");

    // The watcher registers no delete listener, so nothing reloads.
    vault.externalDelete(shardPath("feed-a"));
    await settle();
    expect(loads).not.toHaveBeenCalled();
    expect(guidsOf(mobile, "feed-a")).toEqual(["a1", "a2"]);

    await mobile.plugin.updateArticle(
      "a1",
      "https://example.com/feed-a.xml",
      { read: true },
      false,
    );
    await mobile.plugin.saveSettings();
    expect(filesIn(vault, SHARD_FOLDER)).toEqual([shardPath("feed-a")]);
  });
});
