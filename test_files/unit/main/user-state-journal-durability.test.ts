/**
 * Durability gap found in the #1380 write-back + journal audit: an atomic
 * snapshot replace removes the destination before renaming the completed
 * `.tmp` into place, so a crash in that gap leaves `user-state.json` missing
 * while the journal already lost the records an earlier checkpoint folded in.
 * The `.tmp` (written whole before the remove) is the only copy and is now
 * recovered on read.
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

const METADATA_FOLDER = "rss-dashboard-data";
const SHARD_FOLDER = `${METADATA_FOLDER}/feeds`;
const SHARD_PATH = `${SHARD_FOLDER}/feed-1.json`;
const USER_STATE_PATH = `${METADATA_FOLDER}/user-state.json`;
const USER_STATE_TEMP_PATH = `${USER_STATE_PATH}.tmp`;
const PLUGIN_DIR = "plugins/rss-dashboard";
const FEED_URL = "https://example.com/feed.xml";
const GUID = "guid-1";
const SECOND_GUID = "guid-2";

interface VaultAdapterStub {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
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

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Article",
    link: "https://example.com/a",
    description: "",
    pubDate: "2026-01-01T00:00:00Z",
    guid: GUID,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: FEED_URL,
    coverImage: "",
    ...overrides,
  };
}

function feed(items: FeedItem[]): Feed {
  return {
    title: "Example Feed",
    url: FEED_URL,
    folder: "",
    lastUpdated: 0,
    feedId: "feed-1",
    items,
  };
}

function settings(
  overrides: Partial<RssDashboardSettings> = {},
): RssDashboardSettings {
  const base = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  base.storageMode = "vault-shards-v2";
  base.storageFolder = SHARD_FOLDER;
  base.metadataStorageMode = "plugin-default";
  base.metadataStorageFolder = METADATA_FOLDER;
  base.startupRefreshDelaySeconds = 3600;
  base.feeds = [feed([item(), item({ guid: SECOND_GUID })])];
  return { ...base, ...overrides };
}

function adapter(app: App): VaultAdapterStub {
  return app.vault.adapter as unknown as VaultAdapterStub;
}

function shardJson(items: FeedItem[]): string {
  return JSON.stringify({
    version: 1,
    feedId: "feed-1",
    feedUrl: FEED_URL,
    updatedAt: 0,
    items,
  });
}

let app: App;

beforeEach(async () => {
  vi.restoreAllMocks();
  app = App.createMock();
  await adapter(app).mkdir(SHARD_FOLDER);
  await adapter(app).write(
    SHARD_PATH,
    shardJson([item(), item({ guid: SECOND_GUID })]),
  );
  await adapter(app).write(
    USER_STATE_PATH,
    JSON.stringify({ version: 3, states: {} }),
  );
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function startPlugin(): Promise<RssDashboardPlugin> {
  const plugin = new RssDashboardPlugin(app, manifest());
  plugin.loadData = vi
    .fn()
    .mockImplementation(() => Promise.resolve(structuredClone(settings())));
  const saveData = vi.fn<(data: unknown) => Promise<void>>();
  saveData.mockResolvedValue(undefined);
  plugin.saveData = saveData;
  await plugin.loadSettings();
  return plugin;
}

function readOf(plugin: RssDashboardPlugin, guid = GUID): boolean | undefined {
  return plugin.settings.feeds[0].items.find((entry) => entry.guid === guid)
    ?.read;
}

function starredOf(
  plugin: RssDashboardPlugin,
  guid = GUID,
): boolean | undefined {
  return plugin.settings.feeds[0].items.find((entry) => entry.guid === guid)
    ?.starred;
}

describe("user-state temp recovery (#1380)", () => {
  it("recovers state from a completed temp snapshot left by an interrupted replace", async () => {
    // A checkpoint wrote the `.tmp`, removed `user-state.json`, and crashed
    // before the rename, so only the completed `.tmp` survives with the whole
    // snapshot. Recovery must read it rather than replay over an empty file.
    await adapter(app).write(
      USER_STATE_TEMP_PATH,
      JSON.stringify({
        version: 5,
        checkpointSequence: 2,
        checkpointByDevice: { "device-x": 2 },
        states: {
          "feed-1:guid-1": { read: true, starred: false, saved: false },
          "feed-1:guid-2": { read: false, starred: true, saved: false },
        },
      }),
    );
    await adapter(app).remove(USER_STATE_PATH);

    const plugin = await startPlugin();

    expect(readOf(plugin)).toBe(true);
    expect(starredOf(plugin, SECOND_GUID)).toBe(true);
  });
});
