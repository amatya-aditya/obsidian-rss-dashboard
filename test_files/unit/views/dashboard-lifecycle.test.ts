import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type HighlightWord,
  type RssDashboardSettings,
} from "../../../src/types/types";

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
    showEditFeedModal(..._args: any[]): void {}
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
    items: items.map((i, idx) => ({
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
      ...i,
    })),
    lastUpdated: Date.now(),
  };
}

/** Typed accessor for private RssDashboardView members accessed from tests. */
interface DashViewTestAPI {
  render: () => void;
  currentFolder: string | null;
  currentFeed: Feed | null;
  selectedTags: string[];
  getFilteredArticles(): FeedItem[];
  getUnfilteredArticles(): FeedItem[];
  getArticlesTitle(): string;
  computeHighlightMatchCounts(articles: FeedItem[]): void;
  highlightMatchCounts: Array<{ word: HighlightWord; count: number }>;
  handleTagToggle(tag: string): void;
  handleClearTags(): void;
  collapsedFolders: string[];
  handleToggleFolderCollapse(folder: string, shouldRerender?: boolean): void;
  handleBatchToggleFolders(
    foldersToCollapse: string[],
    foldersToExpand: string[],
  ): void;
  handleDeleteFeed(feed: Feed): void;
  handleDeleteFolder(folder: string): void;
  syncCurrentFeedReference(): void;
  getAllDescendantFolders(folderPath: string): string[];
  syncDashboardMultiFiltersFromSettings(): void;
  activeStatusFilters: Set<string>;
  activeTagFilters: Set<string>;
  filterLogic: "AND" | "OR";
  handleFolderClick(folder: string | null): void;
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

describe("Dashboard lifecycle", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  describe("getFilteredArticles()", () => {
    it("returns all items across all feeds when currentFolder=null and no tags", async () => {
      const settings = cloneSettings();
      settings.feeds = [
        makeFeed("https://a.com/feed", "", [{ read: false }, { read: true }]),
        makeFeed("https://b.com/feed", "", [{ read: false }]),
      ];
      const view = await makeView(settings);
      expect(view.getFilteredArticles()).toHaveLength(3);
    });

    it("returns only items from the active feed when currentFeed is set", async () => {
      const settings = cloneSettings();
      const feed1 = makeFeed("https://a.com/feed", "", [{ read: false }]);
      const feed2 = makeFeed("https://b.com/feed", "", [
        { read: false },
        { read: false },
      ]);
      settings.feeds = [feed1, feed2];
      const view = await makeView(settings);
      view.currentFeed = feed1;
      expect(view.getFilteredArticles()).toHaveLength(1);
    });

    it("returns tagged items in OR mode", async () => {
      const settings = cloneSettings();
      const feed = makeFeed("https://a.com/feed", "", [
        { tags: [{ name: "Tech", color: "#f00" }] },
        { tags: [{ name: "News", color: "#0f0" }] },
        { tags: [] },
      ]);
      settings.feeds = [feed];
      settings.sidebarTagFilterMode = "or";
      const view = await makeView(settings);
      view.selectedTags = ["Tech"];
      expect(view.getFilteredArticles()).toHaveLength(1);
    });

    it("returns tagged items in AND mode (all tags must match)", async () => {
      const settings = cloneSettings();
      const feed = makeFeed("https://a.com/feed", "", [
        {
          tags: [
            { name: "Tech", color: "#f00" },
            { name: "AI", color: "#00f" },
          ],
        },
        { tags: [{ name: "Tech", color: "#f00" }] },
      ]);
      settings.feeds = [feed];
      settings.sidebarTagFilterMode = "and";
      const view = await makeView(settings);
      view.selectedTags = ["Tech", "AI"];
      expect(view.getFilteredArticles()).toHaveLength(1);
    });

    it("returns NOT-tagged items in NOT mode", async () => {
      const settings = cloneSettings();
      const feed = makeFeed("https://a.com/feed", "", [
        { tags: [{ name: "Tech", color: "#f00" }] },
        { tags: [] },
        { tags: [{ name: "News", color: "#0f0" }] },
      ]);
      settings.feeds = [feed];
      settings.sidebarTagFilterMode = "not";
      const view = await makeView(settings);
      view.selectedTags = ["Tech"];
      expect(view.getFilteredArticles()).toHaveLength(2);
    });

    it("filters starred items under 'starred'", async () => {
      const settings = cloneSettings();
      settings.feeds = [
        makeFeed("https://a.com/feed", "", [
          { starred: true },
          { starred: false },
          { starred: true },
        ]),
      ];
      const view = await makeView(settings);
      view.currentFolder = "starred";
      expect(view.getFilteredArticles()).toHaveLength(2);
    });

    it("filters unread items under 'unread'", async () => {
      const settings = cloneSettings();
      settings.feeds = [
        makeFeed("https://a.com/feed", "", [
          { read: false },
          { read: true },
          { read: false },
        ]),
      ];
      const view = await makeView(settings);
      view.currentFolder = "unread";
      expect(view.getFilteredArticles()).toHaveLength(2);
    });

    it("keeps all scoped items in getUnfilteredArticles for special unread view empty-state detection", async () => {
      const settings = cloneSettings();
      settings.feeds = [
        makeFeed("https://a.com/feed", "", [
          { read: false },
          { read: true },
          { read: true },
        ]),
      ];
      const view = await makeView(settings);
      view.currentFolder = "unread";

      expect(view.getUnfilteredArticles()).toHaveLength(3);
    });

    it("filters read items under 'read'", async () => {
      const settings = cloneSettings();
      settings.feeds = [
        makeFeed("https://a.com/feed", "", [{ read: false }, { read: true }]),
      ];
      const view = await makeView(settings);
      view.currentFolder = "read";
      expect(view.getFilteredArticles()).toHaveLength(1);
    });

    it("filters video items under 'videos'", async () => {
      const settings = cloneSettings();
      settings.feeds = [
        makeFeed("https://a.com/feed", "", [
          { mediaType: "video" },
          { mediaType: "podcast" },
          {},
        ]),
      ];
      const view = await makeView(settings);
      view.currentFolder = "videos";
      expect(view.getFilteredArticles()).toHaveLength(1);
    });

    it("returns folder-scoped articles for a named folder", async () => {
      const settings = cloneSettings();
      const feed1 = makeFeed("https://a.com/feed", "Tech", [{}]);
      const feed2 = makeFeed("https://b.com/feed", "News", [{}]);
      settings.feeds = [feed1, feed2];
      settings.folders = [
        { name: "Tech", subfolders: [], pinned: false },
        { name: "News", subfolders: [], pinned: false },
      ];
      const view = await makeView(settings);
      view.currentFolder = "Tech";
      const result = view.getFilteredArticles();
      expect(result).toHaveLength(1);
      expect(result[0].feedUrl).toBe("https://a.com/feed");
    });

    it("sorts articles newest-first by default", async () => {
      const now = Date.now();
      const settings = cloneSettings();
      settings.feeds = [
        makeFeed("https://a.com/feed", "", [
          { pubDate: new Date(now - 5000).toISOString() },
          { pubDate: new Date(now - 1000).toISOString() },
        ]),
      ];
      settings.articleSort = "newest";
      const view = await makeView(settings);
      const result = view.getFilteredArticles();
      expect(new Date(result[0].pubDate).getTime()).toBeGreaterThan(
        new Date(result[1].pubDate).getTime(),
      );
    });

    it("sorts articles oldest-first when setting is 'oldest'", async () => {
      const now = Date.now();
      const settings = cloneSettings();
      settings.feeds = [
        makeFeed("https://a.com/feed", "", [
          { pubDate: new Date(now - 5000).toISOString() },
          { pubDate: new Date(now - 1000).toISOString() },
        ]),
      ];
      settings.articleSort = "oldest";
      const view = await makeView(settings);
      const result = view.getFilteredArticles();
      expect(new Date(result[0].pubDate).getTime()).toBeLessThan(
        new Date(result[1].pubDate).getTime(),
      );
    });
  });

  describe("getArticlesTitle()", () => {
    it("returns feed title when currentFeed is set", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.currentFeed = makeFeed("https://a.com/feed");
      view.currentFeed.title = "My favorite feed";
      expect(view.getArticlesTitle()).toBe("My favorite feed");
    });

    it("returns 'All articles' by default", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      expect(view.getArticlesTitle()).toBe("All articles");
    });

    it("returns 'Starred items' for 'starred'", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.currentFolder = "starred";
      expect(view.getArticlesTitle()).toBe("Starred items");
    });

