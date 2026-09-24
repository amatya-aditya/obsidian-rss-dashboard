import { describe, it, expect, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";

// The in-memory vault stub keeps adapter-written files in a private map; the
// sync simulation below needs to enumerate and copy them between two vaults.
function adapterFiles(app: App): Map<string, string> {
  return (app.vault as unknown as { adapterFiles: Map<string, string> })
    .adapterFiles;
}

/**
 * Mirrors Obsidian Sync's documented exclusion rule: files and folders whose
 * name begins with "." are hidden and never synced. The one exception, the
 * vault's config folder, carries the plugin's own data.json, which these
 * tests pass between devices directly rather than through the vault.
 */
function isSyncedByObsidianSync(path: string): boolean {
  return path.split("/").every(segment => !segment.startsWith("."));
}

function syncVault(from: App, to: App): void {
  for (const [path, content] of adapterFiles(from)) {
    if (isSyncedByObsidianSync(path)) {
      adapterFiles(to).set(path, content);
    }
  }
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

/**
 * Persists `folders` on a desktop vault, syncs it to a second vault, and
 * hydrates the second device from the synced plugin data.json.
 */
async function setUpSecondDevice(folders: {
  storageFolder: string;
  metadataStorageFolder: string;
}): Promise<{
  mobile: App;
  mobileSettings: RssDashboardSettings;
  mobileRepository: FeedStorageRepository;
}> {
  const desktop = App.createMock();
  const mobile = App.createMock();

  const desktopSettings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  Object.assign(desktopSettings, folders);
  desktopSettings.feeds = [makeFeed()];

  // Plugin-default metadata lands in the plugin's own data.json, which
  // Obsidian Sync carries inside `.obsidian/plugins/`.
  let pluginDataJson = "";
  await new FeedStorageRepository(desktop).persistSettings(
    desktopSettings,
    vi.fn(async (data: unknown) => {
      pluginDataJson = JSON.stringify(data);
    }),
    { forceAllShards: true, forceMetadata: true },
  );

  syncVault(desktop, mobile);

  const mobileSettings = {
    ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    ...JSON.parse(pluginDataJson),
  } as RssDashboardSettings;
  const mobileRepository = new FeedStorageRepository(mobile);
  await mobileRepository.hydrateSettings(mobileSettings);
  return { mobile, mobileSettings, mobileRepository };
}

describe("Shard storage v2 - cross-device sync", () => {
  it("shows the desktop's articles and article state on a second device when the storage folders are visible", async () => {
    const { mobileSettings, mobileRepository } = await setUpSecondDevice({
      storageFolder: "rss-dashboard-data/feeds",
      metadataStorageFolder: "rss-dashboard-data",
    });

    const feed = mobileSettings.feeds[0] as Feed;
    expect(mobileRepository.getFeedShardHealth(feed)).toBeNull();
    expect(feed.items.map(item => item.title)).toEqual(["Article 1"]);
    expect(feed.items[0]).toMatchObject({ read: true, starred: true });
    expect(mobileRepository.isShardFolderHiddenFromSync()).toBe(false);
  });

  it("explains the hidden default folder on a second device and writes no empty shards there, even on repair", async () => {
    const { mobile, mobileSettings, mobileRepository } =
      await setUpSecondDevice({
        storageFolder: DEFAULT_SETTINGS.storageFolder,
        metadataStorageFolder: DEFAULT_SETTINGS.metadataStorageFolder,
      });

    expect(mobileRepository.isShardFolderHiddenFromSync()).toBe(true);

    const saveData = vi.fn(async () => {});
    await mobileRepository.persistSettings(mobileSettings, saveData);
    await mobileRepository.repairVaultShards(mobileSettings, saveData);

    const writtenShards = [...adapterFiles(mobile).keys()].filter(path =>
      path.startsWith(`${DEFAULT_SETTINGS.storageFolder}/`),
    );
    expect(writtenShards).toEqual([]);
  });
});
