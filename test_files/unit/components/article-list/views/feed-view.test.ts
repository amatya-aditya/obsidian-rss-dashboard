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

  it("schedules math rendering for a feed title while preserving its source", () => {
    const scheduleMathRendering = vi.fn();
    const rawTitle = String.raw`Direct product of $\mathrm{GL}_n$`;
    renderFeedView(
      container,
      [makeArticle({ title: rawTitle })],
      baseViewContext(),
      baseViewDeps({ scheduleMathRendering }),
    );

    const title = container.querySelector<HTMLElement>(
      ".rss-dashboard-article-title",
    );
    expect(scheduleMathRendering).toHaveBeenCalledWith(title);
    expect(title?.dataset.articleTitle).toBe(rawTitle);
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

  it.each([
    { showCoverImage: true, showSummary: true, image: true, summary: true },
    { showCoverImage: true, showSummary: false, image: true, summary: false },
    { showCoverImage: false, showSummary: true, image: false, summary: true },
    { showCoverImage: false, showSummary: false, image: false, summary: false },
  ])(
    "renders Feed View previews independently when cover images are $showCoverImage and summaries are $showSummary",
    ({ showCoverImage, showSummary, image, summary }) => {
      renderFeedView(
        container,
        [makeArticle({ coverImage: "https://example.com/cover.jpg" })],
        baseViewContext({
          settings: {
            highlights: {
              highlightInTitles: false,
              highlightInSummaries: false,
            },
            display: { showCoverImage, showSummary, articleDateStyle: "relative" },
          },
        }),
        baseViewDeps(),
      );

      expect(!!container.querySelector(".rss-dashboard-feed-hero-image")).toBe(
        image,
      );
      expect(!!container.querySelector(".rss-dashboard-feed-hero-blur")).toBe(
        image,
      );
      expect(!!container.querySelector(".rss-dashboard-feed-summary")).toBe(
        summary,
      );
    },
  );

  it("does not render a hero when stale article media is a LaTeX formula", () => {
    const formulaUrl =
      "https://s0.wp.com/latex.php?latex=%7Bx%7D&bg=ffffff";
    renderFeedView(
      container,
      [
        makeArticle({
          image: formulaUrl,
          coverImage: formulaUrl,
          content: `<p><img class="latex" src="${formulaUrl}" /></p>`,
        }),
      ],
      baseViewContext(),
      baseViewDeps(),
    );

    expect(
      container.querySelector(".rss-dashboard-feed-hero-image"),
    ).toBeFalsy();
    expect(container.querySelector(".rss-dashboard-feed-summary")).toBeTruthy();
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
