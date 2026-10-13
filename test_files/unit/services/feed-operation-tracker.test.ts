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
