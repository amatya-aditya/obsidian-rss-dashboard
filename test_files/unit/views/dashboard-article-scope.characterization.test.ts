import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import type { FilterContext } from "../../../src/utils/filter-detection";
import { RssDashboardView } from "../../../src/views/dashboard-view";

// Pin the three article-pool paths before #486 moves them. The list, status
// bar, and empty state are read through public render(), not the pool methods.
let articleListArgs: unknown[] = [];
let emptyStateContext: FilterContext | null = null;

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(...args: unknown[]) {
      articleListArgs = args;
    }
    render = vi.fn();
    destroy = vi.fn();
    refilter = vi.fn();
    setSelectedArticle = vi.fn();
    updateRefreshButtonText = vi.fn();
    setEmptyStateContext = vi.fn((context: FilterContext) => {
      emptyStateContext = context;
    });
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

const DAY_MS = 24 * 60 * 60 * 1000;
const tag = (name: string) => ({ name, color: "#888888" });

function item(guid: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: guid,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: new Date(Date.now() - DAY_MS / 2).toISOString(),
    guid,
    read: false,
    starred: false,
    saved: false,
    tags: [],
    feedTitle: "",
    feedUrl: "",
    coverImage: "",
    ...overrides,
  };
}

function feed(name: string, folder: string, items: FeedItem[]): Feed {
  return {
    title: name,
    url: `https://example.com/${name.toLowerCase()}.xml`,
    folder,
    items,
    lastUpdated: Date.now(),
  };
}

function makeFeeds(): Feed[] {
  return [
    feed("Root", "", [
      item("root-blue", { tags: [tag("Blue")] }),
      item("root-red-read", {
        read: true,
        tags: [tag("Red")],
        feedTitle: "Original title",
        feedUrl: "https://original.example/feed",
      }),
    ]),
    feed("News", "News", [
      item("news-red", { tags: [tag("Red")] }),
      item("news-starred-blue", {
        starred: true,
        tags: [tag("Blue")],
        pubDate: new Date(Date.now() - 60 * DAY_MS).toISOString(),
      }),
      item("news-saved", { saved: true }),
    ]),
    feed("Tech", "News/Tech", [
      item("tech-red-blue-read", {
        read: true,
        tags: [tag("Red"), tag("Blue")],
      }),
      item("tech-video", { mediaType: "video" }),
    ]),
    feed("Deep", "News/Tech/Deep", [
      item("deep-podcast", { mediaType: "podcast" }),
    ]),
    feed("Hobby", "Hobby", [
      item("hobby-green", { tags: [tag("Green")] }),
      item("hobby-saved", { saved: true }),
    ]),
    feed("Empty", "Empty", []),
  ];
}

interface ScopeSetup {
  currentFeed?: string;
  staleFeedUrl?: boolean;
  currentFolder?: string;
  selectedFolders?: readonly string[];
  selectedFeeds?: readonly string[];
  selectedTags?: readonly string[];
  tagMode?: RssDashboardSettings["sidebarTagFilterMode"];
  ageMs?: number;
}

interface RenderedScope {
  articles: FeedItem[];
  total: number;
  title: string;
  status: string | null;
  empty: FilterContext | null;
  countOnly: number;
}

function renderScope(setup: ScopeSetup = {}): RenderedScope {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.feeds = makeFeeds();
  settings.folders = [
    {
      name: "News",
      subfolders: [
        { name: "Tech", subfolders: [{ name: "Deep", subfolders: [] }] },
      ],
    },
    { name: "Hobby", subfolders: [] },
    { name: "Empty", subfolders: [] },
  ] as RssDashboardSettings["folders"];
  settings.sidebarTagFilterMode = setup.tagMode ?? "or";
  settings.articleFilter =
    setup.ageMs === undefined
      ? { type: "none", value: null }
      : { type: "age", value: setup.ageMs };

  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    openTagsSettings: vi.fn(async () => {}),
  };
  const leaf = {
    app: new App(),
  } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never);
  const internals = view as unknown as {
    currentFeed: Feed | null;
    currentFolder: string | null;
    selectedFolders: string[];
    selectedFeeds: string[];
    selectedTags: string[];
    setupSidebarResize: () => void;
    getTotalArticlesCountForCurrentView: () => number;
  };
  internals.currentFolder = setup.currentFolder ?? null;
  internals.selectedFolders = [...(setup.selectedFolders ?? [])];
  internals.selectedFeeds = [...(setup.selectedFeeds ?? [])];
  internals.selectedTags = [...(setup.selectedTags ?? [])];
  if (setup.currentFeed) {
    const liveFeed = settings.feeds.find(
      (entry) => entry.title === setup.currentFeed,
    );
    if (!liveFeed)
      throw new Error(`Unknown fixture feed: ${setup.currentFeed}`);
    internals.currentFeed = {
      ...liveFeed,
      url: setup.staleFeedUrl ? "https://old.example/feed" : liveFeed.url,
      items: [item("stale")],
    };
  }
  internals.setupSidebarResize = vi.fn();

  view.render();

  return {
    articles: (articleListArgs[4] ?? []) as FeedItem[],
    total: articleListArgs[10] as number,
    title: articleListArgs[2] as string,
    status:
      view.containerEl.querySelector(".rss-dashboard-viewing-filter-stats-text")
        ?.textContent ?? null,
    empty: emptyStateContext,
    // This method currently has no production caller. Render cannot observe it.
    countOnly: internals.getTotalArticlesCountForCurrentView(),
  };
}

