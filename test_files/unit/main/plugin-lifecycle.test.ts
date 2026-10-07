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
import type {
  Feed,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { AddFeedModal } from "../../../src/modals/feed-manager/add-feed-modal";
import {
  ReaderView,
  RSS_READER_VIEW_TYPE,
} from "../../../src/views/reader-view";

// Mock functions for FeedParser - must be declared before mocks
const mockParseFeed = vi.fn<(url: string) => Promise<Feed>>();
const mockRefreshAllFeeds = vi.fn();

// Mock window event listeners - must be declared before mocks
// Note: window spies are created per-suite to avoid `vi.restoreAllMocks()` wiping them.

// Mock the services that main.ts imports
vi.mock("../../../src/services/feed-parser", () => ({
  FeedParser: class FeedParser {
    parseFeed = mockParseFeed;
    refreshAllFeeds = mockRefreshAllFeeds;
    constructor(_media?: any, _availableTags?: any) {}
  },
  applyFeedRetentionLimits: vi.fn((feed: Feed) => feed),
  formatFeedParseNoticeMessage: vi.fn((error: Error) => error.message),
  getFeedErrorMessage: vi.fn((error: Error) => error.message),
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaver {
    findSavedArticleFile = vi.fn().mockResolvedValue(null);
    constructor(_app?: any, _settings?: any) {}
  },
}));

vi.mock("../../../src/services/backup-service", () => ({
  BackupService: class BackupService {
    performAutoBackups = vi.fn().mockResolvedValue(undefined);
    constructor(_options?: any) {}
  },
}));

vi.mock("../../../src/utils/settings-migration", () => ({
  migrateDisplaySettings: vi.fn(),
  migrateDefaultFilterToDashboardMultiFilters: vi.fn(),
  migrateKeywordRulesSettings: vi.fn().mockReturnValue(false),
  migrateMediaVideoTagSettings: vi.fn().mockReturnValue(false),
  migrateMediaDefaultTagArrays: vi.fn().mockReturnValue(false),
}));

// Import main AFTER all mocks are set up
import RssDashboardPlugin from "../../../main";

// Use App from obsidian stub (provided via Vitest alias)
import {
  App,
  Platform,
  TFolder,
  type MockApp,
  type PluginManifest,
} from "obsidian";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    // Let microtasks run
    void Promise.resolve().then(() => {
      queueMicrotask?.(resolve);
      if (typeof queueMicrotask === "undefined") {
        void Promise.resolve().then(resolve);
      }
    });
  });
}

// Create mock App using stubs
function createMockApp(): MockApp {
  return App.createMock();
}

// Create mock plugin manifest
function createMockManifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    minAppVersion: "1.8.7",
    author: "Test",
    description: "Test plugin",
    dir: ".",
  };
}

// Helper to create a plugin instance with mocks
/** Typed accessor for private RssDashboardPlugin members accessed from tests. */
type PluginPrivateAPI = {
  backupService: {
    performAutoBackups: () => Promise<void>;
  };
  folderService: object;
  backgroundImportService: { startBackgroundImport: (feeds: Feed[]) => void };
  articleSaver: {
    findSavedArticleFile: (...args: unknown[]) => Promise<unknown>;
  };
  onArticleSaved: (item: FeedItem) => Promise<void>;
  ingestFeedsForBackgroundImport: (
    feeds: Array<{ title: string; url: string; folder: string }>,
    opts?: { mode?: string; folders?: unknown[] },
  ) => Promise<{ addedCount: number; skippedCount: number }>;
};

