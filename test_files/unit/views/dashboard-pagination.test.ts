import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

let latestArticleListArgs: unknown[] = [];
let latestArticleListInstance: {
  render: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  refilter: ReturnType<typeof vi.fn>;
  setSelectedArticle: ReturnType<typeof vi.fn>;
  hasArticle: ReturnType<typeof vi.fn>;
  insertArticleInPlace: ReturnType<typeof vi.fn>;
  removeArticleInPlace: ReturnType<typeof vi.fn>;
  updateArticleInPlace: ReturnType<typeof vi.fn>;
  updateRefreshButtonText: ReturnType<typeof vi.fn>;
} | null = null;

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(...args: any[]) {
      latestArticleListArgs = args;
      latestArticleListInstance =
        this as unknown as typeof latestArticleListInstance;
    }
    render = vi.fn();
    destroy = vi.fn();
    refilter = vi.fn();
    setSelectedArticle = vi.fn();
    hasArticle = vi.fn(() => false);
    insertArticleInPlace = vi.fn(() => false);
    removeArticleInPlace = vi.fn();
    updateArticleInPlace = vi.fn();
    updateRefreshButtonText = vi.fn();
    setEmptyStateContext = vi.fn();
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: any[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
    showEditFeedModal(..._args: any[]): void {}
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
    verifyAllSavedArticles(..._args: any[]): void {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeedItems(
  count: number,
  feedTitle: string,
  feedUrl: string,
): FeedItem[] {
  const items: FeedItem[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      title: `Item ${i}`,
      link: `https://example.com/${i}`,
      description: "",
      pubDate: new Date(Date.now() - i * 1000).toISOString(),
      guid: `${feedUrl}#${i}`,
      read: false,
      starred: false,
      tags: [],
      feedTitle,
      feedUrl,
      coverImage: "",
    });
  }
  return items;
}

