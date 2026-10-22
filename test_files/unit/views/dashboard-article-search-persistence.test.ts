import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import type { ArticleList } from "../../../src/components/article-list";

// The view rebuilds its ArticleList on every render, so the search a user typed
// must be handed to the new list or it disappears on the next page (#1465).
type ListCallbacks = ConstructorParameters<typeof ArticleList>[6];
let latestCallbacks: ListCallbacks | null = null;
let latestList: { setSearchQuery: ReturnType<typeof vi.fn> } | null = null;

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(...args: any[]) {
      latestCallbacks = args[6] as ListCallbacks;
      latestList = this as unknown as typeof latestList;
    }
    render = vi.fn();
    destroy = vi.fn();
    refilter = vi.fn();
    setSelectedArticle = vi.fn();
    setSearchQuery = vi.fn();
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

function makeArticles(count: number, feedUrl: string): FeedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Item ${i}`,
    link: `https://example.com/${i}`,
    description: "",
    pubDate: new Date(Date.now() - i * 1000).toISOString(),
    guid: `${feedUrl}#${i}`,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "BBC News",
    feedUrl,
    coverImage: "",
  }));
}

interface ViewInternals {
  render(): void;
  handlePageChange(page: number): void;
  handleFeedClick(feed: Feed): void;
  handleFolderClick(folder: string | null): void;
  setupSidebarResize(): void;
}

function createView() {
  const settings = cloneSettings();
  const feedUrl = "https://example.com/feed.xml";
  const feed: Feed = {
    title: "BBC News",
    url: feedUrl,
    folder: "News",
    items: makeArticles(25, feedUrl),
    lastUpdated: Date.now(),
  };
  settings.feeds = [feed];
  settings.allArticlesPageSize = 10;

  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    queueArticleStateSave: vi.fn(),
    openTagsSettings: vi.fn(async () => {}),
  };
  const app = new App();
  const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never);
  const internals = view as unknown as ViewInternals;
  internals.setupSidebarResize = vi.fn();

  return { view, internals, feed, settings };
}

function typeSearch(query: string): void {
  latestCallbacks?.onSearch(query);
}

function lastRestoredQuery(): string | undefined {
  const calls = latestList?.setSearchQuery.mock.calls ?? [];
  return calls[calls.length - 1]?.[0] as string | undefined;
}

describe("Dashboard article search across re-renders (#1465)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    latestCallbacks = null;
    latestList = null;
  });

  it("hands the typed search to the list the next page builds", () => {
    const { view, internals } = createView();
    view.render();
    typeSearch("Samsung");

    internals.handlePageChange(2);

    expect(lastRestoredQuery()).toBe("Samsung");
  });

  it("hands the typed search to the list a filter re-render builds", () => {
    const { view, internals } = createView();
    view.render();
    typeSearch("AI chip");

    internals.render();

    expect(lastRestoredQuery()).toBe("AI chip");
  });

  it("starts a fresh search when another feed is opened", () => {
    const { view, internals, feed } = createView();
    view.render();
    typeSearch("Samsung");

    internals.handleFeedClick(feed);

    expect(lastRestoredQuery()).toBe("");
  });

  it("keeps the search when the feed already open is clicked again", () => {
    const { view, internals, feed } = createView();
    view.render();
    typeSearch("Samsung");
    internals.handleFeedClick(feed);
    typeSearch("Samsung");

    internals.handleFeedClick(feed);

    expect(lastRestoredQuery()).toBe("Samsung");
  });

  it("starts a fresh search when a feed is added to a multi-feed scope", () => {
    const { view, internals, feed, settings } = createView();
    const other: Feed = {
      title: "Second",
      url: "https://example.com/second.xml",
      folder: "News",
      items: [],
      lastUpdated: Date.now(),
    };
    settings.feeds = [feed, other];
    const multiSelect = internals as unknown as {
      handleFeedMultiSelectClick(feed: Feed): void;
    };
    view.render();
    typeSearch("Samsung");

    multiSelect.handleFeedMultiSelectClick(other);

    expect(lastRestoredQuery()).toBe("");
  });

  it("keeps the search when the folder already open is clicked again", () => {
    const { view, internals } = createView();
    view.render();
    typeSearch("Samsung");
    internals.handleFolderClick("News");
    typeSearch("Samsung");

    internals.handleFolderClick("News");

    expect(lastRestoredQuery()).toBe("Samsung");
  });

  it("starts a fresh search when another folder is opened", () => {
    const { view, internals } = createView();
    view.render();
    typeSearch("Samsung");

    internals.handleFolderClick("News");

    expect(lastRestoredQuery()).toBe("");
  });

  it("restores nothing on the first render", () => {
    const { view } = createView();

    view.render();

    expect(lastRestoredQuery()).toBe("");
  });
});
