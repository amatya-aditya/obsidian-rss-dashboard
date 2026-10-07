/**
 * Refresh announcements (#842, AC-012, WCAG 2.2 4.1.3, TEST-009).
 *
 * Drives the plugin's real refresh runner (parser held and settled by hand,
 * under fake timers) with a real dashboard view open, and reads the text the
 * view's live region announces. A MutationObserver records every change, so
 * "once per event" is counted, not assumed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type MockApp, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { FeedRefreshScheduler } from "../../../src/services/feed-refresh-scheduler";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

type FetchOptions = { signal?: AbortSignal };

interface HeldFetch {
  url: string;
  feed: Feed;
  settle: (result?: Feed) => void;
  fail: (error: Error) => void;
}

interface PluginSeams {
  feedParser: unknown;
  validateSavedArticles: () => Promise<void>;
  addStatusBarItem: () => HTMLElement;
  initializeSettingsBackedServices(): void;
  ensureAutoRefreshScheduler(): FeedRefreshScheduler;
}

interface Harness {
  plugin: RssDashboardPlugin;
  held: HeldFetch[];
  view: RssDashboardView;
  /** Texts the live region announced since the harness was built. */
  announced: string[];
  regionText: () => string;
}

const created: Array<{ plugin: RssDashboardPlugin; held: HeldFetch[] }> = [];
const observers: MutationObserver[] = [];

