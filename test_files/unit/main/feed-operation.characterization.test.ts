/**
 * Characterization tests for the global feed operation in main.ts (#480).
 *
 * A global feed operation is the one cancellable, progress-tracked operation
 * over many feeds at a time: a refresh batch, a background import, or a
 * Discover or OPML add started with `globalOperation`. These tests pin what the
 * plugin does with that state today, bugs included, through its public surface
 * only, so the state can move into its own module (ADR 0015, step 2) without
 * these tests changing.
 *
 * Refresh-status redraws are observed on an open dashboard leaf: a full status
 * redraw updates the sidebar and then the filter status bar, a sidebar redraw
 * only the sidebar. The refresh runner's own redraws go to a separate view,
 * returned by `getActiveDashboardView`, so the two never mix. Every fetch is
 * held until the test settles it.
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
import {
  RssDashboardView,
  RSS_DASHBOARD_VIEW_TYPE,
} from "../../../src/views/dashboard-view";
import { FeedRefreshScheduler } from "../../../src/services/feed-refresh-scheduler";
import { FEED_REQUEST_TIMEOUT_MS } from "../../../src/services/feed-timeout";
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

const BUSY_OPERATION_NOTICE = "A feed operation is already in progress.";
const BUSY_REFRESH_NOTICE = "A multi-feed refresh is already in progress.";
const STOPPED_NOTICE = "Refresh stopped.";

type ViewCall = "sidebar" | "statusbar" | "progress" | "refresh" | "render";
type StatusRedraw = "full" | "sidebar";
type FetchOptions = { signal?: AbortSignal; allowEmpty?: boolean };

interface DashboardDouble {
  refreshSidebarOnly: Mock<() => void>;
  refreshFilterStatusBarOnly: Mock<() => void>;
  refreshGlobalRefreshProgressOnly: Mock<() => void>;
  refresh: Mock<() => void>;
  render: Mock<() => void>;
}

interface ParserDouble {
  refreshFeed: Mock<(feed: Feed, options?: FetchOptions) => Promise<Feed>>;
  parseFeed: Mock<
    (
      url: string,
      existing?: Feed | null,
      options?: FetchOptions,
    ) => Promise<Feed>
  >;
  refreshAllFeeds: Mock<(feeds: Feed[]) => Promise<Feed[]>>;
}

/** A fetch the test settles by hand. Held fetches ignore their abort signal. */
interface HeldFetch {
  url: string;
  signal?: AbortSignal;
  settle: () => void;
  fail: (error: Error) => void;
}

/** Plugin members the tests replace or call. All of them stay in main.ts. */
interface PluginSeams {
  feedParser: ParserDouble;
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
  /** What the dashboard leaf was asked to redraw, in order. */
  statusCalls: ViewCall[];
  /** The view `getActiveDashboardView` returns to the refresh runner. */
  contentView: DashboardDouble;
  contentCalls: ViewCall[];
  validateSavedArticles: Mock<() => Promise<void>>;
  /** Re-installs the test parser after the plugin rebuilds its services. */
  useTestParser(): void;
  /** Holds every status redraw until the returned function is called. */
  holdStatusRedraws(): () => void;
}

let harnesses: Harness[] = [];
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

function parsedFeed(url: string): Feed {
  return {
    title: "Parsed feed",
    url,
    folder: "",
    items: [],
    lastUpdated: 1,
    mediaType: "article",
  };
}

function createSettings(feeds: Feed[]): RssDashboardSettings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.storageMode = "legacy-json";
  settings.feeds = feeds;
  return settings;
}

function createDashboardDouble(calls: ViewCall[]): DashboardDouble {
  return {
    refreshSidebarOnly: vi.fn(() => {
      calls.push("sidebar");
    }),
    refreshFilterStatusBarOnly: vi.fn(() => {
      calls.push("statusbar");
    }),
    refreshGlobalRefreshProgressOnly: vi.fn(() => {
      calls.push("progress");
    }),
    refresh: vi.fn(() => {
      calls.push("refresh");
    }),
    render: vi.fn(() => {
      calls.push("render");
    }),
  };
}

function createParser(held: HeldFetch[]): ParserDouble {
  const hold = (url: string, result: Feed, signal?: AbortSignal) =>
    new Promise<Feed>((resolve, reject) => {
      const fetch: HeldFetch = {
        url,
        signal,
        settle: () => {
          held.splice(held.indexOf(fetch), 1);
          resolve(result);
        },
        fail: (error) => {
          held.splice(held.indexOf(fetch), 1);
          reject(error);
        },
      };
      held.push(fetch);
    });
  return {
    refreshFeed: vi.fn((feed: Feed, options?: FetchOptions) =>
      hold(feed.url, { ...feed, lastUpdated: 999 }, options?.signal),
    ),
    parseFeed: vi.fn(
      (url: string, _existing?: Feed | null, options?: FetchOptions) =>
        hold(url, parsedFeed(url), options?.signal),
    ),
    refreshAllFeeds: vi.fn(),
  };
}

