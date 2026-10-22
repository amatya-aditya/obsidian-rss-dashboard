/**
 * The session recovery baseline (#1519): the automatic backup snapshot holds
 * the state as loaded, and is taken once per session start after a load that
 * can be trusted. It no longer depends on the load saving something.
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

// Counts every backup snapshot any BackupService instance writes, so the test
// observes the baseline regardless of which instance takes it.
const snapshots = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../../src/services/backup-service", () => ({
  BackupService: class BackupService {
    performAutoBackups(): Promise<void> {
      snapshots.count += 1;
      return Promise.resolve();
    }
  },
}));

import RssDashboardPlugin from "../../../main";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";

interface HydrationResult {
  didChange: boolean;
  shardCount: number;
  userStateLoaded: boolean;
}

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

describe("startup recovery baseline", () => {
  let plugin: RssDashboardPlugin;
  let saveData: Mock<(data: unknown) => Promise<void>>;

  /** Builds a plugin whose `data.json` is `data`, with saves recorded. */
  function createPlugin(data: unknown): void {
    plugin = new RssDashboardPlugin(App.createMock(), manifest);
    plugin.loadData = vi.fn(() => Promise.resolve(clone(data)));
    saveData = vi.fn(() => Promise.resolve());
    plugin.saveData = saveData;
  }

  /** Makes Shard storage v2 hydration report `result`, as a real load would. */
  function hydrateWith(result: HydrationResult): void {
    vi.spyOn(
      (plugin as unknown as PluginSeams).feedStorageRepository,
      "hydrateSettings",
    ).mockResolvedValue(result);
  }

  const cleanLoad: HydrationResult = {
    didChange: false,
    shardCount: 1,
    userStateLoaded: true,
  };

  /**
   * Settings as a previous session stored them: loaded once and saved, so a
   * second load of them changes nothing, in Shard storage v2.
   */
  async function storedSettings(
    overrides: Partial<RssDashboardSettings> = {},
  ): Promise<RssDashboardSettings> {
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
      ...overrides,
    });
    await plugin.loadSettings();
    await plugin.saveSettings();
    const stored = clone(saveData.mock.calls[0]?.[0] as RssDashboardSettings);
    stored.storageMode = "vault-shards-v2";
    snapshots.count = 0;
    return stored;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    snapshots.count = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("takes the recovery baseline after a load that saved nothing", async () => {
    createPlugin(await storedSettings());
    hydrateWith(cleanLoad);
    const save = vi.spyOn(plugin, "saveSettings");

    await plugin.loadSettings();

    expect(save).not.toHaveBeenCalled();
    expect(snapshots.count).toBe(1);
  });

  it("takes one snapshot, not two, when the load also repairs something and saves", async () => {
    createPlugin(await storedSettings());
    hydrateWith({ ...cleanLoad, didChange: true });
    const save = vi.spyOn(plugin, "saveSettings");

    await plugin.loadSettings();

    expect(save).toHaveBeenCalledTimes(1);
    expect(snapshots.count).toBe(1);
  });

  it("takes the baseline once per session, not again when a synced change reloads the settings", async () => {
    createPlugin(await storedSettings());
    hydrateWith(cleanLoad);

    await plugin.loadSettings();
    await plugin.loadSettings();

    expect(snapshots.count).toBe(1);
  });

  it("takes no baseline when automatic backups are all turned off", async () => {
    createPlugin(
      await storedSettings({
        autoBackup: {
          backupDataJson: false,
          backupOpml: false,
          backupUserdata: false,
        },
      }),
    );
    hydrateWith(cleanLoad);

    await plugin.loadSettings();

    expect(snapshots.count).toBe(0);
  });

  it("takes no baseline from a null load, which may only mean sync has not delivered data.json yet", async () => {
    createPlugin(null);
    hydrateWith({ didChange: false, shardCount: 0, userStateLoaded: false });
    const save = vi.spyOn(plugin, "saveSettings");

    await plugin.loadSettings();

    expect(save).not.toHaveBeenCalled();
    expect(snapshots.count).toBe(0);
  });

  it("takes no baseline while user-state.json is missing, so a synced file is never backed up as empty", async () => {
    createPlugin(await storedSettings());
    hydrateWith({ ...cleanLoad, userStateLoaded: false });
    const save = vi.spyOn(plugin, "saveSettings");

    await plugin.loadSettings();

    expect(save).not.toHaveBeenCalled();
    expect(snapshots.count).toBe(0);
  });
});
