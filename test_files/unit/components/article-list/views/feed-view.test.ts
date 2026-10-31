import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderFeedView } from "../../../../../src/components/article-list/views/feed-view";
import type { BaseViewContext } from "../../../../../src/components/article-list/views/view-types";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

describe("feed-view", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createDiv();
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
    expect(
      item?.querySelector(".rss-dashboard-article-title")?.textContent,
    ).toBe("Test Article");
    expect(item?.querySelector(".rss-dashboard-feed-footer")).toBeTruthy();
  });

  it("renders feed tags from the registry when article copies are stale", () => {
    const context = baseViewContext();
    context.tagAppearanceSettings = {
      availableTags: [
        { name: "Topic", color: "#234567", textColor: "#765432" },
      ],
    };
    renderFeedView(
      container,
      [
        makeArticle({
          tags: [{ name: "Topic", color: "#stale", textColor: "#stale" }],
        }),
      ],
      context,
      baseViewDeps(),
    );

    const chip = container.querySelector<HTMLElement>(
      ".rss-dashboard-feed-tags-region .rss-dashboard-tag-badge",
    );
    expect(chip?.style.getPropertyValue("--tag-color")).toBe("#234567");
    expect(chip?.style.getPropertyValue("--tag-text-color")).toBe("#765432");
  });

  it("shows the first-seen date in the feed footer when pubDate is empty and the fallback setting is on", () => {
    const firstSeenMs = Date.parse("2026-01-01T00:00:00Z");
    const ctx = baseViewContext();
    ctx.settings.useFirstSeenDateFallback = true;
    renderFeedView(
      container,
      [makeArticle({ pubDate: "", firstSeenMs })],
      ctx,
      baseViewDeps(),
    );

    const dateEl = container.querySelector(".rss-dashboard-article-date");
    expect(dateEl?.textContent).not.toMatch(/Invalid date/i);
    expect(dateEl?.textContent).toMatch(/\*$/);
    expect(dateEl?.getAttribute("aria-label")).toContain("First seen:");
  });

  it("shows 'Unknown date', not the first-seen date, in the feed footer when pubDate is empty and the fallback setting is off", () => {
    const firstSeenMs = Date.parse("2026-01-01T00:00:00Z");
    renderFeedView(
      container,
      [makeArticle({ pubDate: "", firstSeenMs })],
      baseViewContext(),
      baseViewDeps(),
    );

    const dateEl = container.querySelector(".rss-dashboard-article-date");
    expect(dateEl?.textContent).toBe("Unknown date");
    expect(dateEl?.textContent).not.toMatch(/\*$/);
    expect(dateEl?.getAttribute("aria-label")).not.toContain("First seen:");
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

    expect(
      container.querySelector(".rss-dashboard-feed-item.active"),
    ).toBeTruthy();
  });

  it("selects only the matching feed when articles share a guid", () => {
    const selectedArticle = makeArticle({
      guid: "shared-guid",
      feedUrl: "https://selected.example/feed.xml",
    });
    const otherFeedArticle = makeArticle({
      guid: "shared-guid",
      feedUrl: "https://other.example/feed.xml",
    });

    renderFeedView(
      container,
      [selectedArticle, otherFeedArticle],
      baseViewContext({ selectedArticle }),
      baseViewDeps(),
    );

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(".rss-dashboard-feed-item"),
    );
    expect(
      rows
        .find((row) => row.dataset.feedUrl === selectedArticle.feedUrl)
        ?.classList.contains("active"),
    ).toBe(true);
    expect(
      rows
        .find((row) => row.dataset.feedUrl === otherFeedArticle.feedUrl)
        ?.classList.contains("active"),
    ).toBe(false);
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

  it("shows the stored cover in the hero when it differs from the feed's image (#1330)", () => {
    renderFeedView(
      container,
      [
        makeArticle({
          coverImage: "https://example.com/fetched-page-cover.jpg",
          image: "https://example.com/feed-image.jpg",
        }),
      ],
      baseViewContext(),
      baseViewDeps(),
    );

    expect(
      container
        .querySelector(".rss-dashboard-feed-hero-image")
        ?.getAttribute("src"),
    ).toBe("https://example.com/fetched-page-cover.jpg");
  });

  it("falls back to the feed's image in the hero when the stored cover is empty", () => {
    renderFeedView(
      container,
      [
        makeArticle({
          coverImage: "",
          image: "https://example.com/feed-image.jpg",
        }),
      ],
      baseViewContext(),
      baseViewDeps(),
    );

    expect(
      container
        .querySelector(".rss-dashboard-feed-hero-image")
        ?.getAttribute("src"),
    ).toBe("https://example.com/feed-image.jpg");
  });

  it("uses one cached preview URL for the Feed image and blur", () => {
    const resolveCachedImageUrl = vi.fn(() => "app://local/cache/cover.jpg");
    renderFeedView(
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
      },
      baseViewDeps(),
    );

    expect(resolveCachedImageUrl).toHaveBeenCalledWith(
      "https://example.com/cover.jpg",
    );
    expect(
      container
        .querySelector(".rss-dashboard-feed-hero-image")
        ?.getAttribute("src"),
    ).toBe("app://local/cache/cover.jpg");
    expect(
      container
        .querySelector(".rss-dashboard-feed-hero-blur")
        ?.getAttribute("style"),
    ).toContain("app://local/cache/cover.jpg");
  });

  it("retries the remote preview URL when a cached Feed image fails", () => {
    renderFeedView(
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
      },
      baseViewDeps(),
    );

    const image = container.querySelector(
      ".rss-dashboard-feed-hero-image",
    ) as HTMLImageElement;
    image.dispatchEvent(new Event("error"));

    expect(image.getAttribute("src")).toBe("https://example.com/cover.jpg");
    expect(
      container
        .querySelector(".rss-dashboard-feed-hero-blur")
        ?.getAttribute("style"),
    ).toContain("https://example.com/cover.jpg");
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
            display: {
              showCoverImage,
              showSummary,
              articleDateStyle: "relative",
            },
          } as unknown as BaseViewContext["settings"],
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
    const formulaUrl = "https://s0.wp.com/latex.php?latex=%7Bx%7D&bg=ffffff";
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

  it("does not render a hero when the only content image is a 1 by 1 counter", () => {
    renderFeedView(
      container,
      [
        makeArticle({
          image: "",
          coverImage: "",
          content:
            '<img src="https://counter.example.com/content/123456/count.gif" width="1" height="1">',
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

    container
      .querySelector(".rss-dashboard-feed-item")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onArticleClick).toHaveBeenCalledWith(article);
  });

  it("renders flat cards without feed headers when grouping by date", () => {
    renderFeedView(
      container,
      [
        makeArticle({ title: "Article 1", feedTitle: "Feed A" }),
        makeArticle({ title: "Article 2", feedTitle: "Feed B" }),
      ],
      baseViewContext({
        settings: {
          ...baseViewContext().settings,
          articleGroupBy: "date",
        },
      }),
      baseViewDeps(),
    );

    expect(container.querySelectorAll(".rss-dashboard-feed-item").length).toBe(
      2,
    );
    expect(container.querySelector(".rss-dashboard-feed-section")).toBeFalsy();
    expect(
      container.querySelector(".rss-dashboard-feed-section-header"),
    ).toBeFalsy();
  });

  it("renders flat cards without feed headers when grouping by folder", () => {
    renderFeedView(
      container,
      [
        makeArticle({ title: "Article 1", feedTitle: "Feed A" }),
        makeArticle({ title: "Article 2", feedTitle: "Feed B" }),
      ],
      baseViewContext({
        settings: {
          ...baseViewContext().settings,
          articleGroupBy: "folder",
        },
      }),
      baseViewDeps(),
    );

    expect(container.querySelectorAll(".rss-dashboard-feed-item").length).toBe(
      2,
    );
    expect(container.querySelector(".rss-dashboard-feed-section")).toBeFalsy();
    expect(
      container.querySelector(".rss-dashboard-feed-section-header"),
    ).toBeFalsy();
  });

  it("renders nested feed headers when grouping by date_feed", () => {
    renderFeedView(
      container,
      [
        makeArticle({ title: "Article 1", feedTitle: "Feed A" }),
        makeArticle({ title: "Article 2", feedTitle: "Feed B" }),
      ],
      baseViewContext({
        settings: {
          ...baseViewContext().settings,
          articleGroupBy: "date_feed",
        },
      }),
      baseViewDeps(),
    );

    expect(
      container.querySelectorAll(".rss-dashboard-feed-section").length,
    ).toBe(2);
    expect(
      container.querySelectorAll(".rss-dashboard-feed-section-header").length,
    ).toBe(2);
  });

  it("renders nested feed headers when grouping by folder_feed", () => {
    renderFeedView(
      container,
      [
        makeArticle({ title: "Article 1", feedTitle: "Feed A" }),
        makeArticle({ title: "Article 2", feedTitle: "Feed B" }),
      ],
      baseViewContext({
        settings: {
          ...baseViewContext().settings,
          articleGroupBy: "folder_feed",
        },
      }),
      baseViewDeps(),
    );

    expect(
      container.querySelectorAll(".rss-dashboard-feed-section").length,
    ).toBe(2);
    expect(
      container.querySelectorAll(".rss-dashboard-feed-section-header").length,
    ).toBe(2);
  });

  it("renders a feed icon in each section header when grouping by feed", () => {
    const deps = baseViewDeps();
    renderFeedView(
      container,
      [
        makeArticle({
          title: "Article 1",
          feedTitle: "Feed A",
          feedUrl: "https://a.example.com/rss",
        }),
        makeArticle({
          title: "Article 2",
          feedTitle: "Feed B",
          feedUrl: "https://b.example.com/rss",
        }),
      ],
      baseViewContext({
        settings: {
          ...baseViewContext().settings,
          articleGroupBy: "feed",
        },
      }),
      deps,
    );

    // One icon per section header (2) + one per article card meta (2, showFeedSource is true by default)
    expect(
      container.querySelectorAll(".rss-dashboard-feed-section-icon").length,
    ).toBe(2);
    expect(deps.renderFeedIcon).toHaveBeenCalledTimes(4);
  });

  describe("cover image affordance (#1314)", () => {
    function fetchButton(): HTMLButtonElement | null {
      return container.querySelector<HTMLButtonElement>(
        ".rss-dashboard-fetch-cover-button",
      );
    }

    function renderWith(
      overrides: {
        article?: Parameters<typeof makeArticle>[0];
        deps?: Parameters<typeof baseViewDeps>[0];
      } = {},
    ) {
      renderFeedView(
        container,
        [makeArticle(overrides.article)],
        baseViewContext(),
        baseViewDeps({ fetchCoverImage: vi.fn(), ...overrides.deps }),
      );
    }

    it("puts the control at the end of the item's tag row, after the chips", () => {
      renderWith({
        article: {
          tags: [
            { name: "tech", color: "#ff0000" },
            { name: "news", color: "#00ff00" },
          ],
        },
      });

      const region = container.querySelector<HTMLElement>(
        ".rss-dashboard-feed-tags-region",
      );
      const button = fetchButton();

      // Beside the tag container, never inside it: the layout pass empties and
      // re-measures the container, and the `+n` count would count the control.
      expect(button?.parentElement).toBe(region);
      expect(region?.lastElementChild).toBe(button);
      expect(
        region?.querySelector(".rss-dashboard-tag-container")
          ?.nextElementSibling,
      ).toBe(button);
    });

    it("renders the tag row for an untagged item when the control lives in it", () => {
      renderWith({ article: { tags: [] } });

      const region = container.querySelector<HTMLElement>(
        ".rss-dashboard-feed-tags-region",
      );
      expect(region).not.toBeNull();
      expect(
        region?.querySelector(".rss-dashboard-tag-container")?.children.length,
      ).toBe(0);
      expect(fetchButton()?.parentElement).toBe(region);
    });

    it("renders no tag row when it would hold nothing", () => {
      renderFeedView(
        container,
        [makeArticle()],
        baseViewContext(),
        baseViewDeps(),
      );

      expect(
        container.querySelector(".rss-dashboard-feed-tags-region"),
      ).toBeNull();
    });

    describe("restore states (#1330)", () => {
      const FETCHED_COVER = "https://page.example.com/hero.jpg";
      const FEED_COVER = "https://img.example.com/feed.jpg";

      function fetchedArticle(
        overrides: Parameters<typeof makeArticle>[0] = {},
      ) {
        return makeArticle({
          coverImage: FETCHED_COVER,
          coverImageFromPage: true,
          content: `<p><img src="${FEED_COVER}"></p>`,
          ...overrides,
        });
      }

      it("offers the restore, with the restore icon, in the item's tag row", () => {
        renderWith({
          article: fetchedArticle(),
          deps: { restoreCoverImage: vi.fn() },
        });

        const button = fetchButton();
        expect(button?.getAttribute("aria-label")).toBe(
          "Restore cover image from feed (Shift + c)",
        );
        expect(button?.querySelector("svg.lucide-rotate-ccw")).not.toBeNull();
        expect(fetchButton()?.parentElement).toBe(
          container.querySelector(".rss-dashboard-feed-tags-region"),
        );
      });

      it("offers the removal when the feed supplies no image", () => {
        renderWith({
          article: fetchedArticle({ content: "", description: "" }),
          deps: { restoreCoverImage: vi.fn() },
        });

        expect(fetchButton()?.getAttribute("aria-label")).toBe(
          "Remove fetched cover image (Shift + c)",
        );
      });

      it("runs the restore on activation and rebuilds the item, fetching nothing", async () => {
        const restoreCoverImage = vi.fn().mockResolvedValue(true);
        const fetchCoverImage = vi.fn().mockResolvedValue(true);
        const replaceArticle = vi.fn();
        const onArticleClick = vi.fn();
        renderFeedView(
          container,
          [fetchedArticle()],
          baseViewContext({ callbacks: { onArticleClick } }),
          baseViewDeps({ restoreCoverImage, fetchCoverImage, replaceArticle }),
        );

        fetchButton()?.click();

        await vi.waitFor(() => expect(replaceArticle).toHaveBeenCalledTimes(1));
        expect(restoreCoverImage).toHaveBeenCalledTimes(1);
        expect(fetchCoverImage).not.toHaveBeenCalled();
        expect(onArticleClick).not.toHaveBeenCalled();
      });

      it("ignores an item click that began on the cover control", () => {
        const onArticleClick = vi.fn();
        const fetchCoverImage = vi.fn().mockResolvedValue(false);
        renderFeedView(
          container,
          [fetchedArticle()],
          baseViewContext({ callbacks: { onArticleClick } }),
          baseViewDeps({ restoreCoverImage: vi.fn(), fetchCoverImage }),
        );
        const item = container.querySelector<HTMLElement>(
          ".rss-dashboard-feed-item",
        )!;

        // A tap that starts on the control and drifts before release is
        // dispatched at the nearest common ancestor, so the item sees it.
        fetchButton()!.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true }),
        );
        item.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(onArticleClick).not.toHaveBeenCalled();
        expect(fetchCoverImage).not.toHaveBeenCalled();

        // The press is spent: the next plain item click opens it again.
        item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(onArticleClick).toHaveBeenCalledTimes(1);
      });

      it("offers nothing, not a fetch, when the dashboard supplies no restore", () => {
        // The role follows the state (AC-007), so a surface that cannot restore
        // shows no control for a fetched cover rather than a fetch it could not
        // undo.
        renderFeedView(
          container,
          [fetchedArticle()],
          baseViewContext(),
          baseViewDeps({ fetchCoverImage: vi.fn() }),
        );

        expect(fetchButton()).toBeNull();
      });
    });
  });
});
