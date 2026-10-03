/**
 * Import confirmation at the ImportExportService seam (issue #377).
 *
 * Every Replacing or Overwriting file import reads and validates the file,
 * asks `confirmImport` with a summary of the change, and commits only when
 * the user confirms. Cancelling writes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";
import {
  ImportExportService,
  type ImportConfirmation,
  type ImportDecision,
} from "../../../src/services/import-export-service";

function article(guid: string, starred = false) {
  return {
    title: guid,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: "2026-01-01T00:00:00Z",
    guid,
    read: false,
    starred,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
  };
}

function feed(feedId: string, items: ReturnType<typeof article>[]): Feed {
  return {
    feedId,
    title: feedId,
    url: `https://example.com/${feedId}.xml`,
    folder: "News",
    lastUpdated: 0,
    items,
  } as unknown as Feed;
}

/** Current data: 3 feeds, 4 articles (2 starred), 2 folders, 3 tags. */
function currentSettings(
  overrides: Partial<RssDashboardSettings> = {},
): RssDashboardSettings {
  return {
    ...(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings),
    feeds: [
      feed("a", [article("a1", true), article("a2")]),
      feed("b", [article("b1", true)]),
      feed("c", [article("c1")]),
    ],
    folders: [
      { name: "News", subfolders: [], createdAt: 0, modifiedAt: 0 },
      { name: "Tech", subfolders: [], createdAt: 0, modifiedAt: 0 },
    ],
    availableTags: [
      { name: "one", color: "#111" },
      { name: "two", color: "#222" },
      { name: "three", color: "#333" },
    ],
    ...overrides,
  };
}

/** Incoming Feed bundle: 1 feed with 3 articles (1 starred), 1 folder, no tags. */
function feedBundle() {
  return {
    version: 1,
    exportedAt: 123,
    feeds: [
      {
        feedId: "x",
        title: "x",
        url: "https://example.com/x.xml",
        folder: "Imported",
        lastUpdated: 0,
      },
    ],
    folders: [{ name: "Imported", subfolders: [], createdAt: 0, modifiedAt: 0 }],
    availableTags: [],
    shards: [
      {
        version: 1,
        feedId: "x",
        feedUrl: "https://example.com/x.xml",
        updatedAt: 0,
        items: [article("x1", true), article("x2"), article("x3")],
      },
    ],
  };
}

function jsonFile(content: unknown, name: string): File {
  return new File([JSON.stringify(content)], name, {
    type: "application/json",
  });
}

