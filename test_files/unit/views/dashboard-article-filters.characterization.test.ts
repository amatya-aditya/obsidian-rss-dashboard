import { describe, it, expect, vi, beforeEach } from "vitest";
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

// Characterization tests for the dashboard's article filter matching (#476),
// pinned before it moves out of dashboard-view.ts. They drive the public
// render() and read what reaches the article list, the filter status bar, and
// the empty state, so they survive the extraction unchanged.

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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FEED_URL = "https://example.com/feed.xml";

function makeItem(
  guid: string,
  ageMs: number | null,
  overrides: Partial<FeedItem> = {},
): FeedItem {
  return {
    title: guid,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: ageMs === null ? "" : new Date(Date.now() - ageMs).toISOString(),
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "News",
    feedUrl: FEED_URL,
    coverImage: "",
    saved: false,
    ...overrides,
  };
}

const tag = (name: string) => ({ name, color: "#888888" });

// One feed covering every attribute the filters read: read state, starred,
// saved, media type, zero/one/two tags, an old article, and an undated one.
function makeItems(): FeedItem[] {
  return [
    makeItem("plain-unread", 1 * HOUR_MS),
    makeItem("plain-read", 2 * HOUR_MS, { read: true }),
    makeItem("starred-important", 3 * HOUR_MS, {
      starred: true,
      tags: [tag("Important")],
    }),
    makeItem("saved-read", 4 * HOUR_MS, { saved: true, read: true }),
    makeItem("video", 5 * HOUR_MS, {
      mediaType: "video",
      tags: [tag("Video")],
    }),
    makeItem("podcast", 6 * HOUR_MS, { mediaType: "podcast", read: true }),
    makeItem("important-research", 7 * HOUR_MS, {
      tags: [tag("Important"), tag("Research")],
    }),
    makeItem("research", 8 * HOUR_MS, { read: true, tags: [tag("Research")] }),
    makeItem("old-unread", 60 * DAY_MS),
    makeItem("undated-first-seen", null, {
      firstSeenMs: Date.now() - HOUR_MS,
    }),
  ];
}

const ALL_GUIDS = makeItems()
  .map((item) => item.guid)
  .sort();

interface DashboardSetup {
  currentFolder?: string | null;
  selectedTags?: string[];
  sidebarTagFilterMode?: RssDashboardSettings["sidebarTagFilterMode"];
  statusFilters?: string[];
  tagFilters?: string[];
  logic?: "AND" | "OR";
  ageFilterMs?: number;
  articleFilter?: RssDashboardSettings["articleFilter"];
  useFirstSeenDateFallback?: boolean;
}

interface RenderResult {
  /** Guids handed to the article list, sorted. */
  guids: string[];
  /** Guids in the order the article list receives them. */
  orderedGuids: string[];
  totalArticles: number;
  statusText: string | null;
  emptyState: FilterContext | null;
}

function renderDashboard(setup: DashboardSetup = {}): RenderResult {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  const feed: Feed = {
    title: "News",
    url: FEED_URL,
    folder: "News",
    items: makeItems(),
    lastUpdated: Date.now(),
  };
  settings.feeds = [feed];
  settings.folders = [{ name: "News", subfolders: [] }] as never;
  settings.dashboardMultiFilters = {
    statusFilters: setup.statusFilters ?? [],
    tagFilters: setup.tagFilters ?? [],
    logic: setup.logic ?? "OR",
  };
  if ("sidebarTagFilterMode" in setup) {
    settings.sidebarTagFilterMode =
      setup.sidebarTagFilterMode as RssDashboardSettings["sidebarTagFilterMode"];
  }
  if (setup.articleFilter) {
    settings.articleFilter = setup.articleFilter;
  } else if (setup.ageFilterMs !== undefined) {
    settings.articleFilter = { type: "age", value: setup.ageFilterMs };
  }
  settings.useFirstSeenDateFallback = setup.useFirstSeenDateFallback ?? false;

  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    openTagsSettings: vi.fn(async () => {}),
  };
  const leaf = { app: new App() } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never);
  const internals = view as unknown as {
    currentFolder: string | null;
    selectedTags: string[];
    setupSidebarResize: () => void;
  };
  internals.currentFolder = setup.currentFolder ?? null;
  internals.selectedTags = setup.selectedTags ?? [];
  internals.setupSidebarResize = vi.fn();

  view.render();

  const articles = (articleListArgs[4] ?? []) as FeedItem[];
  const orderedGuids = articles.map((item) => item.guid);
  return {
    guids: [...orderedGuids].sort(),
    orderedGuids,
    totalArticles: articleListArgs[10] as number,
    statusText:
      view.containerEl.querySelector(
        ".rss-dashboard-viewing-filter-stats-text",
      )?.textContent ?? null,
    emptyState: emptyStateContext,
  };
}

