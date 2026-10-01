/**
 * Characterization tests for the settings store in main.ts (#563).
 *
 * The settings store is everything that reads and writes the settings object
 * to disk: loading at startup and after a synced change (the bootstrap
 * pointer, the vault metadata location, the null-load and failed-load
 * guards, normalization and the startup save), saving through the metadata
 * location with the watcher suppressed, the watcher that reloads a synced
 * `data.json` or `user-state.json`, and moving the metadata location. These
 * tests pin what that does today, bugs included, through the plugin's public
 * surface, so the code can move into its own module (ADR 0015, step 7)
 * without these tests changing.
 *
 * Seams used here all stay on the plugin: `loadData`/`saveData`, captured
 * `vault.on` handlers, `initializeSettingsBackedServices()`, the backup
 * service, the refresh scheduler and the feed storage repository. Services
 * being rebuilt is observed through the identity of `plugin.feedParser`.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
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

type VaultHandler = (...args: unknown[]) => void;

interface VaultAdapterStub {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
}

/** Members that stay on the plugin, reached here as test seams. */
interface PluginSeams {
  initializeSettingsBackedServices(): void;
  ensureAutoRefreshScheduler(): { reschedule(): void };
  backupService: { performAutoBackups(): Promise<void> };
  feedStorageRepository: {
    hydrateSettings(...args: unknown[]): Promise<unknown>;
    persistSettings(...args: unknown[]): Promise<unknown>;
  };
}

const PLUGIN_DIR = "plugins/rss-dashboard";
const VAULT_FOLDER = "Synced/RSS";
const UNREADABLE_WARNING =
  "Could not read plugin metadata from the configured vault folder. Settings were not loaded and nothing has been overwritten.";

function manifest(dir: string | undefined): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function feed(title: string, folder: string, extra: Partial<Feed> = {}): Feed {
  return {
    title,
    url: `https://example.com/${title}.xml`,
    folder,
    items: [],
    lastUpdated: 0,
    ...extra,
  };
}

/**
 * Saved settings for an existing install. Legacy JSON storage persists the
 * whole object through `saveData`, which keeps shards and `user-state.json`
 * out of the tests that don't need them. The long startup delay keeps the
 * automatic refresh out of the timer tests.
 */
function savedSettings(
  overrides: Partial<RssDashboardSettings> = {},
): RssDashboardSettings {
  return {
    ...clone(DEFAULT_SETTINGS),
    lastShownVersion: "2.7.0",
    storageMode: "legacy-json",
    startupRefreshDelaySeconds: 3600,
    ...overrides,
  };
}

function pointer(folder = VAULT_FOLDER): Record<string, unknown> {
  return {
    metadataStorageMode: "vault-location",
    metadataStorageFolder: folder,
    metadataStorageSchemaVersion: 2,
  };
}