function manifest(app: MockApp): PluginManifest {
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

function url(name: string): string {
  return `https://example.com/${name}.xml`;
}

function item(feedUrl: string, guid: string): FeedItem {
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

function feed(name: string, overrides: Partial<Feed> = {}): Feed {
  return {
    title: `Feed ${name}`,
    url: url(name),
    folder: "",
    items: [item(url(name), `${name}-1`)],
    lastUpdated: 1,
    mediaType: "article",
    ...overrides,
  };
}

/** What the parser returns when a feed brings `count` articles it lacked. */
function withNewArticles(source: Feed, count: number): Feed {
  const added = Array.from({ length: count }, (_, index) =>
    item(source.url, `new-${index}`),
  );
  return { ...source, items: [...added, ...source.items], lastUpdated: 999 };
}

function createHarness(feeds: Feed[]): Harness {
  const app = App.createMock();
  const plugin = new RssDashboardPlugin(app, manifest(app));
  const seams = plugin as unknown as PluginSeams;
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.storageMode = "legacy-json";
  settings.feeds = feeds;
  plugin.settings = settings;
  plugin.loadData = vi.fn().mockResolvedValue(null);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  seams.initializeSettingsBackedServices();
  seams.ensureAutoRefreshScheduler();
  seams.addStatusBarItem = () => createDiv();

  const held: HeldFetch[] = [];
  seams.feedParser = {
    refreshFeed: vi.fn(
      (source: Feed, _options?: FetchOptions) =>
        new Promise<Feed>((resolve, reject) => {
          const fetch: HeldFetch = {
            url: source.url,
            feed: source,
            settle: (result) => {
              held.splice(held.indexOf(fetch), 1);
              resolve(result ?? { ...source, lastUpdated: 999 });
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
  seams.validateSavedArticles = vi.fn().mockResolvedValue(undefined);

  // A real dashboard view in the same app, so announcements reach it the way
  // they reach an open dashboard.
  const leaf = { view: null, setViewState: vi.fn(), app } as never;
  const view = new RssDashboardView(leaf, plugin);
  document.body.appendChild(view.containerEl);
  plugin.getActiveDashboardView = vi.fn().mockResolvedValue(view);

  created.push({ plugin, held });
  return {
    plugin,
    held,
    view,
    announced: [],
    regionText: () =>
      view.containerEl.querySelector(".rss-dashboard-refresh-announcer")
        ?.textContent ?? "",
  };
}

/** Opens the view and starts recording what its live region announces. */
async function openView(harness: Harness): Promise<void> {
  await harness.view.onOpen();
  const region = harness.view.containerEl.querySelector(
    ".rss-dashboard-refresh-announcer",
  );
  if (!region) throw new Error("The dashboard has no refresh live region.");
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        const text = node.textContent ?? "";
        if (text !== "") harness.announced.push(text);
      }
      if (record.type === "characterData" || record.type === "attributes") {
        const text = region.textContent ?? "";
        if (text !== "") harness.announced.push(text);
      }
    }
  });
  observer.observe(region, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  observers.push(observer);
}

async function flush(): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    await Promise.resolve();
  }
}

/** Waits for pending observer callbacks, then lets promise chains run. */
async function settleAll(harness: Harness): Promise<void> {
  for (let round = 0; round < 20 && harness.held.length > 0; round += 1) {
    for (const fetch of [...harness.held]) fetch.settle();
    await flush();
  }
}

function held(harness: Harness, name: string): HeldFetch {
  const found = harness.held.find((fetch) => fetch.url === url(name));
  if (!found) throw new Error(`No held fetch for ${name}`);
  return found;
}

async function settleFeed(
  harness: Harness,
  name: string,
  result?: Feed,
): Promise<void> {
  held(harness, name).settle(result);
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"));
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(FeedRefreshScheduler.prototype, "reschedule").mockImplementation(
    () => {},
  );
});

afterEach(async () => {
  for (const { plugin, held: pending } of created) {
    for (let round = 0; round < 20 && pending.length > 0; round += 1) {
      for (const fetch of [...pending]) fetch.settle();
      await flush();
    }
    await vi.runOnlyPendingTimersAsync();
    plugin.onunload();
  }
  created.length = 0;
  for (const observer of observers) observer.disconnect();
  observers.length = 0;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.empty();
});

describe("refresh announcements: a multi-feed refresh", () => {
  it("announces the start once and the finish once, with the new-article total, not one message per feed", async () => {
    const harness = createHarness([feed("a"), feed("b"), feed("c")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds();
    await flush();
    await settleFeed(harness, "a", withNewArticles(feed("a"), 2));
    await settleFeed(harness, "b", withNewArticles(feed("b"), 1));
    await settleFeed(harness, "c");
    await run;
    await flush();

    expect(harness.announced).toEqual([
      "Refreshing 3 feeds.",
      "Refresh finished: 3 new articles.",
    ]);
  });

  it("says there were no new articles when a refresh finishes empty-handed", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds();
    await flush();
    await settleAll(harness);
    await run;
    await flush();

    expect(harness.announced).toEqual([
      "Refreshing 2 feeds.",
      "Refresh finished: no new articles.",
    ]);
  });

  it("uses the singular for one new article", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds();
    await flush();
    await settleFeed(harness, "a", withNewArticles(feed("a"), 1));
    await settleAll(harness);
    await run;
    await flush();

    expect(harness.announced[harness.announced.length - 1]).toBe(
      "Refresh finished: 1 new article.",
    );
  });

  it("counts new articles when the parser adds them to the stored feed in place, as the real parser does", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);
    const stored = harness.plugin.settings.feeds[0];

    const run = harness.plugin.refreshFeeds();
    await flush();
    // The real FeedParser.parseFeed reuses the feed it is given and rewrites
    // its items, so the stored feed already holds the new articles when the
    // fetch resolves.
    stored.items = [...withNewArticles(stored, 2).items];
    await settleFeed(harness, "a", stored);
    await settleAll(harness);
    await run;
    await flush();

    expect(harness.announced[harness.announced.length - 1]).toBe(
      "Refresh finished: 2 new articles.",
    );
  });

  it("folds feed errors into the one finish message, whether the fetch failed or the parser recorded the error", async () => {
    const harness = createHarness([feed("a"), feed("b"), feed("c")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds();
    await flush();
    await settleFeed(harness, "a", {
      ...feed("a"),
      lastFetchError: "Unreachable",
    });
    held(harness, "b").fail(new Error("boom"));
    await flush();
    await settleFeed(harness, "c", withNewArticles(feed("c"), 2));
    await run;
    await flush();

    expect(harness.announced).toEqual([
      "Refreshing 3 feeds.",
      "Refresh finished: 2 new articles, 2 feeds failed.",
    ]);
  });

  it("reports a timed out feed", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds();
    await flush();
    await settleFeed(harness, "a");
    held(harness, "b").fail(new Error("Timed out"));
    await flush();
    await run;
    await flush();

    expect(harness.announced[harness.announced.length - 1]).toBe(
      "Refresh finished: no new articles, 1 feed timed out.",
    );
  });

  it("announces each run once when two refreshes follow each other, even with identical text", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    for (let pass = 0; pass < 2; pass += 1) {
      const run = harness.plugin.refreshFeeds();
      await flush();
      await settleAll(harness);
      await run;
      await flush();
    }

    expect(harness.announced).toEqual([
      "Refreshing 2 feeds.",
      "Refresh finished: no new articles.",
      "Refreshing 2 feeds.",
      "Refresh finished: no new articles.",
    ]);
  });

  it("announces nothing for a request refused because a refresh is already running", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    const first = harness.plugin.refreshFeeds();
    await flush();
    await harness.plugin.refreshFeeds();
    await flush();
    expect(harness.announced).toEqual(["Refreshing 2 feeds."]);

    await settleAll(harness);
    await first;
    await flush();
    expect(harness.announced).toEqual([
      "Refreshing 2 feeds.",
      "Refresh finished: no new articles.",
    ]);
  });

  it("announces that the refresh stopped when the user stops it", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds();
    await flush();
    harness.plugin.cancelGlobalRefresh();
    await flush();
    await settleAll(harness);
    await run;
    await flush();

    expect(harness.announced).toEqual([
      "Refreshing 2 feeds.",
      "Refresh stopped.",
    ]);
  });
});

