import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";

interface TestManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  dir: string;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

interface TestPlugin {
  settings: RssDashboardSettings;
  feedParser: {
    refreshFeed: ReturnType<typeof vi.fn>;
    refreshAllFeeds: ReturnType<typeof vi.fn>;
  };
  saveData: ReturnType<typeof vi.fn>;
  loadData: ReturnType<typeof vi.fn>;
  refreshFeeds: (
    selectedFeeds?: Feed[],
    intent?: "global" | "targeted" | "due" | "failed",
  ) => Promise<void>;
  loadSettings: () => Promise<void>;
  getActiveDashboardView: ReturnType<typeof vi.fn>;
  validateSavedArticles: ReturnType<typeof vi.fn>;
  backupService: { performAutoBackups: ReturnType<typeof vi.fn> };
  cancelGlobalRefresh: () => void;
  onunload: () => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createFeed(url: string, lastUpdated: number): Feed {
  return {
    title: url,
    url,
    folder: "Uncategorized",
    items: [],
    lastUpdated,
    mediaType: "article",
  };
}

function createPlugin(feeds: Feed[]): TestPlugin {
  const app = new App();
  const manifest: TestManifest = {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    author: "Test",
    description: "Test plugin",
    dir: ".",
  };
  const plugin = new RssDashboardPlugin(
    app as unknown as ConstructorParameters<typeof RssDashboardPlugin>[0],
    manifest as unknown as ConstructorParameters<typeof RssDashboardPlugin>[1],
  ) as unknown as TestPlugin;

  plugin.settings = {
    ...DEFAULT_SETTINGS,
    feeds,
  };
  plugin.feedParser = {
    refreshFeed: vi.fn(),
    refreshAllFeeds: vi.fn(),
  };
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  plugin.loadData = vi.fn().mockResolvedValue(null);
  plugin.getActiveDashboardView = vi.fn().mockResolvedValue(null);
  plugin.validateSavedArticles = vi.fn().mockResolvedValue(undefined);
  plugin.backupService = {
    performAutoBackups: vi.fn().mockResolvedValue(undefined),
  };
  return plugin;
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("shared data-sync ownership", () => {
  it("waits for storage hydration before starting a feed refresh", async () => {
    const originalFeed = createFeed("https://example.com/feed.xml", 1);
    const plugin = createPlugin([originalFeed]);
    const pendingLoad = deferred<RssDashboardSettings>();
    plugin.loadData.mockReturnValue(pendingLoad.promise);
    plugin.feedParser.refreshFeed.mockResolvedValue({
      ...originalFeed,
      lastUpdated: 2,
    });

    const loadPromise = plugin.loadSettings();
    await flushMicrotasks();
    const refreshPromise = plugin.refreshFeeds([originalFeed]);
    await flushMicrotasks();

    expect(plugin.feedParser.refreshFeed).not.toHaveBeenCalled();

    pendingLoad.resolve({
      ...DEFAULT_SETTINGS,
      feeds: [createFeed("https://example.com/feed.xml", 1)],
    });
    await loadPromise;
    await refreshPromise;

    expect(plugin.settings.feeds[0].lastUpdated).toBe(2);
  });

  it("starts queued refresh work after the current refresh succeeds", async () => {
    const firstFeed = createFeed("https://example.com/first.xml", 1);
    const secondFeed = createFeed("https://example.com/second.xml", 1);
    const plugin = createPlugin([firstFeed, secondFeed]);
    const firstResult = deferred<Feed>();
    plugin.feedParser.refreshFeed
      .mockReturnValueOnce(firstResult.promise)
      .mockResolvedValueOnce({ ...secondFeed, lastUpdated: 2 });

    const firstRefresh = plugin.refreshFeeds([firstFeed]);
    await flushMicrotasks();
    const secondRefresh = plugin.refreshFeeds([secondFeed]);
    await flushMicrotasks();

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(1);

    firstResult.resolve({ ...firstFeed, lastUpdated: 2 });
    await firstRefresh;
    await secondRefresh;

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(2);
    expect(plugin.settings.feeds.map((feed) => feed.lastUpdated)).toEqual([
      2, 2,
    ]);
  });

  it("does not make a second multi-feed refresh wait and rerun", async () => {
    const firstFeed = createFeed("https://example.com/first.xml", 1);
    const secondFeed = createFeed("https://example.com/second.xml", 1);
    const plugin = createPlugin([firstFeed, secondFeed]);
    const firstResult = deferred<Feed>();
    const secondResult = deferred<Feed>();
    plugin.feedParser.refreshFeed
      .mockReturnValueOnce(firstResult.promise)
      .mockReturnValueOnce(secondResult.promise);

    const currentRefresh = plugin.refreshFeeds();
    let overlappingRefreshCompleted = false;
    const overlappingRefresh = plugin.refreshFeeds().then(() => {
      overlappingRefreshCompleted = true;
    });
    await flushMicrotasks();

    expect(overlappingRefreshCompleted).toBe(true);
    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(2);

    plugin.cancelGlobalRefresh();
    firstResult.resolve({ ...firstFeed, lastUpdated: 2 });
    secondResult.resolve({ ...secondFeed, lastUpdated: 2 });
    await currentRefresh;
    await overlappingRefresh;

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(2);
  });

  it("does not retain ownership while completing view work", async () => {
    const firstFeed = createFeed("https://example.com/first.xml", 1);
    const secondFeed = createFeed("https://example.com/second.xml", 1);
    const plugin = createPlugin([firstFeed, secondFeed]);
    const pendingView = deferred<null>();
    plugin.getActiveDashboardView.mockReturnValueOnce(pendingView.promise);
    plugin.feedParser.refreshFeed
      .mockResolvedValueOnce({ ...firstFeed, lastUpdated: 2 })
      .mockResolvedValueOnce({ ...secondFeed, lastUpdated: 2 });

    const firstRefresh = plugin.refreshFeeds([firstFeed]);
    await flushMicrotasks();
    const secondRefresh = plugin.refreshFeeds([secondFeed]);
    await flushMicrotasks();

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(2);

    pendingView.resolve(null);
    await firstRefresh;
    await secondRefresh;
  });

  it("starts queued refresh work after the current refresh fails", async () => {
    const firstFeed = createFeed("https://example.com/first.xml", 1);
    const secondFeed = createFeed("https://example.com/second.xml", 1);
    const plugin = createPlugin([firstFeed, secondFeed]);
    const firstResult = deferred<Feed>();
    plugin.feedParser.refreshFeed
      .mockReturnValueOnce(firstResult.promise)
      .mockResolvedValueOnce({ ...secondFeed, lastUpdated: 2 });

    const firstRefresh = plugin.refreshFeeds([firstFeed]);
    await flushMicrotasks();
    const secondRefresh = plugin.refreshFeeds([secondFeed]);
    await flushMicrotasks();

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(1);

    firstResult.reject(new Error("network down"));
    await firstRefresh;
    await secondRefresh;

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(2);
    expect(plugin.settings.feeds[1].lastUpdated).toBe(2);
  });

  it("starts queued refresh work after the current refresh is cancelled", async () => {
    const firstFeed = createFeed("https://example.com/first.xml", 1);
    const secondFeed = createFeed("https://example.com/second.xml", 1);
    const plugin = createPlugin([firstFeed, secondFeed]);
    const firstResult = deferred<Feed>();
    const secondResult = deferred<Feed>();
    plugin.feedParser.refreshFeed
      .mockReturnValueOnce(firstResult.promise)
      .mockReturnValueOnce(secondResult.promise)
      .mockResolvedValueOnce({ ...secondFeed, lastUpdated: 3 });

    const currentRefresh = plugin.refreshFeeds();
    await flushMicrotasks();
    const queuedRefresh = plugin.refreshFeeds([secondFeed]);
    await flushMicrotasks();

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(2);

    plugin.cancelGlobalRefresh();
    await vi.waitFor(() => {
      expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(3);
    });
    await queuedRefresh;

    expect(plugin.settings.feeds.map((feed) => feed.lastUpdated)).toEqual([
      1, 3,
    ]);

    firstResult.resolve({ ...firstFeed, lastUpdated: 2 });
    secondResult.resolve({ ...secondFeed, lastUpdated: 2 });
    await currentRefresh;

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(3);
    expect(plugin.settings.feeds.map((feed) => feed.lastUpdated)).toEqual([
      1, 3,
    ]);
  });

  it("does not release cancellation ownership while persistence is in flight", async () => {
    const firstFeed = createFeed("https://example.com/first.xml", 1);
    const secondFeed = createFeed("https://example.com/second.xml", 1);
    const plugin = createPlugin([firstFeed, secondFeed]);
    const pendingSave = deferred<void>();
    plugin.saveData
      .mockReturnValueOnce(pendingSave.promise)
      .mockResolvedValue(undefined);
    plugin.feedParser.refreshFeed
      .mockResolvedValueOnce({ ...firstFeed, lastUpdated: 2 })
      .mockResolvedValueOnce({ ...secondFeed, lastUpdated: 2 });

    const currentRefresh = plugin.refreshFeeds([firstFeed], "global");
    await vi.waitFor(() => expect(plugin.saveData).toHaveBeenCalledOnce());
    plugin.cancelGlobalRefresh();
    const queuedRefresh = plugin.refreshFeeds([secondFeed]);
    await flushMicrotasks();

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(1);

    pendingSave.resolve();
    await currentRefresh;
    await queuedRefresh;

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(2);
    expect(plugin.settings.feeds[1].lastUpdated).toBe(2);
  });

  it("does not start queued work or persist a late result after plugin unload", async () => {
    const activeFeed = createFeed("https://example.com/active.xml", 1);
    const queuedFeed = createFeed("https://example.com/queued.xml", 1);
    const plugin = createPlugin([activeFeed, queuedFeed]);
    const lateResult = deferred<Feed>();
    plugin.feedParser.refreshFeed.mockReturnValue(lateResult.promise);

    const refreshPromise = plugin.refreshFeeds([activeFeed]);
    await flushMicrotasks();
    const queuedPromise = plugin.refreshFeeds([queuedFeed]);
    await flushMicrotasks();
    plugin.onunload();
    lateResult.resolve({ ...activeFeed, lastUpdated: 2 });
    await refreshPromise;
    await queuedPromise;

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledTimes(1);
    expect(plugin.settings.feeds.map((feed) => feed.lastUpdated)).toEqual([
      1, 1,
    ]);
    expect(plugin.saveData).not.toHaveBeenCalled();
  });
});
