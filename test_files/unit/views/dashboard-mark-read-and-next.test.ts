import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";

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
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    clearFolderPathCache(): void {}
  },
}));

vi.mock("../../../src/views/reader-view", () => ({
  ReaderView: class ReaderViewMock {},
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

interface PrivateView {
  selectedArticle: FeedItem | null;
  articleList: unknown;
  settings: { feeds: Feed[] };
  openSelectedArticle: (article: FeedItem) => Promise<void>;
  getFilteredArticles: () => FeedItem[];
  matchesFilters: (article: FeedItem) => boolean;
  refreshFilterStatusBarOnly: () => void;
}

const FEED_URL = "https://example.com/feed";

const makeItem = (guid: string, read: boolean): FeedItem =>
  ({
    guid,
    title: guid,
    read,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: "",
    feedTitle: "Feed",
    feedUrl: FEED_URL,
    coverImage: "",
  }) as FeedItem;

describe("dashboard comma shortcut (mark read and open next)", () => {
  let view: RssDashboardView;
  let privateView: PrivateView;
  let updateArticle: ReturnType<typeof vi.fn>;
  let openSpy: ReturnType<typeof vi.fn<(article: FeedItem) => Promise<void>>>;
  let items: FeedItem[];

  const unreadWrites = (): unknown[][] =>
    updateArticle.mock.calls.filter(
      (call: unknown[]) => (call[2] as Partial<FeedItem>).read === false,
    );

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    const app = {
      workspace: {
        on: vi.fn(),
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        getActiveViewOfType: vi.fn(),
      },
      vault: { on: vi.fn() },
    } as unknown as App;
    const leaf = {
      app,
      view: null,
      onClose: vi.fn(),
      onContextMenu: vi.fn(),
    } as unknown as WorkspaceLeaf;
    updateArticle = vi.fn().mockResolvedValue(undefined);
    const plugin = {
      app,
      settings: structuredClone(DEFAULT_SETTINGS),
      saveSettings: vi.fn(),
      updateArticle,
    } as unknown as RssDashboardPlugin;
    view = new RssDashboardView(leaf, plugin);
    privateView = view as unknown as PrivateView;

    items = [makeItem("a1", false), makeItem("a2", false)];
    privateView.settings.feeds = [
      {
        title: "Feed",
        url: FEED_URL,
        folder: "",
        items,
        lastUpdated: Date.now(),
      } as Feed,
    ];
    privateView.getFilteredArticles = () => items;
    // The article list owns the selection highlight and in-place row updates;
    // stub the calls the read toggle and the selection make on it.
    privateView.articleList = {
      setSelectedArticle: vi.fn(),
      hasArticle: vi.fn().mockReturnValue(true),
      updateArticleInPlace: vi.fn(),
    };
    privateView.matchesFilters = () => true;
    privateView.refreshFilterStatusBarOnly = vi.fn();
    openSpy = vi.fn<(article: FeedItem) => Promise<void>>();
    openSpy.mockResolvedValue(undefined);
    privateView.openSelectedArticle = openSpy;
  });

  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("marks an unread article read and opens the next one", async () => {
    privateView.selectedArticle = items[0];

    await view.actionMarkReadAndNext();

    expect(items[0].read).toBe(true);
    expect(updateArticle).toHaveBeenCalledTimes(1);
    expect(updateArticle.mock.calls[0][2]).toMatchObject({ read: true });
    expect(privateView.selectedArticle).toBe(items[1]);
    expect(openSpy).toHaveBeenCalledWith(items[1]);
  });

  it("keeps an already-read article read and still opens the next one", async () => {
    items[0].read = true;
    privateView.selectedArticle = items[0];

    await view.actionMarkReadAndNext();

    expect(items[0].read).toBe(true);
    expect(unreadWrites()).toEqual([]);
    expect(privateView.selectedArticle).toBe(items[1]);
    expect(openSpy).toHaveBeenCalledWith(items[1]);
  });

  it("marks the last article read when there is no next article, and opens nothing", async () => {
    privateView.selectedArticle = items[1];

    await view.actionMarkReadAndNext();

    expect(items[1].read).toBe(true);
    expect(privateView.selectedArticle).toBe(items[1]);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("keeps the last article read when it is already read and there is no next article", async () => {
    items[1].read = true;
    privateView.selectedArticle = items[1];

    await view.actionMarkReadAndNext();

    expect(items[1].read).toBe(true);
    expect(unreadWrites()).toEqual([]);
    expect(privateView.selectedArticle).toBe(items[1]);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("never marks any article unread across repeated presses", async () => {
    privateView.selectedArticle = items[0];

    await view.actionMarkReadAndNext();
    privateView.selectedArticle = items[0];
    await view.actionMarkReadAndNext();

    expect(items[0].read).toBe(true);
    expect(unreadWrites()).toEqual([]);
  });
});