describe("refresh announcements: a single feed", () => {
  it("announces the start and the finish with the feed's title", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);
    const target = harness.plugin.settings.feeds[0];

    const run = harness.plugin.refreshFeeds([target]);
    await flush();
    await settleFeed(harness, "a", withNewArticles(feed("a"), 3));
    await run;
    await flush();

    expect(harness.announced).toEqual([
      "Refreshing Feed a.",
      "Refresh finished: 3 new articles.",
    ]);
  });

  it("announces the error when the single-feed refresh fails", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);
    const target = harness.plugin.settings.feeds[0];

    const run = harness.plugin.refreshFeeds([target]);
    await flush();
    held(harness, "a").fail(new Error("boom"));
    await run;
    await flush();

    expect(harness.announced).toEqual([
      "Refreshing Feed a.",
      "Refresh failed: boom",
    ]);
  });

  it("announces the same way when a feed is refreshed from the sidebar", async () => {
    const harness = createHarness([feed("a")]);
    await openView(harness);
    const target = harness.plugin.settings.feeds[0];

    const run = harness.plugin.refreshSelectedFeed(target);
    await flush();
    await settleFeed(harness, "a");
    await run;
    await flush();

    expect(harness.announced).toEqual([
      "Refreshing Feed a.",
      "Refresh finished: no new articles.",
    ]);
  });
});

describe("refresh announcements: background refresh of due feeds", () => {
  it("stays silent when nothing came of it", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds(
      [...harness.plugin.settings.feeds],
      "due",
    );
    await flush();
    await settleAll(harness);
    await run;
    await flush();

    expect(harness.announced).toEqual([]);
  });

  it("announces once, at the end, when it brought new articles", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds(
      [...harness.plugin.settings.feeds],
      "due",
    );
    await flush();
    await settleFeed(harness, "a", withNewArticles(feed("a"), 2));
    await settleAll(harness);
    await run;
    await flush();

    expect(harness.announced).toEqual(["Refresh finished: 2 new articles."]);
  });
});

/** The toasts the plugin showed (the Obsidian stub logs each one). */
function toasts(): string[] {
  return (
    console.debug as unknown as { mock: { calls: unknown[][] } }
  ).mock.calls
    .filter((call) => call[0] === "[Stub Notice]")
    .map((call) => String(call[1]));
}

/**
 * Wakes the plugin's real interval scheduler with the global refresh due, as
 * the timer does, so the plugin's own requestGlobalRefresh runs.
 */
async function wakeScheduler(harness: Harness): Promise<void> {
  const scheduler = (
    harness.plugin as unknown as PluginSeams
  ).ensureAutoRefreshScheduler();
  harness.plugin.settings.refreshInterval = 30;
  harness.plugin.settings.lastGlobalRefreshCompletedAt =
    Date.now() - 60 * 60 * 1000;
  scheduler.start();
  void (
    scheduler as unknown as { handleWakeup(): Promise<void> }
  ).handleWakeup();
  await flush();
}

