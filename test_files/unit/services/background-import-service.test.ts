/**
 * Phase 2 (Red) — BackgroundImportService unit tests
 *
 * FAILING OUTPUT (before BackgroundImportService is implemented):
 * Cannot find module '../../../src/services/background-import-service'
 *
 * These tests are RED until BackgroundImportService is implemented in Phase 3.
 * Each test covers a targeted scenario without any service code existing yet.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedIngestionCandidate,
  type FeedMetadata,
} from "../../../src/types/types";
import type { BackgroundImportServiceDeps } from "../../../src/services/background-import-service";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Testable interface for accessing private members of BackgroundImportService
interface TestableBackgroundImportService {
  createPlaceholderFeed: (candidate: FeedIngestionCandidate) => Feed;
  parseFeedWithTimeout: (url: string) => Promise<Feed>;
  mergeBackgroundImportedFeed: (
    feedMetadata: FeedMetadata,
    parsedFeed: Feed,
  ) => void;
  updateBackgroundImportProgress: (
    current: number,
    total: number,
    currentFeedTitle: string,
  ) => void;
  processBackgroundImportWorker: (
    saveEvery: number,
    renderEvery: number,
    shouldRenderDuringImport: boolean,
  ) => Promise<void>;
  processBackgroundImportQueue: () => Promise<void>;
  backgroundImportQueue: FeedMetadata[];
  backgroundImportTotalCount: number;
  backgroundImportInFlightUrls: Set<string>;
  backgroundImportProcessedCount: number;
  importStatusBarItem: HTMLElement | null;
  ownsGlobalOperation: boolean;
}

// Minimal mock interface for feedParser at test boundary
interface TestFeedParser {
  parseFeed: (url: string) => Promise<Feed>;
}

vi.mock("../../../src/services/background-import-service", { spy: true });

describe("BackgroundImportService", () => {
  function makeSettings(overrides: Record<string, unknown> = {}) {
    return {
      ...DEFAULT_SETTINGS,
      defaultAutoDeleteDuration: 30,
      maxItems: 50,
      feeds: [] as Feed[],
      media: {
        ...DEFAULT_SETTINGS.media,
        defaultYouTubeFolder: "Videos",
        defaultPodcastFolder: "Podcasts",
      },
      ...overrides,
    };
  }

  function makeDeps(
    settingsOverrides: Record<string, unknown> = {},
  ): BackgroundImportServiceDeps & {
    _settings: ReturnType<typeof makeSettings>;
  } {
    const settings = makeSettings(settingsOverrides);
    return {
      getSettings: () => settings,
      feedParser: { parseFeed: vi.fn() } as unknown as TestFeedParser,
      getView: vi.fn().mockResolvedValue(null),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      ensureFolderExists: vi.fn().mockResolvedValue(false),
      addStatusBarItem: vi.fn(() => createDiv()),
      _settings: settings, // exposed for test assertions
    };
  }

  beforeEach(() => {
    installObsidianDomPolyfills();
    vi.clearAllMocks();
  });

  // ── createPlaceholderFeed ────────────────────────────────────────────────────

  describe("createPlaceholderFeed", () => {
    it("sets folder to defaultYouTubeFolder when mediaType is 'video' and no folder is provided", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const deps = makeDeps();
      const service = new BackgroundImportService(deps);

      const placeholder = (
        service as unknown as TestableBackgroundImportService
      ).createPlaceholderFeed({
        title: "Test Video Feed",
        url: "https://youtube.com/feeds/videos.xml",
        mediaType: "video",
      });

      expect(placeholder.mediaType).toBe("video");
      expect(placeholder.folder).toBe("Videos");
    });

    it("sets folder to defaultPodcastFolder when mediaType is 'podcast' and no folder is provided", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const deps = makeDeps();
      const service = new BackgroundImportService(deps);

      const placeholder = (
        service as unknown as TestableBackgroundImportService
      ).createPlaceholderFeed({
        title: "Test Podcast",
        url: "https://podcast.example.com/feed.xml",
        mediaType: "podcast",
      });

      expect(placeholder.mediaType).toBe("podcast");
      expect(placeholder.folder).toBe("Podcasts");
    });

    it("falls back to settings.defaultAutoDeleteDuration when candidate has no autoDeleteDuration", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const deps = makeDeps({ defaultAutoDeleteDuration: 14 });
      const service = new BackgroundImportService(deps);

      const placeholder = (
        service as unknown as TestableBackgroundImportService
      ).createPlaceholderFeed({
        title: "No Duration",
        url: "https://example.com/feed.xml",
      });

      expect(placeholder.autoDeleteDuration).toBe(14);
    });

    it("falls back to settings.maxItems when candidate has no maxItemsLimit", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const deps = makeDeps({ maxItems: 75 });
      const service = new BackgroundImportService(deps);

      const placeholder = (
        service as unknown as TestableBackgroundImportService
      ).createPlaceholderFeed({
        title: "No Limit",
        url: "https://example.com/feed.xml",
      });

      expect(placeholder.maxItemsLimit).toBe(75);
    });

    it("preserves an explicit Off scanInterval sentinel from the candidate", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const deps = makeDeps();
      const service = new BackgroundImportService(deps);

      const placeholder = (
        service as unknown as TestableBackgroundImportService
      ).createPlaceholderFeed({
        title: "Refresh Off",
        url: "https://example.com/refresh-off.xml",
        scanInterval: -1,
      });

      expect(placeholder.scanInterval).toBe(-1);
    });

    it("preserves exclude-from-refresh from the candidate", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const deps = makeDeps();
      const service = new BackgroundImportService(deps);

      const placeholder = (
        service as unknown as TestableBackgroundImportService
      ).createPlaceholderFeed({
        title: "Muted Feed",
        url: "https://example.com/muted.xml",
        excludeFromRefresh: true,
      });

      expect(placeholder.excludeFromRefresh).toBe(true);
    });

    it("preserves an explicit article mediaType instead of relying on the default fallback", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const deps = makeDeps();
      const service = new BackgroundImportService(deps);

      const placeholder = (
        service as unknown as TestableBackgroundImportService
      ).createPlaceholderFeed({
        title: "Typed Article",
        url: "https://example.com/article.xml",
        mediaType: "article",
      });

      expect(placeholder.mediaType).toBe("article");
      expect(placeholder.folder).toBe("Uncategorized");
    });
  });

  describe("parseFeedWithTimeout", () => {
    it("reports a successfully hydrated imported feed for post-import work", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const onFeedImported = vi.fn();
      const importedFeed: Feed = {
        title: "Imported Feed",
        url: "https://example.com/imported.xml",
        folder: "Inbox",
        items: [
          {
            title: "Article",
            link: "https://example.com/article",
            description: "",
            pubDate: "2026-08-21",
            guid: "article",
            read: false,
            starred: false,
            tags: [],
            feedTitle: "Imported Feed",
            feedUrl: "https://example.com/imported.xml",
            coverImage: "https://example.com/cover.jpg",
          },
        ],
        lastUpdated: 0,
        mediaType: "article",
      };
      const deps = makeDeps({
        feeds: [
          {
            ...importedFeed,
            items: [],
          },
        ],
      });
      deps.feedParser.parseFeed = vi.fn().mockResolvedValue(importedFeed);
      const service = new BackgroundImportService({
        ...deps,
        onFeedImported,
      });

      (
        service as unknown as TestableBackgroundImportService
      ).backgroundImportQueue = [deps._settings.feeds[0]];
      (
        service as unknown as TestableBackgroundImportService
      ).backgroundImportTotalCount = 1;

      await (
        service as unknown as TestableBackgroundImportService
      ).processBackgroundImportWorker(1, 1, false);

      expect(onFeedImported).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://example.com/imported.xml",
          items: [expect.objectContaining({ coverImage: "https://example.com/cover.jpg" })],
        }),
      );
    });

    it("does not retry timeout failures", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const deps = makeDeps();
      const parsedFeed: Feed = {
        title: "Recovered Feed",
        url: "https://example.com/recovered.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "video",
      };
      deps.feedParser.parseFeed = vi
        .fn()
        .mockRejectedValueOnce(new Error("Timed out"))
        .mockResolvedValueOnce(parsedFeed);
      const service = new BackgroundImportService(deps);

      await expect(
        (
          service as unknown as TestableBackgroundImportService
        ).parseFeedWithTimeout("https://example.com/recovered.xml"),
      ).rejects.toThrow("Timed out");
      expect(deps.feedParser.parseFeed).toHaveBeenCalledTimes(1);
    });

    it("marks a feed as timed out after exhausting the hard timeout", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const deps = makeDeps({
        feeds: [
          {
            title: "Slow Feed",
            url: "https://example.com/slow.xml",
            folder: "Inbox",
            items: [],
            lastUpdated: 0,
            mediaType: "article",
          },
        ],
      });
      deps.feedParser.parseFeed = vi
        .fn()
        .mockRejectedValue(new Error("Timed out"));
      const service = new BackgroundImportService(deps);

      (
        service as unknown as TestableBackgroundImportService
      ).backgroundImportQueue = [deps._settings.feeds[0]];
      (
        service as unknown as TestableBackgroundImportService
      ).backgroundImportTotalCount = 1;
      await (
        service as unknown as TestableBackgroundImportService
      ).processBackgroundImportWorker(1, 1, false);

      const updatedFeed = deps._settings.feeds[0] as Feed & {
        importStatus?: string;
        importError?: string;
      };

      expect(deps.feedParser.parseFeed).toHaveBeenCalledTimes(1);
      expect(updatedFeed.importStatus).toBe("timed_out");
      expect(updatedFeed.importError).toBeTruthy();
    });
  });

  // ── mergeBackgroundImportedFeed ──────────────────────────────────────────────

  describe("mergeBackgroundImportedFeed", () => {
    it("updates title, author, and items from parsedFeed when feed URL matches", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const existingFeed: Feed = {
        title: "Old Title",
        url: "https://example.com/feed.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
      };
      const deps = makeDeps();
      deps._settings.feeds = [existingFeed];
      const service = new BackgroundImportService(deps);

      const feedMetadata = {
        title: "Old Title",
        url: "https://example.com/feed.xml",
        folder: "Inbox",
        lastUpdated: 0,
      };
      const parsedFeed: Feed = {
        title: "New Title",
        url: "https://example.com/feed.xml",
        folder: "Inbox",
        author: "Author Name",
        items: [
          {
            guid: "1",
            title: "Article 1",
            link: "https://example.com/1",
            description: "Body",
            content: "Body",
            pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
            read: false,
            starred: false,
            tags: [],
            feedTitle: "New Title",
            feedUrl: "https://example.com/feed.xml",
            coverImage: "",
          },
        ],
        lastUpdated: 0,
        mediaType: "article",
      };

      (
        service as unknown as TestableBackgroundImportService
      ).mergeBackgroundImportedFeed(feedMetadata, parsedFeed);

      expect(deps._settings.feeds[0].title).toBe("New Title");
      expect(deps._settings.feeds[0].author).toBe("Author Name");
      expect(deps._settings.feeds[0].items).toHaveLength(1);
    });

    it("is a no-op when the feed URL is not in settings.feeds", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const deps = makeDeps();
      deps._settings.feeds = [];
      const service = new BackgroundImportService(deps);

      const feedMetadata = {
        title: "Missing",
        url: "https://missing.example.com/feed.xml",
        folder: "Inbox",
        lastUpdated: 0,
      };
      const parsedFeed: Feed = {
        title: "Missing",
        url: "https://missing.example.com/feed.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
      };

      expect(() =>
        (
          service as unknown as TestableBackgroundImportService
        ).mergeBackgroundImportedFeed(feedMetadata, parsedFeed),
      ).not.toThrow();
      expect(deps._settings.feeds).toHaveLength(0);
    });
  });

  // ── updateBackgroundImportProgress ──────────────────────────────────────────

  describe("updateBackgroundImportProgress", () => {
    it("updates the .import-statusbar-text span with current/total and feed title", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const statusBarItem = createDiv();
      const textSpan = createSpan();
      textSpan.className = "import-statusbar-text";
      statusBarItem.appendChild(textSpan);

      const deps = makeDeps();
      deps.addStatusBarItem = vi.fn(() => statusBarItem);
      const service = new BackgroundImportService(deps);
      (
        service as unknown as TestableBackgroundImportService
      ).importStatusBarItem = statusBarItem;

      (
        service as unknown as TestableBackgroundImportService
      ).updateBackgroundImportProgress(3, 10, "My Feed");

      expect(textSpan.textContent).toContain("3/10");
      expect(textSpan.textContent).toContain("My Feed");
    });
  });

  // ── processBackgroundImportFeed error logging ───────────────────────────────

  describe("processBackgroundImportFeed error handling", () => {
    it("logs a per-feed failure with the feed URL instead of throwing", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const deps = makeDeps({
        feeds: [
          {
            title: "Broken Feed",
            url: "https://example.com/broken.xml",
            folder: "Inbox",
            items: [],
            lastUpdated: 0,
            mediaType: "article",
          },
        ],
      });
      deps.feedParser.parseFeed = vi
        .fn()
        .mockRejectedValue(new Error("Network unreachable"));
      const service = new BackgroundImportService(deps);

      (
        service as unknown as TestableBackgroundImportService
      ).backgroundImportQueue = [deps._settings.feeds[0]];
      (
        service as unknown as TestableBackgroundImportService
      ).backgroundImportTotalCount = 1;

      await expect(
        (
          service as unknown as TestableBackgroundImportService
        ).processBackgroundImportWorker(1, 1, false),
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("https://example.com/broken.xml"),
      );
      const updatedFeed = deps._settings.feeds[0] as Feed & {
        importStatus?: string;
      };
      expect(updatedFeed.importStatus).toBe("failed");
    });
  });

  // ── processBackgroundImportQueue completion signaling ───────────────────────

  describe("processBackgroundImportQueue", () => {
    it("calls onImportQueueDrained with the processed count instead of showing a Notice", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const onImportQueueDrained = vi.fn();
      const feed: Feed = {
        title: "Feed",
        url: "https://example.com/feed.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
      };
      const deps = makeDeps({ feeds: [feed] });
      deps.feedParser.parseFeed = vi.fn().mockResolvedValue(feed);
      const service = new BackgroundImportService({
        ...deps,
        onImportQueueDrained,
      });

      (
        service as unknown as TestableBackgroundImportService
      ).backgroundImportQueue = [{ ...feed, importStatus: "pending" }];
      (
        service as unknown as TestableBackgroundImportService
      ).backgroundImportTotalCount = 1;

      await (
        service as unknown as TestableBackgroundImportService
      ).processBackgroundImportQueue();

      expect(onImportQueueDrained).toHaveBeenCalledWith(1);
    });

    it("does not call onImportQueueDrained when the run was cancelled", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const onImportQueueDrained = vi.fn();
      const feed: Feed = {
        title: "Feed",
        url: "https://example.com/feed.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
      };
      const deps = makeDeps({ feeds: [feed] });
      deps.feedParser.parseFeed = vi.fn().mockResolvedValue(feed);
      const service = new BackgroundImportService({
        ...deps,
        isGlobalOperationCancelled: () => true,
        onImportQueueDrained,
      });

      (
        service as unknown as TestableBackgroundImportService
      ).backgroundImportQueue = [{ ...feed, importStatus: "pending" }];
      (
        service as unknown as TestableBackgroundImportService
      ).backgroundImportTotalCount = 1;

      await (
        service as unknown as TestableBackgroundImportService
      ).processBackgroundImportQueue();

      expect(onImportQueueDrained).not.toHaveBeenCalled();
    });

    it("does not self-restart when the run owned and cancelled the global operation, even though endGlobalOperation resets the cancellation flag", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const feed: Feed = {
        title: "Feed",
        url: "https://example.com/feed.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
      };
      const deps = makeDeps({ feeds: [feed] });
      deps.feedParser.parseFeed = vi.fn().mockResolvedValue(feed);

      // Mirrors main.ts: cancelGlobalRefresh() sets the flag true, and
      // endGlobalOperation() (called from this service's finally block)
      // unconditionally resets it back to false.
      let cancelled = true;
      const endGlobalOperation = vi.fn(async () => {
        cancelled = false;
      });
      const isGlobalOperationCancelled = vi.fn(() => cancelled);

      const service = new BackgroundImportService({
        ...deps,
        endGlobalOperation,
        isGlobalOperationCancelled,
      });
      const testable = service as unknown as TestableBackgroundImportService;
      testable.ownsGlobalOperation = true;
      // A cancelled worker returns without shifting its feed off the queue,
      // so one item remains when the finally block runs.
      testable.backgroundImportQueue = [{ ...feed, importStatus: "pending" }];
      testable.backgroundImportTotalCount = 1;

      const processQueueSpy = vi.spyOn(testable, "processBackgroundImportQueue");

      await testable.processBackgroundImportQueue();
      // Flush the microtask queue so a wrongful `void this.processBackgroundImportQueue()`
      // recursive call (fire-and-forget) has a chance to register on the spy.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(endGlobalOperation).toHaveBeenCalledTimes(1);
      expect(processQueueSpy).toHaveBeenCalledTimes(1);
    });

    it("stops reporting cancelled-but-never-fetched feeds as pending import once the run finishes draining", async () => {
      // Regression test: a cancelled worker returns without shifting its
      // claimed feed off backgroundImportQueue, so backgroundImportQueuedUrls
      // (which isFeedPendingImport() reads) used to keep those URLs marked
      // "pending" forever — silently excluding them from every future global
      // refresh (main.ts's getRefreshableFeeds()) until the exact same feed
      // happened to be re-queued and this time drain without cancellation.
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const feedA: Feed = {
        title: "Feed A",
        url: "https://example.com/a.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
      };
      const feedB: Feed = {
        title: "Feed B",
        url: "https://example.com/b.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
      };
      const deps = makeDeps({ feeds: [feedA, feedB] });
      deps.feedParser.parseFeed = vi.fn().mockResolvedValue(feedA);
      const service = new BackgroundImportService({
        ...deps,
        // Cancelled from the very start: neither worker ever shifts a feed
        // off the queue, so both stay stuck exactly as in the bug report.
        isGlobalOperationCancelled: () => true,
      });

      service.startBackgroundImport([feedA, feedB]);
      await vi.waitFor(() => expect(service.isBackgroundImporting).toBe(false));

      expect(service.isFeedPendingImport(feedA.url)).toBe(false);
      expect(service.isFeedPendingImport(feedB.url)).toBe(false);
      expect(
        (service as unknown as TestableBackgroundImportService)
          .backgroundImportQueue,
      ).toHaveLength(0);
    });
  });
});
