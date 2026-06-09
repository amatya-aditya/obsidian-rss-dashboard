import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createArticleListInstance,
  setupArticleListBeforeEach,
  teardownArticleListAfterEach,
  type ArticleListCallbacks,
} from "./article-list-component-fixtures";
import type { FeedItem, RssDashboardSettings } from "../../../src/types/types";

describe("ArticleList Component", () => {
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

  it("should render the correct number of articles", () => {
    const articleList = createArticleListInstance(
      container,
      settings,
      articles,
      mockCallbacks,
      null,
      2,
    );

    articleList.render();

    const articleElements = container.querySelectorAll(
      ".rss-dashboard-article-item",
    );
    expect(articleElements.length).toBe(2);
    expect(container.textContent).toContain("Article 1");
    expect(container.textContent).toContain("Article 2");
  });

  it("uses feed description for card image overlay when stored summary is stylesheet text", () => {
    settings.viewStyle = "card";
    articles = [
      {
        ...articles[0],
        summary:
          ".bh__table, .bh__table_header, .bh__table_cell { border: 1px solid #C0C0C0; } .bh__table_cell { padding: 5px; }",
        description:
          "Q+A with one of the Broadview Six, who had all charges dropped against them after grand jury misconduct.",
        coverImage: "https://example.com/cover.jpg",
      },
    ];

    const articleList = createArticleListInstance(
      container,
      settings,
      articles,
      mockCallbacks,
    );

    articleList.render();

    const overlay = container.querySelector(".rss-dashboard-summary-overlay");
    expect(overlay?.textContent).toBe(
      "Q+A with one of the Broadview Six, who had all charges dropped against them after grand jury misconduct.",
    );
    expect(overlay?.textContent).not.toContain(".bh__table");
    expect(overlay?.textContent).not.toContain("border: 1px");
  });

  it("should trigger onArticleClick when an article is clicked", () => {
    const articleList = createArticleListInstance(
      container,
      settings,
      articles,
      mockCallbacks,
      null,
      2,
    );

    articleList.render();

    const firstArticle = container.querySelector(
      ".rss-dashboard-article-item",
    ) as HTMLElement;
    firstArticle.click();

    expect(mockCallbacks.onArticleClick).toHaveBeenCalledWith(articles[0]);
  });

  it("should update DOM when refilter is called", () => {
    const articleList = createArticleListInstance(
      container,
      settings,
      articles,
      mockCallbacks,
      null,
      2,
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
    const articleList = createArticleListInstance(
      container,
      settings,
      [],
      mockCallbacks,
      null,
      0,
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
});
