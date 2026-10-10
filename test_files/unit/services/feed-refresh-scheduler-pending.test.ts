import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedRefreshScheduler } from "../../../src/services/feed-refresh-scheduler";
import type { Feed } from "../../../src/types/types";

function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Example feed",
    url: "https://example.com/feed.xml",
    folder: "RSS",
    items: [],
    lastUpdated: 0,
    scanInterval: 5,
    lastRefreshAttemptCompletedAt: 0,
    ...overrides,
  };
}

function createPendingRefresh() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness() {
  const feed = createFeed();
  const state = {
    feeds: [feed],
    globalInterval: 0,
    globalCompletedAt: 0,
  };
  const pending = createPendingRefresh();
  const completeFeeds = (feeds: Feed[]) => {
    for (const refreshedFeed of feeds) {
      refreshedFeed.lastRefreshAttemptCompletedAt = Date.now();
    }
  };
  const requestDueFeeds = vi
    .fn(async (feeds: Feed[]) => completeFeeds(feeds))
    .mockImplementationOnce(async (feeds) => {
      await pending.promise;
      completeFeeds(feeds);
    });
  const requestGlobalRefresh = vi.fn(async () => {
    state.globalCompletedAt = Date.now();
  });
  const scheduler = new FeedRefreshScheduler({
    getFeeds: () => state.feeds,
    getGlobalIntervalMinutes: () => state.globalInterval,
    getLastGlobalRefreshCompletedAt: () => state.globalCompletedAt,
    isBatchRunning: () => false,
    requestDueFeeds,
    requestGlobalRefresh,
  });
  return {
    feed,
    state,
    pending,
    requestDueFeeds,
    requestGlobalRefresh,
    scheduler,
  };
}

describe("FeedRefreshScheduler with a pending automatic refresh", () => {
  let scheduler: FeedRefreshScheduler | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    scheduler?.stop();
    scheduler = undefined;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function startPendingRefresh() {
    const harness = createHarness();
    scheduler = harness.scheduler;
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(1);
    return harness;
  }

  it("uses a changed custom interval after the pending refresh completes", async () => {
    const harness = await startPendingRefresh();
    harness.feed.scanInterval = 10;
    harness.scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    harness.pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(600_000 - 1);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(2);
  });

  it.each(["removed", "disabled"])(
    "does not rearm when the pending feed is %s",
    async (change) => {
      const harness = await startPendingRefresh();
      if (change === "removed") {
        harness.state.feeds = [];
      } else {
        harness.feed.scanInterval = -1;
      }
      harness.scheduler.reschedule();
      harness.pending.resolve();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(harness.requestDueFeeds).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("refreshes a due replacement from the current feed list after settlement", async () => {
    const harness = await startPendingRefresh();
    const replacement = createFeed({
      url: "https://example.com/replacement.xml",
    });
    harness.state.feeds = [replacement];
    harness.scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(1);

    harness.pending.resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(2);
    expect(harness.requestDueFeeds).toHaveBeenLastCalledWith([replacement]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("does not drop another feed that becomes due while waiting", async () => {
    const harness = await startPendingRefresh();
    const later = createFeed({
      url: "https://example.com/later.xml",
      lastRefreshAttemptCompletedAt: Date.now() - 299_000,
    });
    harness.state.feeds.push(later);
    harness.scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(1);

    harness.pending.resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(2);
    expect(harness.requestDueFeeds).toHaveBeenLastCalledWith([later]);
  });

  it("uses the current global interval when a pending feed switches to it", async () => {
    const harness = await startPendingRefresh();
    harness.feed.scanInterval = 0;
    harness.state.globalInterval = 10;
    harness.state.globalCompletedAt = Date.now();
    harness.scheduler.reschedule();
    harness.pending.resolve();
    await vi.advanceTimersByTimeAsync(600_000 - 1);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(1);
    expect(harness.requestGlobalRefresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.requestGlobalRefresh).toHaveBeenCalledTimes(1);
  });

  it("leaves no timer if stopped before the pending refresh settles", async () => {
    const harness = await startPendingRefresh();
    harness.scheduler.stop();
    expect(vi.getTimerCount()).toBe(0);
    harness.pending.resolve();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not duplicate a pending refresh across stop and start", async () => {
    const harness = await startPendingRefresh();
    harness.scheduler.stop();
    harness.scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    harness.pending.resolve();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(harness.requestDueFeeds).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("also guards pending global refreshes and keeps cancellation deferral", async () => {
    const harness = createHarness();
    scheduler = harness.scheduler;
    harness.feed.scanInterval = 0;
    harness.state.globalInterval = 5;
    harness.requestGlobalRefresh.mockImplementationOnce(
      () => harness.pending.promise,
    );
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.requestGlobalRefresh).toHaveBeenCalledTimes(1);

    scheduler.deferGlobalRefresh();
    scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(harness.requestGlobalRefresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    harness.state.globalCompletedAt = Date.now();
    harness.pending.resolve();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(harness.requestGlobalRefresh).toHaveBeenCalledTimes(2);
    expect(harness.requestDueFeeds).not.toHaveBeenCalled();
  });
});
