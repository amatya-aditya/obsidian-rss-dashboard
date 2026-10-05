/**
 * Characterization tests for the feed refresh runner in main.ts (#525).
 *
 * The refresh runner is everything between "refresh these feeds" and the
 * saved result: which feeds are eligible, the single-feed path, the bounded
 * concurrent batch, the soft and hard timeouts, merging each result into
 * settings, the failure summary, and the save, reschedule, redraw and notice
 * that follow. These tests pin what it does today, bugs included, through the
 * plugin's public surface only, so it can move into its own module (ADR 0015,
 * step 3) without these tests changing.
 *
 * The global feed operation state the runner uses (lock, progress, Stop) is
 * pinned separately in feed-operation.characterization.test.ts (#480). Every
 * fetch here is held until the test settles it, under fake timers.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import * as obsidian from "obsidian";
import { App, type MockApp, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import type { RssDashboardView } from "../../../src/views/dashboard-view";
import { FeedRefreshScheduler } from "../../../src/services/feed-refresh-scheduler";
import { PreviewImageCache } from "../../../src/services/preview-image-cache";
import {
  FEED_REQUEST_TIMEOUT_MS,
  FEED_SOFT_TIMEOUT_MS,
  MAX_CONCURRENT_FETCHES,
} from "../../../src/services/feed-timeout";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

function createManifest(app: MockApp): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "Test",
    description: "Test plugin",
    dir: `${app.vault.configDir}/plugins/rss-dashboard`,
  };
}

const RETRY_HINT = " Shift+click Refresh all feeds to retry failed feeds.";

type FetchOptions = { signal?: AbortSignal };

interface DashboardDouble {
  refreshSidebarOnly?: Mock<() => void>;
  refreshFilterStatusBarOnly?: Mock<() => void>;
  refreshGlobalRefreshProgressOnly?: Mock<() => void>;
  refresh: Mock<() => void>;
  /** Background import redraws through this when its queue drains. */
  render: Mock<() => void>;
}

interface ParserDouble {
  refreshFeed: Mock<(feed: Feed, options?: FetchOptions) => Promise<Feed>>;
  refreshAllFeeds: Mock<(feeds: Feed[]) => Promise<Feed[]>>;
  parseFeed: Mock<(url: string) => Promise<Feed>>;
}

/** A fetch the test settles by hand. Held fetches ignore their abort signal. */
interface HeldFetch {
  url: string;
  feed: Feed;
  settle: (result?: Feed) => void;
  fail: (error: Error) => void;
}

/** Plugin members the tests replace or call. All of them stay in main.ts. */
interface PluginSeams {
  feedParser: ParserDouble | undefined;
  validateSavedArticles: () => Promise<void>;
  addStatusBarItem: () => HTMLElement;
  initializeSettingsBackedServices(): void;
  ensureAutoRefreshScheduler(): FeedRefreshScheduler;
}

interface Harness {
  app: MockApp;
  plugin: RssDashboardPlugin;
  parser: ParserDouble;
  held: HeldFetch[];
  /** Validate, save, reschedule, view redraws and notices, in order. */
  events: string[];
  view: DashboardDouble;
  /** Makes `getActiveDashboardView` resolve to no view. */
  closeDashboard(): void;
  /**
   * Opens a dashboard leaf that hasn't loaded yet, so every refresh-status
   * redraw waits until the returned function is called.
   */
  holdStatusRedraws(): () => void;
}

let harnesses: Harness[] = [];
let events: string[] = [];
let debugSpy: ReturnType<typeof vi.spyOn>;

function createItem(feedUrl: string, guid: string): FeedItem {
  return {
    title: guid,
    link: `${feedUrl}#${guid}`,
    description: "",
    pubDate: "2026-09-01T00:00:00.000Z",
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: feedUrl,
    feedUrl,
    coverImage: "",
  };
}

function createFeed(name: string, overrides: Partial<Feed> = {}): Feed {
  const url = `https://example.com/${name}.xml`;
  return {
    title: `Feed ${name}`,
    url,
    folder: "",
    items: [createItem(url, `${name}-1`)],
    lastUpdated: 1,
    mediaType: "article",
    ...overrides,
  };
}

function createSettings(feeds: Feed[]): RssDashboardSettings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.storageMode = "legacy-json";
  settings.feeds = feeds;
  return settings;
}

function createDashboardDouble(): DashboardDouble {
  return {
    refreshSidebarOnly: vi.fn(() => {
      events.push("view:sidebar");
    }),
    refreshFilterStatusBarOnly: vi.fn(() => {
      events.push("view:statusbar");
    }),
    refreshGlobalRefreshProgressOnly: vi.fn(() => {
      events.push("view:progress");
    }),
    refresh: vi.fn(() => {
      events.push("view:refresh");
    }),
    render: vi.fn(() => {
      events.push("view:render");
    }),
  };
}

