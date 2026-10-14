/**
 * Regression tests for the Discover single-add soft timeout (#949).
 *
 * A global single-feed add (`globalOperation`) takes the shared feed-operation
 * lock. A feed that never responds must not hold that lock forever: after
 * FEED_SOFT_TIMEOUT_MS the add gives up, releases the lock, stores nothing and
 * says so. The in-flight request cannot be cancelled, so its late result is
 * dropped rather than stored.
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
import { App } from "obsidian";
import { FeedSubscriptionService } from "../../../src/services/feed-subscription-service";
import { FeedOperationTracker } from "../../../src/services/feed-operation-tracker";
import { FEED_SOFT_TIMEOUT_MS } from "../../../src/services/feed-timeout";
import type { FeedParser } from "../../../src/services/feed-parser";
import type { PreviewImageCache } from "../../../src/services/preview-image-cache";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedRefreshState,
  type RssDashboardSettings,
} from "../../../src/types/types";

const DISCOVERED_URL = "https://example.com/discovered.xml";
const SECOND_URL = "https://example.com/second.xml";
const TIMEOUT_NOTICE =
  "Couldn't add \"Discovered\". The feed didn't respond in time.";

type ParseFeedMock = Mock<
  (
    url: string,
    existing?: Feed | null,
    options?: { signal?: AbortSignal; allowEmpty?: boolean },
  ) => Promise<Feed>
>;

interface Harness {
  service: FeedSubscriptionService;
  tracker: FeedOperationTracker;
  settings: RssDashboardSettings;
  parseFeed: ParseFeedMock;
  notices: string[];
}

function createHarness(): Harness {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.feeds = [];

  const notices: string[] = [];
  vi.spyOn(console, "debug").mockImplementation(
    (tag: unknown, message: unknown) => {
      if (tag === "[Stub Notice]") notices.push(String(message));
    },
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  const tracker = new FeedOperationTracker(App.createMock(), {
    activeRefreshState: new Map<string, FeedRefreshState>(),
    renderStatus: async () => {},
    renderSidebar: async () => {},
    renderSidebarStatus: async () => {},
    onCancelled: () => {},
  });

  const parseFeed: ParseFeedMock = vi.fn(
    async (url, existing) => ({ ...(existing as Feed), url }) as Feed,
  );

  const service = new FeedSubscriptionService({
    feedOperationTracker: tracker,
    previewImageCache: { warmFeed: vi.fn() } as unknown as PreviewImageCache,
    getSettings: () => settings,
    getFeedParser: () => ({ parseFeed }) as unknown as FeedParser,
    saveSettings: vi.fn(async () => {}),
    ensureFolderExists: vi.fn(async () => true),
    getActiveDashboardView: vi.fn(async () => null),
  });

  return { service, tracker, settings, parseFeed, notices };
}

function addDiscoverFeed(
  harness: Harness,
  title = "Discovered",
  url = DISCOVERED_URL,
): Promise<boolean> {
  return harness.service.addFeed(
    title,
    url,
    "Uncategorized",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { showNotice: false, globalOperation: true },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("feed subscription: single add soft timeout (#949)", () => {
  it("releases the lock, stores nothing and reports the timeout when the feed never responds", async () => {
    const harness = createHarness();
    harness.parseFeed.mockImplementation(() => new Promise<Feed>(() => {}));

    const added = addDiscoverFeed(harness);
    await vi.advanceTimersByTimeAsync(FEED_SOFT_TIMEOUT_MS);

    await expect(added).resolves.toBe(false);
    expect(harness.tracker.isRunning).toBe(false);
    expect(harness.settings.feeds).toEqual([]);
    expect(harness.notices).toContain(TIMEOUT_NOTICE);
  });

  it("still succeeds when the parse settles before the timeout", async () => {
    const harness = createHarness();
    let finish: () => void = () => {};
    harness.parseFeed.mockImplementation(
      () =>
        new Promise<Feed>((resolve) => {
          finish = () => resolve({} as Feed);
        }),
    );

    const added = addDiscoverFeed(harness);
    await vi.advanceTimersByTimeAsync(FEED_SOFT_TIMEOUT_MS - 1);
    finish();

    await expect(added).resolves.toBe(true);
    expect(harness.settings.feeds.map((feed) => feed.url)).toEqual([
      DISCOVERED_URL,
    ]);
    expect(harness.notices).not.toContain(TIMEOUT_NOTICE);
    expect(harness.tracker.isRunning).toBe(false);
  });

  it("lets a later add start once a timed-out add has released the lock", async () => {
    const harness = createHarness();
    harness.parseFeed.mockImplementationOnce(() => new Promise<Feed>(() => {}));

    const first = addDiscoverFeed(harness);
    await vi.advanceTimersByTimeAsync(FEED_SOFT_TIMEOUT_MS);
    await expect(first).resolves.toBe(false);

    const second = await addDiscoverFeed(harness, "Second", SECOND_URL);

    expect(second).toBe(true);
    expect(harness.settings.feeds.map((feed) => feed.url)).toEqual([
      SECOND_URL,
    ]);
  });

  it("drops a parse result that arrives after the soft timeout", async () => {
    const harness = createHarness();
    let finish: () => void = () => {};
    harness.parseFeed.mockImplementation(
      () =>
        new Promise<Feed>((resolve) => {
          finish = () => resolve({} as Feed);
        }),
    );

    const added = addDiscoverFeed(harness);
    await vi.advanceTimersByTimeAsync(FEED_SOFT_TIMEOUT_MS);
    await expect(added).resolves.toBe(false);

    // The abandoned request settles late; its feed must not be stored.
    finish();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.settings.feeds).toEqual([]);
    expect(harness.tracker.isRunning).toBe(false);
    expect(harness.notices).toEqual([TIMEOUT_NOTICE]);
  });

  it("reports a parse failure even though a Discover add suppresses the success notice", async () => {
    const harness = createHarness();
    harness.parseFeed.mockRejectedValueOnce(
      new Error("Not a valid RSS/Atom feed"),
    );

    const added = addDiscoverFeed(harness);

    await expect(added).resolves.toBe(false);
    expect(harness.notices).toContain(
      "Error parsing feed: Not a valid RSS/Atom feed",
    );
    expect(harness.settings.feeds).toEqual([]);
  });
});