describe("refresh announcements: scheduled global refresh (#855)", () => {
  it("stays silent when nothing came of it, yet still completes the global refresh", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);
    const before = harness.plugin.settings.lastGlobalRefreshCompletedAt;

    await wakeScheduler(harness);
    expect(harness.held).toHaveLength(2);
    await settleAll(harness);
    await flush();

    expect(harness.announced).toEqual([]);
    expect(
      harness.plugin.settings.lastGlobalRefreshCompletedAt,
    ).toBeGreaterThan(before);
    expect(toasts()).toEqual([
      "Refreshing 2 feeds...",
      "Feeds refreshed: 2 feeds",
    ]);
  });

  it("announces one finish message, and no start message, when it found new articles", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    await wakeScheduler(harness);
    await settleFeed(harness, "a", withNewArticles(feed("a"), 2));
    await settleAll(harness);
    await flush();

    expect(harness.announced).toEqual(["Refresh finished: 2 new articles."]);
  });

  it("announces one finish message when a feed failed", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    await wakeScheduler(harness);
    held(harness, "a").fail(new Error("boom"));
    await flush();
    await settleAll(harness);
    await flush();

    expect(harness.announced).toEqual([
      "Refresh finished: no new articles, 1 feed failed.",
    ]);
  });

  it("is quiet and still a global refresh when only one feed is eligible", async () => {
    const harness = createHarness([feed("a")]);
    await openView(harness);
    const before = harness.plugin.settings.lastGlobalRefreshCompletedAt;

    await wakeScheduler(harness);
    await settleAll(harness);
    await flush();

    expect(harness.announced).toEqual([]);
    expect(
      harness.plugin.settings.lastGlobalRefreshCompletedAt,
    ).toBeGreaterThan(before);
  });

  it("keeps a manual global refresh fully announced", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds(undefined, "global");
    await flush();
    await settleAll(harness);
    await run;
    await flush();

    expect(harness.announced).toEqual([
      "Refreshing 2 feeds.",
      "Refresh finished: no new articles.",
    ]);
  });
});

describe("refresh announcements: the toast and the announcement agree (#855)", () => {
  it("counts a feed whose parser recorded a fetch error as failed in both", async () => {
    const harness = createHarness([feed("a"), feed("b"), feed("c")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds();
    await flush();
    await settleFeed(harness, "a", {
      ...feed("a"),
      lastFetchError: "Unreachable",
    });
    held(harness, "b").fail(new Error("boom"));
    await flush();
    await settleFeed(harness, "c");
    await run;
    await flush();

    expect(harness.announced[harness.announced.length - 1]).toBe(
      "Refresh finished: no new articles, 2 feeds failed.",
    );
    expect(toasts()).toContain(
      "Feeds refreshed: 3 feeds (2 failed) Shift+click Refresh all feeds to retry failed feeds.",
    );
  });

  it("reports timed out and failed feeds separately in both", async () => {
    const harness = createHarness([feed("a"), feed("b"), feed("c")]);
    await openView(harness);

    const run = harness.plugin.refreshFeeds();
    await flush();
    await settleFeed(harness, "a", {
      ...feed("a"),
      lastFetchError: "Unreachable",
    });
    held(harness, "b").fail(new Error("Timed out"));
    await flush();
    await settleFeed(harness, "c");
    await run;
    await flush();

    expect(harness.announced[harness.announced.length - 1]).toBe(
      "Refresh finished: no new articles, 1 feed timed out, 1 feed failed.",
    );
    expect(toasts()).toContain(
      "Feeds refreshed: 3 feeds (1 timed out, 1 failed) Shift+click Refresh all feeds to retry failed feeds.",
    );
  });
});

describe("refresh announcements: views", () => {
  it("reaches every open dashboard, and a closed one stays quiet", async () => {
    const harness = createHarness([feed("a")]);
    await openView(harness);
    const second = new RssDashboardView(
      { view: null, setViewState: vi.fn(), app: harness.view.app } as never,
      harness.plugin,
    );
    document.body.appendChild(second.containerEl);
    await second.onOpen();
    const closed = new RssDashboardView(
      { view: null, setViewState: vi.fn(), app: harness.view.app } as never,
      harness.plugin,
    );
    document.body.appendChild(closed.containerEl);
    await closed.onOpen();
    await closed.onClose();
    closed.unload();

    const run = harness.plugin.refreshFeeds([harness.plugin.settings.feeds[0]]);
    await flush();
    await settleAll(harness);
    await run;
    await flush();

    const text = (view: RssDashboardView): string =>
      view.containerEl.querySelector(".rss-dashboard-refresh-announcer")
        ?.textContent ?? "";
    expect(harness.regionText()).toBe("Refresh finished: no new articles.");
    expect(text(second)).toBe("Refresh finished: no new articles.");
    expect(text(closed)).toBe("");
  });
});
