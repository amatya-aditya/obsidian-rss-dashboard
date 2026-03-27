import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hasArticle(..._args: any[]): boolean {
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insertArticleInPlace(..._args: any[]): boolean {
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeArticleInPlace(..._args: any[]): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateArticleInPlace(..._args: any[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    showEditFeedModal(..._args: any[]): void {}
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    verifyAllSavedArticles(..._args: any[]): void {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeedItems(count: number, feedTitle: string, feedUrl: string): FeedItem[] {
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
  });

  it("getFilteredArticles() returns all cached feed items (not maxItems)", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

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

    const result = (view as unknown as { getFilteredArticles: () => FeedItem[] }).getFilteredArticles();
    expect(result).toHaveLength(49);
  });

  it("handlePageSizeChange() resets active page to 1", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

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
    (view as unknown as { feedPages: Record<string, number> }).feedPages[feedUrl] = 2;

    (view as unknown as { handlePageSizeChange: (n: number) => void }).handlePageSizeChange(40);

    expect((view as unknown as { feedPages: Record<string, number> }).feedPages[feedUrl]).toBe(1);
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(renderSpy).toHaveBeenCalled();
  });

  it("handlePageSizeChange() applies globally to all dashboard page-size settings", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

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

    (view as unknown as { handlePageSizeChange: (n: number) => void }).handlePageSizeChange(40);

    expect(settings.allArticlesPageSize).toBe(40);
    expect(settings.unreadArticlesPageSize).toBe(40);
    expect(settings.readArticlesPageSize).toBe(40);
    expect(settings.savedArticlesPageSize).toBe(40);
    expect(settings.starredArticlesPageSize).toBe(40);
  });
});

