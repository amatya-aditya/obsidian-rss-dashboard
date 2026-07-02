import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";

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
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

interface TestDashboardView {
  activeStatusFilters: Set<string>;
  activeTagFilters: Set<string>;
  filterLogic: "AND" | "OR";
  getArticlesTitleInfo(): { title: string; tooltip: string | null };
}

describe("Dashboard title filter summary", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("builds a logic-aware title + tooltip when dashboard multi-filters are active in All Feeds view", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };
    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    const testView = view as unknown as TestDashboardView;

    testView.activeStatusFilters = new Set(["unread", "podcasts", "tagged"]);
    testView.activeTagFilters = new Set(["Work", "Home"]);
    testView.filterLogic = "OR";

    const info = testView.getArticlesTitleInfo();

    expect(info.title).toBe("All Unread or Podcasts or Tags: Home, Work items");
    expect(info.tooltip).toBe(
      "Active filters (OR): Unread, Podcasts, Tags: Home, Work",
    );
  });

  it("keeps the base title when no multi-filters are active", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };
    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    const testView = view as unknown as TestDashboardView;

    testView.activeStatusFilters = new Set();
    testView.activeTagFilters = new Set();

    const info = testView.getArticlesTitleInfo();

    expect(info).toEqual({ title: "All articles", tooltip: null });
  });
});