describe("Dashboard pagination", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    latestArticleListArgs = [];
    latestArticleListInstance = null;
  });

  it("getFilteredArticles() returns all cached feed items (not maxItems)", async () => {
    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    settings.maxItems = 25;

    const feedUrl = "https://example.com/feed.xml";
    const feed: Feed = {
      title: "BBC News",
      url: feedUrl,
      folder: "News",
      items: makeFeedItems(49, "BBC News", feedUrl),
      lastUpdated: Date.now(),
    };
    settings.feeds = [feed];

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    (view as unknown as { render: () => void }).render = vi.fn();
    (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;

    const result = (
      view as unknown as { getFilteredArticles: () => FeedItem[] }
    ).getFilteredArticles();
    expect(result).toHaveLength(49);
  }, 10000);

  it("handlePageSizeChange() resets active page to 1", async () => {
    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();

    const feedUrl = "https://example.com/feed.xml";
    const feed: Feed = {
      title: "BBC News",
      url: feedUrl,
      folder: "News",
      items: makeFeedItems(49, "BBC News", feedUrl),
      lastUpdated: Date.now(),
    };
    settings.feeds = [feed];

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    const renderSpy = vi.fn();
    (view as unknown as { render: () => void }).render = renderSpy;
    (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;
    (view as unknown as { feedPages: Record<string, number> }).feedPages[
      feedUrl
    ] = 2;

    (
      view as unknown as { handlePageSizeChange: (n: number) => void }
    ).handlePageSizeChange(40);

    expect(
      (view as unknown as { feedPages: Record<string, number> }).feedPages[
        feedUrl
      ],
    ).toBe(1);
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(renderSpy).toHaveBeenCalled();
  });

  it("handlePageSizeChange() applies globally to all dashboard page-size settings", async () => {
    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    settings.allArticlesPageSize = 10;
    settings.unreadArticlesPageSize = 20;
    settings.readArticlesPageSize = 30;
    settings.savedArticlesPageSize = 40;
    settings.starredArticlesPageSize = 50;

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    (view as unknown as { render: () => void }).render = vi.fn();

    (
      view as unknown as { handlePageSizeChange: (n: number) => void }
    ).handlePageSizeChange(40);

    expect(settings.allArticlesPageSize).toBe(40);
    expect(settings.unreadArticlesPageSize).toBe(40);
    expect(settings.readArticlesPageSize).toBe(40);
    expect(settings.savedArticlesPageSize).toBe(40);
    expect(settings.starredArticlesPageSize).toBe(40);
  });

  it("mark-page-read updates current page items in place without full rerender when filters still match", async () => {
    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    settings.allArticlesPageSize = 10;

    const feedUrl = "https://example.com/feed.xml";
    const items = makeFeedItems(25, "BBC News", feedUrl);
    const feed: Feed = {
      title: "BBC News",
      url: feedUrl,
      folder: "News",
      items,
      lastUpdated: Date.now(),
    };
    settings.feeds = [feed];

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
      openTagsSettings: vi.fn(async () => {}),
    };

    const consoleLogSpy = vi
      .spyOn(console, "debug")
      .mockImplementation(() => {});

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;
    (view as unknown as { feedPages: Record<string, number> }).feedPages[
      feedUrl
    ] = 2;
    (view as unknown as { setupSidebarResize: () => void }).setupSidebarResize =
      vi.fn();

    view.render();
    const renderSpy = vi.spyOn(view, "render");

    const callbacks = latestArticleListArgs[6] as {
      onMarkPageAsRead?: () => void;
    };
    expect(callbacks?.onMarkPageAsRead).toBeTypeOf("function");

    callbacks.onMarkPageAsRead?.();

    expect(items.slice(0, 10).every((item) => !item.read)).toBe(true);
    expect(items.slice(10, 20).every((item) => item.read)).toBe(true);
    expect(items.slice(20).every((item) => !item.read)).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(
      latestArticleListInstance?.updateArticleInPlace,
    ).toHaveBeenCalledTimes(10);
    expect(latestArticleListInstance?.refilter).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Marked 10 items as read",
    );

    consoleLogSpy.mockRestore();
  });

  it("mark-page-read refilters instead of full rerender when unread filtering removes current page items", async () => {
    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    settings.unreadArticlesPageSize = 10;

    const feedUrl = "https://example.com/feed.xml";
    const items = makeFeedItems(25, "BBC News", feedUrl);
    const feed: Feed = {
      title: "BBC News",
      url: feedUrl,
      folder: "News",
      items,
      lastUpdated: Date.now(),
    };
    settings.feeds = [feed];

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
      openTagsSettings: vi.fn(async () => {}),
    };

    const consoleLogSpy = vi
      .spyOn(console, "debug")
      .mockImplementation(() => {});

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    (view as unknown as { currentFolder: string | null }).currentFolder =
      "unread";
    (view as unknown as { unreadArticlesPage: number }).unreadArticlesPage = 2;
    (view as unknown as { setupSidebarResize: () => void }).setupSidebarResize =
      vi.fn();

    view.render();
    const renderSpy = vi.spyOn(view, "render");

    const callbacks = latestArticleListArgs[6] as {
      onMarkPageAsRead?: () => void;
    };
    expect(callbacks?.onMarkPageAsRead).toBeTypeOf("function");

    callbacks.onMarkPageAsRead?.();

    expect(items.slice(0, 10).every((item) => !item.read)).toBe(true);
    expect(items.slice(10, 20).every((item) => item.read)).toBe(true);
    expect(items.slice(20).every((item) => !item.read)).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(
      latestArticleListInstance?.updateArticleInPlace,
    ).not.toHaveBeenCalled();
    expect(latestArticleListInstance?.refilter).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Marked 10 items as read",
    );

    const refilterArgs = latestArticleListInstance?.refilter.mock.calls[0];
    expect(refilterArgs?.[3]).toHaveLength(5);
    expect(refilterArgs?.[4]).toBe(2);
    expect(refilterArgs?.[5]).toBe(2);
    expect(refilterArgs?.[7]).toBe(15);

    consoleLogSpy.mockRestore();
  });

  it("mark-page-read still resolves unread items in filtered single-feed views", async () => {
    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    settings.allArticlesPageSize = 10;

    const feedUrl = "https://example.com/feed.xml";
    const items = makeFeedItems(12, "BBC News", feedUrl).map((item) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { feedUrl: _, ...rest } = item;
      return rest as FeedItem;
    });
    const feed: Feed = {
      title: "BBC News",
      url: feedUrl,
      folder: "News",
      items,
      lastUpdated: Date.now(),
    };
    settings.feeds = [feed];

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
      openTagsSettings: vi.fn(async () => {}),
    };

    const consoleLogSpy = vi
      .spyOn(console, "debug")
      .mockImplementation(() => {});

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    (view as unknown as { currentFeed: Feed | null }).currentFeed = feed;
    (
      view as unknown as { activeStatusFilters: Set<string> }
    ).activeStatusFilters = new Set(["unread"]);
    (view as unknown as { setupSidebarResize: () => void }).setupSidebarResize =
      vi.fn();

    view.render();

    const callbacks = latestArticleListArgs[6] as {
      onMarkPageAsRead?: () => void;
    };
    expect(callbacks?.onMarkPageAsRead).toBeTypeOf("function");

    callbacks.onMarkPageAsRead?.();

    expect(items.slice(0, 10).every((item) => item.read)).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Marked 10 items as read",
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      "[Stub Notice]",
      "No unread items on current page",
    );

    consoleLogSpy.mockRestore();
  });

  it("mark-page-read uses live page state after header unread refilter", async () => {
    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    settings.allArticlesPageSize = 10;

    const feedUrl = "https://example.com/feed.xml";
    const items = makeFeedItems(20, "BBC News", feedUrl).map((item, index) => ({
      ...item,
      read: index < 10,
    }));
    const feed: Feed = {
      title: "BBC News",
      url: feedUrl,
      folder: "News",
      items,
      lastUpdated: Date.now(),
    };
    settings.feeds = [feed];

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
      openTagsSettings: vi.fn(async () => {}),
    };

    const consoleLogSpy = vi
      .spyOn(console, "debug")
      .mockImplementation(() => {});

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    (view as unknown as { setupSidebarResize: () => void }).setupSidebarResize =
      vi.fn();

    view.render();
    const renderSpy = vi.spyOn(view, "render");

    const callbacks = latestArticleListArgs[6] as {
      onMarkPageAsRead?: () => void;
    };
    expect(callbacks?.onMarkPageAsRead).toBeTypeOf("function");

    (
      view as unknown as {
        handleFilterChange: (value: {
          type: string;
          checked?: boolean;
        }) => void;
      }
    ).handleFilterChange({
      type: "unread",
      checked: true,
    });

    callbacks.onMarkPageAsRead?.();

    expect(items.slice(0, 10).every((item) => item.read)).toBe(true);
    expect(items.slice(10, 20).every((item) => item.read)).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(latestArticleListInstance?.refilter).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Marked 10 items as read",
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      "[Stub Notice]",
      "No unread items on current page",
    );

    consoleLogSpy.mockRestore();
  });
});