function createHarness(feeds: Feed[] = []): Harness {
  const app = App.createMock();
  const plugin = new RssDashboardPlugin(app, createManifest(app));
  const seams = plugin as unknown as PluginSeams;

  plugin.settings = createSettings(feeds);
  plugin.loadData = vi.fn().mockResolvedValue(null);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);

  // Folder service, background import and the automatic-refresh scheduler,
  // as onload() builds them. The scheduler is never started.
  seams.initializeSettingsBackedServices();
  seams.ensureAutoRefreshScheduler();
  // The Plugin stub has no status bar; background import needs one.
  seams.addStatusBarItem = () => createDiv();

  const held: HeldFetch[] = [];
  const parser = createParser(held);
  const useTestParser = (): void => {
    seams.feedParser = parser;
  };
  useTestParser();

  const validateSavedArticles = vi.fn(() => Promise.resolve());
  seams.validateSavedArticles = validateSavedArticles;

  // The open dashboard leaf that refresh-status redraws reach.
  const statusCalls: ViewCall[] = [];
  const statusView = Object.assign(
    Object.create(RssDashboardView.prototype) as RssDashboardView,
    createDashboardDouble(statusCalls),
  );
  let gate: Promise<void> | null = null;
  let openGate = (): void => {};
  const leaf = {
    view: statusView,
    loadIfDeferred: () => gate ?? Promise.resolve(),
  };
  vi.spyOn(app.workspace, "getLeavesOfType").mockImplementation(((
    type: string,
  ) => (type === RSS_DASHBOARD_VIEW_TYPE ? [leaf] : [])) as never);

  // The view the refresh runner redraws directly.
  const contentCalls: ViewCall[] = [];
  const contentView = createDashboardDouble(contentCalls);
  plugin.getActiveDashboardView = vi
    .fn()
    .mockResolvedValue(contentView as unknown as RssDashboardView);

  const harness: Harness = {
    app,
    plugin,
    parser,
    held,
    statusCalls,
    contentView,
    contentCalls,
    validateSavedArticles,
    useTestParser,
    holdStatusRedraws: () => {
      // Views only wait for a deferred leaf to load on Obsidian 1.7.2+.
      vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
      gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
      return () => {
        gate = null;
        openGate();
      };
    },
  };
  harnesses.push(harness);
  return harness;
}

/** Status redraws the dashboard leaf received, oldest first. */
function statusRedraws(harness: Harness): StatusRedraw[] {
  const redraws: StatusRedraw[] = [];
  const calls = harness.statusCalls;
  for (let index = 0; index < calls.length; index += 1) {
    if (calls[index] !== "sidebar") continue;
    if (calls[index + 1] === "statusbar") {
      redraws.push("full");
      index += 1;
    } else {
      redraws.push("sidebar");
    }
  }
  return redraws;
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

async function until(check: () => boolean): Promise<void> {
  for (let index = 0; index < 1000 && !check(); index += 1) {
    await Promise.resolve();
  }
  expect(check()).toBe(true);
}

function heldFetch(harness: Harness, url: string): HeldFetch {
  const fetch = harness.held.find((candidate) => candidate.url === url);
  if (!fetch) throw new Error(`No held fetch for ${url}`);
  return fetch;
}

async function settle(harness: Harness, url: string): Promise<void> {
  heldFetch(harness, url).settle();
  await flush();
}

function heldUrls(harness: Harness): string[] {
  return harness.held.map((fetch) => fetch.url);
}

function fetchedUrls(fetch: Mock<(...args: never[]) => unknown>): string[] {
  return fetch.mock.calls.map((call) => {
    const [target] = call as unknown[];
    return typeof target === "string" ? target : (target as Feed).url;
  });
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

/** A plain add, or a Discover-style one with `globalOperation`. */
function addFeed(
  plugin: RssDashboardPlugin,
  url: string,
  options?: { showNotice?: boolean; globalOperation?: boolean },
): Promise<boolean> {
  return plugin.addFeed(
    "Added feed",
    url,
    "",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options,
  );
}

function spyOnDeferral() {
  return vi.spyOn(FeedRefreshScheduler.prototype, "deferGlobalRefresh");
}

beforeEach(() => {
  vi.useFakeTimers();
  debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  // Settle every fetch still held, so the shared fetch semaphore is free for
  // the next test.
  for (const harness of harnesses) {
    for (let round = 0; round < 20; round += 1) {
      await flush();
      if (harness.held.length === 0) break;
      for (const fetch of [...harness.held]) fetch.settle();
    }
    await flush();
    harness.plugin.onunload();
  }
  harnesses = [];
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.empty();
});

describe("global feed operation: idle", () => {
  it("exposes cancelGlobalRefresh as a method on the plugin", () => {
    const { plugin } = createHarness([createFeed("a")]);

    expect(typeof plugin.cancelGlobalRefresh).toBe("function");
  });

  it("reports isGlobalRefreshCancellable as false before a refresh starts", () => {
    const { plugin } = createHarness([createFeed("a")]);

    expect(plugin.isGlobalRefreshCancellable).toBe(false);
  });

  it("reports no running operation, no feed status and no progress", () => {
    const { plugin } = createHarness([createFeed("a")]);

    expect(plugin.isMultiFeedRefreshActive).toBe(false);
    expect(plugin.activeRefreshState.size).toBe(0);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 0 });
  });

  it("ignores Stop when nothing is running: no deferral and no notice", () => {
    const { plugin } = createHarness([createFeed("a")]);
    const deferral = spyOnDeferral();

    plugin.cancelGlobalRefresh();

    expect(deferral).not.toHaveBeenCalled();
    expect(notices()).toEqual([]);
  });
});