const sorted = (guids: string[]) => [...guids].sort();

describe("Dashboard article filters (characterization, #476)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    articleListArgs = [];
    emptyStateContext = null;
  });

  describe("with no filters", () => {
    it("shows every article, newest first, undated last", () => {
      const result = renderDashboard();
      expect(result.guids).toEqual(ALL_GUIDS);
      expect(result.totalArticles).toBe(10);
      expect(result.orderedGuids[result.orderedGuids.length - 1]).toBe(
        "undated-first-seen",
      );
      expect(result.statusText).toBe(
        "No filters applied - Showing 10 | Filtered out 0 | Total 10",
      );
      expect(result.emptyState).toEqual({
        type: "NoArticlesAtAll",
        unfilteredCount: 10,
      });
    });
  });

  describe("sidebar tag selection", () => {
    it("Or mode keeps articles with any selected tag", () => {
      const result = renderDashboard({
        selectedTags: ["Important", "Video"],
        sidebarTagFilterMode: "or",
      });
      expect(result.guids).toEqual(
        sorted(["starred-important", "video", "important-research"]),
      );
    });

    it("And mode keeps articles with every selected tag", () => {
      const result = renderDashboard({
        selectedTags: ["Important", "Research"],
        sidebarTagFilterMode: "and",
      });
      expect(result.guids).toEqual(["important-research"]);
    });

    it("Not mode keeps articles with none of the selected tags", () => {
      const result = renderDashboard({
        selectedTags: ["Important", "Research"],
        sidebarTagFilterMode: "not",
      });
      expect(result.guids).toEqual(
        sorted([
          "plain-unread",
          "plain-read",
          "saved-read",
          "video",
          "podcast",
          "old-unread",
          "undated-first-seen",
        ]),
      );
    });

    it("an unset mode behaves as Or", () => {
      const result = renderDashboard({
        selectedTags: ["Research"],
        sidebarTagFilterMode: undefined,
      });
      expect(result.guids).toEqual(sorted(["important-research", "research"]));
    });

    it("counts the status bar total within the selected tags", () => {
      const result = renderDashboard({
        selectedTags: ["Important", "Research"],
        sidebarTagFilterMode: "or",
        statusFilters: ["unread"],
      });
      expect(result.guids).toEqual(
        sorted(["starred-important", "important-research"]),
      );
      expect(result.statusText).toBe(
        "Viewing filters: Showing 2 | Filtered out 1 | Total 3",
      );
    });
  });

  describe("special sidebar views", () => {
    it.each([
      ["starred", ["starred-important"]],
      [
        "unread",
        [
          "plain-unread",
          "starred-important",
          "video",
          "important-research",
          "old-unread",
          "undated-first-seen",
        ],
      ],
      ["read", ["plain-read", "saved-read", "podcast", "research"]],
      ["saved", ["saved-read"]],
      ["videos", ["video"]],
      ["podcasts", ["podcast"]],
    ])("the %s view shows only matching articles", (folder, expected) => {
      const result = renderDashboard({ currentFolder: folder });
      expect(result.guids).toEqual(sorted(expected));
      expect(result.statusText).toBe(
        `No filters applied - Showing ${expected.length} | Filtered out 0 | Total ${expected.length}`,
      );
    });

    it("an empty special view reports the view filter, scoped to all articles", () => {
      const result = renderDashboard({
        currentFolder: "starred",
        statusFilters: ["read"],
        logic: "AND",
      });
      expect(result.guids).toEqual([]);
      expect(result.statusText).toBe(
        "Viewing filters: Showing 0 | Filtered out 1 | Total 1",
      );
      expect(result.emptyState).toEqual({
        type: "AllArticlesFiltered",
        unfilteredCount: 10,
        filteredCount: 0,
        filterReason: "view-filter",
        filterReasonLabel: "the Starred view filter",
        actionTarget: "view-filter",
        actionLabel: "Adjust view filters",
      });
    });

    it("a regular folder applies no status matching", () => {
      const result = renderDashboard({ currentFolder: "News" });
      expect(result.guids).toEqual(ALL_GUIDS);
    });
  });

  describe("header multi-filters in And mode", () => {
    it.each([
      [
        "unread",
        [
          "plain-unread",
          "starred-important",
          "video",
          "important-research",
          "old-unread",
          "undated-first-seen",
        ],
      ],
      ["read", ["plain-read", "saved-read", "podcast", "research"]],
      ["saved", ["saved-read"]],
      ["starred", ["starred-important"]],
      ["videos", ["video"]],
      ["podcasts", ["podcast"]],
      [
        "tagged",
        ["starred-important", "video", "important-research", "research"],
      ],
      [
        "untagged",
        [
          "plain-unread",
          "plain-read",
          "saved-read",
          "podcast",
          "old-unread",
          "undated-first-seen",
        ],
      ],
    ])("the %s status alone", (status, expected) => {
      const result = renderDashboard({ statusFilters: [status], logic: "AND" });
      expect(result.guids).toEqual(sorted(expected));
      expect(result.statusText).toBe(
        `Viewing filters: Showing ${expected.length} | Filtered out ${10 - expected.length} | Total 10`,
      );
    });

    it("requires every checked status", () => {
      const result = renderDashboard({
        statusFilters: ["unread", "tagged"],
        logic: "AND",
      });
      expect(result.guids).toEqual(
        sorted(["starred-important", "video", "important-research"]),
      );
    });

    it("contradictory statuses match nothing", () => {
      const result = renderDashboard({
        statusFilters: ["read", "unread"],
        logic: "AND",
      });
      expect(result.guids).toEqual([]);
      expect(result.statusText).toBe(
        "Viewing filters: Showing 0 | Filtered out 10 | Total 10",
      );
    });

    it("specific tags match any of the checked tags, not all of them", () => {
      const result = renderDashboard({
        tagFilters: ["Video", "Research"],
        logic: "AND",
      });
      expect(result.guids).toEqual(
        sorted(["video", "important-research", "research"]),
      );
    });

    it("Tagged plus one tag narrows to that tag", () => {
      const result = renderDashboard({
        statusFilters: ["tagged"],
        tagFilters: ["Important"],
        logic: "AND",
      });
      expect(result.guids).toEqual(
        sorted(["starred-important", "important-research"]),
      );
    });

    it("Untagged plus a tag matches nothing", () => {
      const result = renderDashboard({
        statusFilters: ["untagged"],
        tagFilters: ["Important"],
        logic: "AND",
      });
      expect(result.guids).toEqual([]);
    });

    it("an unknown status imposes no condition", () => {
      const result = renderDashboard({
        statusFilters: ["bogus"],
        logic: "AND",
      });
      expect(result.guids).toEqual(ALL_GUIDS);
      expect(result.statusText).toBe(
        "Viewing filters: Showing 10 | Filtered out 0 | Total 10",
      );
    });
  });

  describe("header multi-filters in Or mode", () => {
    it.each([
      ["saved", ["saved-read"]],
      ["starred", ["starred-important"]],
      ["videos", ["video"]],
      ["podcasts", ["podcast"]],
      ["read", ["plain-read", "saved-read", "podcast", "research"]],
    ])("the %s status alone", (status, expected) => {
      const result = renderDashboard({ statusFilters: [status], logic: "OR" });
      expect(result.guids).toEqual(sorted(expected));
    });

    it("unions the checked statuses", () => {
      const result = renderDashboard({
        statusFilters: ["starred", "videos", "podcasts"],
        logic: "OR",
      });
      expect(result.guids).toEqual(
        sorted(["starred-important", "video", "podcast"]),
      );
      expect(result.statusText).toBe(
        "Viewing filters: Showing 3 | Filtered out 7 | Total 10",
      );
    });

    it("unions statuses with specific tags", () => {
      const result = renderDashboard({
        statusFilters: ["saved"],
        tagFilters: ["Research"],
        logic: "OR",
      });
      expect(result.guids).toEqual(
        sorted(["saved-read", "important-research", "research"]),
      );
    });

    it("Tagged plus one tag still shows every tagged article", () => {
      // BUG: pinned, see #463
      const result = renderDashboard({
        statusFilters: ["tagged"],
        tagFilters: ["Research"],
        logic: "OR",
      });
      expect(result.guids).toEqual(
        sorted(["starred-important", "video", "important-research", "research"]),
      );
    });

    it("Untagged or a tag unions both groups", () => {
      const result = renderDashboard({
        statusFilters: ["untagged"],
        tagFilters: ["Video"],
        logic: "OR",
      });
      expect(result.guids).toEqual(
        sorted([
          "plain-unread",
          "plain-read",
          "saved-read",
          "podcast",
          "old-unread",
          "undated-first-seen",
          "video",
        ]),
      );
    });

    it("an unknown status alone matches nothing", () => {
      const result = renderDashboard({
        statusFilters: ["bogus"],
        logic: "OR",
      });
      expect(result.guids).toEqual([]);
      expect(result.statusText).toBe(
        "Viewing filters: Showing 0 | Filtered out 10 | Total 10",
      );
    });

    it("an unrecognised logic value behaves as Or", () => {
      const result = renderDashboard({
        statusFilters: ["saved", "starred"],
        logic: "XOR" as never,
      });
      expect(result.guids).toEqual(sorted(["saved-read", "starred-important"]));
    });
  });

  describe("header multi-filters inside a special view", () => {
    it("apply on top of the view, and the status bar total is the view", () => {
      const result = renderDashboard({
        currentFolder: "unread",
        statusFilters: ["tagged"],
        logic: "AND",
      });
      expect(result.guids).toEqual(
        sorted(["starred-important", "video", "important-research"]),
      );
      expect(result.statusText).toBe(
        "Viewing filters: Showing 3 | Filtered out 3 | Total 6",
      );
    });
  });

  describe("age filter", () => {
    it("hides articles older than the limit, and undated ones without the first-seen fallback", () => {
      const result = renderDashboard({ ageFilterMs: 7 * DAY_MS });
      expect(result.guids).toEqual(
        sorted([
          "plain-unread",
          "plain-read",
          "starred-important",
          "saved-read",
          "video",
          "podcast",
          "important-research",
          "research",
        ]),
      );
      expect(result.statusText).toBe(
        "No filters applied - Showing 8 | Filtered out 0 | Total 8",
      );
    });

    it("keeps an undated article by its first-seen date when the fallback is on", () => {
      const result = renderDashboard({
        ageFilterMs: 7 * DAY_MS,
        useFirstSeenDateFallback: true,
      });
      expect(result.guids).toContain("undated-first-seen");
      expect(result.guids).not.toContain("old-unread");
      expect(result.totalArticles).toBe(9);
    });

    it.each([
      ["a zero age", { type: "age", value: 0 }],
      ["a non-numeric age", { type: "age", value: "7" }],
      ["a non-age filter type", { type: "unread", value: 1 }],
    ])("ignores %s", (_label, articleFilter) => {
      const result = renderDashboard({
        articleFilter: articleFilter as RssDashboardSettings["articleFilter"],
      });
      expect(result.guids).toEqual(ALL_GUIDS);
    });

    it("an empty result counts the articles the other filters allow", () => {
      const result = renderDashboard({
        currentFolder: "starred",
        ageFilterMs: 1 * HOUR_MS,
      });
      expect(result.guids).toEqual([]);
      expect(result.emptyState).toMatchObject({
        type: "AllArticlesFiltered",
        unfilteredCount: 1,
        filteredCount: 0,
        filterReason: "age-filter",
      });
    });

    it.each([
      ["starred", 1],
      ["unread", 6],
      ["read", 4],
      ["saved", 1],
      ["videos", 1],
      ["podcasts", 1],
    ])(
      "an empty %s view counts only the view's articles before the age limit",
      (folder, expected) => {
        // Every dated article is older than 30 minutes; the undated one has no
        // effective date without the first-seen fallback.
        const result = renderDashboard({
          currentFolder: folder,
          ageFilterMs: 30 * 60 * 1000,
        });
        expect(result.guids).toEqual([]);
        expect(result.emptyState).toMatchObject({
          type: "AllArticlesFiltered",
          unfilteredCount: expected,
          filterReason: "age-filter",
        });
      },
    );

    it("an empty result with multi-filters counts only articles passing them", () => {
      const result = renderDashboard({
        statusFilters: ["unread", "tagged"],
        logic: "AND",
        ageFilterMs: 1 * HOUR_MS,
      });
      expect(result.guids).toEqual([]);
      expect(result.emptyState?.type).toBe("AllArticlesFiltered");
      expect(result.emptyState?.unfilteredCount).toBe(3);
    });
  });
});
