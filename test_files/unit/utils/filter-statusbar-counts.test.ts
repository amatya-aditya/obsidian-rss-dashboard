import { describe, it, expect, vi, beforeEach } from "vitest";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

// Keep platform-utils mocked so other tests that expect robustFetch to be a vi.fn
// (e.g. fetch-helpers.test.ts) don't end up importing the real module first.
vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {}
    destroy(): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refilter(..._args: any[]): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelectedArticle(..._args: any[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

interface TestPlugin {
  settings: RssDashboardSettings;
  saveSettings: ReturnType<typeof vi.fn>;
  openSettingsToTab?: ReturnType<typeof vi.fn>;
}

interface TestView {
  activeStatusFilters: Set<string>;
  activeTagFilters: Set<string>;
  filterLogic?: "AND" | "OR";
  dashboardMultiFilterCounts?: { shown: number; filteredOut: number; total: number };
  keywordFilterStats?: {
    articlesRetrieved: number;
    globalExcluded: number;
    feedExcluded: number;
    finalVisible: number;
    bypassActive: boolean;
    filtersActive: boolean;
  };
  highlightMatchCounts?: Array<{ word: { word: string }; count: number }>;
  schedulePersistDashboardMultiFilters?: ReturnType<typeof vi.fn>;
  getFilteredArticles?: ReturnType<typeof vi.fn>;
  articleList?: {
    refilter?: ReturnType<typeof vi.fn>;
    removeArticleInPlace?: ReturnType<typeof vi.fn>;
    hasArticle?: ReturnType<typeof vi.fn>;
    updateArticleInPlace?: ReturnType<typeof vi.fn>;
  };
  refreshFilterStatusBarOnly?: ReturnType<typeof vi.fn>;
  handleFilterChange?: (opts: { type: string; value: unknown; checked: boolean }) => void;
  computeDashboardMultiFilterCounts?: (items: FeedItem[]) => { shown: number; filteredOut: number; total: number };
  renderFilterSubheader?: (container: HTMLElement) => void;
  syncArticleListAfterUpdate?: (article: FeedItem) => void;
}

function makeItem(overrides: Partial<FeedItem>): FeedItem {
  return {
    title: overrides.title ?? "Title",
    link: overrides.link ?? "https://example.com/article",
    description: overrides.description ?? "",
    pubDate: overrides.pubDate ?? new Date().toISOString(),
    guid: overrides.guid ?? crypto.randomUUID(),
    read: overrides.read ?? false,
    starred: overrides.starred ?? false,
    tags: overrides.tags ?? [],
    feedTitle: overrides.feedTitle ?? "Feed",
    feedUrl: overrides.feedUrl ?? "https://example.com/feed.xml",
    coverImage: overrides.coverImage ?? "",
    mediaType: overrides.mediaType,
    saved: overrides.saved,
    summary: overrides.summary,
    content: overrides.content,
    author: overrides.author,
  };
}

describe("Filter Status Bar counts (TDD)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("computes shown/filtered-out/total for dashboard multi-filters", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const settings = cloneSettings();
    const plugin: TestPlugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = {} as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(
      leaf,
      plugin as unknown as ConstructorParameters<typeof RssDashboardView>[1],
    ) as unknown as TestView;

    view.activeStatusFilters = new Set(["unread"]);
    view.activeTagFilters = new Set();
    view.filterLogic = "OR";

    const items: FeedItem[] = [
      makeItem({ read: false, guid: "a" }),
      makeItem({ read: false, guid: "b" }),
      makeItem({ read: false, guid: "c" }),
      makeItem({ read: true, guid: "d" }),
    ];

    const result = view.computeDashboardMultiFilterCounts!(items);
    expect(result).toEqual({ shown: 3, total: 4, filteredOut: 1 });
  });

  it("renders viewing-filter counts when dashboard multi-filters are active", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const settings = cloneSettings();
    const plugin: TestPlugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
      openSettingsToTab: vi.fn(async () => {}),
    };

    const leaf = {} as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(
      leaf,
      plugin as unknown as ConstructorParameters<typeof RssDashboardView>[1],
    ) as unknown as TestView;

    view.activeStatusFilters = new Set(["unread"]);
    view.activeTagFilters = new Set();
    view.dashboardMultiFilterCounts = {
      shown: 3,
      filteredOut: 1,
      total: 4,
    };
    view.keywordFilterStats = {
      articlesRetrieved: 0,
      globalExcluded: 0,
      feedExcluded: 0,
      finalVisible: 0,
      bypassActive: false,
      filtersActive: false,
    };
    view.highlightMatchCounts = [];

    const container: HTMLDivElement = document.createElement("div");
    document.body.appendChild(container);
    view.renderFilterSubheader!(container);

    const subheader = container.querySelector(".rss-dashboard-filter-subheader");
    expect(subheader).toBeTruthy();

    const spans = Array.from(subheader?.querySelectorAll("span") ?? []);
    const match = spans.find(
      (s) =>
        (s.textContent ?? "").trim() ===
        "Viewing filters: Showing 3 | Filtered out 1 | Total 4",
    );
    expect(match).toBeTruthy();
  });

  it("renders the no-filters message when dashboard multi-filters are enabled but empty", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const settings = cloneSettings();
    const plugin: TestPlugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
      openSettingsToTab: vi.fn(async () => {}),
    };

    const leaf = {} as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(
      leaf,
      plugin as unknown as ConstructorParameters<typeof RssDashboardView>[1],
    ) as unknown as TestView;

    view.activeStatusFilters = new Set();
    view.activeTagFilters = new Set();
    view.dashboardMultiFilterCounts = {
      shown: 4,
      filteredOut: 0,
      total: 4,
    };
    view.keywordFilterStats = {
      articlesRetrieved: 0,
      globalExcluded: 0,
      feedExcluded: 0,
      finalVisible: 0,
      bypassActive: false,
      filtersActive: false,
    };
    view.highlightMatchCounts = [];

    const container: HTMLDivElement = document.createElement("div");
    document.body.appendChild(container);
    view.renderFilterSubheader!(container);

    const subheader = container.querySelector(".rss-dashboard-filter-subheader");
    expect(subheader).toBeTruthy();

    const spans = Array.from(subheader?.querySelectorAll("span") ?? []);
    const match = spans.find(
      (s) =>
        (s.textContent ?? "").trim() ===
        "No filters applied - Showing 4 | Filtered out 0 | Total 4",
    );
    expect(match).toBeTruthy();
  });

  it("filter-menu apply path refreshes the status bar", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const settings = cloneSettings();
    const plugin: TestPlugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = {} as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(
      leaf,
      plugin as unknown as ConstructorParameters<typeof RssDashboardView>[1],
    ) as unknown as TestView;

    view.schedulePersistDashboardMultiFilters = vi.fn();
    view.getFilteredArticles = vi.fn(() => []);
    view.articleList = { refilter: vi.fn() };
    view.refreshFilterStatusBarOnly = vi.fn();

    view.handleFilterChange!({ type: "unread", value: null, checked: true });

    expect(view.refreshFilterStatusBarOnly).toHaveBeenCalledTimes(1);
  });

  it("in-place read toggle refreshes the status bar (regression)", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const settings = cloneSettings();
    const plugin: TestPlugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = {} as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(
      leaf,
      plugin as unknown as ConstructorParameters<typeof RssDashboardView>[1],
    ) as unknown as TestView;

    view.activeStatusFilters = new Set(["unread"]);
    view.activeTagFilters = new Set();
    view.filterLogic = "OR";

    view.refreshFilterStatusBarOnly = vi.fn();
    view.articleList = {
      removeArticleInPlace: vi.fn(),
      hasArticle: vi.fn(() => true),
      updateArticleInPlace: vi.fn(),
    };

    const article = makeItem({ read: false, guid: "sync-1" });

    view.syncArticleListAfterUpdate!(article);
    expect(view.articleList.updateArticleInPlace).toHaveBeenCalledTimes(
      1,
    );
    expect(view.refreshFilterStatusBarOnly).toHaveBeenCalledTimes(1);

    article.read = true;
    view.syncArticleListAfterUpdate!(article);
    expect(view.articleList.removeArticleInPlace).toHaveBeenCalledWith(
      "sync-1",
    );
    expect(view.refreshFilterStatusBarOnly).toHaveBeenCalledTimes(2);
  });
});
