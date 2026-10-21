/**
 * A save never writes over a synced change it has not loaded (#1418).
 *
 * A synced `user-state.json` edit fires `modify`, and the watcher reloads
 * after a 1.5 s debounce. A save inside that window used to read the file and
 * overwrite the entry of every loaded article with its in-memory state,
 * erasing the synced change. These tests drive the plugin facade and the
 * watcher through a mocked vault adapter with fake timers and assert what is
 * on disk and in memory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

// The default folder: the watcher matches it in plugin-default mode.
const METADATA_FOLDER = ".rss-dashboard-data";
const SHARD_FOLDER = `${METADATA_FOLDER}/feeds`;
const SHARD_PATH = `${SHARD_FOLDER}/feed-1.json`;
const USER_STATE_PATH = `${METADATA_FOLDER}/user-state.json`;
const FEED_URL = "https://example.com/feed.xml";
const GUID_A = "guid-a";
const GUID_B = "guid-b";
const RELOAD_DEBOUNCE_MS = 1_500;

interface VaultAdapterStub {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

interface StoreSeams {
  registerVaultMetadataChangeListeners(
    registerEvent: (ref: unknown) => void,
  ): void;
}

interface UserStateOnDisk {
  states: Record<string, { read?: boolean; starred?: boolean }>;
}

function item(guid: string): FeedItem {
  return {
    title: guid,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: "2026-01-01T00:00:00Z",
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: FEED_URL,
    coverImage: "",
  };
}

function settings(): RssDashboardSettings {
  const base = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  const feed: Feed = {
    title: "Example Feed",
    url: FEED_URL,
    folder: "",
    lastUpdated: 0,
    feedId: "feed-1",
    items: [item(GUID_A), item(GUID_B)],
  };
  base.storageMode = "vault-shards-v2";
  base.storageFolder = SHARD_FOLDER;
  base.metadataStorageMode = "plugin-default";
  base.metadataStorageFolder = METADATA_FOLDER;
  base.startupRefreshDelaySeconds = 3600;
  base.feeds = [feed];
  return base;
}

function adapter(app: App): VaultAdapterStub {
  return app.vault.adapter as unknown as VaultAdapterStub;
}

function userStateOnDisk(app: App): UserStateOnDisk {
  const files = (app.vault as unknown as { adapterFiles: Map<string, string> })
    .adapterFiles;
  return JSON.parse(files.get(USER_STATE_PATH) ?? "{}") as UserStateOnDisk;
}

/** Another device's copy of the snapshot arriving through sync. */
async function syncInStarredA(app: App): Promise<void> {
  await adapter(app).write(
    USER_STATE_PATH,
    JSON.stringify({
      version: 3,
      states: { [`feed-1:${GUID_A}`]: { starred: true } },
    }),
  );
}

let app: App;
let modifyHandler: ((file: { path: string }) => void) | undefined;

