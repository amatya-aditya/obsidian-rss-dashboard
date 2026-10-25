import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { App } from "obsidian";
import {
  FEED_REFRESH_RENDER_THROTTLE_MS,
  FeedOperationTracker,
} from "../../../src/services/feed-operation-tracker";
import type { FeedRefreshState } from "../../../src/types/types";

/**
 * A refresh run's status ticks update open sidebars in place, so they never
 * interrupt a scroll; only the run's final flush redraws the sidebar (#1064).
 */
describe("FeedOperationTracker sidebar status redraws", () => {
  let renderSidebar: Mock<() => Promise<void>>;
  let renderSidebarStatus: Mock<() => Promise<void>>;
  let tracker: FeedOperationTracker;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    renderSidebar = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    renderSidebarStatus = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    tracker = new FeedOperationTracker(App.createMock(), {
      activeRefreshState: new Map<string, FeedRefreshState>(),
      renderStatus: vi.fn().mockResolvedValue(undefined),
      renderSidebar,
      renderSidebarStatus,
      onCancelled: () => {},
    });
  });

  afterEach(() => {
    tracker.dispose();
    vi.useRealTimers();
  });

  it("coalesces status ticks into one in-place update", () => {
    tracker.scheduleSidebarRender();
    tracker.scheduleSidebarRender();
    vi.advanceTimersByTime(FEED_REFRESH_RENDER_THROTTLE_MS);

    expect(renderSidebarStatus).toHaveBeenCalledTimes(1);
    expect(renderSidebar).not.toHaveBeenCalled();
  });

  it("redraws the sidebar fully when the run's last feed settles", () => {
    tracker.scheduleSidebarRender();
    tracker.scheduleSidebarRender(true);
    vi.advanceTimersByTime(FEED_REFRESH_RENDER_THROTTLE_MS);

    expect(renderSidebar).toHaveBeenCalledTimes(1);
    expect(renderSidebarStatus).not.toHaveBeenCalled();
  });
});

/**
 * A soft timeout races the arrival of the feed it guards. It must settle
 * "cancelled" for a signal that is already aborted without arming a timer, and
 * whichever side wins must release both the timer and the abort listener
 * (#1105).
 */
describe("FeedOperationTracker soft timeout", () => {
  const SOFT_TIMEOUT_MS = 5_000;
  let tracker: FeedOperationTracker;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    tracker = new FeedOperationTracker(App.createMock(), {
      activeRefreshState: new Map<string, FeedRefreshState>(),
      renderStatus: vi.fn().mockResolvedValue(undefined),
      renderSidebar: vi.fn().mockResolvedValue(undefined),
      renderSidebarStatus: vi.fn().mockResolvedValue(undefined),
      onCancelled: () => {},
    });
  });

  afterEach(() => {
    tracker.dispose();
    vi.useRealTimers();
  });

  it("resolves cancelled without arming a timer when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const soft = tracker.createSoftTimeout(SOFT_TIMEOUT_MS, controller.signal);

    expect(vi.getTimerCount()).toBe(0);
    await expect(soft.promise).resolves.toBe("cancelled");
  });

  it("resolves timeout on its own when no signal is supplied", async () => {
    const soft = tracker.createSoftTimeout(SOFT_TIMEOUT_MS);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(SOFT_TIMEOUT_MS);

    await expect(soft.promise).resolves.toBe("timeout");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer and removes its abort listener when the work wins the race", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const soft = tracker.createSoftTimeout(SOFT_TIMEOUT_MS, controller.signal);
    expect(vi.getTimerCount()).toBe(1);

    soft.cancel();

    await expect(soft.promise).resolves.toBe("cancelled");
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("clears its timer and removes its abort listener when the timeout fires", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const soft = tracker.createSoftTimeout(SOFT_TIMEOUT_MS, controller.signal);

    await vi.advanceTimersByTimeAsync(SOFT_TIMEOUT_MS);

    await expect(soft.promise).resolves.toBe("timeout");
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("clears its timer and removes its abort listener when the signal aborts first", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const soft = tracker.createSoftTimeout(SOFT_TIMEOUT_MS, controller.signal);

    controller.abort();

    await expect(soft.promise).resolves.toBe("cancelled");
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});

describe("FeedOperationTracker named operations", () => {
  it("cancels a sync without scheduling a deferred feed refresh", () => {
    const onCancelled = vi.fn();
    const tracker = new FeedOperationTracker(App.createMock(), {
      activeRefreshState: new Map<string, FeedRefreshState>(),
      renderStatus: vi.fn().mockResolvedValue(undefined),
      renderSidebar: vi.fn().mockResolvedValue(undefined),
      renderSidebarStatus: vi.fn().mockResolvedValue(undefined),
      onCancelled,
    });

    try {
      const signal = tracker.begin(0, "FreshRSS sync");
      expect(tracker.isRunning).toBe(true);
      tracker.cancel();

      expect(signal?.aborted).toBe(true);
      expect(onCancelled).not.toHaveBeenCalled();
    } finally {
      tracker.dispose();
    }
  });

  it("keeps the operation lock while disabling cancellation for persistence", async () => {
    const tracker = new FeedOperationTracker(App.createMock(), {
      activeRefreshState: new Map<string, FeedRefreshState>(),
      renderStatus: vi.fn().mockResolvedValue(undefined),
      renderSidebar: vi.fn().mockResolvedValue(undefined),
      renderSidebarStatus: vi.fn().mockResolvedValue(undefined),
      onCancelled: vi.fn(),
    });

    const signal = tracker.begin(0, "FreshRSS sync");
    tracker.disableCancellation();
    tracker.cancel();

    expect(tracker.isRunning).toBe(true);
    expect(tracker.isCancellable).toBe(false);
    expect(signal?.aborted).toBe(false);
    await tracker.end();
    tracker.dispose();
  });
});