function createParser(held: HeldFetch[]): ParserDouble {
  return {
    refreshFeed: vi.fn(
      (feed: Feed, _options?: FetchOptions) =>
        new Promise<Feed>((resolve, reject) => {
          const fetch: HeldFetch = {
            url: feed.url,
            feed,
            settle: (result) => {
              held.splice(held.indexOf(fetch), 1);
              resolve(result ?? { ...feed, lastUpdated: 999 });
            },
            fail: (error) => {
              held.splice(held.indexOf(fetch), 1);
              reject(error);
            },
          };
          held.push(fetch);
        }),
    ),
    refreshAllFeeds: vi.fn(),
    parseFeed: vi.fn(() => new Promise<Feed>(() => {})),
  };
}

function createHarness(feeds: Feed[] = []): Harness {
  const app = App.createMock();
  const plugin = new RssDashboardPlugin(app, createManifest(app));
  const seams = plugin as unknown as PluginSeams;

  plugin.settings = createSettings(feeds);
  plugin.loadData = vi.fn().mockResolvedValue(null);
  plugin.saveData = vi.fn(() => {
    events.push("save");
    return Promise.resolve();
  });

  // Folder service, background import and the automatic-refresh scheduler,
  // as onload() builds them. The scheduler is never started.
  seams.initializeSettingsBackedServices();
  seams.ensureAutoRefreshScheduler();
  // The Plugin stub has no status bar; background import needs one.
  seams.addStatusBarItem = () => createDiv();

  const held: HeldFetch[] = [];
  const parser = createParser(held);
  seams.feedParser = parser;

  seams.validateSavedArticles = vi.fn(() => {
    events.push("validate");
    return Promise.resolve();
  });

  // The view the refresh runner redraws directly.
  const view = createDashboardDouble();
  let dashboardOpen = true;
  plugin.getActiveDashboardView = vi.fn(() =>
    Promise.resolve(
      dashboardOpen ? (view as unknown as RssDashboardView) : null,
    ),
  );

  const harness: Harness = {
    app,
    plugin,
    parser,
    held,
    events,
    view,
    closeDashboard: () => {
      dashboardOpen = false;
    },
    holdStatusRedraws: () => {
      // Views only wait for a deferred leaf to load on Obsidian 1.7.2+.
      vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
      let open: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      const leaf = { view: {}, loadIfDeferred: () => gate };
      vi.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([
        leaf,
      ] as never);
      return () => open();
    },
  };
  harnesses.push(harness);
  return harness;
}

function notices(): string[] {
  const calls = (debugSpy as unknown as { mock: { calls: unknown[][] } }).mock
    .calls;
  return calls
    .filter((call) => call[0] === "[Stub Notice]")
    .map((call) => String(call[1]));
}

/** Lets promise chains run without moving the fake clock. */
async function flush(): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    await Promise.resolve();
  }
}

function heldFetch(harness: Harness, url: string): HeldFetch {
  const fetch = harness.held.find((candidate) => candidate.url === url);
  if (!fetch) throw new Error(`No held fetch for ${url}`);
  return fetch;
}

async function settle(
  harness: Harness,
  url: string,
  result?: Feed,
): Promise<void> {
  heldFetch(harness, url).settle(result);
  await flush();
}

async function fail(
  harness: Harness,
  url: string,
  message: string,
): Promise<void> {
  heldFetch(harness, url).fail(new Error(message));
  await flush();
}

async function settleAll(harness: Harness): Promise<void> {
  for (let round = 0; round < 20 && harness.held.length > 0; round += 1) {
    for (const fetch of [...harness.held]) fetch.settle();
    await flush();
  }
}

function heldUrls(harness: Harness): string[] {
  return harness.held.map((fetch) => fetch.url);
}

function fetchedUrls(harness: Harness): string[] {
  return harness.parser.refreshFeed.mock.calls.map(([feed]) => feed.url);
}

function storedFeed(harness: Harness, url: string): Feed | undefined {
  return harness.plugin.settings.feeds.find((feed) => feed.url === url);
}

function isSettled(promise: Promise<unknown>): () => boolean {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return () => settled;
}

function url(name: string): string {
  return `https://example.com/${name}.xml`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"));
  events = [];
  debugSpy = vi
    .spyOn(console, "debug")
    .mockImplementation((label: unknown, message: unknown) => {
      if (label === "[Stub Notice]") events.push(`notice:${String(message)}`);
    });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(FeedRefreshScheduler.prototype, "reschedule").mockImplementation(
    () => {
      events.push("reschedule");
    },
  );
});