describe("global feed operation: refresh-all batch", () => {
  it("reports isGlobalRefreshCancellable as true during a multi-feed global refresh", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const { plugin } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();

    expect(plugin.isMultiFeedRefreshActive).toBe(true);
    expect(plugin.isGlobalRefreshCancellable).toBe(true);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 2 });

    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
  });

  it("keeps a one-feed global refresh cancellable", async () => {
    const harness = createHarness([createFeed("only")]);
    const { plugin, parser } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();

    expect(plugin.isGlobalRefreshCancellable).toBe(true);
    expect(parser.refreshFeed.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    plugin.cancelGlobalRefresh();
    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
  });

  it("tracks globalRefreshProgress as feeds complete during a global refresh", async () => {
    const feeds = [createFeed("a"), createFeed("b"), createFeed("c")];
    const harness = createHarness(feeds);
    const { plugin } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 3 });

    await settle(harness, feeds[0].url);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 1, total: 3 });

    await settle(harness, feeds[1].url);
    await settle(harness, feeds[2].url);
    await refresh;

    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 0 });
  });

  it("counts a feed whose fetch fails as settled", async () => {
    const feeds = [createFeed("a"), createFeed("b")];
    const harness = createHarness(feeds);
    const { plugin } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();
    heldFetch(harness, feeds[0].url).fail(new Error("network down"));
    await flush();

    expect(plugin.globalRefreshProgress).toEqual({ completed: 1, total: 2 });

    await settle(harness, feeds[1].url);
    await refresh;
    expect(notices()).toContain(
      "Feeds refreshed: 2 feeds (1 failed) Shift+click Refresh all feeds to retry failed feeds.",
    );
  });

  it("marks every feed pending when the batch starts, and processing once its fetch begins", async () => {
    // One more feed than the fetch limit (8), so the last one has to wait.
    const feeds = Array.from({ length: 9 }, (_, index) =>
      createFeed(`feed-${index}`),
    );
    const harness = createHarness(feeds);
    const { plugin } = harness;

    const refresh = plugin.refreshFeeds();

    expect(
      feeds.map((feed) => plugin.activeRefreshState.get(feed.url)?.status),
    ).toEqual(Array(9).fill("pending"));

    await flush();
    expect(
      feeds.map((feed) => plugin.activeRefreshState.get(feed.url)?.status),
    ).toEqual([...Array(8).fill("processing"), "pending"]);

    await settle(harness, feeds[0].url);
    expect(plugin.activeRefreshState.has(feeds[0].url)).toBe(false);
    expect(plugin.activeRefreshState.get(feeds[8].url)?.status).toBe(
      "processing",
    );

    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
  });

  it("updates per-feed refresh status while other batch feeds are still active", async () => {
    const first = createFeed("first");
    const second = createFeed("second");
    const harness = createHarness([first, second]);
    const { plugin } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();
    await vi.advanceTimersByTimeAsync(250);

    expect(statusRedraws(harness)).toEqual(["sidebar"]);
    expect(plugin.activeRefreshState.has(first.url)).toBe(true);
    expect(plugin.activeRefreshState.has(second.url)).toBe(true);

    await settle(harness, first.url);

    expect(plugin.activeRefreshState.has(first.url)).toBe(false);
    expect(plugin.activeRefreshState.has(second.url)).toBe(true);
    expect(statusRedraws(harness)).toEqual(["sidebar"]);

    await vi.advanceTimersByTimeAsync(250);

    expect(statusRedraws(harness)).toEqual(["sidebar", "sidebar"]);

    await settle(harness, second.url);
    await refresh;
  });

  it("drops feed status left over from earlier work when the batch starts", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const { plugin } = harness;
    plugin.activeRefreshState.set("https://example.com/stale.xml", {
      status: "processing",
      startedAt: 1,
    });

    const refresh = plugin.refreshFeeds();

    expect(plugin.activeRefreshState.has("https://example.com/stale.xml")).toBe(
      false,
    );

    await flush();
    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
  });

  it("does not redraw the refresh status when the batch starts", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);

    const refresh = harness.plugin.refreshFeeds();
    await flush();

    expect(statusRedraws(harness)).toEqual([]);
    // The runner's own first redraw goes to the dashboard it refreshes.
    expect(harness.contentCalls).toEqual(["sidebar", "statusbar"]);

    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
  });

  it("goes idle before the final dashboard redraw, and resets progress and redraws the status after it", async () => {
    const feeds = [createFeed("a"), createFeed("b")];
    const harness = createHarness(feeds);
    const { plugin, contentView } = harness;
    let atFinalRedraw: unknown;
    contentView.refresh.mockImplementation(() => {
      atFinalRedraw = {
        running: plugin.isMultiFeedRefreshActive,
        cancellable: plugin.isGlobalRefreshCancellable,
        feedStatus: plugin.activeRefreshState.size,
        progress: plugin.globalRefreshProgress,
      };
    });

    const refresh = plugin.refreshFeeds();
    await flush();
    for (const feed of feeds) await settle(harness, feed.url);
    await refresh;

    expect(atFinalRedraw).toEqual({
      running: false,
      cancellable: false,
      feedStatus: 0,
      progress: { completed: 2, total: 2 },
    });
    expect(plugin.isMultiFeedRefreshActive).toBe(false);
    expect(plugin.isGlobalRefreshCancellable).toBe(false);
    expect(plugin.activeRefreshState.size).toBe(0);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 0 });
    expect(statusRedraws(harness).slice(-1)).toEqual(["full"]);
    expect(notices()).toContain("Feeds refreshed: 2 feeds");
  });

  it("waits for the closing status redraw before the refresh finishes", async () => {
    const feeds = [createFeed("a"), createFeed("b")];
    const harness = createHarness(feeds);
    const release = harness.holdStatusRedraws();

    const refresh = harness.plugin.refreshFeeds();
    const finished = isSettled(refresh);
    await flush();
    for (const feed of feeds) await settle(harness, feed.url);
    await flush();

    expect(finished()).toBe(false);
    expect(harness.plugin.isMultiFeedRefreshActive).toBe(false);

    release();
    await until(finished);
  });

  it("refuses a second multi-feed refresh while one runs", async () => {
    const feeds = [createFeed("a"), createFeed("b")];
    const harness = createHarness(feeds);
    const { plugin, parser } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();
    await plugin.refreshFeeds([createFeed("c"), createFeed("d")]);

    expect(notices()).toContain(BUSY_REFRESH_NOTICE);
    expect(notices()).not.toContain(BUSY_OPERATION_NOTICE);
    expect(parser.refreshFeed).toHaveBeenCalledTimes(2);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 2 });
    expect([...plugin.activeRefreshState.keys()]).toEqual(
      feeds.map((feed) => feed.url),
    );

    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
  });

  it("times out a stalled feed without blocking the rest of a multi-feed refresh", async () => {
    const stalled = createFeed("a", { title: "Feed A", lastUpdated: 100 });
    const quick = createFeed("b", { title: "Feed B", lastUpdated: 200 });
    const harness = createHarness([stalled, quick]);
    const { plugin, contentView } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();
    await settle(harness, quick.url);
    await vi.advanceTimersByTimeAsync(FEED_REQUEST_TIMEOUT_MS);
    await refresh;

    expect(plugin.settings.feeds[0].lastUpdated).toBe(100);
    expect(plugin.settings.feeds[1].lastUpdated).toBe(999);
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(contentView.refreshSidebarOnly).toHaveBeenCalledTimes(1);
    expect(contentView.refresh).toHaveBeenCalledTimes(1);
    expect(plugin.activeRefreshState.size).toBe(0);

    expect(notices()[0]).toBe("Refreshing 2 feeds...");
    expect(notices()).toContain(
      "Feeds refreshed: 2 feeds (1 timed out) Shift+click Refresh all feeds to retry failed feeds.",
    );
  });

  it("completes normally without cancellation, updating lastGlobalRefreshCompletedAt", async () => {
    const feedA = createFeed("a", { lastUpdated: 100 });
    const feedB = createFeed("b", { lastUpdated: 200 });
    const harness = createHarness([feedA, feedB]);
    const { plugin } = harness;
    vi.spyOn(Date, "now").mockReturnValue(5_000);

    const refresh = plugin.refreshFeeds();
    await flush();

    expect(plugin.isGlobalRefreshCancellable).toBe(true);

    await settle(harness, feedA.url);
    await settle(harness, feedB.url);
    await refresh;

    expect(plugin.settings.feeds[0].lastUpdated).toBe(999);
    expect(plugin.settings.feeds[1].lastUpdated).toBe(999);
    expect(plugin.settings.lastGlobalRefreshCompletedAt).toBe(5_000);

    expect(notices()).toContain("Refreshing 2 feeds...");
    expect(notices()).toContain("Feeds refreshed: 2 feeds");
    expect(notices()).not.toContain(STOPPED_NOTICE);
  });
});

