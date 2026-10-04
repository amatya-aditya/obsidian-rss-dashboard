import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderCardView } from "../../../../../src/components/article-list/views/card-view";
import type { BaseViewContext } from "../../../../../src/components/article-list/views/view-types";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

describe("card-view", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createDiv();
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

  it("orders keyboard stops as card opener, text, toolbar actions, then the next card", () => {
    const toolbarActions = [
      "Mark as read",
      "Save article",
      "Star article",
      "Manage tags",
    ];
    const createArticleActionButtons = (toolbar: HTMLElement) => {
      toolbarActions.forEach((label) => {
        toolbar.createEl("button", {
          text: label,
          attr: { "aria-label": label },
        });
      });
    };
    const ctx = baseViewContext();
    const firstArticle = makeArticle({
      coverImage: "https://example.com/cover.jpg",
    });
    const secondArticle = makeArticle({
      guid: "second-article-guid",
      title: "Second Article",
    });

    renderCardView(
      container,
      [firstArticle, secondArticle],
      { ...ctx, showCardToolbar: true },
      baseViewDeps({ createArticleActionButtons }),
    );

    const firstCard = container.querySelector<HTMLElement>(
      ".rss-dashboard-article-card",
    )!;
    const firstStops = Array.from(
      firstCard.querySelectorAll<HTMLElement>('button, [tabindex="0"]'),
    );
    const allStops = Array.from(
      container.querySelectorAll<HTMLElement>('button, [tabindex="0"]'),
    );
    const secondOpener = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-article-card",
    )[1].querySelector<HTMLElement>(".rss-dashboard-card-open-button");

    expect(
      firstStops.map((stop) =>
        stop.classList.contains("rss-dashboard-card-open-button")
          ? "open"
          : stop.classList.contains("rss-dashboard-article-title")
            ? "title"
            : stop.classList.contains("rss-dashboard-article-feed")
              ? "feed"
              : stop.matches(
                    ".rss-dashboard-summary-overlay, .rss-dashboard-cover-summary-only",
                  )
                ? "description"
                : stop.getAttribute("aria-label"),
      ),
    ).toEqual([
      "open",
      "title",
      "feed",
      "description",
      ...toolbarActions,
    ]);
    const lastFirstCardStop = firstStops[firstStops.length - 1];
    expect(allStops[allStops.indexOf(lastFirstCardStop) + 1]).toBe(secondOpener);
    expect(firstStops[0].getAttribute("aria-label")).toContain(firstArticle.title);
    expect(firstStops[0].getAttribute("aria-label")).toContain(firstArticle.feedTitle);
    expect(firstStops[0].getAttribute("aria-describedby")).toBeTruthy();
    expect(firstStops[1].getAttribute("role")).toBe("heading");
    expect(firstStops[1].getAttribute("aria-level")).toBe("3");
  });

  it("opens a card from its primary button but not from its text stops", () => {
    const article = makeArticle();
    const onArticleClick = vi.fn();
    renderCardView(
      container,
      [article],
      {
        ...baseViewContext({
          callbacks: { onArticleClick },
        }),
        showCardToolbar: false,
      },
      baseViewDeps(),
    );

    const card = container.querySelector<HTMLElement>(".rss-dashboard-article-card")!;
    const openButton = card.querySelector<HTMLButtonElement>(
      ".rss-dashboard-card-open-button",
    )!;
    const globalEnterForButton = vi.fn();
    document.addEventListener("keydown", globalEnterForButton);
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    openButton.dispatchEvent(enterEvent);
    expect(globalEnterForButton).not.toHaveBeenCalled();
    expect(enterEvent.defaultPrevented).toBe(false);
    document.removeEventListener("keydown", globalEnterForButton);

    openButton.click();
    expect(onArticleClick).toHaveBeenCalledTimes(1);
    expect(onArticleClick).toHaveBeenCalledWith(article);

    onArticleClick.mockClear();
    const textStops = card.querySelectorAll<HTMLElement>(
      ".rss-dashboard-article-title, .rss-dashboard-article-feed, .rss-dashboard-summary-overlay, .rss-dashboard-cover-summary-only",
    );
    const globalEnterFromText = vi.fn();
    document.addEventListener("keydown", globalEnterFromText);
    textStops.forEach((stop) => {
      stop.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    document.removeEventListener("keydown", globalEnterFromText);
    expect(globalEnterFromText).not.toHaveBeenCalled();
    expect(onArticleClick).not.toHaveBeenCalled();
  });

  it("schedules math rendering for a card title while preserving its source", () => {
    const scheduleMathRendering = vi.fn();
    const rawTitle = String.raw`Direct product of $\mathrm{SL}_n$`;
    renderCardView(
      container,
      [makeArticle({ title: rawTitle })],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps({ scheduleMathRendering }),
    );

    const title = container.querySelector<HTMLElement>(
      ".rss-dashboard-article-title",
    );
    expect(scheduleMathRendering).toHaveBeenCalledWith(title);
    expect(title?.dataset.articleTitle).toBe(rawTitle);
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

  it("shows the first-seen date in the card footer when pubDate is empty and the fallback setting is on", () => {
    const firstSeenMs = Date.parse("2026-01-01T00:00:00Z");
    const ctx = baseViewContext();
    ctx.settings.useFirstSeenDateFallback = true;
    renderCardView(
      container,
      [makeArticle({ pubDate: "", firstSeenMs })],
      {
        ...ctx,
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    const dateEl = container.querySelector(".rss-dashboard-article-date");
    expect(dateEl?.textContent).not.toMatch(/Invalid date/i);
    expect(dateEl?.textContent).toMatch(/\*$/);
    expect(dateEl?.getAttribute("aria-label")).toContain("First seen:");
  });

  it("shows 'Unknown date', not the first-seen date, in the card footer when pubDate is empty and the fallback setting is off", () => {
    const firstSeenMs = Date.parse("2026-01-01T00:00:00Z");
    renderCardView(
      container,
      [makeArticle({ pubDate: "", firstSeenMs })],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    const dateEl = container.querySelector(".rss-dashboard-article-date");
    expect(dateEl?.textContent).not.toMatch(/Invalid date/i);
    expect(dateEl?.textContent).toBe("Unknown date");
    expect(dateEl?.textContent).not.toMatch(/\*$/);
    expect(dateEl?.getAttribute("aria-label")).not.toContain("First seen:");
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

  it("uses a cached preview URL only when image caching is enabled", () => {
    const resolveCachedImageUrl = vi.fn(() => "app://local/cache/cover.jpg");
    renderCardView(
      container,
      [makeArticle({ coverImage: "https://example.com/cover.jpg" })],
      {
        ...baseViewContext(),
        settings: {
          ...baseViewContext().settings,
          display: {
            ...baseViewContext().settings.display,
            allowImageCaching: true,
          },
        },
        resolveCachedImageUrl,
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    expect(resolveCachedImageUrl).toHaveBeenCalledWith("https://example.com/cover.jpg");
    expect(
      container.querySelector(".rss-dashboard-cover-image")?.getAttribute("src"),
    ).toBe("app://local/cache/cover.jpg");
  });

  it("retries the remote preview URL when a cached Card image fails", () => {
    renderCardView(
      container,
      [makeArticle({ coverImage: "https://example.com/cover.jpg" })],
      {
        ...baseViewContext(),
        settings: {
          ...baseViewContext().settings,
          display: {
            ...baseViewContext().settings.display,
            allowImageCaching: true,
          },
        },
        resolveCachedImageUrl: () => "app://local/cache/cover.jpg",
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    const image = container.querySelector(".rss-dashboard-cover-image") as HTMLImageElement;
    image.dispatchEvent(new Event("error"));

    expect(image.getAttribute("src")).toBe("https://example.com/cover.jpg");
  });

  it.each([
    { showCoverImage: true, showSummary: true, image: true, summary: true },
    { showCoverImage: true, showSummary: false, image: true, summary: false },
    { showCoverImage: false, showSummary: true, image: false, summary: true },
    { showCoverImage: false, showSummary: false, image: false, summary: false },
  ])(
    "renders Card View previews independently when cover images are $showCoverImage and summaries are $showSummary",
    ({ showCoverImage, showSummary, image, summary }) => {
      renderCardView(
        container,
        [makeArticle({ coverImage: "https://example.com/cover.jpg" })],
        {
          ...baseViewContext(),
          settings: {
            highlights: {
              highlightInTitles: false,
              highlightInSummaries: false,
            },
            display: { showCoverImage, showSummary, articleDateStyle: "relative" },
          } as BaseViewContext["settings"],
          showCardToolbar: true,
        },
        baseViewDeps(),
      );

      expect(!!container.querySelector(".rss-dashboard-cover-image")).toBe(image);
      expect(
        !!container.querySelector(
          ".rss-dashboard-summary-overlay, .rss-dashboard-cover-summary-only",
        ),
      ).toBe(summary);
      expect(!!container.querySelector(".rss-dashboard-card-preview-region")).toBe(
        image || summary,
      );
    },
  );

  it("renders summary-only preview when no image is available", () => {
    renderCardView(
      container,
      [
        makeArticle({
          coverImage: "",
          fallbackIconUrl: "https://example.com/logo.png",
        }),
      ],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    expect(container.querySelector(".rss-dashboard-cover-image")).toBeFalsy();
    expect(
      container.querySelector(".rss-dashboard-cover-summary-only")?.textContent,
    ).toBe("Article description text");
  });

  it("renders summary-only preview when stale cover media is a LaTeX formula", () => {
    renderCardView(
      container,
      [
        makeArticle({
          coverImage:
            "https://s0.wp.com/latex.php?latex=%7Bx%7D&bg=ffffff",
          content:
            '<p>Formula <img class="latex" src="https://s0.wp.com/latex.php?latex=%7Bx%7D&amp;bg=ffffff" /></p>',
        }),
      ],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    expect(container.querySelector(".rss-dashboard-cover-image")).toBeFalsy();
    expect(
      container.querySelector(".rss-dashboard-cover-summary-only")?.textContent,
    ).toBe("Article description text");
  });

  it("uses a valid stored image when the preferred cover is a stale formula", () => {
    renderCardView(
      container,
      [
        makeArticle({
          coverImage:
            "https://s0.wp.com/latex.php?latex=%7Bx%7D&bg=ffffff",
          image: "https://example.com/article-photo.jpg",
          content: "",
        }),
      ],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    expect(
      container
        .querySelector(".rss-dashboard-cover-image")
        ?.getAttribute("src"),
    ).toBe("https://example.com/article-photo.jpg");
  });

  it("renders summary-only preview when a cover image fails", () => {
    renderCardView(
      container,
      [makeArticle({ coverImage: "https://example.com/broken.jpg" })],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    const image = container.querySelector(
      "img.rss-dashboard-cover-image",
    ) as HTMLImageElement;
    image.dispatchEvent(new Event("error"));

    expect(container.querySelector(".rss-dashboard-cover-image")).toBeFalsy();
    expect(
      container.querySelector(".rss-dashboard-cover-summary-only")?.textContent,
    ).toBe("Article description text");
  });

  it("does not render a summary fallback after an image error when summaries are disabled", () => {
    renderCardView(
      container,
      [makeArticle({ coverImage: "https://example.com/broken.jpg" })],
      {
        ...baseViewContext(),
        settings: {
          highlights: {
            highlightInTitles: false,
            highlightInSummaries: false,
          },
          display: { showCoverImage: true, showSummary: false, articleDateStyle: "relative" },
        } as BaseViewContext["settings"],
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    const image = container.querySelector(
      "img.rss-dashboard-cover-image",
    ) as HTMLImageElement;
    image.dispatchEvent(new Event("error"));

    expect(container.querySelector(".rss-dashboard-card-preview-region")).toBeFalsy();
    expect(container.querySelector(".rss-dashboard-cover-summary-only")).toBeFalsy();
  });

  it("omits preview region when no image or summary text is available", () => {
    renderCardView(
      container,
      [
        makeArticle({
          coverImage: "",
          content: "",
          description: "",
          fallbackIconUrl: "https://example.com/logo.png",
          summary: "",
        }),
      ],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    expect(
      container.querySelector(".rss-dashboard-card-preview-region"),
    ).toBeFalsy();
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

  it("shows summary-only when content contains only a tracking pixel image", () => {
    renderCardView(
      container,
      [
        makeArticle({
          coverImage: "",
          content: "<img src='https://media.npr.org/include/images/tracking/npr-rss-pixel.png?story=123' />",
          description: "U.S. launches a second-round of strikes against Iran.",
        }),
      ],
      {
        ...baseViewContext(),
        showCardToolbar: true,
      },
      baseViewDeps(),
    );

    expect(container.querySelector(".rss-dashboard-cover-image")).toBeFalsy();
    expect(
      container.querySelector(".rss-dashboard-cover-summary-only")?.textContent,
    ).toBe("U.S. launches a second-round of strikes against Iran.");
  });
});
