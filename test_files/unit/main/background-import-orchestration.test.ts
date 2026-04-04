import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

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
  const plugin = new RssDashboardPlugin(app as any, {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    author: "Test",
    description: "Test plugin",
    dir: ".",
  } as any);

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
    const refreshSpy = vi.fn();
    plugin.getActiveDashboardView = vi.fn().mockResolvedValue({
      render: refreshSpy,
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
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect((plugin as any).isBackgroundImporting).toBe(false);
  });
});