describe("global feed operation: batches Stop cannot end (targeted, due, retry failed)", () => {
  it("does not offer cancellation for due refresh intent", async () => {
    const feeds = [createFeed("a"), createFeed("b")];
    const harness = createHarness(feeds);
    const { plugin, parser } = harness;

    const refresh = plugin.refreshFeeds(feeds, "due");
    await flush();

    expect(plugin.isGlobalRefreshCancellable).toBe(false);
    expect(parser.refreshFeed.mock.calls[0]?.[1]).toEqual({
      signal: expect.any(AbortSignal),
    });

    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
  });

  it("does not offer cancellation for retry-failed refresh intent", async () => {
    const harness = createHarness([
      createFeed("failed-1", { lastFetchError: "network down" }),
      createFeed("failed-2", { lastFetchError: "network down" }),
    ]);
    const { plugin } = harness;

    const refresh = plugin.refreshFailedFeeds();
    await flush();

    expect(plugin.isGlobalRefreshCancellable).toBe(false);

    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
  });

  it("runs a targeted multi-feed refresh as an operation that Stop leaves alone", async () => {
    const feeds = [createFeed("a"), createFeed("b")];
    const harness = createHarness(feeds);
    const { plugin, parser } = harness;
    const deferral = spyOnDeferral();

    const refresh = plugin.refreshFeeds(feeds);
    await flush();

    expect(plugin.isMultiFeedRefreshActive).toBe(true);
    expect(plugin.isGlobalRefreshCancellable).toBe(false);
    expect(parser.refreshFeed.mock.calls[0]?.[1]).toEqual({
      signal: expect.any(AbortSignal),
    });

    plugin.cancelGlobalRefresh();

    expect(deferral).not.toHaveBeenCalled();
    expect(notices()).not.toContain(STOPPED_NOTICE);

    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
    expect(plugin.settings.feeds.map((feed) => feed.lastUpdated)).toEqual([
      999, 999,
    ]);
  });

  it("counts settled feeds without resetting progress: completed rises while total keeps its value", async () => {
    const feeds = [createFeed("a"), createFeed("b")];
    const harness = createHarness(feeds);
    const { plugin } = harness;

    const refresh = plugin.refreshFeeds(feeds);
    await flush();
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 0 });

    await settle(harness, feeds[0].url);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 1, total: 0 });

    await settle(harness, feeds[1].url);
    await refresh;
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 0 });
  });
});

describe("global feed operation: single-feed refresh", () => {
  it("takes no lock and leaves progress alone", async () => {
    const feed = createFeed("a");
    const harness = createHarness([feed]);
    const { plugin } = harness;

    const refresh = plugin.refreshSelectedFeed(feed);
    await flush();

    expect(plugin.isMultiFeedRefreshActive).toBe(false);
    expect(plugin.isGlobalRefreshCancellable).toBe(false);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 0 });
    expect(plugin.activeRefreshState.get(feed.url)?.status).toBe("processing");
    expect(statusRedraws(harness)).toEqual(["full"]);

    await settle(harness, feed.url);
    await refresh;

    expect(plugin.activeRefreshState.size).toBe(0);
    expect(statusRedraws(harness)).toEqual(["full", "full"]);
  });

  it("runs while a multi-feed refresh is in progress", async () => {
    const batchFeeds = [createFeed("a"), createFeed("b")];
    const single = createFeed("single");
    const harness = createHarness([...batchFeeds, single]);
    const { plugin, parser } = harness;

    const batch = plugin.refreshFeeds(batchFeeds, "global");
    await flush();
    const refresh = plugin.refreshSelectedFeed(single);
    await flush();

    expect(parser.refreshFeed).toHaveBeenCalledWith(single, {
      signal: expect.any(AbortSignal),
    });
    expect(notices()).not.toContain(BUSY_REFRESH_NOTICE);
    expect(notices()).not.toContain(BUSY_OPERATION_NOTICE);

    await settle(harness, single.url);
    await refresh;

    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 2 });
    expect([...plugin.activeRefreshState.keys()]).toEqual(
      batchFeeds.map((feed) => feed.url),
    );

    for (const url of heldUrls(harness)) await settle(harness, url);
    await batch;
  });

  it("waits for the status redraw before fetching and again before finishing", async () => {
    const feed = createFeed("a");
    const harness = createHarness([feed]);
    const { plugin, parser } = harness;

    let release = harness.holdStatusRedraws();
    const refresh = plugin.refreshSelectedFeed(feed);
    const finished = isSettled(refresh);
    await flush();
    expect(parser.refreshFeed).not.toHaveBeenCalled();

    release();
    await flush();
    expect(parser.refreshFeed).toHaveBeenCalledTimes(1);

    release = harness.holdStatusRedraws();
    await settle(harness, feed.url);
    expect(finished()).toBe(false);

    release();
    await until(finished);
  });
});

