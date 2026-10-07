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
  handleFolderClick: (folder: string | null) => void;
  handleFilterChange: (filter: unknown) => void;
  handleClearTags: () => void;
  selectedTags: string[];
  sidebar: unknown;
  articleList: unknown;
  scheduleRender: () => void;
  settings: { feeds: Feed[] };
  activeStatusFilters: Set<string>;
  currentFeed: Feed | null;
  selectedFolders: string[];
  selectedFeeds: string[];
}

describe("dashboard actions behind palette commands", () => {
  let view: RssDashboardView;
  let privateView: PrivateView;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  const noticeMessages = (): unknown[] =>
    debugSpy.mock.calls
      .filter((call: unknown[]) => call[0] === "[Stub Notice]")
      .map((call: unknown[]) => call[1]);

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
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
    const plugin = {
      app,
      settings: structuredClone(DEFAULT_SETTINGS),
      saveSettings: vi.fn(),
    } as unknown as RssDashboardPlugin;
    view = new RssDashboardView(leaf, plugin);
    privateView = view as unknown as PrivateView;
  });

  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("actionShowStarred opens the Starred view the sidebar entry opens", () => {
    const spy = vi.spyOn(privateView, "handleFolderClick").mockReturnValue();

    view.actionShowStarred();

    expect(spy).toHaveBeenCalledWith("starred");
  });

  it("actionClearFilters resets the status and tag filters and the tag selection", () => {
    const filterSpy = vi
      .spyOn(privateView, "handleFilterChange")
      .mockReturnValue();
    const clearTagsSpy = vi
      .spyOn(privateView, "handleClearTags")
      .mockReturnValue();
    privateView.selectedTags = ["news"];

    view.actionClearFilters();

    expect(filterSpy).toHaveBeenCalledWith({
      type: "batch",
      value: null,
      batch: { statusFilters: new Set(), tagFilters: new Set() },
    });
    expect(clearTagsSpy).toHaveBeenCalledTimes(1);
  });

  it("actionClearFilters leaves the tag selection alone when none is set", () => {
    vi.spyOn(privateView, "handleFilterChange").mockReturnValue();
    const clearTagsSpy = vi
      .spyOn(privateView, "handleClearTags")
      .mockReturnValue();

    view.actionClearFilters();

    expect(clearTagsSpy).not.toHaveBeenCalled();
  });

  const flushPromises = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it("actionFocusSearch asks the article list to focus its search", async () => {
    const focusSearch = vi.fn().mockResolvedValue(true);
    privateView.articleList = { focusSearch };

    view.actionFocusSearch();
    await flushPromises();

    expect(focusSearch).toHaveBeenCalledTimes(1);
    expect(noticeMessages()).toEqual([]);
  });

  it("actionFocusSearch shows a notice when focus never lands", async () => {
    privateView.articleList = {
      focusSearch: vi.fn().mockResolvedValue(false),
    };

    view.actionFocusSearch();
    await flushPromises();

    expect(noticeMessages()).toEqual([
      "The article search box is not visible.",
    ]);
  });

  it("actionFocusSearch shows a notice before the article list exists", async () => {
    privateView.articleList = undefined;

    view.actionFocusSearch();
    await flushPromises();

    expect(noticeMessages()).toEqual([
      "The article search box is not visible.",
    ]);
  });

  it("actionSetAllFoldersCollapsed delegates to the sidebar", () => {
    const setAllFoldersCollapsed = vi.fn();
    privateView.sidebar = { setAllFoldersCollapsed };

    view.actionSetAllFoldersCollapsed(true);
    view.actionSetAllFoldersCollapsed(false);

    expect(setAllFoldersCollapsed.mock.calls).toEqual([[true], [false]]);
  });

  it("actionSetAllFoldersCollapsed is a no-op without a sidebar", () => {
    privateView.sidebar = undefined;

    expect(() => view.actionSetAllFoldersCollapsed(true)).not.toThrow();
  });

  describe("mark all read and unread", () => {
    const makeItem = (guid: string, feedUrl: string, read: boolean) =>
      ({
        guid,
        title: guid,
        read,
        link: `https://example.com/${guid}`,
        description: "",
        pubDate: "",
        feedTitle: "Feed",
        feedUrl,
        coverImage: "",
      }) as FeedItem;
    const makeFeed = (
      title: string,
      url: string,
      folder: string,
      items: FeedItem[],
    ): Feed => ({ title, url, folder, items, lastUpdated: Date.now() });

    let techFeed: Feed;
    let newsFeed: Feed;
    let renderSpy: ReturnType<typeof vi.fn<() => void>>;

    const readStates = (feed: Feed): Array<boolean | undefined> =>
      feed.items.map((i) => i.read);

    beforeEach(() => {
      techFeed = makeFeed("Tech Blog", "https://t.example/feed", "Tech", [
        makeItem("t1", "https://t.example/feed", false),
        makeItem("t2", "https://t.example/feed", false),
        makeItem("t3", "https://t.example/feed", true),
      ]);
      newsFeed = makeFeed("Daily News", "https://n.example/feed", "News", [
        makeItem("n1", "https://n.example/feed", false),
        makeItem("n2", "https://n.example/feed", true),
      ]);
      privateView.settings.feeds = [techFeed, newsFeed];
      renderSpy = vi.fn<() => void>();
      privateView.scheduleRender = renderSpy;
    });

    it("names the Unread view in the notice and changes only unread articles", () => {
      privateView.activeStatusFilters = new Set(["unread"]);

      view.actionMarkAllAsRead();

      expect(noticeMessages()).toEqual([
        "Marked 3 items as read in All Unread articles",
      ]);
      expect(readStates(techFeed)).toEqual([true, true, true]);
      expect(readStates(newsFeed)).toEqual([true, true]);
    });

    it("names a folder view and leaves other folders alone", () => {
      view.currentFolder = "Tech";

      view.actionMarkAllAsRead();

      expect(noticeMessages()).toEqual(["Marked 2 items as read in Tech"]);
      expect(readStates(techFeed)).toEqual([true, true, true]);
      expect(readStates(newsFeed)).toEqual([false, true]);
    });

    it("names a feed view and leaves other feeds alone", () => {
      privateView.currentFeed = newsFeed;

      view.actionMarkAllAsRead();

      expect(noticeMessages()).toEqual([
        "Marked 1 items as read in Daily News",
      ]);
      expect(readStates(techFeed)).toEqual([false, false, true]);
      expect(readStates(newsFeed)).toEqual([true, true]);
    });

    it("names a tag-filtered view", () => {
      techFeed.items[0].tags = [{ name: "alpha", color: "#fff" }];
      privateView.selectedTags = ["alpha"];

      view.actionMarkAllAsRead();

      expect(noticeMessages()).toEqual([
        "Marked 1 items as read in Tags (OR): alpha",
      ]);
      expect(readStates(techFeed)).toEqual([true, false, true]);
      expect(readStates(newsFeed)).toEqual([false, true]);
    });

    it("names the scope for mark all unread too", () => {
      view.currentFolder = "Tech";

      view.actionMarkAllAsUnread();

      expect(noticeMessages()).toEqual(["Marked 1 items as unread in Tech"]);
      expect(readStates(techFeed)).toEqual([false, false, false]);
      expect(readStates(newsFeed)).toEqual([false, true]);
    });

    it("keeps the no-op notices and does not render", () => {
      privateView.currentFeed = techFeed;
      view.actionMarkAllAsRead();
      debugSpy.mockClear();
      renderSpy.mockClear();

      view.actionMarkAllAsRead();

      expect(noticeMessages()).toEqual(["No unread items in current view"]);

      view.actionMarkAllAsUnread();
      debugSpy.mockClear();
      renderSpy.mockClear();

      view.actionMarkAllAsUnread();

      expect(noticeMessages()).toEqual(["No read items in current view"]);
      expect(renderSpy).not.toHaveBeenCalled();
    });
  });
});