afterEach(async () => {
  // Settle every fetch still held, so the shared fetch semaphore is free for
  // the next test.
  for (const harness of harnesses) {
    await settleAll(harness);
    await vi.runOnlyPendingTimersAsync();
    await settleAll(harness);
    harness.plugin.onunload();
  }
  harnesses = [];
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.empty();
});

describe("feed refresh: which feeds refresh", () => {
  it("skips feeds excluded from refresh when refreshing all feeds", async () => {
    const harness = createHarness([
      createFeed("a"),
      createFeed("b", { excludeFromRefresh: true }),
      createFeed("c"),
    ]);

    void harness.plugin.refreshFeeds();
    await flush();

    expect(fetchedUrls(harness)).toEqual([url("a"), url("c")]);
    expect(notices()).toEqual(["Refreshing 2 feeds..."]);
  });

  it("says so, and fetches nothing, when every feed is excluded", async () => {
    const harness = createHarness([
      createFeed("a", { excludeFromRefresh: true }),
    ]);

    await harness.plugin.refreshFeeds();
    await harness.plugin.refreshFeeds([storedFeed(harness, url("a"))!]);

    expect(fetchedUrls(harness)).toEqual([]);
    expect(notices()).toEqual([
      "All feeds are excluded from refresh.",
      "All selected feeds are excluded from refresh.",
    ]);
  });

  it("does nothing, with no notice, when there are no feeds", async () => {
    const harness = createHarness([]);

    await harness.plugin.refreshFeeds();
    await harness.plugin.refreshFeeds([]);

    expect(fetchedUrls(harness)).toEqual([]);
    expect(notices()).toEqual([]);
    expect(harness.events).toEqual([]);
  });

  it("refreshes a folder and its subfolders, but not a sibling that shares its name's prefix", async () => {
    const harness = createHarness([
      createFeed("news", { folder: "News" }),
      createFeed("tech", { folder: "News/Tech" }),
      createFeed("letter", { folder: "Newsletter" }),
      createFeed("loose", { folder: "" }),
    ]);

    void harness.plugin.refreshFeedsInFolder("News");
    await flush();

    expect(fetchedUrls(harness)).toEqual([url("news"), url("tech")]);
    expect(notices()).toEqual(["Refreshing 2 feeds..."]);
    // A folder refresh is a targeted batch, which Stop can't end.
    expect(harness.plugin.isMultiFeedRefreshActive).toBe(true);
    expect(harness.plugin.isGlobalRefreshCancellable).toBe(false);
  });

  it("says so when the folder has no feeds", async () => {
    const harness = createHarness([createFeed("a", { folder: "Other" })]);

    await harness.plugin.refreshFeedsInFolder("News");

    expect(fetchedUrls(harness)).toEqual([]);
    expect(notices()).toEqual(["No feeds found in the selected folder"]);
  });

  it("says every selected feed is excluded when all of a folder's feeds are", async () => {
    const harness = createHarness([
      createFeed("a", { folder: "News", excludeFromRefresh: true }),
    ]);

    await harness.plugin.refreshFeedsInFolder("News");

    expect(fetchedUrls(harness)).toEqual([]);
    expect(notices()).toEqual([
      "All selected feeds are excluded from refresh.",
    ]);
  });

  it("retries only failed feeds that aren't excluded", async () => {
    const harness = createHarness([
      createFeed("ok"),
      createFeed("failed", { lastFetchError: "boom" }),
      createFeed("excluded", {
        lastFetchError: "boom",
        excludeFromRefresh: true,
      }),
    ]);

    void harness.plugin.refreshFailedFeeds();
    await flush();

    expect(fetchedUrls(harness)).toEqual([url("failed")]);
    expect(notices()).toEqual(["Refreshing Feed failed..."]);
  });

  it("says there's nothing to retry when the only failed feed is excluded", async () => {
    const harness = createHarness([
      createFeed("ok"),
      createFeed("excluded", {
        lastFetchError: "boom",
        excludeFromRefresh: true,
      }),
    ]);

    await harness.plugin.refreshFailedFeeds();

    expect(fetchedUrls(harness)).toEqual([]);
    expect(notices()).toEqual(["No failed feeds to retry."]);
  });

  it("refreshes a selected feed even when it's excluded from refresh", async () => {
    const harness = createHarness([
      createFeed("a", { excludeFromRefresh: true }),
    ]);

    void harness.plugin.refreshSelectedFeed(storedFeed(harness, url("a"))!);
    await flush();

    expect(fetchedUrls(harness)).toEqual([url("a")]);
    expect(notices()).toEqual(["Refreshing Feed a..."]);
  });

  it("skips a feed whose background import is still pending", async () => {
    const harness = createHarness([createFeed("a")]);
    // An import that isn't a global feed operation, so it takes no lock. Its
    // parse never settles, so the imported feed stays pending.
    await harness.plugin.ingestFeedsForBackgroundImport(
      [{ title: "Imported", url: url("imported"), folder: "" }],
      { mode: "update" },
    );
    await flush();
    expect(storedFeed(harness, url("imported"))).toBeDefined();

    void harness.plugin.refreshFeeds();
    await flush();

    expect(fetchedUrls(harness)).toEqual([url("a")]);
    expect(notices()).toContain("Refreshing Feed a...");
  });

  it("warns and does nothing else when the feed parser isn't ready", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    (harness.plugin as unknown as PluginSeams).feedParser = undefined;

    await harness.plugin.refreshFeeds();
    await harness.plugin.refreshSelectedFeed(storedFeed(harness, url("a"))!);

    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(
      "[RSS dashboard] Feed parser not initialized; skipping refresh.",
    );
    expect(notices()).toEqual([]);
    expect(harness.events).toEqual([]);
  });
});