describe("settings store (issue #563)", () => {
  let app: App;
  let plugin: RssDashboardPlugin;
  let storedData: unknown;
  let loadData: Mock<() => Promise<unknown>>;
  let saveData: Mock<(data: unknown) => Promise<void>>;
  let handlers: Record<string, VaultHandler>;
  let noticeSpy: MockInstance<typeof console.debug>;

  function adapter(): VaultAdapterStub {
    return app.vault.adapter as unknown as VaultAdapterStub;
  }

  function seams(): PluginSeams {
    return plugin as unknown as PluginSeams;
  }

  function notices(): string[] {
    return noticeSpy.mock.calls
      .filter((args) => args[0] === "[Stub Notice]")
      .map((args) => String(args[1]));
  }

  function savedPayloads(): Record<string, unknown>[] {
    return saveData.mock.calls.map(
      ([payload]) => payload as Record<string, unknown>,
    );
  }

  /** Reloads the watcher started, not counting the load in onload. */
  function watcherReloads(): number {
    return loadData.mock.calls.length - 1;
  }

  function createPlugin(
    data: unknown,
    dir: string | null = PLUGIN_DIR,
  ): RssDashboardPlugin {
    storedData = data;
    plugin = new RssDashboardPlugin(app, manifest(dir ?? undefined));
    loadData = vi.fn(() => Promise.resolve(clone(storedData)));
    saveData = vi.fn(() => Promise.resolve());
    plugin.loadData = loadData;
    plugin.saveData = saveData;
    return plugin;
  }

  async function writeVaultSettings(
    folder: string,
    settings: RssDashboardSettings,
  ): Promise<void> {
    await adapter().mkdir(folder);
    await adapter().write(`${folder}/data.json`, JSON.stringify(settings));
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    app = App.createMock();
    handlers = {};
    // Capture the vault watcher so tests can simulate synced changes.
    app.vault.on = vi.fn((event: string, callback: VaultHandler) => {
      handlers[event] = callback;
      return {};
    }) as unknown as typeof app.vault.on;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── Loading ──────────────────────────────────────────────────────────────

  describe("loading", () => {
    it("reads the full settings from the vault folder the bootstrap pointer names", async () => {
      await writeVaultSettings(
        VAULT_FOLDER,
        savedSettings({
          ...pointer(),
          refreshInterval: 45,
          feeds: [feed("from-vault", "RSS")],
        } as Partial<RssDashboardSettings>),
      );
      createPlugin(pointer());

      await plugin.loadSettings();

      expect(plugin.settings.refreshInterval).toBe(45);
      expect(plugin.settings.metadataStorageMode).toBe("vault-location");
      expect(plugin.settings.feeds.map((f) => f.title)).toEqual([
        "from-vault",
      ]);
    });

    it("treats a missing data.json as a fresh install: no save, storage inside the plugin folder, and the release recorded", async () => {
      createPlugin(null);

      await plugin.loadSettings();

      expect(saveData).not.toHaveBeenCalled();
      expect(plugin.settings.lastShownVersion).toBe("2.7.0");
      expect(plugin.settings.metadataStorageFolder).toBe(`${PLUGIN_DIR}/data`);
      expect(plugin.settings.storageFolder).toBe(`${PLUGIN_DIR}/data/feeds`);
      // Nothing saved, so the services were not built either.
      expect(plugin.feedParser).toBeUndefined();
    });

    it("finds the plugin folder through the config folder when the manifest has no dir", async () => {
      createPlugin(null, null);

      await plugin.loadSettings();

      expect(plugin.settings.metadataStorageFolder).toBe(
        `${app.vault.configDir}/plugins/rss-dashboard/data`,
      );
      expect(plugin.settings.storageFolder).toBe(
        `${app.vault.configDir}/plugins/rss-dashboard/data/feeds`,
      );
    });

    it("lets a fresh install save after its null load", async () => {
      createPlugin(null);
      await plugin.loadSettings();
      const persist = vi.spyOn(seams().feedStorageRepository, "persistSettings");

      await plugin.saveSettings();

      expect(persist).toHaveBeenCalledTimes(1);
    });

    describe("when the vault metadata the pointer names can't be read", () => {
      beforeEach(() => {
        createPlugin(pointer());
      });

      it("warns once, writes nothing, and keeps the pointer's location over the defaults", async () => {
        const writeSpy = vi.spyOn(adapter(), "write");

        await plugin.loadSettings();

        expect(notices()).toEqual([UNREADABLE_WARNING]);
        expect(saveData).not.toHaveBeenCalled();
        expect(writeSpy).not.toHaveBeenCalled();
        expect(plugin.settings.metadataStorageMode).toBe("vault-location");
        expect(plugin.settings.metadataStorageFolder).toBe(VAULT_FOLDER);
        // Not a fresh install: storage stays where the defaults put it, and
        // the release isn't recorded.
        expect(plugin.settings.storageFolder).toBe(
          DEFAULT_SETTINGS.storageFolder,
        );
        expect(plugin.settings.lastShownVersion).toBe(
          DEFAULT_SETTINGS.lastShownVersion,
        );
        expect(plugin.settings.feeds).not.toBe(DEFAULT_SETTINGS.feeds);
        // Treated like a null load: no startup save, so no services built.
        expect(plugin.feedParser).toBeUndefined();
      });

      it("skips the startup save even when the pointer's own fields would need one", async () => {
        // Legacy JSON storage has no user-state.json to wait for, so only
        // the unreadable-metadata guard keeps this load from saving.
        storedData = { ...pointer(), storageMode: "legacy-json", refreshInterval: -5 };

        await plugin.loadSettings();

        expect(plugin.feedParser).toBeUndefined();
      });

      it("blocks every save path until a later load succeeds", async () => {
        await plugin.loadSettings();
        const writeSpy = vi.spyOn(adapter(), "write");

        await plugin.saveSettings();
        await plugin.getMetadataSaveCallback()({ anything: true });
        await plugin.revertMetadataToPluginDefault();

        expect(saveData).not.toHaveBeenCalled();
        expect(writeSpy).not.toHaveBeenCalled();
        expect(plugin.settings.metadataStorageMode).toBe("vault-location");

        await writeVaultSettings(
          VAULT_FOLDER,
          savedSettings(pointer() as Partial<RssDashboardSettings>),
        );
        await plugin.loadSettings();
        saveData.mockClear();
        await plugin.saveSettings();

        expect(saveData).toHaveBeenCalled();
      });

      it("warns again only after a successful load in between", async () => {
        await plugin.loadSettings();
        await plugin.loadSettings();
        expect(notices()).toEqual([UNREADABLE_WARNING]);

        await writeVaultSettings(
          VAULT_FOLDER,
          savedSettings(pointer() as Partial<RssDashboardSettings>),
        );
        await plugin.loadSettings();
        await app.vault.adapter.remove(`${VAULT_FOLDER}/data.json`);
        await plugin.loadSettings();

        expect(notices()).toEqual([UNREADABLE_WARNING, UNREADABLE_WARNING]);
      });
    });

    describe("the startup save", () => {
      it("preserves the saved site-icon preference without saving unchanged settings", async () => {
        const settings = savedSettings();
        settings.display.useDomainIconsRss = false;
        delete (settings.display as unknown as Record<string, unknown>)
          .useDomainFavicons;
        createPlugin(settings);

        await plugin.loadSettings();

        expect(saveData).not.toHaveBeenCalled();
        expect(plugin.settings.display.useDomainIconsRss).toBe(false);
        expect("useDomainFavicons" in plugin.settings.display).toBe(false);
      });

      describe("when a load changes settings", () => {
        async function normalizedSettings(
          overrides: Partial<RssDashboardSettings> = {},
        ): Promise<RssDashboardSettings> {
          createPlugin(savedSettings(overrides));
          await plugin.loadSettings();
          await plugin.saveSettings();
          return clone(savedPayloads()[saveData.mock.calls.length - 1]) as unknown as RssDashboardSettings;
        }

        it("doesn't save when loading changed nothing", async () => {
          const settings = await normalizedSettings();
          createPlugin(settings);

          await plugin.loadSettings();

          expect(saveData).not.toHaveBeenCalled();
          expect(plugin.feedParser).toBeUndefined();
        });

        it("saves a normalized value, building the services first so the save can back up", async () => {
          const settings = await normalizedSettings();
          createPlugin({ ...settings, refreshInterval: -5 });

          await plugin.loadSettings();

          expect(saveData).toHaveBeenCalledTimes(1);
          expect(savedPayloads()[0]?.refreshInterval).toBe(0);
          expect(plugin.feedParser).toBeDefined();
        });

        it("saves when duplicate articles were merged", async () => {
          const settings = await normalizedSettings();
          const item = {
            title: "Same",
            link: "https://example.com/same",
            description: "",
            pubDate: "2026-09-01T00:00:00Z",
            guid: "https://example.com/same",
            read: false,
            starred: false,
            tags: [],
            feedTitle: "dupes",
            feedUrl: "https://example.com/dupes.xml",
            coverImage: "",
          };
          const dupes = settings.feeds;
          dupes.push(feed("dupes", "Uncategorized", { items: [item, { ...item, read: true }] }));
          const withDupes = await normalizedSettings({ feeds: dupes });
          expect(withDupes.feeds[0]?.items).toHaveLength(1);
          const raw = clone(withDupes);
          const [dupeFeed] = raw.feeds;
          if (dupeFeed) dupeFeed.items = [item, { ...item, read: true }];
          createPlugin(raw);

          await plugin.loadSettings();

          expect(saveData).toHaveBeenCalledTimes(1);
          expect(plugin.settings.feeds[0]?.items).toHaveLength(1);
          expect(plugin.settings.feeds[0]?.items[0]?.read).toBe(true);
        });

        it("doesn't save a null load, even with user-state.json already there", async () => {
          // Rules out the missing-user-state guard, leaving only the null one.
          await adapter().mkdir(`${PLUGIN_DIR}/data`);
          await adapter().write(
            `${PLUGIN_DIR}/data/user-state.json`,
            JSON.stringify({ version: 1, states: {} }),
          );
          createPlugin(null);
          const persist = vi.spyOn(
            seams().feedStorageRepository,
            "persistSettings",
          );

          await plugin.loadSettings();

          expect(persist).not.toHaveBeenCalled();
        });

        it("doesn't save a Shard storage v2 load whose user-state.json hasn't arrived", async () => {
          const settings = await normalizedSettings();
          createPlugin({
            ...settings,
            storageMode: "vault-shards-v2",
            refreshInterval: -5,
          });
          const persist = vi.spyOn(
            seams().feedStorageRepository,
            "persistSettings",
          );

          await plugin.loadSettings();

          expect(persist).not.toHaveBeenCalled();
          expect(plugin.settings.refreshInterval).toBe(0);
        });

        it("saves the same Shard storage v2 load once user-state.json is there", async () => {
          const settings = await normalizedSettings();
          await adapter().mkdir(".rss-dashboard-data");
          await adapter().write(
            ".rss-dashboard-data/user-state.json",
            JSON.stringify({ version: 1, states: {} }),
          );
          createPlugin({
            ...settings,
            storageMode: "vault-shards-v2",
            refreshInterval: -5,
          });
          const persist = vi.spyOn(
            seams().feedStorageRepository,
            "persistSettings",
          );

          await plugin.loadSettings();

          expect(persist).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe("after onload has built the services", () => {
      beforeEach(async () => {
        createPlugin(savedSettings());
        await plugin.onload();
      });

      afterEach(() => {
        plugin.onunload();
      });

      it("rebinds the services to the reloaded settings and keeps a queued background import", async () => {
        const parser = plugin.feedParser;
        const saver = plugin.articleSaver;
        plugin.backgroundImportQueue = [
          { title: "queued", url: "https://example.com/q.xml", folder: "", lastUpdated: 0 },
        ];

        await plugin.loadSettings();

        expect(plugin.feedParser).not.toBe(parser);
        expect(plugin.articleSaver).not.toBe(saver);
        expect(plugin.backgroundImportQueue.map((f) => f.url)).toEqual([
          "https://example.com/q.xml",
        ]);
      });

      it("asks the automatic refresh to reschedule after a load", async () => {
        const reschedule = vi.spyOn(
          seams().ensureAutoRefreshScheduler(),
          "reschedule",
        );

        await plugin.loadSettings();

        // The load reschedules once after replacing settings.
        expect(reschedule).toHaveBeenCalledTimes(1);
      });

      // BUG: pinned, see #452
      it("repairs a feed's missing folder on a reload but not on the first load", async () => {
        plugin.onunload();
        createPlugin(
          savedSettings({ feeds: [feed("orphan", "Missing folder")], folders: [] }),
        );
        await plugin.onload();
        expect(plugin.settings.folders.map((f) => f.name)).not.toContain(
          "Missing folder",
        );

        await plugin.loadSettings();

        expect(plugin.settings.folders.map((f) => f.name)).toContain(
          "Missing folder",
        );
      });
    });

    describe("overlapping loads", () => {
      type Hydration = {
        didChange: boolean;
        shardCount: number;
        userStateLoaded: boolean;
      };
      const done: Hydration = {
        didChange: false,
        shardCount: 0,
        userStateLoaded: true,
      };

      function holdHydrations(): {
        spy: MockInstance;
        settle: Array<(outcome: Hydration | Error) => void>;
      } {
        const settle: Array<(outcome: Hydration | Error) => void> = [];
        const spy = vi
          .spyOn(seams().feedStorageRepository, "hydrateSettings")
          .mockImplementation(
            () =>
              new Promise((resolve, reject) => {
                settle.push((outcome) =>
                  outcome instanceof Error ? reject(outcome) : resolve(outcome),
                );
              }),
          );
        return { spy, settle };
      }

      it("keeps the newer load's settings without saving unchanged data when an older load finishes last", async () => {
        createPlugin(savedSettings({ refreshInterval: 10 }));
        const { spy, settle } = holdHydrations();

        const older = plugin.loadSettings();
        await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
        storedData = savedSettings({ refreshInterval: 20 });
        const newer = plugin.loadSettings();
        await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
        settle[1]?.(done);
        await newer;
        settle[0]?.(done);
        await older;

        expect(plugin.settings.refreshInterval).toBe(20);
        expect(savedPayloads()).toEqual([]);
      });

      it("blocks saves while a load is still running", async () => {
        createPlugin(savedSettings());
        await plugin.loadSettings();
        const { spy, settle } = holdHydrations();
        const persist = vi.spyOn(
          seams().feedStorageRepository,
          "persistSettings",
        );

        const loading = plugin.loadSettings();
        await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
        await plugin.saveSettings();
        expect(persist).not.toHaveBeenCalled();

        settle[0]?.(done);
        await loading;
      });

      it("drops an older load whose data arrives after a newer load finished", async () => {
        createPlugin(savedSettings({ refreshInterval: 10 }));
        let releaseOlder: ((data: unknown) => void) | undefined;
        loadData.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseOlder = resolve;
            }),
        );

        const older = plugin.loadSettings();
        storedData = savedSettings({ refreshInterval: 20 });
        await plugin.loadSettings();
        releaseOlder?.(savedSettings({ refreshInterval: 10 }));
        await older;

        expect(plugin.settings.refreshInterval).toBe(20);
      });

      it("ignores an older load's failure once a newer load has started", async () => {
        createPlugin(savedSettings({ refreshInterval: 10 }));
        const { spy, settle } = holdHydrations();

        const older = plugin.loadSettings();
        await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
        storedData = savedSettings({ refreshInterval: 20 });
        const newer = plugin.loadSettings();
        await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
        settle[0]?.(new Error("older failed"));
        await older;
        settle[1]?.(done);
        await newer;

        expect(notices()).toEqual([]);
        expect(plugin.settings.refreshInterval).toBe(20);
        await plugin.saveSettings();
        expect(saveData).toHaveBeenCalled();
      });
    });
  });

  // ─── A failed load (#447, fixed) ──────────────────────────────────────────

  describe("a failed load", () => {
    it("shows the error, falls back to a private copy of the defaults, and blocks every save path", async () => {
      createPlugin(savedSettings());
      loadData.mockRejectedValueOnce(new Error("Load failed"));
      const writeSpy = vi.spyOn(adapter(), "write");

      await plugin.loadSettings();
      const persist = vi.spyOn(
        seams().feedStorageRepository,
        "persistSettings",
      );

      expect(notices()).toEqual(["Error loading settings: Load failed"]);
      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
      expect(plugin.settings).not.toBe(DEFAULT_SETTINGS);
      expect(plugin.settings.display).not.toBe(DEFAULT_SETTINGS.display);

      await plugin.saveSettings();
      await plugin.getMetadataSaveCallback()({ anything: true });
      await plugin.migrateMetadataToVaultLocation();
      expect(persist).not.toHaveBeenCalled();
      expect(saveData).not.toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled();
      // The move is skipped silently, with no "already using" notice.
      expect(notices()).toHaveLength(1);
      expect(plugin.settings.metadataStorageMode).toBe("plugin-default");
    });

    it("reports a thrown non-Error as an unknown error", async () => {
      createPlugin(savedSettings());
      loadData.mockRejectedValueOnce("nope");

      await plugin.loadSettings();

      expect(notices()).toEqual(["Error loading settings: Unknown error"]);
    });

    it("rebinds services that were already built to the fallback settings", async () => {
      createPlugin(savedSettings());
      await plugin.onload();
      const parser = plugin.feedParser;
      loadData.mockRejectedValueOnce(new Error("Reload failed"));

      await plugin.loadSettings();

      expect(plugin.feedParser).not.toBe(parser);
      await plugin.ensureFolderExists("After failure", { saveSettings: false });
      expect(plugin.settings.folders.map((f) => f.name)).toContain(
        "After failure",
      );
      plugin.onunload();
    });

    it("builds no services on a first load", async () => {
      createPlugin(savedSettings());
      loadData.mockRejectedValueOnce(new Error("Load failed"));

      await plugin.loadSettings();

      expect(plugin.feedParser).toBeUndefined();
    });
  });

  // ─── Saving ───────────────────────────────────────────────────────────────

  describe("saving", () => {
    it("writes the full settings through saveData when metadata is in the plugin folder", async () => {
      createPlugin(savedSettings());
      await plugin.loadSettings();
      saveData.mockClear();
      plugin.settings.refreshInterval = 120;

      await plugin.saveSettings();

      expect(saveData).toHaveBeenCalledTimes(1);
      expect(savedPayloads()[0]).toEqual(
        expect.objectContaining({
          refreshInterval: 120,
          metadataStorageMode: "plugin-default",
          feeds: [],
        }),
      );
    });

    it("writes pretty-printed data.json in the vault folder, then only the three-field bootstrap pointer", async () => {
      createPlugin(savedSettings());
      await plugin.loadSettings();
      saveData.mockClear();
      Object.assign(plugin.settings, pointer());
      let fileWhenPointerSaved: string | undefined;
      saveData.mockImplementation(async () => {
        fileWhenPointerSaved = await adapter().read(`${VAULT_FOLDER}/data.json`);
      });

      await plugin.saveSettings();

      const written = await adapter().read(`${VAULT_FOLDER}/data.json`);
      expect(written.startsWith('{\n  "')).toBe(true);
      expect(JSON.parse(written)).toEqual(
        expect.objectContaining({ ...pointer(), storageMode: "legacy-json" }),
      );
      expect(fileWhenPointerSaved).toBe(written);
      expect(savedPayloads()).toEqual([pointer()]);
    });

    it.each([
      ["/Synced/RSS/", "Synced/RSS/data.json"],
      ["  ", ".rss-dashboard-data/data.json"],
    ])(
      "normalizes the vault folder %j to %s",
      async (folder, expectedPath) => {
        createPlugin(savedSettings());
        await plugin.loadSettings();
        Object.assign(plugin.settings, pointer(folder));

        await plugin.saveSettings();

        expect(await adapter().exists(expectedPath)).toBe(true);
      },
    );

    it("refuses a vault folder path that is a file, and saves no pointer", async () => {
      createPlugin(savedSettings());
      await plugin.loadSettings();
      saveData.mockClear();
      await adapter().mkdir("Synced");
      await adapter().write(VAULT_FOLDER, "not a folder");
      Object.assign(plugin.settings, pointer());

      await expect(plugin.saveSettings()).rejects.toThrow(
        `Metadata storage path points to a file, not a folder: ${VAULT_FOLDER}`,
      );
      expect(saveData).not.toHaveBeenCalled();
    });

    it("resolves the location when the callback runs, not when it was created", async () => {
      createPlugin(savedSettings());
      await plugin.loadSettings();
      saveData.mockClear();
      const callback = plugin.getMetadataSaveCallback();
      plugin.settings = { ...plugin.settings, ...pointer("Later") };

      await callback({ written: "as given" });

      expect(await adapter().read("Later/data.json")).toBe(
        JSON.stringify({ written: "as given" }, null, 2),
      );
      expect(savedPayloads()).toEqual([pointer("Later")]);
    });

    it("skips the pointer when a load starts while the vault copy is being written", async () => {
      createPlugin(savedSettings());
      await plugin.loadSettings();
      saveData.mockClear();
      Object.assign(plugin.settings, pointer());
      // The reload never finishes, so its flag stays set.
      loadData.mockImplementationOnce(() => new Promise(() => {}));
      const write = adapter().write.bind(adapter());
      vi.spyOn(adapter(), "write").mockImplementation(async (path, data) => {
        void plugin.loadSettings();
        await write(path, data);
      });

      await plugin.getMetadataSaveCallback()({ anything: true });

      expect(await adapter().exists(`${VAULT_FOLDER}/data.json`)).toBe(true);
      expect(saveData).not.toHaveBeenCalled();
    });

    it("passes its options to the storage repository", async () => {
      createPlugin(savedSettings());
      await plugin.loadSettings();
      const persist = vi.spyOn(seams().feedStorageRepository, "persistSettings");

      await plugin.saveSettings({ forceAllShards: true });

      expect(persist).toHaveBeenCalledWith(
        plugin.settings,
        expect.any(Function),
        { forceAllShards: true },
      );
    });

    // Built by hand, as onload would, but without onload's startup save,
    // which would already have taken this session's backup snapshot.
    describe("with the services built and no save yet this session", () => {
      let backups: Mock<() => Promise<void>>;
      let reschedule: MockInstance;
      let order: string[];

      beforeEach(() => {
        createPlugin(null);
        plugin.settings = savedSettings({
          autoBackup: {
            backupDataJson: true,
            backupOpml: false,
            backupUserdata: false,
          },
        } as Partial<RssDashboardSettings>);
        seams().initializeSettingsBackedServices();
        order = [];
        saveData.mockImplementation(() => {
          order.push("saveData");
          return Promise.resolve();
        });
        backups = vi.fn(() => {
          order.push("backup");
          return Promise.resolve();
        });
        seams().backupService.performAutoBackups = backups;
        reschedule = vi
          .spyOn(seams().ensureAutoRefreshScheduler(), "reschedule")
          .mockImplementation(() => {
            order.push("reschedule");
          });
      });

      it("persists, then records the change for backup, then reschedules the automatic refresh", async () => {
        await plugin.saveSettings();
        await plugin.saveSettings();

        // One recovery snapshot per session; later saves wait for unload.
        expect(order).toEqual([
          "saveData",
          "backup",
          "reschedule",
          "saveData",
          "reschedule",
        ]);
      });

      it("logs a failed backup and still resolves", async () => {
        const failure = new Error("disk full");
        backups.mockRejectedValueOnce(failure);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(plugin.saveSettings()).resolves.toBeUndefined();

        expect(errorSpy).toHaveBeenCalledWith(
          "[RSS Dashboard] Backup after save failed:",
          failure,
        );
        expect(reschedule).toHaveBeenCalledTimes(1);
      });

      it("rethrows a failed persist, with no backup and no reschedule", async () => {
        const failure = new Error("write failed");
        saveData.mockRejectedValueOnce(failure);

        await expect(plugin.saveSettings()).rejects.toBe(failure);

        expect(backups).not.toHaveBeenCalled();
        expect(reschedule).not.toHaveBeenCalled();
      });
    });
  });

  // ─── The metadata watcher ─────────────────────────────────────────────────

  describe("the metadata watcher", () => {
    let redraws: MockInstance;

    async function start(settings: RssDashboardSettings): Promise<void> {
      vi.useFakeTimers();
      createPlugin(settings);
      redraws = vi
        .spyOn(plugin, "refreshDashboardViews")
        .mockResolvedValue(undefined);
      await plugin.onload();
    }

    afterEach(() => {
      plugin.onunload();
    });

    describe("with metadata in the plugin folder", () => {
      beforeEach(async () => {
        await start(savedSettings());
      });

      it.each([
        ["modify", ".rss-dashboard-data/data.json", true],
        ["modify", ".rss-dashboard-data/user-state.json", true],
        ["create", ".rss-dashboard-data/data.json", true],
        ["modify", "/.rss-dashboard-data/data.json/", true],
        ["modify", `${PLUGIN_DIR}/data.json`, false],
        ["modify", ".rss-dashboard-data/feeds/feed-1.json", false],
        ["modify", ".rss-dashboard-data/backup.json", false],
        ["modify", "notes/data.json", false],
      ])("on %s of %s, reloads: %s", async (event, path, reloads) => {
        handlers[event]?.({ path });
        await vi.advanceTimersByTimeAsync(1_500);

        expect(watcherReloads()).toBe(reloads ? 1 : 0);
        expect(redraws).toHaveBeenCalledTimes(reloads ? 1 : 0);
      });

      it("accepts a bare path string, and ignores a file with no path", async () => {
        handlers.modify?.({ name: "data.json" });
        await vi.advanceTimersByTimeAsync(1_500);
        expect(watcherReloads()).toBe(0);

        handlers.modify?.(".rss-dashboard-data/data.json");
        await vi.advanceTimersByTimeAsync(1_500);
        expect(watcherReloads()).toBe(1);
      });

      it("reloads on a rename to or from a watched path", async () => {
        handlers.rename?.({ path: ".rss-dashboard-data/data.json" }, "a.json");
        await vi.advanceTimersByTimeAsync(1_500);
        handlers.rename?.({ path: "b.json" }, ".rss-dashboard-data/user-state.json");
        await vi.advanceTimersByTimeAsync(1_500);
        handlers.rename?.({ path: "c.json" }, "d.json");
        await vi.advanceTimersByTimeAsync(1_500);

        expect(watcherReloads()).toBe(2);
      });

      it("waits 1.5 s after the last event, restarting the wait on each one", async () => {
        handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
        await vi.advanceTimersByTimeAsync(1_000);
        handlers.modify?.({ path: ".rss-dashboard-data/user-state.json" });
        await vi.advanceTimersByTimeAsync(1_499);
        expect(watcherReloads()).toBe(0);

        await vi.advanceTimersByTimeAsync(1);
        expect(watcherReloads()).toBe(1);
      });

      it("finishes the reload before redrawing the dashboards without saving unchanged settings", async () => {
        const order: string[] = [];
        saveData.mockImplementation(() => {
          order.push("saveData");
          return Promise.resolve();
        });
        redraws.mockImplementation(() => {
          order.push(`redraw:${plugin.settings.refreshInterval}`);
          return Promise.resolve();
        });
        storedData = savedSettings({ refreshInterval: 77 });

        handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
        await vi.advanceTimersByTimeAsync(1_500);

        expect(order).toEqual(["redraw:77"]);
      });

      it("ignores events until exactly the end of a plugin write's suppression window", async () => {
        await plugin.writeWithWatcherSuppressed(() => Promise.resolve());

        await vi.advanceTimersByTimeAsync(2_999);
        handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
        await vi.advanceTimersByTimeAsync(1_500);
        expect(watcherReloads()).toBe(0);

        handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
        await vi.advanceTimersByTimeAsync(1_500);
        expect(watcherReloads()).toBe(1);
      });

      it("returns the write's result and honors a custom window", async () => {
        await expect(
          plugin.writeWithWatcherSuppressed(() => Promise.resolve("ok"), 10_000),
        ).resolves.toBe("ok");

        await vi.advanceTimersByTimeAsync(9_000);
        handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
        await vi.advanceTimersByTimeAsync(1_500);

        expect(watcherReloads()).toBe(0);
      });

      it("keeps suppressing after a write that fails", async () => {
        await expect(
          plugin.writeWithWatcherSuppressed(() =>
            Promise.reject(new Error("write failed")),
          ),
        ).rejects.toThrow("write failed");

        handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
        await vi.advanceTimersByTimeAsync(1_500);

        expect(watcherReloads()).toBe(0);
      });

      it("lets a reload already waiting run on time when a suppressed event arrives", async () => {
        handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
        await vi.advanceTimersByTimeAsync(1_000);
        await plugin.writeWithWatcherSuppressed(() => Promise.resolve());
        handlers.modify?.({ path: ".rss-dashboard-data/data.json" });

        await vi.advanceTimersByTimeAsync(500);

        expect(watcherReloads()).toBe(1);
      });

      it("ignores the watched files the plugin itself writes while saving", async () => {
        Object.assign(plugin.settings, pointer(".rss-dashboard-data"));
        const write = adapter().write.bind(adapter());
        vi.spyOn(adapter(), "write").mockImplementation(async (path, data) => {
          await write(path, data);
          handlers.modify?.({ path });
        });

        await plugin.saveSettings();
        await vi.advanceTimersByTimeAsync(1_500);

        expect(watcherReloads()).toBe(0);
      });

      it("never runs a waiting reload after the plugin unloads", async () => {
        handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
        plugin.onunload();

        await vi.advanceTimersByTimeAsync(5_000);

        expect(watcherReloads()).toBe(0);
        expect(redraws).not.toHaveBeenCalled();
      });
    });

    it("watches the configured vault folder, not the default one, and reads it at event time", async () => {
      await writeVaultSettings(
        VAULT_FOLDER,
        savedSettings(pointer() as Partial<RssDashboardSettings>),
      );
      await start(pointer() as unknown as RssDashboardSettings);
      // A settings load without changes must not write data.json or suppress
      // an external vault update.
      handlers.modify?.({ path: `${VAULT_FOLDER}/data.json` });
      await vi.advanceTimersByTimeAsync(1_500);
      expect(watcherReloads()).toBe(1);

      handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
      await vi.advanceTimersByTimeAsync(1_500);
      expect(watcherReloads()).toBe(1);

      handlers.modify?.({ path: `/${VAULT_FOLDER}/user-state.json` });
      await vi.advanceTimersByTimeAsync(1_500);
      expect(watcherReloads()).toBe(2);

      plugin.settings.metadataStorageFolder = "/Elsewhere/";
      handlers.modify?.({ path: "Elsewhere/data.json" });
      await vi.advanceTimersByTimeAsync(1_500);
      expect(watcherReloads()).toBe(3);
    });

    it("registers no watcher when the vault has no event API", async () => {
      vi.useFakeTimers();
      createPlugin(savedSettings());
      (app.vault as unknown as { on: unknown }).on = undefined;
      const registerEvent = vi.spyOn(plugin, "registerEvent");

      await expect(plugin.onload()).resolves.toBeUndefined();

      // Only the workspace's active-leaf-change handler.
      expect(registerEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Moving the metadata location ─────────────────────────────────────────

  describe("moving metadata to a vault folder", () => {
    beforeEach(async () => {
      createPlugin(
        savedSettings({
          metadataStorageFolder: VAULT_FOLDER,
          feeds: [feed("kept", "RSS")],
        }),
      );
      await plugin.loadSettings();
      saveData.mockClear();
    });

    it("copies the settings there, switches to the vault location, saves the pointer, and says where", async () => {
      const writes: Array<{ path: string; mode: unknown }> = [];
      const write = adapter().write.bind(adapter());
      vi.spyOn(adapter(), "write").mockImplementation(async (path, data) => {
        writes.push({
          path,
          mode: (JSON.parse(data) as Record<string, unknown>).metadataStorageMode,
        });
        await write(path, data);
      });

      await plugin.migrateMetadataToVaultLocation();

      // The copy goes out before the switch, then the save rewrites it.
      expect(writes).toEqual([
        { path: `${VAULT_FOLDER}/data.json`, mode: "plugin-default" },
        { path: `${VAULT_FOLDER}/data.json`, mode: "vault-location" },
      ]);
      expect(plugin.settings.metadataStorageMode).toBe("vault-location");
      expect(savedPayloads()).toEqual([
        {
          metadataStorageMode: "vault-location",
          metadataStorageFolder: VAULT_FOLDER,
          metadataStorageSchemaVersion:
            DEFAULT_SETTINGS.metadataStorageSchemaVersion,
        },
      ]);
      const stored = JSON.parse(
        await adapter().read(`${VAULT_FOLDER}/data.json`),
      ) as RssDashboardSettings;
      expect(stored.feeds.map((f) => f.title)).toEqual(["kept"]);
      expect(notices()).toEqual([
        `Metadata migrated to vault location: ${VAULT_FOLDER}`,
      ]);
    });

    it("uses the default vault folder when none is set", async () => {
      plugin.settings.metadataStorageFolder = "";

      await plugin.migrateMetadataToVaultLocation();

      expect(await adapter().exists(".rss-dashboard-data/data.json")).toBe(true);
      expect(notices()).toEqual([
        "Metadata migrated to vault location: .rss-dashboard-data",
      ]);
    });

    it("says so and changes nothing when metadata is already in the vault", async () => {
      plugin.settings.metadataStorageMode = "vault-location";
      const writeSpy = vi.spyOn(adapter(), "write");

      await plugin.migrateMetadataToVaultLocation();

      expect(notices()).toEqual([
        "Already using vault location for metadata storage",
      ]);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(saveData).not.toHaveBeenCalled();
    });

    it("stays in the plugin folder, says why, and rethrows when the folder path is a file", async () => {
      await adapter().mkdir("Synced");
      await adapter().write(VAULT_FOLDER, "not a folder");

      await expect(plugin.migrateMetadataToVaultLocation()).rejects.toThrow(
        "points to a file",
      );

      expect(plugin.settings.metadataStorageMode).toBe("plugin-default");
      expect(saveData).not.toHaveBeenCalled();
      expect(notices()).toEqual([
        `Vault migration failed: Metadata storage path points to a file, not a folder: ${VAULT_FOLDER}`,
      ]);
    });

    it("switches back when the save after the switch fails", async () => {
      saveData.mockRejectedValueOnce(new Error("pointer failed"));

      await expect(plugin.migrateMetadataToVaultLocation()).rejects.toThrow(
        "pointer failed",
      );

      expect(plugin.settings.metadataStorageMode).toBe("plugin-default");
      expect(notices()).toEqual(["Vault migration failed: pointer failed"]);
    });

    it("isn't watcher-suppressed for its first copy, so a watched folder reloads once afterwards", async () => {
      vi.useFakeTimers();
      await plugin.onload();
      plugin.settings.metadataStorageFolder = ".rss-dashboard-data";
      saveData.mockClear();
      const loadsBefore = loadData.mock.calls.length;
      const write = adapter().write.bind(adapter());
      vi.spyOn(adapter(), "write").mockImplementation(async (path, data) => {
        await write(path, data);
        handlers.modify?.({ path });
      });

      await plugin.migrateMetadataToVaultLocation();
      await vi.advanceTimersByTimeAsync(1_500);

      expect(loadData.mock.calls.length - loadsBefore).toBe(1);
      plugin.onunload();
    });
  });

  describe("reverting metadata to the plugin folder", () => {
    beforeEach(async () => {
      await writeVaultSettings(
        VAULT_FOLDER,
        savedSettings({
          ...pointer(),
          feeds: [feed("kept", "RSS")],
        } as Partial<RssDashboardSettings>),
      );
      createPlugin(pointer());
      await plugin.loadSettings();
      saveData.mockClear();
    });

    it("saves the full settings to the plugin folder, trashes the vault copy, saves again, and says so", async () => {
      await plugin.revertMetadataToPluginDefault();

      expect(plugin.settings.metadataStorageMode).toBe("plugin-default");
      const payloads = savedPayloads();
      expect(payloads).toHaveLength(2);
      // The first write is the settings object itself, before persistence
      // strips or stamps anything.
      expect(payloads[0]).toBe(plugin.settings);
      expect(payloads[1]).toEqual(
        expect.objectContaining({
          metadataStorageMode: "plugin-default",
          feeds: [expect.objectContaining({ title: "kept" })],
        }),
      );
      expect(await adapter().exists(`${VAULT_FOLDER}/data.json`)).toBe(false);
      expect(notices()).toEqual(["Metadata reverted to plugin default location"]);
    });

    it("leaves a data.json in a dot folder behind, since Obsidian doesn't index it", async () => {
      await writeVaultSettings(
        ".rss-dashboard-data",
        savedSettings(pointer(".rss-dashboard-data") as Partial<RssDashboardSettings>),
      );
      plugin.settings.metadataStorageFolder = ".rss-dashboard-data";

      await plugin.revertMetadataToPluginDefault();

      expect(await adapter().exists(".rss-dashboard-data/data.json")).toBe(true);
      expect(notices()).toEqual(["Metadata reverted to plugin default location"]);
    });

    it("doesn't trash a folder named data.json", async () => {
      await app.vault.adapter.remove(`${VAULT_FOLDER}/data.json`);
      await app.vault.createFolder(`${VAULT_FOLDER}/data.json`);
      const trash = vi.spyOn(app.fileManager, "trashFile");

      await plugin.revertMetadataToPluginDefault();

      expect(trash).not.toHaveBeenCalled();
      expect(notices()).toEqual(["Metadata reverted to plugin default location"]);
    });

    it("finishes when trashing the vault copy fails", async () => {
      vi.spyOn(app.fileManager, "trashFile").mockRejectedValue(
        new Error("locked"),
      );

      await expect(plugin.revertMetadataToPluginDefault()).resolves.toBeUndefined();

      expect(plugin.settings.metadataStorageMode).toBe("plugin-default");
      expect(notices()).toEqual(["Metadata reverted to plugin default location"]);
    });

    it("says so and changes nothing when metadata is already in the plugin folder", async () => {
      plugin.settings.metadataStorageMode = "plugin-default";

      await plugin.revertMetadataToPluginDefault();

      expect(notices()).toEqual([
        "Already using plugin default for metadata storage",
      ]);
      expect(saveData).not.toHaveBeenCalled();
      expect(await adapter().exists(`${VAULT_FOLDER}/data.json`)).toBe(true);
    });

    it("switches back to the vault, says why, and rethrows when the plugin folder write fails", async () => {
      saveData.mockRejectedValueOnce(new Error("disk full"));

      await expect(plugin.revertMetadataToPluginDefault()).rejects.toThrow(
        "disk full",
      );

      expect(plugin.settings.metadataStorageMode).toBe("vault-location");
      expect(await adapter().exists(`${VAULT_FOLDER}/data.json`)).toBe(true);
      expect(notices()).toEqual(["Revert failed: disk full"]);
    });
  });
});
