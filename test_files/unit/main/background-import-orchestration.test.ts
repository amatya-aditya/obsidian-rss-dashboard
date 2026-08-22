import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";
import {
  BACKGROUND_IMPORT_FEED_REQUEST_TIMEOUT_MS,
  BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT,
  FEED_SOFT_TIMEOUT_MS,
  MAX_CONCURRENT_FETCHES,
} from "../../../src/services/feed-timeout";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { BackgroundImportService } from "../../../src/services/background-import-service";
import RssDashboardPlugin from "../../../main";

const mockParseFeed = vi.fn();
const mockRefreshFeed = vi.fn();

vi.mock("../../../src/services/feed-parser", () => ({
  FeedParser: class FeedParser {
    parseFeed = mockParseFeed;
    refreshFeed = mockRefreshFeed;
    refreshAllFeeds = vi.fn();
    constructor(_media?: unknown, _availableTags?: unknown) {}
  },
  applyFeedRetentionLimits: vi.fn((feed: Feed) => feed),
  formatFeedParseNoticeMessage: vi.fn((error: Error) => error.message),
  getFeedErrorMessage: vi.fn((error: Error) => error.message),
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaver {
    fixSavedFilePaths = vi.fn().mockResolvedValue(undefined);
    constructor(_app?: unknown, _settings?: unknown) {}
  },
}));

vi.mock("../../../src/utils/settings-migration", () => ({
  migrateDisplaySettings: vi.fn(),
  migrateDefaultFilterToDashboardMultiFilters: vi.fn(),
  migrateKeywordRulesSettings: vi.fn().mockReturnValue(false),
  migrateMediaVideoTagSettings: vi.fn().mockReturnValue(false),
}));

interface PluginWithInternal {
  isBackgroundImporting: boolean;
  backgroundImportService: BackgroundImportService;
  addStatusBarItem(): HTMLElement;
  feedParser: {
    parseFeed: typeof mockParseFeed;
    refreshFeed: typeof mockRefreshFeed;
    refreshAllFeeds: ReturnType<typeof vi.fn>;
  };
}

function createPlugin(): RssDashboardPlugin {
  const app = (App as unknown as { createMock(): App }).createMock();
  const manifest: PluginManifest = {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    author: "Test",
    description: "Test plugin",
    dir: ".",
  };
  const plugin = new RssDashboardPlugin(app, manifest);

  plugin.settings = {
    ...DEFAULT_SETTINGS,
    feeds: [],
  };
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  
  const pluginInternal = plugin as unknown as PluginWithInternal;
  pluginInternal.addStatusBarItem = vi.fn(() => document.createElement("div"));
  pluginInternal.feedParser = {
    parseFeed: mockParseFeed,
    refreshFeed: mockRefreshFeed,
    refreshAllFeeds: vi.fn(),
  };

  // Initialize BackgroundImportService (normally done in onload)
  pluginInternal.backgroundImportService = new BackgroundImportService({
    feedParser: pluginInternal.feedParser,
    getSettings: () => plugin.settings,
    getView: () => plugin.getActiveDashboardView(),
    saveSettings: () => plugin.saveSettings(),
    ensureFolderExists: vi.fn().mockResolvedValue(false),
    addStatusBarItem: () => pluginInternal.addStatusBarItem(),
    onFeedImported: (feed) =>
      (
        plugin as unknown as {
          queuePreviewImageCaching(importedFeed: Feed): void;
        }
      ).queuePreviewImageCaching(feed),
  });

  return plugin;
}

