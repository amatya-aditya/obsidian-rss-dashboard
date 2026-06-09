import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createArticleListInstance,
  installCapturingResizeObserver,
  installObservingResizeObserver,
  makeBoundingRect,
  ResizeObserverMock,
  setupArticleListBeforeEach,
  teardownArticleListAfterEach,
  type ArticleListCallbacks,
} from "./article-list-component-fixtures";
import type { FeedItem, RssDashboardSettings } from "../../../src/types/types";

describe("ArticleList scroll behavior", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let mockCallbacks: ArticleListCallbacks;
  let articles: FeedItem[];

  beforeEach(() => {
    ({ container, settings, mockCallbacks, articles } =
      setupArticleListBeforeEach());
  });

  afterEach(() => {
    teardownArticleListAfterEach();
  });

  describe("Scroll Restoration (TDD Fixes)", () => {
    it("should restore scroll position on the NEW list element after render", () => {
      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
      );

      articleList.render();

      Object.defineProperty(container, "scrollTop", {
        value: 100,
        writable: true,
      });

      articleList.render();

      expect(container.scrollTop).toBe(100);
    });

    it("should scroll the selected article into view after render", () => {
      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        articles[1],
        2,
      );

      articleList.render();

      const selectedEl = container.querySelector("#article-2");
      expect(selectedEl?.scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
        behavior: "auto",
      });
    });

    it("should preserve scroll position when rerender keeps the selected article visible", () => {
      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        articles[1],
        2,
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
            return makeBoundingRect(100, 500) as DOMRect;
          }

          if (this instanceof HTMLElement && this.id === "article-2") {
            return makeBoundingRect(220, 280) as DOMRect;
          }

          return makeBoundingRect(0, 0) as DOMRect;
        });
      const scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView");
      scrollIntoViewSpy.mockClear();

      articleList.render();

      expect(container.scrollTop).toBe(180);
      expect(scrollIntoViewSpy).not.toHaveBeenCalled();

      rectSpy.mockRestore();
    });

    it("should scroll the newly selected article into view when setSelectedArticle is called", () => {
      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
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
      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
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
            return makeBoundingRect(100, 500) as DOMRect;
          }

          if (this instanceof HTMLElement && this.id === "article-2") {
            return makeBoundingRect(260, 340) as DOMRect;
          }

          return makeBoundingRect(0, 0) as DOMRect;
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
      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
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
            return makeBoundingRect(100, 500) as DOMRect;
          }

          if (this instanceof HTMLElement && this.id === "article-2") {
            return makeBoundingRect(460, 520) as DOMRect;
          }

          return makeBoundingRect(0, 0) as DOMRect;
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
    const makeArticleList = () =>
      createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
      );

    afterEach(() => {
      window.ResizeObserver =
        ResizeObserverMock as unknown as typeof ResizeObserver;
    });

    it("sets pendingCardTopAnchor and starts observing the container", () => {
      settings.viewStyle = "card";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      let observedEl: Element | null = null;
      installObservingResizeObserver((el) => {
        observedEl = el;
      });

      articleList.scheduleCardTopAnchorOnResize();

      expect(observedEl).toBe(container);
      expect(
        (articleList as unknown as { pendingCardTopAnchor: boolean })
          .pendingCardTopAnchor,
      ).toBe(true);
    });

    it("top-anchors the selected card and disconnects the observer when a resize fires", () => {
      settings.viewStyle = "card";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      let capturedCallback: ResizeObserverCallback | null = null;
      let disconnected = false;
      installCapturingResizeObserver({
        onConstruct: (cb) => {
          capturedCallback = cb;
        },
        onDisconnect: () => {
          disconnected = true;
        },
      });

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });
      const rectSpy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this === container) return makeBoundingRect(0, 400) as DOMRect;
          if (this instanceof HTMLElement && this.id === "article-2")
            return makeBoundingRect(200, 260) as DOMRect;
          return makeBoundingRect(0, 0) as DOMRect;
        });

      articleList.scheduleCardTopAnchorOnResize();
      capturedCallback!([], {} as ResizeObserver);

      expect(container.scrollTop).toBe(200);
      expect(disconnected).toBe(true);
      expect(
        (articleList as unknown as { pendingCardTopAnchor: boolean })
          .pendingCardTopAnchor,
      ).toBe(false);

      rectSpy.mockRestore();
    });

    it("triggers the fallback relock via timeout if the observer never fires", () => {
      vi.useFakeTimers();
      settings.viewStyle = "card";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      let disconnected = false;
      installCapturingResizeObserver({
        onConstruct: () => {},
        onDisconnect: () => {
          disconnected = true;
        },
      });

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });
      const rectSpy = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this === container) return makeBoundingRect(0, 400) as DOMRect;
          if (this instanceof HTMLElement && this.id === "article-2")
            return makeBoundingRect(200, 260) as DOMRect;
          return makeBoundingRect(0, 0) as DOMRect;
        });

      articleList.scheduleCardTopAnchorOnResize();
      vi.advanceTimersByTime(500);

      expect(container.scrollTop).toBe(200);
      expect(disconnected).toBe(true);
      expect(
        (articleList as unknown as { pendingCardTopAnchor: boolean })
          .pendingCardTopAnchor,
      ).toBe(false);

      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it("does not relock if viewStyle is not card when the observer fires", () => {
      settings.viewStyle = "list";
      const articleList = makeArticleList();
      articleList.render();
      articleList.setSelectedArticle(articles[1]);

      let capturedCallback: ResizeObserverCallback | null = null;
      installCapturingResizeObserver({
        onConstruct: (cb) => {
          capturedCallback = cb;
        },
      });

      Object.defineProperty(container, "scrollTop", {
        value: 0,
        writable: true,
        configurable: true,
      });
      const scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView");
      scrollIntoViewSpy.mockClear();

      articleList.scheduleCardTopAnchorOnResize();
      capturedCallback!([], {} as ResizeObserver);

      expect(container.scrollTop).toBe(0);

      scrollIntoViewSpy.mockRestore();
    });
  });

  describe("scrollSelectedCardToTop", () => {
    const makeArticleList = () =>
      createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
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
          if (this === container) return makeBoundingRect(0, 400) as DOMRect;
          if (this instanceof HTMLElement && this.id === "article-2")
            return makeBoundingRect(200, 260) as DOMRect;
          return makeBoundingRect(0, 0) as DOMRect;
        });

      articleList.scrollSelectedCardToTop();

      expect(container.scrollTop).toBe(200);
      expect(
        (articleList as unknown as { pendingCardTopAnchor: boolean })
          .pendingCardTopAnchor,
      ).toBe(false);

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
          if (this === container) return makeBoundingRect(0, 400) as DOMRect;
          if (
            this instanceof HTMLElement &&
            this.classList.contains("rss-dashboard-articles-header")
          ) {
            return makeBoundingRect(0, 56) as DOMRect;
          }
          if (this instanceof HTMLElement && this.id === "article-2") {
            return makeBoundingRect(200, 260) as DOMRect;
          }

          return makeBoundingRect(0, 0) as DOMRect;
        });

      articleList.scrollSelectedCardToTop();

      expect(container.scrollTop).toBe(144);

      rectSpy.mockRestore();
    });

    it("ignores a sibling filter status bar when computing the top-anchor scroll amount", () => {
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
          if (this === container) return makeBoundingRect(100, 500) as DOMRect;
          if (this === keywordRow) return makeBoundingRect(28, 45) as DOMRect;
          if (this === highlightRow) return makeBoundingRect(56, 72) as DOMRect;
          if (this === viewingRow) return makeBoundingRect(83, 100) as DOMRect;
          if (this instanceof HTMLElement && this.id === "article-2") {
            return makeBoundingRect(300, 360) as DOMRect;
          }

          return makeBoundingRect(0, 0) as DOMRect;
        });

      articleList.scrollSelectedCardToTop();

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
});
