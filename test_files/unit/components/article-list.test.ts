import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArticleList } from "../../../src/components/article-list";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { FeedItem, RssDashboardSettings, Tag } from "../../../src/types/types";

type ArticleListCallbacks = ConstructorParameters<typeof ArticleList>[6];

interface TestCSS {
  escape: (s: string) => string;
}

interface TestWindow extends Window {
  CSS?: TestCSS;
}

const getWindowCSS = (): TestCSS => {
  const win = window as TestWindow;
  if (win.CSS === undefined) {
    const css: TestCSS = {
      escape: (s: string) => s.replace(/([^\w-])/g, "\\$1"),
    };
    win.CSS = css;
    return css;
  }
  if (win.CSS.escape === undefined) {
    win.CSS.escape = (s: string) => s.replace(/([^\w-])/g, "\\$1");
  }
  return win.CSS;
};

const originalRAF = window.requestAnimationFrame;
const mockRAF = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(
  window as unknown as { ResizeObserver: typeof ResizeObserver }
).ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

describe("ArticleList Component", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let mockCallbacks: ArticleListCallbacks;
  let articles: FeedItem[];

  beforeEach(() => {
    installObsidianDomPolyfills();
    getWindowCSS();
    window.requestAnimationFrame = mockRAF;
    container = document.createElement("div");
    document.body.appendChild(container);

    Element.prototype.scrollIntoView = vi.fn();

    settings = {
      viewStyle: "list",
      articleGroupBy: "none",
      articleSort: "newest",
      display: {
        showCoverImage: true,
        showSummary: true,
        showFilterStatusBar: true,
        showSidebarScrollbar: true,
        showAllFeedsUnreadBadges: true,
        showFolderUnreadBadges: true,
        showFeedUnreadBadges: true,
        allFeedsUnreadBadgeColor: "#ff0000",
        folderUnreadBadgeColor: "#ff0000",
        feedUnreadBadgeColor: "#ff0000",
        allFeedsUnreadBadgeDefaultColor: "#ff0000",
        folderUnreadBadgeDefaultColor: "#ff0000",
        feedUnreadBadgeDefaultColor: "#ff0000",
        filterDisplayStyle: "inline" as const,
        mobileShowCardToolbar: true,
        mobileShowListToolbar: true,
        mobileListToolbarStyle: "bottom-row" as const,
        defaultFilter: "all" as const,
        hiddenFilters: [],
        useDomainFavicons: true,
        hideDefaultRssIcon: false,
        autoMarkReadOnOpen: false,
        sidebarRowSpacing: 4,
        sidebarRowIndentation: 12,
        sidebarItemPaddingLeft: 8,
        sidebarItemPaddingRight: 8,
        cardColumnsPerRow: 3,
        cardSpacing: 15,
        hideEmptyFeeds: false,
        hideIconDashboard: false,
        hideIconDiscover: false,
        hideIconAddFeed: false,
        hideIconManageFeeds: false,
        hideIconSearch: false,
        hideIconTags: false,
        hideIconAddFolder: false,
        hideIconSort: false,
        hideIconCollapseAll: false,
        hideIconSettings: false,
        hideIconDivider: false,
        hideToolbarEntirely: false,
        iconOrder: [],
        articleDateStyle: "relative" as const,
      },
      articleFilter: {
        type: "none" as const,
        value: 0,
      },
      articleSaving: {
        addSavedTag: true,
        defaultFolder: ".",
        defaultTemplate: "",
        includeFrontmatter: true,
        frontmatterTemplate: "",
        saveFullContent: false,
        fetchTimeout: 10,
        savedTemplates: [],
      },
    } as unknown as RssDashboardSettings;

    articles = [
      {
        guid: "1",
        title: "Article 1",
        link: "link1",
        description: "desc1",
        pubDate: new Date().toISOString(),
        read: false,
        starred: false,
        feedTitle: "Feed 1",
        feedUrl: "feed1",
        coverImage: "",
        tags: [],
      },
      {
        guid: "2",
        title: "Article 2",
        link: "link2",
        description: "desc2",
        pubDate: new Date().toISOString(),
        read: false,
        starred: false,
        feedTitle: "Feed 2",
        feedUrl: "feed2",
        coverImage: "",
        tags: [],
      },
    ];

    mockCallbacks = {
      onArticleClick: vi.fn(),
      onToggleViewStyle: vi.fn(),
      onRefreshFeeds: vi.fn(async () => {}),
      onOpenViewFilters: vi.fn(),
      onOpenPerFeedSettings: vi.fn(),
      onArticleUpdate: vi.fn(),
      onArticleSave: vi.fn(),
      onOpenSavedArticle: vi.fn(),
      onOpenInReaderView: vi.fn(),
      onToggleSidebar: vi.fn(),
      onSortChange: vi.fn(),
      onGroupChange: vi.fn(),
      onFilterChange: vi.fn(),
      onPageChange: vi.fn(),
      onPageSizeChange: vi.fn(),
      onPersistSettings: vi.fn(),
      onSearch: vi.fn(),
    } as ArticleListCallbacks;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.requestAnimationFrame = originalRAF;
    vi.restoreAllMocks();
  });

  it("should render the correct number of articles", () => {
    const articleList = new ArticleList(
      container,
      settings,
      "All articles",
      null,
      articles,
      null,
      mockCallbacks,
      1,
      1,
      10,
      2,
      new Set(),
      new Set(),
      "OR",
    );

    articleList.render();

    const articleElements = container.querySelectorAll(
      ".rss-dashboard-article-item",
    );
    expect(articleElements.length).toBe(2);
    expect(container.textContent).toContain("Article 1");
    expect(container.textContent).toContain("Article 2");
  });

  it("should trigger onArticleClick when an article is clicked", () => {
    const articleList = new ArticleList(
      container,
      settings,
      "All articles",
      null,
      articles,
      null,
      mockCallbacks,
      1,
      1,
      10,
      2,
      new Set(),
      new Set(),
      "OR",
    );

    articleList.render();

    const firstArticle = container.querySelector(
      ".rss-dashboard-article-item",
    ) as HTMLElement;
    firstArticle.click();

    expect(mockCallbacks.onArticleClick).toHaveBeenCalledWith(articles[0]);
  });

  it("should update DOM when refilter is called", () => {
    const articleList = new ArticleList(
      container,
      settings,
      "All articles",
      null,
      articles,
      null,
      mockCallbacks,
      1,
      1,
      10,
      2,
      new Set(),
      new Set(),
      "OR",
    );

    articleList.render();

    const newArticles = [articles[0]];
    articleList.refilter(new Set(), new Set(), "OR", newArticles, 1, 1, 10, 1);

    const articleElements = container.querySelectorAll(
      ".rss-dashboard-article-item",
    );
    expect(articleElements.length).toBe(1);
    expect(container.textContent).not.toContain("Article 2");
  });

  it("routes the empty-state CTA to the view-filter callback", () => {
    const articleList = new ArticleList(
      container,
      settings,
      "All articles",
      null,
      [],
      null,
      mockCallbacks,
      1,
      1,
      10,
      0,
      new Set(),
      new Set(),
      "OR",
    );

    articleList.setEmptyStateContext({
      type: "AllArticlesFiltered",
      unfilteredCount: 3,
      filterReason: "view-filter",
      filterReasonLabel: "the Unread view filter",
      actionTarget: "view-filter",
      actionLabel: "Adjust view filters",
    });

    articleList.render();

    const button = container.querySelector(
      ".rss-dashboard-empty-state-button",
    ) as HTMLElement;
    button.click();

    expect(mockCallbacks.onOpenViewFilters).toHaveBeenCalledTimes(1);
  });

  describe("Scroll Restoration (TDD Fixes)", () => {
    const makeRect = (top: number, bottom: number) => ({
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });

    it("should restore scroll position on the NEW list element after render", () => {
      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      // Simulate scrolling
      Object.defineProperty(container, "scrollTop", {
        value: 100,
        writable: true,
      });

      // Initial render creates the element and applies scroll.
      // But we want to test that a SUBSEQUENT render restores it from the OLD element's state.
      // In reality, render() captures scroll from the DOM, empties container, then renders.

      articleList.render();

      expect(container.scrollTop).toBe(100);
    });

    it("should scroll the selected article into view after render", () => {
      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        articles[1], // Select 2nd article
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const selectedEl = container.querySelector("#article-2");
      expect(selectedEl?.scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
        behavior: "auto",
      });
    });

    it("should preserve scroll position when rerender keeps the selected article visible", () => {
      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        articles[1],
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      Object.defineProperty(container, "scrollTop", {
        value: 180,
        writable: true,
      });

      const rectSpy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this === container) {
            return makeRect(100, 500) as DOMRect;
          }

          if (this instanceof HTMLElement && this.id === "article-2") {
            return makeRect(220, 280) as DOMRect;
          }

          return makeRect(0, 0) as DOMRect;
        });
      const scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView");
      scrollIntoViewSpy.mockClear();

      articleList.render();

      expect(container.scrollTop).toBe(180);
      expect(scrollIntoViewSpy).not.toHaveBeenCalled();

      rectSpy.mockRestore();
    });

    it("should scroll the newly selected article into view when setSelectedArticle is called", () => {
      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const secondArticleEl = container.querySelector(
        "#article-2",
      ) as HTMLElement;
      articleList.setSelectedArticle(articles[1]);

      expect(secondArticleEl.scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
        behavior: "auto",
      });
    });

    it("should keep the current list anchor when selecting an already visible article", () => {
      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      Object.defineProperty(container, "scrollTop", {
        value: 240,
        writable: true,
      });

      const rectSpy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this === container) {
            return makeRect(100, 500) as DOMRect;
          }

          if (this instanceof HTMLElement && this.id === "article-2") {
            return makeRect(260, 340) as DOMRect;
          }

          return makeRect(0, 0) as DOMRect;
        });
      const scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView");
      scrollIntoViewSpy.mockClear();

      articleList.setSelectedArticle(articles[1]);

      expect(container.scrollTop).toBe(240);
      expect(scrollIntoViewSpy).not.toHaveBeenCalled();

      rectSpy.mockRestore();
    });

    it("should top-align selected card when split/sidebar anchor is requested", () => {
      settings.viewStyle = "card";
      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      Object.defineProperty(container, "scrollTop", {
        value: 40,
        writable: true,
      });

      const rectSpy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function mockGetBoundingClientRect(this: Element) {
          if (this === container) {
            return makeRect(100, 500) as DOMRect;
          }

          if (this instanceof HTMLElement && this.id === "article-2") {
            return makeRect(460, 520) as DOMRect;
          }

          return makeRect(0, 0) as DOMRect;
        });

      const scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView");
      scrollIntoViewSpy.mockClear();

      articleList.setSelectedArticle(articles[1], { forceCardTopAnchor: true });

      expect(container.scrollTop).toBe(400);
      expect(scrollIntoViewSpy).not.toHaveBeenCalled();

      rectSpy.mockRestore();
    });
  });

  describe("scheduleCardTopAnchorOnResize", () => {
    const makeRect = (top: number, bottom: number) => ({
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });

    const makeArticleList = () =>
      new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

    afterEach(() => {
      // Always restore the class-based mock so subsequent tests are not polluted.
      window.ResizeObserver =
        ResizeObserverMock as unknown as typeof ResizeObserver;
    });

    it("sets pendingCardTopAnchor and starts observing the container", () => {
      settings.viewStyle = "card";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      let observedEl: Element | null = null;

      class TestResizeObserver {
        constructor(_cb: ResizeObserverCallback) {}
        observe(el: Element) {
          observedEl = el;
        }
        unobserve() {}
        disconnect() {}
      }
      window.ResizeObserver =
        TestResizeObserver as unknown as typeof ResizeObserver;

      articleList.scheduleCardTopAnchorOnResize();

      expect(observedEl).toBe(container);
      expect((articleList as unknown as { pendingCardTopAnchor: boolean }).pendingCardTopAnchor).toBe(true);
    });

    it("top-anchors the selected card and disconnects the observer when a resize fires", () => {
      settings.viewStyle = "card";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      let capturedCallback: ResizeObserverCallback | null = null;
      let disconnected = false;

      class TestResizeObserver {
        constructor(cb: ResizeObserverCallback) {
          capturedCallback = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {
          disconnected = true;
        }
      }
      window.ResizeObserver =
        TestResizeObserver as unknown as typeof ResizeObserver;

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });
      const rectSpy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this === container) return makeRect(0, 400) as DOMRect;
          if (this instanceof HTMLElement && this.id === "article-2")
            return makeRect(200, 260) as DOMRect;
          return makeRect(0, 0) as DOMRect;
        });

      articleList.scheduleCardTopAnchorOnResize();
      // Simulate the ResizeObserver firing (rAF runs synchronously in tests)
      capturedCallback!([], {} as ResizeObserver);

      expect(container.scrollTop).toBe(200);
      expect(disconnected).toBe(true);
      expect((articleList as unknown as { pendingCardTopAnchor: boolean }).pendingCardTopAnchor).toBe(false);

      rectSpy.mockRestore();
    });

    it("triggers the fallback relock via timeout if the observer never fires", () => {
      vi.useFakeTimers();
      settings.viewStyle = "card";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      let disconnected = false;

      class TestResizeObserver {
        constructor(_cb: ResizeObserverCallback) {}
        observe() {}
        unobserve() {}
        disconnect() {
          disconnected = true;
        }
      }
      window.ResizeObserver =
        TestResizeObserver as unknown as typeof ResizeObserver;

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });
      const rectSpy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this === container) return makeRect(0, 400) as DOMRect;
          if (this instanceof HTMLElement && this.id === "article-2")
            return makeRect(200, 260) as DOMRect;
          return makeRect(0, 0) as DOMRect;
        });

      articleList.scheduleCardTopAnchorOnResize();
      vi.advanceTimersByTime(500);

      expect(container.scrollTop).toBe(200);
      expect(disconnected).toBe(true);
      expect((articleList as unknown as { pendingCardTopAnchor: boolean }).pendingCardTopAnchor).toBe(false);

      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it("does not relock if viewStyle is not card when the observer fires", () => {
      settings.viewStyle = "list";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      let capturedCallback: ResizeObserverCallback | null = null;

      class TestResizeObserver {
        constructor(cb: ResizeObserverCallback) {
          capturedCallback = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      window.ResizeObserver =
        TestResizeObserver as unknown as typeof ResizeObserver;

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });
      const scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView");
      scrollIntoViewSpy.mockClear();

      articleList.scheduleCardTopAnchorOnResize();
      capturedCallback!([], {} as ResizeObserver);

      // scrollTop should be untouched by the forced-anchor path
      expect(container.scrollTop).toBe(0);

      scrollIntoViewSpy.mockRestore();
    });
  });

  describe("scrollSelectedCardToTop", () => {
    const makeRect = (top: number, bottom: number) => ({
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });

    const makeArticleList = () =>
      new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

    it("scrolls the selected card to the top of the list container", () => {
      settings.viewStyle = "card";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });
      const rectSpy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this === container) return makeRect(0, 400) as DOMRect;
          if (this instanceof HTMLElement && this.id === "article-2")
            return makeRect(200, 260) as DOMRect;
          return makeRect(0, 0) as DOMRect;
        });

      articleList.scrollSelectedCardToTop();

      expect(container.scrollTop).toBe(200);
      expect((articleList as unknown as { pendingCardTopAnchor: boolean }).pendingCardTopAnchor).toBe(false);

      rectSpy.mockRestore();
    });

    it("anchors selected card below sticky articles header overlap", () => {
      settings.viewStyle = "card";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });
      const rectSpy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this === container) return makeRect(0, 400) as DOMRect;
          if (
            this instanceof HTMLElement &&
            this.classList.contains("rss-dashboard-articles-header")
          ) {
            return makeRect(0, 56) as DOMRect;
          }
          if (this instanceof HTMLElement && this.id === "article-2") {
            return makeRect(200, 260) as DOMRect;
          }

          return makeRect(0, 0) as DOMRect;
        });

      articleList.scrollSelectedCardToTop();

      // scrollTop = 0 + (200 - 0 - 56) = 144
      // so the selected card sits just below the sticky header's visible band.
      expect(container.scrollTop).toBe(144);

      rectSpy.mockRestore();
    });

    it("ignores a sibling filter status bar when computing the top-anchor scroll amount", () => {
      // The filter-subheader and the articles scroll container are flex siblings
      // inside .rss-dashboard-content. The scroll container's getBoundingClientRect()
      // already starts below the status bar, so no extra offset is needed. A
      // visible, fully-populated status bar must not change the resulting scrollTop.
      settings.viewStyle = "card";
      const contentEl = document.createElement("div");
      const statusBarEl = document.createElement("div");
      const statusBarContentEl = document.createElement("div");
      const keywordRow = document.createElement("div");
      const highlightRow = document.createElement("div");
      const viewingRow = document.createElement("div");
      statusBarEl.className = "rss-dashboard-filter-subheader";
      statusBarContentEl.className = "rss-dashboard-filter-subheader-content";
      keywordRow.className = "rss-dashboard-filter-stats-row";
      highlightRow.className = "rss-dashboard-highlight-stats";
      viewingRow.className =
        "rss-dashboard-filter-stats-row rss-dashboard-viewing-filter-stats-row";
      Object.assign(statusBarEl.style, {
        paddingTop: "8px",
        paddingBottom: "8px",
        borderTop: "1px solid transparent",
        borderBottom: "1px solid transparent",
        marginBottom: "14px",
      });
      statusBarContentEl.appendChild(keywordRow);
      statusBarContentEl.appendChild(highlightRow);
      statusBarContentEl.appendChild(viewingRow);
      statusBarEl.appendChild(statusBarContentEl);
      document.body.appendChild(contentEl);
      contentEl.appendChild(statusBarEl);
      contentEl.appendChild(container);

      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });
      const rectSpy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this === container) return makeRect(100, 500) as DOMRect;
          if (this === keywordRow) return makeRect(28, 45) as DOMRect;
          if (this === highlightRow) return makeRect(56, 72) as DOMRect;
          if (this === viewingRow) return makeRect(83, 100) as DOMRect;
          if (this instanceof HTMLElement && this.id === "article-2") {
            return makeRect(300, 360) as DOMRect;
          }

          return makeRect(0, 0) as DOMRect;
        });

      articleList.scrollSelectedCardToTop();

      // scrollTop = 0 + (articleRect.top 300 − listRect.top 100) = 200
      // The sibling status bar must not inflate this value.
      expect(container.scrollTop).toBe(200);

      rectSpy.mockRestore();
    });

    it("does nothing when viewStyle is not card", () => {
      settings.viewStyle = "list";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });

      articleList.scrollSelectedCardToTop();

      expect(container.scrollTop).toBe(0);
    });

    it("does nothing when no article is selected", () => {
      settings.viewStyle = "card";
      const articleList = makeArticleList();
      articleList.render();

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });

      articleList.scrollSelectedCardToTop();

      expect(container.scrollTop).toBe(0);
    });
  });

  describe("View Style Toggles", () => {
    it("should render view style dropdown and refresh button in the hamburger menu", () => {
      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const viewSelector = container.querySelector(
        ".rss-dashboard-view-style-selector",
      );
      const refreshBtn = container.querySelector(
        ".rss-dashboard-view-refresh-button",
      );

      expect(viewSelector).not.toBeNull();
      expect(refreshBtn).not.toBeNull();
    });

    it("should render correctly with the initial view style", () => {
      settings.viewStyle = "feed";
      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const selectorText = container.querySelector(
        ".rss-dashboard-selector-text",
      );
      expect(selectorText?.textContent).toBe("Feed View");
    });
  });

  describe("Card Spacing Layout", () => {
    it("updates the card gap variable without re-running tag layout on live spacing changes", () => {
      settings.viewStyle = "card";
      articles[0].tags = [
        { name: "Tag1", color: "#8b5cf6" },
      ] as unknown as Tag[];

      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const scheduleSpy = vi.spyOn(
        articleList,
        "scheduleCardTagLayout" as never,
      );

      articleList.updateCardSpacingLayout(22);

      articleList.updateCardSpacingLayout(22);

      const articlesList = container.querySelector(
        ".rss-dashboard-articles-list.rss-dashboard-card-view",
      ) as HTMLElement;
      expect(
        articlesList.style.getPropertyValue("--rss-dashboard-card-gap"),
      ).toBe("22px");
      expect(scheduleSpy).not.toHaveBeenCalled();
    });

    it("refreshes visible card tag layout when explicitly requested", () => {
      settings.viewStyle = "card";
      articles[0].tags = [
        { name: "Tag1", color: "#8b5cf6" },
      ] as unknown as Tag[];

      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const scheduleSpy = vi.spyOn(
        articleList,
        "scheduleCardTagLayout" as never,
      );

      articleList.refreshCardTagLayout();

      const articlesList = container.querySelector(
        ".rss-dashboard-articles-list.rss-dashboard-card-view",
      ) as HTMLElement;
      expect(scheduleSpy).toHaveBeenCalledWith(articlesList);
    });
  });

  describe("Feed View Rendering", () => {
    it("should render with rss-dashboard-feed-view class when viewStyle is feed", () => {
      settings.viewStyle = "feed";
      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const listEl = container.querySelector(".rss-dashboard-articles-list");
      expect(listEl?.classList.contains("rss-dashboard-feed-view")).toBe(true);
    });

    it("should render articles as feed items in feed view", () => {
      settings.viewStyle = "feed";
      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const feedArticles = container.querySelectorAll(
        ".rss-dashboard-feed-item",
      );
      expect(feedArticles.length).toBe(articles.length);
    });

    it("should render hero region with blur background and image", () => {
      settings.viewStyle = "feed";
      // Ensure first article has an image
      articles[0].image = "https://example.com/test.jpg";

      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const item = container.querySelector(".rss-dashboard-feed-item");
      const blur = item?.querySelector(
        ".rss-dashboard-feed-hero-blur",
      ) as HTMLElement;
      const img = item?.querySelector(
        ".rss-dashboard-feed-hero-image",
      ) as HTMLImageElement;

      expect(blur).not.toBeNull();
      expect(blur.style.backgroundImage).toContain(
        "https://example.com/test.jpg",
      );
      expect(img).not.toBeNull();
      expect(img.src).toBe("https://example.com/test.jpg");
      expect(img.getAttribute("loading")).toBe("lazy");
    });

    it("should render tags in a dedicated region above the footer, not in the toolbar", () => {
      settings.viewStyle = "feed";
      articles[0].tags = [{ name: "Tag1", color: "#8b5cf6" }];

      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const item = container.querySelector(
        ".rss-dashboard-feed-item",
      ) as HTMLElement;
      const tagsRegion = item.querySelector(".rss-dashboard-feed-tags-region");
      const toolbar = item.querySelector(".rss-dashboard-feed-toolbar");
      const toolbarTags = toolbar?.querySelector(
        ".rss-dashboard-tag-container",
      );

      expect(tagsRegion).not.toBeNull();
      expect(toolbarTags).toBeNull();

      // Verify ordering: tagsRegion should be before footer
      const footer = item.querySelector(".rss-dashboard-feed-footer");
      const children = Array.from(item.children);
      const tagsIndex = children.indexOf(tagsRegion as Element);
      const footerIndex = children.indexOf(footer as Element);
      expect(tagsIndex).toBeLessThan(footerIndex);
    });

    it("should use renderSingleRowCardTagChips for feed view tags to support truncation", () => {
      settings.viewStyle = "feed";
      articles[0].tags = [{ name: "Tag1", color: "#8b5cf6" }];

      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      const renderSpy = vi.spyOn(
        ArticleList.prototype,
        "renderSingleRowCardTagChips" as never,
      );

      articleList.render();

      expect(renderSpy).toHaveBeenCalled();
    });

    it("should keep tags in the dedicated region after syncArticleTags is called", () => {
      settings.viewStyle = "feed";
      articles[0].tags = []; // Start with no tags

      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      // Initially no tags region because hasTags was false
      let tagsRegion = container.querySelector(
        ".rss-dashboard-feed-tags-region",
      );
      expect(tagsRegion).toBeNull();

      // Now add a tag and sync
      articles[0].tags = [{ name: "NewTag", color: "#8b5cf6" }];
      const item = container.querySelector(
        ".rss-dashboard-feed-item",
      ) as HTMLElement;
      // Access private method for test verification - bind this properly
      const syncMethod = (
        articleList as unknown as {
          syncArticleTags?: (el: HTMLElement, article: FeedItem) => void;
        }
      ).syncArticleTags;
      if (syncMethod) syncMethod.call(articleList, item, articles[0]);

      // Check if it's in the toolbar (incorrect) or tags region (correct)
      const toolbarTags = item.querySelector(
        ".rss-dashboard-feed-toolbar .rss-dashboard-tag-container",
      );

      // If the bug exists, toolbarTags will NOT be null
      expect(toolbarTags).toBeNull();

      tagsRegion = item.querySelector(".rss-dashboard-feed-tags-region");
      expect(tagsRegion).not.toBeNull();
    });

    it("should update tags for feed items in-place via updateArticleInPlace", () => {
      settings.viewStyle = "feed";
      articles[0].tags = [{ name: "OldTag", color: "#3498db" }];

      const articleList = new ArticleList(
        container,
        settings,
        "All articles",
        null,
        articles,
        null,
        mockCallbacks,
        1,
        1,
        10,
        2,
        new Set(),
        new Set(),
        "OR",
      );

      articleList.render();

      const item = container.querySelector(
        ".rss-dashboard-feed-item",
      ) as HTMLElement;
      const initialTag = item.querySelector(".rss-dashboard-tag-badge");
      expect(initialTag?.textContent).toBe("OldTag");

      // Update the article in-place
      const updatedArticle = {
        ...articles[0],
        tags: [{ name: "NewTag", color: "#8b5cf6" }],
      };
      articleList.updateArticleInPlace(updatedArticle);

      const updatedTag = item.querySelector(".rss-dashboard-tag-badge");
      expect(updatedTag?.textContent).toBe("NewTag");
    });
  });
});
