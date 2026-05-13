/**
 * Phase 2 (Red) — settings-loader unit tests
 *
 * FAILING OUTPUT (before settings-loader is implemented):
 * Cannot find module '../../../src/utils/settings-loader'
 *
 * These tests are RED until the three pure functions are extracted in Phase 3.
 * Each test covers one targeted scenario without any settings-loader code existing yet.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

vi.mock("../../../src/utils/settings-loader", { spy: true });

vi.mock("../../../src/utils/settings-migration", () => ({
  migrateDisplaySettings: vi.fn(),
  migrateDefaultFilterToDashboardMultiFilters: vi.fn(),
  migrateKeywordRulesSettings: vi.fn().mockReturnValue(false),
  migrateMediaVideoTagSettings: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../src/utils/url-utils", () => ({
  canonicalizeItemIdentityUrl: vi.fn((url: string) => url),
}));

vi.mock("../../../src/utils/validation", () => ({
  normalizeRefreshIntervalMinutes: vi.fn((v: number) => v),
}));

function createFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Item",
    link: "https://example.com/item",
    description: "",
    pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
    guid: "item-guid",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    content: "",
    ...overrides,
  };
}

function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Feed",
    url: "https://example.com/feed.xml",
    folder: "Inbox",
    items: [],
    lastUpdated: 0,
    mediaType: "article",
    ...overrides,
  };
}

describe("settings-loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── loadAndNormalizeSettings ─────────────────────────────────────────────────

  describe("loadAndNormalizeSettings", () => {
    it("merges DEFAULT_SETTINGS with raw data", async () => {
      const { loadAndNormalizeSettings } =
        await import("../../../src/utils/settings-loader");

      const raw = { maxItems: 42 };
      const result = loadAndNormalizeSettings(raw);

      expect(result.maxItems).toBe(42);
      expect(result.refreshInterval).toBe(DEFAULT_SETTINGS.refreshInterval);
    });

    it("normalizes refreshInterval via normalizeRefreshIntervalMinutes", async () => {
      const { normalizeRefreshIntervalMinutes } =
        await import("../../../src/utils/validation");
      const { loadAndNormalizeSettings } =
        await import("../../../src/utils/settings-loader");
      (
        normalizeRefreshIntervalMinutes as ReturnType<typeof vi.fn>
      ).mockReturnValue(15);

      const raw = { refreshInterval: 7 };
      const result = loadAndNormalizeSettings(raw);

      expect(normalizeRefreshIntervalMinutes).toHaveBeenCalledWith(7);
      expect(result.refreshInterval).toBe(15);
    });

    it("applies defaultAutoDeleteDuration to feeds missing autoDeleteDuration", async () => {
      const { loadAndNormalizeSettings } =
        await import("../../../src/utils/settings-loader");

      const raw: Partial<RssDashboardSettings> = {
        defaultAutoDeleteDuration: 14,
        feeds: [createFeed({ title: "No Duration" })],
      };
      const result = loadAndNormalizeSettings(raw);

      expect(result.feeds[0].autoDeleteDuration).toBe(14);
    });

    it("applies maxItems to feeds missing maxItemsLimit", async () => {
      const { loadAndNormalizeSettings } =
        await import("../../../src/utils/settings-loader");

      const raw: Partial<RssDashboardSettings> = {
        maxItems: 75,
        feeds: [createFeed({ title: "No Limit" })],
      };
      const result = loadAndNormalizeSettings(raw);

      expect(result.feeds[0].maxItemsLimit).toBe(75);
    });

    it("normalizes all five page-size fields to allArticlesPageSize", async () => {
      const { loadAndNormalizeSettings } =
        await import("../../../src/utils/settings-loader");

      const raw = {
        allArticlesPageSize: 20,
        unreadArticlesPageSize: 99,
        readArticlesPageSize: 50,
        savedArticlesPageSize: 10,
        starredArticlesPageSize: 30,
      };
      const result = loadAndNormalizeSettings(raw);

      expect(result.unreadArticlesPageSize).toBe(20);
      expect(result.readArticlesPageSize).toBe(20);
      expect(result.savedArticlesPageSize).toBe(20);
      expect(result.starredArticlesPageSize).toBe(20);
    });
  });

  // ── migrateSettings ──────────────────────────────────────────────────────────

  describe("migrateSettings", () => {
    it("migrates savePath to articleSaving.defaultFolder", async () => {
      const { migrateSettings } =
        await import("../../../src/utils/settings-loader");

      const settings = {
        ...DEFAULT_SETTINGS,
        savePath: "/vault/Articles",
      } as any;
      migrateSettings(settings);

      expect(settings.articleSaving.defaultFolder).toBe("/vault/Articles");
      expect(settings.savePath).toBeUndefined();
    });

    it("migrates legacy template to articleSaving.defaultTemplate", async () => {
      const { migrateSettings } =
        await import("../../../src/utils/settings-loader");

      const settings = {
        ...DEFAULT_SETTINGS,
        template: "# {{title}}",
      } as any;
      migrateSettings(settings);

      expect(settings.articleSaving.defaultTemplate).toBe("# {{title}}");
      expect(settings.template).toBeUndefined();
    });

    it("migrates addSavedTag to articleSaving.addSavedTag", async () => {
      const { migrateSettings } =
        await import("../../../src/utils/settings-loader");

      const settings = {
        ...DEFAULT_SETTINGS,
        addSavedTag: true,
        articleSaving: {
          ...DEFAULT_SETTINGS.articleSaving,
          addSavedTag: undefined,
        },
      } as any;
      migrateSettings(settings);

      expect(settings.articleSaving.addSavedTag).toBe(true);
      expect(settings.addSavedTag).toBeUndefined();
    });

    it("initializes missing dashboardMultiFilters from defaults", async () => {
      const { migrateSettings } =
        await import("../../../src/utils/settings-loader");

      const settings = {
        ...DEFAULT_SETTINGS,
        dashboardMultiFilters: undefined,
      } as any;
      migrateSettings(settings);

      expect(settings.dashboardMultiFilters).toEqual(
        DEFAULT_SETTINGS.dashboardMultiFilters,
      );
    });

    it("normalizes dashboardMultiFilters.logic to 'OR' when invalid", async () => {
      const { migrateSettings } =
        await import("../../../src/utils/settings-loader");

      const settings = {
        ...DEFAULT_SETTINGS,
        dashboardMultiFilters: {
          statusFilters: [],
          tagFilters: [],
          logic: "INVALID",
        },
      } as any;
      migrateSettings(settings);

      expect(settings.dashboardMultiFilters.logic).toBe("OR");
    });
  });

  // ── dedupeAndNormalizeFeedItems ──────────────────────────────────────────────

  describe("dedupeAndNormalizeFeedItems", () => {
    it("merges duplicate GUIDs, preferring longer content", async () => {
      const { dedupeAndNormalizeFeedItems } =
        await import("../../../src/utils/settings-loader");

      const feeds: Feed[] = [
        createFeed({
          items: [
            createFeedItem({
              guid: "item-1",
              title: "Short",
              content: "Short body",
              link: "https://example.com/1",
            }),
            createFeedItem({
              guid: "item-1",
              title: "Short",
              content: "Much longer body content",
              link: "https://example.com/1",
            }),
          ],
        }),
      ];

      const changed = dedupeAndNormalizeFeedItems(feeds);

      expect(changed).toBe(true);
      expect(feeds[0].items).toHaveLength(1);
      expect(feeds[0].items[0].content).toBe("Much longer body content");
    });

    it("merges tags without duplicates", async () => {
      const { dedupeAndNormalizeFeedItems } =
        await import("../../../src/utils/settings-loader");

      const feeds: Feed[] = [
        createFeed({
          items: [
            createFeedItem({
              guid: "item-2",
              title: "A",
              link: "https://example.com/2",
              tags: [{ name: "tech", color: "#000000" }],
            }),
            createFeedItem({
              guid: "item-2",
              title: "A",
              link: "https://example.com/2",
              tags: [
                { name: "tech", color: "#000000" },
                { name: "news", color: "#111111" },
              ],
            }),
          ],
        }),
      ];

      dedupeAndNormalizeFeedItems(feeds);

      const tags = feeds[0].items[0].tags ?? [];
      const tagNames = tags.map((t: any) => t.name);
      expect(tagNames).toContain("tech");
      expect(tagNames).toContain("news");
      expect(tagNames.filter((n: string) => n === "tech")).toHaveLength(1);
    });

    it("sorts items newest-first", async () => {
      const { dedupeAndNormalizeFeedItems } =
        await import("../../../src/utils/settings-loader");

      const feeds: Feed[] = [
        createFeed({
          items: [
            createFeedItem({
              guid: "old",
              title: "Old",
              link: "https://example.com/old",
              pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
            }),
            createFeedItem({
              guid: "new",
              title: "New",
              link: "https://example.com/new",
              pubDate: "Mon, 01 Apr 2024 00:00:00 GMT",
            }),
          ],
        }),
      ];

      dedupeAndNormalizeFeedItems(feeds);

      expect(feeds[0].items[0].guid).toBe("new");
      expect(feeds[0].items[1].guid).toBe("old");
    });

    it("canonicalizes item GUIDs via canonicalizeItemIdentityUrl", async () => {
      const { canonicalizeItemIdentityUrl } =
        await import("../../../src/utils/url-utils");
      (
        canonicalizeItemIdentityUrl as ReturnType<typeof vi.fn>
      ).mockImplementation((url: string) => url.replace(/^https?:/, "https:"));
      const { dedupeAndNormalizeFeedItems } =
        await import("../../../src/utils/settings-loader");

      const feeds: Feed[] = [
        createFeed({
          items: [
            createFeedItem({
              guid: "http://example.com/item",
              title: "Item",
              link: "http://example.com/item",
            }),
          ],
        }),
      ];

      dedupeAndNormalizeFeedItems(feeds);

      expect(feeds[0].items[0].guid).toBe("https://example.com/item");
    });
  });
});
