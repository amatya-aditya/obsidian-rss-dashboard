/**
 * The dashboard footer controls and the cover control name the key that runs
 * the same action (#1467). Each tooltip keeps the sentence it already had and
 * gains the binding's hint in brackets, derived from the keymap so it cannot
 * drift from what the key does. A tooltip is written to `aria-label`, so the
 * hint lands after the stable action name rather than replacing it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RssDashboardSettings } from "../../../src/types/types";
import { buildArticle, createArticleListHarness } from "./article-list-harness";

const VIEWS = ["list", "card", "feed"] as const;

function ariaLabel(articleEl: HTMLElement | null, selector: string) {
  return (
    articleEl
      ?.querySelector<HTMLElement>(selector)
      ?.getAttribute("aria-label") ?? null
  );
}

function footerNames(articleEl: HTMLElement | null) {
  return {
    read: ariaLabel(articleEl, ".rss-dashboard-read-toggle"),
    star: ariaLabel(articleEl, ".rss-dashboard-star-toggle"),
    tags: ariaLabel(articleEl, ".rss-dashboard-tags-toggle"),
    save: ariaLabel(articleEl, ".rss-dashboard-save-toggle"),
  };
}

function render(
  viewStyle: (typeof VIEWS)[number],
  article = buildArticle({ guid: "1", title: "One" }),
) {
  const h = createArticleListHarness({
    settings: {
      viewStyle,
      articleGroupBy: "none",
      articleSort: "newest",
      // The list row shows the full footer in this style; "minimal" would
      // render the read control alone.
      display: {
        mobileListToolbarStyle: "left-grid",
        showCoverImage: true,
      } as unknown as RssDashboardSettings["display"],
    },
    callbacks: {
      onFetchCoverImage: vi.fn(async () => true),
      onRestoreCoverImage: vi.fn(async () => true),
    },
    articles: [article],
  });
  h.list.render();
  return h;
}

const COVER_LABEL = ".rss-dashboard-fetch-cover-button";

describe("dashboard tooltip shortcut hints (#1467)", () => {
  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  it.each(VIEWS)(
    "names the same key on the %s row's footer controls",
    (view) => {
      const h = render(view);

      expect(footerNames(h.getArticleEl("1"))).toEqual({
        read: "Mark as read (m)",
        star: "Add to starred items (f)",
        tags: "Manage tags (t)",
        save: "Save fetched content to notes (s)",
      });

      h.cleanup();
    },
  );

  it.each(VIEWS)(
    "keeps the hint when a %s row's state changes in place",
    (view) => {
      const h = render(view);

      h.list.updateArticleInPlace({
        ...h.articles[0],
        read: true,
        starred: true,
        saved: true,
      });

      expect(footerNames(h.getArticleEl("1"))).toEqual({
        read: "Mark as unread (m)",
        star: "Remove from starred items (f)",
        tags: "Manage tags (t)",
        save: "Click to open saved article (s)",
      });

      h.cleanup();
    },
  );

  it.each(["card", "feed"] as const)(
    "names the cover key on the %s cover control",
    (view) => {
      const h = render(view);

      expect(ariaLabel(h.getArticleEl("1"), COVER_LABEL)).toBe(
        "Fetch and replace cover image (Shift + c)",
      );

      h.cleanup();
    },
  );

  it.each(["card", "feed"] as const)(
    "names the cover key on the %s restore state too",
    (view) => {
      const h = render(
        view,
        buildArticle({
          guid: "1",
          title: "One",
          coverImage: "https://page.example.com/hero.jpg",
          coverImageFromPage: true,
          content: '<p><img src="https://img.example.com/feed.jpg"></p>',
        }),
      );

      expect(ariaLabel(h.getArticleEl("1"), COVER_LABEL)).toBe(
        "Restore cover image from feed (Shift + c)",
      );

      h.cleanup();
    },
  );

  it("keeps the hint while a save is running, then on the saved state", async () => {
    let finishSave: () => void = () => {};
    const saveFinished = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const h = createArticleListHarness({
      settings: {
        viewStyle: "card",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      callbacks: {
        onArticleSave: async (article) => {
          await saveFinished;
          article.saved = true;
        },
      },
      articles: [buildArticle({ guid: "1" })],
    });
    h.list.render();

    const save = h
      .getArticleEl("1")
      ?.querySelector<HTMLElement>(".rss-dashboard-save-toggle");
    save?.click();

    // The click starts the save synchronously, so the running label is what
    // the user sees while the request is in flight.
    expect(save?.getAttribute("aria-label")).toBe("Saving article... (s)");

    finishSave();
    await vi.waitFor(() =>
      expect(save?.getAttribute("aria-label")).toBe(
        "Click to open saved article (s)",
      ),
    );

    h.cleanup();
  });
});