    it("returns 'Unread items' for 'unread'", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.currentFolder = "unread";
      expect(view.getArticlesTitle()).toBe("Unread items");
    });

    it("returns 'Read items' for 'read'", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.currentFolder = "read";
      expect(view.getArticlesTitle()).toBe("Read items");
    });

    it("returns 'Saved items' for 'saved'", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.currentFolder = "saved";
      expect(view.getArticlesTitle()).toBe("Saved items");
    });

    it("returns 'Videos' for 'videos'", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.currentFolder = "videos";
      expect(view.getArticlesTitle()).toBe("Videos");
    });

    it("returns 'Podcasts' for 'podcasts'", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.currentFolder = "podcasts";
      expect(view.getArticlesTitle()).toBe("Podcasts");
    });

    it("returns tag label with mode when selectedTags is set", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      settings.sidebarTagFilterMode = "and";
      const view = await makeView(settings);
      view.selectedTags = ["Tech", "AI"];
      const title = view.getArticlesTitle();
      expect(title).toContain("AND");
      expect(title).toContain("Tech");
    });

    it("returns folder name for a named folder", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.currentFolder = "Science";
      expect(view.getArticlesTitle()).toBe("Science");
    });
  });

  describe("computeHighlightMatchCounts()", () => {
    it("resets highlightMatchCounts to [] when highlighting is disabled", async () => {
      const settings = cloneSettings();
      settings.highlights = {
        enabled: false,
        defaultColor: "#ffff00",
        words: [],
        highlightInContent: true,
        highlightInTitles: true,
        highlightInSummaries: true,
      };
      const view = await makeView(settings);
      view.computeHighlightMatchCounts([]);
      expect(view.highlightMatchCounts).toHaveLength(0);
    });

    it("counts articles containing a highlight word (case-insensitive)", async () => {
      const settings = cloneSettings();
      settings.highlights = {
        enabled: true,
        defaultColor: "#ffff00",
        highlightInTitles: true,
        highlightInSummaries: false,
        highlightInContent: false,
        words: [
          {
            id: "1",
            text: "TypeScript",
            enabled: true,
            wholeWord: false,
            caseSensitive: false,
            createdAt: Date.now(),
          },
        ],
      };
      const view = await makeView(settings);
      const articles: FeedItem[] = [
        {
          title: "All about typescript today",
          link: "",
          description: "",
          pubDate: new Date().toISOString(),
          guid: "1",
          read: false,
          starred: false,
          tags: [],
          feedTitle: "",
          feedUrl: "",
          coverImage: "",
        },
        {
          title: "No match here",
          link: "",
          description: "",
          pubDate: new Date().toISOString(),
          guid: "2",
          read: false,
          starred: false,
          tags: [],
          feedTitle: "",
          feedUrl: "",
          coverImage: "",
        },
        {
          title: "TYPESCRIPT IS GREAT",
          link: "",
          description: "",
          pubDate: new Date().toISOString(),
          guid: "3",
          read: false,
          starred: false,
          tags: [],
          feedTitle: "",
          feedUrl: "",
          coverImage: "",
        },
      ];
      view.computeHighlightMatchCounts(articles);
      expect(view.highlightMatchCounts).toHaveLength(1);
      expect(view.highlightMatchCounts[0].count).toBe(2);
    });

    it("skips disabled highlight words", async () => {
      const settings = cloneSettings();
      settings.highlights = {
        enabled: true,
        defaultColor: "#ffff00",
        highlightInTitles: true,
        highlightInSummaries: false,
        highlightInContent: false,
        words: [
          {
            id: "1",
            text: "match",
            enabled: false,
            wholeWord: false,
            caseSensitive: false,
            createdAt: Date.now(),
          },
        ],
      };
      const view = await makeView(settings);
      view.computeHighlightMatchCounts([
        {
          title: "this will match",
          link: "",
          description: "",
          pubDate: new Date().toISOString(),
          guid: "1",
          read: false,
          starred: false,
          tags: [],
          feedTitle: "",
          feedUrl: "",
          coverImage: "",
        },
      ]);
      expect(view.highlightMatchCounts).toHaveLength(0);
    });
  });

  describe("handleTagToggle()", () => {
    it("adds a new tag to selectedTags", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.handleTagToggle("Tech");
      expect(view.selectedTags).toContain("Tech");
    });

    it("removes a tag that is already selected", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.selectedTags = ["Tech", "AI"];
      view.handleTagToggle("Tech");
      expect(view.selectedTags).not.toContain("Tech");
      expect(view.selectedTags).toContain("AI");
    });

    it("preserves currentFolder and currentFeed when a tag is toggled", async () => {
      const settings = cloneSettings();
      const feed = makeFeed("https://a.com/feed");
      settings.feeds = [feed];
      const view = await makeView(settings);
      view.currentFolder = "unread";
      view.currentFeed = feed;
      view.handleTagToggle("Science");
      expect(view.currentFolder).toBe("unread");
      expect(view.currentFeed).toBe(feed);
    });

    it("handleClearTags clears all selected tags", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.selectedTags = ["Tech", "AI", "Science"];
      view.handleClearTags();
      expect(view.selectedTags).toHaveLength(0);
    });
  });

  describe("handleToggleFolderCollapse()", () => {
    it("adds folder to collapsedFolders when not yet collapsed", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.collapsedFolders = [];
      view.handleToggleFolderCollapse("Tech", false);
      expect(view.collapsedFolders).toContain("Tech");
    });

    it("removes folder from collapsedFolders when already collapsed", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.collapsedFolders = ["Tech", "News"];
      view.handleToggleFolderCollapse("Tech", false);
      expect(view.collapsedFolders).not.toContain("Tech");
      expect(view.collapsedFolders).toContain("News");
    });

    it("handleBatchToggleFolders collapses and expands folders correctly", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.collapsedFolders = ["A", "B"];
      view.handleBatchToggleFolders(["C"], ["B"]);
      expect(view.collapsedFolders).toContain("A");
      expect(view.collapsedFolders).toContain("C");
      expect(view.collapsedFolders).not.toContain("B");
    });
  });

  describe("handleDeleteFeed()", () => {
    it("removes the feed from settings.feeds", async () => {
      const settings = cloneSettings();
      const feed1 = makeFeed("https://a.com/feed");
      const feed2 = makeFeed("https://b.com/feed");
      settings.feeds = [feed1, feed2];
      const view = await makeView(settings);
      view.handleDeleteFeed(feed1);
      expect(settings.feeds).toHaveLength(1);
      expect(settings.feeds[0].url).toBe("https://b.com/feed");
    });

    it("clears currentFeed if the deleted feed was active", async () => {
      const settings = cloneSettings();
      const feed = makeFeed("https://a.com/feed");
      settings.feeds = [feed];
      const view = await makeView(settings);
      view.currentFeed = feed;
      view.handleDeleteFeed(feed);
      expect(view.currentFeed).toBeNull();
    });
  });

  describe("handleDeleteFolder()", () => {
    it("removes the folder from settings and its feeds", async () => {
      const settings = cloneSettings();
      settings.feeds = [makeFeed("https://a.com/feed", "Tech")];
      settings.folders = [
        { name: "Tech", subfolders: [], pinned: false },
        { name: "News", subfolders: [], pinned: false },
      ];
      const view = await makeView(settings);
      view.handleDeleteFolder("Tech");
      expect(settings.folders.map((f) => f.name)).not.toContain("Tech");
      expect(settings.feeds.some((f) => f.folder === "Tech")).toBe(false);
    });

    it("clears currentFolder if the deleted folder was active", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      settings.folders = [{ name: "Science", subfolders: [], pinned: false }];
      const view = await makeView(settings);
      view.currentFolder = "Science";
      view.handleDeleteFolder("Science");
      expect(view.currentFolder).toBeNull();
    });
  });

  describe("syncCurrentFeedReference()", () => {
    it("does nothing when currentFeed is null", async () => {
      const settings = cloneSettings();
      settings.feeds = [makeFeed("https://a.com/feed")];
      const view = await makeView(settings);
      view.currentFeed = null;
      view.syncCurrentFeedReference();
      expect(view.currentFeed).toBeNull();
    });

    it("re-links currentFeed to the live settings object by URL", async () => {
      const settings = cloneSettings();
      const originalFeed = makeFeed("https://a.com/feed");
      settings.feeds = [originalFeed];
      const view = await makeView(settings);
      const staleFeed = { ...originalFeed };
      view.currentFeed = staleFeed as Feed;
      view.syncCurrentFeedReference();
      expect(view.currentFeed).toBe(originalFeed);
    });
  });

  describe("getAllDescendantFolders()", () => {
    it("returns just the folder itself if it has no subfolders", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      settings.folders = [{ name: "Tech", subfolders: [], pinned: false }];
      const view = await makeView(settings);
      expect(view.getAllDescendantFolders("Tech")).toEqual(["Tech"]);
    });

    it("recursively returns all descendant folder paths", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      settings.folders = [
        {
          name: "Tech",
          pinned: false,
          subfolders: [
            {
              name: "AI",
              pinned: false,
              subfolders: [{ name: "LLMs", subfolders: [], pinned: false }],
            },
            { name: "Web", subfolders: [], pinned: false },
          ],
        },
      ];
      const view = await makeView(settings);
      const result = view.getAllDescendantFolders("Tech");
      expect(result).toContain("Tech");
      expect(result).toContain("Tech/AI");
      expect(result).toContain("Tech/AI/LLMs");
      expect(result).toContain("Tech/Web");
      expect(result).toHaveLength(4);
    });
  });

  describe("syncDashboardMultiFiltersFromSettings()", () => {
    it("applies statusFilters, tagFilters, and logic from settings", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      settings.dashboardMultiFilters = {
        statusFilters: ["unread", "starred"],
        tagFilters: ["Tech"],
        logic: "AND",
      };
      const view = await makeView(settings);
      view.syncDashboardMultiFiltersFromSettings();
      expect(Array.from(view.activeStatusFilters)).toEqual([
        "unread",
        "starred",
      ]);
      expect(Array.from(view.activeTagFilters)).toEqual(["Tech"]);
      expect(view.filterLogic).toBe("AND");
    });
  });

  describe("handleFolderClick()", () => {
    it("sets currentFolder and clears currentFeed and selectedTags", async () => {
      const settings = cloneSettings();
      const feed = makeFeed("https://a.com/feed");
      settings.feeds = [feed];
      const view = await makeView(settings);
      view.currentFeed = feed;
      view.selectedTags = ["Tech"];
      view.handleFolderClick("unread");
      expect(view.currentFolder).toBe("unread");
      expect(view.currentFeed).toBeNull();
      expect(view.selectedTags).toHaveLength(0);
    });

    it("null navigates to All Feeds view", async () => {
      const settings = cloneSettings();
      settings.feeds = [];
      const view = await makeView(settings);
      view.currentFolder = "starred";
      view.handleFolderClick(null);
      expect(view.currentFolder).toBeNull();
    });
  });
});
