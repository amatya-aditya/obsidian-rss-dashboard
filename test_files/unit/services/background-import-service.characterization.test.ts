/**
 * Characterization tests for BackgroundImportService (#1138).
 *
 * These pin the observable behavior of the background import queue before
 * `processBackgroundImportQueue` and `processBackgroundImportFeed` are split
 * into `background-import-runner.ts`. They drive the public surface only
 * (`startBackgroundImport`, `ingestFeedsForBackgroundImport`,
 * `resumePendingImports`, `isFeedPendingImport`, `isBackgroundImporting`, and
 * the public `backgroundImportQueue`), so the extraction must not need to
 * touch them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedIngestionCandidate,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import {
  BackgroundImportService,
  type BackgroundImportServiceDeps,
} from "../../../src/services/background-import-service";
import {
  BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT,
  FEED_SOFT_TIMEOUT_MS,
} from "../../../src/services/feed-timeout";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

interface ViewLike {
  render: () => void;
  refreshSidebarOnly?: () => void;
}

interface Harness {
  service: BackgroundImportService;
  settings: RssDashboardSettings;
  saveSettings: ReturnType<typeof vi.fn>;
  getView: ReturnType<typeof vi.fn>;
  parseFeed: ReturnType<typeof vi.fn>;
}

function makeSettings(feeds: Feed[] = []): RssDashboardSettings {
  return {
    ...DEFAULT_SETTINGS,
    feeds,
    media: {
      ...DEFAULT_SETTINGS.media,
      defaultYouTubeFolder: "Videos",
      defaultPodcastFolder: "Podcasts",
    },
  };
}

function makeFeed(url: string, extra: Partial<Feed> = {}): Feed {
  return {
    title: url,
    url,
    folder: "Inbox",
    items: [],
    lastUpdated: 0,
    mediaType: "article",
    ...extra,
  };
}

function makeItem(feedUrl: string, guid: string): FeedItem {
  return {
    title: `Article ${guid}`,
    link: `${feedUrl}/${guid}`,
    description: "",
    pubDate: new Date(0).toISOString(),
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: feedUrl,
    feedUrl,
    coverImage: "",
  };
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createHarness(
  options: {
    settings?: RssDashboardSettings;
    parseFeed?: (url: string) => Promise<Feed>;
    view?: ViewLike | null;
    deps?: Partial<BackgroundImportServiceDeps>;
  } = {},
): Harness {
  const settings = options.settings ?? makeSettings();
  const parseFeed = vi.fn(
    options.parseFeed ?? ((url: string) => Promise.resolve(makeFeed(url))),
  );
  const getView = vi.fn(async () => options.view ?? null);
  const saveSettings = vi.fn(async () => undefined);
  const service = new BackgroundImportService({
    feedParser: { parseFeed: (url) => parseFeed(url) },
    getSettings: () => settings,
    getView,
    saveSettings,
    ensureFolderExists: vi.fn(async () => false),
    addStatusBarItem: vi.fn(() => createDiv()),
    ...options.deps,
  });
  return { service, settings, saveSettings, getView, parseFeed };
}

describe("BackgroundImportService characterization", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("drains an ingested queue to completed and clears each feed's importPending", async () => {
    const feedA = makeFeed("https://example.com/a.xml");
    const feedB = makeFeed("https://example.com/b.xml");
    const settings = makeSettings();
    const drained = deferred();
    const harness = createHarness({
      settings,
      parseFeed: async (url) => ({
        ...makeFeed(url),
        items: [makeItem(url, "1")],
      }),
      deps: { onImportQueueDrained: () => drained.resolve() },
    });

    const candidates: FeedIngestionCandidate[] = [
      { title: "Feed A", url: feedA.url },
      { title: "Feed B", url: feedB.url },
    ];
    const result =
      await harness.service.ingestFeedsForBackgroundImport(candidates);
    // Capture the queued entries before the worker pool shifts them off.
    const queued = [...harness.service.backgroundImportQueue];
    await drained.promise;
    await vi.waitFor(() =>
      expect(harness.service.isBackgroundImporting).toBe(false),
    );

    expect(result.addedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(queued.map((feed) => feed.importStatus)).toEqual([
      "completed",
      "completed",
    ]);
    expect(settings.feeds.map((feed) => feed.items)).toHaveLength(2);
    expect(settings.feeds[0]?.items[0]?.guid).toBe("1");
    expect(
      settings.feeds.every((feed) => feed.importPending === undefined),
    ).toBe(true);
  });

  it("records a per-feed failure and keeps draining the rest of the batch", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const feedA = makeFeed("https://example.com/a.xml", {
      importPending: true,
    });
    const feedB = makeFeed("https://example.com/b.xml", {
      importPending: true,
    });
    const settings = makeSettings([feedA, feedB]);
    const drained = deferred();
    const harness = createHarness({
      settings,
      parseFeed: (url) =>
        url === feedA.url
          ? Promise.reject(new Error("Network unreachable"))
          : Promise.resolve(makeFeed(url)),
      deps: { onImportQueueDrained: () => drained.resolve() },
    });

    expect(harness.service.resumePendingImports()).toBe(2);
    const queued = [...harness.service.backgroundImportQueue];
    await drained.promise;
    await vi.waitFor(() =>
      expect(harness.service.isBackgroundImporting).toBe(false),
    );

    const [failed] = queued;
    const completed = queued[1];
    expect(failed?.importStatus).toBe("failed");
    expect(failed?.importError).toBeTruthy();
    expect(completed?.importStatus).toBe("completed");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(feedA.url),
    );
    // The failed feed stops being reported as pending import.
    expect(settings.feeds[0]?.importPending).toBeUndefined();
  });

  it("marks a feed timed_out when the parse reports a timeout", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const feed = makeFeed("https://example.com/slow.xml", {
      importPending: true,
    });
    const settings = makeSettings([feed]);
    const drained = deferred();
    const harness = createHarness({
      settings,
      parseFeed: () => Promise.reject(new Error("Timed out")),
      deps: { onImportQueueDrained: () => drained.resolve() },
    });

    harness.service.startBackgroundImport([feed]);
    const queued = [...harness.service.backgroundImportQueue];
    await drained.promise;
    await vi.waitFor(() =>
      expect(harness.service.isBackgroundImporting).toBe(false),
    );

    // BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT is 0, so a single "Timed out"
    // is the final result and the parser is called exactly once.
    expect(BACKGROUND_IMPORT_TIMEOUT_RETRY_COUNT).toBe(0);
    expect(harness.parseFeed).toHaveBeenCalledTimes(1);
    expect(queued[0]?.importStatus).toBe("timed_out");
    expect(queued[0]?.importError).toBeTruthy();
    expect(harness.service.isFeedPendingImport(feed.url)).toBe(false);
  });

  it("detaches a soft-timed-out feed but still awaits it before finishing the run", async () => {
    vi.useFakeTimers();
    const stalled = makeFeed("https://example.com/stall.xml");
    const ok = makeFeed("https://example.com/ok.xml");
    const settings = makeSettings([stalled, ok]);
    let resolveStalled: ((feed: Feed) => void) | undefined;
    const drained = deferred();
    const harness = createHarness({
      settings,
      parseFeed: (url) => {
        if (url === stalled.url) {
          return new Promise<Feed>((resolve) => {
            resolveStalled = resolve;
          });
        }
        return Promise.resolve(makeFeed(url));
      },
      deps: { onImportQueueDrained: () => drained.resolve() },
    });

    harness.service.startBackgroundImport([stalled, ok]);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.service.isBackgroundImporting).toBe(true);

    // The soft timeout detaches the stalled feed; the OK feed finishes and
    // the queue empties, but the run stays open because the detached import
    // was tracked in backgroundPromises.
    await vi.advanceTimersByTimeAsync(FEED_SOFT_TIMEOUT_MS);
    await Promise.resolve();
    expect(harness.service.isFeedPendingImport(ok.url)).toBe(false);
    expect(harness.service.isBackgroundImporting).toBe(true);

    resolveStalled?.(makeFeed(stalled.url));
    await vi.waitFor(() =>
      expect(harness.service.isBackgroundImporting).toBe(false),
    );
    expect(drained.promise).toBeDefined();
  });

  it("clears cancelled-but-never-fetched feeds so they become refreshable again", async () => {
    const feedA = makeFeed("https://example.com/a.xml", {
      importPending: true,
    });
    const feedB = makeFeed("https://example.com/b.xml", {
      importPending: true,
    });
    const settings = makeSettings([feedA, feedB]);
    const controller = new AbortController();
    const harness = createHarness({
      settings,
      deps: {
        beginGlobalOperation: () => controller.signal,
        isGlobalOperationCancelled: () => controller.signal.aborted,
      },
    });

    controller.abort();
    harness.service.startBackgroundImport([feedA, feedB]);
    await vi.waitFor(() =>
      expect(harness.service.isBackgroundImporting).toBe(false),
    );

    expect(harness.parseFeed).not.toHaveBeenCalled();
    expect(harness.service.isFeedPendingImport(feedA.url)).toBe(false);
    expect(harness.service.isFeedPendingImport(feedB.url)).toBe(false);
    expect(harness.service.backgroundImportQueue).toHaveLength(0);
    // A cancelled feed keeps its pending mark so a later load resumes it.
    expect(settings.feeds[0]?.importPending).toBe(true);
  });

  it("refuses ingestion when a global operation cannot be started", async () => {
    const harness = createHarness({
      deps: { beginGlobalOperation: () => null },
    });

    const result = await harness.service.ingestFeedsForBackgroundImport(
      [{ title: "Feed", url: "https://example.com/feed.xml" }],
      { globalOperation: true },
    );

    expect(result).toEqual({
      addedCount: 0,
      skippedCount: 0,
      queuedFeeds: [],
      refused: true,
    });
  });

  it("overwrite replaces existing feeds and folders while update merges and skips duplicates", async () => {
    const existing = makeFeed("https://example.com/existing.xml");

    const overwriteSettings = makeSettings([existing]);
    overwriteSettings.folders = [{ name: "Old", subfolders: [] }];
    const overwriteHarness = createHarness({
      settings: overwriteSettings,
      parseFeed: async (url) => makeFeed(url),
    });
    vi.spyOn(
      overwriteHarness.service,
      "startBackgroundImport",
    ).mockImplementation(() => {});

    const overwriteResult =
      await overwriteHarness.service.ingestFeedsForBackgroundImport(
        [{ title: "New", url: "https://example.com/new.xml" }],
        { mode: "overwrite", folders: [{ name: "New", subfolders: [] }] },
      );

    expect(overwriteResult.addedCount).toBe(1);
    expect(overwriteSettings.feeds.map((feed) => feed.url)).toEqual([
      "https://example.com/new.xml",
    ]);
    expect(overwriteSettings.folders).toEqual([
      { name: "New", subfolders: [] },
    ]);

    const updateSettings = makeSettings([existing]);
    const updateHarness = createHarness({
      settings: updateSettings,
      parseFeed: async (url) => makeFeed(url),
    });
    vi.spyOn(updateHarness.service, "startBackgroundImport").mockImplementation(
      () => {},
    );

    const updateResult =
      await updateHarness.service.ingestFeedsForBackgroundImport([
        { title: "Duplicate", url: existing.url },
        { title: "New", url: "https://example.com/new.xml" },
      ]);

    expect(updateResult.addedCount).toBe(1);
    expect(updateResult.skippedCount).toBe(1);
    expect(updateSettings.feeds.map((feed) => feed.url)).toEqual([
      existing.url,
      "https://example.com/new.xml",
    ]);
  });

  it("persists and renders every 5/3 processed feeds for a small queue", async () => {
    const feeds = Array.from({ length: 10 }, (_, index) =>
      makeFeed(`https://example.com/${index}.xml`),
    );
    const render = vi.fn();
    const refreshSidebarOnly = vi.fn();
    const drained = deferred();
    const harness = createHarness({
      settings: makeSettings(),
      parseFeed: async (url) => makeFeed(url),
      view: { render, refreshSidebarOnly },
      deps: { onImportQueueDrained: () => drained.resolve() },
    });

    harness.service.startBackgroundImport(feeds);
    await drained.promise;
    await vi.waitFor(() =>
      expect(harness.service.isBackgroundImporting).toBe(false),
    );

    // saveEvery 5 -> mid-run saves at 5 and 10, plus one completion save.
    expect(harness.saveSettings).toHaveBeenCalledTimes(3);
    // renderEvery 3 -> sidebar refreshes at 3, 6 and 9.
    expect(refreshSidebarOnly).toHaveBeenCalledTimes(3);
    // One full render at completion.
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("uses the 25/40 cadence band at 1000 feeds", async () => {
    const feeds = Array.from({ length: 1000 }, (_, index) =>
      makeFeed(`https://example.com/${index}.xml`),
    );
    const render = vi.fn();
    const refreshSidebarOnly = vi.fn();
    const drained = deferred();
    const harness = createHarness({
      settings: makeSettings(),
      parseFeed: async (url) => makeFeed(url),
      view: { render, refreshSidebarOnly },
      deps: { onImportQueueDrained: () => drained.resolve() },
    });

    harness.service.startBackgroundImport(feeds);
    await drained.promise;
    await vi.waitFor(() =>
      expect(harness.service.isBackgroundImporting).toBe(false),
    );

    // saveEvery 25 -> 40 mid-run saves, plus one completion save.
    expect(harness.saveSettings).toHaveBeenCalledTimes(41);
    // renderEvery 40 -> 25 sidebar refreshes, except that a feed whose count
    // is a multiple of both 25 and 40 (200, 400, ... 1000) awaits a save
    // before its render check, so the shared counter can move past the
    // multiple while it waits. At most those 5 can be skipped.
    const sidebarRefreshes = refreshSidebarOnly.mock.calls.length;
    expect(sidebarRefreshes).toBeGreaterThanOrEqual(20);
    expect(sidebarRefreshes).toBeLessThanOrEqual(25);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("uses the 100/150 cadence band and suppresses mid-import renders at 5000 feeds", async () => {
    const feeds = Array.from({ length: 5000 }, (_, index) =>
      makeFeed(`https://example.com/${index}.xml`),
    );
    const render = vi.fn();
    const refreshSidebarOnly = vi.fn();
    const drained = deferred();
    const harness = createHarness({
      settings: makeSettings(),
      parseFeed: async (url) => makeFeed(url),
      view: { render, refreshSidebarOnly },
      deps: { onImportQueueDrained: () => drained.resolve() },
    });

    harness.service.startBackgroundImport(feeds);
    await drained.promise;
    await vi.waitFor(() =>
      expect(harness.service.isBackgroundImporting).toBe(false),
    );

    // saveEvery 100 -> 50 mid-run saves, plus one completion save.
    expect(harness.saveSettings).toHaveBeenCalledTimes(51);
    // shouldRenderDuringImport is false at >= 5000 feeds.
    expect(refreshSidebarOnly).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  }, 30000);

  it("uses the 200/500 cadence band at 20000 feeds", async () => {
    const feeds = Array.from({ length: 20000 }, (_, index) =>
      makeFeed(`https://example.com/${index}.xml`),
    );
    const render = vi.fn();
    const refreshSidebarOnly = vi.fn();
    const drained = deferred();
    const harness = createHarness({
      settings: makeSettings(),
      parseFeed: async (url) => makeFeed(url),
      view: { render, refreshSidebarOnly },
      deps: { onImportQueueDrained: () => drained.resolve() },
    });

    harness.service.startBackgroundImport(feeds);
    await drained.promise;
    await vi.waitFor(() =>
      expect(harness.service.isBackgroundImporting).toBe(false),
    );

    // saveEvery 200 -> 100 mid-run saves, plus one completion save.
    expect(harness.saveSettings).toHaveBeenCalledTimes(101);
    expect(refreshSidebarOnly).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  }, 60000);
});