describe("global feed operation: Discover add (addFeed with globalOperation)", () => {
  it("runs the add as a stoppable operation over one feed", async () => {
    const url = "https://example.com/discovered.xml";
    const harness = createHarness();
    const { plugin, parser } = harness;

    const added = addFeed(plugin, url, {
      showNotice: false,
      globalOperation: true,
    });
    await flush();

    expect(plugin.isMultiFeedRefreshActive).toBe(true);
    expect(plugin.isGlobalRefreshCancellable).toBe(true);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 1 });
    expect(parser.parseFeed.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(statusRedraws(harness)).toEqual(["full"]);

    await settle(harness, url);

    expect(await added).toBe(true);
    expect(plugin.settings.feeds.map((feed) => feed.url)).toEqual([url]);
    expect(plugin.isMultiFeedRefreshActive).toBe(false);
    expect(plugin.isGlobalRefreshCancellable).toBe(false);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 0 });
    expect(statusRedraws(harness)).toEqual(["full", "full"]);
  });

  it("starts parsing without waiting for the opening status redraw, and finishes only after the closing one", async () => {
    const url = "https://example.com/discovered.xml";
    const harness = createHarness();
    const { plugin, parser } = harness;
    const release = harness.holdStatusRedraws();

    const added = addFeed(plugin, url, {
      showNotice: false,
      globalOperation: true,
    });
    const finished = isSettled(added);
    await flush();

    expect(parser.parseFeed).toHaveBeenCalledTimes(1);
    expect(statusRedraws(harness)).toEqual([]);

    await settle(harness, url);
    expect(finished()).toBe(false);
    expect(plugin.isMultiFeedRefreshActive).toBe(false);

    release();
    await until(finished);
    expect(await added).toBe(true);
  });

  it("refuses the add while a refresh-all runs", async () => {
    const url = "https://example.com/discovered.xml";
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const { plugin, parser } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();
    const added = await addFeed(plugin, url, {
      showNotice: false,
      globalOperation: true,
    });

    expect(added).toBe(false);
    expect(notices()).toContain(BUSY_OPERATION_NOTICE);
    expect(notices()).not.toContain(BUSY_REFRESH_NOTICE);
    expect(parser.parseFeed).not.toHaveBeenCalled();
    expect(plugin.settings.feeds.some((feed) => feed.url === url)).toBe(false);
    expect(plugin.isGlobalRefreshCancellable).toBe(true);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 2 });

    for (const heldUrl of heldUrls(harness)) await settle(harness, heldUrl);
    await refresh;
  });

  it("refuses a multi-feed refresh while the add runs", async () => {
    const url = "https://example.com/discovered.xml";
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const { plugin, parser } = harness;

    const added = addFeed(plugin, url, {
      showNotice: false,
      globalOperation: true,
    });
    await flush();
    await plugin.refreshFeeds();

    expect(notices()).toContain(BUSY_REFRESH_NOTICE);
    expect(parser.refreshFeed).not.toHaveBeenCalled();
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 1 });

    await settle(harness, url);
    expect(await added).toBe(true);
  });

  it("stores nothing when the add is stopped, even though the parse finishes", async () => {
    const url = "https://example.com/discovered.xml";
    const secondUrl = "https://example.com/discovered-2.xml";
    const harness = createHarness();
    const { plugin } = harness;

    const added = addFeed(plugin, url, {
      showNotice: false,
      globalOperation: true,
    });
    await flush();
    plugin.cancelGlobalRefresh();

    expect(heldFetch(harness, url).signal?.aborted).toBe(true);
    expect(notices()).toContain(STOPPED_NOTICE);

    // Stop must end the operation without waiting for the held parse (#482).
    await until(() => !plugin.isMultiFeedRefreshActive);
    expect(await added).toBe(false);
    expect(plugin.settings.feeds).toEqual([]);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 0 });

    // A second global operation can start while the first parse is still held.
    const second = addFeed(plugin, secondUrl, {
      showNotice: false,
      globalOperation: true,
    });
    await flush();
    expect(plugin.isMultiFeedRefreshActive).toBe(true);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 1 });

    // Late completion of the stopped parse still stores nothing.
    await settle(harness, url);
    expect(plugin.settings.feeds).toEqual([]);

    await settle(harness, secondUrl);
    expect(await second).toBe(true);
    expect(plugin.settings.feeds.map((feed) => feed.url)).toEqual([secondUrl]);
  });
});

