/**
 * A synced `data.json` that replaces a file this device has already saved is
 * merged per entry against the ancestor, so an edit made here survives (#1452,
 * ADR 0036).
 *
 * Obsidian Sync replaces a visible-folder `.json` whole: the later upload wins.
 * These tests play the first Real Sync pass, run 2 (cases C1 and C2): device B's
 * file arrives after this device (A) has already saved its own edit. They drive
 * the plugin facade through a mocked vault with a stateful `data.json` and
 * assert what is on disk and in memory once the debounced reload has run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { SETTINGS_ANCESTOR_STORAGE_KEY } from "../../../src/utils/settings-loader";
import { SettingsAncestorStore } from "../../../src/services/settings-ancestor";

const SHARD_FOLDER = ".rss-dashboard-data/feeds";
const VAULT_FOLDER = "Sync/rss";
const VAULT_DATA_PATH = `${VAULT_FOLDER}/data.json`;
const SETTLE_MS = 10_000;

type Mode = "plugin-default" | "vault-location";

interface VaultAdapterStub {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

function feed(id: string, title: string): Feed {
  return {
    feedId: id,
    title,
    url: `https://${id}.test/feed.xml`,
    folder: "",
    lastUpdated: 1,
    items: [],
  } as unknown as Feed;
}

function initialSettings(mode: Mode): RssDashboardSettings {
  const base = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  base.storageMode = "vault-shards-v2";
  base.storageFolder = SHARD_FOLDER;
  base.metadataStorageMode = mode;
  base.metadataStorageFolder =
    mode === "vault-location" ? VAULT_FOLDER : ".rss-dashboard-data";
  base.startupRefreshDelaySeconds = 3600;
  base.feeds = [feed("feed-x", "X"), feed("feed-y", "Y")];
  return base;
}

interface Harness {
  app: App;
  plugin: RssDashboardPlugin;
  /** The file both devices started from. */
  initial: RssDashboardSettings;
  diskSettings(): Record<string, unknown>;
  /** The other device's file replacing this one whole, then the reload. */
  deliver(file: Record<string, unknown>): Promise<void>;
  titles(): { memory: string[]; disk: string[] };
  notices(): number;
}

async function startPlugin(mode: Mode): Promise<Harness> {
  const app = App.createMock();
  const seed = initialSettings(mode);
  const pluginFile: { current: unknown } = {
    current:
      mode === "vault-location"
        ? {
            metadataStorageMode: "vault-location",
            metadataStorageFolder: VAULT_FOLDER,
          }
        : structuredClone(seed),
  };
  const adapter = app.vault.adapter as unknown as VaultAdapterStub;
  if (mode === "vault-location") {
    await adapter.mkdir(VAULT_FOLDER);
    await adapter.write(VAULT_DATA_PATH, JSON.stringify(seed));
  }
  const plugin = new RssDashboardPlugin(app, {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: "plugins/rss-dashboard",
  } as PluginManifest);
  plugin.loadData = vi.fn(async () => structuredClone(pluginFile.current));
  plugin.saveData = vi.fn(async (data: unknown) => {
    pluginFile.current = structuredClone(data);
  });
  const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
  vi.spyOn(plugin, "refreshDashboardViews").mockResolvedValue(undefined);
  await plugin.loadSettings();

  const diskSettings = (): Record<string, unknown> => {
    if (mode === "vault-location") {
      const files = (
        app.vault as unknown as { adapterFiles: Map<string, string> }
      ).adapterFiles;
      return JSON.parse(files.get(VAULT_DATA_PATH) ?? "{}") as Record<
        string,
        unknown
      >;
    }
    return pluginFile.current as Record<string, unknown>;
  };
  const store = (
    plugin as unknown as {
      settingsStore: {
        handleExternalSettingsChange(): Promise<void>;
        scheduleMetadataReload(path?: string): void;
      };
    }
  ).settingsStore;
  const deliver = async (file: Record<string, unknown>): Promise<void> => {
    vi.useFakeTimers();
    if (mode === "vault-location") {
      await adapter.write(VAULT_DATA_PATH, JSON.stringify(file));
      store.scheduleMetadataReload(VAULT_DATA_PATH);
    } else {
      pluginFile.current = structuredClone(file);
      await store.handleExternalSettingsChange();
    }
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    vi.useRealTimers();
  };
  const feedTitles = (feeds: unknown): string[] =>
    (feeds as Feed[]).map((entry) => `${entry.feedId}:${entry.title}`);
  return {
    app,
    plugin,
    initial: persistedForm(plugin.settings),
    diskSettings,
    deliver,
    titles: () => ({
      memory: feedTitles(plugin.settings.feeds),
      disk: feedTitles(diskSettings().feeds),
    }),
    notices: () =>
      debug.mock.calls.filter((call) => call[0] === "[Stub Notice]").length,
  };
}

