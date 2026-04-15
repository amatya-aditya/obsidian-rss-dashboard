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
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

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

  function makeDeps(settingsOverrides: Record<string, unknown> = {}) {
    const settings = makeSettings(settingsOverrides);
    return {
      getSettings: () => settings,
      feedParser: { parseFeed: vi.fn() } as any,
      getView: vi.fn().mockResolvedValue(null),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      ensureFolderExists: vi.fn().mockResolvedValue(false),
      addStatusBarItem: vi.fn(() => document.createElement("div")),
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

      const placeholder = (service as any).createPlaceholderFeed({
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

      const placeholder = (service as any).createPlaceholderFeed({
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

      const placeholder = (service as any).createPlaceholderFeed({
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

      const placeholder = (service as any).createPlaceholderFeed({
        title: "No Limit",
        url: "https://example.com/feed.xml",
      });

      expect(placeholder.maxItemsLimit).toBe(75);
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

      (service as any).mergeBackgroundImportedFeed(feedMetadata, parsedFeed);

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
        (service as any).mergeBackgroundImportedFeed(feedMetadata, parsedFeed),
      ).not.toThrow();
      expect(deps._settings.feeds).toHaveLength(0);
    });
  });

  // ── updateBackgroundImportProgress ──────────────────────────────────────────

  describe("updateBackgroundImportProgress", () => {
    it("updates the .import-statusbar-text span with current/total and feed title", async () => {
      const { BackgroundImportService } =
        await import("../../../src/services/background-import-service");
      const statusBarItem = document.createElement("div");
      const textSpan = document.createElement("span");
      textSpan.className = "import-statusbar-text";
      statusBarItem.appendChild(textSpan);

      const deps = makeDeps();
      deps.addStatusBarItem = vi.fn(() => statusBarItem);
      const service = new BackgroundImportService(deps);
      (service as any).importStatusBarItem = statusBarItem;

      (service as any).updateBackgroundImportProgress(3, 10, "My Feed");

      expect(textSpan.textContent).toContain("3/10");
      expect(textSpan.textContent).toContain("My Feed");
    });
  });
});
