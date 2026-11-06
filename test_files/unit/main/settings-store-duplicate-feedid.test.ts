/**
 * Regression test for #1764: two feeds that share a `feedId` are collapsed to
 * one when settings load, and the healed list is saved once.
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
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";

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

function feed(
  title: string,
  feedId: string | undefined,
  completedAt?: number,
): Feed {
  return {
    title,
    url: `https://example.com/${title}.xml`,
    folder: "Uncategorized",
    items: [],
    lastUpdated: 0,
    ...(feedId ? { feedId } : {}),
    ...(completedAt === undefined
      ? {}
      : { lastRefreshAttemptCompletedAt: completedAt }),
  };
}

describe("settings load: feeds that share a feedId (#1764)", () => {
  let plugin: RssDashboardPlugin;
  let saveData: Mock<(data: unknown) => Promise<void>>;

  async function loadWith(feeds: Feed[]): Promise<void> {
    const data: RssDashboardSettings = {
      ...clone(DEFAULT_SETTINGS),
      lastShownVersion: "2.7.0",
      storageMode: "legacy-json",
      startupRefreshDelaySeconds: 3600,
      feeds,
    };
    plugin = new RssDashboardPlugin(App.createMock(), manifest);
    plugin.loadData = vi.fn(() => Promise.resolve(clone(data)));
    saveData = vi.fn(() => Promise.resolve());
    plugin.saveData = saveData;
    await plugin.loadSettings();
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the copy refreshed most recently and saves the healed list once", async () => {
    await loadWith([
      feed("stale", "dup", 100),
      feed("other", "solo", 50),
      feed("fresh", "dup", 200),
    ]);

    expect(plugin.settings.feeds.map((f) => f.title)).toEqual([
      "fresh",
      "other",
    ]);
    expect(saveData).toHaveBeenCalledTimes(1);

    const saved = saveData.mock.calls[0]?.[0] as RssDashboardSettings;
    expect(saved.feeds.filter((f) => f.feedId === "dup")).toHaveLength(1);
  });

  it("keeps the first listed copy on a tie or when neither has a timestamp", async () => {
    await loadWith([feed("first", "dup"), feed("second", "dup")]);

    expect(plugin.settings.feeds.map((f) => f.title)).toEqual(["first"]);
  });

  it("prefers a copy with a timestamp over one without", async () => {
    await loadWith([feed("never", "dup"), feed("ran", "dup", 5)]);

    expect(plugin.settings.feeds.map((f) => f.title)).toEqual(["ran"]);
  });

  it("leaves feeds without a feedId alone", async () => {
    await loadWith([feed("a", undefined), feed("b", undefined)]);

    expect(plugin.settings.feeds).toHaveLength(2);
  });

  it("writes the healed list to data.json in shard storage, where an unchanged baseline would skip the write", async () => {
    const data: RssDashboardSettings = {
      ...clone(DEFAULT_SETTINGS),
      lastShownVersion: "2.7.0",
      storageMode: "vault-shards-v2",
      startupRefreshDelaySeconds: 3600,
      feeds: [feed("stale", "dup", 1), feed("fresh", "dup", 2)],
    };
    plugin = new RssDashboardPlugin(App.createMock(), manifest);
    plugin.loadData = vi.fn(() => Promise.resolve(clone(data)));
    saveData = vi.fn(() => Promise.resolve());
    plugin.saveData = saveData;
    // Hydration records the persisted baseline from the settings it is given,
    // which already hold the healed list; a save that compares against it
    // finds nothing to write unless the load forces the metadata out.
    const repository = (
      plugin as unknown as {
        feedStorageRepository: {
          hydrateSettings(...args: unknown[]): Promise<unknown>;
          capturePersistedState(settings: RssDashboardSettings): void;
        };
      }
    ).feedStorageRepository;
    vi.spyOn(repository, "hydrateSettings").mockImplementation((settings) => {
      repository.capturePersistedState(settings as RssDashboardSettings);
      return Promise.resolve({
        didChange: false,
        shardCount: 0,
        userStateLoaded: true,
      });
    });

    await plugin.loadSettings();

    expect(plugin.settings.feeds.map((f) => f.title)).toEqual(["fresh"]);
    expect(saveData).toHaveBeenCalledTimes(1);
    const saved = saveData.mock.calls[0]?.[0] as RssDashboardSettings;
    expect(saved.feeds.filter((f) => f.feedId === "dup")).toHaveLength(1);
  });

  it("finds no duplicate on the next load of the saved settings", async () => {
    await loadWith([feed("stale", "dup", 1), feed("fresh", "dup", 2)]);
    const saved = clone(saveData.mock.calls[0]?.[0] as RssDashboardSettings);

    await loadWith(saved.feeds);

    expect(plugin.settings.feeds).toHaveLength(1);
    expect(saveData).not.toHaveBeenCalled();
  });
});
