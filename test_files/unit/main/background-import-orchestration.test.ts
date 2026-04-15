import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { BackgroundImportService } from "../../../src/services/background-import-service";

const mockParseFeed = vi.fn();

vi.mock("../../../src/services/feed-parser", () => ({
  FeedParser: class FeedParser {
    parseFeed = mockParseFeed;
    refreshAllFeeds = vi.fn();
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

vi.mock("../../../src/utils/settings-migration", () => ({
  migrateDisplaySettings: vi.fn(),
  migrateDefaultFilterToDashboardMultiFilters: vi.fn(),
  migrateKeywordRulesSettings: vi.fn().mockReturnValue(false),
}));

import RssDashboardPlugin from "../../../main";

function createPlugin(): RssDashboardPlugin {
  const app = (App as any).createMock();
  const plugin = new RssDashboardPlugin(
    app as any,
    {
      id: "rss-dashboard",
      name: "RSS Dashboard",
      version: "1.0.0",
      author: "Test",
      description: "Test plugin",
      dir: ".",
    } as any,
  );

  plugin.settings = {
    ...DEFAULT_SETTINGS,
    feeds: [],
  };
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  plugin.addStatusBarItem = vi.fn(() => document.body.createDiv());
  plugin.feedParser = {
    parseFeed: mockParseFeed,
    refreshAllFeeds: vi.fn(),
  } as any;

  // Initialize BackgroundImportService (normally done in onload)
  (plugin as any).backgroundImportService = new BackgroundImportService({
    feedParser: plugin.feedParser,
    getSettings: () => plugin.settings,
    getView: () => plugin.getActiveDashboardView(),
    saveSettings: () => plugin.saveSettings(),
    ensureFolderExists: vi.fn().mockResolvedValue(false),
    addStatusBarItem: () => (plugin.addStatusBarItem as any)(),
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

describe("background import orchestration", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    mockParseFeed.mockReset();
  });

  it("processes queued feeds with bounded concurrency of 4", async () => {
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

    const feeds = Array.from({ length: 6 }, (_, index) =>
      createPlaceholderFeed(`https://example.com/${index}.xml`),
    );
    plugin.settings.feeds = [...feeds];

    plugin.startBackgroundImport(feeds);
    await flushPromises();

    expect(mockParseFeed).toHaveBeenCalledTimes(4);

    resolvers[0]?.();
    resolvers[1]?.();
    await flushPromises();

    expect(mockParseFeed).toHaveBeenCalledTimes(6);
  });

  it("times out a stalled feed without blocking the rest of the queue and refreshes once at completion", async () => {
    vi.useFakeTimers();
    const plugin = createPlugin();
    const renderSpy = vi.fn();
    const sidebarOnlySpy = vi.fn();
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      render: renderSpy,
      refreshSidebarOnly: sidebarOnlySpy,
    } as any);

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
    await vi.advanceTimersByTimeAsync(15000);
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.saveData).toHaveBeenCalled();
    // The single final render at completion must be a full render
    expect(renderSpy).toHaveBeenCalledTimes(1);
    // No mid-import full renders; sidebar-only path used for progress
    expect(sidebarOnlySpy).not.toHaveBeenCalled();
    expect((plugin as any).isBackgroundImporting).toBe(false);
  });

  it("uses refreshSidebarOnly for mid-import progress renders and render() only once at completion", async () => {
    const plugin = createPlugin();
    const renderSpy = vi.fn();
    const sidebarOnlySpy = vi.fn();
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      render: renderSpy,
      refreshSidebarOnly: sidebarOnlySpy,
    } as any);

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
        expect((plugin as any).isBackgroundImporting).toBe(false);
      },
      { timeout: 3000 },
    );

    // Mid-import progress renders must use refreshSidebarOnly, not render()
    expect(sidebarOnlySpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    // The final completion render must be exactly one full render
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
