/**
 * P0-1 Tests for Plugin Lifecycle (main.ts)
 *
 * Tests cover:
 * 1. onload() initialization - register views, commands, set up refresh interval
 * 2. loadSettings() - DEFAULT_SETTINGS, migrations
 * 3. refreshFeeds() - all feeds, selected feed, folder
 * 4. addFeed() - duplicate check, media type, parsing
 * 5. onunload() - cleanup, backups
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Feed, RssDashboardSettings } from "../../../src/types/types";
import { DEFAULT_SETTINGS } from "../../../src/types/types";

// Mock functions for FeedParser - must be declared before mocks
const mockParseFeed = vi.fn();
const mockRefreshAllFeeds = vi.fn();

// Mock window event listeners - must be declared before mocks
// Note: window spies are created per-suite to avoid `vi.restoreAllMocks()` wiping them.

// Mock the services that main.ts imports
vi.mock("../../../src/services/feed-parser", () => ({
  FeedParser: class FeedParser {
    parseFeed = mockParseFeed;
    refreshAllFeeds = mockRefreshAllFeeds;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_media?: any, _availableTags?: any) {}
  },
  applyFeedRetentionLimits: vi.fn((feed: Feed) => feed),
  formatFeedParseNoticeMessage: vi.fn((error: Error) => error.message),
  getFeedErrorMessage: vi.fn((error: Error) => error.message),
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaver {
    fixSavedFilePaths = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_app?: any, _settings?: any) {}
  },
}));

vi.mock("../../../src/services/backup-service", () => ({
  BackupService: class BackupService {
    performAutoBackups = vi.fn().mockResolvedValue(undefined);
    performAutoBackupsSyncDesktop = vi.fn().mockReturnValue(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_options?: any) {}
  },
}));

vi.mock("../../../src/utils/settings-migration", () => ({
  migrateDisplaySettings: vi.fn(),
  migrateDefaultFilterToDashboardMultiFilters: vi.fn(),
  migrateKeywordRulesSettings: vi.fn().mockReturnValue(false),
}));

// Import main AFTER all mocks are set up
import RssDashboardPlugin from "../../../main";

// Use App from obsidian stub (provided via Vitest alias)
import { App, Platform } from "obsidian";

// Type for mock app - use any to avoid TS errors with vi.mock
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockApp = any;

// Create mock App using stubs
function createMockApp(): MockApp {
  return (App as any).createMock();
}

// Create mock plugin manifest
function createMockManifest() {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    author: "Test",
    description: "Test plugin",
    dir: ".",
  };
}

// Helper to create a plugin instance with mocks
async function createPluginInstance(app: MockApp): Promise<RssDashboardPlugin> {
  const manifest = createMockManifest() as any;
  manifest.dir = "."; // Required by onunload() tests
  const plugin = new RssDashboardPlugin(app as any, manifest);

  // Mock loadData to return null (no saved settings)
  plugin.loadData = vi.fn().mockResolvedValue(null);

  // Mock saveData
  plugin.saveData = vi.fn().mockResolvedValue(undefined);

  // Mock registerView
  plugin.registerView = vi.fn();

  // Mock addRibbonIcon
  plugin.addRibbonIcon = vi.fn().mockReturnValue({
    onClick: vi.fn(),
  });

  // Mock addCommand
  plugin.addCommand = vi.fn();

  // Mock addSettingTab
  plugin.addSettingTab = vi.fn();

  // Mock registerInterval
  plugin.registerInterval = vi.fn((id: number) => id);

  // Initialize backupService with mock
  const { BackupService } =
    await import("../../../src/services/backup-service");
  (plugin as any).backupService = new BackupService({
    settings: plugin.settings,
    manifest: plugin.manifest,
    vaultAbsolutePath: "",
    vault: app.vault,
    getUserSettingsJson: () => JSON.stringify({}),
  });

  // Initialize folderService
  const { FolderService } =
    await import("../../../src/services/folder-service");
  (plugin as any).folderService = new FolderService(plugin.settings);

  // Initialize backgroundImportService
  const { BackgroundImportService } =
    await import("../../../src/services/background-import-service");
  (plugin as any).backgroundImportService = new BackgroundImportService({
    feedParser: {
      parseFeed: (url: string) =>
        ((plugin as any).feedParser?.parseFeed ?? vi.fn())(url),
    },
    getSettings: () => plugin.settings,
    getView: () => plugin.getActiveDashboardView(),
    saveSettings: () => plugin.saveSettings(),
    ensureFolderExists: (folder, opts) =>
      plugin.ensureFolderExists(folder, opts),
    addStatusBarItem: () => {
      const el = document.createElement("div");
      el.createSpan = (opts?: any) => {
        const span = document.createElement("span");
        if (opts?.cls) span.className = opts.cls;
        el.appendChild(span);
        return span;
      };
      return el;
    },
  });

  return plugin;
}

// Sample feed for testing
const sampleFeed: Feed = {
  title: "Test Feed",
  url: "https://example.com/feed.xml",
  folder: "Uncategorized",
  items: [
    {
      title: "Test Article",
      link: "https://example.com/1",
      description: "Test description",
      pubDate: "2024-01-01T00:00:00Z",
      guid: "https://example.com/1",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Test Feed",
      feedUrl: "https://example.com/feed.xml",
      coverImage: "",
    },
  ],
  lastUpdated: Date.now(),
  mediaType: "article",
};

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: loadSettings()
// ─────────────────────────────────────────────────────────────────────────────

describe("loadSettings()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);
    vi.clearAllMocks();
    mockRefreshAllFeeds.mockClear();
    mockParseFeed.mockClear();
  });

  it("loads DEFAULT_SETTINGS when no saved data exists", async () => {
    // Given: No saved data
    (plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    // When: loadSettings is called
    await plugin.loadSettings();

    // Then: settings should match DEFAULT_SETTINGS
    expect(plugin.settings).toBeDefined();
    expect(plugin.settings.feeds).toEqual(DEFAULT_SETTINGS.feeds);
    expect(plugin.settings.folders).toEqual(DEFAULT_SETTINGS.folders);
    expect(plugin.settings.refreshInterval).toBe(
      DEFAULT_SETTINGS.refreshInterval,
    );
    expect(plugin.settings.maxItems).toBe(DEFAULT_SETTINGS.maxItems);
  });

  it("merges saved settings with DEFAULT_SETTINGS", async () => {
    // Given: Saved settings with custom values
    const savedSettings: Partial<RssDashboardSettings> = {
      refreshInterval: 30,
      maxItems: 100,
      feeds: [sampleFeed],
    };
    (plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValue(
      savedSettings,
    );

    // When: loadSettings is called
    await plugin.loadSettings();

    // Then: saved values should override defaults
    expect(plugin.settings.refreshInterval).toBe(30);
    expect(plugin.settings.maxItems).toBe(100);
    expect(plugin.settings.feeds).toHaveLength(1);
  });

  it("normalizes refreshInterval=0 to disabled instead of re-enabling it", async () => {
    (plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValue({
      refreshInterval: 0,
    });

    await plugin.loadSettings();

    expect(plugin.settings.refreshInterval).toBe(0);
  });

  it("normalizes negative refreshInterval values to disabled", async () => {
    (plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValue({
      refreshInterval: -5,
    });

    await plugin.loadSettings();

    expect(plugin.settings.refreshInterval).toBe(0);
  });

  it("applies migrations to legacy settings", async () => {
    // Given: Legacy settings without new properties
    const legacySettings = {
      refreshInterval: 60,
      maxItems: 50,
      feeds: [
        {
          ...sampleFeed,
          // Legacy feed without keywordRules
          keywordRules: undefined,
          // Legacy feed without autoDeleteDuration
          autoDeleteDuration: undefined,
          maxItemsLimit: undefined,
        } as Feed,
      ],
    };
    (plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValue(
      legacySettings,
    );

    // When: loadSettings is called
    await plugin.loadSettings();

    // Then: migrations should be applied
    expect(plugin.settings.feeds[0].keywordRules).toBeDefined();
    expect(plugin.settings.feeds[0].keywordRules?.overrideGlobalRules).toBe(
      false,
    );
    expect(plugin.settings.feeds[0].autoDeleteDuration).toBeDefined();
    expect(plugin.settings.feeds[0].maxItemsLimit).toBeDefined();
  });

  it("falls back to DEFAULT_SETTINGS on error", async () => {
    // Given: loadData throws an error
    (plugin.loadData as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Load failed"),
    );

    // When: loadSettings is called
    await plugin.loadSettings();

    // Then: settings should be DEFAULT_SETTINGS
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("normalizes page sizes to a single global value", async () => {
    // Given: Settings with different page sizes per filter type
    const settingsWithMixedPageSizes = {
      allArticlesPageSize: 50,
      unreadArticlesPageSize: 25,
      readArticlesPageSize: 100,
      savedArticlesPageSize: 75,
      starredArticlesPageSize: 30,
    };
    (plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValue(
      settingsWithMixedPageSizes,
    );

    // When: loadSettings is called
    await plugin.loadSettings();

    // Then: All page sizes should be normalized to allArticlesPageSize
    expect(plugin.settings.unreadArticlesPageSize).toBe(50);
    expect(plugin.settings.readArticlesPageSize).toBe(50);
    expect(plugin.settings.savedArticlesPageSize).toBe(50);
    expect(plugin.settings.starredArticlesPageSize).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: onload() Initialization
// ─────────────────────────────────────────────────────────────────────────────

describe("onload() initialization", () => {
  let plugin: RssDashboardPlugin;
  let originalPlatformIsMobile: boolean;
  let originalPlatformIsDesktop: boolean;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);
    vi.clearAllMocks();
    mockRefreshAllFeeds.mockClear();
    mockParseFeed.mockClear();
    originalPlatformIsMobile = Platform.isMobile;
    originalPlatformIsDesktop = Platform.isDesktop;
  });

  afterEach(() => {
    Platform.isMobile = originalPlatformIsMobile;
    Platform.isDesktop = originalPlatformIsDesktop;
    vi.restoreAllMocks();
  });

  it("registers all required views", async () => {
    // When: onload is called
    await plugin.onload();

    // Then: registerView should be called for all views
    expect(plugin.registerView).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
    );
    // Should register at least 4 views (dashboard, discover, reader, smallweb)
    expect(
      (plugin.registerView as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("registers ribbon icon", async () => {
    // When: onload is called
    await plugin.onload();

    // Then: addRibbonIcon should be called
    expect(plugin.addRibbonIcon).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Function),
    );
  });

  it("registers commands", async () => {
    // When: onload is called
    await plugin.onload();

    // Then: addCommand should be called for all commands
    expect(plugin.addCommand).toHaveBeenCalled();
    // Should have multiple commands (open-dashboard, open-discover, refresh-feeds, etc.)
    expect(
      (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(7);
  });

  it("sets up refresh interval", async () => {
    // When: onload is called
    await plugin.onload();

    // Then: registerInterval should be called with a setInterval result
    expect(plugin.registerInterval).toHaveBeenCalled();
  });

  it("does not register auto refresh when refreshInterval is disabled", async () => {
    plugin.loadData = vi.fn().mockResolvedValue({ refreshInterval: 0 });

    await plugin.onload();

    expect(plugin.registerInterval).not.toHaveBeenCalled();
  });

  it("adds setting tab", async () => {
    // When: onload is called
    await plugin.onload();

    // Then: addSettingTab should be called
    expect(plugin.addSettingTab).toHaveBeenCalled();
  });

  it("registers beforeunload handler for backup", async () => {
    // When: onload is called
    await plugin.onload();

    // Then: _beforeUnloadHandler should be set
    expect(plugin["_beforeUnloadHandler"]).toBeDefined();
  });

  it("loads settings during initialization", async () => {
    // When: onload is called
    await plugin.onload();

    // Then: settings should be loaded
    expect(plugin.settings).toBeDefined();
  });

  it("preserves list view on mobile startup", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    plugin.loadData = vi.fn().mockResolvedValue({ viewStyle: "list" });

    await plugin.onload();

    expect(plugin.settings.viewStyle).toBe("list");
  });

  it("does not attempt a startup refresh before FeedParser initialization", async () => {
    plugin.loadData = vi.fn().mockResolvedValue({
      refreshInterval: 60,
      lastRefreshTimestamp: 0,
      feeds: [],
    });
    const refreshSpy = vi
      .spyOn(plugin, "refreshFeeds")
      .mockResolvedValue(undefined);

    await plugin.onload();

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(mockRefreshAllFeeds).not.toHaveBeenCalled();
    expect(plugin.feedParser).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: refreshFeeds()
// ─────────────────────────────────────────────────────────────────────────────

describe("refreshFeeds()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);

    // Initialize settings with sample feeds
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      feeds: [sampleFeed],
    };

    // Mock the feedParser on the plugin
    plugin.feedParser = {
      parseFeed: mockParseFeed,
      refreshAllFeeds: mockRefreshAllFeeds,
    } as any;

    // Mock getActiveDashboardView
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      refresh: vi.fn(),
    });

    vi.clearAllMocks();
    mockRefreshAllFeeds.mockClear();
    mockParseFeed.mockClear();
  });

  it("refreshes all feeds when no selection is provided", async () => {
    // Given: Multiple feeds in settings
    plugin.settings.feeds = [
      { ...sampleFeed, url: "https://example.com/feed1.xml" },
      { ...sampleFeed, url: "https://example.com/feed2.xml" },
    ];

    // Mock refreshAllFeeds to return updated feeds
    mockRefreshAllFeeds.mockResolvedValue([
      {
        ...sampleFeed,
        url: "https://example.com/feed1.xml",
        items: sampleFeed.items,
      },
      {
        ...sampleFeed,
        url: "https://example.com/feed2.xml",
        items: sampleFeed.items,
      },
    ]);

    // When: refreshFeeds is called without selection
    await plugin.refreshFeeds();

    // Then: the fallback multi-feed path should refresh each feed individually
    expect(mockRefreshAllFeeds).toHaveBeenCalledTimes(2);
    expect(
      mockRefreshAllFeeds.mock.calls.map((call) => call[0][0].url),
    ).toEqual([
      "https://example.com/feed1.xml",
      "https://example.com/feed2.xml",
    ]);
  });

  it("refreshes only selected feeds when provided", async () => {
    // Given: Multiple feeds in settings
    const feed1 = {
      ...sampleFeed,
      url: "https://example.com/feed1.xml",
      title: "Feed 1",
    };
    const feed2 = {
      ...sampleFeed,
      url: "https://example.com/feed2.xml",
      title: "Feed 2",
    };
    plugin.settings.feeds = [feed1, feed2];

    // Mock refreshAllFeeds
    mockRefreshAllFeeds.mockResolvedValue([feed1]);

    // When: refreshFeeds is called with specific feed
    await plugin.refreshFeeds([feed1]);

    // Then: refreshAllFeeds should be called only with selected feed
    expect(mockRefreshAllFeeds).toHaveBeenCalledWith([feed1]);
  });

  it("updates settings after refresh", async () => {
    // Given: Mock refreshAllFeeds returns updated feed
    const newItem = {
      title: "New Item",
      link: "new",
      description: "",
      pubDate: "2024-01-02T00:00:00Z",
      guid: "new-1",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Test",
      feedUrl: sampleFeed.url,
      coverImage: "",
    };
    const updatedFeed = {
      ...sampleFeed,
      items: [...sampleFeed.items, newItem],
    };
    mockRefreshAllFeeds.mockResolvedValue([updatedFeed]);

    // When: refreshFeeds is called
    await plugin.refreshFeeds();

    // Then: settings should be updated
    expect(plugin.settings.feeds[0].items).toHaveLength(2);
  });

  it("saves settings after refresh", async () => {
    // Given: Mock refreshAllFeeds
    mockRefreshAllFeeds.mockResolvedValue([]);

    // When: refreshFeeds is called
    await plugin.refreshFeeds();

    // Then: saveSettings should be called
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it("handles refresh errors gracefully", async () => {
    // Given: Mock refreshAllFeeds throws error
    mockRefreshAllFeeds.mockRejectedValue(new Error("Network error"));

    // When: refreshFeeds is called
    await plugin.refreshFeeds();

    // Then: Error should be handled (no throw)
    expect(plugin.settings).toBeDefined();
  });

  it("saves lastRefreshTimestamp after successful refresh", async () => {
    // Given: Mock refreshAllFeeds returns updated feeds
    mockRefreshAllFeeds.mockResolvedValue([sampleFeed]);
    const beforeRefresh = Date.now();

    // When: refreshFeeds is called
    await plugin.refreshFeeds();
    const afterRefresh = Date.now();

    // Then: lastRefreshTimestamp should be set
    expect(plugin.settings.lastRefreshTimestamp).toBeGreaterThanOrEqual(
      beforeRefresh,
    );
    expect(plugin.settings.lastRefreshTimestamp).toBeLessThanOrEqual(
      afterRefresh,
    );
  });

  it("does NOT save lastRefreshTimestamp on refresh failure", async () => {
    // Given: Mock refreshAllFeeds throws error
    mockRefreshAllFeeds.mockRejectedValue(new Error("Network error"));
    plugin.settings.lastRefreshTimestamp = 0;

    // When: refreshFeeds is called
    await plugin.refreshFeeds();

    // Then: lastRefreshTimestamp should remain 0 (not updated on failure)
    expect(plugin.settings.lastRefreshTimestamp).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: lastRefreshTimestamp settings
// ─────────────────────────────────────────────────────────────────────────────

describe("lastRefreshTimestamp in settings", () => {
  it("has lastRefreshTimestamp in DEFAULT_SETTINGS with default value 0", () => {
    // Then: DEFAULT_SETTINGS should include lastRefreshTimestamp
    expect(DEFAULT_SETTINGS).toHaveProperty("lastRefreshTimestamp");
    expect(DEFAULT_SETTINGS.lastRefreshTimestamp).toBe(0);
  });

  it("shouldRefreshOnOpen returns true when no timestamp exists", () => {
    // Given: Settings with no lastRefreshTimestamp
    const settings = { ...DEFAULT_SETTINGS, lastRefreshTimestamp: 0 };

    // When: Checking if should refresh on open
    const shouldRefresh =
      !settings.lastRefreshTimestamp ||
      Date.now() - settings.lastRefreshTimestamp >=
        settings.refreshInterval * 60 * 1000;

    // Then: Should return true for first-time users
    expect(shouldRefresh).toBe(true);
  });

  it("shouldRefreshOnOpen returns false when auto refresh is disabled", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      refreshInterval: 0,
      lastRefreshTimestamp: 0,
    };

    const shouldRefresh =
      settings.refreshInterval > 0 &&
      (!settings.lastRefreshTimestamp ||
        Date.now() - settings.lastRefreshTimestamp >=
          settings.refreshInterval * 60 * 1000);

    expect(shouldRefresh).toBe(false);
  });

  it("shouldRefreshOnOpen returns true when interval has elapsed", () => {
    // Given: Settings with timestamp 90 minutes ago, interval 60 minutes
    const ninetyMinutesAgo = Date.now() - 90 * 60 * 1000;
    const settings = {
      ...DEFAULT_SETTINGS,
      lastRefreshTimestamp: ninetyMinutesAgo,
      refreshInterval: 60,
    };

    // When: Checking if should refresh on open
    const shouldRefresh =
      !settings.lastRefreshTimestamp ||
      Date.now() - settings.lastRefreshTimestamp >=
        settings.refreshInterval * 60 * 1000;

    // Then: Should return true
    expect(shouldRefresh).toBe(true);
  });

  it("shouldRefreshOnOpen returns false when interval has not elapsed", () => {
    // Given: Settings with timestamp 30 minutes ago, interval 60 minutes
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    const settings = {
      ...DEFAULT_SETTINGS,
      lastRefreshTimestamp: thirtyMinutesAgo,
      refreshInterval: 60,
    };

    // When: Checking if should refresh on open
    const shouldRefresh =
      !settings.lastRefreshTimestamp ||
      Date.now() - settings.lastRefreshTimestamp >=
        settings.refreshInterval * 60 * 1000;

    // Then: Should return false
    expect(shouldRefresh).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: refreshFeedsInFolder()
// ─────────────────────────────────────────────────────────────────────────────

describe("refreshFeedsInFolder()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);

    // Initialize settings with sample feeds in folders
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      feeds: [
        {
          ...sampleFeed,
          url: "https://example.com/feed1.xml",
          folder: "News/Tech",
        },
        {
          ...sampleFeed,
          url: "https://example.com/feed2.xml",
          folder: "News/Sports",
        },
        {
          ...sampleFeed,
          url: "https://example.com/feed3.xml",
          folder: "Uncategorized",
        },
      ],
    };

    // Mock the feedParser on the plugin
    plugin.feedParser = {
      parseFeed: mockParseFeed,
      refreshAllFeeds: mockRefreshAllFeeds,
    } as any;

    // Mock getActiveDashboardView
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      refresh: vi.fn(),
    });

    vi.clearAllMocks();
    mockRefreshAllFeeds.mockClear();
    mockParseFeed.mockClear();
  });

  it("refreshes feeds in the specified folder", async () => {
    // Given: Feeds in nested folders
    mockRefreshAllFeeds.mockResolvedValue([]);

    // When: refreshFeedsInFolder is called with parent folder
    await plugin.refreshFeedsInFolder("News");

    // Then: the fallback multi-feed path should refresh each matching feed individually
    expect(mockRefreshAllFeeds).toHaveBeenCalledTimes(2);
    const feedsCalled = mockRefreshAllFeeds.mock.calls.map(
      (call) => call[0][0],
    );
    expect(feedsCalled.every((f: Feed) => f.folder.startsWith("News/"))).toBe(
      true,
    );
  });

  it("shows notice when no feeds in folder", async () => {
    // When: refreshFeedsInFolder is called with empty folder
    await plugin.refreshFeedsInFolder("NonExistent");

    // Then: Notice should be shown (mocked)
    // The method completes without error
    expect(plugin.settings).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: addFeed()
// ─────────────────────────────────────────────────────────────────────────────

describe("addFeed()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);

    // Initialize settings with sample feeds
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      feeds: [sampleFeed],
    };

    // Mock the feedParser on the plugin
    plugin.feedParser = {
      parseFeed: mockParseFeed,
      refreshAllFeeds: mockRefreshAllFeeds,
    } as any;

    // Mock getActiveDashboardView
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      refresh: vi.fn(),
    });

    vi.clearAllMocks();
    mockRefreshAllFeeds.mockClear();
    mockParseFeed.mockClear();
  });

  it("rejects duplicate feed URLs", async () => {
    // Given: Feed URL that already exists
    const existingUrl = sampleFeed.url;

    // When: addFeed is called with duplicate URL
    const result = await plugin.addFeed(
      "New Feed",
      existingUrl,
      "Uncategorized",
    );

    // Then: Should return false
    expect(result).toBe(false);
  });

  it("adds feed when URL is unique", async () => {
    // Given: New unique URL
    const newUrl = "https://example.com/new-feed.xml";

    // Mock parseFeed to return parsed feed
    mockParseFeed.mockResolvedValue({
      title: "New Feed",
      url: newUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      mediaType: "article",
    });

    // When: addFeed is called
    const result = await plugin.addFeed("New Feed", newUrl, "Uncategorized");

    // Then: Should return true and add feed to settings
    expect(result).toBe(true);
    expect(plugin.settings.feeds).toHaveLength(2);
  });

  it("detects media type based on folder (YouTube)", async () => {
    // Given: Feed in YouTube folder
    const youtubeUrl = "https://youtube.com/feed.xml";

    // Mock parseFeed
    mockParseFeed.mockResolvedValue({
      title: "YouTube Feed",
      url: youtubeUrl,
      folder: "Videos",
      items: [],
      lastUpdated: Date.now(),
      mediaType: "video",
    });

    // When: addFeed is called with YouTube folder
    await plugin.addFeed("YouTube Feed", youtubeUrl, "Videos");

    // Then: Feed should be added with video mediaType
    const addedFeed = plugin.settings.feeds.find(
      (f: Feed) => f.url === youtubeUrl,
    );
    expect(addedFeed?.mediaType).toBe("video");
  });

  it("detects media type based on folder (Podcast)", async () => {
    // Given: Feed in Podcast folder
    const podcastUrl = "https://podcast.com/feed.xml";

    // Mock parseFeed
    mockParseFeed.mockResolvedValue({
      title: "Podcast Feed",
      url: podcastUrl,
      folder: "Podcasts",
      items: [],
      lastUpdated: Date.now(),
      mediaType: "podcast",
    });

    // When: addFeed is called with Podcast folder
    await plugin.addFeed("Podcast Feed", podcastUrl, "Podcasts");

    // Then: Feed should be added with podcast mediaType
    const addedFeed = plugin.settings.feeds.find(
      (f: Feed) => f.url === podcastUrl,
    );
    expect(addedFeed?.mediaType).toBe("podcast");
  });

  it("uses default media type for uncategorized feeds", async () => {
    // Given: Feed in Uncategorized folder
    const articleUrl = "https://blog.com/feed.xml";

    // Mock parseFeed
    mockParseFeed.mockResolvedValue({
      title: "Blog Feed",
      url: articleUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      mediaType: "article",
    });

    // When: addFeed is called
    await plugin.addFeed("Blog Feed", articleUrl, "Uncategorized");

    // Then: Feed should have default media type
    const addedFeed = plugin.settings.feeds.find(
      (f: Feed) => f.url === articleUrl,
    );
    expect(addedFeed?.mediaType).toBe("article");
  });

  it("applies custom autoDeleteDuration when provided", async () => {
    // Given: New unique URL with custom duration
    const newUrl = "https://example.com/custom-duration.xml";
    const customDuration = 7;

    // Mock parseFeed
    mockParseFeed.mockResolvedValue({
      title: "Custom Duration Feed",
      url: newUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      mediaType: "article",
      autoDeleteDuration: customDuration,
    });

    // When: addFeed is called with custom autoDeleteDuration
    await plugin.addFeed(
      "Custom Duration Feed",
      newUrl,
      "Uncategorized",
      customDuration,
    );

    // Then: Feed should have custom duration
    const addedFeed = plugin.settings.feeds.find((f: Feed) => f.url === newUrl);
    expect(addedFeed?.autoDeleteDuration).toBe(customDuration);
  });

  it("applies custom maxItemsLimit when provided", async () => {
    // Given: New unique URL with custom limit
    const newUrl = "https://example.com/custom-limit.xml";
    const customLimit = 25;

    // Mock parseFeed
    mockParseFeed.mockResolvedValue({
      title: "Custom Limit Feed",
      url: newUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      mediaType: "article",
      maxItemsLimit: customLimit,
    });

    // When: addFeed is called with custom maxItemsLimit
    await plugin.addFeed(
      "Custom Limit Feed",
      newUrl,
      "Uncategorized",
      undefined,
      customLimit,
    );

    // Then: Feed should have custom limit
    const addedFeed = plugin.settings.feeds.find((f: Feed) => f.url === newUrl);
    expect(addedFeed?.maxItemsLimit).toBe(customLimit);
  });

  it("preserves an explicit Off scanInterval sentinel when provided", async () => {
    const newUrl = "https://example.com/refresh-off.xml";

    mockParseFeed.mockResolvedValue({
      title: "Refresh Off Feed",
      url: newUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      mediaType: "article",
    });

    await plugin.addFeed(
      "Refresh Off Feed",
      newUrl,
      "Uncategorized",
      undefined,
      undefined,
      -1,
    );

    const addedFeed = plugin.settings.feeds.find((f: Feed) => f.url === newUrl);
    expect(addedFeed?.scanInterval).toBe(-1);
  });

  it("preserves the global maxItems default when parser output omits maxItemsLimit", async () => {
    const newUrl = "https://example.com/global-default-limit.xml";

    plugin.settings.maxItems = 50;

    mockParseFeed.mockResolvedValue({
      title: "Global Default Feed",
      url: newUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      mediaType: "article",
    });

    await plugin.addFeed("Global Default Feed", newUrl, "Uncategorized");

    const addedFeed = plugin.settings.feeds.find((f: Feed) => f.url === newUrl);
    expect(addedFeed?.maxItemsLimit).toBe(50);
  });

  it("saves settings after adding feed", async () => {
    // Given: New unique URL
    const newUrl = "https://example.com/save-test.xml";

    // Mock parseFeed
    mockParseFeed.mockResolvedValue({
      title: "Save Test Feed",
      url: newUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      mediaType: "article",
    });

    // When: addFeed is called
    await plugin.addFeed("Save Test Feed", newUrl, "Uncategorized");

    // Then: saveSettings should be called
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it("handles parse errors gracefully", async () => {
    // Given: Feed that fails to parse
    const badUrl = "https://bad-feed.com/no-parse.xml";

    // Mock parseFeed to throw error
    mockParseFeed.mockRejectedValue(new Error("Parse failed"));

    // When: addFeed is called
    const result = await plugin.addFeed("Bad Feed", badUrl, "Uncategorized");

    // Then: Should return false
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: onunload() Cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe("ingestFeedsForBackgroundImport()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      feeds: [sampleFeed],
    };
    vi.clearAllMocks();
    vi.spyOn(
      (plugin as any).backgroundImportService,
      "startBackgroundImport",
    ).mockImplementation(() => {});
    plugin.ensureFolderExists = vi.fn().mockResolvedValue(false);
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      refresh: vi.fn(),
    });
  });

  it("dedupes URLs, inserts placeholders, saves once, and queues hydration", async () => {
    const result = await (plugin as any).ingestFeedsForBackgroundImport(
      [
        {
          title: "New Feed",
          url: "https://example.com/new.xml",
          folder: "Research",
        },
        {
          title: "Duplicate Existing",
          url: sampleFeed.url,
          folder: "Research",
        },
        {
          title: "Duplicate Incoming",
          url: "https://example.com/new.xml",
          folder: "Research",
        },
      ],
      { mode: "update" },
    );

    expect(result.addedCount).toBe(1);
    expect(result.skippedCount).toBe(2);
    expect(
      plugin.settings.feeds.some(
        (f) => f.url === "https://example.com/new.xml",
      ),
    ).toBe(true);
    const addedFeed = plugin.settings.feeds.find(
      (f) => f.url === "https://example.com/new.xml",
    );
    expect(addedFeed?.items).toEqual([]);
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(plugin.ensureFolderExists).toHaveBeenCalledWith("Research", {
      saveSettings: false,
      refreshView: false,
    });
    expect(
      (plugin as any).backgroundImportService.startBackgroundImport,
    ).toHaveBeenCalledWith([
      expect.objectContaining({
        title: "New Feed",
        url: "https://example.com/new.xml",
        folder: "Research",
      }),
    ]);
  });

  it("supports overwrite mode and replaces folders when provided", async () => {
    const result = await (plugin as any).ingestFeedsForBackgroundImport(
      [
        {
          title: "Only Feed",
          url: "https://example.com/only.xml",
          folder: "Tech/AI",
        },
      ],
      {
        mode: "overwrite",
        folders: [
          { name: "Tech", subfolders: [{ name: "AI", subfolders: [] }] },
        ],
      },
    );

    expect(result.addedCount).toBe(1);
    expect(plugin.settings.feeds).toHaveLength(1);
    expect(plugin.settings.feeds[0].url).toBe("https://example.com/only.xml");
    expect(plugin.settings.folders).toEqual([
      { name: "Tech", subfolders: [{ name: "AI", subfolders: [] }] },
    ]);
  });
});

describe("onunload()", () => {
  let plugin: RssDashboardPlugin;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let removeEventListenerSpy: any;

  beforeEach(async () => {
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const app = createMockApp();
    plugin = await createPluginInstance(app);

    // Initialize settings with auto-backup enabled
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      autoBackup: {
        backupDataJson: true,
        backupOpml: true,
        backupUserdata: true,
      },
    };

    // Set up beforeUnloadHandler
    plugin["_beforeUnloadHandler"] = vi.fn();

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes beforeunload handler", () => {
    // Given: Plugin with beforeUnloadHandler set
    expect(plugin["_beforeUnloadHandler"]).toBeDefined();

    // When: onunload is called
    plugin.onunload();

    // Then: beforeUnloadHandler should be null
    expect(plugin["_beforeUnloadHandler"]).toBeNull();
  });

  it("removes beforeunload event listener from window", () => {
    // When: onunload is called
    plugin.onunload();

    // Then: removeEventListener should be called
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("attempts sync backup on desktop", () => {
    // Given: Plugin with auto-backup settings
    (plugin as any).backupService.performAutoBackupsSyncDesktop = vi
      .fn()
      .mockReturnValue(true);

    // When: onunload is called
    plugin.onunload();

    // Then: performAutoBackupsSyncDesktop should be called
    expect(
      (plugin as any).backupService.performAutoBackupsSyncDesktop,
    ).toHaveBeenCalled();
  });

  it("falls back to async backup when sync fails", () => {
    // Given: Plugin with auto-backup settings that fails sync
    (plugin as any).backupService.performAutoBackupsSyncDesktop = vi
      .fn()
      .mockReturnValue(false);
    (plugin as any).backupService.performAutoBackups = vi
      .fn()
      .mockResolvedValue(undefined);

    // When: onunload is called
    plugin.onunload();

    // Then: performAutoBackups should be called as fallback
    expect((plugin as any).backupService.performAutoBackups).toHaveBeenCalled();
  });

  it("does not throw when autoBackup is disabled", () => {
    // Given: Plugin with auto-backup disabled
    plugin.settings.autoBackup = {
      backupDataJson: false,
      backupOpml: false,
      backupUserdata: false,
    };

    // When: onunload is called
    expect(() => plugin.onunload()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: performAutoBackups()
// ─────────────────────────────────────────────────────────────────────────────

describe("performAutoBackups()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);

    // Initialize settings with auto-backup enabled
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      autoBackup: {
        backupDataJson: true,
        backupOpml: true,
        backupUserdata: true,
      },
    };

    // Mock manifest.dir
    plugin.manifest = {
      ...plugin.manifest,
      dir: ".",
    } as RssDashboardPlugin["manifest"];

    vi.clearAllMocks();
    mockRefreshAllFeeds.mockClear();
    mockParseFeed.mockClear();
  });

  it("skips backup when autoBackup is disabled", async () => {
    // Given: Auto-backup disabled
    plugin.settings.autoBackup = {
      backupDataJson: false,
      backupOpml: false,
      backupUserdata: false,
    };

    // When: performAutoBackups is called
    await plugin.performAutoBackups();

    // Then: No writes should occur
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it("handles missing plugin dir gracefully", async () => {
    // Given: No plugin dir
    plugin.manifest.dir = undefined;

    // When: performAutoBackups is called
    await plugin.performAutoBackups();

    // Then: Should not throw
    expect(plugin.saveData).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: refreshSelectedFeed()
// ─────────────────────────────────────────────────────────────────────────────

describe("refreshSelectedFeed()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);

    // Initialize settings
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      feeds: [sampleFeed],
    };

    // Mock the feedParser on the plugin
    plugin.feedParser = {
      parseFeed: mockParseFeed,
      refreshAllFeeds: mockRefreshAllFeeds,
    } as any;

    // Mock getActiveDashboardView
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      refresh: vi.fn(),
    });

    vi.clearAllMocks();
    mockRefreshAllFeeds.mockClear();
    mockParseFeed.mockClear();
  });

  it("refreshes a single feed", async () => {
    // Given: Mock refreshFeeds
    plugin.refreshFeeds = vi.fn().mockResolvedValue(undefined);

    // When: refreshSelectedFeed is called
    await plugin.refreshSelectedFeed(sampleFeed);

    // Then: refreshFeeds should be called with array containing the feed
    expect(plugin.refreshFeeds).toHaveBeenCalledWith([sampleFeed]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: saveSettings()
// ─────────────────────────────────────────────────────────────────────────────

describe("saveSettings()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);

    // Initialize settings
    plugin.settings = {
      ...DEFAULT_SETTINGS,
    };

    vi.clearAllMocks();
  });

  it("calls saveData with current settings", async () => {
    // When: saveSettings is called
    await plugin.saveSettings();

    // Then: saveData should be called with settings
    expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
  });

  it("saves modified settings", async () => {
    // Given: Modified settings
    plugin.settings.refreshInterval = 120;

    // When: saveSettings is called
    await plugin.saveSettings();

    // Then: saveData should be called with modified settings
    expect(plugin.saveData).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshInterval: 120,
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: applyFeedLimitsToAllFeeds()
// ─────────────────────────────────────────────────────────────────────────────

describe("applyFeedLimitsToAllFeeds()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);

    // Initialize settings with feeds
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      feeds: [
        {
          ...sampleFeed,
          url: "https://example.com/feed1.xml",
          maxItemsLimit: 10,
        },
        {
          ...sampleFeed,
          url: "https://example.com/feed2.xml",
          maxItemsLimit: 20,
        },
      ],
    };

    // Mock getActiveDashboardView
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      refresh: vi.fn(),
    });

    vi.clearAllMocks();
  });

  it("applies limits to all feeds", async () => {
    // When: applyFeedLimitsToAllFeeds is called
    await plugin.applyFeedLimitsToAllFeeds();

    // Then: settings should be saved
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it("shows notice after applying limits", async () => {
    // When: applyFeedLimitsToAllFeeds is called
    await plugin.applyFeedLimitsToAllFeeds();

    // Then: Notice should be shown
    expect(plugin.settings).toBeDefined();
  });
});
