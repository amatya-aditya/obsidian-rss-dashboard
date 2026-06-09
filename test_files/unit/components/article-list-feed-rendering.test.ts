import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as tagLayoutUtils from "../../../src/components/article-list/utils/tag-layout-utils";
import {
  createArticleListInstance,
  setupArticleListBeforeEach,
  teardownArticleListAfterEach,
  type ArticleListCallbacks,
} from "./article-list-component-fixtures";
import type { FeedItem, RssDashboardSettings } from "../../../src/types/types";

describe("Feed View Rendering", () => {
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

  it("should use renderSingleRowCardTagChips for feed view tags to support truncation", () => {
    settings.viewStyle = "feed";
    articles[0].tags = [{ name: "Tag1", color: "#8b5cf6" }];

    const articleList = createArticleListInstance(
      container,
      settings,
      articles,
      mockCallbacks,
      null,
      2,
    );

    articleList.render();

    const tagBadge = container.querySelector(".rss-dashboard-tag-badge");
    expect(tagBadge).not.toBeNull();
    expect(tagBadge?.textContent).toBe("Tag1");
  });

  it("should render articles as feed items in feed view", () => {
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

    const feedArticles = container.querySelectorAll(
      ".rss-dashboard-feed-item",
    );
    expect(feedArticles.length).toBe(articles.length);
  });

  it("should render hero region with blur background and image", () => {
    settings.viewStyle = "feed";
    articles[0].image = "https://example.com/test.jpg";

    const articleList = createArticleListInstance(
      container,
      settings,
      articles,
      mockCallbacks,
      null,
      2,
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

    const articleList = createArticleListInstance(
      container,
      settings,
      articles,
      mockCallbacks,
      null,
      2,
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

    const footer = item.querySelector(".rss-dashboard-feed-footer");
    const children = Array.from(item.children);
    const tagsIndex = children.indexOf(tagsRegion as Element);
    const footerIndex = children.indexOf(footer as Element);
    expect(tagsIndex).toBeLessThan(footerIndex);
  });

  it("should call renderSingleRowCardTagChips when rendering feed view tags", () => {
    settings.viewStyle = "feed";
    articles[0].tags = [{ name: "Tag1", color: "#8b5cf6" }];

    const articleList = createArticleListInstance(
      container,
      settings,
      articles,
      mockCallbacks,
      null,
      2,
    );

    const renderSpy = vi.spyOn(tagLayoutUtils, "renderSingleRowCardTagChips");

    articleList.render();

    expect(renderSpy).toHaveBeenCalled();
  });

  it("should keep tags in the dedicated region after syncArticleTags is called", () => {
    settings.viewStyle = "feed";
    articles[0].tags = [];

    const articleList = createArticleListInstance(
      container,
      settings,
      articles,
      mockCallbacks,
      null,
      2,
    );

    articleList.render();

    let tagsRegion = container.querySelector(
      ".rss-dashboard-feed-tags-region",
    );
    expect(tagsRegion).toBeNull();

    articles[0].tags = [{ name: "NewTag", color: "#8b5cf6" }];
    const item = container.querySelector(
      ".rss-dashboard-feed-item",
    ) as HTMLElement;
    const syncMethod = (
      articleList as unknown as {
        syncArticleTags?: (el: HTMLElement, article: FeedItem) => void;
      }
    ).syncArticleTags;
    if (syncMethod) syncMethod.call(articleList, item, articles[0]);

    const toolbarTags = item.querySelector(
      ".rss-dashboard-feed-toolbar .rss-dashboard-tag-container",
    );

    expect(toolbarTags).toBeNull();

    tagsRegion = item.querySelector(".rss-dashboard-feed-tags-region");
    expect(tagsRegion).not.toBeNull();
  });

  it("should update tags for feed items in-place via updateArticleInPlace", () => {
    settings.viewStyle = "feed";
    articles[0].tags = [{ name: "OldTag", color: "#3498db" }];

    const articleList = createArticleListInstance(
      container,
      settings,
      articles,
      mockCallbacks,
      null,
      2,
    );

    articleList.render();

    const item = container.querySelector(
      ".rss-dashboard-feed-item",
    ) as HTMLElement;
    const initialTag = item.querySelector(".rss-dashboard-tag-badge");
    expect(initialTag?.textContent).toBe("OldTag");

    const updatedArticle = {
      ...articles[0],
      tags: [{ name: "NewTag", color: "#8b5cf6" }],
    };
    articleList.updateArticleInPlace(updatedArticle);

    const updatedTag = item.querySelector(".rss-dashboard-tag-badge");
    expect(updatedTag?.textContent).toBe("NewTag");
  });
});
