import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderFeedView } from "../../../../../src/components/article-list/views/feed-view";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

describe("feed-view", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders feed items with title and footer toolbar", () => {
    renderFeedView(
      container,
      [makeArticle()],
      baseViewContext(),
      baseViewDeps(),
    );

    const item = container.querySelector(".rss-dashboard-feed-item");
    expect(item).toBeTruthy();
    expect(item?.querySelector(".rss-dashboard-article-title")?.textContent).toBe(
      "Test Article",
    );
    expect(item?.querySelector(".rss-dashboard-feed-footer")).toBeTruthy();
  });

  it("marks selected article as active", () => {
    const article = makeArticle();
    renderFeedView(
      container,
      [article],
      baseViewContext({ selectedArticle: article }),
      baseViewDeps(),
    );

    expect(container.querySelector(".rss-dashboard-feed-item.active")).toBeTruthy();
  });

  it("renders hero image when cover image is set", () => {
    renderFeedView(
      container,
      [makeArticle({ coverImage: "https://example.com/cover.jpg" })],
      baseViewContext(),
      baseViewDeps(),
    );

    expect(
      container.querySelector(".rss-dashboard-feed-hero-image"),
    ).toBeTruthy();
  });

  it("renders feed source meta when showFeedSource is true", () => {
    const deps = baseViewDeps();
    renderFeedView(
      container,
      [makeArticle()],
      baseViewContext({ showFeedSource: true }),
      deps,
    );

    expect(container.querySelector(".rss-dashboard-article-feed")).toBeTruthy();
    expect(deps.renderFeedIcon).toHaveBeenCalled();
  });

  it("hides feed source meta when showFeedSource is false", () => {
    renderFeedView(
      container,
      [makeArticle()],
      baseViewContext({ showFeedSource: false }),
      baseViewDeps(),
    );

    expect(container.querySelector(".rss-dashboard-article-feed")).toBeFalsy();
  });

  it("calls onArticleClick when item is clicked", () => {
    const article = makeArticle();
    const onArticleClick = vi.fn();
    renderFeedView(
      container,
      [article],
      baseViewContext({ callbacks: { onArticleClick } }),
      baseViewDeps(),
    );

    container.querySelector(".rss-dashboard-feed-item")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    expect(onArticleClick).toHaveBeenCalledWith(article);
  });
});