/** A settings object as a save writes it: every key, and no feed articles. */
function persistedForm(settings: RssDashboardSettings): RssDashboardSettings {
  const copy = structuredClone(settings);
  copy.feeds = copy.feeds.map((entry) => {
    const { items: _items, ...config } = entry;
    void _items;
    return config as unknown as Feed;
  });
  return copy;
}

/**
 * Device B's file: the starting file with some feeds renamed (a title) or
 * deleted (null). Its feeds are the plugin's own output, as a real device's are.
 */
function fileFrom(
  initial: RssDashboardSettings,
  changes: Record<string, string | null>,
): Record<string, unknown> {
  const feeds = initial.feeds
    .filter((entry) => changes[entry.feedId ?? ""] !== null)
    .map((entry) => ({
      ...structuredClone(entry),
      title: changes[entry.feedId ?? ""] ?? entry.title,
    }));
  return { ...structuredClone(initial), feeds };
}

async function renameHere(
  plugin: RssDashboardPlugin,
  id: string,
  title: string,
): Promise<void> {
  const target = plugin.settings.feeds.find((entry) => entry.feedId === id);
  if (!target) throw new Error(`no feed ${id}`);
  target.title = title;
  await plugin.saveSettings();
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each(["plugin-default", "vault-location"] as const)(
  "a synced data.json against edits saved here (%s) (#1452)",
  (mode) => {
    it("keeps a feed renamed here and a different feed renamed on the other device (C1)", async () => {
      const { plugin, initial, deliver, titles } = await startPlugin(mode);

      await renameHere(plugin, "feed-x", "X renamed on A");
      await deliver(fileFrom(initial, { "feed-y": "Y on B" }));

      const expected = ["feed-x:X renamed on A", "feed-y:Y on B"];
      expect(titles().memory).toEqual(expected);
      expect(titles().disk).toEqual(expected);
    });

    it("lets the delivery win a feed renamed on both devices, and tells the user (C2)", async () => {
      const { plugin, initial, deliver, titles, notices } =
        await startPlugin(mode);

      await renameHere(plugin, "feed-x", "X on A");
      await deliver(fileFrom(initial, { "feed-x": "X on B" }));

      const expected = ["feed-x:X on B", "feed-y:Y"];
      expect(titles().memory).toEqual(expected);
      expect(titles().disk).toEqual(expected);
      expect(notices()).toBe(1);
    });

    it("writes nothing more once the merged file has settled (no loop)", async () => {
      const { plugin, initial, deliver, diskSettings } =
        await startPlugin(mode);

      await renameHere(plugin, "feed-x", "X on A");
      await deliver(fileFrom(initial, { "feed-x": "X on B" }));
      const settled = JSON.stringify(diskSettings());
      vi.useFakeTimers();
      await vi.advanceTimersByTimeAsync(SETTLE_MS);
      vi.useRealTimers();

      expect(JSON.stringify(diskSettings())).toBe(settled);
    });

    it("keeps a feed edited here when the other device deleted it", async () => {
      const { plugin, initial, deliver, titles } = await startPlugin(mode);

      await renameHere(plugin, "feed-x", "X renamed on A");
      await deliver(fileFrom(initial, { "feed-x": null }));

      const expected = ["feed-y:Y", "feed-x:X renamed on A"].sort();
      expect(titles().memory.slice().sort()).toEqual(expected);
      expect(titles().disk.slice().sort()).toEqual(expected);
    });

    it("applies a feed deleted on the other device when it was not edited here", async () => {
      const { initial, deliver, titles } = await startPlugin(mode);

      await deliver(fileFrom(initial, { "feed-x": null }));

      expect(titles().memory).toEqual(["feed-y:Y"]);
      expect(titles().disk).toEqual(["feed-y:Y"]);
    });

    it("lets the delivery win whole when this device has no ancestor", async () => {
      const { app, plugin, initial, deliver, titles } = await startPlugin(mode);
      app.saveLocalStorage(SETTINGS_ANCESTOR_STORAGE_KEY, null);

      await renameHere(plugin, "feed-x", "X renamed on A");
      await deliver(fileFrom(initial, { "feed-y": "Y on B" }));

      const expected = ["feed-x:X", "feed-y:Y on B"];
      expect(titles().memory).toEqual(expected);
      expect(titles().disk).toEqual(expected);
    });

    it("seeds the ancestor from the delivery when there was none", async () => {
      const { app, plugin, initial, deliver, titles } = await startPlugin(mode);
      app.saveLocalStorage(SETTINGS_ANCESTOR_STORAGE_KEY, null);

      await deliver(fileFrom(initial, { "feed-y": "Y on B" }));
      await renameHere(plugin, "feed-x", "X renamed on A");
      await deliver(fileFrom(initial, { "feed-y": "Y on B again" }));

      expect(titles().memory).toEqual([
        "feed-x:X renamed on A",
        "feed-y:Y on B again",
      ]);
    });

    it("does not advance the ancestor for a reload that finds only its own data.json", async () => {
      const { plugin, initial, deliver, titles } = await startPlugin(mode);

      await renameHere(plugin, "feed-x", "X renamed on A");
      // A shard-only delivery reloads without a new data.json.
      await plugin.loadSettings();
      await deliver(fileFrom(initial, { "feed-y": "Y on B" }));

      expect(titles().memory).toEqual([
        "feed-x:X renamed on A",
        "feed-y:Y on B",
      ]);
    });

    it("tells the user nothing for an edit the merge kept", async () => {
      const { plugin, initial, deliver, notices } = await startPlugin(mode);

      await renameHere(plugin, "feed-x", "X renamed on A");
      await deliver(fileFrom(initial, { "feed-y": "Y on B" }));
      expect(notices()).toBe(0);
    });

    it("tells the user nothing when both devices only refreshed", async () => {
      const { plugin, initial, deliver, notices } = await startPlugin(mode);

      plugin.settings.lastRefreshTimestamp = 1_000;
      plugin.settings.lastGlobalRefreshCompletedAt = 1_000;
      await plugin.saveSettings();
      await deliver({
        ...fileFrom(initial, { "feed-y": "Y on B" }),
        lastRefreshTimestamp: 2_000,
        lastGlobalRefreshCompletedAt: 2_000,
      });

      expect(plugin.settings.lastRefreshTimestamp).toBe(2_000);
      expect(plugin.settings.lastGlobalRefreshCompletedAt).toBe(2_000);
      expect(notices()).toBe(0);
    });

    it("keeps the articles and the shard of a feed edited here and deleted there", async () => {
      const { app, plugin, initial, deliver } = await startPlugin(mode);
      const article = {
        guid: "kept-article",
        title: "Kept article",
        link: "https://feed-x.test/a",
        pubDate: new Date(1_700_000_000_000).toISOString(),
        read: false,
        starred: false,
        tags: [],
      };
      plugin.settings.feeds[0].items = [article] as never;
      await plugin.saveSettings();
      const initialWithItems = persistedForm(plugin.settings);

      await renameHere(plugin, "feed-x", "X renamed on A");
      await deliver(fileFrom(initialWithItems, { "feed-x": null }));

      const resurrected = plugin.settings.feeds.find(
        (entry) => entry.feedId === "feed-x",
      );
      expect(resurrected?.title).toBe("X renamed on A");
      expect(resurrected?.items.map((item) => item.guid)).toEqual([
        "kept-article",
      ]);
      const shards = (
        app.vault as unknown as { adapterFiles: Map<string, string> }
      ).adapterFiles;
      const shard = shards.get(`${SHARD_FOLDER}/feed-x.json`) ?? "";
      expect(shard).toContain("kept-article");
      expect(initial.feeds).toHaveLength(2);
    });

    it("gives a feed taken from the delivery the defaults a load adds", async () => {
      const { plugin, initial, deliver } = await startPlugin(mode);
      const bare = {
        feedId: "feed-z",
        title: "Z",
        url: "https://feed-z.test/feed.xml",
        folder: "",
        lastUpdated: 1,
      };

      await renameHere(plugin, "feed-x", "X renamed on A");
      const file = fileFrom(initial, {});
      (file.feeds as unknown[]).push(bare);
      await deliver(file);

      const added = plugin.settings.feeds.find(
        (entry) => entry.feedId === "feed-z",
      );
      expect(added?.title).toBe("Z");
      expect(added?.keywordRules).toBeDefined();
      expect(added?.autoDeleteDuration).toBeDefined();
      const renamed = plugin.settings.feeds.find(
        (entry) => entry.feedId === "feed-x",
      );
      expect(renamed?.title).toBe("X renamed on A");
    });

    it("lets the delivered file stand when the merge cannot run, and merges the next one", async () => {
      const { plugin, initial, deliver, titles } = await startPlugin(mode);
      const load = vi
        .spyOn(SettingsAncestorStore.prototype, "load")
        .mockImplementationOnce(() => {
          throw new Error("storage unavailable");
        });

      await renameHere(plugin, "feed-x", "X renamed on A");
      await deliver(fileFrom(initial, { "feed-y": "Y on B" }));
      expect(titles().memory).toEqual(["feed-x:X", "feed-y:Y on B"]);
      load.mockRestore();

      await renameHere(plugin, "feed-x", "X renamed again");
      await deliver(fileFrom(initial, { "feed-y": "Y on B again" }));
      expect(titles().memory).toEqual([
        "feed-x:X renamed again",
        "feed-y:Y on B again",
      ]);
    });

    it("still keeps the edit when another load runs during the reload", async () => {
      const { plugin, initial, deliver, titles } = await startPlugin(mode);
      const load = plugin.loadSettings.bind(plugin);
      vi.spyOn(plugin, "loadSettings").mockImplementation(async () => {
        await Promise.all([load(), load()]);
      });

      await renameHere(plugin, "feed-x", "X renamed on A");
      await deliver(fileFrom(initial, { "feed-y": "Y on B" }));

      expect(titles().memory).toEqual([
        "feed-x:X renamed on A",
        "feed-y:Y on B",
      ]);
    });
  },
);
