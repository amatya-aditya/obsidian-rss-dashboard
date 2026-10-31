import { afterEach, describe, expect, it, vi } from "vitest";
import { renderCardView } from "../../../../../src/components/article-list/views/card-view";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

describe("renderCardView characterization", () => {
  afterEach(() => {
    document.body.empty();
    vi.clearAllMocks();
  });

  it("renders cards in article order with their current identity, state, and accessible opener", () => {
    const container = document.body.createDiv();
    const first = makeArticle({
      guid: "podcast-guid",
      title: "Podcast episode",
      mediaType: "podcast",
      read: true,
      starred: true,
      saved: true,
      tags: [{ name: "Listen later", color: "#336699" }],
    });
    const second = makeArticle({
      guid: "video-guid",
      title: "Video episode",
      mediaType: "video",
      feedTitle: "Video Feed",
      feedUrl: "https://video.example.com/feed",
    });
    const deps = baseViewDeps();

    renderCardView(
      container,
      [first, second],
      {
        ...baseViewContext({ selectedArticle: first }),
        showCardToolbar: true,
      },
      deps,
    );

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>(".rss-dashboard-article-card"),
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].className).toBe(
      "rss-dashboard-article-card rss-dashboard-article-card--has-tags active read starred saved rss-dashboard-podcast-article",
    );
    expect(cards[0].id).toBe("article-podcast-guid");
    expect(cards[0].dataset.articleGuid).toBe("podcast-guid");
    expect(cards[0].dataset.feedUrl).toBe(first.feedUrl);
    expect(
      cards[0].querySelector(".rss-dashboard-article-title")?.textContent,
    ).toBe("Podcast episode");
    expect(
      cards[0]
        .querySelector(".rss-dashboard-card-open-button")
        ?.getAttribute("aria-label"),
    ).toBe("Open article: Podcast episode. Feed: Test Feed");
    expect(cards[0].querySelector(".rss-dashboard-card-footer")).not.toBeNull();

    expect(cards[1].className).toBe(
      "rss-dashboard-article-card unread unstarred rss-dashboard-youtube-article",
    );
    expect(cards[1].id).toBe("article-video-guid");
    expect(
      cards[1]
        .querySelector(".rss-dashboard-article-feed")
        ?.getAttribute("aria-label"),
    ).toBe("Feed: Video Feed");
    expect(deps.createArticleActionButtons).toHaveBeenCalledTimes(2);
    expect(deps.scheduleCardTagLayout).toHaveBeenCalledTimes(2);
  });

  it("retries a cached cover remotely, then replaces a failed image with the summary", () => {
    const container = document.body.createDiv();
    const remoteUrl = "https://example.com/cover.jpg";
    const ctx = baseViewContext();
    ctx.settings.display.allowImageCaching = true;
    ctx.resolveCachedImageUrl = () => "app://cache/cover.jpg";
    const deps = baseViewDeps();

    renderCardView(
      container,
      [makeArticle({ coverImage: remoteUrl })],
      { ...ctx, showCardToolbar: false },
      deps,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      ".rss-dashboard-card-open-button",
    )!;
    const image = container.querySelector<HTMLImageElement>(
      ".rss-dashboard-cover-image",
    )!;
    const descriptionId = opener.getAttribute("aria-describedby");
    expect(image.getAttribute("src")).toBe("app://cache/cover.jpg");

    image.dispatchEvent(new Event("error"));
    expect(image.getAttribute("src")).toBe(remoteUrl);
    expect(
      container.querySelector(".rss-dashboard-summary-overlay"),
    ).not.toBeNull();

    image.dispatchEvent(new Event("error"));
    expect(container.querySelector(".rss-dashboard-cover-image")).toBeNull();
    const summary = container.querySelector<HTMLElement>(
      ".rss-dashboard-cover-summary-only",
    )!;
    expect(summary.textContent).toBe("Article description text");
    expect(summary.id).toBe(descriptionId);
    expect(deps.scheduleCardTagLayout).toHaveBeenCalledTimes(2);
  });

  it("keeps Enter local to the title and opens only through the primary button", () => {
    const container = document.body.createDiv();
    const article = makeArticle();
    const onArticleClick = vi.fn();
    const bubbledKeys: string[] = [];
    container.addEventListener("keydown", (event) => {
      bubbledKeys.push(event.key);
    });

    renderCardView(
      container,
      [article],
      {
        ...baseViewContext({ callbacks: { onArticleClick } }),
        showCardToolbar: false,
      },
      baseViewDeps(),
    );

    const title = container.querySelector<HTMLElement>(
      ".rss-dashboard-article-title",
    )!;
    title.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(bubbledKeys).toEqual([]);
    expect(onArticleClick).not.toHaveBeenCalled();

    container
      .querySelector<HTMLButtonElement>(".rss-dashboard-card-open-button")!
      .click();
    expect(onArticleClick).toHaveBeenCalledExactlyOnceWith(article);
  });
});