function guids(result: RenderedScope): string[] {
  return result.articles.map((article) => article.guid).sort();
}

const all = [
  "root-blue",
  "root-red-read",
  "news-red",
  "news-starred-blue",
  "news-saved",
  "tech-red-blue-read",
  "tech-video",
  "deep-podcast",
  "hobby-green",
  "hobby-saved",
].sort();
const news = [
  "news-red",
  "news-starred-blue",
  "news-saved",
  "tech-red-blue-read",
  "tech-video",
  "deep-podcast",
].sort();

describe("Dashboard article scope (characterization, #486)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.clearAllMocks();
    articleListArgs = [];
    emptyStateContext = null;
  });

  afterEach(() => {
    document.body.empty();
  });

  it("shows every feed in the all-articles view", () => {
    const result = renderScope();
    expect(guids(result)).toEqual(all);
    expect(result.total).toBe(10);
    expect(result.title).toBe("All articles");
    expect(result.status).toBe(
      "No filters applied - Showing 10 | Filtered out 0 | Total 10",
    );
    expect(result.empty).toEqual({
      type: "NoArticlesAtAll",
      unfilteredCount: 10,
    });
    expect(result.countOnly).toBe(10);
  });

  it("refreshes a selected feed reference and preserves its existing item source metadata", () => {
    const result = renderScope({ currentFeed: "Root" });
    expect(guids(result)).toEqual(["root-blue", "root-red-read"]);
    expect(
      result.articles.find((entry) => entry.guid === "root-blue"),
    ).toMatchObject({
      feedTitle: "Root",
      feedUrl: "https://example.com/root.xml",
    });
    expect(
      result.articles.find((entry) => entry.guid === "root-red-read"),
    ).toMatchObject({
      feedTitle: "Original title",
      feedUrl: "https://original.example/feed",
    });
    expect(result.total).toBe(2);
    expect(result.countOnly).toBe(2);
  });

  it("falls back to the feed title and folder when a selected feed URL changed", () => {
    expect(
      guids(renderScope({ currentFeed: "Root", staleFeedUrl: true })),
    ).toEqual(["root-blue", "root-red-read"]);
  });

  it.each([
    [
      "selected feeds",
      {
        selectedFeeds: [
          "https://example.com/tech.xml",
          "https://example.com/hobby.xml",
        ],
      },
      ["tech-red-blue-read", "tech-video", "hobby-green", "hobby-saved"],
    ],
    ["selected parent folder", { selectedFolders: ["News"] }, news],
    [
      "mixed folder and feed selection without duplicates",
      {
        selectedFolders: ["News"],
        selectedFeeds: [
          "https://example.com/tech.xml",
          "https://example.com/root.xml",
        ],
      },
      [...news, "root-blue", "root-red-read"],
    ],
    ["regular parent folder", { currentFolder: "News" }, news],
    [
      "regular child folder",
      { currentFolder: "News/Tech" },
      ["tech-red-blue-read", "tech-video", "deep-podcast"],
    ],
    ["empty folder", { currentFolder: "Empty" }, []],
  ] as const)("shows the %s scope", (_label, setup, expected) => {
    const result = renderScope(setup);
    expect(guids(result)).toEqual([...expected].sort());
    expect(result.total).toBe(expected.length);
    expect(result.empty?.unfilteredCount).toBe(expected.length);
  });

  it.each([
    [
      "unread",
      [
        "root-blue",
        "news-red",
        "news-starred-blue",
        "news-saved",
        "tech-video",
        "deep-podcast",
        "hobby-green",
        "hobby-saved",
      ],
    ],
    ["read", ["root-red-read", "tech-red-blue-read"]],
    ["starred", ["news-starred-blue"]],
    ["saved", ["news-saved", "hobby-saved"]],
    ["videos", ["tech-video"]],
    ["podcasts", ["deep-podcast"]],
  ] as const)("shows the %s special view", (currentFolder, expected) => {
    const result = renderScope({ currentFolder });
    expect(guids(result)).toEqual([...expected].sort());
    expect(result.total).toBe(expected.length);
    expect(result.countOnly).toBe(expected.length);
  });

  it("keeps the full special-view pool for an empty-state explanation", () => {
    const result = renderScope({
      currentFolder: "starred",
      selectedTags: ["Green"],
    });
    expect(result.articles).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.empty).toMatchObject({
      type: "AllArticlesFiltered",
      unfilteredCount: 1,
      filterReason: "view-filter",
    });
    expect(result.countOnly).toBe(1);
  });

  it("uses the selected feed's articles to explain an empty age-filtered view", () => {
    const result = renderScope({
      currentFeed: "News",
      selectedTags: ["Blue"],
      ageMs: DAY_MS,
    });
    expect(result.total).toBe(0);
    expect(result.empty).toMatchObject({
      type: "AllArticlesFiltered",
      unfilteredCount: 1,
      filterReason: "age-filter",
    });
  });

  it("uses a multiselection pool before a special-view filter for the empty state", () => {
    const result = renderScope({
      currentFolder: "podcasts",
      selectedFeeds: ["https://example.com/root.xml"],
    });
    expect(result.total).toBe(0);
    expect(result.empty).toMatchObject({
      type: "AllArticlesFiltered",
      unfilteredCount: 2,
      filterReason: "view-filter",
    });
  });

  it("uses a selected folder before a special-view filter for the empty state", () => {
    const result = renderScope({
      currentFolder: "saved",
      selectedFolders: ["News/Tech"],
    });
    expect(result.total).toBe(0);
    expect(result.empty).toMatchObject({
      type: "AllArticlesFiltered",
      unfilteredCount: 3,
      filterReason: "view-filter",
    });
  });

  it.each([
    ["regular parent folder", { currentFolder: "News" }, 6],
    ["all feeds", {}, 10],
  ] as const)(
    "uses the %s pool to explain an empty age-filtered view",
    (_label, setup, count) => {
      const result = renderScope({ ...setup, ageMs: 1 });
      expect(result.total).toBe(0);
      expect(result.empty).toMatchObject({
        type: "AllArticlesFiltered",
        unfilteredCount: count,
        filterReason: "age-filter",
      });
    },
  );

  it.each([
    [
      "or",
      [
        "root-blue",
        "root-red-read",
        "news-red",
        "news-starred-blue",
        "tech-red-blue-read",
      ],
    ],
    ["and", ["tech-red-blue-read"]],
    [
      "not",
      [
        "news-saved",
        "tech-video",
        "deep-podcast",
        "hobby-green",
        "hobby-saved",
      ],
    ],
  ] as const)(
    "applies sidebar %s tags to the rendered pool",
    (tagMode, expected) => {
      const result = renderScope({ selectedTags: ["Red", "Blue"], tagMode });
      expect(guids(result)).toEqual([...expected].sort());
      expect(result.status).toBe(
        `No filters applied - Showing ${expected.length} | Filtered out 0 | Total ${expected.length}`,
      );
      expect(result.empty?.unfilteredCount).toBe(expected.length);
      expect(result.countOnly).toBe(expected.length);
    },
  );

  it.each([
    ["or", 5],
    ["and", 1],
    ["not", 5],
  ] as const)(
    "uses sidebar %s tags in the age-filtered empty-state pool",
    (tagMode, count) => {
      const result = renderScope({
        selectedTags: ["Red", "Blue"],
        tagMode,
        ageMs: 1,
      });
      expect(result.total).toBe(0);
      expect(result.empty).toMatchObject({
        type: "AllArticlesFiltered",
        unfilteredCount: count,
        filterReason: "age-filter",
      });
    },
  );

  it("gives selected tags precedence over a regular folder in the count-only path", () => {
    const result = renderScope({
      currentFolder: "News",
      selectedTags: ["Green"],
    });
    expect(result.total).toBe(0);
    expect(result.empty).toEqual({
      type: "NoArticlesAtAll",
      unfilteredCount: 0,
    });
    expect(result.countOnly).toBe(1);
  });

  it("ignores multiselection in the count-only path", () => {
    const result = renderScope({ selectedFolders: ["News"] });
    expect(result.total).toBe(6);
    expect(result.countOnly).toBe(10);
  });

  it.each([
    ["News", 6],
    ["News/Tech", 3],
    ["Empty", 0],
  ] as const)(
    "includes the current %s folder in the count-only path",
    (currentFolder, expected) => {
      expect(renderScope({ currentFolder }).countOnly).toBe(expected);
    },
  );

  it("bypasses the count-only age filter for a selected feed", () => {
    const result = renderScope({ currentFeed: "News", ageMs: DAY_MS });
    expect(guids(result)).toEqual(["news-red", "news-saved"]);
    expect(result.countOnly).toBe(3);
  });

  it("applies the age cutoff to the count-only special view", () => {
    const result = renderScope({ currentFolder: "starred", ageMs: DAY_MS });
    expect(result.total).toBe(0);
    expect(result.empty).toMatchObject({
      type: "AllArticlesFiltered",
      unfilteredCount: 1,
      filterReason: "age-filter",
      actionLabel: "Adjust view filters",
    });
    expect(result.countOnly).toBe(0);
  });
});
