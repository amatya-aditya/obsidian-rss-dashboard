import { describe, it, expect, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";

interface AdapterSpy {
  write: (path: string, content: string) => Promise<void>;
}

function freshSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(): Feed {
  return {
    title: "Example Feed",
    url: "https://example.com/feed.xml",
    folder: "RSS",
    items: [
      {
        title: "Article 1",
        link: "https://example.com/articles/1",
        description: "One",
        pubDate: "2026-01-01T00:00:00Z",
        guid: "https://example.com/articles/1",
        read: true,
        starred: true,
        tags: [],
        feedTitle: "Example Feed",
        feedUrl: "https://example.com/feed.xml",
        coverImage: "",
      },
    ],
    lastUpdated: 0,
  };
}

describe("fresh install storage layout", () => {
  let app: App;
  let repository: FeedStorageRepository;
  let adapterWrites: string[];
  let pluginSaveData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    app = App.createMock();
    repository = new FeedStorageRepository(app);
    adapterWrites = [];
    const adapter = app.vault.adapter as unknown as AdapterSpy;
    const originalWrite = adapter.write.bind(adapter);
    adapter.write = async (path: string, content: string) => {
      adapterWrites.push(path);
      return originalWrite(path, content);
    };
    pluginSaveData = vi.fn().mockResolvedValue(undefined);
  });

  it("defaults to Shard v2 with plugin-default metadata", () => {
    const settings = freshSettings();

    expect(settings.storageMode).toBe("vault-shards-v2");
    expect(settings.metadataStorageMode).toBe("plugin-default");
  });

  it("splits a first save between the plugin folder and the dot-folder in the vault", async () => {
    const settings = freshSettings();
    settings.feeds = [makeFeed()];

    await repository.persistSettings(settings, pluginSaveData);

    // Metadata (data.json) stays with the plugin: one saveData call, no
    // vault-side data.json.
    expect(pluginSaveData).toHaveBeenCalledTimes(1);
    expect(adapterWrites).not.toContain(".rss-dashboard-data/data.json");
    expect(settings.metadataStorageMode).toBe("plugin-default");

    // Shards and user-state.json still land in the vault dot-folder, because
    // user-state.json follows metadataStorageFolder regardless of mode.
    expect(adapterWrites).toContain(".rss-dashboard-data/user-state.json");
    expect(
      adapterWrites.some((p) => /^\.rss-dashboard-data\/feeds\/.+\.json$/.test(p)),
    ).toBe(true);
  });
});
