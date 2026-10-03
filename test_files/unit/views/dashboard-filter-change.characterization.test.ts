/**
 * Characterization tests for `RssDashboardView.handleFilterChange` (#577).
 *
 * `handleFilterChange` is the filter menu's single entry point. It mutates
 * view state and settings, then either re-renders the whole view or
 * partially refilters the article list. These tests pin what it does today
 * for each filter type, so it can be split into one private handler per
 * filter type (Phase 8 of #436) without these tests changing. They are
 * read-only on refactor PRs; see docs/development/architecture.md.
 *
 * Each test drives the method through a cast, as the existing dashboard
 * tests do, and records the three things a filter change can cause: a full
 * `render`, a `saveSettings`, and a partial `articleList.refilter`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
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

type FilterChange = {
  type: string;
  value: unknown;
  checked?: boolean;
  isTag?: boolean;
  logic?: "AND" | "OR";
  batch?: {
    statusFilters?: Set<string>;
    tagFilters?: Set<string>;
    logic?: "AND" | "OR";
    bypassAll?: boolean;
    highlightsEnabled?: boolean;
    statusBarVisible?: boolean;
    cardColumnsPerRow?: number;
    cardSpacing?: number;
  };
};

interface ViewInternals {
  handleFilterChange: (change: FilterChange) => void;
  render: ReturnType<typeof vi.fn>;
  getFilteredArticles: ReturnType<typeof vi.fn>;
  getCurrentPageSize: ReturnType<typeof vi.fn>;
  refreshFilterStatusBarOnly: ReturnType<typeof vi.fn>;
  articleList: {
    refilter: ReturnType<typeof vi.fn>;
    updateHeaderTitle: ReturnType<typeof vi.fn>;
    updateCardSpacingLayout: ReturnType<typeof vi.fn>;
    refreshCardTagLayout: ReturnType<typeof vi.fn>;
  } | null;
  activeStatusFilters: Set<string>;
  activeTagFilters: Set<string>;
  filterLogic: "AND" | "OR";
  allArticlesPage: number;
}

interface Harness {
  view: ViewInternals;
  settings: RssDashboardSettings;
  saveSettings: ReturnType<typeof vi.fn>;
}

function createHarness(withArticleList = true): Harness {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  const saveSettings = vi.fn(async () => {});
  const plugin = { settings, saveSettings } as unknown as RssDashboardPlugin;
  const leaf = {
    app: new obsidian.App(),
  } as unknown as obsidian.WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin) as unknown as ViewInternals;

  view.render = vi.fn(async () => {});
  view.getFilteredArticles = vi.fn(() => [{}, {}, {}, {}, {}]);
  view.getCurrentPageSize = vi.fn(() => 2);
  view.refreshFilterStatusBarOnly = vi.fn();
  view.articleList = withArticleList
    ? {
        refilter: vi.fn(),
        updateHeaderTitle: vi.fn(),
        updateCardSpacingLayout: vi.fn(),
        refreshCardTagLayout: vi.fn(),
      }
    : null;

  return { view, settings, saveSettings };
}

/** True when the change was handled as a partial refilter. */
function refiltered(view: ViewInternals): boolean {
  return (view.articleList?.refilter.mock.calls.length ?? 0) === 1;
}