describe("feed refresh: one feed or a batch", () => {
  it("refreshes one selected feed without taking the lock, then saves, reschedules, redraws and says so", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);

    const done = harness.plugin.refreshFeeds([storedFeed(harness, url("a"))!]);
    await flush();
    expect(harness.plugin.isMultiFeedRefreshActive).toBe(false);

    await settle(harness, url("a"));
    await done;

    expect(harness.events).toEqual([
      "notice:Refreshing Feed a...",
      "validate",
      "save",
      "reschedule",
      "reschedule",
      "view:refresh",
      "notice:Feeds refreshed: Feed a",
    ]);
    expect(harness.plugin.settings.lastGlobalRefreshCompletedAt).toBe(0);
  });

  it("refreshes one due feed on the single-feed path", async () => {
    const harness = createHarness([createFeed("a")]);

    const done = harness.plugin.refreshFeeds(
      [storedFeed(harness, url("a"))!],
      "due",
    );
    await flush();
    expect(harness.plugin.isMultiFeedRefreshActive).toBe(false);

    await settle(harness, url("a"));
    await done;

    expect(notices()).toEqual([
      "Refreshing Feed a...",
      "Feeds refreshed: Feed a",
    ]);
    expect(harness.plugin.settings.lastGlobalRefreshCompletedAt).toBe(0);
  });

  it("saves a single-feed refresh but says nothing more when no dashboard is open", async () => {
    const harness = createHarness([createFeed("a")]);
    harness.closeDashboard();

    const done = harness.plugin.refreshSelectedFeed(
      storedFeed(harness, url("a"))!,
    );
    await flush();
    await settle(harness, url("a"));
    await done;

    expect(harness.events).toEqual([
      "notice:Refreshing Feed a...",
      "validate",
      "save",
      "reschedule",
      "reschedule",
    ]);
  });

  it("refreshes a lone feed as a global batch when refreshing all feeds", async () => {
    const harness = createHarness([createFeed("a")]);

    const done = harness.plugin.refreshFeeds();
    await flush();
    expect(harness.plugin.isMultiFeedRefreshActive).toBe(true);
    expect(harness.plugin.isGlobalRefreshCancellable).toBe(true);

    await settle(harness, url("a"));
    await done;

    expect(notices()).toEqual([
      "Refreshing Feed a...",
      "Feeds refreshed: Feed a",
    ]);
    expect(harness.plugin.settings.lastGlobalRefreshCompletedAt).toBe(
      Date.now(),
    );
  });

  it("shows the error, after saving and rescheduling, when a single-feed refresh fails", async () => {
    const harness = createHarness([createFeed("a")]);

    const done = harness.plugin.refreshSelectedFeed(
      storedFeed(harness, url("a"))!,
    );
    await flush();
    await fail(harness, url("a"), "boom");
    await done;

    expect(harness.events).toEqual([
      "notice:Refreshing Feed a...",
      "save",
      "reschedule",
      "reschedule",
      "notice:Error refreshing  boom",
    ]);
    expect(storedFeed(harness, url("a"))?.lastFetchError).toBe("boom");
    expect(console.error).toHaveBeenCalledWith(
      "[RSS dashboard] Error refreshing feeds:",
      expect.any(Error),
    );
  });

  it("times a single feed out after the request timeout", async () => {
    const harness = createHarness([createFeed("a")]);

    const done = harness.plugin.refreshSelectedFeed(
      storedFeed(harness, url("a"))!,
    );
    await flush();
    await vi.advanceTimersByTimeAsync(FEED_REQUEST_TIMEOUT_MS - 1);
    expect(notices()).toEqual(["Refreshing Feed a..."]);

    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(notices()).toEqual([
      "Refreshing Feed a...",
      "Error refreshing  Timed out",
    ]);
    expect(storedFeed(harness, url("a"))?.lastFetchError).toBe("Timed out");
  });
});

