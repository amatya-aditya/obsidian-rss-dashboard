// The dashboard-level wiring of the manual cover-image fetch (#1314): which
// surfaces offer it, and the busy state the context-menu path shows while the
// page request runs.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu } from "obsidian";
import { buildArticle, createArticleListHarness } from "./article-list-harness";
import type { RssDashboardSettings } from "../../../src/types/types";

const COVER_FETCH_TITLE = "Fetch cover image from page";
const COVER_REPLACE_TITLE = "Replace cover image from page";
const COVER_FETCH_BUTTON = ".rss-dashboard-fetch-cover-button";
const FETCHING_CLASS = "rss-dashboard-cover-fetching";

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
});
