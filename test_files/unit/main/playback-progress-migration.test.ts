import { afterEach, describe, expect, it, vi } from "vitest";
import { App, type MockApp, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../src/types/types";

const LEGACY_PROGRESS_KEY = "rss-podcast-progress";
const FEED_URL = "https://example.com/podcast.xml";
const startedPlugins: RssDashboardPlugin[] = [];

function manifest(app: MockApp): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "Test",
    description: "Test plugin",
    dir: `${app.vault.configDir}/plugins/rss-dashboard`,
  };
}

function episode(
  guid: string,
  playbackProgress?: FeedItem["playbackProgress"],
): FeedItem {
  return {
    title: `Episode ${guid}`,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: "2026-09-01T00:00:00.000Z",
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example podcast",
    feedUrl: FEED_URL,
    coverImage: "",
    mediaType: "podcast",
    ...(playbackProgress ? { playbackProgress } : {}),
  };
}

async function startPlugin(
  app: MockApp,
  items: FeedItem[],
): Promise<RssDashboardPlugin> {
  const plugin = new RssDashboardPlugin(app, manifest(app));
  const hydratedItems = structuredClone(items);
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.media.rememberPlaybackProgress = true;
  settings.feeds = [
    {
      title: "Example podcast",
      url: FEED_URL,
      folder: "",
      lastUpdated: Date.now(),
      items,
    } as Feed,
  ];
  plugin.loadData = vi.fn().mockResolvedValue(settings);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);

  await plugin.onload();
  // Feed hydration is storage-mode-specific; seed the hydrated feed state so
  // this test focuses on the startup migration's conflict handling.
  plugin.settings.feeds = [
    {
      title: "Example podcast",
      url: FEED_URL,
      folder: "",
      lastUpdated: Date.now(),
      items: hydratedItems,
    } as Feed,
  ];
  expect(plugin.settings.feeds[0].items[0].playbackProgress).toEqual(
    hydratedItems[0].playbackProgress,
  );
  startedPlugins.push(plugin);
  return plugin;
}

async function runProgressMigration(plugin: RssDashboardPlugin): Promise<void> {
  await (
    plugin as unknown as {
      migrateMediaProgressOnStartup: () => Promise<void>;
    }
  ).migrateMediaProgressOnStartup();
}

afterEach(() => {
  startedPlugins.splice(0).forEach((plugin) => plugin.unload());
  vi.restoreAllMocks();
  document.body.empty();
});

describe("startup podcast progress migration", () => {
  it("keeps saved episode progress and clears the legacy key with the 1.13.7 API", async () => {
    const app = App.createMock();
    const savedProgress = { position: 1520, duration: 3765, lastUpdated: 100 };
    app.saveLocalStorage(LEGACY_PROGRESS_KEY, {
      "episode-1": { position: 42, duration: 3765 },
    });

    const plugin = await startPlugin(app, [
      episode("episode-1", savedProgress),
    ]);

    await runProgressMigration(plugin);
    await vi.waitFor(() => {
      expect(app.loadLocalStorage(LEGACY_PROGRESS_KEY)).toBeNull();
    });
    expect(plugin.settings.feeds[0].items[0].playbackProgress).toEqual(
      savedProgress,
    );
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it("migrates positive-duration progress only when the episode has no saved progress", async () => {
    const app = App.createMock();
    const savedProgress = { position: 1520, duration: 3765, lastUpdated: 100 };
    app.saveLocalStorage(LEGACY_PROGRESS_KEY, {
      "episode-existing": { position: 42, duration: 3765 },
      "episode-missing": { position: 300, duration: 600 },
      "episode-zero-duration": { position: 80, duration: 0 },
    });

    const plugin = await startPlugin(app, [
      episode("episode-existing", savedProgress),
      episode("episode-missing"),
      episode("episode-zero-duration"),
    ]);

    await runProgressMigration(plugin);
    await vi.waitFor(() => {
      expect(app.loadLocalStorage(LEGACY_PROGRESS_KEY)).toBeNull();
    });
    const items = plugin.settings.feeds[0].items;
    expect(items[0].playbackProgress).toEqual(savedProgress);
    expect(items[1].playbackProgress).toMatchObject({
      position: 300,
      duration: 600,
    });
    expect(items[1].playbackProgress?.lastUpdated).toEqual(expect.any(Number));
    expect(items[2].playbackProgress).toBeUndefined();
    expect(plugin.saveData).toHaveBeenCalled();
    plugin.unload();
  });

  it("clears malformed legacy progress with the Obsidian 1.13.7 fallback", async () => {
    const app = App.createMock();
    const saveLocalStorage = vi.spyOn(app, "saveLocalStorage");
    (
      app as unknown as {
        removeLocalStorage?: (key: string) => void;
      }
    ).removeLocalStorage = undefined;
    app.saveLocalStorage(LEGACY_PROGRESS_KEY, "malformed");

    const plugin = await startPlugin(app, [episode("episode-1")]);

    await runProgressMigration(plugin);

    expect(saveLocalStorage).toHaveBeenCalledWith(LEGACY_PROGRESS_KEY, null);
    expect(app.loadLocalStorage(LEGACY_PROGRESS_KEY)).toBeNull();
  });

  it("runs the migration after the workspace layout is ready", async () => {
    const app = App.createMock();
    const layoutReadyCallbacks: Array<() => void> = [];
    (
      app.workspace as unknown as {
        onLayoutReady: (callback: () => void) => void;
      }
    ).onLayoutReady = (callback) => {
      layoutReadyCallbacks.push(callback);
    };
    const plugin = new RssDashboardPlugin(app, manifest(app));
    plugin.loadData = vi
      .fn()
      .mockResolvedValue(structuredClone(DEFAULT_SETTINGS));
    plugin.saveData = vi.fn().mockResolvedValue(undefined);
    const migrate = vi
      .spyOn(
        plugin as unknown as {
          migrateMediaProgressOnStartup: () => Promise<void>;
        },
        "migrateMediaProgressOnStartup",
      )
      .mockResolvedValue(undefined);
    startedPlugins.push(plugin);

    await plugin.onload();
    expect(migrate).not.toHaveBeenCalled();

    layoutReadyCallbacks[0]?.();

    await vi.waitFor(() => {
      expect(migrate).toHaveBeenCalledTimes(1);
    });
  });
});
