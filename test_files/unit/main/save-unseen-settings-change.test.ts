/**
 * A settings save never writes over a synced `data.json` group it has not
 * loaded (#1431).
 *
 * Another device changes one settings group and the change syncs in; a local
 * save of a different group then used to write the in-memory settings over
 * it. These tests drive the plugin facade through a mocked vault with a
 * stateful `data.json` and assert what is on disk and in memory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";

const SHARD_FOLDER = ".rss-dashboard-data/feeds";
const VAULT_FOLDER = "Sync/rss";
const VAULT_DATA_PATH = `${VAULT_FOLDER}/data.json`;
const RELOAD_DEBOUNCE_MS = 1_500;

interface VaultAdapterStub {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

function adapter(app: App): VaultAdapterStub {
  return app.vault.adapter as unknown as VaultAdapterStub;
}

function baseSettings(
  metadataMode: "plugin-default" | "vault-location",
): RssDashboardSettings {
  const base = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  base.storageMode = "vault-shards-v2";
  base.storageFolder = SHARD_FOLDER;
  base.metadataStorageMode = metadataMode;
  base.metadataStorageFolder =
    metadataMode === "vault-location" ? VAULT_FOLDER : ".rss-dashboard-data";
  base.startupRefreshDelaySeconds = 3600;
  base.feeds = [];
  return base;
}

interface Harness {
  app: App;
  plugin: RssDashboardPlugin;
  /** The plugin-default `data.json`, as Obsidian's loadData would read it. */
  pluginFile: { current: unknown };
  /** The settings group on disk, whichever file holds the full settings. */
  diskSettings(): Record<string, unknown>;
  /** Another device's change arriving in the settings file. */
  syncIn(change: Record<string, unknown>): Promise<void>;
}

