/**
 * Characterization tests for `RssDashboardView.getArticlesTitle` and
 * `getArticlesTitleInfo` (#581).
 *
 * `getArticlesTitle` picks the article list header text from the view state:
 * a single feed, a special folder, a sidebar tag selection, a sidebar
 * folder/feed selection, a named folder, or the default. `getArticlesTitleInfo`
 * then layers the dashboard's status/tag filters on top and adds the tooltip.
 * These tests pin what both return today, so `getArticlesTitle` can move to
 * `src/utils/filter-title-format.ts` (Phase 8 of #436) without them changing.
 * They are read-only on refactor PRs; see docs/development/architecture.md.
 *
 * Each test sets view state directly and calls the methods through a cast, as
 * the existing dashboard tests do.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { RssDashboardView } from "../../../src/views/dashboard-view";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor() {}
    render(): void {}
    destroy(): void {}
    refilter(): void {}
    setSelectedArticle(): void {}
    updateHeaderTitle(): void {}
    updateCardSpacingLayout(): void {}
    refreshCardTagLayout(): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor() {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor() {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor() {}
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
    constructor() {}
  },
}));

interface ViewInternals {
  getArticlesTitle: () => string;
  getArticlesTitleInfo: () => { title: string; tooltip: string | null };
  currentFeed: Feed | null;
  currentFolder: string | null;
  selectedTags: string[];
  selectedFolders: string[];
  selectedFeeds: string[];
  activeStatusFilters: Set<string>;
  activeTagFilters: Set<string>;
  filterLogic: "AND" | "OR";
}

function makeFeed(title: string, url: string, folder = ""): Feed {
  return { title, url, folder, items: [] } as unknown as Feed;
}

const TECH_ONE = "https://tech.example/one";
const TECH_AI = "https://tech.example/ai";
const NEWS_ONE = "https://news.example/one";
const ROOT_ONE = "https://root.example/one";

function createView(overrides: Partial<RssDashboardSettings> = {}): {
  view: ViewInternals;
  settings: RssDashboardSettings;
} {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.feeds = [
    makeFeed("Tech One", TECH_ONE, "Tech"),
    makeFeed("Tech AI", TECH_AI, "Tech/AI"),
    makeFeed("News One", NEWS_ONE, "News"),
    makeFeed("Root One", ROOT_ONE, ""),
  ];
  settings.folders = [
    { name: "Tech", subfolders: [{ name: "AI", subfolders: [] }] },
    { name: "News", subfolders: [] },
    { name: "Empty", subfolders: [] },
  ] as RssDashboardSettings["folders"];
  Object.assign(settings, overrides);

  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
  } as unknown as RssDashboardPlugin;
  const leaf = {
    app: new obsidian.App(),
  } as unknown as obsidian.WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin) as unknown as ViewInternals;
  return { view, settings };
}

describe("Dashboard getArticlesTitle characterization", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  describe("precedence", () => {
    it("returns 'All articles' when nothing is selected", () => {
      const { view } = createView();

      expect(view.getArticlesTitle()).toBe("All articles");
    });

    it("returns the current feed's title ahead of everything else", () => {
      const { view } = createView();
      view.currentFeed = makeFeed("My feed", "https://x.example/feed");
      view.currentFolder = "starred";
      view.selectedTags = ["a"];
      view.selectedFolders = ["Tech"];
      view.selectedFeeds = [ROOT_ONE];

      expect(view.getArticlesTitle()).toBe("My feed");
    });

    it("returns an empty title for a current feed whose title is empty", () => {
      const { view } = createView();
      view.currentFeed = makeFeed("", "https://x.example/feed");
      view.currentFolder = "starred";

      expect(view.getArticlesTitle()).toBe("");
    });

    it("returns a special folder's title ahead of tags and selections", () => {
      const { view } = createView();
      view.currentFolder = "unread";
      view.selectedTags = ["a"];
      view.selectedFolders = ["Tech"];

      expect(view.getArticlesTitle()).toBe("Unread items");
    });

    it("returns the tag title, with the selection in front, when tags and folders are both selected", () => {
      const { view } = createView();
      view.selectedTags = ["a"];
      view.selectedFolders = ["Tech"];

      expect(view.getArticlesTitle()).toBe(
        "Folders: Tech (Feeds: 2) & Tags (OR): a",
      );
    });

    it("returns a folder/feed selection ahead of a named current folder", () => {
      const { view } = createView();
      view.currentFolder = "News";
      view.selectedFolders = ["Tech"];

      expect(view.getArticlesTitle()).toBe("Folders: Tech (Feeds: 2)");
    });

    it("returns tags ahead of a named current folder", () => {
      const { view } = createView();
      view.currentFolder = "News";
      view.selectedTags = ["a"];

      expect(view.getArticlesTitle()).toBe("Tags (OR): a");
    });
  });

  describe("special and named folders", () => {
    it.each([
      ["starred", "Starred items"],
      ["unread", "Unread items"],
      ["read", "Read items"],
      ["saved", "Saved items"],
      ["videos", "Videos"],
      ["podcasts", "Podcasts"],
    ])("titles the %s folder '%s'", (folder, title) => {
      const { view } = createView();
      view.currentFolder = folder;

      expect(view.getArticlesTitle()).toBe(title);
    });

    it("returns a named folder's path as its title", () => {
      const { view } = createView();
      view.currentFolder = "Tech/AI";

      expect(view.getArticlesTitle()).toBe("Tech/AI");
    });

    it("falls back to 'All articles' for an empty current folder", () => {
      const { view } = createView();
      view.currentFolder = "";

      expect(view.getArticlesTitle()).toBe("All articles");
    });

    it("matches special folder names exactly, without case folding", () => {
      const { view } = createView();
      view.currentFolder = "Starred";

      expect(view.getArticlesTitle()).toBe("Starred");
    });
  });

  describe("sidebar tag selection", () => {
    it("labels the selection with the default OR mode and keeps selection order", () => {
      const { view } = createView();
      view.selectedTags = ["zeta", "Alpha", "mid"];

      expect(view.getArticlesTitle()).toBe("Tags (OR): zeta, Alpha, mid");
    });

    it.each([
      ["and", "AND"],
      ["or", "OR"],
      ["not", "NOT"],
    ] as const)("uppercases the %s tag filter mode", (mode, label) => {
      const { view } = createView({ sidebarTagFilterMode: mode });
      view.selectedTags = ["a"];

      expect(view.getArticlesTitle()).toBe(`Tags (${label}): a`);
    });

    it("falls back to OR when the tag filter mode is missing or empty", () => {
      const { view, settings } = createView();
      view.selectedTags = ["a"];
      const loose = settings as unknown as Record<string, unknown>;

      loose.sidebarTagFilterMode = undefined;
      expect(view.getArticlesTitle()).toBe("Tags (OR): a");

      loose.sidebarTagFilterMode = "";
      expect(view.getArticlesTitle()).toBe("Tags (OR): a");
    });

    it("uppercases an unrecognized tag filter mode as it is", () => {
      const { view, settings } = createView();
      view.selectedTags = ["a"];
      (settings as unknown as Record<string, unknown>).sidebarTagFilterMode =
        "xor";

      expect(view.getArticlesTitle()).toBe("Tags (XOR): a");
    });

    it("prefixes the selected folders and their feed count", () => {
      const { view } = createView();
      view.selectedTags = ["a", "b"];
      view.selectedFolders = ["Tech", "News"];

      expect(view.getArticlesTitle()).toBe(
        "Folders: Tech, News (Feeds: 3) & Tags (OR): a, b",
      );
    });

    it("prefixes the feed count when only feeds are selected", () => {
      const { view } = createView();
      view.selectedTags = ["a"];
      view.selectedFeeds = [NEWS_ONE, ROOT_ONE];

      expect(view.getArticlesTitle()).toBe("2 feeds & Tags (OR): a");
    });

    it("says '1 feeds' for a single selected feed", () => {
      const { view } = createView();
      view.selectedTags = ["a"];
      view.selectedFeeds = [ROOT_ONE];

      // BUG: pinned, see #582
      expect(view.getArticlesTitle()).toBe("1 feeds & Tags (OR): a");
    });

    it("counts selected feeds in the folder total without naming them", () => {
      const { view } = createView();
      view.selectedTags = ["a"];
      view.selectedFolders = ["News"];
      view.selectedFeeds = [ROOT_ONE];

      expect(view.getArticlesTitle()).toBe(
        "Folders: News (Feeds: 2) & Tags (OR): a",
      );
    });

    it("uses the selection's tag mode in the combined title", () => {
      const { view } = createView({ sidebarTagFilterMode: "and" });
      view.selectedTags = ["a"];
      view.selectedFolders = ["News"];

      expect(view.getArticlesTitle()).toBe(
        "Folders: News (Feeds: 1) & Tags (AND): a",
      );
    });
  });

  describe("sidebar folder and feed selection", () => {
    it("lists one selected folder with its feed count", () => {
      const { view } = createView();
      view.selectedFolders = ["News"];

      expect(view.getArticlesTitle()).toBe("Folders: News (Feeds: 1)");
    });

    it("counts feeds in subfolders of a selected folder", () => {
      const { view } = createView();
      view.selectedFolders = ["Tech"];

      expect(view.getArticlesTitle()).toBe("Folders: Tech (Feeds: 2)");
    });

    it("joins several folders with commas and counts each feed once", () => {
      const { view } = createView();
      view.selectedFolders = ["Tech", "Tech/AI", "News"];

      expect(view.getArticlesTitle()).toBe(
        "Folders: Tech, Tech/AI, News (Feeds: 3)",
      );
    });

    it("counts an empty folder as zero feeds", () => {
      const { view } = createView();
      view.selectedFolders = ["Empty"];

      expect(view.getArticlesTitle()).toBe("Folders: Empty (Feeds: 0)");
    });

    it("counts a selected folder that is missing from the folder tree by its own feeds", () => {
      const { view, settings } = createView();
      settings.feeds.push(makeFeed("Ghost", "https://ghost.example", "Ghost"));
      view.selectedFolders = ["Ghost"];

      expect(view.getArticlesTitle()).toBe("Folders: Ghost (Feeds: 1)");
    });

    it("counts a feed once when it is selected and also inside a selected folder", () => {
      const { view } = createView();
      view.selectedFolders = ["Tech"];
      view.selectedFeeds = [TECH_ONE, ROOT_ONE];

      expect(view.getArticlesTitle()).toBe("Folders: Tech (Feeds: 3)");
    });

    it("lists only the feed count when only feeds are selected", () => {
      const { view } = createView();
      view.selectedFeeds = [NEWS_ONE, ROOT_ONE, TECH_ONE];

      expect(view.getArticlesTitle()).toBe("3 feeds");
    });

    it("says '1 feeds' for a single selected feed", () => {
      const { view } = createView();
      view.selectedFeeds = [ROOT_ONE];

      // BUG: pinned, see #582
      expect(view.getArticlesTitle()).toBe("1 feeds");
    });

    it("counts a selected feed URL that matches no feed", () => {
      const { view } = createView();
      view.selectedFeeds = ["https://unknown.example/feed"];

      // BUG: pinned, see #582
      expect(view.getArticlesTitle()).toBe("1 feeds");
    });

    it("treats empty selections as no selection", () => {
      const { view } = createView();
      view.selectedFolders = [];
      view.selectedFeeds = [];
      view.selectedTags = [];

      expect(view.getArticlesTitle()).toBe("All articles");
    });
  });
});

describe("Dashboard getArticlesTitleInfo characterization", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("returns the base title and no tooltip when no dashboard filters are active", () => {
    const { view } = createView();
    view.currentFolder = "starred";

    expect(view.getArticlesTitleInfo()).toEqual({
      title: "Starred items",
      tooltip: null,
    });
  });

  it("rewrites 'All articles' around an active status filter", () => {
    const { view } = createView();
    view.activeStatusFilters = new Set(["unread"]);

    expect(view.getArticlesTitleInfo()).toEqual({
      title: "All Unread articles",
      tooltip: "Active filters (OR): Unread",
    });
  });

  it("joins several status filters with the filter logic word", () => {
    const { view } = createView();
    view.activeStatusFilters = new Set(["starred", "unread"]);
    view.filterLogic = "AND";

    expect(view.getArticlesTitleInfo()).toEqual({
      title: "All Unread and Starred articles",
      tooltip: "Active filters (AND): Unread, Starred",
    });
  });

  it("uses 'items' in the rewritten title when a media status filter is active", () => {
    const { view } = createView();
    view.activeStatusFilters = new Set(["podcasts"]);

    expect(view.getArticlesTitleInfo().title).toBe("All Podcasts items");
  });

  it("appends the filters to a special folder's title", () => {
    const { view } = createView();
    view.currentFolder = "starred";
    view.activeStatusFilters = new Set(["unread"]);

    expect(view.getArticlesTitleInfo()).toEqual({
      title: "Starred items — Unread",
      tooltip: "Active filters (OR): Unread",
    });
  });

  it("appends the filters to a folder selection's title", () => {
    const { view } = createView();
    view.selectedFolders = ["Tech"];
    view.activeStatusFilters = new Set(["read"]);

    expect(view.getArticlesTitleInfo().title).toBe(
      "Folders: Tech (Feeds: 2) — Read",
    );
  });

  it("appends the filters to a sidebar tag selection's title", () => {
    const { view } = createView();
    view.selectedTags = ["a"];
    view.activeStatusFilters = new Set(["saved"]);

    expect(view.getArticlesTitleInfo().title).toBe("Tags (OR): a — Saved");
  });

  it("rewrites the base to 'Latest from <feed>' for a single feed", () => {
    const { view } = createView();
    view.currentFeed = makeFeed("My feed", "https://x.example/feed");
    view.activeStatusFilters = new Set(["unread"]);

    expect(view.getArticlesTitleInfo()).toEqual({
      title: "Latest from My feed — Unread",
      tooltip: "Active filters (OR): Unread",
    });
  });

  it("returns a single feed's plain title when no dashboard filters are active", () => {
    const { view } = createView();
    view.currentFeed = makeFeed("My feed", "https://x.example/feed");

    expect(view.getArticlesTitleInfo()).toEqual({
      title: "My feed",
      tooltip: null,
    });
  });

  it("names the dashboard tag filters, sorted, in the title and tooltip", () => {
    const { view } = createView();
    view.activeTagFilters = new Set(["zeta", "Alpha"]);

    expect(view.getArticlesTitleInfo()).toEqual({
      title: "All Tags: Alpha, zeta articles",
      tooltip: "Active filters (OR): Tags: Alpha, zeta",
    });
  });

  it("drops tagged and untagged from the title when tag names are active", () => {
    const { view } = createView();
    view.activeStatusFilters = new Set(["tagged", "unread"]);
    view.activeTagFilters = new Set(["a"]);

    expect(view.getArticlesTitleInfo().title).toBe(
      "All Unread or Tags: a articles",
    );
  });

  it("keeps an untagged status filter in the title when no tag names are active", () => {
    const { view } = createView();
    view.currentFolder = "read";
    view.activeStatusFilters = new Set(["untagged"]);

    expect(view.getArticlesTitleInfo()).toEqual({
      title: "Read items — Untagged",
      tooltip: "Active filters (OR): Untagged",
    });
  });
});