describe("feed refresh: the batch", () => {
  it(`fetches at most ${MAX_CONCURRENT_FETCHES} feeds at once, and starts the next as one settles`, async () => {
    const names = Array.from(
      { length: MAX_CONCURRENT_FETCHES + 2 },
      (_, index) => `f${index}`,
    );
    const harness = createHarness(names.map((name) => createFeed(name)));

    void harness.plugin.refreshFeeds();
    await flush();
    expect(heldUrls(harness)).toEqual(
      names.slice(0, MAX_CONCURRENT_FETCHES).map(url),
    );

    await settle(harness, url("f0"));

    expect(fetchedUrls(harness)).toEqual(
      names.slice(0, MAX_CONCURRENT_FETCHES + 1).map(url),
    );
  });

  it("marks every feed pending, then processing as its fetch starts", async () => {
    const names = Array.from(
      { length: MAX_CONCURRENT_FETCHES + 1 },
      (_, index) => `f${index}`,
    );
    const harness = createHarness(names.map((name) => createFeed(name)));
    const last = url(`f${MAX_CONCURRENT_FETCHES}`);

    void harness.plugin.refreshFeeds();
    await flush();

    const state = harness.plugin.activeRefreshState;
    expect(state.size).toBe(MAX_CONCURRENT_FETCHES + 1);
    expect(state.get(url("f0"))?.status).toBe("processing");
    expect(state.get(last)?.status).toBe("pending");

    await settle(harness, url("f0"));

    expect(state.has(url("f0"))).toBe(false);
    expect(state.get(last)?.status).toBe("processing");
  });

  it("redraws the sidebar and status bar once the workers start, then progress at most every 250 ms, with no trailing redraw", async () => {
    const harness = createHarness([
      createFeed("a"),
      createFeed("b"),
      createFeed("c"),
      createFeed("d"),
    ]);

    void harness.plugin.refreshFeeds();
    await flush();
    expect(harness.events).toEqual([
      "notice:Refreshing 4 feeds...",
      "view:sidebar",
      "view:statusbar",
    ]);

    // Inside the window opened by the forced redraw: dropped.
    await settle(harness, url("a"));
    await vi.advanceTimersByTimeAsync(250);
    await settle(harness, url("b"));
    // Inside the window opened by the redraw for b: dropped, and never
    // redrawn later.
    await settle(harness, url("c"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(harness.events).toEqual([
      "notice:Refreshing 4 feeds...",
      "view:sidebar",
      "view:statusbar",
      "view:progress",
    ]);
  });

  it("falls back to a full dashboard redraw when the view can't redraw only the sidebar", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    delete harness.view.refreshSidebarOnly;

    void harness.plugin.refreshFeeds();
    await flush();

    expect(harness.events).toEqual([
      "notice:Refreshing 2 feeds...",
      "view:refresh",
    ]);
  });

  it("validates, saves, reschedules, goes idle, redraws and then says so, once every feed settles", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    let activeAtRedraw: boolean | null = null;
    harness.view.refresh.mockImplementation(() => {
      activeAtRedraw = harness.plugin.isMultiFeedRefreshActive;
      events.push("view:refresh");
    });

    const done = harness.plugin.refreshFeeds();
    await flush();
    await settle(harness, url("a"));
    await settle(harness, url("b"));
    await done;

    expect(harness.events.slice(harness.events.indexOf("validate"))).toEqual([
      "validate",
      "save",
      "reschedule",
      "reschedule",
      "view:refresh",
      "notice:Feeds refreshed: 2 feeds",
    ]);
    expect(activeAtRedraw).toBe(false);
    expect(harness.plugin.isMultiFeedRefreshActive).toBe(false);
  });

  it("detaches a feed slower than the soft timeout, keeps its fetch slot, and waits for it before saving", async () => {
    const names = Array.from(
      { length: MAX_CONCURRENT_FETCHES + 1 },
      (_, index) => `f${index}`,
    );
    const harness = createHarness(names.map((name) => createFeed(name)));
    const last = url(`f${MAX_CONCURRENT_FETCHES}`);

    const done = harness.plugin.refreshFeeds();
    const isDone = isSettled(done);
    await flush();
    await vi.advanceTimersByTimeAsync(FEED_SOFT_TIMEOUT_MS + 1);

    // Every worker gave up waiting, but the slow fetches still hold every slot.
    expect(fetchedUrls(harness)).not.toContain(last);

    for (const name of names.slice(1, MAX_CONCURRENT_FETCHES)) {
      await settle(harness, url(name));
    }
    await settle(harness, last);
    expect(isDone()).toBe(false);
    expect(harness.events).not.toContain("save");

    await settle(harness, url("f0"));
    await done;

    expect(storedFeed(harness, url("f0"))?.lastUpdated).toBe(999);
    expect(notices()).toContain(`Feeds refreshed: ${names.length} feeds`);
  });

  it("counts a feed slower than the request timeout as timed out", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);

    const done = harness.plugin.refreshFeeds();
    await flush();
    await settle(harness, url("b"));
    await vi.advanceTimersByTimeAsync(FEED_REQUEST_TIMEOUT_MS);
    await done;

    expect(storedFeed(harness, url("a"))?.lastFetchError).toBe("Timed out");
    expect(notices()).toContain(
      `Feeds refreshed: 2 feeds (1 timed out)${RETRY_HINT}`,
    );
  });

  it("summarizes timed-out and failed feeds, with the retry hint only when refreshing all feeds", async () => {
    const feeds = [createFeed("a"), createFeed("b"), createFeed("c")];
    const all = createHarness(feeds.map((feed) => structuredClone(feed)));

    const allDone = all.plugin.refreshFeeds();
    await flush();
    await fail(all, url("a"), "boom");
    await settle(all, url("b"));
    await vi.advanceTimersByTimeAsync(FEED_REQUEST_TIMEOUT_MS);
    await allDone;

    expect(notices()).toContain(
      `Feeds refreshed: 3 feeds (1 timed out, 1 failed)${RETRY_HINT}`,
    );

    const selected = createHarness(feeds.map((feed) => structuredClone(feed)));
    const selectedDone = selected.plugin.refreshFeeds([
      ...selected.plugin.settings.feeds,
    ]);
    await flush();
    await fail(selected, url("a"), "boom");
    await settle(selected, url("b"));
    await settle(selected, url("c"));
    await selectedDone;

    expect(notices()).toContain("Feeds refreshed: 3 feeds (1 failed)");
  });

  it("says only how many feeds refreshed when all succeed", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);

    const done = harness.plugin.refreshFeeds();
    await flush();
    await settleAll(harness);
    await done;

    expect(notices()).toEqual([
      "Refreshing 2 feeds...",
      "Feeds refreshed: 2 feeds",
    ]);
  });

  it("records the global refresh time only for a refresh of all feeds", async () => {
    const intents = ["targeted", "due", "failed"] as const;
    for (const intent of intents) {
      const harness = createHarness([
        createFeed("a", { lastFetchError: "old" }),
        createFeed("b", { lastFetchError: "old" }),
      ]);
      const done = harness.plugin.refreshFeeds(
        [...harness.plugin.settings.feeds],
        intent,
      );
      await flush();
      await settleAll(harness);
      await done;
      expect(harness.plugin.settings.lastGlobalRefreshCompletedAt).toBe(0);
    }

    const all = createHarness([createFeed("a"), createFeed("b")]);
    const done = all.plugin.refreshFeeds(undefined, "global");
    await flush();
    await settleAll(all);
    await done;

    expect(all.plugin.settings.lastGlobalRefreshCompletedAt).toBe(Date.now());
  });

  it("skips the dashboard redraw, but still says so, when no dashboard is open", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    harness.closeDashboard();

    const done = harness.plugin.refreshFeeds();
    await flush();
    await settleAll(harness);
    await done;

    expect(harness.events).toEqual([
      "notice:Refreshing 2 feeds...",
      "validate",
      "save",
      "reschedule",
      "reschedule",
      "notice:Feeds refreshed: 2 feeds",
    ]);
  });
});

