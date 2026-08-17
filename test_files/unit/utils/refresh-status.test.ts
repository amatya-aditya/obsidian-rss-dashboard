import { describe, expect, it } from "vitest";
import type { Feed } from "../../../src/types/types";
import { getRefreshStatus } from "../../../src/utils/refresh-status";

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
        createFeed({ url: "excluded", excludeFromRefresh: true, lastRefreshAttemptCompletedAt: 20 }),
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
