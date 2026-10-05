/**
 * Characterization tests for the settings import path in main.ts (#535).
 *
 * After `ImportExportService` has parsed and confirmed an import, the plugin
 * applies it: it merges or replaces the settings object, runs the legacy
 * migration, rebuilds the settings-backed services, saves, and redraws the
 * setting tab and the open views. These tests pin what that does today, bugs
 * included, through the public import entry points only, so the four apply
 * methods can move into `SettingsImportApplier` (ADR 0015, step 6) without
 * these tests changing.
 *
 * The confirmation dialog is answered through its real buttons. Redraws and
 * the "services rebuilt" step are observed through public seams: the setting
 * tab, `refreshDashboardViews`, `getActiveDiscoverView`, and the identity of
 * `plugin.feedParser`, which a rebuild replaces.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
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
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

interface VaultAdapterStub {
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<string>;
}

interface PluginInternals {
  settingsLoadFailed: boolean;
}

const metadataFolder = ".rss-dashboard-data";
const storageFolder = `${metadataFolder}/feeds`;
const dataJsonPath = `${metadataFolder}/data.json`;

const PREFERENCES_FILE = "rss-dashboard-user-preferences.json";

function manifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: ".",
  };
}

function persistedFeed(
  feedId: string,
  extra: Partial<Feed> = {},
): Omit<Feed, "items"> {
  return {
    feedId,
    title: feedId,
    url: `https://example.com/${feedId}.xml`,
    folder: "RSS",
    lastUpdated: 0,
    ...extra,
  };
}

function jsonFile(name: string, content: unknown): File {
  return new File([JSON.stringify(content)], name);
}

async function findDialogButton(label: string): Promise<HTMLButtonElement> {
  let found: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    found = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim() === label);
    expect(found).toBeDefined();
  });
  if (!found) throw new Error(`No "${label}" button`);
  return found;
}

describe("applying a confirmed settings import (issue #535)", () => {
  let app: App;
  let plugin: RssDashboardPlugin;
  let calls: string[];
  let noticeSpy: MockInstance<typeof console.debug>;

  function adapter(): VaultAdapterStub {
    return app.vault.adapter as unknown as VaultAdapterStub;
  }

  function noticeTexts(): string[] {
    return noticeSpy.mock.calls
      .filter((args) => args[0] === "[Stub Notice]")
      .map((args) => String(args[1]));
  }

  function feedIds(): string[] {
    return plugin.settings.feeds.map((feed) => feed.feedId ?? "");
  }

  async function importFile(
    kind: "preferences" | "portable" | "feed" | "settings",
    file: File,
    confirmLabel: "Replace" | "Overwrite",
  ): Promise<unknown> {
    const start = {
      preferences: () => plugin.importUserSettingsJsonFromFile(file),
      portable: () => plugin.importPortableDataBundleFromFile(file),
      feed: () => plugin.importFeedBundleFromFile(file),
      settings: () => plugin.importSettingsBundleFromFile(file),
    }[kind];
    const result = start();
    (await findDialogButton(confirmLabel)).click();
    return result;
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    installObsidianDomPolyfills();
    noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    app = App.createMock();
    calls = [];

    // A Shard storage v2 vault with two feeds and its data.json in the vault.
    await app.vault.adapter.mkdir(storageFolder);
    await adapter().write(
      dataJsonPath,
      JSON.stringify({
        ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        lastShownVersion: "2.7.0",
        storageMode: "vault-shards-v2",
        storageFolder,
        metadataStorageMode: "vault-location",
        metadataStorageFolder: metadataFolder,
        metadataStorageSchemaVersion: 2,
        feeds: [persistedFeed("feed-a"), persistedFeed("feed-b")],
        folders: [{ name: "RSS", subfolders: [] }],
        availableTags: [{ name: "kept", color: "#111111" }],
        refreshInterval: 30,
      }),
    );
    for (const feedId of ["feed-a", "feed-b"]) {
      await adapter().write(
        `${storageFolder}/${feedId}.json`,
        JSON.stringify({
          version: 1,
          feedId,
          feedUrl: `https://example.com/${feedId}.xml`,
          updatedAt: 0,
          items: [],
        }),
      );
    }

    plugin = new RssDashboardPlugin(app, manifest());
    plugin.loadData = vi.fn().mockResolvedValue({
      metadataStorageMode: "vault-location",
      metadataStorageFolder: metadataFolder,
      metadataStorageSchemaVersion: 2,
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);
    await plugin.loadSettings();
    // onload builds the settings-backed services; a load that has nothing to
    // save does not, so build them here as onload would.
    (
      plugin as unknown as { initializeSettingsBackedServices(): void }
    ).initializeSettingsBackedServices();

    // Record the redraw steps in the order they happen. `parserRebuilt`
    // notes whether the services had already been rebuilt at that point.
    const originalParser = plugin.feedParser;
    const step = (name: string) => () => {
      calls.push(
        `${name}${plugin.feedParser === originalParser ? "" : "+rebuilt"}`,
      );
    };
    plugin.settingTab = {
      refresh: step("settingTab.refresh"),
    } as unknown as RssDashboardPlugin["settingTab"];
    vi.spyOn(plugin, "refreshDashboardViews").mockImplementation(() => {
      step("refreshDashboardViews")();
      return Promise.resolve();
    });
    vi.spyOn(plugin, "getActiveDiscoverView").mockImplementation(() => {
      step("discover.render")();
      return Promise.resolve({
        render: () => undefined,
      } as unknown as Awaited<
        ReturnType<RssDashboardPlugin["getActiveDiscoverView"]>
      >);
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    noticeSpy.mockRestore();
  });

  describe("a preferences file that carries a feed list (Replacing)", () => {
    it("replaces the feed list and keeps the values the file leaves out", async () => {
      const result = await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          refreshInterval: 45,
          feeds: [persistedFeed("feed-a")],
        }),
        "Replace",
      );

      expect(result).toBe("committed");
      expect(feedIds()).toEqual(["feed-a"]);
      expect(plugin.settings.refreshInterval).toBe(45);
      expect(plugin.settings.folders).toEqual([
        { name: "RSS", subfolders: [] },
      ]);
      expect(plugin.settings.availableTags).toEqual(
        expect.arrayContaining([{ name: "kept", color: "#111111" }]),
      );
      expect(plugin.settings.storageMode).toBe("vault-shards-v2");
    });

    it.each([
      ["folders", { folders: [{ name: "Imported", subfolders: [] }] }],
      ["tags", { availableTags: [{ name: "imported", color: "#222222" }] }],
    ])(
      "keeps the current feeds when the file has %s but no feed list (issue #386)",
      async (_label, collections) => {
        await importFile(
          "preferences",
          jsonFile(PREFERENCES_FILE, { refreshInterval: 45, ...collections }),
          "Replace",
        );

        expect(feedIds()).toEqual(["feed-a", "feed-b"]);
        expect(plugin.settings.refreshInterval).toBe(45);
      },
    );

    it("replaces the folders and tags the file carries", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          folders: [{ name: "Imported", subfolders: [] }],
          availableTags: [{ name: "imported", color: "#222222" }],
        }),
        "Replace",
      );

      expect(plugin.settings.folders).toEqual([
        { name: "Imported", subfolders: [] },
      ]);
      // The legacy migration adds its default tags to any tag list.
      expect(plugin.settings.availableTags).toEqual(
        expect.arrayContaining([{ name: "imported", color: "#222222" }]),
      );
      expect(plugin.settings.availableTags).not.toContainEqual({
        name: "kept",
        color: "#111111",
      });
    });

    describe.each(["folders", "availableTags"] as const)(
      "a non-list %s value (issue #537)",
      (collection) => {
        it.each(["not a list", {}, null, 42, false])(
          "keeps the current list in memory and on disk when given %j",
          async (value) => {
            const original = plugin.settings[collection];
            const expected = JSON.parse(JSON.stringify(original)) as unknown;

            const result = await importFile(
              "preferences",
              jsonFile(PREFERENCES_FILE, {
                feeds: [persistedFeed("feed-a")],
                [collection]: value,
                refreshInterval: 45,
              }),
              "Replace",
            );

            expect(result).toBe("committed");
            expect(plugin.settings[collection]).toBe(original);
            expect(plugin.settings[collection]).toEqual(expected);
            expect(plugin.settings.refreshInterval).toBe(45);
            expect(feedIds()).toEqual(["feed-a"]);
            const saved = JSON.parse(
              await adapter().read(dataJsonPath),
            ) as RssDashboardSettings;
            expect(saved[collection]).toEqual(expected);
          },
        );
      },
    );

    it("writes an OPML backup after ignoring non-list folders and tags (issue #537)", async () => {
      // Re-enable backups in the import so it writes a fresh snapshot even
      // if loading the fixture already saved one during normalization.
      plugin.settings.autoBackup = {
        backupDataJson: false,
        backupOpml: false,
        backupUserdata: false,
      };
      await plugin.saveSettings();

      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          feeds: [persistedFeed("imported-backup")],
          folders: "not a list",
          availableTags: "not a list",
          autoBackup: { ...DEFAULT_SETTINGS.autoBackup, backupOpml: true },
        }),
        "Replace",
      );

      const backup = await adapter().read("./feeds.opml.backup");
      expect(backup).toContain('text="RSS"');
      expect(backup).toContain(
        'xmlUrl="https://example.com/imported-backup.xml"',
      );
    });

    it("accepts empty lists as replacements instead of keeping the current lists", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          feeds: [],
          folders: [],
          availableTags: [],
        }),
        "Replace",
      );

      expect(plugin.settings.feeds).toEqual([]);
      expect(plugin.settings.folders).toEqual([]);
      // The migration can add built-in tags, but must not keep custom tags.
      expect(plugin.settings.availableTags).not.toContainEqual({
        name: "kept",
        color: "#111111",
      });
    });

    it("gives an imported feed default keyword rules and retention limits", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          defaultAutoDeleteDuration: 14,
          maxItems: 77,
          feeds: [
            persistedFeed("with-rules", {
              keywordRules: {
                overrideGlobalRules: true,
                rules: [],
              } as unknown as Feed["keywordRules"],
            }),
          ],
        }),
        "Replace",
      );

      const [feed] = plugin.settings.feeds;
      // A partial rule set is filled in from the defaults, and the feed
      // takes the global retention limits it lacks.
      expect(feed?.keywordRules).toEqual({
        overrideGlobalRules: true,
        includeLogic: "AND",
        rules: [],
      });
      expect(feed?.autoDeleteDuration).toBe(14);
      expect(feed?.maxItemsLimit).toBe(77);
    });

    it("keeps a retention limit the imported feed already has", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          feeds: [
            persistedFeed("own-limits", {
              keywordRules: {
                overrideGlobalRules: false,
                includeLogic: "AND",
                rules: [],
              },
              autoDeleteDuration: 3,
              maxItemsLimit: 9,
            }),
          ],
        }),
        "Replace",
      );

      const [feed] = plugin.settings.feeds;
      expect(feed?.autoDeleteDuration).toBe(3);
      expect(feed?.maxItemsLimit).toBe(9);
    });

    it("gives an imported feed without keyword rules the retention defaults too", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          defaultAutoDeleteDuration: 14,
          maxItems: 77,
          feeds: [persistedFeed("no-rules")],
        }),
        "Replace",
      );

      const [feed] = plugin.settings.feeds;
      expect(feed?.keywordRules).toEqual({
        overrideGlobalRules: false,
        includeLogic: "AND",
        rules: [],
      });
      // #460 reports these two as skipped, because the import loop `continue`s
      // after defaulting the rules. It doesn't reproduce here: the legacy
      // migration that runs first has already defaulted the rules, so the
      // `continue` branch is never taken and the limits are filled in.
      expect(feed?.autoDeleteDuration).toBe(14);
      expect(feed?.maxItemsLimit).toBe(77);
    });

    it("rebuilds the services, saves, then redraws the setting views", async () => {
      const originalParser = plugin.feedParser;
      const saveSettings = vi.spyOn(plugin, "saveSettings");
      let parserAtSave: unknown;
      saveSettings.mockImplementation(() => {
        parserAtSave = plugin.feedParser;
        calls.push(
          `saveSettings${plugin.feedParser === originalParser ? "" : "+rebuilt"}`,
        );
        return Promise.resolve();
      });

      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, { feeds: [persistedFeed("feed-a")] }),
        "Replace",
      );

      expect(plugin.feedParser).not.toBe(originalParser);
      expect(parserAtSave).toBe(plugin.feedParser);
      // Unlike the bundle imports, a preferences import does not redraw the
      // setting tab.
      expect(calls).toEqual([
        "saveSettings+rebuilt",
        "refreshDashboardViews+rebuilt",
        "discover.render+rebuilt",
      ]);
    });

    it("tells the repository the feed list was replaced only when the file has one", async () => {
      const saveSettings = vi.spyOn(plugin, "saveSettings");

      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, { feeds: [persistedFeed("feed-a")] }),
        "Replace",
      );
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          folders: [{ name: "Imported", subfolders: [] }],
        }),
        "Replace",
      );

      expect(saveSettings.mock.calls).toEqual([
        [{ replacesFeedList: true }],
        [{ replacesFeedList: false }],
      ]);
    });

    it("writes the imported settings to the vault data.json", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          refreshInterval: 45,
          feeds: [persistedFeed("feed-a")],
        }),
        "Replace",
      );

      const saved = JSON.parse(await adapter().read(dataJsonPath)) as {
        refreshInterval: number;
        feeds: Array<{ feedId: string }>;
      };
      expect(saved.refreshInterval).toBe(45);
      expect(saved.feeds.map((feed) => feed.feedId)).toEqual(["feed-a"]);
    });

    it("reports feeds and settings in the completion notice", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, { feeds: [persistedFeed("feed-a")] }),
        "Replace",
      );

      expect(noticeTexts()).toContain("Imported JSON with feeds and settings");
    });

    it("mentions only folders in the notice when the file has no feed list", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          folders: [{ name: "Imported", subfolders: [] }],
        }),
        "Replace",
      );

      expect(noticeTexts()).toContain("Imported folders and settings");
    });

    it("mentions tags and settings when the file only carried tags", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          availableTags: [{ name: "Imported", color: "#111111" }],
        }),
        "Replace",
      );

      expect(noticeTexts()).toContain("Imported tags and settings");
    });

    it("mentions folders and tags in the notice when both are imported", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, {
          folders: [{ name: "Imported", subfolders: [] }],
          availableTags: [{ name: "Imported", color: "#111111" }],
        }),
        "Replace",
      );

      expect(noticeTexts()).toContain("Imported folders, tags, and settings");
    });
  });

  describe("a preferences file without collections (Overwriting)", () => {
    it("overwrites the settings and leaves the feeds, folders and tags alone", async () => {
      const result = await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, { refreshInterval: 45 }),
        "Overwrite",
      );

      expect(result).toBe("committed");
      expect(plugin.settings.refreshInterval).toBe(45);
      expect(feedIds()).toEqual(["feed-a", "feed-b"]);
      expect(plugin.settings.folders).toEqual([
        { name: "RSS", subfolders: [] },
      ]);
      expect(plugin.settings.availableTags).toEqual(
        expect.arrayContaining([{ name: "kept", color: "#111111" }]),
      );
    });

    it("does not tell the repository the feed list was replaced", async () => {
      const saveSettings = vi.spyOn(plugin, "saveSettings");

      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, { refreshInterval: 45 }),
        "Overwrite",
      );

      expect(saveSettings.mock.calls).toEqual([[]]);
    });

    it("rebuilds the services, saves, then redraws the views", async () => {
      const originalParser = plugin.feedParser;

      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, { refreshInterval: 45 }),
        "Overwrite",
      );

      expect(plugin.feedParser).not.toBe(originalParser);
      expect(calls).toEqual([
        "refreshDashboardViews+rebuilt",
        "discover.render+rebuilt",
      ]);
      const saved = JSON.parse(await adapter().read(dataJsonPath)) as {
        refreshInterval: number;
      };
      expect(saved.refreshInterval).toBe(45);
    });

    it("reports the preferences file in the completion notice", async () => {
      await importFile(
        "preferences",
        jsonFile(PREFERENCES_FILE, { refreshInterval: 45 }),
        "Overwrite",
      );

      expect(noticeTexts()).toContain(
        "Imported rss-dashboard-user-preferences.json",
      );
    });
  });

  describe.each([
    ["portable data bundle", "portable", "Replace"],
    ["feed bundle", "feed", "Replace"],
    ["settings bundle", "settings", "Overwrite"],
  ] as const)("a %s", (_label, kind, confirmLabel) => {
    function bundle(): unknown {
      return {
        portable: () => plugin.getPortableDataBundle(),
        feed: () => plugin.getFeedBundle(),
        settings: () => plugin.getSettingsBundle(),
      }[kind]();
    }

    it("rebuilds the services, then redraws the setting tab, the views and Discover", async () => {
      const originalParser = plugin.feedParser;

      const result = await importFile(
        kind,
        jsonFile(`${kind}.json`, bundle()),
        confirmLabel,
      );

      expect(result).toBe("committed");
      expect(plugin.feedParser).not.toBe(originalParser);
      expect(calls).toEqual([
        "settingTab.refresh+rebuilt",
        "refreshDashboardViews+rebuilt",
        "discover.render+rebuilt",
      ]);
    });

    it("does nothing when the settings failed to load", async () => {
      (plugin as unknown as PluginInternals).settingsLoadFailed = true;
      const originalParser = plugin.feedParser;
      const saveData = vi.mocked(plugin.saveData);
      saveData.mockClear();

      await importFile(kind, jsonFile(`${kind}.json`, bundle()), confirmLabel);

      expect(plugin.feedParser).toBe(originalParser);
      expect(calls).toEqual([]);
      expect(saveData).not.toHaveBeenCalled();
    });

    it("rethrows a failed import as an Error and redraws nothing", async () => {
      const service = plugin as unknown as {
        feedStorageRepository: Record<string, unknown>;
      };
      const failure = new Error("disk full");
      const method = {
        portable: "importPortableDataBundle",
        feed: "importFeedBundle",
        settings: "importSettingsBundle",
      }[kind];
      vi.spyOn(
        service.feedStorageRepository as Record<
          string,
          (...args: unknown[]) => unknown
        >,
        method,
      ).mockRejectedValue(failure);

      await expect(
        importFile(kind, jsonFile(`${kind}.json`, bundle()), confirmLabel),
      ).rejects.toBe(failure);
      expect(calls).toEqual([]);
    });

    it("wraps a non-Error failure in an Error", async () => {
      const service = plugin as unknown as {
        feedStorageRepository: Record<string, unknown>;
      };
      const method = {
        portable: "importPortableDataBundle",
        feed: "importFeedBundle",
        settings: "importSettingsBundle",
      }[kind];
      vi.spyOn(
        service.feedStorageRepository as Record<
          string,
          (...args: unknown[]) => unknown
        >,
        method,
      ).mockRejectedValue("disk full");

      await expect(
        importFile(kind, jsonFile(`${kind}.json`, bundle()), confirmLabel),
      ).rejects.toEqual(new Error("disk full"));
    });

    it("saves to the configured vault data.json", async () => {
      const dataJsonBefore = await adapter().read(dataJsonPath);

      await importFile(kind, jsonFile(`${kind}.json`, bundle()), confirmLabel);

      // Fixed by #474: the import used to reach only the plugin's own file.
      expect(await adapter().read(dataJsonPath)).not.toBe(dataJsonBefore);
    });
  });
});
