import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

// GH Issue #333: proves the Starred status filter and ordinary tag filters
// (including a "Favorite" tag, which is a plain tag post-#332) are
// independently composable in the dashboard's header multi-filter, in both
// AND and OR combination logic.

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    refilter(..._args: unknown[]): void {}
    setSelectedArticle(..._args: unknown[]): void {}
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
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Item",
    link: "https://example.com/item",
    description: "",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed",
    coverImage: "",
    saved: false,
    ...overrides,
  };
}

interface TestDashboardView {
  activeStatusFilters: Set<string>;
  activeTagFilters: Set<string>;
  filterLogic: "AND" | "OR";
  matchesFilters(
    item: FeedItem,
    options?: { ignoreDashboardMultiFilters?: boolean; ignoreAgeFilter?: boolean },
  ): boolean;
}

async function makeView(): Promise<TestDashboardView> {
  const { RssDashboardView } = await import("../../../src/views/dashboard-view");
  const app = new App();
  const settings = cloneSettings();
  const plugin = { settings, saveSettings: vi.fn(async () => {}) };
  const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never);
  return view as unknown as TestDashboardView;
}

describe("Dashboard starred/tag filter independence (GH Issue #333)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  const starredTagged = makeItem({
    guid: "starred-tagged",
    starred: true,
    tags: [{ name: "Favorite", color: "#f1c40f" }],
  });
  const starredUntagged = makeItem({ guid: "starred-untagged", starred: true, tags: [] });
  const unstarredTagged = makeItem({
    guid: "unstarred-tagged",
    starred: false,
    tags: [{ name: "Favorite", color: "#f1c40f" }],
  });
  const unstarredUntagged = makeItem({
    guid: "unstarred-untagged",
    starred: false,
    tags: [],
  });
  const allItems = [
    starredTagged,
    starredUntagged,
    unstarredTagged,
    unstarredUntagged,
  ];

  it("the Starred status filter alone returns only starred articles regardless of tags", async () => {
    const view = await makeView();
    view.activeStatusFilters = new Set(["starred"]);
    view.activeTagFilters = new Set();
    view.filterLogic = "OR";

    const matched = allItems.filter((item) => view.matchesFilters(item));
    expect(matched.map((i) => i.guid).sort()).toEqual(
      ["starred-tagged", "starred-untagged"].sort(),
    );
  });

  it("the Favorite tag filter alone returns tagged articles regardless of starred state", async () => {
    const view = await makeView();
    view.activeStatusFilters = new Set();
    view.activeTagFilters = new Set(["Favorite"]);
    view.filterLogic = "OR";

    const matched = allItems.filter((item) => view.matchesFilters(item));
    expect(matched.map((i) => i.guid).sort()).toEqual(
      ["starred-tagged", "unstarred-tagged"].sort(),
    );
  });

  it("combines Starred status + Favorite tag as a union in OR mode", async () => {
    const view = await makeView();
    view.activeStatusFilters = new Set(["starred"]);
    view.activeTagFilters = new Set(["Favorite"]);
    view.filterLogic = "OR";

    const matched = allItems.filter((item) => view.matchesFilters(item));
    // Union: starred-tagged, starred-untagged (via starred), unstarred-tagged (via Favorite)
    expect(matched.map((i) => i.guid).sort()).toEqual(
      ["starred-tagged", "starred-untagged", "unstarred-tagged"].sort(),
    );
  });

  it("combines Starred status + Favorite tag as an intersection in AND mode", async () => {
    const view = await makeView();
    view.activeStatusFilters = new Set(["starred"]);
    view.activeTagFilters = new Set(["Favorite"]);
    view.filterLogic = "AND";

    const matched = allItems.filter((item) => view.matchesFilters(item));
    // Intersection: only the article that is both starred AND carries Favorite
    expect(matched.map((i) => i.guid)).toEqual(["starred-tagged"]);
  });
});
