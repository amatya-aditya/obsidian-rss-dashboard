import { describe, expect, it } from "vitest";
import type { Feed } from "../../../src/types/types";
import {
  getDueFeeds,
  getEffectiveRefreshIntervalMinutes,
  getNextRefreshDueAt,
} from "../../../src/utils/refresh-intervals";

function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Example feed",
    url: "https://example.com/feed.xml",
    folder: "RSS",
    items: [],
    lastUpdated: 0,
    ...overrides,
  };
}

describe("per-feed refresh intervals", () => {
  it("uses a positive custom interval even when the global interval is off", () => {
    expect(getEffectiveRefreshIntervalMinutes(createFeed({ scanInterval: 15 }), 0)).toBe(15);
  });

  it("inherits the global interval when the feed uses the global setting", () => {
    expect(getEffectiveRefreshIntervalMinutes(createFeed({ scanInterval: 0 }), 30)).toBe(30);
    expect(getEffectiveRefreshIntervalMinutes(createFeed(), 30)).toBe(30);
  });

  it("disables automatic refresh for an off feed, excluded feed, or invalid interval", () => {
    expect(getEffectiveRefreshIntervalMinutes(createFeed({ scanInterval: -1 }), 30)).toBeNull();
    expect(getEffectiveRefreshIntervalMinutes(createFeed({ excludeFromRefresh: true }), 30)).toBeNull();
    expect(getEffectiveRefreshIntervalMinutes(createFeed({ scanInterval: Number.NaN }), 30)).toBeNull();
  });

  it("derives due time from completion without persisting it", () => {
    const feed = createFeed({ lastRefreshAttemptCompletedAt: 1_000, scanInterval: 5 });
    expect(getNextRefreshDueAt(feed, 30)).toBe(301_000);
  });

  it("makes a never-checked eligible feed due promptly", () => {
    const feed = createFeed({ scanInterval: 5, lastRefreshAttemptCompletedAt: 0 });
    expect(getNextRefreshDueAt(feed, 30)).toBe(0);
    expect(getDueFeeds([feed], 30, 1)).toEqual([feed]);
  });

  it("recalculates the same completion anchor when an interval changes", () => {
    const feed = createFeed({ lastRefreshAttemptCompletedAt: 1_000, scanInterval: 5 });
    expect(getNextRefreshDueAt(feed, 30)).toBe(301_000);
    feed.scanInterval = 10;
    expect(getNextRefreshDueAt(feed, 30)).toBe(601_000);
  });

  it("selects only feeds due at the boundary", () => {
    const due = createFeed({ url: "https://example.com/due.xml", lastRefreshAttemptCompletedAt: 1_000, scanInterval: 1 });
    const later = createFeed({ url: "https://example.com/later.xml", lastRefreshAttemptCompletedAt: 1_001, scanInterval: 1 });
    expect(getDueFeeds([due, later], 30, 61_000)).toEqual([due]);
  });
});
