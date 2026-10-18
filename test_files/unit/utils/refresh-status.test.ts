import { describe, expect, it } from "vitest";
import type { Feed } from "../../../src/types/types";
import {
  formatRefreshStatusTime,
  getFailingFeeds,
  getRefreshStatus,
  getRefreshStatusSegments,
} from "../../../src/utils/refresh-status";

function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Feed",
    url: "https://example.com/feed.xml",
    folder: "News",
    items: [],
    lastUpdated: 0,
    mediaType: "article",
    ...overrides,
  };
}

describe("getRefreshStatus", () => {
  it("uses only the explicit global completion for all-feed scope", () => {
    const status = getRefreshStatus({
      feeds: [createFeed({ lastRefreshAttemptCompletedAt: 100 })],
      globalIntervalMinutes: 30,
      globalCompletionAt: 200,
      scope: "all",
    });

    expect(status.completionAt).toBe(200);
    expect(status.completionLabel).toBe("Last global refresh");
  });

  it("reports the oldest eligible completion and separate excluded members for an aggregate", () => {
    const status = getRefreshStatus({
      feeds: [
        createFeed({ url: "one", lastRefreshAttemptCompletedAt: 300 }),
        createFeed({ url: "two", lastRefreshAttemptCompletedAt: 100 }),
        createFeed({
          url: "excluded",
          excludeFromRefresh: true,
          lastRefreshAttemptCompletedAt: 20,
        }),
      ],
      globalIntervalMinutes: 30,
      activeFeedUrls: new Set(["one", "excluded"]),
      scope: "aggregate",
    });

    expect(status.completionAt).toBe(100);
    expect(status.excludedCount).toBe(1);
    expect(status.refreshingCount).toBe(1);
  });

  it("treats an eligible never-checked feed as not yet and an excluded-only scope as not applicable", () => {
    const notYet = getRefreshStatus({
      feeds: [createFeed({ lastRefreshAttemptCompletedAt: 0 })],
      globalIntervalMinutes: 30,
      scope: "aggregate",
    });
    const notApplicable = getRefreshStatus({
      feeds: [createFeed({ excludeFromRefresh: true })],
      globalIntervalMinutes: 30,
      scope: "aggregate",
    });

    expect(notYet.completionAt).toBe(0);
    expect(notYet.neverCheckedCount).toBe(1);
    expect(notApplicable.isApplicable).toBe(false);
  });
});

describe("getRefreshStatus failing count", () => {
  it("counts a feed holding either kind of feed error", () => {
    const status = getRefreshStatus({
      feeds: [
        createFeed({ url: "ok" }),
        createFeed({ url: "refresh", lastFetchError: "HTTP 500" }),
        createFeed({
          url: "import-failed",
          importStatus: "failed",
          importError: "boom",
        }),
        createFeed({
          url: "import-timeout",
          importStatus: "timed_out",
          importError: "slow",
        }),
      ],
      globalIntervalMinutes: 30,
      scope: "all",
    });

    expect(status.failingCount).toBe(3);
  });

  it("counts a feed holding both kinds once", () => {
    const status = getRefreshStatus({
      feeds: [
        createFeed({
          url: "both",
          lastFetchError: "HTTP 500",
          importStatus: "failed",
          importError: "boom",
        }),
      ],
      globalIntervalMinutes: 30,
      scope: "all",
    });

    expect(status.failingCount).toBe(1);
  });

  it("does not count an import that is still running", () => {
    const status = getRefreshStatus({
      feeds: [createFeed({ url: "busy", importStatus: "processing" })],
      globalIntervalMinutes: 30,
      scope: "all",
    });

    expect(status.failingCount).toBe(0);
  });

  it("excludes a feed excluded from refresh in all scope but counts it in feed scope", () => {
    const feed = createFeed({
      url: "excluded",
      excludeFromRefresh: true,
      importStatus: "failed",
      importError: "boom",
    });

    expect(
      getRefreshStatus({
        feeds: [feed],
        globalIntervalMinutes: 30,
        scope: "all",
      }).failingCount,
    ).toBe(0);
    expect(
      getRefreshStatus({
        feeds: [feed],
        globalIntervalMinutes: 30,
        scope: "feed",
      }).failingCount,
    ).toBe(1);
  });
});

describe("getFailingFeeds", () => {
  it("returns the in-scope failing feeds, matching the count", () => {
    const feeds = [
      createFeed({ url: "ok" }),
      createFeed({ url: "refresh", lastFetchError: "HTTP 500" }),
      createFeed({
        url: "import",
        importStatus: "failed",
        importError: "boom",
      }),
      createFeed({
        url: "excluded",
        excludeFromRefresh: true,
        importStatus: "failed",
        importError: "boom",
      }),
    ];

    const allScope = getFailingFeeds({ feeds, scope: "all" });
    expect(allScope.map((feed) => feed.url)).toEqual(["refresh", "import"]);
    expect(allScope).toHaveLength(
      getRefreshStatus({ feeds, globalIntervalMinutes: 30, scope: "all" })
        .failingCount,
    );

    expect(
      getFailingFeeds({ feeds, scope: "feed" }).map((feed) => feed.url),
    ).toEqual(["refresh", "import", "excluded"]);
  });
});

describe("getRefreshStatusSegments", () => {
  it("shows the inline message for a single failing feed, capped for display", () => {
    const status = getRefreshStatus({
      feeds: [createFeed({ url: "refresh", lastFetchError: "A".repeat(200) })],
      globalIntervalMinutes: 30,
      scope: "feed",
    });

    const [segment] = getRefreshStatusSegments(status);

    expect(segment.startsWith("Refresh failed: ")).toBe(true);
    expect(segment).toHaveLength("Refresh failed: ".length + 80);
    expect(segment.endsWith("...")).toBe(true);
  });

  it("shows the import failure for a single feed whose import failed", () => {
    const status = getRefreshStatus({
      feeds: [
        createFeed({
          url: "import",
          importStatus: "failed",
          importError: "boom",
        }),
      ],
      globalIntervalMinutes: 30,
      scope: "feed",
    });

    expect(getRefreshStatusSegments(status)).toEqual(["Import failed: boom"]);
  });

  it("keeps the honest aggregate count for multi-feed scopes", () => {
    const status = getRefreshStatus({
      feeds: [
        createFeed({ url: "refresh", lastFetchError: "HTTP 500" }),
        createFeed({
          url: "import",
          importStatus: "failed",
          importError: "boom",
        }),
      ],
      globalIntervalMinutes: 30,
      scope: "all",
    });

    expect(getRefreshStatusSegments(status)).toEqual([
      "Feeds currently failing: 2",
    ]);
  });

  it("has no failing segment when nothing is failing", () => {
    const status = getRefreshStatus({
      feeds: [createFeed()],
      globalIntervalMinutes: 30,
      scope: "aggregate",
    });

    expect(getRefreshStatusSegments(status)).toEqual([]);
  });
});

describe("formatRefreshStatusTime", () => {
  it("formats detailed timestamps with seconds and timezone without throwing", () => {
    expect(() =>
      formatRefreshStatusTime(1_789_012_345_000, true),
    ).not.toThrow();
  });
});
