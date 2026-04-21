import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
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

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);

    (view as any).activeStatusFilters = new Set(["unread"]);
    (view as any).activeTagFilters = new Set();
    (view as any).filterLogic = "OR";

    const items: FeedItem[] = [
      makeItem({ read: false, guid: "a" }),
      makeItem({ read: false, guid: "b" }),
      makeItem({ read: false, guid: "c" }),
      makeItem({ read: true, guid: "d" }),
    ];

    const result = (view as any).computeDashboardMultiFilterCounts(items);
    expect(result).toEqual({ shown: 3, total: 4, filteredOut: 1 });
  });

  it("renders counts when keyword/highlights are inactive", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
      openSettingsToTab: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);

    (view as any).dashboardMultiFilterCounts = {
      shown: 3,
      filteredOut: 1,
      total: 4,
    };
    (view as any).keywordFilterStats = {
      articlesRetrieved: 0,
      globalExcluded: 0,
      feedExcluded: 0,
      finalVisible: 0,
      bypassActive: false,
      filtersActive: false,
    };
    (view as any).highlightMatchCounts = [];

    const container = document.body.createDiv();
    (view as any).renderFilterSubheader(container);

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

  it("filter-menu apply path refreshes the status bar", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);

    (view as any).schedulePersistDashboardMultiFilters = vi.fn();
    (view as any).getFilteredArticles = vi.fn(() => []);
    (view as any).articleList = { refilter: vi.fn() };
    (view as any).refreshFilterStatusBarOnly = vi.fn();

    (view as any).handleFilterChange({ type: "unread", value: null, checked: true });

    expect((view as any).refreshFilterStatusBarOnly).toHaveBeenCalledTimes(1);
  });

  it("in-place read toggle refreshes the status bar (regression)", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);

    (view as any).activeStatusFilters = new Set(["unread"]);
    (view as any).activeTagFilters = new Set();
    (view as any).filterLogic = "OR";

    (view as any).refreshFilterStatusBarOnly = vi.fn();
    (view as any).articleList = {
      removeArticleInPlace: vi.fn(),
      hasArticle: vi.fn(() => true),
      updateArticleInPlace: vi.fn(),
    };

    const article = makeItem({ read: false, guid: "sync-1" });

    (view as any).syncArticleListAfterUpdate(article);
    expect((view as any).articleList.updateArticleInPlace).toHaveBeenCalledTimes(
      1,
    );
    expect((view as any).refreshFilterStatusBarOnly).toHaveBeenCalledTimes(1);

    article.read = true;
    (view as any).syncArticleListAfterUpdate(article);
    expect((view as any).articleList.removeArticleInPlace).toHaveBeenCalledWith(
      "sync-1",
    );
    expect((view as any).refreshFilterStatusBarOnly).toHaveBeenCalledTimes(2);
  });
});
