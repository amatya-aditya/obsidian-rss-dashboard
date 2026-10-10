import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
  type KeywordFilterRule,
} from "../../../src/types/types";
import type { FilterContext } from "../../../src/utils/filter-detection";
import { RssDashboardView } from "../../../src/views/dashboard-view";

// Keep filtering and scope selection real; record only the article-list boundary.
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

function rule(keyword: string): KeywordFilterRule {
  return {
    id: keyword,
    type: "exclude",
    keyword,
    matchMode: "partial",
    applyToTitle: true,
    applyToSummary: false,
    applyToContent: false,
    enabled: true,
    createdAt: 0,
  };
}

function item(
  guid: string,
  title = guid,
  extra: Partial<FeedItem> = {},
): FeedItem {
  return {
    guid,
    title,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: "2026-10-01T00:00:00.000Z",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "",
    feedUrl: "",
    coverImage: "",
    ...extra,
  };
}

function feed(title: string, items: FeedItem[], keyword = "local"): Feed {
  return {
    title,
    url: `https://example.com/${title}`,
    folder: "",
    items,
    lastUpdated: 0,
    keywordRules: {
      overrideGlobalRules: false,
      includeLogic: "AND",
      rules: [rule(keyword)],
    },
  };
}

interface ViewInternals {
  currentFeed: Feed | null;
  setupSidebarResize(): void;
  applyKeywordFiltersWithStats(
    articles: FeedItem[],
    feedsByUrl?: ReadonlyMap<string, Feed>,
  ): FeedItem[];
  findFeedForArticle(
    article: FeedItem,
    feedsByUrl?: ReadonlyMap<string, Feed>,
  ): Feed | undefined;
  getFilteredArticles(): FeedItem[];
  keywordFilterStats: {
    articlesRetrieved: number;
    globalExcluded: number;
    feedExcluded: number;
    finalVisible: number;
    filtersActive: boolean;
    bypassActive: boolean;
  };
  keywordFilterTooltip: string;
}

function harness(feeds: Feed[]) {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.feeds = feeds;
  settings.articleFilter = { type: "none", value: null };
  settings.keywordRules = {
    includeLogic: "AND",
    bypassAll: false,
    rules: [rule("global")],
  };
  settings.dashboardMultiFilters = {
    statusFilters: [],
    tagFilters: [],
    logic: "OR",
  };
  const leaf = {
    app: new App(),
  } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, {
    settings,
    saveSettings: vi.fn(async () => {}),
  } as never);
  const internals = view as unknown as ViewInternals;
  internals.setupSidebarResize = vi.fn();
  return { view, internals, settings };
}

function result(view: RssDashboardView) {
  return {
    guids: (articleListArgs[4] as FeedItem[]).map((article) => article.guid),
    total: articleListArgs[10] as number,
    keywordText: view.containerEl.querySelector(
      ".rss-dashboard-filter-stats-text:not(.rss-dashboard-refresh-status-text)",
    )?.textContent,
    viewingText: view.containerEl.querySelector(
      ".rss-dashboard-viewing-filter-stats-text",
    )?.textContent,
    tooltip: view.containerEl
      .querySelector(".rss-dashboard-filter-subheader-content")
      ?.getAttribute("aria-label"),
    emptyState: emptyStateContext,
  };
}

const globalTooltip =
  'Global rules (include logic: AND):\n- EXCLUDE "global" (partial) [title]';
const feedTooltip =
  'Feed rules:\n- Alpha (include logic: AND)\n  - EXCLUDE "local" (partial) [title]\n- Beta (include logic: OR)\n  - EXCLUDE "keep" (partial) [title]';

beforeEach(() => {
  installObsidianDomPolyfills();
  articleListArgs = [];
  emptyStateContext = null;
});

afterEach(() => {
  document.body.empty();
  vi.restoreAllMocks();
});

