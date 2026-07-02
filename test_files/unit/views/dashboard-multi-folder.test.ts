import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

// ── Module mocks (same pattern as dashboard-lifecycle.test.ts) ────────────────
vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: any[]) {}
    render(): void {}
    destroy(): void {}
    refilter(..._args: any[]): void {}
    setSelectedArticle(..._args: any[]): void {}
    hasArticle(..._args: any[]): boolean {
      return false;
    }
    insertArticleInPlace(..._args: any[]): boolean {
      return false;
    }
    removeArticleInPlace(..._args: any[]): void {}
    updateArticleInPlace(..._args: any[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: any[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor(..._args: any[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor(..._args: any[]) {}
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
    constructor(..._args: any[]) {}
    verifyAllSavedArticles(..._args: any[]): void {}
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(
  url: string,
  folder = "",
  items: Partial<FeedItem>[] = [],
): Feed {
  return {
    title: `Feed (${url})`,
    url,
    folder,
    items: items.map((item, idx) => ({
      title: `Item ${idx}`,
      link: `${url}#${idx}`,
      description: "",
      pubDate: new Date(Date.now() - idx * 1000).toISOString(),
      guid: `${url}#${idx}`,
      read: false,
      starred: false,
      tags: [],
      feedTitle: `Feed (${url})`,
      feedUrl: url,
      coverImage: "",
      ...item,
    })),
    lastUpdated: Date.now(),
  };
}

/** Typed accessor for private RssDashboardView members accessed from tests. */
interface DashViewTestAPI {
  render: () => void;
  currentFolder: string | null;
  currentFeed: Feed | null;
  selectedFolders: string[];
  selectedTags: string[];
  getFilteredArticles(): FeedItem[];
  getUnfilteredArticles(): FeedItem[];
  handleFolderClick(folder: string | null): void;
  handleFolderMultiSelect(folders: string[]): void;
  handleFeedClick(feed: Feed): void;
  handleTagToggle(tag: string): void;
}

async function makeView(
  settings: RssDashboardSettings,
): Promise<DashViewTestAPI> {
  const { RssDashboardView } =
    await import("../../../src/views/dashboard-view");
  const app = new App();
  const plugin = { settings, saveSettings: vi.fn(async () => {}) };
  const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never);
  view.render = vi.fn();
  return view as unknown as DashViewTestAPI;
}

// ── Tests (RED phase) ─────────────────────────────────────────────────────────
// These tests exercise the multi-folder selection feature and will FAIL until
// handleFolderMultiSelect and the multi-folder article pool branch are added
// to dashboard-view.ts.

describe("Dashboard — multi-folder ctrl+click selection", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  describe("handleFolderMultiSelect()", () => {
    it("sets selectedFolders to the provided list", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      settings.folders = [
        { name: "Tech", subfolders: [] },
        { name: "News", subfolders: [] },
      ];
      const view = await makeView(settings);

      view.handleFolderMultiSelect(["Tech", "News"]);

      expect(view.selectedFolders).toEqual(["Tech", "News"]);
    });

    it("clears currentFeed when multi-select is invoked", async () => {
      const settings = cloneSettings();
      const feed = makeFeed("https://a.com/feed");
      settings.feeds = [feed];
      const view = await makeView(settings);
      view.currentFeed = feed;

      view.handleFolderMultiSelect(["Tech"]);

      expect(view.currentFeed).toBeNull();
    });

    it("clears selectedTags when multi-select is invoked", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.selectedTags = ["SomeTag"];

      view.handleFolderMultiSelect(["Tech"]);

      expect(view.selectedTags).toHaveLength(0);
    });

    it("sets currentFolder to the single path when only one folder is selected", async () => {
      // When exactly one folder is ctrl+clicked, currentFolder mirrors it so
      // all single-folder dependent logic (title, page state) still works.
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);

      view.handleFolderMultiSelect(["News"]);

      expect(view.currentFolder).toBe("News");
    });

    it("sets currentFolder to null when two or more folders are selected", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);

      view.handleFolderMultiSelect(["News", "Tech"]);

      expect(view.currentFolder).toBeNull();
    });

    it("sets currentFolder to null when selectedFolders is empty (deselect all)", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.currentFolder = "News";

      view.handleFolderMultiSelect([]);

      expect(view.currentFolder).toBeNull();
    });
  });

  describe("article pool with multi-folder selection", () => {
    it("includes articles from all selected folders", async () => {
      // Feeds in three different folders — only two are selected.
      const settings = cloneSettings();
      settings.folders = [
        { name: "Tech", subfolders: [] },
        { name: "News", subfolders: [] },
        { name: "Science", subfolders: [] },
      ];
      const feedTech = makeFeed("https://tech.com/feed", "Tech", [{}]);
      const feedNews = makeFeed("https://news.com/feed", "News", [{}, {}]);
      const feedScience = makeFeed("https://science.com/feed", "Science", [
        {},
      ]);
      settings.feeds = [feedTech, feedNews, feedScience];

      const view = await makeView(settings);
      // Select Tech and News — Science should be excluded.
      view.handleFolderMultiSelect(["Tech", "News"]);

      const articles = view.getFilteredArticles();
      const urls = articles.map((a) => a.feedUrl);

      expect(urls).toContain("https://tech.com/feed");
      expect(urls).toContain("https://news.com/feed");
      expect(urls).not.toContain("https://science.com/feed");
      // 1 tech + 2 news = 3
      expect(articles).toHaveLength(3);
    });

    it("includes articles from subfolder feeds when a parent folder is selected", async () => {
      // The parent folder has a subfolder — both should be in scope.
      const settings = cloneSettings();
      settings.folders = [
        {
          name: "Tech",
          subfolders: [{ name: "AI", subfolders: [] }],
        },
        { name: "News", subfolders: [] },
      ];
      const feedTech = makeFeed("https://tech.com/feed", "Tech", [{}]);
      const feedAI = makeFeed("https://ai.com/feed", "Tech/AI", [{}]);
      const feedNews = makeFeed("https://news.com/feed", "News", [{}]);
      settings.feeds = [feedTech, feedAI, feedNews];

      const view = await makeView(settings);
      view.handleFolderMultiSelect(["Tech", "News"]);

      const urls = view.getFilteredArticles().map((a) => a.feedUrl);
      expect(urls).toContain("https://tech.com/feed");
      expect(urls).toContain("https://ai.com/feed");
      expect(urls).toContain("https://news.com/feed");
    });

    it("excludes articles from folders NOT in selectedFolders", async () => {
      const settings = cloneSettings();
      settings.folders = [
        { name: "Tech", subfolders: [] },
        { name: "Finance", subfolders: [] },
      ];
      const feedTech = makeFeed("https://tech.com/feed", "Tech", [{}]);
      const feedFinance = makeFeed("https://finance.com/feed", "Finance", [
        {},
      ]);
      settings.feeds = [feedTech, feedFinance];

      const view = await makeView(settings);
      view.handleFolderMultiSelect(["Tech"]);

      const urls = view.getFilteredArticles().map((a) => a.feedUrl);
      expect(urls).not.toContain("https://finance.com/feed");
    });
  });

  describe("handleFolderClick() clears selectedFolders", () => {
    it("resets selectedFolders to [] when a plain folder click occurs", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.selectedFolders = ["Tech", "News"];

      view.handleFolderClick("Science");

      expect(view.selectedFolders).toHaveLength(0);
    });

    it("resets selectedFolders when clicking All Feeds (null)", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.selectedFolders = ["Tech"];

      view.handleFolderClick(null);

      expect(view.selectedFolders).toHaveLength(0);
    });
  });

  describe("handleFeedClick() clears selectedFolders", () => {
    it("resets selectedFolders when a feed is clicked", async () => {
      const settings = cloneSettings();
      const feed = makeFeed("https://a.com/feed");
      settings.feeds = [feed];
      const view = await makeView(settings);
      view.selectedFolders = ["Tech"];

      view.handleFeedClick(feed);

      expect(view.selectedFolders).toHaveLength(0);
    });
  });

  describe("handleTagToggle() preserves selectedFolders", () => {
    it("preserves selectedFolders when a tag is toggled", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.selectedFolders = ["Tech"];

      view.handleTagToggle("SomeTag");

      expect(view.selectedFolders).toEqual(["Tech"]);
    });
  });
});