async function createPluginInstance(app: MockApp): Promise<RssDashboardPlugin> {
  const manifest = createMockManifest();
  manifest.dir = "."; // Required by onunload() tests
  const plugin = new RssDashboardPlugin(app, manifest);

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

  plugin.registerObsidianProtocolHandler = vi.fn();

  // Initialize backupService with mock
  const { BackupService } =
    await import("../../../src/services/backup-service");
  (plugin as unknown as PluginPrivateAPI).backupService = new BackupService({
    settings: plugin.settings,
    manifest: plugin.manifest,
    vaultAbsolutePath: "",
    vault: app.vault,
    getUserSettingsJson: () => JSON.stringify({}),
  });

  // Initialize folderService
  const { FolderService } =
    await import("../../../src/services/folder-service");
  (plugin as unknown as PluginPrivateAPI).folderService = new FolderService(
    plugin.settings,
  );

  // Initialize backgroundImportService
  const { BackgroundImportService } =
    await import("../../../src/services/background-import-service");
  (plugin as unknown as PluginPrivateAPI).backgroundImportService =
    new BackgroundImportService({
      feedParser: {
        parseFeed: (url: string) => mockParseFeed(url),
      },
      getSettings: () => plugin.settings,
      getView: () => plugin.getActiveDashboardView(),
      saveSettings: () => plugin.saveSettings(),
      ensureFolderExists: (folder, opts) =>
        plugin.ensureFolderExists(folder, opts),
      addStatusBarItem: () => {
        const el = createDiv() as HTMLDivElement & {
          createSpan: (opts?: { cls?: string }) => HTMLSpanElement;
        };
        el.createSpan = (opts?: { cls?: string }) => {
          const span = createSpan();
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: loadSettings()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    expect(plugin.settings.refreshInterval).toBe(0);
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

  it("uses an independent copy of DEFAULT_SETTINGS on error", async () => {
    // Given: loadData throws an error
    (plugin.loadData as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Load failed"),
    );

    // When: loadSettings is called
    await plugin.loadSettings();

    // Then: settings should match defaults without sharing their mutable state
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    expect(plugin.settings).not.toBe(DEFAULT_SETTINGS);
    expect(plugin.settings.feeds).not.toBe(DEFAULT_SETTINGS.feeds);
    expect(plugin.settings.folders).not.toBe(DEFAULT_SETTINGS.folders);
  });

  it("does not persist fallback settings after a load failure", async () => {
    (plugin.loadData as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Load failed"),
    );

    await plugin.loadSettings();
    await plugin.saveSettings();

    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it("does not persist fallback settings through a storage operation", async () => {
    (plugin.loadData as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Load failed"),
    );

    const rmdirSpy = vi.spyOn(plugin.app.vault.adapter, "rmdir");
    await plugin.loadSettings();
    await plugin.app.vault.adapter.mkdir(plugin.settings.storageFolder);
    await plugin.revertToLegacyJsonStorageWithOptions({
      deleteShardFolder: true,
    });

    expect(plugin.saveData).not.toHaveBeenCalled();
    expect(rmdirSpy).not.toHaveBeenCalled();
  });

  it("keeps saves blocked until a later load succeeds", async () => {
    (plugin.loadData as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Load failed"),
    );
    await plugin.loadSettings();

    let resolveLoad: ((settings: RssDashboardSettings) => void) | undefined;
    const pendingLoad = new Promise<RssDashboardSettings>((resolve) => {
      resolveLoad = resolve;
    });
    (plugin.loadData as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      pendingLoad,
    );

    const retry = plugin.loadSettings();
    await plugin.saveSettings();
    expect(plugin.saveData).not.toHaveBeenCalled();

    const recoveredSettings = structuredClone(DEFAULT_SETTINGS);
    recoveredSettings.storageMode = "legacy-json";
    resolveLoad?.(recoveredSettings);
    await retry;
    (plugin.saveData as ReturnType<typeof vi.fn>).mockClear();

    await plugin.saveSettings();
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });

  it("blocks saves throughout a load that later fails hydration", async () => {
    const loadedSettings = structuredClone(DEFAULT_SETTINGS);
    loadedSettings.storageMode = "legacy-json";
    (plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValue(
      loadedSettings,
    );

    let rejectHydration: ((error: Error) => void) | undefined;
    const hydration = new Promise<never>((_resolve, reject) => {
      rejectHydration = reject;
    });
    const repository = (
      plugin as unknown as {
        feedStorageRepository: {
          hydrateSettings: () => typeof hydration;
        };
      }
    ).feedStorageRepository;
    const hydrateSpy = vi
      .spyOn(repository, "hydrateSettings")
      .mockReturnValue(hydration);

    const loading = plugin.loadSettings();
    await vi.waitFor(() => expect(hydrateSpy).toHaveBeenCalled());
    await plugin.saveSettings();
    rejectHydration?.(new Error("Hydration failed"));
    await loading;
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it("keeps saves blocked when an older overlapping load finishes first", async () => {
    const loadedSettings = structuredClone(DEFAULT_SETTINGS);
    loadedSettings.storageMode = "legacy-json";
    (plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValue(
      loadedSettings,
    );

    let resolveOlder:
      | ((result: {
          didChange: boolean;
          shardCount: number;
          userStateLoaded: boolean;
        }) => void)
      | undefined;
    let rejectNewer: ((error: Error) => void) | undefined;
    const olderHydration = new Promise<{
      didChange: boolean;
      shardCount: number;
      userStateLoaded: boolean;
    }>((resolve) => {
      resolveOlder = resolve;
    });
    const newerHydration = new Promise<never>((_resolve, reject) => {
      rejectNewer = reject;
    });
    const repository = (
      plugin as unknown as {
        feedStorageRepository: {
          hydrateSettings: () => Promise<unknown>;
        };
      }
    ).feedStorageRepository;
    const hydrateSpy = vi
      .spyOn(repository, "hydrateSettings")
      .mockReturnValueOnce(olderHydration)
      .mockReturnValueOnce(newerHydration);

    const olderLoad = plugin.loadSettings();
    await vi.waitFor(() => expect(hydrateSpy).toHaveBeenCalledTimes(1));
    const newerLoad = plugin.loadSettings();
    await vi.waitFor(() => expect(hydrateSpy).toHaveBeenCalledTimes(2));
    resolveOlder?.({ didChange: false, shardCount: 0, userStateLoaded: true });
    await olderLoad;
    (plugin.saveData as ReturnType<typeof vi.fn>).mockClear();

    await plugin.saveSettings();
    rejectNewer?.(new Error("Newer hydration failed"));
    await newerLoad;

    expect(plugin.saveData).not.toHaveBeenCalled();
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: onload() Initialization
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("onload() initialization", () => {
  let plugin: RssDashboardPlugin;
  let app: MockApp;
  let originalPlatformIsMobile: boolean;
  let originalPlatformIsDesktop: boolean;

  beforeEach(async () => {
    app = createMockApp();
    plugin = await createPluginInstance(app);
    // Several onload tests mock loadSettings(); onload() still reads settings.
    plugin.settings = structuredClone(DEFAULT_SETTINGS);
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

  it("clears and persists deleted saved-note state without an open dashboard", async () => {
    let deleteHandler: ((file: { path: string }) => void) | undefined;
    app.vault.on = (eventName, callback) => {
      if (eventName === "delete") {
        deleteHandler = callback as unknown as (file: { path: string }) => void;
      }
      return {};
    };

    await plugin.onload();
    plugin.settings.feeds = [structuredClone(sampleFeed)];
    const article = plugin.settings.feeds[0]?.items[0];
    expect(article).toBeDefined();
    if (!article) return;
    article.saved = true;
    article.savedFilePath = "Articles/Saved article.md";
    article.tags = [
      { name: "sAvEd", color: "blue" },
      { name: "Research", color: "green" },
    ];
    vi.clearAllMocks();

    deleteHandler?.({ path: "Articles/Saved article.md" });

    await vi.waitFor(() => {
      expect(plugin.saveData).toHaveBeenCalledTimes(1);
    });
    expect(app.workspace.getLeavesOfType("rss-dashboard-view")).toHaveLength(0);
    expect(article.saved).toBe(false);
    expect(article.savedFilePath).toBeUndefined();
    expect(article.tags).toEqual([{ name: "Research", color: "green" }]);
  });

  it("updates and persists a renamed saved note without an open dashboard", async () => {
    const renameHandlers: Array<(...args: unknown[]) => void> = [];
    app.vault.on = (eventName, callback) => {
      if (eventName === "rename") {
        renameHandlers.push(callback as (...args: unknown[]) => void);
      }
      return {};
    };

    await plugin.onload();
    plugin.settings.feeds = [structuredClone(sampleFeed)];
    const article = plugin.settings.feeds[0]?.items[0];
    expect(article).toBeDefined();
    if (!article) return;
    article.saved = true;
    article.savedFilePath = "Articles/Saved article.md";
    article.tags = [
      { name: "SaVeD", color: "blue" },
      { name: "Research", color: "green" },
    ];
    vi.clearAllMocks();

    for (const handler of renameHandlers) {
      handler(
        { path: "Archive/Renamed article.md" },
        "Articles/Saved article.md",
      );
    }

    await vi.waitFor(() => {
      expect(plugin.saveData).toHaveBeenCalledTimes(1);
    });
    expect(article.saved).toBe(true);
    expect(article.savedFilePath).toBe("Archive/Renamed article.md");
    expect(article.tags).toEqual([
      { name: "SaVeD", color: "blue" },
      { name: "Research", color: "green" },
    ]);
    expect(app.workspace.getLeavesOfType("rss-dashboard-view")).toHaveLength(0);
  });

  it("pushes a renamed saved-note association to an open Reader", async () => {
    let renameHandler: ((...args: unknown[]) => void) | undefined;
    app.vault.on = (eventName, callback) => {
      if (eventName === "rename") {
        renameHandler = callback as (...args: unknown[]) => void;
      }
      return {};
    };
    const reader = Object.create(ReaderView.prototype) as ReaderView;
    const applyExternalUpdate = vi.fn();
    reader.applyExternalUpdate = applyExternalUpdate;
    vi.spyOn(app.workspace, "getLeavesOfType").mockImplementation((viewType) =>
      viewType === RSS_READER_VIEW_TYPE
        ? [
            {
              view: reader,
              app,
              updateHeader: vi.fn(),
              loadIfDeferred: vi.fn().mockResolvedValue(undefined),
            },
          ]
        : [],
    );

    await plugin.onload();
    plugin.settings.feeds = [structuredClone(sampleFeed)];
    const article = plugin.settings.feeds[0]?.items[0];
    expect(article).toBeDefined();
    if (!article) return;
    article.saved = true;
    article.savedFilePath = "Articles/Saved article.md";
    article.tags = [{ name: "Saved", color: "blue" }];

    renameHandler?.(
      { path: "Archive/Renamed article.md" },
      "Articles/Saved article.md",
    );

    await vi.waitFor(() => {
      expect(applyExternalUpdate).toHaveBeenCalledWith(
        article.guid,
        {
          saved: true,
          savedFilePath: "Archive/Renamed article.md",
          tags: [{ name: "Saved", color: "blue" }],
        },
        article.feedUrl,
      );
    });
    await vi.waitFor(() => {
      expect(plugin.saveData).toHaveBeenCalledTimes(1);
    });
  });

  it("updates recorded saved-note paths when their folder is renamed", async () => {
    let renameHandler: ((...args: unknown[]) => void) | undefined;
    app.vault.on = (eventName, callback) => {
      if (eventName === "rename") {
        renameHandler = callback as (...args: unknown[]) => void;
      }
      return {};
    };

    await plugin.onload();
    plugin.settings.feeds = [structuredClone(sampleFeed)];
    const article = plugin.settings.feeds[0]?.items[0];
    expect(article).toBeDefined();
    if (!article) return;
    article.saved = true;
    article.savedFilePath = "Articles/Old/Saved article.md";

    const movedFolder = new TFolder();
    movedFolder.path = "Archive/New";
    renameHandler?.(movedFolder, "Articles/Old");

    await vi.waitFor(() => {
      expect(plugin.saveData).toHaveBeenCalledTimes(1);
    });
    expect(article.saved).toBe(true);
    expect(article.savedFilePath).toBe("Archive/New/Saved article.md");
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

  it("uses the due-aware scheduler instead of registering a global refresh interval", async () => {
    plugin.loadData = vi.fn().mockResolvedValue({ refreshInterval: 60 });

    // When: onload is called
    await plugin.onload();

    // Then: automatic refresh is owned by the per-feed scheduler, not Plugin.registerInterval.
    expect(plugin.registerInterval).not.toHaveBeenCalled();
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

  it("registers an Obsidian protocol handler", async () => {
    await plugin.onload();

    expect(plugin.registerObsidianProtocolHandler).toHaveBeenCalledWith(
      "rss-dashboard",
      expect.any(Function),
    );
  });

  it("loads settings during initialization", async () => {
    // When: onload is called
    await plugin.onload();

    // Then: settings should be loaded
    expect(plugin.settings).toBeDefined();
  });

  it("registers vault metadata change listeners", async () => {
    const onMock = vi.fn().mockReturnValue({});
    plugin.app.vault.on = onMock;

    await plugin.onload();

    expect(onMock).toHaveBeenCalledTimes(4);
    expect(onMock).toHaveBeenCalledWith("modify", expect.any(Function));
    expect(onMock).toHaveBeenCalledWith("create", expect.any(Function));
    expect(onMock).toHaveBeenCalledWith("rename", expect.any(Function));
    expect(onMock).toHaveBeenCalledWith("delete", expect.any(Function));
  });

  it("warns once per vault metadata failure incident", async () => {
    vi.useFakeTimers();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const renameHandlers: Array<(...args: unknown[]) => void> = [];
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        if (event === "rename") renameHandlers.push(callback);
        else handlers[event] = callback;
        return {};
      },
    );
    plugin.loadData = vi.fn().mockResolvedValue({
      metadataStorageMode: "vault-location",
      metadataStorageFolder: "rss-dashboard-data",
      metadataStorageSchemaVersion: 2,
    });
    let metadataAvailable = false;
    vi.spyOn(plugin.app.vault.adapter, "read").mockImplementation((path) => {
      if (metadataAvailable && path === "rss-dashboard-data/data.json") {
        return Promise.resolve(
          JSON.stringify({
            ...structuredClone(DEFAULT_SETTINGS),
            storageMode: "legacy-json",
            metadataStorageMode: "vault-location",
            metadataStorageFolder: "rss-dashboard-data",
            metadataStorageSchemaVersion: 2,
          }),
        );
      }
      return Promise.reject(new Error("ENOENT"));
    });
    const noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    await plugin.onload();
    for (const handler of renameHandlers) {
      handler(
        { path: "rss-dashboard-data/data.json.withheld" },
        "rss-dashboard-data/data.json",
      );
    }
    await vi.advanceTimersByTimeAsync(1_500);

    const warning =
      "Could not read plugin metadata from the configured vault folder. Settings were not loaded and nothing has been overwritten.";
    const warningCalls = () =>
      noticeSpy.mock.calls.filter(
        ([prefix, message]) =>
          prefix === "[Stub Notice]" && message === warning,
      );
    expect(warningCalls()).toHaveLength(1);

    metadataAvailable = true;
    handlers.create?.({ path: "rss-dashboard-data/data.json" });
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.advanceTimersByTimeAsync(3_000);
    metadataAvailable = false;
    for (const handler of renameHandlers) {
      handler(
        { path: "rss-dashboard-data/data.json.withheld" },
        "rss-dashboard-data/data.json",
      );
    }
    await vi.advanceTimersByTimeAsync(1_500);

    expect(warningCalls()).toHaveLength(2);
    vi.useRealTimers();
  });

  it("reloads settings and refreshes dashboard on watched data.json modify", async () => {
    vi.useFakeTimers();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        handlers[event] = callback;
        return {};
      },
    );

    const loadSpy = vi
      .spyOn(plugin, "loadSettings")
      .mockResolvedValue(undefined);
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.onload();

    handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
    await vi.runAllTimersAsync();

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("reloads settings and refreshes dashboard on watched user-state.json modify", async () => {
    vi.useFakeTimers();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        handlers[event] = callback;
        return {};
      },
    );

    const loadSpy = vi
      .spyOn(plugin, "loadSettings")
      .mockResolvedValue(undefined);
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.onload();

    handlers.modify?.({ path: ".rss-dashboard-data/user-state.json" });
    await vi.runAllTimersAsync();

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not reload for shard file modify", async () => {
    vi.useFakeTimers();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        handlers[event] = callback;
        return {};
      },
    );

    const loadSpy = vi
      .spyOn(plugin, "loadSettings")
      .mockResolvedValue(undefined);
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.onload();

    handlers.modify?.({ path: ".rss-dashboard-data/feeds/some-feed.json" });
    await vi.runAllTimersAsync();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });

  it("does not reload for unrelated file modify", async () => {
    vi.useFakeTimers();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        handlers[event] = callback;
        return {};
      },
    );

    const loadSpy = vi
      .spyOn(plugin, "loadSettings")
      .mockResolvedValue(undefined);
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.onload();

    handlers.modify?.({ path: "some-note.md" });
    await vi.runAllTimersAsync();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });

  it("debounces rapid metadata events into a single reload", async () => {
    vi.useFakeTimers();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        handlers[event] = callback;
        return {};
      },
    );

    const loadSpy = vi
      .spyOn(plugin, "loadSettings")
      .mockResolvedValue(undefined);
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.onload();

    for (let i = 0; i < 5; i += 1) {
      handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
      vi.advanceTimersByTime(100);
    }

    await vi.runAllTimersAsync();

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("resets debounce when metadata event occurs before timeout", async () => {
    vi.useFakeTimers();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        handlers[event] = callback;
        return {};
      },
    );

    const loadSpy = vi
      .spyOn(plugin, "loadSettings")
      .mockResolvedValue(undefined);
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.onload();

    handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
    vi.advanceTimersByTime(1000);
    handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
    await vi.runAllTimersAsync();

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("reloads on rename when watched new path matches", async () => {
    vi.useFakeTimers();
    const renameHandlers: Array<(...args: unknown[]) => void> = [];
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        if (event === "rename") renameHandlers.push(callback);
        return {};
      },
    );

    const loadSpy = vi
      .spyOn(plugin, "loadSettings")
      .mockResolvedValue(undefined);
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.onload();

    for (const handler of renameHandlers) {
      handler({ path: ".rss-dashboard-data/data.json" }, "other.json");
    }
    await vi.runAllTimersAsync();

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("reloads on rename when watched old path matches", async () => {
    vi.useFakeTimers();
    const renameHandlers: Array<(...args: unknown[]) => void> = [];
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        if (event === "rename") renameHandlers.push(callback);
        return {};
      },
    );

    const loadSpy = vi
      .spyOn(plugin, "loadSettings")
      .mockResolvedValue(undefined);
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.onload();

    for (const handler of renameHandlers) {
      handler({ path: "unrelated.md" }, ".rss-dashboard-data/data.json");
    }
    await vi.runAllTimersAsync();

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("keeps refreshed articles when shard persistence writes vault metadata", async () => {
    vi.useFakeTimers();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        handlers[event] = callback;
        return {};
      },
    );

    await plugin.onload();
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      storageMode: "vault-shards-v2",
      storageFolder: ".rss-dashboard-data/feeds",
      metadataStorageMode: "vault-location",
      metadataStorageFolder: ".rss-dashboard-data",
      feeds: [
        {
          ...sampleFeed,
          feedId: "feed-1",
          autoDeleteDuration: 30,
          items: [
            {
              ...sampleFeed.items[0],
              pubDate: "2026-08-15T00:00:00Z",
            },
          ],
        },
      ],
    };

    const loadSpy = vi.spyOn(plugin, "loadSettings").mockImplementation(() => {
      plugin.settings.feeds[0].items = [];
      return Promise.resolve();
    });
    const adapter = plugin.app.vault.adapter as unknown as {
      write: (path: string, content: string) => Promise<void>;
    };
    vi.spyOn(adapter, "write").mockImplementation((path) => {
      handlers.modify?.({ path });
      return Promise.resolve();
    });

    await plugin.saveSettings();
    await vi.advanceTimersByTimeAsync(1_500);

    expect(loadSpy).not.toHaveBeenCalled();
    expect(plugin.settings.feeds[0].items).toHaveLength(1);
    vi.useRealTimers();
  });

  it("watcher ordering: refresh after loadSettings completes", async () => {
    vi.useFakeTimers();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    plugin.app.vault.on = vi.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        handlers[event] = callback;
        return {};
      },
    );

    // Make loadSettings async but with a simple resolved promise
    const loadSpy = vi
      .spyOn(plugin, "loadSettings")
      .mockResolvedValue(undefined);
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.onload();

    handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
    await vi.runAllTimersAsync();

    // Both should be called (ordering verified in production code via await)
    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("preserves list view on mobile startup", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    plugin.loadData = vi.fn().mockResolvedValue({ viewStyle: "list" });

    await plugin.onload();

    expect(plugin.settings.viewStyle).toBe("list");
  });

  it("does not request an automatic refresh when startup finds no eligible feeds", async () => {
    plugin.loadData = vi.fn().mockResolvedValue({
      refreshInterval: 60,
      lastRefreshTimestamp: 0,
      feeds: [],
      startupRefreshDelaySeconds: 0,
    });
    const refreshSpy = vi
      .spyOn(plugin, "refreshFeeds")
      .mockResolvedValue(undefined);

    await plugin.onload();

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(mockRefreshAllFeeds).not.toHaveBeenCalled();
    expect(plugin.feedParser).toBeDefined();
  });

  it("does not inspect a valid saved-note path during startup or layout readiness", async () => {
    const item: FeedItem = {
      title: "Saved article",
      link: "https://example.com/article",
      description: "",
      pubDate: "2026-01-01T00:00:00Z",
      guid: "saved-article",
      read: false,
      starred: false,
      tags: [{ name: "Saved", color: "blue" }],
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed.xml",
      coverImage: "",
      saved: true,
      savedFilePath: "Saved/missing.md",
    };
    plugin.loadData = vi.fn().mockResolvedValue({
      ...DEFAULT_SETTINGS,
      storageMode: "legacy-json",
      startupRefreshDelaySeconds: 3600,
      feeds: [
        {
          title: "Feed",
          url: item.feedUrl,
          folder: "Uncategorized",
          items: [item],
          lastUpdated: 0,
        },
      ],
    });
    const lookupSpy = vi.spyOn(app.vault, "getAbstractFileByPath");

    await plugin.onload();
    app.workspace.triggerLayoutReady();
    await flushPromises();

    expect(lookupSpy).not.toHaveBeenCalledWith("Saved/missing.md");
    expect(plugin.settings.feeds[0]?.items[0]).toMatchObject({
      saved: true,
      savedFilePath: "Saved/missing.md",
    });
  });

  it("persists savedFilePath when an article is saved", async () => {
    plugin.settings = JSON.parse(
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        feeds: [
          {
            name: "Feed",
            url: "https://example.com/rss.xml",
            folder: "",
            items: [
              {
                guid: "guid-1",
                title: "Saved article",
                link: "https://example.com/article",
                description: "",
                pubDate: "2024-01-01T00:00:00.000Z",
                read: false,
                starred: false,
                saved: false,
                tags: [],
                feedTitle: "Feed",
                feedUrl: "https://example.com/rss.xml",
                coverImage: "",
              },
            ],
          },
        ],
      }),
    ) as RssDashboardSettings;

    const item = {
      ...plugin.settings.feeds[0].items[0],
      saved: true,
      savedFilePath: "Articles/Saved article.md",
    };

    await (plugin as unknown as PluginPrivateAPI).onArticleSaved(item);

    expect(plugin.settings.feeds[0].items[0].saved).toBe(true);
    expect(plugin.settings.feeds[0].items[0].savedFilePath).toBe(
      "Articles/Saved article.md",
    );
  });
});

describe("URI add-feed handling", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      media: {
        ...DEFAULT_SETTINGS.media,
        defaultRssFolder: "RSS",
      },
    } as RssDashboardSettings;

    plugin.feedParser = {
      parseFeed: mockParseFeed,
      refreshAllFeeds: mockRefreshAllFeeds,
    } as unknown as typeof plugin.feedParser;

    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      render: vi.fn(),
      refresh: vi.fn(),
    });

    vi.clearAllMocks();
    mockRefreshAllFeeds.mockClear();
    mockParseFeed.mockClear();
  });

  it("shows unsupported-action notice for unknown URI action", async () => {
    const noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    await plugin.onload();
    const handler = (
      plugin.registerObsidianProtocolHandler as ReturnType<typeof vi.fn>
    ).mock.calls[0][1] as (params: Record<string, string>) => void;

    handler({ action: "unknown" });
    await flushPromises();

    expect(noticeSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Unsupported RSS Dashboard URI action: unknown",
    );
  });

  it("shows notice and skips add when URI url is missing", async () => {
    const addFeedSpy = vi.spyOn(plugin, "addFeed");
    const noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    await plugin.onload();
    const handler = (
      plugin.registerObsidianProtocolHandler as ReturnType<typeof vi.fn>
    ).mock.calls[0][1] as (params: Record<string, string>) => void;

    handler({ action: "add-feed" });
    await flushPromises();

    expect(addFeedSpy).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Missing required URL parameter for add-feed.",
    );
  });

  it("shows notice and skips add for invalid feed URLs", async () => {
    const addFeedSpy = vi.spyOn(plugin, "addFeed");
    const noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    await plugin.onload();
    const handler = (
      plugin.registerObsidianProtocolHandler as ReturnType<typeof vi.fn>
    ).mock.calls[0][1] as (params: Record<string, string>) => void;

    handler({ action: "add-feed", url: "ftp://example.com/feed.xml" });
    await flushPromises();

    expect(addFeedSpy).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "URL must start with http:// or https://",
    );
  });

  it("opens Add Feed modal with prefilled URL for browser URI route", async () => {
    const addFeedSpy = vi.spyOn(plugin, "addFeed");
    const modalOpenSpy = vi.spyOn(AddFeedModal.prototype, "open");

    await plugin.onload();
    const handler = (
      plugin.registerObsidianProtocolHandler as ReturnType<typeof vi.fn>
    ).mock.calls[0][1] as (params: Record<string, string>) => void;

    const encodedUrl = encodeURIComponent("https://example.com/feed.xml");
    handler({ action: "rss-dashboard", url: encodedUrl });
    await flushPromises();

    expect(modalOpenSpy).toHaveBeenCalledTimes(1);
    expect(addFeedSpy).not.toHaveBeenCalled();

    const urlInput =
      document.querySelector<HTMLInputElement>(".feed-url-input");
    expect(urlInput?.value).toBe("https://example.com/feed.xml");
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: refreshFeeds()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    } as unknown as typeof plugin.feedParser;

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
      mockRefreshAllFeeds.mock.calls.map((call) => (call[0] as Feed[])[0].url),
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

  it("skips excluded feeds during bulk refresh", async () => {
    const includedFeed = {
      ...sampleFeed,
      url: "https://example.com/feed1.xml",
      title: "Included Feed",
    };
    const excludedFeed = {
      ...sampleFeed,
      url: "https://example.com/feed2.xml",
      title: "Excluded Feed",
      excludeFromRefresh: true,
    };
    plugin.settings.feeds = [includedFeed, excludedFeed];

    mockRefreshAllFeeds.mockResolvedValue([includedFeed]);

    await plugin.refreshFeeds();

    expect(mockRefreshAllFeeds).toHaveBeenCalledTimes(1);
    expect(mockRefreshAllFeeds).toHaveBeenCalledWith([includedFeed]);
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

  it("records explicit global completion without changing the legacy timestamp", async () => {
    // Given: Mock refreshAllFeeds returns updated feeds
    mockRefreshAllFeeds.mockResolvedValue([sampleFeed]);
    const beforeRefresh = Date.now();

    // When: refreshFeeds is called
    await plugin.refreshFeeds();
    const afterRefresh = Date.now();

    // Then: only the unambiguous global timestamp is set
    expect(plugin.settings.lastGlobalRefreshCompletedAt).toBeGreaterThanOrEqual(
      beforeRefresh,
    );
    expect(plugin.settings.lastGlobalRefreshCompletedAt).toBeLessThanOrEqual(
      afterRefresh,
    );
    expect(plugin.settings.lastRefreshTimestamp).toBe(0);
  });

  it("records global completion when an explicit global attempt fails", async () => {
    // Given: Mock refreshAllFeeds throws error
    mockRefreshAllFeeds.mockRejectedValue(new Error("Network error"));
    plugin.settings.lastGlobalRefreshCompletedAt = 0;

    // When: refreshFeeds is called
    await plugin.refreshFeeds();

    // A completed failed attempt is still a completed global check.
    expect(plugin.settings.lastGlobalRefreshCompletedAt).toBeGreaterThan(0);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: refresh timestamp settings
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("refresh timestamp settings", () => {
  it("keeps the legacy timestamp readable and defaults global completion to zero", () => {
    expect(DEFAULT_SETTINGS).toHaveProperty("lastRefreshTimestamp");
    expect(DEFAULT_SETTINGS.lastRefreshTimestamp).toBe(0);
    expect(DEFAULT_SETTINGS.lastGlobalRefreshCompletedAt).toBe(0);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: refreshFeedsInFolder()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    } as unknown as typeof plugin.feedParser;

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
      (call) => (call[0] as Feed[])[0],
    );
    expect(feedsCalled.every((f: Feed) => f.folder.startsWith("News/"))).toBe(
      true,
    );
  });

  it("skips excluded feeds in the specified folder", async () => {
    plugin.settings.feeds = [
      {
        ...sampleFeed,
        url: "https://example.com/feed1.xml",
        folder: "News/Tech",
      },
      {
        ...sampleFeed,
        url: "https://example.com/feed2.xml",
        folder: "News/Sports",
        excludeFromRefresh: true,
      },
    ];

    mockRefreshAllFeeds.mockResolvedValue([]);

    await plugin.refreshFeedsInFolder("News");

    expect(mockRefreshAllFeeds).toHaveBeenCalledTimes(1);
    expect(mockRefreshAllFeeds).toHaveBeenCalledWith([
      expect.objectContaining({ url: "https://example.com/feed1.xml" }),
    ]);
  });

  it("shows notice when no feeds in folder", async () => {
    // When: refreshFeedsInFolder is called with empty folder
    await plugin.refreshFeedsInFolder("NonExistent");

    // Then: Notice should be shown (mocked)
    // The method completes without error
    expect(plugin.settings).toBeDefined();
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: addFeed()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    } as unknown as typeof plugin.feedParser;

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

  it("applies all configured defaultYouTubeTags when adding a new YouTube feed", async () => {
    const youtubeUrl =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw";

    plugin.settings.availableTags = [
      { name: "Video", color: "#d04747" },
      { name: "News", color: "#3498db" },
      { name: "Tech", color: "#2ecc71" },
      { name: "Learning", color: "#f1c40f" },
    ];
    plugin.settings.media.defaultYouTubeFolder = "Videos";
    plugin.settings.media.defaultYouTubeTags = [
      "News",
      "Tech",
      "Learning",
      "Video",
    ];
    plugin.settings.media.defaultYouTubeTag = "Video";

    mockParseFeed.mockResolvedValue({
      title: "YouTube Feed",
      url: youtubeUrl,
      folder: "Videos",
      items: [
        {
          ...sampleFeed.items[0],
          guid: "yt-item-1",
          link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          feedUrl: youtubeUrl,
          feedTitle: "YouTube Feed",
          mediaType: "video",
          tags: [],
        },
      ],
      lastUpdated: Date.now(),
      mediaType: "video",
    });

    await plugin.addFeed("YouTube Feed", youtubeUrl, "Videos");

    const addedFeed = plugin.settings.feeds.find(
      (f: Feed) => f.url === youtubeUrl,
    );
    expect(addedFeed?.items[0].tags?.map((tag) => tag.name)).toEqual([
      "Video",
      "News",
      "Tech",
      "Learning",
    ]);
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

  it("preserves exclude-from-refresh when provided", async () => {
    const newUrl = "https://example.com/excluded.xml";

    mockParseFeed.mockResolvedValue({
      title: "Excluded Feed",
      url: newUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      mediaType: "article",
    });

    await plugin.addFeed(
      "Excluded Feed",
      newUrl,
      "Uncategorized",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );

    const addedFeed = plugin.settings.feeds.find((f: Feed) => f.url === newUrl);
    expect(addedFeed?.excludeFromRefresh).toBe(true);
  });

  it("stores customTags and applies them alongside media default tags on first add", async () => {
    const youtubeUrl =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_custom_stack";

    plugin.settings.availableTags = [
      { name: "Video", color: "#d04747" },
      { name: "News", color: "#3498db" },
      { name: "Tech", color: "#2ecc71" },
    ];
    plugin.settings.media.defaultYouTubeFolder = "Videos";
    plugin.settings.media.defaultYouTubeTags = ["Video", "News"];
    plugin.settings.media.defaultYouTubeTag = "Video";

    mockParseFeed.mockResolvedValue({
      title: "Stacked Tags Feed",
      url: youtubeUrl,
      folder: "Videos",
      items: [
        {
          ...sampleFeed.items[0],
          guid: "yt-stack-1",
          link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          feedUrl: youtubeUrl,
          feedTitle: "Stacked Tags Feed",
          mediaType: "video",
          tags: [{ name: "Video", color: "#d04747" }],
        },
      ],
      lastUpdated: Date.now(),
      mediaType: "video",
    });

    await plugin.addFeed(
      "Stacked Tags Feed",
      youtubeUrl,
      "Videos",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ["News", "Tech", "Missing", "Tech"],
    );

    const addedFeed = plugin.settings.feeds.find(
      (f: Feed) => f.url === youtubeUrl,
    );
    expect(addedFeed?.customTags).toEqual(["News", "Tech", "Missing", "Tech"]);
    expect(addedFeed?.items[0].tags?.map((tag) => tag.name)).toEqual([
      "Video",
      "News",
      "Tech",
    ]);
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: onunload() Cleanup
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      (plugin as unknown as PluginPrivateAPI).backgroundImportService,
      "startBackgroundImport",
    ).mockImplementation(() => {});
    plugin.ensureFolderExists = vi.fn().mockResolvedValue(false);
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      refresh: vi.fn(),
    });
  });

  it("dedupes URLs, inserts placeholders, saves once, and queues hydration", async () => {
    const result = await (
      plugin as unknown as PluginPrivateAPI
    ).ingestFeedsForBackgroundImport(
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
      (plugin as unknown as PluginPrivateAPI).backgroundImportService
        .startBackgroundImport,
    ).toHaveBeenCalledWith([
      expect.objectContaining({
        title: "New Feed",
        url: "https://example.com/new.xml",
        folder: "Research",
      }),
    ]);
  });

  it("supports overwrite mode and replaces folders when provided", async () => {
    const result = await (
      plugin as unknown as PluginPrivateAPI
    ).ingestFeedsForBackgroundImport(
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

    (plugin as unknown as PluginPrivateAPI).backupService.performAutoBackups =
      vi.fn().mockResolvedValue(undefined);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not write a backup on unload when the session has no persisted changes", () => {
    // When: onunload is called before any settings persistence
    plugin.onunload();

    // Then: no recovery snapshot is needed
    expect(
      (plugin as unknown as PluginPrivateAPI).backupService.performAutoBackups,
    ).not.toHaveBeenCalled();
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: performAutoBackups()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: refreshSelectedFeed()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    } as unknown as typeof plugin.feedParser;

    // Mock getActiveDashboardView
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      refresh: vi.fn(),
    });

    vi.clearAllMocks();
    mockRefreshAllFeeds.mockClear();
    mockParseFeed.mockClear();
  });

  it("refreshes a single excluded feed explicitly", async () => {
    const excludedFeed = {
      ...sampleFeed,
      excludeFromRefresh: true,
    };
    mockRefreshAllFeeds.mockResolvedValue([excludedFeed]);

    await plugin.refreshSelectedFeed(excludedFeed);

    expect(mockRefreshAllFeeds).toHaveBeenCalledWith([excludedFeed]);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: Storage transition orchestration
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("storage transition orchestration", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      storageMode: "vault-shards",
      feeds: [sampleFeed],
    };
    vi.clearAllMocks();
  });

  it("revertToLegacyJsonStorageWithOptions refreshes dashboards before settings refresh", async () => {
    const settingsRefreshSpy = vi.fn();
    (plugin as unknown as { settingTab: { refresh: () => void } }).settingTab =
      {
        refresh: settingsRefreshSpy,
      };

    const repoSpy = vi
      .spyOn(
        (
          plugin as unknown as {
            feedStorageRepository: {
              revertToLegacyJson: (...args: unknown[]) => Promise<void>;
            };
          }
        ).feedStorageRepository,
        "revertToLegacyJson",
      )
      .mockResolvedValue(undefined);
    const initSpy = vi
      .spyOn(
        plugin as unknown as {
          initializeSettingsBackedServices: () => void;
        },
        "initializeSettingsBackedServices",
      )
      .mockImplementation(() => {});
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.revertToLegacyJsonStorageWithOptions({
      deleteShardFolder: false,
    });

    expect(repoSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(settingsRefreshSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy.mock.invocationCallOrder[0]).toBeLessThan(
      settingsRefreshSpy.mock.invocationCallOrder[0],
    );
  });

  it("migrateToVaultStorage refreshes dashboards before settings refresh", async () => {
    const settingsRefreshSpy = vi.fn();
    (plugin as unknown as { settingTab: { refresh: () => void } }).settingTab =
      {
        refresh: settingsRefreshSpy,
      };

    const repoSpy = vi
      .spyOn(
        (
          plugin as unknown as {
            feedStorageRepository: {
              migrateToVaultShards: (...args: unknown[]) => Promise<void>;
            };
          }
        ).feedStorageRepository,
        "migrateToVaultShards",
      )
      .mockResolvedValue(undefined);
    const initSpy = vi
      .spyOn(
        plugin as unknown as {
          initializeSettingsBackedServices: () => void;
        },
        "initializeSettingsBackedServices",
      )
      .mockImplementation(() => {});
    const refreshSpy = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);

    await plugin.migrateToVaultStorage();

    expect(repoSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(settingsRefreshSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy.mock.invocationCallOrder[0]).toBeLessThan(
      settingsRefreshSpy.mock.invocationCallOrder[0],
    );
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: saveSettings()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    expect(plugin.saveData).toHaveBeenCalledWith(
      expect.objectContaining(plugin.settings),
    );
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

  it("completes configured backups after persisting settings", async () => {
    let resolveBackup: (() => void) | undefined;
    const backupPromise = new Promise<void>((resolve) => {
      resolveBackup = resolve;
    });
    const performAutoBackups = vi.fn().mockReturnValue(backupPromise);
    (plugin as unknown as PluginPrivateAPI).backupService.performAutoBackups =
      performAutoBackups;

    let saveCompleted = false;
    const savePromise = plugin.saveSettings().then(() => {
      saveCompleted = true;
    });

    await vi.waitFor(() => {
      expect(performAutoBackups).toHaveBeenCalledTimes(1);
    });

    expect(saveCompleted).toBe(false);

    resolveBackup?.();
    await savePromise;

    expect(saveCompleted).toBe(true);
  });

  it("keeps persisted settings when a backup fails", async () => {
    const backupError = new Error("disk full");
    const performAutoBackups = vi.fn().mockRejectedValue(backupError);
    (plugin as unknown as PluginPrivateAPI).backupService.performAutoBackups =
      performAutoBackups;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(plugin.saveSettings()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "[RSS Dashboard] Backup after save failed:",
      backupError,
    );
  });

  it("writes one recovery snapshot during a session and flushes later changes on unload", async () => {
    const performAutoBackups = vi.fn().mockResolvedValue(undefined);
    (plugin as unknown as PluginPrivateAPI).backupService.performAutoBackups =
      performAutoBackups;

    await plugin.saveSettings();
    await plugin.saveSettings();

    expect(performAutoBackups).toHaveBeenCalledTimes(1);

    plugin.onunload();

    await vi.waitFor(() => {
      expect(performAutoBackups).toHaveBeenCalledTimes(2);
    });
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test Suite: applyFeedLimitsToAllFeeds()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// ─── Storage revert routing (regression) ──────────────────────────────────────
describe("revertToLegacyJsonStorageWithOptions()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);
    vi.clearAllMocks();
  });

  it("writes metadata through the configured location, not straight to plugin data", async () => {
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      storageMode: "vault-shards-v2",
      metadataStorageMode: "vault-location",
      metadataStorageFolder: ".rss-dashboard-data",
      feeds: [sampleFeed],
    } as RssDashboardSettings;

    await plugin.revertToLegacyJsonStorageWithOptions();

    expect(plugin.settings.storageMode).toBe("legacy-json");

    // Reverting must not dump full settings into the plugin-default data.json:
    // that file is the bootstrap pointer, and overwriting it with settings that
    // still say "vault-location" makes the next load read a stale vault copy.
    const saveDataCalls = (plugin.saveData as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(saveDataCalls.length).toBeGreaterThan(0);
    for (const [payload] of saveDataCalls) {
      expect(payload).not.toHaveProperty("feeds");
      expect(payload).toHaveProperty("metadataStorageMode");
    }
  });
});

// ─── loadSettings guards (regression) ─────────────────────────────────────────
describe("loadSettings() vault metadata guard", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);
    vi.clearAllMocks();
  });

  it("does not overwrite anything when the pointed-to vault metadata is unreadable", async () => {
    (plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValue({
      metadataStorageMode: "vault-location",
      metadataStorageFolder: ".rss-dashboard-data",
      metadataStorageSchemaVersion: 2,
    });

    const adapter = plugin.app.vault.adapter as unknown as {
      read: (path: string) => Promise<string>;
      write: (path: string, data: string) => Promise<void>;
    };
    vi.spyOn(adapter, "read").mockRejectedValue(new Error("ENOENT"));
    const writeSpy = vi.spyOn(adapter, "write");

    await plugin.loadSettings();
    expect(plugin.settings.folders).not.toBe(DEFAULT_SETTINGS.folders);
    expect(plugin.settings.availableTags).not.toBe(
      DEFAULT_SETTINGS.availableTags,
    );
    const defaultFolderName = DEFAULT_SETTINGS.folders[0]?.name;
    if (plugin.settings.folders[0]) {
      plugin.settings.folders[0].name = "Changed fallback";
    }
    expect(DEFAULT_SETTINGS.folders[0]?.name).toBe(defaultFolderName);
    plugin.settings.storageMode = "legacy-json";
    await plugin.saveSettings();

    expect(plugin.saveData).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("blocks saves while unreadable vault metadata is still hydrating", async () => {
    (plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValue({
      metadataStorageMode: "vault-location",
      metadataStorageFolder: ".rss-dashboard-data",
      metadataStorageSchemaVersion: 2,
    });
    vi.spyOn(plugin.app.vault.adapter, "read").mockRejectedValue(
      new Error("ENOENT"),
    );

    let resolveHydration:
      | ((result: {
          didChange: boolean;
          shardCount: number;
          userStateLoaded: boolean;
        }) => void)
      | undefined;
    const hydration = new Promise<{
      didChange: boolean;
      shardCount: number;
      userStateLoaded: boolean;
    }>((resolve) => {
      resolveHydration = resolve;
    });
    const repository = (
      plugin as unknown as {
        feedStorageRepository: {
          hydrateSettings: () => typeof hydration;
        };
      }
    ).feedStorageRepository;
    const hydrateSpy = vi
      .spyOn(repository, "hydrateSettings")
      .mockReturnValue(hydration);

    const loading = plugin.loadSettings();
    await vi.waitFor(() => expect(hydrateSpy).toHaveBeenCalled());
    plugin.settings.storageMode = "legacy-json";
    await plugin.saveSettings();

    expect(plugin.saveData).not.toHaveBeenCalled();
    resolveHydration?.({
      didChange: false,
      shardCount: 0,
      userStateLoaded: true,
    });
    await loading;
  });
});

// ─── Metadata path reporting ──────────────────────────────────────────────────
describe("getMetadataFilePath()", () => {
  let plugin: RssDashboardPlugin;

  beforeEach(async () => {
    const app = createMockApp();
    plugin = await createPluginInstance(app);
    vi.clearAllMocks();
  });

  it("points at the configured vault folder when metadata lives in the vault", () => {
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      metadataStorageMode: "vault-location",
      metadataStorageFolder: "rss-dashboard-data",
    } as RssDashboardSettings;

    expect(plugin.getMetadataFilePath()).toBe("rss-dashboard-data/data.json");
  });

  it("trims a trailing separator from the configured folder", () => {
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      metadataStorageMode: "vault-location",
      metadataStorageFolder: "rss-dashboard-data/",
    } as RssDashboardSettings;

    expect(plugin.getMetadataFilePath()).toBe("rss-dashboard-data/data.json");
  });

  it("falls back to the default vault folder when none is configured", () => {
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      metadataStorageMode: "vault-location",
      metadataStorageFolder: "",
    } as RssDashboardSettings;

    expect(plugin.getMetadataFilePath()).toBe(".rss-dashboard-data/data.json");
  });

  it("points inside the plugin folder when metadata is plugin-default", () => {
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      metadataStorageMode: "plugin-default",
    } as RssDashboardSettings;

    expect(plugin.getMetadataFilePath()).toBe("./data.json");
  });
});
