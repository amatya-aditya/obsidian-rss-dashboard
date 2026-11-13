import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../src/types/types";
import type { FullArticleFetchResult } from "../../../src/utils/fetch-helpers";
import { emptyRawMetadata } from "../../../src/utils/article-metadata";

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

interface TestManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  dir: string;
}

function createMockManifest(): TestManifest {
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

function mockRefreshFeed(
  plugin: { feedParser: { refreshFeed: unknown } },
  implementation: (feed: Feed) => Promise<Feed>,
): void {
  const refreshFeed = plugin.feedParser.refreshFeed as {
    mockImplementation(callback: (feed: Feed) => Promise<Feed>): void;
  };
  refreshFeed.mockImplementation(implementation);
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

interface TestFeedParser {
  refreshFeed: ReturnType<typeof vi.fn>;
  refreshAllFeeds: ReturnType<typeof vi.fn>;
}

interface TestPlugin {
  settings: typeof DEFAULT_SETTINGS;
  saveData: ReturnType<typeof vi.fn>;
  feedParser: TestFeedParser;
  refreshFeeds: (
    selectedFeeds?: Feed[],
    intent?: "global" | "scheduled" | "targeted" | "due" | "failed",
  ) => Promise<void>;
  refreshFailedFeeds: () => Promise<void>;
  getActiveDashboardView: ReturnType<typeof vi.fn>;
}

function createPluginWithSettings(feeds: Feed[]): TestPlugin {
  const app = new App();
  const plugin = new RssDashboardPlugin(
    app as unknown as ConstructorParameters<typeof RssDashboardPlugin>[0],
    createMockManifest() as unknown as ConstructorParameters<
      typeof RssDashboardPlugin
    >[1],
  );

  const testPlugin = plugin as unknown as TestPlugin;

  testPlugin.settings = {
    ...DEFAULT_SETTINGS,
    feeds,
  };

  testPlugin.saveData = vi.fn().mockResolvedValue(undefined);

  testPlugin.feedParser = {
    refreshFeed: vi.fn(),
    refreshAllFeeds: vi.fn(),
  };

  testPlugin.getActiveDashboardView = vi.fn();

  return testPlugin;
}

function getNoticeMessages(spy: ReturnType<typeof vi.spyOn>): string[] {
  const calls = (spy as unknown as { mock: { calls: Array<Array<unknown>> } })
    .mock.calls;
  return calls
    .filter((call) => call[0] === "[Stub Notice]")
    .map((call) => String(call[1]));
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  consoleLogSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("refreshFeeds() pipeline behavior", () => {
  it.each(["targeted", "scheduled"] as const)(
    "stores text-only, image-only, and combined outcomes after %s refresh",
    async (intent) => {
      const outcomes = [
        {
          description: "A useful publisher description long enough to qualify.",
        },
        { image: "https://images.example/article.jpg" },
        {
          description: "A useful publisher description long enough to qualify.",
          image: "https://images.example/article.jpg",
        },
      ];
      for (const outcome of outcomes) {
        const selected = createFeed({
          feedId: `feed-${intent}`,
          refreshEnrichment: true,
          items: [createItem({ description: "", summary: "", content: "" })],
        });
        const plugin = createPluginWithSettings([selected]);
        mockRefreshFeed(plugin, async (feed) => ({
          ...feed,
          lastUpdated: 777,
        }));
        const enrichment = (
          plugin as unknown as {
            refreshEnrichment: {
              deps: {
                fetch(url: string): Promise<FullArticleFetchResult>;
                commit?: (apply: () => unknown) => Promise<boolean>;
                persist(): Promise<void>;
              };
              whenIdle(): Promise<void>;
            };
          }
        ).refreshEnrichment;
        enrichment.deps.commit = undefined;
        enrichment.deps.persist = async () => {};
        const pageFetch = vi.fn(async () => ({
          content: "",
          failureType: "none" as const,
          pageMetadata: {
            ...emptyRawMetadata(),
            metaDescription: outcome.description ?? "",
          },
          pageImage: outcome.image,
        }));
        enrichment.deps.fetch = pageFetch;

        await plugin.refreshFeeds(
          intent === "targeted" ? [selected] : undefined,
          intent,
        );
        await enrichment.whenIdle();

        expect(pageFetch).toHaveBeenCalledTimes(1);
        const saved = plugin.settings.feeds[0]?.items[0]?.refreshEnrichment;
        expect(saved?.description).toBe(outcome.description);
        expect(saved?.image).toBe(outcome.image);
        expect(saved?.url).toBe(selected.items[0]?.link);
      }
    },
  );

  it("keeps newer article state when a feed snapshot is replaced during refresh", async () => {
    const first = createItem({
      guid: "first",
      link: "https://example.com/first",
      description: "",
    });
    const oldFeed = createFeed({ feedId: "feed-one", items: [first] });
    const plugin = createPluginWithSettings([oldFeed]);
    let release!: (feed: Feed) => void;
    mockRefreshFeed(
      plugin,
      () =>
        new Promise<Feed>((resolve) => {
          release = resolve;
        }),
    );
    const refresh = plugin.refreshFeeds([oldFeed]);
    await vi.waitFor(() =>
      expect(plugin.feedParser.refreshFeed).toHaveBeenCalled(),
    );
    const latest = structuredClone(oldFeed);
    latest.items[0].read = true;
    latest.items[0].refreshEnrichment = {
      url: first.link,
      description: "Newer page preview",
    };
    plugin.settings.feeds = [latest];
    release({
      ...oldFeed,
      items: [
        first,
        createItem({ guid: "second", link: "https://example.com/second" }),
      ],
      lastUpdated: 777,
    });
    await refresh;
    const result = plugin.settings.feeds[0];
    expect(
      result.items.find((item) => item.guid === "first")?.refreshEnrichment
        ?.description,
    ).toBe("Newer page preview");
    expect(result.items.find((item) => item.guid === "first")?.read).toBe(true);
    expect(result.items.some((item) => item.guid === "second")).toBe(true);
  });
  it("does not overwrite a replacement feed with a late result for the old feed", async () => {
    const oldFeed = createFeed({ feedId: "old-feed", title: "Old" });
    const plugin = createPluginWithSettings([oldFeed]);
    let release!: (feed: Feed) => void;
    mockRefreshFeed(
      plugin,
      () =>
        new Promise<Feed>((resolve) => {
          release = resolve;
        }),
    );
    const refresh = plugin.refreshFeeds([oldFeed]);
    await vi.waitFor(() =>
      expect(plugin.feedParser.refreshFeed).toHaveBeenCalled(),
    );
    const replacement = createFeed({
      feedId: "new-feed",
      title: "Replacement",
      items: [createItem({ guid: "new-item" })],
    });
    plugin.settings.feeds = [replacement];
    release({ ...oldFeed, lastFetchError: "Feed no longer available" });
    await refresh;
    expect(plugin.settings.feeds[0]).toBe(replacement);
    expect(replacement.items.map((item) => item.guid)).toEqual(["new-item"]);
    expect(replacement.lastFetchError).toBeUndefined();
  });
  it.each(["targeted", "scheduled"] as const)(
    "queues successful %s refreshes after the feed view updates",
    async (intent) => {
      const selected = createFeed({ refreshEnrichment: true });
      const plugin = createPluginWithSettings([selected]);
      mockRefreshFeed(plugin, async (feed: Feed) => ({
        ...feed,
        lastUpdated: 777,
      }));
      const view = { refresh: vi.fn() };
      plugin.getActiveDashboardView.mockResolvedValue(view);
      const scheduler = (
        plugin as unknown as {
          refreshEnrichment: { enqueue(feeds: Feed[]): void };
        }
      ).refreshEnrichment;
      const enqueue = vi
        .spyOn(scheduler, "enqueue")
        .mockImplementation(() => {});

      await plugin.refreshFeeds(
        intent === "targeted" ? [selected] : undefined,
        intent,
      );

      expect(enqueue).toHaveBeenCalledWith([selected]);
      expect(view.refresh).toHaveBeenCalled();
      expect(view.refresh.mock.invocationCallOrder[0]).toBeLessThan(
        enqueue.mock.invocationCallOrder[0],
      );
    },
  );
  it("retries the current failed, non-excluded feeds and includes feeds with automatic refresh off", async () => {
    const failed = createFeed({
      title: "Failed Feed",
      url: "https://example.com/failed.xml",
      lastFetchError: "network down",
      scanInterval: 0,
    });
    const excluded = createFeed({
      title: "Excluded Failed Feed",
      url: "https://example.com/excluded.xml",
      lastFetchError: "network down",
      excludeFromRefresh: true,
    });
    const healthy = createFeed({
      title: "Healthy Feed",
      url: "https://example.com/healthy.xml",
    });
    const plugin = createPluginWithSettings([failed, excluded, healthy]);
    const refreshSpy = vi
      .spyOn(plugin, "refreshFeeds")
      .mockResolvedValue(undefined);

    await plugin.refreshFailedFeeds();

    expect(refreshSpy).toHaveBeenCalledWith([failed], "failed");
  });

  it("shows an empty-state notice without starting a retry when no eligible failures exist", async () => {
    const excluded = createFeed({
      lastFetchError: "network down",
      excludeFromRefresh: true,
    });
    const plugin = createPluginWithSettings([createFeed(), excluded]);
    const refreshSpy = vi.spyOn(plugin, "refreshFeeds");

    await plugin.refreshFailedFeeds();

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(plugin.feedParser.refreshFeed).not.toHaveBeenCalled();
    expect(getNoticeMessages(consoleLogSpy)).toContain(
      "No failed refreshes to retry.",
    );
  });

  it("points to Retry import instead of claiming there are no failed feeds when only a background import failed", async () => {
    const importFailed = createFeed({
      title: "Import Failed Feed",
      url: "https://example.com/import-failed.xml",
      importStatus: "failed",
      importError: "Request failed, status 500",
    });
    const plugin = createPluginWithSettings([importFailed]);
    const refreshSpy = vi
      .spyOn(plugin, "refreshFeeds")
      .mockResolvedValue(undefined);

    await plugin.refreshFailedFeeds();

    expect(refreshSpy).not.toHaveBeenCalled();
    const notices = getNoticeMessages(consoleLogSpy);
    expect(notices).toContain(
      "No failed refreshes to retry. 1 feed import failed; choose Retry import from the feed's menu.",
    );
    expect(notices).not.toContain("No failed feeds to retry.");
  });

  it("still retries only the fetch failures when an import-failed feed is present", async () => {
    const fetchFailed = createFeed({
      title: "Fetch Failed Feed",
      url: "https://example.com/fetch-failed.xml",
      lastFetchError: "network down",
    });
    const importFailed = createFeed({
      title: "Import Failed Feed",
      url: "https://example.com/import-failed.xml",
      importStatus: "failed",
      importError: "Request failed, status 500",
    });
    const plugin = createPluginWithSettings([fetchFailed, importFailed]);
    const refreshSpy = vi
      .spyOn(plugin, "refreshFeeds")
      .mockResolvedValue(undefined);

    await plugin.refreshFailedFeeds();

    expect(refreshSpy).toHaveBeenCalledWith([fetchFailed], "failed");
  });

  it("keeps global completion unchanged while successful and repeated failed retries update their errors", async () => {
    const recovered = createFeed({
      url: "https://example.com/recovered.xml",
      lastFetchError: "network down",
    });
    const stillFailing = createFeed({
      url: "https://example.com/still-failing.xml",
      lastFetchError: "old error",
    });
    const plugin = createPluginWithSettings([recovered, stillFailing]);
    plugin.settings.lastGlobalRefreshCompletedAt = 123;
    (
      plugin.feedParser.refreshFeed as unknown as {
        mockImplementation: (fn: (feed: Feed) => Promise<Feed>) => void;
      }
    ).mockImplementation(async (feed) => {
      if (feed.url === stillFailing.url) {
        throw new Error("new error");
      }
      return { ...feed, lastFetchError: undefined };
    });

    await plugin.refreshFailedFeeds();

    expect(plugin.settings.lastGlobalRefreshCompletedAt).toBe(123);
    expect(plugin.settings.feeds[0].lastFetchError).toBeUndefined();
    expect(plugin.settings.feeds[1].lastFetchError).toBe("new error");
    expect(
      plugin.settings.feeds[0].lastRefreshAttemptCompletedAt,
    ).toBeDefined();
    expect(
      plugin.settings.feeds[1].lastRefreshAttemptCompletedAt,
    ).toBeDefined();
  });

  it("records global completion after an explicit all-feeds refresh even when one attempt fails", async () => {
    const successful = createFeed({ url: "https://example.com/one.xml" });
    const failing = createFeed({ url: "https://example.com/two.xml" });
    const plugin = createPluginWithSettings([successful, failing]);
    vi.spyOn(Date, "now").mockReturnValue(9_876);
    (
      plugin.feedParser.refreshFeed as unknown as {
        mockImplementation: (fn: (feed: Feed) => Promise<Feed>) => void;
      }
    ).mockImplementation(async (feed) => {
      if (feed.url === failing.url) throw new Error("network down");
      return feed;
    });

    await plugin.refreshFeeds();

    expect(plugin.settings.lastGlobalRefreshCompletedAt).toBe(9_876);
    expect(plugin.settings.feeds[1].lastFetchError).toBe("network down");
  });

  it("does not record global completion for a selected-feed refresh", async () => {
    const selected = createFeed();
    const plugin = createPluginWithSettings([selected]);
    plugin.settings.lastGlobalRefreshCompletedAt = 123;
    (
      plugin.feedParser.refreshFeed as unknown as {
        mockResolvedValue: (value: Feed) => void;
      }
    ).mockResolvedValue(selected);

    await plugin.refreshFeeds([selected]);

    expect(plugin.settings.lastGlobalRefreshCompletedAt).toBe(123);
  });

  it("refreshes multi-feed selections with bounded concurrency, incremental merges, and a final save + refresh", async () => {
    vi.useFakeTimers();
    const feedA = createFeed({
      title: "Feed A",
      url: "https://example.com/a.xml",
      items: [createItem({ guid: "a-1" })],
      lastUpdated: 100,
    });
    const feedB = createFeed({
      title: "Feed B",
      url: "https://example.com/b.xml",
      items: [
        createItem({
          guid: "b-1",
          feedTitle: "Feed B",
          feedUrl: "https://example.com/b.xml",
        }),
      ],
      lastUpdated: 200,
    });
    const feedC = createFeed({
      title: "Feed C",
      url: "https://example.com/c.xml",
      items: [
        createItem({
          guid: "c-1",
          feedTitle: "Feed C",
          feedUrl: "https://example.com/c.xml",
        }),
      ],
      lastUpdated: 300,
    });
    const feedD = createFeed({
      title: "Feed D",
      url: "https://example.com/d.xml",
      items: [
        createItem({
          guid: "d-1",
          feedTitle: "Feed D",
          feedUrl: "https://example.com/d.xml",
        }),
      ],
      lastUpdated: 400,
    });
    const feedE = createFeed({
      title: "Feed E",
      url: "https://example.com/e.xml",
      items: [
        createItem({
          guid: "e-1",
          feedTitle: "Feed E",
          feedUrl: "https://example.com/e.xml",
        }),
      ],
      lastUpdated: 500,
    });

    const plugin = createPluginWithSettings([
      feedA,
      feedB,
      feedC,
      feedD,
      feedE,
    ]);

    const updatedA = {
      ...feedA,
      lastUpdated: 999,
      items: [createItem({ guid: "a-1" }), createItem({ guid: "a-2" })],
    };
    const updatedB = {
      ...feedB,
      lastUpdated: 888,
      items: [
        createItem({
          guid: "b-1",
          feedTitle: "Feed B",
          feedUrl: "https://example.com/b.xml",
        }),
      ],
    };
    const updatedC = {
      ...feedC,
      lastUpdated: 777,
      items: [
        createItem({
          guid: "c-1",
          feedTitle: "Feed C",
          feedUrl: "https://example.com/c.xml",
        }),
      ],
    };
    const updatedD = {
      ...feedD,
      lastUpdated: 666,
      items: [
        createItem({
          guid: "d-1",
          feedTitle: "Feed D",
          feedUrl: "https://example.com/d.xml",
        }),
      ],
    };
    const updatedE = {
      ...feedE,
      lastUpdated: 555,
      items: [
        createItem({
          guid: "e-1",
          feedTitle: "Feed E",
          feedUrl: "https://example.com/e.xml",
        }),
      ],
    };

    const viewRefreshSpy = vi.fn();
    const sidebarRefreshSpy = vi.fn();
    const progressRefreshSpy = vi.fn();
    vi.spyOn(plugin, "getActiveDashboardView").mockResolvedValue({
      refreshSidebarOnly: sidebarRefreshSpy,
      refreshGlobalRefreshProgressOnly: progressRefreshSpy,
      refresh: viewRefreshSpy,
    } as unknown as Awaited<
      ReturnType<typeof RssDashboardPlugin.prototype.getActiveDashboardView>
    >);

    const resolvers: Array<() => void> = [];
    (
      plugin.feedParser.refreshFeed as unknown as {
        mockImplementation: (fn: (feed: Feed) => Promise<Feed>) => void;
      }
    ).mockImplementation((feed: Feed) => {
      if (feed.url === feedE.url) {
        return Promise.resolve(updatedE);
      }

      return new Promise<Feed>((resolve) => {
        resolvers.push(() => {
          switch (feed.url) {
            case feedA.url:
              resolve(updatedA);
              break;
            case feedB.url:
              resolve(updatedB);
              break;
            case feedC.url:
              resolve(updatedC);
              break;
            case feedD.url:
              resolve(updatedD);
              break;
          }
        });
      });
    });

    const refreshPromise = plugin.refreshFeeds();
    await flushMicrotasks();

    expect(
      plugin.feedParser.refreshFeed.mock.calls.map(
        (call: unknown[]) => (call[0] as Feed).url,
      ),
    ).toEqual([
      "https://example.com/a.xml",
      "https://example.com/b.xml",
      "https://example.com/c.xml",
      "https://example.com/d.xml",
      "https://example.com/e.xml",
    ]);
    expect(sidebarRefreshSpy).toHaveBeenCalledTimes(1);
    expect(viewRefreshSpy).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(251);
    resolvers[0]?.();
    vi.runAllTicks();
    await Promise.resolve();

    resolvers[1]?.();
    resolvers[2]?.();
    resolvers[3]?.();
    await refreshPromise;

    expect(plugin.settings.feeds[0].url).toBe("https://example.com/a.xml");
    expect(plugin.settings.feeds[0].lastUpdated).toBe(999);
    expect(plugin.settings.feeds[0].items).toHaveLength(2);
    expect(plugin.settings.feeds[1].url).toBe("https://example.com/b.xml");
    expect(plugin.settings.feeds[1].lastUpdated).toBe(888);
    expect(plugin.settings.feeds[2].lastUpdated).toBe(777);
    expect(plugin.settings.feeds[3].lastUpdated).toBe(666);
    expect(plugin.settings.feeds[4].lastUpdated).toBe(555);
    expect(
      plugin.feedParser.refreshFeed.mock.calls.map(
        (call: unknown[]) => (call[0] as Feed).url,
      ),
    ).toEqual([
      "https://example.com/a.xml",
      "https://example.com/b.xml",
      "https://example.com/c.xml",
      "https://example.com/d.xml",
      "https://example.com/e.xml",
    ]);

    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(sidebarRefreshSpy).toHaveBeenCalledTimes(1);
    expect(progressRefreshSpy).toHaveBeenCalled();
    expect(viewRefreshSpy).toHaveBeenCalledTimes(1);
    expect(plugin.feedParser.refreshAllFeeds).not.toHaveBeenCalled();

    const notices = getNoticeMessages(consoleLogSpy);
    expect(notices[0]).toBe("Refreshing 5 feeds...");
    expect(notices).toContain("Feeds refreshed: 5 feeds");
    expect(notices.some((notice) => notice.includes("Shift+click"))).toBe(
      false,
    );
  });

  it("refreshes a single feed via the direct path and does not require an active dashboard view", async () => {
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
    (
      plugin.feedParser.refreshFeed as unknown as {
        mockResolvedValue: (value: Feed) => void;
      }
    ).mockResolvedValue(updatedB);

    vi.spyOn(plugin, "getActiveDashboardView").mockResolvedValue(null);

    await plugin.refreshFeeds([feedB]);

    expect(plugin.feedParser.refreshFeed).toHaveBeenCalledWith(
      feedB,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(plugin.feedParser.refreshAllFeeds).not.toHaveBeenCalled();
    expect(plugin.settings.feeds[0].lastUpdated).toBe(100);
    expect(plugin.settings.feeds[1].lastUpdated).toBe(777);
    expect(plugin.saveData).toHaveBeenCalledTimes(1);

    const notices = getNoticeMessages(consoleLogSpy);
    expect(notices[0]).toBe("Refreshing Feed B...");
    expect(notices.some((m) => m.startsWith("Feeds refreshed:"))).toBe(false);
  });

  it("swallows direct refresh errors and shows an error Notice", async () => {
    const plugin = createPluginWithSettings([createFeed()]);
    vi.spyOn(Date, "now").mockReturnValue(9_876);

    (
      plugin.feedParser.refreshFeed as unknown as {
        mockRejectedValue: (error: Error) => void;
      }
    ).mockRejectedValue(new Error("network down"));

    await expect(
      plugin.refreshFeeds([plugin.settings.feeds[0]]),
    ).resolves.toBeUndefined();
    expect(plugin.settings.feeds[0].lastUpdated).toBe(1);
    expect(plugin.settings.feeds[0].lastRefreshAttemptCompletedAt).toBe(9_876);
    expect(plugin.settings.feeds[0].lastFetchError).toBe("network down");
    expect(plugin.saveData).toHaveBeenCalledTimes(1);

    const notices = getNoticeMessages(consoleLogSpy);
    expect(notices[0]).toBe("Refreshing Feed A...");
    expect(notices).toContain("Error refreshing  network down");
  });

  it("skips refresh cleanly when there are no feeds", async () => {
    const plugin = createPluginWithSettings([]);

    await expect(plugin.refreshFeeds()).resolves.toBeUndefined();

    expect(plugin.feedParser.refreshFeed).not.toHaveBeenCalled();
    expect(plugin.feedParser.refreshAllFeeds).not.toHaveBeenCalled();
    expect(plugin.saveData).not.toHaveBeenCalled();
    expect(getNoticeMessages(consoleLogSpy)).toEqual([]);
  });

  it("skips refresh when feedParser is not initialized yet", async () => {
    const plugin = createPluginWithSettings([createFeed()]);
    plugin.feedParser = undefined as unknown as TestFeedParser;
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    await expect(plugin.refreshFeeds()).resolves.toBeUndefined();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[RSS dashboard] Feed parser not initialized; skipping refresh.",
    );
    expect(plugin.saveData).not.toHaveBeenCalled();
    expect(getNoticeMessages(consoleLogSpy)).toEqual([]);
  });

  // ── TDD red: cancellable global/due refresh ────────────────────────────────

  it("forwards an abort signal to feedParser.refreshFeed during a cancellable global refresh", async () => {
    vi.useFakeTimers();
    const feedA = createFeed({ url: "https://example.com/a.xml" });
    const feedB = createFeed({ url: "https://example.com/b.xml" });
    const plugin = createPluginWithSettings([feedA, feedB]);

    (
      plugin.feedParser.refreshFeed as unknown as {
        mockImplementation: (
          fn: (feed: Feed, options?: unknown) => Promise<Feed>,
        ) => void;
      }
    ).mockImplementation(async (feed: Feed) => {
      return feed;
    });

    const refreshPromise = plugin.refreshFeeds();
    await flushMicrotasks();

    const firstCallArgs = plugin.feedParser.refreshFeed.mock.calls[0];
    expect(firstCallArgs[1]).toBeDefined();
    expect((firstCallArgs[1] as { signal?: AbortSignal }).signal).toBeDefined();
    expect(
      (firstCallArgs[1] as { signal?: AbortSignal }).signal,
    ).toBeInstanceOf(AbortSignal);

    await refreshPromise;
    vi.useRealTimers();
  });
});