beforeEach(() => {
  vi.restoreAllMocks();
  modifyHandler = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function startPlugin(): Promise<RssDashboardPlugin> {
  app = App.createMock();
  await adapter(app).mkdir(SHARD_FOLDER);
  await adapter(app).write(
    SHARD_PATH,
    JSON.stringify({
      version: 1,
      feedId: "feed-1",
      feedUrl: FEED_URL,
      updatedAt: 0,
      items: [item(GUID_A), item(GUID_B)],
    }),
  );
  await adapter(app).write(
    USER_STATE_PATH,
    JSON.stringify({ version: 3, states: {} }),
  );
  const plugin = new RssDashboardPlugin(app, {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: "plugins/rss-dashboard",
  } as PluginManifest);
  plugin.loadData = vi.fn().mockResolvedValue(structuredClone(settings()));
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  await plugin.loadSettings();
  // Capture the watcher's modify handler the way onload() registers it.
  (app.vault as unknown as { on: unknown }).on = (
    event: string,
    callback: (file: { path: string }) => void,
  ) => {
    if (event === "modify") modifyHandler = callback;
    return {};
  };
  (
    plugin as unknown as { settingsStore: StoreSeams }
  ).settingsStore.registerVaultMetadataChangeListeners(() => undefined);
  return plugin;
}

function itemOf(plugin: RssDashboardPlugin, guid: string): FeedItem {
  const found = plugin.settings.feeds[0].items.find((i) => i.guid === guid);
  if (!found) throw new Error(`missing ${guid}`);
  return found;
}

describe("save against an unseen synced user-state change (#1418)", () => {
  it("keeps a synced star when another article is marked read inside the reload window", async () => {
    const plugin = await startPlugin();
    vi.useFakeTimers();

    await syncInStarredA(app);
    modifyHandler?.({ path: USER_STATE_PATH });
    await vi.advanceTimersByTimeAsync(500);

    await plugin.updateArticle(GUID_B, FEED_URL, { read: true }, false);
    await plugin.flushPendingWrites();

    const onDisk = userStateOnDisk(app).states;
    expect(onDisk[`feed-1:${GUID_A}`]?.starred).toBe(true);
    expect(onDisk[`feed-1:${GUID_B}`]?.read).toBe(true);

    // The debounced reload was cancelled by the guarded one; waiting past it
    // must not change what is in memory.
    await vi.advanceTimersByTimeAsync(RELOAD_DEBOUNCE_MS);
    expect(itemOf(plugin, GUID_A).starred).toBe(true);
    expect(itemOf(plugin, GUID_B).read).toBe(true);
  });

  it("keeps a synced star even when no modify event arrived", async () => {
    const plugin = await startPlugin();
    vi.useFakeTimers();

    await syncInStarredA(app);
    await plugin.updateArticle(GUID_B, FEED_URL, { read: true }, false);
    await plugin.flushPendingWrites();

    expect(userStateOnDisk(app).states[`feed-1:${GUID_A}`]?.starred).toBe(true);
    expect(itemOf(plugin, GUID_A).starred).toBe(true);
  });

  it("waits for a reload already in flight and loses neither change", async () => {
    const plugin = await startPlugin();
    vi.useFakeTimers();

    await syncInStarredA(app);
    modifyHandler?.({ path: USER_STATE_PATH });
    // B's change is queued (and journaled) before the reload starts.
    await plugin.updateArticle(GUID_B, FEED_URL, { read: true }, false);

    // Hold the reload open at its read of the snapshot. The watcher's own
    // content check reads the file first, so the load is the second read.
    const read = adapter(app).read.bind(adapter(app));
    let releaseRead: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let held = false;
    let snapshotReads = 0;
    vi.spyOn(adapter(app), "read").mockImplementation(async (path) => {
      if (path === USER_STATE_PATH) snapshotReads += 1;
      if (path === USER_STATE_PATH && snapshotReads === 2) {
        held = true;
        await gate;
      }
      return read(path);
    });
    await vi.advanceTimersByTimeAsync(RELOAD_DEBOUNCE_MS);
    expect(held).toBe(true);

    const flushed = plugin.flushPendingWrites();
    await vi.advanceTimersByTimeAsync(0);
    // The save has not written while the reload is open.
    expect(userStateOnDisk(app).states[`feed-1:${GUID_B}`]?.read).toBe(
      undefined,
    );

    releaseRead?.();
    await flushed;

    const onDisk = userStateOnDisk(app).states;
    expect(onDisk[`feed-1:${GUID_A}`]?.starred).toBe(true);
    expect(onDisk[`feed-1:${GUID_B}`]?.read).toBe(true);
  });

  it("keeps a settings edit made before a save that finds a synced change", async () => {
    const plugin = await startPlugin();
    vi.useFakeTimers();
    const settingsObject = plugin.settings;
    const edited = plugin.settings.refreshInterval + 5;

    await syncInStarredA(app);
    plugin.settings.refreshInterval = edited;
    await plugin.saveSettings();

    // The save refreshes article state in place; replacing the settings
    // object would discard the edit it is about to persist.
    expect(plugin.settings).toBe(settingsObject);
    expect(plugin.settings.refreshInterval).toBe(edited);
    expect(itemOf(plugin, GUID_A).starred).toBe(true);
    expect(userStateOnDisk(app).states[`feed-1:${GUID_A}`]?.starred).toBe(true);
  });

  it("refreshes article state once for a save, without a full settings load", async () => {
    const plugin = await startPlugin();
    vi.useFakeTimers();
    const load = vi.spyOn(plugin, "loadSettings");

    await syncInStarredA(app);
    await plugin.updateArticle(GUID_B, FEED_URL, { read: true }, false);
    await plugin.flushPendingWrites();

    expect(load).not.toHaveBeenCalled();
  });

  it("does not reload when the file still holds what this device wrote", async () => {
    const plugin = await startPlugin();
    vi.useFakeTimers();
    const load = vi.spyOn(plugin, "loadSettings");

    await plugin.updateArticle(GUID_B, FEED_URL, { read: true }, false);
    await plugin.flushPendingWrites();
    await plugin.updateArticle(GUID_A, FEED_URL, { read: true }, false);
    await plugin.flushPendingWrites();

    expect(load).not.toHaveBeenCalled();
    const onDisk = userStateOnDisk(app).states;
    expect(onDisk[`feed-1:${GUID_A}`]?.read).toBe(true);
    expect(onDisk[`feed-1:${GUID_B}`]?.read).toBe(true);
  });
});
