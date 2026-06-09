import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createArticleListInstance,
  setupArticleListBeforeEach,
  teardownArticleListAfterEach,
  type ArticleListCallbacks,
} from "./article-list-component-fixtures";
import type { FeedItem, RssDashboardSettings, Tag } from "../../../src/types/types";

describe("ArticleList view layout", () => {
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

  describe("View Style Toggles", () => {
    it("should render view style dropdown and refresh button in the hamburger menu", () => {
      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
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
      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
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

      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
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

      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
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
});
