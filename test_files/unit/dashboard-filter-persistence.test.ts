import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "./test-dom-polyfills";
import { DEFAULT_SETTINGS, type Feed, type RssDashboardSettings } from "../../src/types/types";

// Keep platform-utils mocked so other tests that expect robustFetch to be a vi.fn
// (e.g. fetch-helpers.test.ts) don't end up importing the real module first.
vi.mock("../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../src/components/article-list", () => ({
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

vi.mock("../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    open(): void {}
  },
}));

vi.mock("../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    open(): void {}
    close(): void {}
  },
}));

vi.mock("../../src/views/reader-view", () => ({
  ReaderView: class ReaderViewMock {},
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

vi.mock("../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaverMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function createMockFeed(url: string): Feed {
  return {
    title: "Feed",
    url,
    folder: "Uncategorized",
    items: [],
    lastUpdated: Date.now(),
  };
}

describe("Dashboard multi-filter persistence (TDD)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("navigation sets selection state (baseline)", async () => {
    const { RssDashboardView } = await import("../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    (view as unknown as { render: () => void }).render = vi.fn();

    (view as unknown as { handleFolderClick: (folder: string | null) => void }).handleFolderClick("unread");

    expect(view.currentFolder).toBe("unread");
    expect((view as unknown as { currentFeed: unknown }).currentFeed).toBe(null);
    expect((view as unknown as { currentTag: unknown }).currentTag).toBe(null);
  });

  it("folder navigation does not reset multi-filters (regression)", async () => {
    const { RssDashboardView } = await import("../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    (view as unknown as { render: () => void }).render = vi.fn();

    (view as unknown as { activeStatusFilters: Set<string> }).activeStatusFilters = new Set(["unread"]);
    (view as unknown as { activeTagFilters: Set<string> }).activeTagFilters = new Set(["Work"]);
    (view as unknown as { filterLogic: "AND" | "OR" }).filterLogic = "AND";

    (view as unknown as { handleFolderClick: (folder: string | null) => void }).handleFolderClick("unread");

    expect(Array.from((view as unknown as { activeStatusFilters: Set<string> }).activeStatusFilters)).toEqual([
      "unread",
    ]);
    expect(Array.from((view as unknown as { activeTagFilters: Set<string> }).activeTagFilters)).toEqual(["Work"]);
    expect((view as unknown as { filterLogic: "AND" | "OR" }).filterLogic).toBe("AND");
  });

  it("feed navigation does not reset multi-filters (regression)", async () => {
    const { RssDashboardView } = await import("../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    (view as unknown as { render: () => void }).render = vi.fn();

    (view as unknown as { activeStatusFilters: Set<string> }).activeStatusFilters = new Set(["unread"]);
    (view as unknown as { activeTagFilters: Set<string> }).activeTagFilters = new Set(["Work"]);
    (view as unknown as { filterLogic: "AND" | "OR" }).filterLogic = "AND";

    (view as unknown as { handleFeedClick: (feed: Feed) => void }).handleFeedClick(
      createMockFeed("https://example.com/feed"),
    );

    expect(Array.from((view as unknown as { activeStatusFilters: Set<string> }).activeStatusFilters)).toEqual([
      "unread",
    ]);
    expect(Array.from((view as unknown as { activeTagFilters: Set<string> }).activeTagFilters)).toEqual(["Work"]);
    expect((view as unknown as { filterLogic: "AND" | "OR" }).filterLogic).toBe("AND");
  });
});
