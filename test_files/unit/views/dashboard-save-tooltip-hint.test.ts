/**
 * A save from the dashboard writes the footer save control's tooltip itself,
 * outside the list's in-place sync (#1467). The saved-state name must still
 * carry the shortcut: `Click to open saved article (s)`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  mockRAF,
  originalRAF,
  ResizeObserverMock,
} from "../components/article-list-component-fixtures";
import { ArticleList } from "../../../src/components/article-list";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

vi.mock("../../../src/utils/platform-utils", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/utils/platform-utils")
  >()),
  robustFetch: vi.fn(),
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    clearFolderPathCache(): void {}
    focusSidebar(): void {}
    hasKeyboardFocus(): boolean {
      return false;
    }
    blurSidebarFocus(): void {}
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
    verifyAllSavedArticles(..._args: unknown[]): void {}
  },
}));

const FEED_URL = "https://example.com/feed.xml";

interface ViewInternals {
  articleList: InstanceType<typeof ArticleList> | null;
  selectedArticle: FeedItem | null;
  saver: {
    saveArticleWithContentPolicy: (
      article: FeedItem,
      folder?: string,
      template?: string,
    ) => Promise<{ path: string }>;
  };
  buildArticleListCallbacks(): ConstructorParameters<typeof ArticleList>[6];
  handleArticleSave(article: FeedItem): Promise<void>;
}

function makeArticle(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Item",
    link: "https://example.com/a",
    description: "",
    pubDate: "2026-05-12T00:00:00.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: FEED_URL,
    coverImage: "",
    ...overrides,
  };
}

function makeFeed(items: FeedItem[]): Feed {
  return {
    title: "Feed",
    url: FEED_URL,
    folder: "",
    items,
    lastUpdated: 0,
  };
}

describe("dashboard save tooltip keeps its shortcut hint (#1467)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    // jsdom has no CSS.escape, which ArticleList uses to find the row by id.
    (window as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
      escape: (s: string) => s.replace(/([^\w-])/g, "\\$1"),
    };
    window.requestAnimationFrame = mockRAF;
    (
      window as unknown as { ResizeObserver: typeof ResizeObserver }
    ).ResizeObserver = ResizeObserverMock;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    document.body.empty();
    window.requestAnimationFrame = originalRAF;
    vi.restoreAllMocks();
  });

  function makeHarness() {
    const article = makeArticle();
    const settings = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as RssDashboardSettings;
    settings.viewStyle = "card";
    settings.feeds = [makeFeed([article])];

    const app = {
      workspace: {
        on: vi.fn(),
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        getActiveViewOfType: vi.fn(),
        trigger: vi.fn(),
      },
      vault: { on: vi.fn() },
    } as unknown as App;
    const leaf = { app, view: null } as unknown as WorkspaceLeaf;
    const plugin = {
      app,
      settings,
      saveSettings: vi.fn(async () => {}),
      updateArticle: vi.fn(async () => {}),
      resolveCachedImageUrl: (url: string) => url,
      refreshFeeds: vi.fn().mockResolvedValue(undefined),
      openTagsSettings: vi.fn(),
      refreshOpenTagColorViews: vi.fn(),
    };
    const view = new RssDashboardView(leaf, plugin as never);
    (leaf as unknown as { view: unknown }).view = view;
    vi.mocked(app.workspace.getActiveViewOfType).mockReturnValue(view);
    document.body.appendChild(view.containerEl);

    const internals = view as unknown as ViewInternals;
    const listContainer = view.containerEl.createDiv();
    const list = new ArticleList(
      listContainer,
      settings,
      "All articles",
      null,
      [article],
      article,
      internals.buildArticleListCallbacks(),
      1,
      1,
      10,
      1,
      new Set(),
      new Set(),
      "OR",
      null,
      true,
      app,
    );
    list.render();
    internals.articleList = list;
    internals.selectedArticle = article;
    internals.saver = {
      saveArticleWithContentPolicy: vi.fn(async () => ({
        path: "Articles/Item.md",
      })),
    };

    const saveLabel = () =>
      listContainer
        .querySelector<HTMLElement>("#article-guid-1")
        ?.querySelector<HTMLElement>(".rss-dashboard-save-toggle")
        ?.getAttribute("aria-label") ?? null;

    return {
      article,
      internals,
      saveLabel,
      cleanup: () => {
        list.destroy();
        view.unload();
      },
    };
  }

  it("names (s) after the dashboard saves the article", async () => {
    const h = makeHarness();
    expect(h.saveLabel()).toBe("Save fetched content to notes (s)");

    await h.internals.handleArticleSave(h.article);

    expect(h.saveLabel()).toBe("Click to open saved article (s)");
    h.cleanup();
  });
});
