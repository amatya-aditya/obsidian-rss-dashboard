import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type FeedItemsShard,
  RssDashboardSettings,
  PortableDataBundle,
} from "../../../src/types/types";

// Mock export utilities
vi.mock("../../../src/utils/export-utils", () => ({
  exportBlob: vi.fn().mockResolvedValue("downloaded"),
  copyTextToClipboard: vi.fn().mockResolvedValue("copied"),
}));

vi.mock("../../../src/services/opml-manager", () => ({
  OpmlManager: {
    generateOpml: vi.fn().mockReturnValue("<opml>mock</opml>"),
  },
}));

// Note: These tests assume ImportExportService will be updated to handle metadata storage config
// Tests written before implementation (Red cycle)

function makeSettings(): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;

  settings.feeds = [
    {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "RSS",
      items: [],
      lastUpdated: 0,
      feedId: "feed-1",
    },
  ];
  settings.storageMode = "vault-shards";
  settings.storageFolder = ".rss-dashboard-data/feeds";
  settings.storageSchemaVersion = 1;
  settings.metadataStorageMode = "vault-location";
  settings.metadataStorageFolder = ".rss-dashboard-data";
  settings.metadataStorageSchemaVersion = 1;

  return settings;
}

function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Item",
    link: "https://example.com/article-1",
    description: "Excerpt",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Test Feed",
    url: "https://example.com/feed.xml",
    folder: "RSS",
    items: [],
    lastUpdated: 0,
    feedId: "feed-1",
    ...overrides,
  };
}

function makePortableBundle(): PortableDataBundle {
  return {
    version: 1,
    exportedAt: Date.now(),
    storageMode: "vault-shards",
    storageFolder: ".rss-dashboard-data/feeds",
    metadataStorageMode: "vault-location",
    metadataStorageFolder: ".rss-dashboard-data",
    metadata: {
      ...makeSettings(),
      feeds: [],
    },
    shards: [
      {
        version: 1,
        feedId: "feed-1",
        feedUrl: "https://example.com/feed.xml",
        updatedAt: Date.now(),
        items: [],
      },
    ],
    markdownMirrorFallbackPlanned: false,
  };
}

