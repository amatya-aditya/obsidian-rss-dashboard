import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";

import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";

// Any config folder name works; the plugin must follow manifest.dir.
const PLUGIN_DIR = "my-config/plugins/rss-dashboard";

function manifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    author: "test",
    description: "test",
    dir: PLUGIN_DIR,
  };
}

function sampleFeed(): Feed {
  return {
    title: "Test Feed",
    url: "https://example.com/feed.xml",
    folder: "Uncategorized",
    feedId: "feed-1",
    items: [
      {
        title: "Test Article",
        link: "https://example.com/1",
        description: "Test description",
        pubDate: "2024-01-01T00:00:00Z",
        guid: "https://example.com/1",
        read: true,
        starred: true,
        tags: [],
        feedTitle: "Test Feed",
        feedUrl: "https://example.com/feed.xml",
        coverImage: "",
      },
    ],
    lastUpdated: Date.now(),
    mediaType: "article",
  };
}

interface Launch {
  plugin: RssDashboardPlugin;
  app: App;
  persisted: () => unknown;
}

// Each launch gets its own plugin instance over a shared vault, the way a
// restart re-reads data.json and the vault files the last session wrote.
async function launch(app: App, data: unknown): Promise<Launch> {
  let persisted: unknown = data;
  const plugin = new RssDashboardPlugin(app, manifest());
  plugin.loadData = vi.fn().mockResolvedValue(data);
  plugin.saveData = vi.fn().mockImplementation(async (next: unknown) => {
    persisted = JSON.parse(JSON.stringify(next));
  });
  await plugin.loadSettings();
  return { plugin, app, persisted: () => persisted };
}

async function addFeedAndSave(plugin: RssDashboardPlugin): Promise<void> {
  plugin.settings.feeds.push(sampleFeed());
  await plugin.saveSettings();
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Storage location for a fresh install", () => {
  it("keeps feed shards and article state inside the plugin folder", async () => {
    const app = App.createMock();
    const { plugin } = await launch(app, null);

    await addFeedAndSave(plugin);

    const adapter = app.vault.adapter;
    expect(await adapter.exists(`${PLUGIN_DIR}/data/feeds/feed-1.json`)).toBe(true);
    expect(await adapter.exists(`${PLUGIN_DIR}/data/user-state.json`)).toBe(true);
    expect(await adapter.exists(".rss-dashboard-data/user-state.json")).toBe(false);
    expect(await adapter.exists(".rss-dashboard-data/feeds/feed-1.json")).toBe(false);
  });

  it("finds its articles and read state again after a restart", async () => {
    const app = App.createMock();
    const first = await launch(app, null);
    await addFeedAndSave(first.plugin);

    const { plugin } = await launch(app, first.persisted());

    expect(plugin.settings.storageFolder).toBe(`${PLUGIN_DIR}/data/feeds`);
    expect(plugin.settings.metadataStorageFolder).toBe(`${PLUGIN_DIR}/data`);
    const [item] = plugin.settings.feeds[0]?.items ?? [];
    expect(item?.read).toBe(true);
    expect(item?.starred).toBe(true);
  });

  it("leaves an existing install on its current storage folder", async () => {
    const app = App.createMock();
    const existing = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Record<
      string,
      unknown
    >;
    // Older data.json files may not record the folders at all.
    delete existing.storageFolder;
    delete existing.metadataStorageFolder;
    const { plugin } = await launch(app, existing);

    await addFeedAndSave(plugin);

    expect(plugin.settings.storageFolder).toBe(".rss-dashboard-data/feeds");
    expect(plugin.settings.metadataStorageFolder).toBe(".rss-dashboard-data");
    expect(
      await app.vault.adapter.exists(".rss-dashboard-data/user-state.json"),
    ).toBe(true);
  });

  it("leaves a user-chosen storage folder alone", async () => {
    const app = App.createMock();
    const { plugin } = await launch(app, {
      ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      storageFolder: "RSS/feeds",
      metadataStorageFolder: "RSS",
    });

    expect(plugin.settings.storageFolder).toBe("RSS/feeds");
    expect(plugin.settings.metadataStorageFolder).toBe("RSS");
  });
});
