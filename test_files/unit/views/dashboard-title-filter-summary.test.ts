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

    (view as any).activeStatusFilters = new Set(["unread", "podcasts", "tagged"]);
    (view as any).activeTagFilters = new Set(["Work", "Home"]);
    (view as any).filterLogic = "OR";

    const info = (view as any).getArticlesTitleInfo() as {
      title: string;
      tooltip: string | null;
    };

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

    (view as any).activeStatusFilters = new Set();
    (view as any).activeTagFilters = new Set();

    const info = (view as any).getArticlesTitleInfo() as {
      title: string;
      tooltip: string | null;
    };

    expect(info).toEqual({ title: "All articles", tooltip: null });
  });
});