describe("Dashboard keyword feed lookup", () => {
  it.each([
    {
      name: "global rules",
      global: true,
      perFeed: false,
      bypass: false,
      guids: ["keep", "local", "duplicate", "beta-local"],
      globalExcluded: 3,
      feedExcluded: 0,
      tooltip: globalTooltip,
    },
    {
      name: "feed rules",
      global: false,
      perFeed: true,
      bypass: false,
      guids: ["keep", "global", "duplicate", "beta-global", "beta-local"],
      globalExcluded: 0,
      feedExcluded: 2,
      tooltip: feedTooltip,
    },
    {
      name: "both rules and a feed override",
      global: true,
      perFeed: true,
      bypass: false,
      guids: ["keep", "duplicate", "beta-global", "beta-local"],
      globalExcluded: 2,
      feedExcluded: 1,
      tooltip: `${globalTooltip}\n\n${feedTooltip}`,
    },
    {
      name: "bypassed rules",
      global: true,
      perFeed: true,
      bypass: true,
      guids: [
        "keep",
        "global",
        "local",
        "both",
        "duplicate",
        "beta-global",
        "beta-local",
      ],
      globalExcluded: 0,
      feedExcluded: 0,
      tooltip: `Bypass keyword rules is enabled.\n\n${globalTooltip}\n\n${feedTooltip}`,
    },
  ])(
    "preserves order, counts and tooltips with $name and duplicate URLs",
    (testCase) => {
      const alpha = feed("Alpha", [
        item("keep"),
        item("global"),
        item("local"),
        item("both", "global local"),
      ]);
      const duplicate = {
        ...feed("Duplicate", [item("duplicate", "keep")], "keep"),
        url: alpha.url,
      };
      const beta = feed(
        "Beta",
        [item("beta-global", "global"), item("beta-local", "local")],
        "keep",
      );
      beta.keywordRules = {
        ...beta.keywordRules!,
        overrideGlobalRules: true,
        includeLogic: "OR",
      };
      const h = harness([alpha, duplicate, beta]);
      if (!testCase.global) h.settings.keywordRules.rules = [];
      if (!testCase.perFeed)
        h.settings.feeds.forEach((entry) => {
          delete entry.keywordRules;
        });
      h.settings.keywordRules.bypassAll = testCase.bypass;

      h.view.render();

      expect(result(h.view)).toMatchObject({
        guids: testCase.guids,
        total: testCase.guids.length,
        keywordText: testCase.bypass
          ? "Keyword rules bypassed - showing all 7 articles"
          : `Articles retrieved: 7 | Excluded by global keyword rules: ${testCase.globalExcluded} | Excluded by per-feed keyword rules: ${testCase.feedExcluded}`,
        viewingText: `No filters applied - Showing ${testCase.guids.length} | Filtered out 0 | Total ${testCase.guids.length}`,
        tooltip: testCase.tooltip,
        emptyState: { unfilteredCount: testCase.guids.length },
      });
      expect(h.internals.keywordFilterStats).toEqual({
        articlesRetrieved: 7,
        globalExcluded: testCase.globalExcluded,
        feedExcluded: testCase.feedExcluded,
        finalVisible: testCase.guids.length,
        filtersActive: true,
        bypassActive: testCase.bypass,
      });
    },
  );

  it("keeps the filtered pool's counts and rules when the two render pools differ", () => {
    const hidden = feed("Hidden", [item("hidden", "keep", { starred: false })]);
    const visible = feed("Visible", [
      item("star", "keep", { starred: true }),
      item("excluded", "local", { starred: true }),
    ]);
    const h = harness([hidden, visible]);
    h.view.currentFolder = "starred";

    h.view.render();

    expect(result(h.view)).toMatchObject({
      guids: ["star"],
      total: 1,
      keywordText:
        "Articles retrieved: 2 | Excluded by global keyword rules: 0 | Excluded by per-feed keyword rules: 1",
      emptyState: { unfilteredCount: 1 },
      tooltip: `${globalTooltip}\n\nFeed rules:\n- Visible (include logic: AND)\n  - EXCLUDE "local" (partial) [title]`,
    });
  });

  it.each([undefined, ""])(
    "preserves current-feed and first GUID fallback for feedUrl %s",
    (feedUrl) => {
      // Scope builders normally fill missing URLs. Exercise the shared keyword
      // boundary directly to pin its legacy fallback for raw articles as well.
      const article = item("shared", "global", { feedUrl });
      const first = feed("First", [article], "global");
      const second = feed("Second", [article], "unmatched");
      second.keywordRules!.overrideGlobalRules = true;
      const h = harness([first, second]);
      h.internals.currentFeed = second;
      expect(h.internals.applyKeywordFiltersWithStats([article])).toEqual([
        article,
      ]);
      expect(h.internals.keywordFilterTooltip).toContain(
        "- Second (include logic: AND)",
      );

      h.internals.currentFeed = null;
      h.settings.keywordRules.rules = [];
      expect(h.internals.applyKeywordFiltersWithStats([article])).toEqual([]);
      expect(h.internals.keywordFilterStats.feedExcluded).toBe(1);
      expect(h.internals.keywordFilterTooltip).toBe(
        'Feed rules:\n- First (include logic: AND)\n  - EXCLUDE "global" (partial) [title]',
      );
    },
  );

  it("does not fall back to current feed or GUID for a present unmatched URL", () => {
    const article = item("unknown", "global", {
      feedUrl: "https://missing.example/feed",
    });
    const current = feed("Current", [article], "unmatched");
    current.keywordRules!.overrideGlobalRules = true;
    const h = harness([current]);
    h.internals.currentFeed = current;

    h.view.render();

    expect(result(h.view)).toMatchObject({
      guids: [],
      total: 0,
      keywordText:
        "Articles retrieved: 1 | Excluded by global keyword rules: 1 | Excluded by per-feed keyword rules: 0",
      tooltip: globalTooltip,
    });
  });

  it("uses feed replacements and duplicate reordering on the next render and outside render", () => {
    const first = feed("First", [item("hidden"), item("visible")], "hidden");
    const duplicate = { ...feed("Duplicate", [], "visible"), url: first.url };
    const h = harness([first, duplicate]);
    h.view.render();
    expect(result(h.view).guids).toEqual(["visible"]);

    h.settings.feeds = [duplicate, first];
    h.view.render();
    expect(result(h.view).guids).toEqual(["hidden"]);
    expect(result(h.view).tooltip).toContain(
      "- Duplicate (include logic: AND)",
    );

    h.settings.feeds = [
      {
        ...first,
        keywordRules: { ...first.keywordRules!, rules: [rule("unmatched")] },
      },
    ];
    expect(
      h.internals.getFilteredArticles().map((article) => article.guid),
    ).toEqual(["hidden", "visible"]);
    h.view.render();
    expect(result(h.view).guids).toEqual(["hidden", "visible"]);
    expect(result(h.view).tooltip).toContain('EXCLUDE "unmatched"');
  });

  it("ignores inactive rules and a later duplicate's active rules", () => {
    const first = feed("First", [item("visible", "local")]);
    first.keywordRules!.rules = [
      { ...rule("local"), enabled: false },
      rule("   "),
      { ...rule("local"), applyToTitle: false },
    ];
    const duplicate = { ...feed("Duplicate", [], "local"), url: first.url };
    const h = harness([first, duplicate]);
    h.settings.keywordRules.rules = [];

    h.view.render();

    expect(result(h.view)).toMatchObject({
      guids: ["visible"],
      total: 1,
      tooltip: null,
    });
    expect(h.internals.keywordFilterStats.filtersActive).toBe(false);
    expect(h.internals.keywordFilterStats.feedExcluded).toBe(0);
  });

  it("counts keyword exclusions before viewing filters and pagination", () => {
    const h = harness([
      feed("News", [
        item("read", "keep", { read: true }),
        item("unread", "keep"),
        item("excluded", "local"),
      ]),
    ]);
    h.settings.dashboardMultiFilters = {
      statusFilters: ["unread"],
      tagFilters: [],
      logic: "AND",
    };

    h.view.render();

    expect(result(h.view)).toMatchObject({
      guids: ["unread"],
      total: 1,
      keywordText:
        "Articles retrieved: 3 | Excluded by global keyword rules: 0 | Excluded by per-feed keyword rules: 1",
      viewingText: "Viewing filters: Showing 1 | Filtered out 1 | Total 2",
    });
    expect(h.internals.keywordFilterStats.finalVisible).toBe(2);
  });

  it("keeps global rules and resets feed tooltips for an empty filtered pool", () => {
    const h = harness([feed("News", [item("unstarred")])]);
    h.view.currentFolder = "starred";

    h.view.render();

    expect(result(h.view)).toMatchObject({
      guids: [],
      total: 0,
      keywordText:
        "Articles retrieved: 0 | Excluded by global keyword rules: 0 | Excluded by per-feed keyword rules: 0",
      tooltip: globalTooltip,
    });
  });

  it("shares one URL index across unequal render pools and every lookup pass", () => {
    const feeds = Array.from({ length: 20 }, (_, i) =>
      feed(
        `Feed ${i}`,
        Array.from({ length: 5 }, (_, j) =>
          item(`${i}-${j}`, "keep", { starred: j === 0 }),
        ),
      ),
    );
    const h = harness(feeds);
    h.view.currentFolder = "starred";
    const linearLookup = vi.spyOn(feeds, "find");
    const filtering = vi.spyOn(h.internals, "applyKeywordFiltersWithStats");
    const lookups = vi.spyOn(h.internals, "findFeedForArticle");

    h.view.render();

    expect(result(h.view).total).toBe(20);
    expect(filtering.mock.calls.map(([articles]) => articles.length)).toEqual([
      100, 20,
    ]);
    expect(linearLookup).not.toHaveBeenCalled();
    const index = filtering.mock.calls[0][1];
    expect(index).toBeInstanceOf(Map);
    expect(index?.size).toBe(20);
    expect(filtering.mock.calls[1][1]).toBe(index);
    // Active-rule discovery stops after the first article in each pool;
    // tooltip collection and evaluation each visit every article.
    expect(lookups).toHaveBeenCalledTimes(2 * (100 + 20) + 2);
    expect(
      lookups.mock.calls.every(([, usedIndex]) => usedIndex === index),
    ).toBe(true);

    h.view.render();
    expect(filtering.mock.calls[2][1]).not.toBe(index);
    expect(filtering.mock.calls[3][1]).toBe(filtering.mock.calls[2][1]);
  });
});
