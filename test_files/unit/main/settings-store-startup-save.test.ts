/**
 * Regression test for the startup save in the settings store: a load that
 * changed nothing must not write to disk, even when the feed articles come
 * from the shard files instead of `data.json`.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { App, type PluginManifest } from "obsidian";

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
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

interface PluginSeams {
  feedStorageRepository: {
    hydrateSettings(...args: unknown[]): Promise<unknown>;
  };
}

const manifest: PluginManifest = {
  id: "rss-dashboard",
  name: "RSS Dashboard",
  version: "2.7.0",
  minAppVersion: "1.8.7",
  author: "test",
  description: "test",
  dir: "plugins/rss-dashboard",
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function article(title: string): FeedItem {
  return {
    title,
    link: `https://example.com/${title}`,
    description: "",
    pubDate: "2026-09-01T00:00:00Z",
    guid: `https://example.com/${title}`,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "shards",
    feedUrl: "https://example.com/shards.xml",
    coverImage: "",
  };
}

describe("settings store startup save", () => {
  let plugin: RssDashboardPlugin;
  let saveData: Mock<(data: unknown) => Promise<void>>;

  /** Builds a plugin whose `data.json` is `data`, with saves recorded. */
  function createPlugin(data: unknown): void {
    plugin = new RssDashboardPlugin(App.createMock(), manifest);
    plugin.loadData = vi.fn(() => Promise.resolve(clone(data)));
    saveData = vi.fn(() => Promise.resolve());
    plugin.saveData = saveData;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("doesn't save a load that changed nothing when articles are filled in from shards", async () => {
    // Load once and save, so the stored settings are already normalized.
    createPlugin({
      ...clone(DEFAULT_SETTINGS),
      lastShownVersion: "2.7.0",
      storageMode: "legacy-json",
      startupRefreshDelaySeconds: 3600,
      feeds: [
        {
          title: "shards",
          url: "https://example.com/shards.xml",
          folder: "Uncategorized",
          items: [],
          lastUpdated: 0,
        },
      ],
    });
    await plugin.loadSettings();
    await plugin.saveSettings();
    const normalized = clone(
      saveData.mock.calls[0]?.[0] as RssDashboardSettings,
    );

    // In Shard storage v2, `data.json` keeps each feed's metadata but no articles.
    normalized.storageMode = "vault-shards-v2";
    createPlugin(normalized);
    // The shard files hold the articles, and nothing in them needed repair.
    vi.spyOn(
      (plugin as unknown as PluginSeams).feedStorageRepository,
      "hydrateSettings",
    ).mockImplementation((settings) => {
      const target = settings as RssDashboardSettings;
      const [feed] = target.feeds;
      if (feed) feed.items = [article("one"), article("two")];
      return Promise.resolve({
        didChange: false,
        shardCount: 1,
        userStateLoaded: true,
      });
    });

    await plugin.loadSettings();

    expect(plugin.settings.feeds[0]?.items).toHaveLength(2);
    expect(saveData).not.toHaveBeenCalled();
  });
});