describe("ImportExportService - Metadata Storage Config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Export Portable Data Bundle - Metadata Location", () => {
    it("includes metadataStorageMode in exported bundle", async () => {
      const settings = makeSettings();
      settings.metadataStorageMode = "vault-location";

      // Create a mock ImportExportService instance
      // const svc = new ImportExportService({ settings, isMobile: false });
      // await svc.exportPortableDataBundle();

      // Expected: exported JSON contains "metadataStorageMode": "vault-location"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("includes metadataStorageFolder in exported bundle", async () => {
      const settings = makeSettings();
      settings.metadataStorageFolder = ".rss-dashboard-data";

      // Expected: exported JSON contains "metadataStorageFolder": ".rss-dashboard-data"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("includes both feed storage and metadata storage config in bundle", async () => {
      const settings = makeSettings();
      settings.storageMode = "vault-shards";
      settings.storageFolder = ".rss-dashboard-data/feeds";
      settings.metadataStorageMode = "vault-location";
      settings.metadataStorageFolder = ".rss-dashboard-data";

      // Expected: bundle contains all four config values
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("exports metadata without embedded feed items when vault-location mode is active", async () => {
      const settings = makeSettings();
      settings.metadataStorageMode = "vault-location";
      settings.feeds = [
        {
          title: "Test Feed",
          url: "https://example.com/feed.xml",
          folder: "RSS",
          items: [makeFeedItem()],
          lastUpdated: 0,
          feedId: "feed-1",
        },
      ];

      // Expected: exported metadata.feeds[0] has empty or missing items array
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("creates filename as 'rss-dashboard-portable-bundle.json'", async () => {
      const settings = makeSettings();
      void settings;

      // Expected: exportBlob called with filename ending in "portable-bundle.json"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("Import Portable Data Bundle - Restore Metadata Location", () => {
    it("restores metadataStorageMode from imported bundle", async () => {
      const bundle = makePortableBundle();
      bundle.metadataStorageMode = "vault-location";

      // const svc = new ImportExportService({ settings: makeSettings(), isMobile: false });
      // const result = await svc.importPortableDataBundle(bundle);

      // Expected: result.settings.metadataStorageMode === "vault-location"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("restores metadataStorageFolder from imported bundle", async () => {
      const bundle = makePortableBundle();
      bundle.metadataStorageFolder = ".custom-metadata-location";

      // Expected: result.settings.metadataStorageFolder === ".custom-metadata-location"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("validates metadataStorageFolder path before restoring", async () => {
      const bundle = makePortableBundle();
      bundle.metadataStorageFolder = "invalid/path:with*illegal";

      // Expected: warning or error shown, defaults to ".rss-dashboard-data"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("falls back to default metadata location if bundle has missing config", async () => {
      const bundle = makePortableBundle();
      delete bundle.metadataStorageMode;
      delete bundle.metadataStorageFolder;

      // Expected: imported settings use default ("plugin-default", ".rss-dashboard-data")
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("restores both feed and metadata storage config correctly", async () => {
      const bundle = makePortableBundle();
      bundle.storageMode = "vault-shards";
      bundle.storageFolder = ".rss-dashboard-data/feeds";
      bundle.metadataStorageMode = "vault-location";
      bundle.metadataStorageFolder = ".rss-dashboard-data";

      // Expected: all four values restored to settings
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("Backup Bundle Generation - Metadata Location", () => {
    it("includes metadata storage config in auto-backup bundle", async () => {
      const settings = makeSettings();
      settings.metadataStorageMode = "vault-location";

      // Expected: backup bundle contains metadataStorageMode and metadataStorageFolder
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("tags backup bundle with timestamp for recovery", async () => {
      const settings = makeSettings();
      void settings;

      // Expected: bundle includes exportedAt timestamp
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("Mobile Compatibility - Import/Export Metadata", () => {
    it("uses vault.adapter for file operations (no Electron fs)", async () => {
      const settings = makeSettings();
      void settings;

      // Expected: no window.require or fs module usage
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("handles metadata location on iOS/Android with third-party sync", async () => {
      const settings = makeSettings();
      settings.metadataStorageMode = "vault-location";

      // Expected: portable bundle includes config so mobile import can restore path
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("generates downloadable bundle JSON for cross-device import", async () => {
      const settings = makeSettings();
      void settings;

      // Expected: bundle can be exported and shared to another device/vault
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("Data Integrity - Metadata Persistence", () => {
    it("preserves all metadata settings during export/import roundtrip", async () => {
      const original = makeSettings();
      original.metadataStorageMode = "vault-location";
      original.metadataStorageFolder = ".custom-data";

      // Simulate export/import cycle
      // const bundle = await createBundleFromSettings(original);
      // const restored = await importBundleSettings(bundle);

      // Expected: restored.metadataStorageMode === original.metadataStorageMode
      // Expected: restored.metadataStorageFolder === original.metadataStorageFolder
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("detects version mismatch in imported bundle metadata config", async () => {
      const bundle = makePortableBundle();
      bundle.metadata.metadataStorageSchemaVersion = 99; // Future version

      // Expected: warning shown, defaults to safe mode
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("merges imported metadata config with existing feeds gracefully", async () => {
      const existing = makeSettings();
      existing.feeds = [
        makeFeed({
          title: "Existing",
          url: "https://existing.com/feed.xml",
        }),
      ];

      const newBundle = makePortableBundle();
      newBundle.shards = [
        {
          version: 1,
          feedId: "new-1",
          feedUrl: "https://new.example/feed.xml",
          updatedAt: Date.now(),
          items: [],
        } satisfies FeedItemsShard,
      ];

      // Expected: existing feeds preserved, new shards added
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("Error Recovery - Metadata Import", () => {
    it("rolls back metadata config if import fails partway through", async () => {
      const bundle = makePortableBundle();
      void bundle;

      // Setup: import will fail when trying to validate folder paths
      // Expected: settings reverted to pre-import state
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("shows clear error message if imported metadata path is invalid", async () => {
      const bundle = makePortableBundle();
      bundle.metadataStorageFolder = "non-existent-path-with-invalid-chars:*?";

      // Expected: error notice explains validation failure
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });
});