describe("feed refresh: merging results", () => {
  it("replaces the stored feed with the result, keeping its feed ID and exclusion when the result drops them", async () => {
    const harness = createHarness([
      createFeed("a", { feedId: "id-a", excludeFromRefresh: true }),
    ]);
    const stored = storedFeed(harness, url("a"))!;

    const done = harness.plugin.refreshSelectedFeed(stored);
    await flush();
    await settle(harness, url("a"), {
      ...createFeed("a", { title: "Renamed" }),
      items: [],
      lastUpdated: 999,
    });
    await done;

    const merged = storedFeed(harness, url("a"))!;
    expect(merged).not.toBe(stored);
    expect(merged.title).toBe("Renamed");
    expect(merged.items).toEqual([]);
    expect(merged.feedId).toBe("id-a");
    expect(merged.excludeFromRefresh).toBe(true);
    expect(merged.lastRefreshAttemptCompletedAt).toBe(Date.now());
  });

  it("takes the result's feed ID and exclusion when it has them", async () => {
    const harness = createHarness([
      createFeed("a", { feedId: "id-a", excludeFromRefresh: true }),
    ]);

    const done = harness.plugin.refreshSelectedFeed(
      storedFeed(harness, url("a"))!,
    );
    await flush();
    await settle(harness, url("a"), {
      ...createFeed("a"),
      feedId: "id-new",
      excludeFromRefresh: false,
    });
    await done;

    expect(storedFeed(harness, url("a"))?.feedId).toBe("id-new");
    expect(storedFeed(harness, url("a"))?.excludeFromRefresh).toBe(false);
  });

  it("clears the feed's storage health and warms its preview images after a clean refresh", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const clearHealth = vi.spyOn(harness.plugin, "clearFeedShardHealth");
    const warmFeed = vi.spyOn(PreviewImageCache.prototype, "warmFeed");

    const done = harness.plugin.refreshFeeds();
    await flush();
    await settle(harness, url("a"));
    await settle(harness, url("b"), {
      ...createFeed("b"),
      lastFetchError: "partial",
    });
    await done;

    expect(clearHealth.mock.calls.map(([feed]) => feed.url)).toEqual([
      url("a"),
    ]);
    expect(warmFeed.mock.calls.map(([feed]) => feed.url)).toEqual([
      url("a"),
      url("b"),
    ]);
    expect(storedFeed(harness, url("b"))?.lastFetchError).toBe("partial");
  });

  it("keeps a failed feed's items and records the error and the attempt time", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const itemsBefore = structuredClone(storedFeed(harness, url("a"))!.items);

    const done = harness.plugin.refreshFeeds();
    await flush();
    await fail(harness, url("a"), "boom");
    await settle(harness, url("b"));
    await done;

    const failed = storedFeed(harness, url("a"))!;
    expect(failed.items).toEqual(itemsBefore);
    expect(failed.lastUpdated).toBe(1);
    expect(failed.lastFetchError).toBe("boom");
    expect(failed.lastRefreshAttemptCompletedAt).toBe(Date.now());
  });

  it("clears an old error when the feed refreshes cleanly", async () => {
    const harness = createHarness([createFeed("a", { lastFetchError: "old" })]);

    const done = harness.plugin.refreshSelectedFeed(
      storedFeed(harness, url("a"))!,
    );
    await flush();
    await settle(harness, url("a"), { ...createFeed("a"), lastUpdated: 999 });
    await done;

    expect(storedFeed(harness, url("a"))?.lastFetchError).toBeUndefined();
  });

  it("doesn't bring back a feed deleted while it refreshed", async () => {
    const harness = createHarness([
      createFeed("a"),
      createFeed("b"),
      createFeed("c"),
    ]);

    const done = harness.plugin.refreshFeeds();
    await flush();
    harness.plugin.settings.feeds = harness.plugin.settings.feeds.filter(
      (feed) => feed.url === url("c"),
    );
    await settle(harness, url("a"));
    await fail(harness, url("b"), "boom");
    await settle(harness, url("c"));
    await done;

    expect(harness.plugin.settings.feeds.map((feed) => feed.url)).toEqual([
      url("c"),
    ]);
    expect(storedFeed(harness, url("c"))?.lastUpdated).toBe(999);
  });

  it("reads the feed list at merge time, so a replaced settings object gets each result, matched by URL", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);

    const done = harness.plugin.refreshFeeds();
    await flush();
    harness.plugin.settings = createSettings([
      createFeed("a", { title: "Reloaded" }),
      createFeed("b"),
    ]);
    await settle(harness, url("a"));
    await fail(harness, url("b"), "boom");
    await done;

    expect(storedFeed(harness, url("a"))?.lastUpdated).toBe(999);
    expect(storedFeed(harness, url("a"))?.title).toBe("Feed a");
    expect(storedFeed(harness, url("b"))?.lastFetchError).toBe("boom");
  });

  it("refreshes through refreshAllFeeds when the parser has no refreshFeed", async () => {
    const harness = createHarness([createFeed("a")]);
    const seams = harness.plugin as unknown as PluginSeams;
    const refreshAllFeeds = vi.fn((feeds: Feed[]) =>
      Promise.resolve(feeds.map((feed) => ({ ...feed, lastUpdated: 555 }))),
    );
    seams.feedParser = {
      refreshAllFeeds,
    } as unknown as ParserDouble;

    await harness.plugin.refreshSelectedFeed(storedFeed(harness, url("a"))!);

    expect(refreshAllFeeds).toHaveBeenCalledTimes(1);
    expect(storedFeed(harness, url("a"))?.lastUpdated).toBe(555);
  });
});

