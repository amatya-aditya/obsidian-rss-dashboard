// The dashboard-level wiring of the cover-image action (#1314, #1330): which
// surfaces offer it, which role each state runs, and the busy state the
// context-menu path shows while a page request runs.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu } from "obsidian";
import { buildArticle, createArticleListHarness } from "./article-list-harness";
import type { RssDashboardSettings } from "../../../src/types/types";

const COVER_FETCH_TITLE = "Fetch and replace cover image";
const COVER_REPLACE_TITLE = "Replace cover image from the fetch";
const COVER_RESTORE_TITLE = "Restore cover image from feed";
const COVER_FETCH_BUTTON = ".rss-dashboard-fetch-cover-button";
const FETCHING_CLASS = "rss-dashboard-cover-fetching";
const PAGE_IMAGE = "https://page.example.com/hero.jpg";
const FEED_IMAGE = "https://img.example.com/feed.jpg";

function titles(): string[] {
  return Menu.lastItems.map((item) => item.title);
}

function rightClick(element: HTMLElement | null | undefined): void {
  element?.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
}

function settingsWith(
  overrides: Partial<RssDashboardSettings> = {},
): Partial<RssDashboardSettings> {
  return {
    articleGroupBy: "none",
    articleSort: "newest",
    ...overrides,
  } as Partial<RssDashboardSettings>;
}

