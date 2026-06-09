import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderCardView } from "../../../../../src/components/article-list/views/card-view";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

describe("card-view", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders article cards with title", () => {
    renderCardView(
      container,
      [makeArticle()],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    const card = container.querySelector(".rss-dashboard-article-card");
    expect(card).toBeTruthy();
    expect(card?.querySelector(".rss-dashboard-article-title")?.textContent).toBe(
      "Test Article",
    );
  });

  it("adds has-tags class when article has tags", () => {
    renderCardView(
      container,
      [
        makeArticle({
          tags: [{ name: "tech", color: "#ff0000" }],
        }),
      ],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    expect(
      container.querySelector(".rss-dashboard-article-card--has-tags"),
    ).toBeTruthy();
    expect(container.querySelector(".rss-dashboard-card-tags-region")).toBeTruthy();
  });

  it("renders cover image when coverImage is set", () => {
    renderCardView(
      container,
      [makeArticle({ coverImage: "https://example.com/cover.jpg" })],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    expect(container.querySelector(".rss-dashboard-cover-image")).toBeTruthy();
  });

  it("renders card footer toolbar when showCardToolbar is true", () => {
    const deps = baseViewDeps();
    renderCardView(
      container,
      [makeArticle()],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      deps,
    );

    expect(container.querySelector(".rss-dashboard-card-footer")).toBeTruthy();
    expect(deps.createArticleActionButtons).toHaveBeenCalled();
    expect(deps.scheduleCardTagLayout).toHaveBeenCalled();
  });

  it("omits card footer when showCardToolbar is false", () => {
    const deps = baseViewDeps();
    renderCardView(
      container,
      [makeArticle()],
      {
        ...baseViewContext(),
        showCardToolbar: false,
      },
      deps,
    );

    expect(container.querySelector(".rss-dashboard-card-footer")).toBeFalsy();
    expect(deps.createArticleActionButtons).not.toHaveBeenCalled();
    expect(deps.scheduleCardTagLayout).toHaveBeenCalled();
  });

  it("calls onArticleClick when card is clicked", () => {
    const article = makeArticle();
    const onArticleClick = vi.fn();
    renderCardView(
      container,
      [article],
      {
        ...baseViewContext({ callbacks: { onArticleClick } }),
        showCardToolbar: false,
      },
      baseViewDeps(),
    );

    container.querySelector(".rss-dashboard-article-card")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    expect(onArticleClick).toHaveBeenCalledWith(article);
  });
});