describe("feed refresh: unload", () => {
  it("saves nothing and says nothing when a single-feed refresh settles after unload", async () => {
    const harness = createHarness([createFeed("a")]);

    const done = harness.plugin.refreshSelectedFeed(
      storedFeed(harness, url("a"))!,
    );
    await flush();
    harness.plugin.onunload();
    await settle(harness, url("a"));
    await done;

    expect(harness.events).toEqual(["notice:Refreshing Feed a..."]);
    expect(storedFeed(harness, url("a"))?.lastUpdated).toBe(1);
  });

  it("saves nothing and says nothing when unload lands while the single-feed refresh redraws its status", async () => {
    const harness = createHarness([createFeed("a")]);

    const done = harness.plugin.refreshSelectedFeed(
      storedFeed(harness, url("a"))!,
    );
    await flush();
    const releaseClosingRedraw = harness.holdStatusRedraws();
    await settle(harness, url("a"));
    harness.plugin.onunload();
    releaseClosingRedraw();
    await done;

    expect(harness.events).toEqual(["notice:Refreshing Feed a..."]);
  });

  it("saves nothing and says nothing when a batch drains after unload", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);

    const done = harness.plugin.refreshFeeds();
    await flush();
    // Past the progress throttle, so a redraw after unload would show.
    await vi.advanceTimersByTimeAsync(300);
    harness.plugin.onunload();
    await settleAll(harness);
    await done;

    expect(harness.events).toEqual([
      "notice:Refreshing 2 feeds...",
      "view:sidebar",
      "view:statusbar",
    ]);
    expect(storedFeed(harness, url("a"))?.lastUpdated).toBe(1);
  });

  it("starts no batch after unload", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    harness.plugin.onunload();

    await harness.plugin.refreshFeeds();

    expect(fetchedUrls(harness)).toEqual([]);
    expect(notices()).toEqual(["Refreshing 2 feeds..."]);
  });
});