describe("global feed operation: background import (OPML import, Discover add all)", () => {
  it("runs the import as a stoppable operation and reports its progress", async () => {
    const urls = [
      "https://example.com/imported-1.xml",
      "https://example.com/imported-2.xml",
    ];
    const harness = createHarness();
    const { plugin } = harness;

    const result = await plugin.ingestFeedsForBackgroundImport(
      urls.map((url) => ({ title: url, url })),
      { globalOperation: true },
    );
    await flush();

    expect(result.addedCount).toBe(2);
    expect(heldUrls(harness)).toEqual(urls);
    expect(plugin.isMultiFeedRefreshActive).toBe(true);
    expect(plugin.isGlobalRefreshCancellable).toBe(true);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 2 });
    expect(statusRedraws(harness)).toEqual(["full"]);

    await settle(harness, urls[0]);

    expect(plugin.globalRefreshProgress).toEqual({ completed: 1, total: 2 });
    expect(statusRedraws(harness)).toEqual(["full", "full"]);

    await settle(harness, urls[1]);
    await until(() => !plugin.isMultiFeedRefreshActive);
    await flush();

    expect(plugin.isGlobalRefreshCancellable).toBe(false);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 0 });
    expect(notices()).toContain(
      "Background import completed. Processed 2 feeds.",
    );
    expect(statusRedraws(harness).slice(-1)).toEqual(["full"]);
  });

  it("stops the import: feeds still queued are never fetched, nothing reports completion, and they can be refreshed later", async () => {
    // One more feed than the fetch limit (8), so the last one is still queued.
    const urls = Array.from(
      { length: 9 },
      (_, index) => `https://example.com/imported-${index}.xml`,
    );
    const harness = createHarness();
    const { plugin, parser } = harness;

    await plugin.ingestFeedsForBackgroundImport(
      urls.map((url) => ({ title: url, url })),
      { globalOperation: true },
    );
    await flush();
    expect(heldUrls(harness)).toEqual(urls.slice(0, 8));

    plugin.cancelGlobalRefresh();
    for (const url of heldUrls(harness)) await settle(harness, url);
    await until(() => !plugin.isMultiFeedRefreshActive);
    await flush();

    expect(fetchedUrls(parser.parseFeed)).not.toContain(urls[8]);
    expect(
      notices().some((notice) =>
        notice.startsWith("Background import completed."),
      ),
    ).toBe(false);
    expect(plugin.backgroundImportQueue).toEqual([]);

    // Nothing still counts it as being imported, so it refreshes normally.
    const queued = plugin.settings.feeds.find((feed) => feed.url === urls[8]);
    if (!queued) throw new Error("The queued feed was not saved");
    const refresh = plugin.refreshFeeds([queued]);
    await flush();
    expect(fetchedUrls(parser.refreshFeed)).toEqual([urls[8]]);

    await settle(harness, urls[8]);
    await refresh;
  });

  it("refuses an import without saving feeds when another operation runs", async () => {
    // Verified fix for #451: The import is refused before saving placeholders.
    const url = "https://example.com/imported.xml";
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const { plugin, parser } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();
    const result = await plugin.ingestFeedsForBackgroundImport(
      [{ title: "Imported", url }],
      { globalOperation: true },
    );

    expect(result.refused).toBe(true);
    expect(result.addedCount).toBe(0);
    expect(result.queuedFeeds).toEqual([]);
    expect(plugin.settings.feeds.some((feed) => feed.url === url)).toBe(false);
    expect(notices()).toContain(BUSY_OPERATION_NOTICE);
    expect(plugin.backgroundImportQueue).toEqual([]);

    for (const heldUrl of heldUrls(harness)) await settle(harness, heldUrl);
    await refresh;
    await flush();

    expect(parser.parseFeed).not.toHaveBeenCalled();
    expect(
      plugin.settings.feeds.find((feed) => feed.url === url),
    ).toBeUndefined();
  });

  it("refuses an OPML import without saving feeds or showing background fetch notice when busy", async () => {
    // Verified fix for #451: OPML import is refused without misleading success notice or saved placeholder.
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const { plugin, parser } = harness;
    const opml =
      '<?xml version="1.0"?><opml version="2.0"><head><title>Feeds</title></head><body>' +
      '<outline type="rss" text="Imported" title="Imported" xmlUrl="https://example.com/imported.xml"/>' +
      "</body></opml>";

    const refresh = plugin.refreshFeeds();
    await flush();
    plugin.importOpml();
    const input =
      document.body.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("importOpml() did not create a file input");
    Object.defineProperty(input, "files", {
      value: [{ name: "feeds.opml", text: () => Promise.resolve(opml) }],
    });
    input.dispatchEvent(new Event("change"));
    await flush();

    expect(notices()).toContain(BUSY_OPERATION_NOTICE);
    expect(notices()).not.toContain(
      "Imported 1 feeds. Articles will be fetched in the background.",
    );
    expect(
      plugin.settings.feeds.some(
        (feed) => feed.url === "https://example.com/imported.xml",
      ),
    ).toBe(false);
    expect(parser.parseFeed).not.toHaveBeenCalled();

    for (const heldUrl of heldUrls(harness)) await settle(harness, heldUrl);
    await refresh;
  });

  it("refuses an overwrite import without clearing existing feeds when busy", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const { plugin } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();

    const result = await plugin.ingestFeedsForBackgroundImport(
      [{ title: "Imported", url: "https://example.com/imported.xml" }],
      { mode: "overwrite", globalOperation: true },
    );

    expect(result.refused).toBe(true);
    expect(result.addedCount).toBe(0);
    expect(plugin.settings.feeds.map((f) => f.url)).toEqual([
      "https://example.com/a.xml",
      "https://example.com/b.xml",
    ]);
    expect(notices()).toContain(BUSY_OPERATION_NOTICE);

    for (const heldUrl of heldUrls(harness)) await settle(harness, heldUrl);
    await refresh;
  });

  it("cleans up global operation and signal if an error is thrown during ingestion", async () => {
    const harness = createHarness([createFeed("a")]);
    const { plugin } = harness;

    vi.spyOn(plugin, "ensureFolderExists").mockRejectedValueOnce(
      new Error("Folder creation failed"),
    );

    await expect(
      plugin.ingestFeedsForBackgroundImport(
        [
          {
            title: "Folder Feed",
            url: "https://example.com/feed.xml",
            folder: "NewFolder",
          },
        ],
        { globalOperation: true },
      ),
    ).rejects.toThrow("Folder creation failed");

    expect(plugin.isMultiFeedRefreshActive).toBe(false);
    expect(
      (
        plugin as unknown as {
          backgroundImportService: { backgroundImportSignal: unknown };
        }
      ).backgroundImportService.backgroundImportSignal,
    ).toBeNull();

    const refresh = plugin.refreshFeeds();
    await flush();
    expect(notices()).not.toContain(BUSY_OPERATION_NOTICE);
    for (const heldUrl of heldUrls(harness)) await settle(harness, heldUrl);
    await refresh;
  });
});