describe("cover-image action on the article list (#1314)", () => {
  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("offers the fetch in the card's context menu", () => {
    const h = createArticleListHarness({
      settings: settingsWith({ viewStyle: "card" }),
      callbacks: { onFetchCoverImage: vi.fn(async () => true) },
      articles: [buildArticle({ guid: "1" })],
    });
    h.list.render();

    rightClick(h.getArticleEl("1"));

    expect(titles()).toContain(COVER_FETCH_TITLE);
    h.cleanup();
  });

  it("offers to replace the cover an item already has", () => {
    const h = createArticleListHarness({
      settings: settingsWith({ viewStyle: "card" }),
      callbacks: { onFetchCoverImage: vi.fn(async () => true) },
      articles: [
        buildArticle({
          guid: "1",
          coverImage: "https://cdn.example.com/x.jpg",
        }),
      ],
    });
    h.list.render();

    rightClick(h.getArticleEl("1"));

    expect(titles()).toContain(COVER_REPLACE_TITLE);
    expect(titles()).not.toContain(COVER_FETCH_TITLE);
    h.cleanup();
  });

  it("omits the action in the list view, which renders no cover", () => {
    const h = createArticleListHarness({
      settings: settingsWith({ viewStyle: "list" }),
      callbacks: { onFetchCoverImage: vi.fn(async () => true) },
      articles: [buildArticle({ guid: "1" })],
    });
    h.list.render();

    rightClick(h.getArticleEl("1"));

    expect(titles()).not.toContain(COVER_FETCH_TITLE);
    h.cleanup();
  });

  it("omits the action while cover images are hidden", () => {
    const h = createArticleListHarness({
      settings: settingsWith({
        viewStyle: "card",
        display: {
          showCoverImage: false,
        } as unknown as RssDashboardSettings["display"],
      }),
      callbacks: { onFetchCoverImage: vi.fn(async () => true) },
      articles: [buildArticle({ guid: "1" })],
    });
    h.list.render();

    rightClick(h.getArticleEl("1"));

    expect(titles()).not.toContain(COVER_FETCH_TITLE);
    expect(h.getArticleEl("1")?.querySelector(COVER_FETCH_BUTTON)).toBeNull();
    h.cleanup();
  });

  it("omits the action for an item whose link is not an http(s) page address", () => {
    const h = createArticleListHarness({
      settings: settingsWith({ viewStyle: "card" }),
      callbacks: { onFetchCoverImage: vi.fn(async () => true) },
      articles: [
        buildArticle({ guid: "1", link: "mailto:someone@example.com" }),
      ],
    });
    h.list.render();

    rightClick(h.getArticleEl("1"));

    expect(titles()).not.toContain(COVER_FETCH_TITLE);
    expect(h.getArticleEl("1")?.querySelector(COVER_FETCH_BUTTON)).toBeNull();
    h.cleanup();
  });

  it("keeps the card's control when the last tag is removed from it", () => {
    const h = createArticleListHarness({
      settings: settingsWith({ viewStyle: "card" }),
      callbacks: { onFetchCoverImage: vi.fn(async () => true) },
      articles: [
        buildArticle({
          guid: "1",
          tags: [{ name: "tech", color: "#ff0000" }],
        }),
      ],
    });
    h.list.render();

    const card = h.getArticleEl("1");
    expect(
      card?.querySelector(".rss-dashboard-card-tags-region"),
    ).not.toBeNull();

    h.articles[0].tags = [];
    h.list.updateArticleInPlace(h.articles[0]);

    // The chips go with the last tag; the row stays, because it is also where
    // the cover control lives.
    expect(
      card?.querySelector(".rss-dashboard-card-tags-region"),
    ).not.toBeNull();
    expect(card?.querySelector(COVER_FETCH_BUTTON)).not.toBeNull();
    expect(
      card?.querySelector(".rss-dashboard-tag-container")?.children.length,
    ).toBe(0);
    h.cleanup();
  });

  it("keeps the feed item's control when the last tag is removed from it", () => {
    const h = createArticleListHarness({
      settings: settingsWith({ viewStyle: "feed" }),
      callbacks: { onFetchCoverImage: vi.fn(async () => true) },
      articles: [
        buildArticle({
          guid: "1",
          tags: [{ name: "tech", color: "#ff0000" }],
        }),
      ],
    });
    h.list.render();

    const item = h.getArticleEl("1");
    expect(
      item?.querySelector(".rss-dashboard-feed-tags-region"),
    ).not.toBeNull();

    h.articles[0].tags = [];
    h.list.updateArticleInPlace(h.articles[0]);

    // The chips go with the last tag; the row stays, because it is also where
    // the cover control lives.
    expect(
      item?.querySelector(".rss-dashboard-feed-tags-region"),
    ).not.toBeNull();
    expect(item?.querySelector(COVER_FETCH_BUTTON)).not.toBeNull();
    expect(
      item?.querySelector(".rss-dashboard-tag-container")?.children.length,
    ).toBe(0);
    h.cleanup();
  });

  it("shows the card busy while the menu's fetch runs, then rebuilds it", async () => {
    let finish!: (found: boolean) => void;
    const onFetchCoverImage = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const h = createArticleListHarness({
      settings: settingsWith({ viewStyle: "card" }),
      callbacks: { onFetchCoverImage },
      articles: [buildArticle({ guid: "1", coverImage: "" })],
    });
    h.list.render();

    rightClick(h.getArticleEl("1"));
    Menu.lastItems.find((item) => item.title === COVER_FETCH_TITLE)?.trigger();

    const card = h.getArticleEl("1");
    expect(card?.classList.contains(FETCHING_CLASS)).toBe(true);
    expect(card?.getAttribute("aria-busy")).toBe("true");

    h.articles[0].coverImage = "https://cdn.example.com/hero.jpg";
    finish(true);

    await vi.waitFor(() =>
      expect(
        h
          .getArticleEl("1")
          ?.querySelector(".rss-dashboard-cover-image")
          ?.getAttribute("src"),
      ).toBe("https://cdn.example.com/hero.jpg"),
    );
    expect(h.getArticleEl("1")).not.toBe(card);
    h.cleanup();
  });

  describe("restore states (#1330)", () => {
    function fetchedArticle(overrides: Record<string, unknown> = {}) {
      return buildArticle({
        guid: "1",
        coverImage: PAGE_IMAGE,
        coverImageFromPage: true,
        content: `<p><img src="${FEED_IMAGE}"></p>`,
        ...overrides,
      });
    }

    it("offers the restore in the card's context menu and control", () => {
      const h = createArticleListHarness({
        settings: settingsWith({ viewStyle: "card" }),
        callbacks: {
          onFetchCoverImage: vi.fn(async () => true),
          onRestoreCoverImage: vi.fn(async () => true),
        },
        articles: [fetchedArticle()],
      });
      h.list.render();

      expect(
        h
          .getArticleEl("1")
          ?.querySelector(COVER_FETCH_BUTTON)
          ?.getAttribute("aria-label"),
      ).toBe(COVER_RESTORE_TITLE);

      rightClick(h.getArticleEl("1"));
      expect(titles()).toContain(COVER_RESTORE_TITLE);
      expect(titles()).not.toContain(COVER_REPLACE_TITLE);
      h.cleanup();
    });

    it("restores on activation, rebuilding the card in place without a request", async () => {
      const article = fetchedArticle();
      const onFetchCoverImage = vi.fn(async () => true);
      const onRestoreCoverImage = vi.fn(async (target: typeof article) => {
        target.coverImage = FEED_IMAGE;
        target.coverImageFromPage = undefined;
        return true;
      });
      const h = createArticleListHarness({
        settings: settingsWith({ viewStyle: "card" }),
        callbacks: { onFetchCoverImage, onRestoreCoverImage },
        articles: [article],
      });
      h.list.render();

      const card = h.getArticleEl("1");
      rightClick(card);
      Menu.lastItems
        .find((item) => item.title === COVER_RESTORE_TITLE)
        ?.trigger();

      await vi.waitFor(() =>
        expect(
          h
            .getArticleEl("1")
            ?.querySelector(".rss-dashboard-cover-image")
            ?.getAttribute("src"),
        ).toBe(FEED_IMAGE),
      );

      expect(onFetchCoverImage).not.toHaveBeenCalled();
      expect(h.getArticleEl("1")).not.toBe(card);
      // The state moved on, so the control now offers the fetch again.
      expect(
        h
          .getArticleEl("1")
          ?.querySelector(COVER_FETCH_BUTTON)
          ?.getAttribute("aria-label"),
      ).toBe(COVER_REPLACE_TITLE);
      h.cleanup();
    });

    it("offers the fetch again once the fetched cover has been removed", async () => {
      const article = fetchedArticle({ content: "", description: "" });
      const onRestoreCoverImage = vi.fn(async (target: typeof article) => {
        target.coverImage = "";
        target.coverImageFromPage = undefined;
        return true;
      });
      const h = createArticleListHarness({
        settings: settingsWith({ viewStyle: "card" }),
        callbacks: {
          onFetchCoverImage: vi.fn(async () => true),
          onRestoreCoverImage,
        },
        articles: [article],
      });
      h.list.render();

      expect(
        h
          .getArticleEl("1")
          ?.querySelector(COVER_FETCH_BUTTON)
          ?.getAttribute("aria-label"),
      ).toBe("Remove fetched cover image");

      rightClick(h.getArticleEl("1"));
      Menu.lastItems
        .find((item) => item.title === "Remove fetched cover image")
        ?.trigger();

      await vi.waitFor(() =>
        expect(
          h
            .getArticleEl("1")
            ?.querySelector(COVER_FETCH_BUTTON)
            ?.getAttribute("aria-label"),
        ).toBe(COVER_FETCH_TITLE),
      );
      h.cleanup();
    });

    it("omits the restore in the list view, which renders no cover", () => {
      const h = createArticleListHarness({
        settings: settingsWith({ viewStyle: "list" }),
        callbacks: {
          onFetchCoverImage: vi.fn(async () => true),
          onRestoreCoverImage: vi.fn(async () => true),
        },
        articles: [fetchedArticle()],
      });
      h.list.render();

      rightClick(h.getArticleEl("1"));

      expect(titles()).not.toContain(COVER_RESTORE_TITLE);
      h.cleanup();
    });

    it("omits the restore while cover images are hidden", () => {
      const h = createArticleListHarness({
        settings: settingsWith({
          viewStyle: "card",
          display: {
            showCoverImage: false,
          } as unknown as RssDashboardSettings["display"],
        }),
        callbacks: {
          onFetchCoverImage: vi.fn(async () => true),
          onRestoreCoverImage: vi.fn(async () => true),
        },
        articles: [fetchedArticle()],
      });
      h.list.render();

      rightClick(h.getArticleEl("1"));

      expect(titles()).not.toContain(COVER_RESTORE_TITLE);
      expect(h.getArticleEl("1")?.querySelector(COVER_FETCH_BUTTON)).toBeNull();
      h.cleanup();
    });
  });
});