describe("Dashboard handleFilterChange characterization", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("status filters", () => {
    it("adds a checked status lowercased and refilters the list without a full render", () => {
      const { view, saveSettings } = createHarness();

      view.handleFilterChange({ type: "Unread", value: null, checked: true });

      expect([...view.activeStatusFilters]).toEqual(["unread"]);
      expect(refiltered(view)).toBe(true);
      expect(view.render).not.toHaveBeenCalled();
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it("removes an unchecked status", () => {
      const { view } = createHarness();
      view.activeStatusFilters = new Set(["unread", "starred"]);

      view.handleFilterChange({ type: "unread", value: null, checked: false });

      expect([...view.activeStatusFilters]).toEqual(["starred"]);
      expect(refiltered(view)).toBe(true);
    });

    it("hands refilter copies of the filter sets, the logic, page 1 and the paging numbers", () => {
      const { view } = createHarness();
      view.allArticlesPage = 3;

      view.handleFilterChange({ type: "unread", value: null, checked: true });

      expect(view.allArticlesPage).toBe(1);
      const args = view.articleList!.refilter.mock.calls[0];
      expect(args[0]).toEqual(new Set(["unread"]));
      expect(args[0]).not.toBe(view.activeStatusFilters);
      expect(args[1]).toEqual(new Set());
      expect(args[1]).not.toBe(view.activeTagFilters);
      expect(args[2]).toBe("OR");
      expect(args[3]).toHaveLength(2); // articles for page 1 of size 2
      expect(args.slice(4)).toEqual([1, 3, 2, 5]); // page, pages, size, total
      expect(view.refreshFilterStatusBarOnly).toHaveBeenCalledTimes(1);
    });

    it("updates the header title once, after the current tick", () => {
      const { view } = createHarness();
      view.handleFilterChange({ type: "unread", value: null, checked: true });
      view.handleFilterChange({ type: "starred", value: null, checked: true });

      expect(view.articleList!.updateHeaderTitle).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(view.articleList!.updateHeaderTitle).toHaveBeenCalledTimes(1);
    });

    it("persists the multi-filter state after a debounce, not immediately", () => {
      const { view, settings, saveSettings } = createHarness();

      view.handleFilterChange({ type: "unread", value: null, checked: true });

      expect(settings.dashboardMultiFilters).toEqual({
        statusFilters: ["unread"],
        tagFilters: [],
        logic: "OR",
      });
      expect(saveSettings).not.toHaveBeenCalled();
      vi.advanceTimersByTime(150);
      expect(saveSettings).toHaveBeenCalledTimes(1);
    });

    it("still records the change when there is no article list", () => {
      const { view, settings } = createHarness(false);

      view.handleFilterChange({ type: "unread", value: null, checked: true });

      expect([...view.activeStatusFilters]).toEqual(["unread"]);
      expect(settings.dashboardMultiFilters?.statusFilters).toEqual([
        "unread",
      ]);
      expect(view.refreshFilterStatusBarOnly).not.toHaveBeenCalled();
    });
  });

  describe("tag filters", () => {
    it("adds a checked tag under its own name and removes an unchecked one", () => {
      const { view } = createHarness();

      view.handleFilterChange({
        type: "Tech News",
        value: null,
        checked: true,
        isTag: true,
      });
      expect([...view.activeTagFilters]).toEqual(["Tech News"]);
      expect(view.activeStatusFilters.size).toBe(0);

      view.handleFilterChange({
        type: "Tech News",
        value: null,
        checked: false,
        isTag: true,
      });
      expect(view.activeTagFilters.size).toBe(0);
      expect(view.articleList!.refilter).toHaveBeenCalledTimes(2);
      expect(view.render).not.toHaveBeenCalled();
    });

    it("treats an isTag change with no checked flag as an uncheck", () => {
      const { view } = createHarness();
      view.activeTagFilters = new Set(["a"]);

      view.handleFilterChange({ type: "a", value: null, isTag: true });

      expect(view.activeTagFilters.size).toBe(0);
    });
  });

  describe("filter logic", () => {
    it("switches between AND and OR and refilters", () => {
      const { view } = createHarness();

      view.handleFilterChange({ type: "logic", value: null, logic: "AND" });

      expect(view.filterLogic).toBe("AND");
      expect(view.articleList!.refilter.mock.calls[0][2]).toBe("AND");
      expect(view.render).not.toHaveBeenCalled();
    });
  });

  describe("age filter (the fallthrough)", () => {
    it("stores the filter, saves immediately and does a full render", () => {
      const { view, settings, saveSettings } = createHarness();

      view.handleFilterChange({ type: "age", value: 7 });

      expect(settings.articleFilter).toEqual({ type: "age", value: 7 });
      expect(saveSettings).toHaveBeenCalledTimes(1);
      expect(view.render).toHaveBeenCalledTimes(1);
      expect(refiltered(view)).toBe(false);
      expect(settings.dashboardMultiFilters).toEqual(
        DEFAULT_SETTINGS.dashboardMultiFilters,
      );
    });

    it("stores 'none' to clear it", () => {
      const { view, settings } = createHarness();
      settings.articleFilter = { type: "age", value: 7 };

      view.handleFilterChange({ type: "none", value: null });

      expect(settings.articleFilter).toEqual({ type: "none", value: null });
    });
  });

  describe("bypass-filters", () => {
    it("creates the keyword rules when missing, sets bypassAll, saves and renders", () => {
      const { view, settings, saveSettings } = createHarness();
      (settings as unknown as { keywordRules?: unknown }).keywordRules =
        undefined;

      view.handleFilterChange({
        type: "bypass-filters",
        value: null,
        checked: true,
      });

      expect(settings.keywordRules).toEqual({
        includeLogic: "AND",
        bypassAll: true,
        rules: [],
      });
      expect(saveSettings).toHaveBeenCalledTimes(1);
      expect(view.render).toHaveBeenCalledTimes(1);
      expect(refiltered(view)).toBe(false);
    });

    it("leaves existing rules alone and treats a missing checked flag as false", () => {
      const { view, settings } = createHarness();
      settings.keywordRules = {
        includeLogic: "OR",
        bypassAll: true,
        rules: [],
      } as RssDashboardSettings["keywordRules"];

      view.handleFilterChange({ type: "bypass-filters", value: null });

      expect(settings.keywordRules?.bypassAll).toBe(false);
      expect(settings.keywordRules?.includeLogic).toBe("OR");
    });
  });

  describe("highlights", () => {
    it("creates the default highlight settings when missing, enables them, saves and renders", () => {
      const { view, settings, saveSettings } = createHarness();
      (settings as unknown as { highlights?: unknown }).highlights = undefined;

      view.handleFilterChange({
        type: "highlights",
        value: null,
        checked: true,
      });

      expect(settings.highlights).toEqual({
        enabled: true,
        defaultColor: "#ffd700",
        highlightInContent: true,
        highlightInTitles: true,
        highlightInSummaries: true,
        words: [],
      });
      expect(saveSettings).toHaveBeenCalledTimes(1);
      expect(view.render).toHaveBeenCalledTimes(1);
      expect(refiltered(view)).toBe(false);
    });

    it("treats a missing checked flag as off", () => {
      const { view, settings } = createHarness();
      settings.highlights.enabled = true;

      view.handleFilterChange({ type: "highlights", value: null });

      expect(settings.highlights.enabled).toBe(false);
    });
  });

  describe("status-bar-visibility", () => {
    it("stores the flag, saves and renders", () => {
      const { view, settings, saveSettings } = createHarness();

      view.handleFilterChange({
        type: "status-bar-visibility",
        value: null,
        checked: false,
      });

      expect(settings.display.showFilterStatusBar).toBe(false);
      expect(saveSettings).toHaveBeenCalledTimes(1);
      expect(view.render).toHaveBeenCalledTimes(1);
      expect(refiltered(view)).toBe(false);
    });

    it("treats a missing checked flag as visible", () => {
      const { view, settings } = createHarness();
      settings.display.showFilterStatusBar = false;

      view.handleFilterChange({ type: "status-bar-visibility", value: null });

      expect(settings.display.showFilterStatusBar).toBe(true);
    });
  });

  describe("card spacing", () => {
    it("clamps a live value to 0–40 and rounds it", () => {
      const { view, settings } = createHarness();

      view.handleFilterChange({ type: "card-spacing-live", value: 99 });
      expect(settings.display.cardSpacing).toBe(40);
      expect(view.articleList!.updateCardSpacingLayout).toHaveBeenLastCalledWith(
        40,
      );

      view.handleFilterChange({ type: "card-spacing-live", value: -5 });
      expect(settings.display.cardSpacing).toBe(0);

      view.handleFilterChange({ type: "card-spacing-live", value: 12.6 });
      expect(settings.display.cardSpacing).toBe(13);
    });

    it("ignores a value that is not a number", () => {
      const { view, settings, saveSettings } = createHarness();
      const before = settings.display.cardSpacing;

      view.handleFilterChange({ type: "card-spacing-commit", value: "wide" });

      expect(settings.display.cardSpacing).toBe(before);
      expect(view.articleList!.updateCardSpacingLayout).not.toHaveBeenCalled();
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it("does not persist the multi-filter state or refilter", () => {
      const { view, settings } = createHarness();

      view.handleFilterChange({ type: "card-spacing-commit", value: 20 });

      expect(refiltered(view)).toBe(false);
      expect(settings.dashboardMultiFilters).toEqual(
        DEFAULT_SETTINGS.dashboardMultiFilters,
      );
    });

    it("tolerates a missing article list", () => {
      const { view, settings, saveSettings } = createHarness(false);

      view.handleFilterChange({ type: "card-spacing-commit", value: 22 });

      expect(settings.display.cardSpacing).toBe(22);
      expect(saveSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe("batch", () => {
    it("replaces the status and tag sets with copies and takes the logic, then refilters once", () => {
      const { view, saveSettings } = createHarness();
      const statusFilters = new Set(["unread"]);
      const tagFilters = new Set(["news"]);

      view.handleFilterChange({
        type: "batch",
        value: null,
        batch: { statusFilters, tagFilters, logic: "AND" },
      });

      expect(view.activeStatusFilters).toEqual(statusFilters);
      expect(view.activeStatusFilters).not.toBe(statusFilters);
      expect(view.activeTagFilters).toEqual(tagFilters);
      expect(view.activeTagFilters).not.toBe(tagFilters);
      expect(view.filterLogic).toBe("AND");
      expect(view.articleList!.refilter).toHaveBeenCalledTimes(1);
      expect(view.render).not.toHaveBeenCalled();
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it("leaves state alone for fields the batch does not carry", () => {
      const { view } = createHarness();
      view.activeStatusFilters = new Set(["starred"]);
      view.filterLogic = "AND";

      view.handleFilterChange({
        type: "batch",
        value: null,
        batch: { tagFilters: new Set(["x"]) },
      });

      expect([...view.activeStatusFilters]).toEqual(["starred"]);
      expect(view.filterLogic).toBe("AND");
    });

    it("applies the new filters and still does a full render when a setting changed", () => {
      const { view, settings, saveSettings } = createHarness();

      view.handleFilterChange({
        type: "batch",
        value: null,
        batch: {
          statusFilters: new Set(["unread"]),
          statusBarVisible: false,
        },
      });

      expect([...view.activeStatusFilters]).toEqual(["unread"]);
      expect(settings.display.showFilterStatusBar).toBe(false);
      expect(saveSettings).toHaveBeenCalledTimes(1);
      expect(view.render).toHaveBeenCalledTimes(1);
      // The early return skips the partial-refilter tail entirely.
      expect(refiltered(view)).toBe(false);
      expect(settings.dashboardMultiFilters).toEqual(
        DEFAULT_SETTINGS.dashboardMultiFilters,
      );
    });

    it("creates the keyword rules when bypassAll differs from the stored value", () => {
      const { view, settings } = createHarness();
      (settings as unknown as { keywordRules?: unknown }).keywordRules =
        undefined;

      view.handleFilterChange({
        type: "batch",
        value: null,
        batch: { bypassAll: true },
      });

      expect(settings.keywordRules).toEqual({
        includeLogic: "AND",
        bypassAll: true,
        rules: [],
      });
      expect(view.render).toHaveBeenCalledTimes(1);
    });

    it("creates the keyword rules even when bypassAll is unchanged, but then refilters", () => {
      const { view, settings, saveSettings } = createHarness();
      (settings as unknown as { keywordRules?: unknown }).keywordRules =
        undefined;

      view.handleFilterChange({
        type: "batch",
        value: null,
        batch: { bypassAll: false },
      });

      expect(settings.keywordRules?.bypassAll).toBe(false);
      expect(view.render).not.toHaveBeenCalled();
      expect(saveSettings).not.toHaveBeenCalled();
      expect(refiltered(view)).toBe(true);
    });

    it("creates the default highlight settings and renders when highlightsEnabled changes", () => {
      const { view, settings, saveSettings } = createHarness();
      (settings as unknown as { highlights?: unknown }).highlights = undefined;

      view.handleFilterChange({
        type: "batch",
        value: null,
        batch: { highlightsEnabled: true },
      });

      expect(settings.highlights.enabled).toBe(true);
      expect(settings.highlights.defaultColor).toBe("#ffd700");
      expect(saveSettings).toHaveBeenCalledTimes(1);
      expect(view.render).toHaveBeenCalledTimes(1);
    });

    it("clamps card columns to 0–6 and spacing to 0–40, rounding both", () => {
      const { view, settings } = createHarness();

      view.handleFilterChange({
        type: "batch",
        value: null,
        batch: { cardColumnsPerRow: 9.4, cardSpacing: -3 },
      });

      expect(settings.display.cardColumnsPerRow).toBe(6);
      expect(settings.display.cardSpacing).toBe(0);
      expect(view.render).toHaveBeenCalledTimes(1);

      view.handleFilterChange({
        type: "batch",
        value: null,
        batch: { cardColumnsPerRow: 2.6, cardSpacing: 99 },
      });

      expect(settings.display.cardColumnsPerRow).toBe(3);
      expect(settings.display.cardSpacing).toBe(40);
    });

    it("does a single render and save when several settings change together", () => {
      const { view, saveSettings } = createHarness();

      view.handleFilterChange({
        type: "batch",
        value: null,
        batch: {
          bypassAll: true,
          highlightsEnabled: true,
          statusBarVisible: false,
          cardColumnsPerRow: 4,
          cardSpacing: 20,
        },
      });

      expect(saveSettings).toHaveBeenCalledTimes(1);
      expect(view.render).toHaveBeenCalledTimes(1);
    });
  });
});
