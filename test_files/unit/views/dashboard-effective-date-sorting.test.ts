import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { RssDashboardView } from "../../../src/views/dashboard-view";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    refilter(): void {}
    setSelectedArticle(): void {}
    setEmptyStateContext(): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor(..._args: unknown[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor(..._args: unknown[]) {}
    open(): void {}
    close(): void {}
  },
}));

vi.mock("../../../src/views/reader-view", () => ({
  ReaderView: class ReaderViewMock {},
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaverMock {
    constructor(..._args: unknown[]) {}
    verifyAllSavedArticles(): void {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

const makeItem = (
  guid: string,
  pubDate: string,
  overrides?: Partial<FeedItem>,
): FeedItem => ({
  title: guid,
  link: `https://example.com/${guid}`,
  description: "",
  pubDate,
  guid,
  read: false,
  starred: false,
  tags: [],
  feedTitle: "Test Feed",
  feedUrl: "https://example.com/feed.xml",
  coverImage: "",
  saved: false,
  ...overrides,
});

describe("Dashboard effective date sorting (getEffectiveDateMs)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  describe("Oldest/newest sort with undated items", () => {
    it("sorts undated items by firstSeenMs when useFirstSeenDateFallback is enabled (newest first)", async () => {
      const app = new App();
      const settings = cloneSettings();
      settings.useFirstSeenDateFallback = true;
      settings.articleSort = "newest";

      const now = Date.now();
      const feedUrl = "https://example.com/feed.xml";
      const feed: Feed = {
        title: "Test Feed",
        url: feedUrl,
        folder: "Test",
        items: [
          // Undated item with older firstSeenMs
          makeItem("item-1", "", { firstSeenMs: now - 10000 }),
          // Undated item with newer firstSeenMs
          makeItem("item-2", "", { firstSeenMs: now - 5000 }),
          // Normal dated item (newer than both)
          makeItem("item-3", new Date(now - 1000).toISOString()),
        ],
        lastUpdated: now,
      };
      settings.feeds = [feed];

      const plugin = {
        settings,
        saveSettings: vi.fn(async () => {}),
      };

      const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
      const view = new RssDashboardView(leaf, plugin as never);
      (view as unknown as { render: () => void }).render = vi.fn();
      (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;

      const filtered = (
        view as unknown as { getFilteredArticles: () => FeedItem[] }
      ).getFilteredArticles();

      // Newest first by effective date: item-3, item-2, item-1
      expect(filtered[0].guid).toBe("item-3");
      expect(filtered[1].guid).toBe("item-2");
      expect(filtered[2].guid).toBe("item-1");
    });

    it("sorts undated items last when useFirstSeenDateFallback is disabled (baseline)", async () => {
      const app = new App();
      const settings = cloneSettings();
      settings.useFirstSeenDateFallback = false;
      settings.articleSort = "newest";

      const now = Date.now();
      const feedUrl = "https://example.com/feed.xml";
      const feed: Feed = {
        title: "Test Feed",
        url: feedUrl,
        folder: "Test",
        items: [
          // Dated items
          makeItem("dated-1", new Date(now - 1000).toISOString()),
          makeItem("dated-2", new Date(now - 2000).toISOString()),
          // Undated items (should sort last when fallback disabled)
          makeItem("undated-1", "", { firstSeenMs: now - 500 }),
          makeItem("undated-2", "", { firstSeenMs: now - 1000 }),
        ],
        lastUpdated: now,
      };
      settings.feeds = [feed];

      const plugin = {
        settings,
        saveSettings: vi.fn(async () => {}),
      };

      const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
      const view = new RssDashboardView(leaf, plugin as never);
      (view as unknown as { render: () => void }).render = vi.fn();
      (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;

      const filtered = (
        view as unknown as { getFilteredArticles: () => FeedItem[] }
      ).getFilteredArticles();

      // Dated items first (newest first)
      expect(filtered[0].guid).toBe("dated-1");
      expect(filtered[1].guid).toBe("dated-2");
      // Undated items last (effective date 0)
      expect(filtered[2].guid).toMatch(/^undated-/);
      expect(filtered[3].guid).toMatch(/^undated-/);
    });

    it("respects oldest sort with firstSeenMs fallback", async () => {
      const app = new App();
      const settings = cloneSettings();
      settings.useFirstSeenDateFallback = true;
      settings.articleSort = "oldest";

      const now = Date.now();
      const feedUrl = "https://example.com/feed.xml";
      const feed: Feed = {
        title: "Test Feed",
        url: feedUrl,
        folder: "Test",
        items: [
          // Undated item with newer firstSeenMs
          makeItem("item-1", "", { firstSeenMs: now - 5000 }),
          // Undated item with older firstSeenMs
          makeItem("item-2", "", { firstSeenMs: now - 10000 }),
        ],
        lastUpdated: now,
      };
      settings.feeds = [feed];

      const plugin = {
        settings,
        saveSettings: vi.fn(async () => {}),
      };

      const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
      const view = new RssDashboardView(leaf, plugin as never);
      (view as unknown as { render: () => void }).render = vi.fn();
      (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;

      const filtered = (
        view as unknown as { getFilteredArticles: () => FeedItem[] }
      ).getFilteredArticles();

      // Oldest first by effective date: item-2, item-1
      expect(filtered[0].guid).toBe("item-2");
      expect(filtered[1].guid).toBe("item-1");
    });
  });

  describe("Related articles sort with undated items", () => {
    it("sorts related articles by firstSeenMs when fallback enabled", async () => {
      const app = new App();
      const settings = cloneSettings();
      settings.useFirstSeenDateFallback = true;

      const now = Date.now();
      const feedUrl = "https://example.com/feed.xml";
      const mainItem = makeItem("main", new Date(now).toISOString());
      const feed: Feed = {
        title: "Test Feed",
        url: feedUrl,
        folder: "Test",
        items: [
          mainItem,
          // Undated items to be sorted as related articles
          makeItem("rel-1", "", { firstSeenMs: now - 5000 }),
          makeItem("rel-2", "", { firstSeenMs: now - 10000 }),
          makeItem("rel-3", new Date(now - 6000).toISOString()),
        ],
        lastUpdated: now,
      };
      settings.feeds = [feed];

      const plugin = {
        settings,
        saveSettings: vi.fn(async () => {}),
      };

      const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
      const view = new RssDashboardView(leaf, plugin as never);
      (view as unknown as { render: () => void }).render = vi.fn();
      (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;

      const related = (
        view as unknown as { getRelatedItems: (item: FeedItem) => FeedItem[] }
      ).getRelatedItems(mainItem);

      // Newest first by effective date: rel-1 (now-5000), rel-3 (now-6000), rel-2 (now-10000)
      expect(related[0].guid).toBe("rel-1");
      expect(related[1].guid).toBe("rel-3");
      expect(related[2].guid).toBe("rel-2");
    });
  });

  describe("Age filter with undated items", () => {
    it("filters undated items by firstSeenMs when fallback enabled", async () => {
      const app = new App();
      const settings = cloneSettings();
      settings.useFirstSeenDateFallback = true;
      // 2 days age filter (in milliseconds)
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      settings.articleFilter = { type: "age", value: twoDaysMs };

      const now = Date.now();
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
      const feedUrl = "https://example.com/feed.xml";
      const feed: Feed = {
        title: "Test Feed",
        url: feedUrl,
        folder: "Test",
        items: [
          // Undated item with recent firstSeenMs (passes filter)
          makeItem("undated-recent", "", { firstSeenMs: now - 1000 }),
          // Undated item with old firstSeenMs (fails filter)
          makeItem("undated-old", "", { firstSeenMs: now - threeDaysMs }),
          // Dated item within 2 days (passes filter)
          makeItem("dated-recent", new Date(now - 1000).toISOString()),
          // Dated item outside 2 days (fails filter)
          makeItem("dated-old", new Date(now - threeDaysMs).toISOString()),
        ],
        lastUpdated: now,
      };
      settings.feeds = [feed];

      const plugin = {
        settings,
        saveSettings: vi.fn(async () => {}),
      };

      const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
      const view = new RssDashboardView(leaf, plugin as never);
      (view as unknown as { render: () => void }).render = vi.fn();
      (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;

      const filtered = (
        view as unknown as { getFilteredArticles: () => FeedItem[] }
      ).getFilteredArticles();

      const guids = filtered.map((item: FeedItem) => item.guid);

      // Should include recent items (both dated and undated with recent firstSeenMs)
      expect(guids).toContain("undated-recent");
      expect(guids).toContain("dated-recent");
      // Should exclude old items
      expect(guids).not.toContain("undated-old");
      expect(guids).not.toContain("dated-old");
    });

    it("excludes undated items by age when fallback disabled (baseline)", async () => {
      const app = new App();
      const settings = cloneSettings();
      settings.useFirstSeenDateFallback = false;
      // 2 days age filter
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      settings.articleFilter = { type: "age", value: twoDaysMs };

      const now = Date.now();
      const feedUrl = "https://example.com/feed.xml";
      const feed: Feed = {
        title: "Test Feed",
        url: feedUrl,
        folder: "Test",
        items: [
          // Undated item (should fail filter - no real date to compare)
          makeItem("undated", "", { firstSeenMs: now - 1000 }),
          // Dated item within 2 days (passes)
          makeItem("dated-recent", new Date(now - 1000).toISOString()),
        ],
        lastUpdated: now,
      };
      settings.feeds = [feed];

      const plugin = {
        settings,
        saveSettings: vi.fn(async () => {}),
      };

      const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
      const view = new RssDashboardView(leaf, plugin as never);
      (view as unknown as { render: () => void }).render = vi.fn();
      (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;

      const filtered = (
        view as unknown as { getFilteredArticles: () => FeedItem[] }
      ).getFilteredArticles();

      const guids = filtered.map((item: FeedItem) => item.guid);

      // Undated item excluded (effective date 0, which is <= maxAge cutoff)
      expect(guids).not.toContain("undated");
      // Dated item included
      expect(guids).toContain("dated-recent");
    });

    it("count-only age filter (getTotalArticlesCountForCurrentView) counts undated items by firstSeenMs when fallback enabled", async () => {
      const app = new App();
      const settings = cloneSettings();
      settings.useFirstSeenDateFallback = true;
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      settings.articleFilter = { type: "age", value: twoDaysMs };

      const now = Date.now();
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
      const feedUrl = "https://example.com/feed.xml";
      const feed: Feed = {
        title: "Test Feed",
        url: feedUrl,
        folder: "Test",
        items: [
          // Undated item with recent firstSeenMs (passes filter)
          makeItem("undated-recent", "", { firstSeenMs: now - 1000 }),
          // Undated item with old firstSeenMs (fails filter)
          makeItem("undated-old", "", { firstSeenMs: now - threeDaysMs }),
          // Dated item within 2 days (passes filter)
          makeItem("dated-recent", new Date(now - 1000).toISOString()),
          // Dated item outside 2 days (fails filter)
          makeItem("dated-old", new Date(now - threeDaysMs).toISOString()),
        ],
        lastUpdated: now,
      };
      settings.feeds = [feed];

      const plugin = {
        settings,
        saveSettings: vi.fn(async () => {}),
      };

      const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
      const view = new RssDashboardView(leaf, plugin as never);
      (view as unknown as { render: () => void }).render = vi.fn();
      // Leave currentFeed/currentFolder/selectedTags at their defaults (null/null/[])
      // so getTotalArticlesCountForCurrentView falls through to the
      // all-feeds branch that applies the age filter, instead of the
      // early-return "this.currentFeed.items.length" path.

      const count = (
        view as unknown as { getTotalArticlesCountForCurrentView: () => number }
      ).getTotalArticlesCountForCurrentView();

      // Only the two recent items (one dated, one undated-via-firstSeenMs) pass.
      expect(count).toBe(2);
    });

    it("count-only age filter excludes undated items when fallback disabled (baseline)", async () => {
      const app = new App();
      const settings = cloneSettings();
      settings.useFirstSeenDateFallback = false;
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      settings.articleFilter = { type: "age", value: twoDaysMs };

      const now = Date.now();
      const feedUrl = "https://example.com/feed.xml";
      const feed: Feed = {
        title: "Test Feed",
        url: feedUrl,
        folder: "Test",
        items: [
          // Undated item (should fail filter - no real date, fallback disabled)
          makeItem("undated", "", { firstSeenMs: now - 1000 }),
          // Dated item within 2 days (passes)
          makeItem("dated-recent", new Date(now - 1000).toISOString()),
        ],
        lastUpdated: now,
      };
      settings.feeds = [feed];

      const plugin = {
        settings,
        saveSettings: vi.fn(async () => {}),
      };

      const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
      const view = new RssDashboardView(leaf, plugin as never);
      (view as unknown as { render: () => void }).render = vi.fn();

      const count = (
        view as unknown as { getTotalArticlesCountForCurrentView: () => number }
      ).getTotalArticlesCountForCurrentView();

      // Only the dated item passes; the undated item's effective date is 0.
      expect(count).toBe(1);
    });
  });

  describe("Regression: fully-dated feeds", () => {
    it("maintains sort order for fully-dated feeds (newest first)", async () => {
      const app = new App();
      const settings = cloneSettings();
      settings.useFirstSeenDateFallback = true; // on or off doesn't matter for dated items
      settings.articleSort = "newest";

      const now = Date.now();
      const feedUrl = "https://example.com/feed.xml";
      const feed: Feed = {
        title: "Test Feed",
        url: feedUrl,
        folder: "Test",
        items: [
          makeItem("item-1", new Date(now - 1000).toISOString()),
          makeItem("item-2", new Date(now - 2000).toISOString()),
          makeItem("item-3", new Date(now - 3000).toISOString()),
        ],
        lastUpdated: now,
      };
      settings.feeds = [feed];

      const plugin = {
        settings,
        saveSettings: vi.fn(async () => {}),
      };

      const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
      const view = new RssDashboardView(leaf, plugin as never);
      (view as unknown as { render: () => void }).render = vi.fn();
      (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;

      const filtered = (
        view as unknown as { getFilteredArticles: () => FeedItem[] }
      ).getFilteredArticles();

      // Should maintain newest-first order (unchanged from before this change)
      expect(filtered[0].guid).toBe("item-1");
      expect(filtered[1].guid).toBe("item-2");
      expect(filtered[2].guid).toBe("item-3");
    });

    it("maintains sort order for fully-dated feeds (oldest first)", async () => {
      const app = new App();
      const settings = cloneSettings();
      settings.useFirstSeenDateFallback = true;
      settings.articleSort = "oldest";

      const now = Date.now();
      const feedUrl = "https://example.com/feed.xml";
      const feed: Feed = {
        title: "Test Feed",
        url: feedUrl,
        folder: "Test",
        items: [
          makeItem("item-1", new Date(now - 1000).toISOString()),
          makeItem("item-2", new Date(now - 2000).toISOString()),
          makeItem("item-3", new Date(now - 3000).toISOString()),
        ],
        lastUpdated: now,
      };
      settings.feeds = [feed];

      const plugin = {
        settings,
        saveSettings: vi.fn(async () => {}),
      };

      const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
      const view = new RssDashboardView(leaf, plugin as never);
      (view as unknown as { render: () => void }).render = vi.fn();
      (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;

      const filtered = (
        view as unknown as { getFilteredArticles: () => FeedItem[] }
      ).getFilteredArticles();

      // Should maintain oldest-first order (unchanged from before this change)
      expect(filtered[0].guid).toBe("item-3");
      expect(filtered[1].guid).toBe("item-2");
      expect(filtered[2].guid).toBe("item-1");
    });
  });
});