describe("feed refresh: startup delay", () => {
  const RSS =
    '<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title>' +
    "<link>https://example.com</link><item><title>A</title>" +
    "<link>https://example.com/a</link><guid>https://example.com/a</guid>" +
    "<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>";

  /**
   * Loads a plugin from saved data with one feed, automatic refresh every
   * minute and a 5 s startup delay, the way the lifecycle tests do.
   */
  async function loadPlugin(): Promise<{
    plugin: RssDashboardPlugin;
    requests: ReturnType<typeof vi.spyOn>;
    commands: Map<string, () => void>;
  }> {
    vi.mocked(FeedRefreshScheduler.prototype.reschedule).mockRestore();
    const app = App.createMock();
    const store: { data: unknown } = { data: null };
    const build = () => {
      const plugin = new RssDashboardPlugin(app, createManifest(app));
      plugin.loadData = () => Promise.resolve(structuredClone(store.data));
      plugin.saveData = (data: unknown) => {
        store.data = structuredClone(data);
        return Promise.resolve();
      };
      (app.vault as unknown as { on: unknown }).on = (name: string) => ({
        name,
      });
      return plugin;
    };

    const seed = build();
    await seed.onload();
    seed.settings.refreshInterval = 1;
    seed.settings.startupRefreshDelaySeconds = 5;
    seed.settings.feeds = [
      createFeed("feed", { url: "https://example.com/feed.xml", items: [] }),
    ];
    await seed.saveSettings();
    seed.unload();

    const requests = vi.spyOn(obsidian, "requestUrl").mockImplementation((() =>
      Promise.resolve({
        status: 200,
        text: RSS,
        headers: { "content-type": "application/rss+xml" },
        arrayBuffer: new ArrayBuffer(0),
        json: {},
      })) as unknown as typeof obsidian.requestUrl);
    const plugin = build();
    const commands = new Map<string, () => void>();
    vi.spyOn(plugin, "addCommand").mockImplementation((command) => {
      if (command.callback) commands.set(command.id, command.callback);
      return command;
    });
    await plugin.onload();
    return { plugin, requests, commands };
  }

  it("refreshes automatically after the startup delay and then on the interval", async () => {
    const { plugin, requests } = await loadPlugin();

    await vi.advanceTimersByTimeAsync(5_000 + 1_000);
    const afterStartup = requests.mock.calls.length;
    expect(afterStartup).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(requests.mock.calls.length).toBeGreaterThan(afterStartup);
    plugin.unload();
  });

  it("continues refreshing automatically after a refresh during the startup delay", async () => {
    // Verified fix for #450
    const { plugin, requests, commands } = await loadPlugin();

    commands.get("refresh-feeds")?.();
    await vi.advanceTimersByTimeAsync(1_000);
    const afterManual = requests.mock.calls.length;
    expect(afterManual).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(requests.mock.calls.length).toBeGreaterThan(afterManual);
    plugin.unload();
  });
});