async function startPlugin(
  metadataMode: "plugin-default" | "vault-location",
): Promise<Harness> {
  const app = App.createMock();
  const settings = baseSettings(metadataMode);
  const pluginFile: { current: unknown } = {
    current:
      metadataMode === "vault-location"
        ? {
            metadataStorageMode: "vault-location",
            metadataStorageFolder: VAULT_FOLDER,
          }
        : structuredClone(settings),
  };
  if (metadataMode === "vault-location") {
    await adapter(app).mkdir(VAULT_FOLDER);
    await adapter(app).write(VAULT_DATA_PATH, JSON.stringify(settings));
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
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  await plugin.loadSettings();

  const diskSettings = (): Record<string, unknown> => {
    if (metadataMode === "vault-location") {
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
  const syncIn = async (change: Record<string, unknown>): Promise<void> => {
    const next = { ...diskSettings(), ...change };
    if (metadataMode === "vault-location") {
      await adapter(app).write(VAULT_DATA_PATH, JSON.stringify(next));
    } else {
      pluginFile.current = next;
    }
  };
  return { app, plugin, pluginFile, diskSettings, syncIn };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each(["plugin-default", "vault-location"] as const)(
  "save against an unseen synced settings change (%s) (#1431)",
  (mode) => {
    it("keeps a synced group when another group is saved", async () => {
      const { plugin, diskSettings, syncIn } = await startPlugin(mode);
      const syncedInterval = plugin.settings.refreshInterval + 30;
      const localMaxItems = plugin.settings.maxItems + 10;

      await syncIn({ refreshInterval: syncedInterval });
      plugin.settings.maxItems = localMaxItems;
      await plugin.saveSettings();

      expect(diskSettings().refreshInterval).toBe(syncedInterval);
      expect(diskSettings().maxItems).toBe(localMaxItems);
      // Memory and disk agree, without a full reload.
      expect(plugin.settings.refreshInterval).toBe(syncedInterval);
      expect(plugin.settings.maxItems).toBe(localMaxItems);
    });

    it("lets memory win a group both sides changed", async () => {
      const { plugin, diskSettings, syncIn } = await startPlugin(mode);

      await syncIn({ refreshInterval: 111 });
      plugin.settings.refreshInterval = 222;
      await plugin.saveSettings();

      expect(diskSettings().refreshInterval).toBe(222);
      expect(plugin.settings.refreshInterval).toBe(222);
    });

    it("keeps unsaved edits and the settings object while adopting", async () => {
      const { plugin, syncIn } = await startPlugin(mode);
      const settingsObject = plugin.settings;
      const load = vi.spyOn(plugin, "loadSettings");

      await syncIn({ refreshInterval: 77 });
      plugin.settings.maxItems += 1;
      await plugin.saveSettings();

      expect(plugin.settings).toBe(settingsObject);
      expect(load).not.toHaveBeenCalled();
    });

    it("cancels the pending reload and refreshes the views after adopting", async () => {
      const { plugin, syncIn } = await startPlugin(mode);
      vi.useFakeTimers();
      const load = vi.spyOn(plugin, "loadSettings");
      const refresh = vi
        .spyOn(plugin, "refreshDashboardViews")
        .mockResolvedValue(undefined);
      const store = (
        plugin as unknown as {
          settingsStore: { handleExternalSettingsChange(): Promise<void> };
        }
      ).settingsStore;

      await syncIn({ refreshInterval: 77 });
      if (mode === "plugin-default") await store.handleExternalSettingsChange();
      plugin.settings.maxItems += 1;
      await plugin.saveSettings();
      expect(refresh).toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(RELOAD_DEBOUNCE_MS * 2);
      expect(load).not.toHaveBeenCalled();
    });

    it("writes memory untouched when the disk still matches the last write", async () => {
      const { plugin, diskSettings } = await startPlugin(mode);
      const refresh = vi
        .spyOn(plugin, "refreshDashboardViews")
        .mockResolvedValue(undefined);

      plugin.settings.maxItems += 3;
      await plugin.saveSettings();

      expect(diskSettings().maxItems).toBe(plugin.settings.maxItems);
      expect(refresh).not.toHaveBeenCalled();
    });

    it("still writes memory when the settings file cannot be read", async () => {
      const { app, plugin, pluginFile, diskSettings } = await startPlugin(mode);

      if (mode === "vault-location") {
        await adapter(app).write(VAULT_DATA_PATH, "{ not json");
      } else {
        plugin.loadData = vi.fn(async () => {
          throw new Error("unreadable");
        });
      }
      void pluginFile;
      plugin.settings.maxItems += 5;
      await plugin.saveSettings();

      expect(diskSettings().maxItems).toBe(plugin.settings.maxItems);
    });
  },
);

describe("settings save guard re-entrancy (#1431)", () => {
  it("does not read the settings file again for a save a load triggers", async () => {
    const { plugin, pluginFile } = await startPlugin("plugin-default");
    // Make the next load find something to normalize, so it saves.
    (pluginFile.current as Record<string, unknown>).maxItems = 50;
    const loadData = plugin.loadData as unknown as ReturnType<typeof vi.fn>;
    loadData.mockClear();

    await plugin.loadSettings();

    // One read for the load itself; the follow-up save adds none.
    expect(loadData).toHaveBeenCalledTimes(1);
  });
});

describe("settings save guard edge cases (#1431)", () => {
  it("adopts a synced feed list and keeps the items already in memory", async () => {
    const { plugin, diskSettings, syncIn } =
      await startPlugin("plugin-default");
    const feed = {
      title: "Kept",
      url: "https://example.com/feed.xml",
      folder: "",
      lastUpdated: 0,
      feedId: "feed-1",
    };
    plugin.settings.feeds = [
      {
        ...feed,
        items: [
          {
            guid: "g1",
          } as unknown as RssDashboardSettings["feeds"][0]["items"][0],
        ],
      },
    ];
    await plugin.saveSettings();

    await syncIn({
      feeds: [
        feed,
        { ...feed, title: "Added", url: "https://b.test/f", feedId: "feed-2" },
      ],
    });
    plugin.settings.maxItems += 1;
    await plugin.saveSettings();

    expect(plugin.settings.feeds.map((f) => f.feedId)).toEqual([
      "feed-1",
      "feed-2",
    ]);
    expect(plugin.settings.feeds[0].items).toHaveLength(1);
    expect(plugin.settings.feeds[1].items).toEqual([]);
    expect((diskSettings().feeds as unknown[]).length).toBe(2);
  });

  it("keeps an in-place edit to a group after an earlier save", async () => {
    const { plugin, diskSettings, syncIn } =
      await startPlugin("plugin-default");
    plugin.settings.maxItems += 1;
    await plugin.saveSettings();

    // Edited in place and not yet saved, while the other device edits it too.
    plugin.settings.folders.push({ name: "Local", subfolders: [] });
    await syncIn({ folders: [{ name: "Remote", subfolders: [] }] });
    await plugin.saveSettings();

    const names = (diskSettings().folders as { name: string }[]).map(
      (f) => f.name,
    );
    expect(names).toContain("Local");
    expect(names).not.toContain("Remote");
  });

  it("treats an empty settings file as unreadable and writes memory", async () => {
    const { plugin, diskSettings, pluginFile } =
      await startPlugin("plugin-default");
    const before = plugin.settings.refreshInterval;
    pluginFile.current = {};

    plugin.settings.maxItems += 1;
    await plugin.saveSettings();

    expect(plugin.settings.refreshInterval).toBe(before);
    expect(diskSettings().refreshInterval).toBe(before);
  });

  it("does not recurse into the guard for a load-triggered save in vault-location mode", async () => {
    const { app, plugin } = await startPlugin("vault-location");
    const reads = vi.spyOn(adapter(app), "read");
    const files = (
      app.vault as unknown as { adapterFiles: Map<string, string> }
    ).adapterFiles;
    const data = JSON.parse(files.get(VAULT_DATA_PATH) ?? "{}") as Record<
      string,
      unknown
    >;
    data.maxItems = 50;
    await adapter(app).write(VAULT_DATA_PATH, JSON.stringify(data));
    reads.mockClear();

    await plugin.loadSettings();

    const dataReads = reads.mock.calls.filter(([p]) => p === VAULT_DATA_PATH);
    expect(dataReads).toHaveLength(1);
  });
});
