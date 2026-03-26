import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArticleList } from "../../../src/components/article-list";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { FeedItem, RssDashboardSettings } from "../../../src/types/types";

// Mock requestAnimationFrame to run synchronously
const originalRAF = window.requestAnimationFrame;
const mockRAF = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as any;

// Mock CSS.escape (jsdom doesn't have it)
if (typeof (window as any).CSS === "undefined") {
  (window as any).CSS = {
    escape: (s: string) => s.replace(/([^\w-])/g, "\\$1"),
  };
} else if (typeof (window as any).CSS.escape === "undefined") {
  (window as any).CSS.escape = (s: string) => s.replace(/([^\w-])/g, "\\$1");
}

describe("ArticleList Component", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let mockCallbacks: any;
  let articles: FeedItem[];

  beforeEach(() => {
    installObsidianDomPolyfills();
    window.requestAnimationFrame = mockRAF;
    container = document.createElement("div");
    document.body.appendChild(container);

    // Mock scrollIntoView since jsdom doesn't implement it
    Element.prototype.scrollIntoView = vi.fn();

    settings = {
      viewStyle: "list",
      articleGroupBy: "none",
      articleSort: "newest",
      display: {
        cardColumnsPerRow: 3,
        cardSpacing: 15,
        mobileShowListToolbar: true,
        mobileShowCardToolbar: true,
      },
      articleFilter: {
        type: "none",
        value: 0,
      },
      articleSaving: {
        saveFullContent: false,
      }
    } as any;

    articles = [
      { guid: "1", title: "Article 1", link: "link1", pubDate: new Date().toISOString(), read: false, tags: [] },
      { guid: "2", title: "Article 2", link: "link2", pubDate: new Date().toISOString(), read: false, tags: [] },
    ] as any;

    mockCallbacks = {
      onArticleClick: vi.fn(),
      onToggleViewStyle: vi.fn(),
      onRefreshFeeds: vi.fn(),
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
    };
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
      "OR"
    );

    articleList.render();

    const articleElements = container.querySelectorAll(".rss-dashboard-article-item");
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
      "OR"
    );

    articleList.render();

    const firstArticle = container.querySelector(".rss-dashboard-article-item") as HTMLElement;
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
      "OR"
    );

    articleList.render();

    const newArticles = [articles[0]];
    articleList.refilter(new Set(), new Set(), "OR", newArticles, 1, 1, 10, 1);

    const articleElements = container.querySelectorAll(".rss-dashboard-article-item");
    expect(articleElements.length).toBe(1);
    expect(container.textContent).not.toContain("Article 2");
  });

  describe("Scroll Restoration (TDD Fixes)", () => {
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
        "OR"
      );

      articleList.render();

      // Simulate scrolling
      const listEl = container.querySelector(".rss-dashboard-articles-list") as HTMLElement;
      Object.defineProperty(listEl, "scrollTop", { value: 100, writable: true });
      
      // Initial render creates the element and applies scroll.
      // But we want to test that a SUBSEQUENT render restores it from the OLD element's state.
      // In reality, render() captures scroll from the DOM, empties container, then renders.
      
      articleList.render();
      
      const newListEl = container.querySelector(".rss-dashboard-articles-list") as HTMLElement;
      // Current behavior: it restores scroll on the OLD listEl (which is disconnected)
      // We expect it to be 100 on the NEW listEl.
      expect(newListEl.scrollTop).toBe(100);
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
        "OR"
      );

      articleList.render();

      const selectedEl = container.querySelector("#article-2");
      expect(selectedEl?.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
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
        "OR"
      );

      articleList.render();

      const secondArticleEl = container.querySelector("#article-2") as HTMLElement;
      articleList.setSelectedArticle(articles[1]);

      expect(secondArticleEl.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
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
        "OR"
      );

      articleList.render();

      const viewSelect = container.querySelector(".rss-dashboard-view-style-select");
      const refreshBtn = container.querySelector(".rss-dashboard-view-refresh-button");

      expect(viewSelect).not.toBeNull();
      expect(refreshBtn).not.toBeNull();
    });

    it("should call onToggleViewStyle when view style dropdown is changed", () => {
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
        "OR"
      );

      articleList.render();

      const viewSelect = container.querySelector(
        ".rss-dashboard-view-style-select",
      ) as HTMLSelectElement;
      expect(viewSelect).not.toBeNull();

      // Test Feed selection
      viewSelect.value = "feed";
      viewSelect.dispatchEvent(new Event("change"));
      expect(mockCallbacks.onToggleViewStyle).toHaveBeenCalledWith("feed");

      // Test Card selection
      viewSelect.value = "card";
      viewSelect.dispatchEvent(new Event("change"));
      expect(mockCallbacks.onToggleViewStyle).toHaveBeenCalledWith("card");

      // Test List selection
      viewSelect.value = "list";
      viewSelect.dispatchEvent(new Event("change"));
      expect(mockCallbacks.onToggleViewStyle).toHaveBeenCalledWith("list");
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
        "OR"
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
        "OR"
      );

      articleList.render();

      const feedArticles = container.querySelectorAll(".rss-dashboard-feed-item");
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
        "OR"
      );

      articleList.render();

      const item = container.querySelector(".rss-dashboard-feed-item");
      const blur = item?.querySelector(".rss-dashboard-feed-hero-blur") as HTMLElement;
      const img = item?.querySelector(".rss-dashboard-feed-hero-image") as HTMLImageElement;

      expect(blur).not.toBeNull();
      expect(blur.style.backgroundImage).toContain("https://example.com/test.jpg");
      expect(img).not.toBeNull();
      expect(img.src).toBe("https://example.com/test.jpg");
      expect(img.getAttribute("loading")).toBe("lazy");
    });
  });
});