describe("global feed operation: Stop", () => {
  it("defers the next automatic refresh, then aborts, then says so", async () => {
    const feeds = [createFeed("a"), createFeed("b")];
    const harness = createHarness(feeds);
    const { plugin } = harness;
    const deferral = spyOnDeferral();

    const refresh = plugin.refreshFeeds();
    await flush();
    const onAbort = vi.fn();
    heldFetch(harness, feeds[0].url).signal?.addEventListener("abort", onAbort);

    plugin.cancelGlobalRefresh();

    const noticeCall = (
      debugSpy as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.findIndex((call) => call[1] === STOPPED_NOTICE);
    const noticeOrder = (
      debugSpy as unknown as { mock: { invocationCallOrder: number[] } }
    ).mock.invocationCallOrder[noticeCall];
    expect(deferral).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(deferral.mock.invocationCallOrder[0]).toBeLessThan(
      onAbort.mock.invocationCallOrder[0],
    );
    expect(onAbort.mock.invocationCallOrder[0]).toBeLessThan(noticeOrder);

    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
  });

  it("repeats the deferral and the notice when Stop is pressed again before the batch drains", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const { plugin } = harness;
    const deferral = spyOnDeferral();
    harness.validateSavedArticles.mockImplementation(
      () => new Promise<void>(() => {}),
    );

    void plugin.refreshFeeds();
    await flush();
    plugin.cancelGlobalRefresh();
    await flush();
    expect(plugin.isGlobalRefreshCancellable).toBe(true);

    plugin.cancelGlobalRefresh();

    expect(deferral).toHaveBeenCalledTimes(2);
    expect(
      notices().filter((notice) => notice === STOPPED_NOTICE),
    ).toHaveLength(2);
  });

  it("cancelGlobalRefresh stops an in-flight global refresh, prevents late commits, and protects lastGlobalRefreshCompletedAt", async () => {
    const feeds = [
      createFeed("a", { lastUpdated: 100 }),
      createFeed("b", { lastUpdated: 200 }),
      createFeed("c", { lastUpdated: 300 }),
    ];
    const harness = createHarness(feeds);
    const { plugin } = harness;
    plugin.settings.lastGlobalRefreshCompletedAt = 42;

    const refresh = plugin.refreshFeeds();
    await flush();

    expect(plugin.isGlobalRefreshCancellable).toBe(true);
    expect(plugin.globalRefreshProgress.total).toBe(3);

    plugin.cancelGlobalRefresh();

    expect(plugin.globalRefreshProgress.total).toBe(3);

    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;

    expect(plugin.settings.feeds.map((feed) => feed.lastUpdated)).toEqual([
      100, 200, 300,
    ]);
    expect(plugin.settings.lastGlobalRefreshCompletedAt).toBe(42);
    expect(plugin.saveData).toHaveBeenCalled();

    expect(notices()).toContain("Refreshing 3 feeds...");
    expect(notices()).toContain(STOPPED_NOTICE);
    expect(
      notices().some((notice) => notice.startsWith("Feeds refreshed:")),
    ).toBe(false);
  });

  it("leaves a stopped feed's last error and last attempt time as they were", async () => {
    const harness = createHarness([
      createFeed("a", {
        lastFetchError: "old error a",
        lastRefreshAttemptCompletedAt: 123,
      }),
      createFeed("b", {
        lastFetchError: "old error b",
        lastRefreshAttemptCompletedAt: 456,
      }),
    ]);
    const { plugin } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();
    plugin.cancelGlobalRefresh();
    // Both fetches give up on the abort; neither ever settles.
    await refresh;

    expect(
      plugin.settings.feeds.map((feed) => [
        feed.lastFetchError,
        feed.lastRefreshAttemptCompletedAt,
      ]),
    ).toEqual([
      ["old error a", 123],
      ["old error b", 456],
    ]);
  });

  it("never starts a feed that was still waiting for a fetch slot when stopped", async () => {
    // One more feed than the fetch limit (8), so the last one has to wait.
    const feeds = Array.from({ length: 9 }, (_, index) =>
      createFeed(`feed-${index}`),
    );
    const harness = createHarness(feeds);
    const { plugin, parser } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();
    expect(heldUrls(harness)).toEqual(
      feeds.slice(0, 8).map((feed) => feed.url),
    );

    plugin.cancelGlobalRefresh();
    await refresh;

    expect(fetchedUrls(parser.refreshFeed)).not.toContain(feeds[8].url);
    expect(plugin.settings.feeds[8].lastUpdated).toBe(1);
  });

  it("stops a scheduled global refresh promptly when a feed ignores its abort signal", async () => {
    const harness = createHarness([createFeed("slow")]);
    const { plugin } = harness;

    const refresh = plugin.refreshFeeds(undefined, "global");
    await flush();
    plugin.cancelGlobalRefresh();
    await vi.advanceTimersByTimeAsync(0);
    await flush();

    expect(plugin.isGlobalRefreshCancellable).toBe(false);
    expect(plugin.activeRefreshState.size).toBe(0);
    expect(heldUrls(harness)).toEqual(["https://example.com/slow.xml"]);

    await settle(harness, "https://example.com/slow.xml");
    await refresh;
  });

  it("does not reset lastGlobalRefreshCompletedAt on a new global refresh when cancelled", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const { plugin } = harness;
    plugin.settings.lastGlobalRefreshCompletedAt = 42;

    const refresh = plugin.refreshFeeds();
    await flush();
    plugin.cancelGlobalRefresh();
    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;

    expect(plugin.settings.lastGlobalRefreshCompletedAt).toBe(42);
  });
});