function createPlaceholderFeed(url: string): Feed {
  return {
    title: url,
    url,
    folder: "Inbox",
    items: [],
    lastUpdated: 0,
    mediaType: "article",
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

describe("background import orchestration", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    mockParseFeed.mockReset();
    mockRefreshFeed.mockReset();
  });

  it("does not let refresh overwrite a Discover feed while background hydration owns it", async () => {
    const plugin = createPlugin();
    const existingFeed = {
      ...createPlaceholderFeed("https://example.com/existing.xml"),
      items: [
        {
          title: "Existing article",
          link: "https://example.com/existing/article",
          description: "Existing description",
          pubDate: "2026-08-21T12:00:00.000Z",
          guid: "existing-article",
          read: false,
          starred: false,
          tags: [],
          feedTitle: "Existing feed",
          feedUrl: "https://example.com/existing.xml",
        },
      ],
    } satisfies Feed;
    plugin.settings.feeds = [existingFeed];
    plugin.settings.display = {
      ...plugin.settings.display,
      allowImageCaching: true,
      showCoverImage: true,
    };
    const cacheUrl = vi.fn().mockResolvedValue(true);
    (
      plugin as unknown as {
        imageCacheService: { cacheUrl: typeof cacheUrl };
      }
    ).imageCacheService = { cacheUrl };

    let resolveInitialSave: (() => void) | undefined;
    vi.mocked(plugin.saveData)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveInitialSave = resolve;
          }),
      )
      .mockResolvedValue(undefined);

    let resolveImport: ((feed: Feed) => void) | undefined;
    mockParseFeed.mockReturnValue(
      new Promise<Feed>((resolve) => {
        resolveImport = resolve;
      }),
    );

    let resolvePlaceholderRefresh: ((feed: Feed) => void) | undefined;
    mockRefreshFeed.mockImplementation((feed: Feed) => {
      if (feed.url === existingFeed.url) {
        return Promise.resolve(feed);
      }

      return new Promise<Feed>((resolve) => {
        resolvePlaceholderRefresh = resolve;
      });
    });

    const ingestPromise = plugin.ingestFeedsForBackgroundImport([
      {
        title: "Discovered feed",
        url: "https://example.com/discovered.xml",
        folder: "Discover",
      },
    ]);
    await flushMicrotasks();
    expect(mockParseFeed).not.toHaveBeenCalled();

    const refreshPromise = plugin.refreshFeeds();
    await flushMicrotasks();

    expect(mockRefreshFeed).toHaveBeenCalledWith(existingFeed, {
      signal: expect.any(AbortSignal),
    });

    resolveInitialSave?.();
    await ingestPromise;
    await flushMicrotasks();

    const importedArticle = {
      title: "Imported article",
      link: "https://example.com/discovered/article",
      description: "Imported description",
      pubDate: "2026-01-01T12:00:00.000Z",
      guid: "imported-article",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Discovered feed",
      feedUrl: "https://example.com/discovered.xml",
      coverImage: "https://example.com/discovered-cover.jpg",
    };
    resolveImport?.({
      ...createPlaceholderFeed("https://example.com/discovered.xml"),
      title: "Discovered feed",
      items: [importedArticle],
    });
    await flushMicrotasks();

    resolvePlaceholderRefresh?.({
      ...createPlaceholderFeed("https://example.com/discovered.xml"),
      title: "Discovered feed",
      items: [],
    });
    await refreshPromise;
    await vi.waitFor(
      () => {
        expect(
          (plugin as unknown as PluginWithInternal).isBackgroundImporting,
        ).toBe(false);
      },
      { timeout: 3000 },
    );

    expect(plugin.settings.feeds.find((feed) => feed.url === existingFeed.url)?.items)
      .toEqual(existingFeed.items);
    expect(
      plugin.settings.feeds.find(
        (feed) => feed.url === "https://example.com/discovered.xml",
      )?.items,
    ).toEqual([importedArticle]);
    expect(cacheUrl).toHaveBeenCalledWith(
      "https://example.com/discovered-cover.jpg",
      true,
    );
    expect(mockRefreshFeed).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/discovered.xml" }),
      expect.anything(),
    );
  });

  it("processes queued feeds with bounded concurrency", async () => {
    const plugin = createPlugin();
    const resolvers: Array<() => void> = [];

    mockParseFeed.mockImplementation(
      (url: string) =>
        new Promise((resolve) => {
          resolvers.push(() =>
            resolve({
              ...createPlaceholderFeed(url),
              title: `Parsed ${url}`,
              items: [],
            }),
          );
        }),
    );

    const feeds = Array.from({ length: MAX_CONCURRENT_FETCHES + 2 }, (_, index) =>
      createPlaceholderFeed(`https://example.com/${index}.xml`),
    );
    plugin.settings.feeds = [...feeds];

    plugin.startBackgroundImport(feeds);
    await flushPromises();

    expect(mockParseFeed).toHaveBeenCalledTimes(MAX_CONCURRENT_FETCHES);

    for (let index = 0; index < MAX_CONCURRENT_FETCHES; index += 1) {
      resolvers[index]?.();
    }
    await flushPromises();

    expect(mockParseFeed).toHaveBeenCalledTimes(MAX_CONCURRENT_FETCHES + 2);

    resolvers[MAX_CONCURRENT_FETCHES]?.();
    resolvers[MAX_CONCURRENT_FETCHES + 1]?.();

    await vi.waitFor(
      () => {
        expect((plugin as unknown as PluginWithInternal).isBackgroundImporting).toBe(false);
      },
      { timeout: 3000 },
    );

    expect(mockParseFeed).toHaveBeenCalledTimes(MAX_CONCURRENT_FETCHES + 2);
  });

  it("detaches slow feeds after the soft timeout while keeping their semaphore slots", async () => {
    vi.useFakeTimers();
    const plugin = createPlugin();
    const resolvers: Array<() => void> = [];

    mockParseFeed.mockImplementation(
      (url: string) =>
        new Promise((resolve) => {
          resolvers.push(() =>
            resolve({
              ...createPlaceholderFeed(url),
              title: `Parsed ${url}`,
              items: [],
            }),
          );
        }),
    );

    const feeds = Array.from({ length: MAX_CONCURRENT_FETCHES + 1 }, (_, index) =>
      createPlaceholderFeed(`https://example.com/${index}.xml`),
    );
    plugin.settings.feeds = [...feeds];

    plugin.startBackgroundImport(feeds);
    await flushMicrotasks();

    expect(mockParseFeed).toHaveBeenCalledTimes(MAX_CONCURRENT_FETCHES);

    await vi.advanceTimersByTimeAsync(FEED_SOFT_TIMEOUT_MS);
    await flushMicrotasks();

    expect(mockParseFeed).toHaveBeenCalledTimes(MAX_CONCURRENT_FETCHES);

    resolvers[0]?.();
    await flushMicrotasks();

    expect(mockParseFeed).toHaveBeenCalledTimes(MAX_CONCURRENT_FETCHES + 1);

    for (let index = 1; index <= MAX_CONCURRENT_FETCHES; index += 1) {
      resolvers[index]?.();
    }

    await flushMicrotasks();

    await vi.waitFor(
      () => {
        expect((plugin as unknown as PluginWithInternal).isBackgroundImporting).toBe(false);
      },
      { timeout: 3000 },
    );
  });

  it("times out a stalled feed without blocking the rest of the queue and refreshes once at completion", async () => {
    vi.useFakeTimers();
    const plugin = createPlugin();
    const renderSpy = vi.fn();
    const sidebarOnlySpy = vi.fn();
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      render: renderSpy,
      refreshSidebarOnly: sidebarOnlySpy,
    });

    mockParseFeed.mockImplementation((url: string) => {
      if (url.includes("stall")) {
        return new Promise(() => undefined);
      }
      return Promise.resolve({
        ...createPlaceholderFeed(url),
        title: `Parsed ${url}`,
        items: [],
      });
    });

    const feeds = [
      createPlaceholderFeed("https://example.com/stall.xml"),
      createPlaceholderFeed("https://example.com/ok.xml"),
    ];
    plugin.settings.feeds = [...feeds];

    plugin.startBackgroundImport(feeds);
    await vi.advanceTimersByTimeAsync(
      BACKGROUND_IMPORT_FEED_REQUEST_TIMEOUT_MS *
        (BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT + 1),
    );
    await vi.waitFor(
      () => {
        expect(plugin.saveData).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    // The single final render at completion must be a full render
    expect(renderSpy).toHaveBeenCalledTimes(1);
    // No mid-import full renders; sidebar-only path used for progress
    expect(sidebarOnlySpy).not.toHaveBeenCalled();
    expect((plugin as unknown as PluginWithInternal).isBackgroundImporting).toBe(false);
  });

  it("uses refreshSidebarOnly for mid-import progress renders and render() only once at completion", async () => {
    const plugin = createPlugin();
    const renderSpy = vi.fn();
    const sidebarOnlySpy = vi.fn();
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      render: renderSpy,
      refreshSidebarOnly: sidebarOnlySpy,
    });

    // 5 feeds: renderEvery=3 for counts < 1000, so one mid-import sidebar
    // refresh fires after feed 3, and render() fires once at completion.
    const feeds = Array.from({ length: 5 }, (_, i) =>
      createPlaceholderFeed(`https://example.com/${i}.xml`),
    );
    plugin.settings.feeds = [...feeds];

    mockParseFeed.mockImplementation((url: string) =>
      Promise.resolve({
        ...createPlaceholderFeed(url),
        title: `Parsed ${url}`,
        items: [],
      }),
    );

    plugin.startBackgroundImport(feeds);

    // Wait for the fire-and-forget import to fully complete
    await vi.waitFor(
      () => {
        expect((plugin as unknown as PluginWithInternal).isBackgroundImporting).toBe(false);
      },
      { timeout: 3000 },
    );

    // Mid-import progress renders must use refreshSidebarOnly, not render()
    expect(sidebarOnlySpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    // The final completion render must be exactly one full render
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("persists OPML ingestion in legacy mode unless import started in shard mode", async () => {
    const settings: RssDashboardSettings = {
      ...DEFAULT_SETTINGS,
      feeds: [],
      storageMode: "legacy-json",
    };

    const savedModes: Array<string> = [];
    const ensureFolderExists = vi.fn(async () => {
      // Simulate an unexpected mode flip during ingest setup.
      settings.storageMode = "vault-shards";
      return false;
    });

    const service = new BackgroundImportService({
      feedParser: {
        parseFeed: mockParseFeed,
      } as unknown as { parseFeed(url: string): Promise<Feed> },
      getSettings: () => settings,
      getView: async () => null,
      saveSettings: async () => {
        savedModes.push(settings.storageMode);
      },
      ensureFolderExists,
      addStatusBarItem: () => document.createElement("div"),
    });

    vi.spyOn(service, "startBackgroundImport").mockImplementation(() => {});

    await service.ingestFeedsForBackgroundImport([
      {
        title: "Example",
        url: "https://example.com/feed.xml",
        folder: "RSS",
      },
    ]);

    expect(ensureFolderExists).toHaveBeenCalled();
    expect(savedModes).toEqual(["legacy-json"]);
  });
});

