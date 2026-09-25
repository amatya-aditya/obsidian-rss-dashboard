import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";

interface VaultAdapterStub {
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<string>;
}

const metadataFolder = ".rss-dashboard-data";
const storageFolder = `${metadataFolder}/feeds`;
const userStatePath = `${metadataFolder}/user-state.json`;

function manifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    author: "test",
    description: "test",
    dir: ".",
  };
}

function persistedFeed(feedId: string): Omit<Feed, "items"> {
  return {
    feedId,
    title: feedId,
    url: `https://example.com/${feedId}.xml`,
    folder: "RSS",
    lastUpdated: 0,
  };
}

describe("importing a preferences file that carries feeds (issue #374)", () => {
  let app: App;
  let plugin: RssDashboardPlugin;

  function adapter(): VaultAdapterStub {
    return app.vault.adapter as unknown as VaultAdapterStub;
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    app = App.createMock();

    // A Shard storage v2 vault with two feeds, each with a starred article.
    await adapter().write(
      `${metadataFolder}/data.json`,
      JSON.stringify({
        ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        lastShownVersion: "2.7.0",
        storageMode: "vault-shards-v2",
        storageFolder,
        metadataStorageMode: "vault-location",
        metadataStorageFolder: metadataFolder,
        metadataStorageSchemaVersion: 2,
        feeds: [persistedFeed("feed-kept"), persistedFeed("feed-left-out")],
      }),
    );
    for (const feedId of ["feed-kept", "feed-left-out"]) {
      await adapter().write(
        `${storageFolder}/${feedId}.json`,
        JSON.stringify({
          version: 1,
          feedId,
          feedUrl: `https://example.com/${feedId}.xml`,
          updatedAt: 0,
          items: [
            {
              title: "Article",
              link: `https://example.com/${feedId}/1`,
              description: "",
              pubDate: "2026-01-01T00:00:00Z",
              guid: `${feedId}-guid`,
              feedTitle: feedId,
              feedUrl: `https://example.com/${feedId}.xml`,
              coverImage: "",
            },
          ],
        }),
      );
    }
    await adapter().write(
      userStatePath,
      JSON.stringify({
        version: 3,
        states: {
          "feed-kept:feed-kept-guid": { starred: true },
          "feed-left-out:feed-left-out-guid": { starred: true },
        },
      }),
    );

    plugin = new RssDashboardPlugin(app, manifest());
    plugin.loadData = vi.fn().mockResolvedValue({
      metadataStorageMode: "vault-location",
      metadataStorageFolder: metadataFolder,
      metadataStorageSchemaVersion: 2,
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);
    await plugin.loadSettings();
  });

  it("keeps article state for a feed the imported file leaves out", async () => {
    expect(plugin.settings.feeds.map((feed) => feed.feedId)).toEqual([
      "feed-kept",
      "feed-left-out",
    ]);

    const file = new File(
      [JSON.stringify({ feeds: [persistedFeed("feed-kept")] })],
      "rss-dashboard-user-preferences.json",
    );
    await plugin.importUserSettingsJsonFromFile(file);

    expect(plugin.settings.feeds.map((feed) => feed.feedId)).toEqual([
      "feed-kept",
    ]);
    const written = JSON.parse(await adapter().read(userStatePath)) as {
      states: Record<string, { starred?: boolean }>;
    };
    expect(written.states["feed-left-out:feed-left-out-guid"]?.starred).toBe(
      true,
    );
  });
});