describe("Import confirmation", () => {
  let confirmImport: ReturnType<
    typeof vi.fn<(confirmation: ImportConfirmation) => Promise<ImportDecision>>
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    confirmImport = vi.fn().mockResolvedValue("cancel");
  });

  describe("Feed bundle", () => {
    it("writes nothing and reports a canceled import when the user cancels", async () => {
      const importFeedBundle = vi.fn().mockResolvedValue(undefined);
      const svc = new ImportExportService({
        settings: currentSettings(),
        isMobile: false,
        importFeedBundle,
        confirmImport,
      });

      const result = await svc.importFeedBundleFromFile(
        jsonFile(feedBundle(), "rss-dashboard-feed-bundle.json"),
      );

      expect(confirmImport).toHaveBeenCalledTimes(1);
      expect(importFeedBundle).not.toHaveBeenCalled();
      expect(result).toBe("canceled");
    });

    it("imports the file exactly as read when the user confirms", async () => {
      confirmImport.mockResolvedValue("confirm");
      const importFeedBundle = vi.fn().mockResolvedValue(undefined);
      const svc = new ImportExportService({
        settings: currentSettings(),
        isMobile: false,
        importFeedBundle,
        confirmImport,
      });

      const result = await svc.importFeedBundleFromFile(
        jsonFile(feedBundle(), "rss-dashboard-feed-bundle.json"),
      );

      expect(importFeedBundle).toHaveBeenCalledTimes(1);
      expect(importFeedBundle).toHaveBeenCalledWith(feedBundle());
      expect(result).toBe("committed");
    });

    it("compares current and incoming feed data, naming the file", async () => {
      const svc = new ImportExportService({
        settings: currentSettings(),
        isMobile: false,
        importFeedBundle: vi.fn().mockResolvedValue(undefined),
        confirmImport,
        getUnloadedFeedCount: () => 2,
      });

      await svc.importFeedBundleFromFile(
        jsonFile(feedBundle(), "rss-dashboard-feed-bundle.json"),
      );

      expect(confirmImport).toHaveBeenCalledWith({
        kind: "replacing",
        bundleType: "feed-bundle",
        fileName: "rss-dashboard-feed-bundle.json",
        feedData: {
          current: { feeds: 3, articles: 4, starred: 2, folders: 2, tags: 3 },
          incoming: { feeds: 1, articles: 3, starred: 1, folders: 1, tags: 0 },
        },
        unloadedFeedCount: 2,
        preferences: null,
        storageLocationChange: null,
      });
    });

    it("rejects an invalid bundle with its validation error before asking", async () => {
      const importFeedBundle = vi.fn().mockResolvedValue(undefined);
      const svc = new ImportExportService({
        settings: currentSettings(),
        isMobile: false,
        importFeedBundle,
        confirmImport,
      });
      const { feeds: _feeds, ...withoutFeeds } = feedBundle();

      await expect(
        svc.importFeedBundleFromFile(jsonFile(withoutFeeds, "bundle.json")),
      ).rejects.toThrow("Feed bundle is missing feeds");
      expect(confirmImport).not.toHaveBeenCalled();
      expect(importFeedBundle).not.toHaveBeenCalled();
    });

    it("rejects malformed JSON before asking", async () => {
      const svc = new ImportExportService({
        settings: currentSettings(),
        isMobile: false,
        importFeedBundle: vi.fn().mockResolvedValue(undefined),
        confirmImport,
      });

      await expect(
        svc.importFeedBundleFromFile(new File(["{bad"], "bundle.json")),
      ).rejects.toThrow("Invalid feed bundle JSON");
      expect(confirmImport).not.toHaveBeenCalled();
    });
  });

  describe("Settings bundle", () => {
    function settingsBundle(overrides: Partial<RssDashboardSettings> = {}) {
      const {
        feeds: _feeds,
        folders: _folders,
        availableTags: _tags,
        ...settingsOnly
      } = currentSettings();
      return {
        version: 1,
        exportedAt: 123,
        metadataStorageMode: settingsOnly.metadataStorageMode,
        metadataStorageFolder: settingsOnly.metadataStorageFolder,
        settings: { ...settingsOnly, ...overrides },
      };
    }

    function service(importSettingsBundle = vi.fn()) {
      return new ImportExportService({
        settings: currentSettings(),
        isMobile: false,
        importSettingsBundle: importSettingsBundle.mockResolvedValue(undefined),
        confirmImport,
        getUnloadedFeedCount: () => 0,
      });
    }

    it("writes nothing and reports a canceled import when the user cancels", async () => {
      const importSettingsBundle = vi.fn();
      const result = await service(importSettingsBundle).importSettingsBundleFromFile(
        jsonFile(settingsBundle({ refreshInterval: 5 }), "settings.json"),
      );

      expect(importSettingsBundle).not.toHaveBeenCalled();
      expect(result).toBe("canceled");
    });

    it("imports the file exactly as read when the user confirms", async () => {
      confirmImport.mockResolvedValue("confirm");
      const importSettingsBundle = vi.fn();
      const bundle = settingsBundle({ refreshInterval: 5 });

      const result = await service(importSettingsBundle).importSettingsBundleFromFile(
        jsonFile(bundle, "settings.json"),
      );

      expect(importSettingsBundle).toHaveBeenCalledWith(bundle);
      expect(result).toBe("committed");
    });

    it("asks to overwrite preferences, counting the preferences that differ", async () => {
      await service().importSettingsBundleFromFile(
        jsonFile(
          settingsBundle({ refreshInterval: 5, sidebarWidth: 999 }),
          "settings.json",
        ),
      );

      expect(confirmImport).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "overwriting",
          bundleType: "settings-bundle",
          fileName: "settings.json",
          feedData: null,
          preferences: expect.objectContaining({ changedCount: 2 }),
          storageLocationChange: null,
        }),
      );
    });

    it("still asks, with no changes, when every preference matches", async () => {
      await service().importSettingsBundleFromFile(
        jsonFile(
          // A trailing slash on the folder is normalized away on import.
          settingsBundle({ storageFolder: ".rss-dashboard-data/feeds/" }),
          "settings.json",
        ),
      );

      expect(confirmImport).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: { changedCount: 0, highImpactChanges: [] },
          storageLocationChange: null,
        }),
      );
    });

    it("calls out retention and auto-backup changes", async () => {
      // Current: max 50 items, 30-day auto-delete, starred protected,
      // data.json backups off (the defaults).
      await service().importSettingsBundleFromFile(
        jsonFile(
          settingsBundle({
            maxItems: 20,
            defaultAutoDeleteDuration: 0,
            protectStarred: false,
            autoBackup: {
              backupDataJson: true,
              backupOpml: true,
              backupUserdata: true,
            },
          }),
          "settings.json",
        ),
      );

      expect(confirmImport).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: {
            changedCount: 4,
            highImpactChanges: [
              { label: "Max item limit", before: "50", after: "20" },
              {
                label: "Default auto delete duration",
                before: "30 days",
                after: "Off",
              },
              { label: "Protect starred articles", before: "On", after: "Off" },
              { label: "Back up data.json", before: "Off", after: "On" },
            ],
          },
        }),
      );
    });

    it("names a storage folder or mode change, before and after", async () => {
      await service().importSettingsBundleFromFile(
        jsonFile(
          settingsBundle({ storageMode: "vault-shards", storageFolder: "RSS/feeds/" }),
          "settings.json",
        ),
      );

      expect(confirmImport).toHaveBeenCalledWith(
        expect.objectContaining({
          storageLocationChange: {
            feedStorage: {
              before: { mode: "vault-shards-v2", folder: ".rss-dashboard-data/feeds" },
              after: { mode: "vault-shards", folder: "RSS/feeds" },
            },
            metadataStorage: null,
          },
        }),
      );
    });

    it("names a change to where data.json is stored", async () => {
      const bundle = {
        ...settingsBundle(),
        metadataStorageMode: "vault-location",
        metadataStorageFolder: "RSS",
      };

      await service().importSettingsBundleFromFile(jsonFile(bundle, "s.json"));

      expect(confirmImport).toHaveBeenCalledWith(
        expect.objectContaining({
          storageLocationChange: {
            feedStorage: null,
            metadataStorage: {
              before: { mode: "plugin-default", folder: ".rss-dashboard-data" },
              after: { mode: "vault-location", folder: "RSS" },
            },
          },
        }),
      );
    });

    it("rejects an invalid bundle with its validation error before asking", async () => {
      const { settings: _settings, ...withoutSettings } = settingsBundle();

      await expect(
        service().importSettingsBundleFromFile(
          jsonFile(withoutSettings, "settings.json"),
        ),
      ).rejects.toThrow("Settings bundle is missing settings");
      expect(confirmImport).not.toHaveBeenCalled();
    });
  });

  describe("Portable data bundle", () => {
    /** Incoming: the Feed bundle's data plus preferences, in shard storage. */
    function portableBundle(overrides: Partial<RssDashboardSettings> = {}) {
      const incomingFeeds = feedBundle();
      const {
        feeds: _feeds,
        folders: _folders,
        availableTags: _tags,
        ...settingsOnly
      } = currentSettings();
      return {
        version: 1,
        exportedAt: 123,
        storageMode: overrides.storageMode ?? settingsOnly.storageMode,
        storageFolder: settingsOnly.storageFolder,
        metadataStorageMode: settingsOnly.metadataStorageMode,
        metadataStorageFolder: settingsOnly.metadataStorageFolder,
        metadata: {
          ...settingsOnly,
          // Sync bookkeeping written into data.json, not a preference.
          _syncNonce: "123-4",
          ...overrides,
          feeds: incomingFeeds.feeds,
          folders: incomingFeeds.folders,
          availableTags: incomingFeeds.availableTags,
        },
        shards: incomingFeeds.shards,
        markdownMirrorFallbackPlanned: true,
      };
    }

    function service(importPortableDataBundle = vi.fn()) {
      return new ImportExportService({
        settings: currentSettings(),
        isMobile: false,
        importPortableDataBundle:
          importPortableDataBundle.mockResolvedValue(undefined),
        confirmImport,
        getUnloadedFeedCount: () => 1,
      });
    }

    it("writes nothing and reports a canceled import when the user cancels", async () => {
      const importPortableDataBundle = vi.fn();
      const result = await service(
        importPortableDataBundle,
      ).importPortableDataBundleFromFile(
        jsonFile(portableBundle(), "portable.json"),
      );

      expect(importPortableDataBundle).not.toHaveBeenCalled();
      expect(result).toBe("canceled");
    });

    it("imports the file exactly as read when the user confirms", async () => {
      confirmImport.mockResolvedValue("confirm");
      const importPortableDataBundle = vi.fn();

      const result = await service(
        importPortableDataBundle,
      ).importPortableDataBundleFromFile(
        jsonFile(portableBundle(), "portable.json"),
      );

      expect(importPortableDataBundle).toHaveBeenCalledWith(portableBundle());
      expect(result).toBe("committed");
    });

    it("compares feed data and preferences, and names a storage change", async () => {
      await service().importPortableDataBundleFromFile(
        jsonFile(
          portableBundle({ refreshInterval: 5, storageMode: "vault-shards" }),
          "portable.json",
        ),
      );

      expect(confirmImport).toHaveBeenCalledWith({
        kind: "replacing",
        bundleType: "portable-data-bundle",
        fileName: "portable.json",
        feedData: {
          current: { feeds: 3, articles: 4, starred: 2, folders: 2, tags: 3 },
          incoming: { feeds: 1, articles: 3, starred: 1, folders: 1, tags: 0 },
        },
        unloadedFeedCount: 1,
        preferences: { changedCount: 2, highImpactChanges: [] },
        storageLocationChange: {
          feedStorage: {
            before: { mode: "vault-shards-v2", folder: ".rss-dashboard-data/feeds" },
            after: { mode: "vault-shards", folder: ".rss-dashboard-data/feeds" },
          },
          metadataStorage: null,
        },
      });
    });

    it("rejects an invalid bundle with its validation error before asking", async () => {
      await expect(
        service().importPortableDataBundleFromFile(
          jsonFile({ ...portableBundle(), storageMode: "bogus" }, "p.json"),
        ),
      ).rejects.toThrow("Portable bundle has an invalid storageMode value");
      expect(confirmImport).not.toHaveBeenCalled();
    });
  });

  describe("User preferences", () => {
    function service(importUserPreferences = vi.fn()) {
      return new ImportExportService({
        settings: currentSettings(),
        isMobile: false,
        importUserPreferences: importUserPreferences.mockResolvedValue(undefined),
        confirmImport,
        getUnloadedFeedCount: () => 0,
      });
    }

    /** A data.json-style file: 2 feeds with 1 article each, no folders or tags. */
    const fileWithFeeds = {
      refreshInterval: 5,
      feeds: [feed("p", [article("p1", true)]), feed("q", [article("q1")])],
    };

    it("treats a file with feeds as a Replacing import, comparing feed data", async () => {
      await service().importUserPreferencesFromFile(
        jsonFile(fileWithFeeds, "data.json"),
      );

      expect(confirmImport).toHaveBeenCalledWith({
        kind: "replacing",
        bundleType: "user-preferences",
        fileName: "data.json",
        feedData: {
          current: { feeds: 3, articles: 4, starred: 2, folders: 2, tags: 3 },
          // Folders and tags the file omits are kept.
          incoming: { feeds: 2, articles: 2, starred: 1, folders: 2, tags: 3 },
        },
        unloadedFeedCount: 0,
        preferences: { changedCount: 1, highImpactChanges: [] },
        storageLocationChange: null,
      });
    });

    it("keeps the current feeds in the comparison when a file carries folders but no feeds (#386)", async () => {
      await service().importUserPreferencesFromFile(
        jsonFile({ folders: [] }, "prefs.json"),
      );

      expect(confirmImport).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "replacing",
          feedData: expect.objectContaining({
            incoming: { feeds: 3, articles: 4, starred: 2, folders: 0, tags: 3 },
          }),
        }),
      );
    });

    it("treats a preferences-only file as an Overwriting import", async () => {
      await service().importUserPreferencesFromFile(
        jsonFile(
          { refreshInterval: 5, storageFolder: "RSS/feeds" },
          "rss-dashboard-user-preferences.json",
        ),
      );

      expect(confirmImport).toHaveBeenCalledWith({
        kind: "overwriting",
        bundleType: "user-preferences",
        fileName: "rss-dashboard-user-preferences.json",
        feedData: null,
        unloadedFeedCount: 0,
        preferences: { changedCount: 2, highImpactChanges: [] },
        storageLocationChange: {
          feedStorage: {
            before: { mode: "vault-shards-v2", folder: ".rss-dashboard-data/feeds" },
            after: { mode: "vault-shards-v2", folder: "RSS/feeds" },
          },
          metadataStorage: null,
        },
      });
    });

    it("imports the file as read, with its kind, when the user confirms", async () => {
      confirmImport.mockResolvedValue("confirm");
      const importUserPreferences = vi.fn();

      const result = await service(
        importUserPreferences,
      ).importUserPreferencesFromFile(jsonFile(fileWithFeeds, "data.json"));

      expect(importUserPreferences).toHaveBeenCalledWith(
        JSON.parse(JSON.stringify(fileWithFeeds)),
        "replacing",
      );
      expect(result).toBe("committed");
    });

    it("writes nothing and reports a canceled import when the user cancels", async () => {
      const importUserPreferences = vi.fn();

      const result = await service(
        importUserPreferences,
      ).importUserPreferencesFromFile(
        jsonFile({ refreshInterval: 5 }, "prefs.json"),
      );

      expect(importUserPreferences).not.toHaveBeenCalled();
      expect(result).toBe("canceled");
    });

    it("rejects malformed JSON or a non-object file before asking", async () => {
      await expect(
        service().importUserPreferencesFromFile(new File(["{bad"], "p.json")),
      ).rejects.toThrow("Invalid user preferences JSON");
      await expect(
        service().importUserPreferencesFromFile(jsonFile([1, 2], "p.json")),
      ).rejects.toThrow("User preferences file must be a JSON object");
      expect(confirmImport).not.toHaveBeenCalled();
    });
  });
});