describe("global feed operation: automatic refresh", () => {
  it("holds a due automatic refresh while an operation runs, and starts it within a second of the end", async () => {
    const due = createFeed("due");
    const url = "https://example.com/discovered.xml";
    const harness = createHarness([due]);
    const { plugin, parser } = harness;
    // Refresh every 60 minutes; never refreshed, so the global refresh is due.
    plugin.settings.refreshInterval = 60;

    const added = addFeed(plugin, url, {
      showNotice: false,
      globalOperation: true,
    });
    await flush();
    (plugin as unknown as PluginSeams).ensureAutoRefreshScheduler().start();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(parser.refreshFeed).not.toHaveBeenCalled();
    expect(notices()).toEqual([]);

    await settle(harness, url);
    expect(await added).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(notices()).toContain("Refreshing 2 feeds...");
    expect(fetchedUrls(parser.refreshFeed)).toEqual([due.url, url]);
    expect(plugin.isGlobalRefreshCancellable).toBe(true);
  });
});

describe("global feed operation: sidebar status redraws", () => {
  it("coalesces status changes into one sidebar redraw, 250 ms after the first request", async () => {
    const feeds = [createFeed("a"), createFeed("b"), createFeed("c")];
    const harness = createHarness(feeds);

    const refresh = harness.plugin.refreshFeeds();
    await flush();
    await vi.advanceTimersByTimeAsync(200);
    // A later request inside the window does not restart it.
    await settle(harness, feeds[0].url);
    await vi.advanceTimersByTimeAsync(49);

    expect(statusRedraws(harness)).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);

    expect(statusRedraws(harness)).toEqual(["sidebar"]);

    for (const url of heldUrls(harness)) await settle(harness, url);
    await refresh;
  });

  it("redraws the sidebar at once when the last feed settles, and drops the pending redraw", async () => {
    const feeds = [createFeed("a"), createFeed("b")];
    const harness = createHarness(feeds);

    const refresh = harness.plugin.refreshFeeds();
    await flush();
    await settle(harness, feeds[0].url);
    await settle(harness, feeds[1].url);
    await refresh;

    // The flush from the last feed, then the full redraw that ends the batch.
    expect(statusRedraws(harness)).toEqual(["sidebar", "full"]);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(statusRedraws(harness)).toEqual(["sidebar", "full"]);
  });

  it("leaves no sidebar redraw pending after unload", async () => {
    const harness = createHarness([createFeed("a"), createFeed("b")]);

    void harness.plugin.refreshFeeds();
    await flush();
    harness.plugin.onunload();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(statusRedraws(harness)).toEqual([]);
  });
});

describe("global feed operation: factory reset", () => {
  it("clears only the feed status and the running flag during a refresh", async () => {
    const feeds = [createFeed("a"), createFeed("b")];
    const harness = createHarness(feeds);
    const { plugin } = harness;

    const refresh = plugin.refreshFeeds();
    await flush();
    await settle(harness, feeds[0].url);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 1, total: 2 });

    await plugin.performFactoryReset();
    harness.useTestParser();

    expect(plugin.isMultiFeedRefreshActive).toBe(false);
    expect(plugin.isGlobalRefreshCancellable).toBe(false);
    expect(plugin.activeRefreshState.size).toBe(0);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 1, total: 2 });

    // With the running flag cleared, another batch starts while the first
    // still runs. A targeted batch keeps the progress it finds.
    const next = [createFeed("c"), createFeed("d")];
    const nextRefresh = plugin.refreshFeeds(next);
    await flush();

    expect(notices()).not.toContain(BUSY_REFRESH_NOTICE);
    expect(plugin.isMultiFeedRefreshActive).toBe(true);
    expect(plugin.isGlobalRefreshCancellable).toBe(false);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 1, total: 2 });

    for (const url of heldUrls(harness)) await settle(harness, url);
    await Promise.all([refresh, nextRefresh]);
    expect(plugin.globalRefreshProgress).toEqual({ completed: 0, total: 0 });
  });
});

describe("global feed operation: storage health", () => {
  it("redraws the refresh status when user-state.json turns out to be unreadable", async () => {
    const harness = createHarness();
    const { app, plugin } = harness;
    const saved = createSettings([]);
    saved.storageMode = "vault-shards-v2";
    saved.metadataStorageFolder = "rss-dashboard-data";
    saved.storageFolder = "rss-dashboard-data/feeds";
    plugin.loadData = vi.fn().mockResolvedValue(saved);
    await app.vault.adapter.mkdir("rss-dashboard-data");
    await app.vault.adapter.write(
      "rss-dashboard-data/user-state.json",
      "{ not json",
    );

    await plugin.loadSettings();

    expect(plugin.isUserStateUnreadable).toBe(true);
    expect(statusRedraws(harness)).toEqual(["full"]);
  });
});

describe("global feed operation: a plain add while a stopped refresh drains", () => {
  it("drops a plain add whose parse finishes after Stop, before the stopped refresh drains", async () => {
    // Pinned as is: ADR 0015 behavior 9. addFeed reads the global "stopped"
    // flag even for an add that is not a global operation. Possibly intended;
    // raised in #446 and not filed.
    const url = "https://example.com/plain.xml";
    const harness = createHarness([createFeed("a"), createFeed("b")]);
    const { plugin } = harness;
    let finishValidation = (): void => {};
    harness.validateSavedArticles.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishValidation = resolve;
        }),
    );

    const refresh = plugin.refreshFeeds();
    await flush();
    plugin.cancelGlobalRefresh();
    await flush();
    // Every fetch has given up; the batch is still finishing.
    expect(plugin.isMultiFeedRefreshActive).toBe(true);

    const added = addFeed(plugin, url);
    await flush();
    await settle(harness, url);

    expect(await added).toBe(false);
    expect(plugin.settings.feeds.some((feed) => feed.url === url)).toBe(false);
    expect(notices().some((notice) => notice.includes("added"))).toBe(false);

    finishValidation();
    await refresh;

    const addedLater = addFeed(plugin, url);
    await flush();
    await settle(harness, url);
    expect(await addedLater).toBe(true);
  });
});
