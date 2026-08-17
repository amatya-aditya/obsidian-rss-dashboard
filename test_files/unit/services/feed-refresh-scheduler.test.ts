import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Feed } from "../../../src/types/types";
import { FeedRefreshScheduler } from "../../../src/services/feed-refresh-scheduler";

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

describe("FeedRefreshScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  it("arms one timer for the nearest due feed and requests a due snapshot", async () => {
    const near = createFeed({ scanInterval: 1, lastRefreshAttemptCompletedAt: 1_000 });
    const later = createFeed({ url: "https://example.com/later.xml", scanInterval: 5, lastRefreshAttemptCompletedAt: 1_000 });
    const requestDueFeeds = vi.fn().mockImplementation(async () => {
      near.lastRefreshAttemptCompletedAt = Date.now();
    });
    const scheduler = new FeedRefreshScheduler({
      getFeeds: () => [near, later],
      getGlobalIntervalMinutes: () => 30,
      isBatchRunning: () => false,
      requestDueFeeds,
    });

    scheduler.start();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(requestDueFeeds).toHaveBeenCalledWith([near]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("schedules a custom feed when the global interval is off", async () => {
    const custom = createFeed({ scanInterval: 2, lastRefreshAttemptCompletedAt: 0 });
    const requestDueFeeds = vi.fn().mockImplementation(async () => {
      custom.lastRefreshAttemptCompletedAt = Date.now();
    });
    const scheduler = new FeedRefreshScheduler({
      getFeeds: () => [custom],
      getGlobalIntervalMinutes: () => 0,
      isBatchRunning: () => false,
      requestDueFeeds,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(requestDueFeeds).toHaveBeenCalledWith([custom]);
  });

  it("does not overlap an active batch and stops cleanly", async () => {
    const feed = createFeed({ scanInterval: 1, lastRefreshAttemptCompletedAt: 0 });
    const requestDueFeeds = vi.fn().mockResolvedValue(undefined);
    const scheduler = new FeedRefreshScheduler({
      getFeeds: () => [feed],
      getGlobalIntervalMinutes: () => 30,
      isBatchRunning: () => true,
      requestDueFeeds,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(requestDueFeeds).not.toHaveBeenCalled();

    scheduler.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
