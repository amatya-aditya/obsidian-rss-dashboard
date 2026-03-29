import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS, type Feed, type FeedItem } from "../../../src/types/types";

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

function createMockManifest(): any {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    author: "Test",
    description: "Test plugin",
    dir: ".",
  };
}

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Test Article",
    link: "https://example.com/article",
    description: "<p>Desc</p>",
    pubDate: "2024-01-01T00:00:00.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed A",
    feedUrl: "https://example.com/a.xml",
    coverImage: "",
    ...overrides,
  };
}

function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Feed A",
    url: "https://example.com/a.xml",
    folder: "Uncategorized",
    items: [createItem()],
    lastUpdated: 1,
    mediaType: "article",
    ...overrides,
  };
}

function createPluginWithSettings(feeds: Feed[]): RssDashboardPlugin {
  const app = (App as any).createMock();
  const plugin = new RssDashboardPlugin(app as any, createMockManifest());

  plugin.settings = {
    ...DEFAULT_SETTINGS,
    feeds,
  };

  plugin.saveData = vi.fn().mockResolvedValue(undefined);

  plugin.feedParser = {
    refreshAllFeeds: vi.fn(),
  } as any;

  return plugin;
}

function getNoticeMessages(consoleLogSpy: ReturnType<typeof vi.spyOn>): string[] {
  return consoleLogSpy.mock.calls
    .filter((call) => call[0] === "[Stub Notice]")
    .map((call) => String(call[1]));
}

beforeEach(() => {
  vi.restoreAllMocks();
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("refreshFeeds() pipeline behavior", () => {
  it("refreshes all feeds, merges updates by url, validates + saves, and refreshes the active view", async () => {
    const feedA = createFeed({
      title: "Feed A",
      url: "https://example.com/a.xml",
      items: [createItem({ guid: "a-1" })],
      lastUpdated: 100,
    });
    const feedB = createFeed({
      title: "Feed B",
      url: "https://example.com/b.xml",
      items: [createItem({ guid: "b-1", feedTitle: "Feed B", feedUrl: "https://example.com/b.xml" })],
      lastUpdated: 200,
    });

    const plugin = createPluginWithSettings([feedA, feedB]);

    const updatedA = {
      ...feedA,
      lastUpdated: 999,
      items: [createItem({ guid: "a-1" }), createItem({ guid: "a-2" })],
    };

    (plugin.feedParser.refreshAllFeeds as any).mockResolvedValue([updatedA]);

    const validateSpy = vi.spyOn(plugin as any, "validateSavedArticles");
    const viewRefreshSpy = vi.fn();
    vi.spyOn(plugin, "getActiveDashboardView").mockResolvedValue({
      refresh: viewRefreshSpy,
    } as any);

    await plugin.refreshFeeds();

    const refreshArg = (plugin.feedParser.refreshAllFeeds as any).mock.calls[0][0] as Feed[];
    expect(refreshArg.map((f) => f.url)).toEqual([
      "https://example.com/a.xml",
      "https://example.com/b.xml",
    ]);

    expect(plugin.settings.feeds[0].url).toBe("https://example.com/a.xml");
    expect(plugin.settings.feeds[0].lastUpdated).toBe(999);
    expect(plugin.settings.feeds[0].items).toHaveLength(2);
    expect(plugin.settings.feeds[1].url).toBe("https://example.com/b.xml");
    expect(plugin.settings.feeds[1].lastUpdated).toBe(200);

    expect(validateSpy).toHaveBeenCalledTimes(1);
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(viewRefreshSpy).toHaveBeenCalledTimes(1);

    const notices = getNoticeMessages(consoleLogSpy);
    expect(notices[0]).toBe("Refreshing 2 feeds...");
    expect(notices).toContain("Feeds refreshed: 2 feeds");
  });

  it("refreshes only the selected feeds and does not require an active dashboard view", async () => {
    const feedA = createFeed({
      title: "Feed A",
      url: "https://example.com/a.xml",
      lastUpdated: 100,
    });
    const feedB = createFeed({
      title: "Feed B",
      url: "https://example.com/b.xml",
      lastUpdated: 200,
    });

    const plugin = createPluginWithSettings([feedA, feedB]);

    const updatedB = {
      ...feedB,
      lastUpdated: 777,
    };
    (plugin.feedParser.refreshAllFeeds as any).mockResolvedValue([updatedB]);

    vi.spyOn(plugin, "getActiveDashboardView").mockResolvedValue(null);

    await plugin.refreshFeeds([feedB]);

    const refreshArg = (plugin.feedParser.refreshAllFeeds as any).mock.calls[0][0] as Feed[];
    expect(refreshArg.map((f) => f.url)).toEqual(["https://example.com/b.xml"]);
    expect(plugin.settings.feeds[0].lastUpdated).toBe(100);
    expect(plugin.settings.feeds[1].lastUpdated).toBe(777);
    expect(plugin.saveData).toHaveBeenCalledTimes(1);

    const notices = getNoticeMessages(consoleLogSpy);
    expect(notices[0]).toBe("Refreshing Feed B...");
    expect(notices.some((m) => m.startsWith("Feeds refreshed:"))).toBe(false);
  });

  it("swallows refreshAllFeeds errors and shows an error Notice", async () => {
    const plugin = createPluginWithSettings([createFeed()]);

    (plugin.feedParser.refreshAllFeeds as any).mockRejectedValue(
      new Error("network down"),
    );

    await expect(plugin.refreshFeeds()).resolves.toBeUndefined();
    expect(plugin.saveData).not.toHaveBeenCalled();

    const notices = getNoticeMessages(consoleLogSpy);
    expect(notices[0]).toBe("Refreshing Feed A...");
    expect(notices).toContain("Error refreshing  network down");
  });
});
