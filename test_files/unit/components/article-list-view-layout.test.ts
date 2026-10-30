import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createArticleListInstance,
  setupArticleListBeforeEach,
  teardownArticleListAfterEach,
  type ArticleListCallbacks,
} from "./article-list-component-fixtures";
import type {
  FeedItem,
  RssDashboardSettings,
  Tag,
} from "../../../src/types/types";

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

  describe("Card press animation (#1727)", () => {
    const listEl = (): HTMLElement =>
      container.querySelector(".rss-dashboard-articles-list") as HTMLElement;

    it("marks the list while the setting is on, which is the default", () => {
      createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
      ).render();

      expect(listEl().hasClass("rss-dashboard-card-press-scale")).toBe(true);
    });

    it("leaves the list unmarked while the setting is off", () => {
      settings.display.cardPressAnimation = false;
      createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
      ).render();

      expect(listEl().hasClass("rss-dashboard-card-press-scale")).toBe(false);
    });

    it("updates the mark in place, without rebuilding the list", () => {
      const articleList = createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
      );
      articleList.render();
      const before = listEl();

      settings.display.cardPressAnimation = false;
      articleList.refreshCardPressAnimation();

      expect(listEl()).toBe(before);
      expect(before.hasClass("rss-dashboard-card-press-scale")).toBe(false);

      settings.display.cardPressAnimation = true;
      articleList.refreshCardPressAnimation();
      expect(before.hasClass("rss-dashboard-card-press-scale")).toBe(true);
    });
  });

  describe("Article title scale", () => {
    const scaleOf = (): string =>
      (
        container.querySelector(".rss-dashboard-articles-list") as HTMLElement
      ).style.getPropertyValue("--rss-dashboard-article-title-scale");

    it.each(["card", "list", "feed"] as const)(
      "applies the saved title size to %s view as a multiplier",
      (viewStyle) => {
        settings.viewStyle = viewStyle;
        settings.display.articleTitleScale = 150;
        createArticleListInstance(
          container,
          settings,
          articles,
          mockCallbacks,
          null,
          2,
        ).render();

        expect(scaleOf()).toBe("1.5");
      },
    );

    it("leaves titles at their normal size by default", () => {
      createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
      ).render();

      expect(scaleOf()).toBe("1");
    });

    it.each([
      [10, "0.5"],
      [900, "2"],
      [Number.NaN, "1"],
    ])("keeps a saved value of %s inside the supported range", (saved, css) => {
      settings.display.articleTitleScale = saved;
      createArticleListInstance(
        container,
        settings,
        articles,
        mockCallbacks,
        null,
        2,
      ).render();

      expect(scaleOf()).toBe(css);
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
