import { describe, it, expect, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS } from "../../../src/types/types";

const manifest: PluginManifest = {
  id: "rss-dashboard",
  name: "RSS Dashboard",
  version: "2.7.0",
  author: "test",
  description: "test",
  dir: ".",
};

function makeItem(feed: string, n: number) {
  return {
    title: `${feed}-${n}`,
    link: `https://e.com/${feed}/${n}`,
    guid: `g-${feed}-${n}`,
    description: "d",
    pubDate: "2026-01-01T00:00:00Z",
    read: false,
    starred: false,
    tags: [],
    feedTitle: feed,
    feedUrl: `https://e.com/${feed}`,
    coverImage: "",
  };
}

interface SavedData {
  feeds?: Array<{ items?: unknown[] }>;
}

describe("reverting metadata storage to the plugin default", () => {
  it("never writes article bodies into data.json while a shard storage mode is active", async () => {
    const app = App.createMock();
    let disk: unknown = {
      ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      storageMode: "legacy-json",
      feeds: ["a", "b"].map((id) => ({
        title: id,
        url: `https://e.com/${id}`,
        folder: "",
        lastUpdated: 0,
        items: [makeItem(id, 1), makeItem(id, 2)],
      })),
    };
    const writes: SavedData[] = [];

    const plugin = new RssDashboardPlugin(app, manifest);
    plugin.loadData = vi.fn(async () => disk);
    plugin.saveData = vi.fn(async (data: unknown) => {
      disk = JSON.parse(JSON.stringify(data));
    });
    await plugin.loadSettings();
    await plugin.migrateToVaultShardsV2();

    plugin.saveData = vi.fn(async (data: unknown) => {
      writes.push(JSON.parse(JSON.stringify(data)) as SavedData);
    });
    await plugin.revertMetadataToPluginDefault();

    expect(writes.length).toBeGreaterThan(0);
    for (const written of writes) {
      for (const feed of written.feeds ?? []) {
        expect(feed.items).toBeUndefined();
      }
    }
  });
});
