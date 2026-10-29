// The article list's side of the "fetch all covers" button (#1702): which cards
// a press fetches, how the run shows its progress, and how a cancel ends it.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { globalFetchSemaphore } from "../../../src/services/feed-parser/fetch-semaphore";
import { buildArticle, createArticleListHarness } from "./article-list-harness";
import type { FeedItem, RssDashboardSettings } from "../../../src/types/types";

const BUTTON = ".rss-dashboard-fetch-all-covers-button";
const FETCHING_CLASS = "rss-dashboard-cover-fetching";
const PAGE_IMAGE = "https://page.example.com/hero.jpg";

function settingsWith(viewStyle: "card" | "feed" | "list" = "card") {
  return {
    viewStyle,
    articleGroupBy: "none",
    articleSort: "newest",
  } as Partial<RssDashboardSettings>;
}

function makeArticles(count: number): FeedItem[] {
  return Array.from({ length: count }, (_, index) =>
    buildArticle({
      guid: `g${index}`,
      title: `Article ${index}`,
      link: `https://example.com/${index}`,
    }),
  );
}

/** A quiet fetch that stores the page image on the article the way the dashboard does. */
function storingFetch() {
  return vi.fn(async (article: FeedItem) => {
    article.coverImage = PAGE_IMAGE;
    article.coverImageFromPage = true;
    return true;
  });
}

describe("fetch-all-covers on the article list (#1702)", () => {
  let noticeLog: MockInstance;

  beforeEach(() => {
    noticeLog = vi.spyOn(console, "debug");
    noticeLog.mockClear();
  });

  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  function notices(): unknown[] {
    return noticeLog.mock.calls
      .filter((call) => call[0] === "[Stub Notice]")
      .map((call) => call[1]);
  }

  function headerButton(container: HTMLElement): HTMLButtonElement {
    const found = container.querySelector<HTMLButtonElement>(BUTTON);
    if (!found) throw new Error("fetch-all-covers button not rendered");
    return found;
  }

  it("fetches every eligible card on the page through the quiet fetch and reports once", async () => {
    const fetchQuiet = storingFetch();
    const fetchLoud = vi.fn(async () => true);
    const articles = [
      ...makeArticles(2),
      buildArticle({
        guid: "fetched",
        coverImage: PAGE_IMAGE,
        coverImageFromPage: true,
      }),
      buildArticle({ guid: "mail", link: "mailto:someone@example.com" }),
    ];
    const h = createArticleListHarness({
      settings: settingsWith(),
      callbacks: {
        onFetchCoverImage: fetchLoud,
        onFetchCoverImageQuiet: fetchQuiet,
      },
      articles,
    });
    h.list.render();

    headerButton(h.container).click();
    await vi.waitFor(() => expect(notices()).toHaveLength(1));

    expect(fetchQuiet.mock.calls.map(([a]) => a.guid).sort()).toEqual([
      "g0",
      "g1",
    ]);
    expect(fetchLoud).not.toHaveBeenCalled();
    expect(notices()).toEqual(["Fetched 2 of 2 cover images."]);
    // The cards that were skipped keep exactly what they had.
    expect(articles[2].coverImage).toBe(PAGE_IMAGE);
    expect(articles[3].coverImage).toBe("");
    expect(articles[0].coverImage).toBe(PAGE_IMAGE);
    expect(articles[0].coverImageFromPage).toBe(true);
    // The fetched cards were rebuilt in place, so each is still on the page.
    expect(h.getArticleEl("g0")).not.toBeNull();
    expect(h.getArticleEl("g1")).not.toBeNull();
    h.cleanup();
  });

  it("leaves the button disabled once no card on the page needs a cover", async () => {
    const h = createArticleListHarness({
      settings: settingsWith(),
      callbacks: {
        onFetchCoverImage: storingFetch(),
        onFetchCoverImageQuiet: storingFetch(),
      },
      articles: makeArticles(2),
    });
    h.list.render();
    expect(headerButton(h.container).getAttribute("aria-disabled")).toBeNull();

    headerButton(h.container).click();
    await vi.waitFor(() => expect(notices()).toHaveLength(1));

    const button = headerButton(h.container);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.classList.contains("is-running")).toBe(false);
    h.cleanup();
  });

  it("starts the button disabled when no card on the page is eligible", () => {
    const h = createArticleListHarness({
      settings: settingsWith(),
      callbacks: {
        onFetchCoverImage: storingFetch(),
        onFetchCoverImageQuiet: storingFetch(),
      },
      articles: [buildArticle({ guid: "mail", link: "mailto:a@example.com" })],
    });
    h.list.render();

    expect(headerButton(h.container).getAttribute("aria-disabled")).toBe(
      "true",
    );
    h.cleanup();
  });

  it("offers no button in the list view, with cover images off, or without a fetcher", () => {
    const list = createArticleListHarness({
      settings: settingsWith("list"),
      callbacks: { onFetchCoverImageQuiet: storingFetch() },
      articles: makeArticles(1),
    });
    list.list.render();
    expect(list.container.querySelector(BUTTON)).toBeNull();
    list.cleanup();

    const hidden = createArticleListHarness({
      settings: {
        ...settingsWith(),
        display: {
          showCoverImage: false,
        } as unknown as RssDashboardSettings["display"],
      },
      callbacks: { onFetchCoverImageQuiet: storingFetch() },
      articles: makeArticles(1),
    });
    hidden.list.render();
    expect(hidden.container.querySelector(BUTTON)).toBeNull();
    hidden.cleanup();

    const noFetcher = createArticleListHarness({
      settings: settingsWith(),
      articles: makeArticles(1),
    });
    noFetcher.list.render();
    expect(noFetcher.container.querySelector(BUTTON)).toBeNull();
    noFetcher.cleanup();
  });

  it("runs at most three fetches at once and dims the cards being fetched", async () => {
    const finish: Array<() => void> = [];
    let inFlight = 0;
    let peak = 0;
    const fetchQuiet = vi.fn(
      (article: FeedItem) =>
        new Promise<boolean>((resolve) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          finish.push(() => {
            inFlight -= 1;
            article.coverImage = PAGE_IMAGE;
            article.coverImageFromPage = true;
            resolve(true);
          });
        }),
    );
    const h = createArticleListHarness({
      settings: settingsWith(),
      callbacks: {
        onFetchCoverImage: fetchQuiet,
        onFetchCoverImageQuiet: fetchQuiet,
      },
      articles: makeArticles(7),
    });
    h.list.render();

    headerButton(h.container).click();
    expect(fetchQuiet).toHaveBeenCalledTimes(3);
    for (const guid of ["g0", "g1", "g2"]) {
      const card = h.getArticleEl(guid);
      expect(card?.classList.contains(FETCHING_CLASS)).toBe(true);
      expect(card?.getAttribute("aria-busy")).toBe("true");
    }
    expect(h.getArticleEl("g3")?.classList.contains(FETCHING_CLASS)).toBe(
      false,
    );

    while (notices().length === 0) {
      finish.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(peak).toBe(3);
    expect(fetchQuiet).toHaveBeenCalledTimes(7);
    expect(notices()).toEqual(["Fetched 7 of 7 cover images."]);
    h.cleanup();
  });

  it("shows the spinner while running and cancels on the next press", async () => {
    const finish: Array<() => void> = [];
    const fetchQuiet = vi.fn(
      (article: FeedItem) =>
        new Promise<boolean>((resolve) => {
          finish.push(() => {
            article.coverImage = PAGE_IMAGE;
            article.coverImageFromPage = true;
            resolve(true);
          });
        }),
    );
    const h = createArticleListHarness({
      settings: settingsWith(),
      callbacks: {
        onFetchCoverImage: fetchQuiet,
        onFetchCoverImageQuiet: fetchQuiet,
      },
      articles: makeArticles(8),
    });
    h.list.render();

    headerButton(h.container).click();
    const running = headerButton(h.container);
    expect(running.classList.contains("is-running")).toBe(true);
    expect(running.getAttribute("aria-label")).toBe(
      "Cancel fetching cover images",
    );

    running.click();
    finish.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(notices()).toHaveLength(1));

    expect(fetchQuiet).toHaveBeenCalledTimes(3);
    expect(notices()).toEqual([
      "Stopped. Fetched 3 of 3 cover images. 5 not started.",
    ]);
    // The three finished covers were kept; the other five can still be fetched.
    expect(h.getArticleEl("g0")?.classList.contains(FETCHING_CLASS)).toBe(
      false,
    );
    const idle = headerButton(h.container);
    expect(idle.classList.contains("is-running")).toBe(false);
    expect(idle.getAttribute("aria-disabled")).toBeNull();
    h.cleanup();
  });

  it("counts failed fetches in the one summary instead of announcing each", async () => {
    const fetchQuiet = vi.fn(async (article: FeedItem) => {
      if (article.guid === "g1") return false;
      article.coverImage = PAGE_IMAGE;
      article.coverImageFromPage = true;
      return true;
    });
    const h = createArticleListHarness({
      settings: settingsWith(),
      callbacks: {
        onFetchCoverImage: fetchQuiet,
        onFetchCoverImageQuiet: fetchQuiet,
      },
      articles: makeArticles(3),
    });
    h.list.render();

    headerButton(h.container).click();
    await vi.waitFor(() => expect(notices()).toHaveLength(1));

    expect(notices()).toEqual([
      "Fetched 2 of 3 cover images. 1 had no image or could not be fetched.",
    ]);
    h.cleanup();
  });

  it("does not fetch cards that a search has hidden", async () => {
    const fetchQuiet = storingFetch();
    const h = createArticleListHarness({
      settings: settingsWith(),
      callbacks: {
        onFetchCoverImage: fetchQuiet,
        onFetchCoverImageQuiet: fetchQuiet,
      },
      articles: makeArticles(3),
    });
    h.list.render();

    h.list.setSearchQuery("Article 1");
    expect(headerButton(h.container).getAttribute("aria-disabled")).toBeNull();
    headerButton(h.container).click();
    await vi.waitFor(() => expect(notices()).toHaveLength(1));

    expect(fetchQuiet.mock.calls.map(([a]) => a.guid)).toEqual(["g1"]);
    expect(notices()).toEqual(["Fetched 1 of 1 cover image."]);
    h.cleanup();
  });

  it("stops starting fetches when the list is destroyed mid-run", async () => {
    const finish: Array<() => void> = [];
    const fetchQuiet = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish.push(() => resolve(false));
        }),
    );
    const h = createArticleListHarness({
      settings: settingsWith(),
      callbacks: {
        onFetchCoverImage: fetchQuiet,
        onFetchCoverImageQuiet: fetchQuiet,
      },
      articles: makeArticles(8),
    });
    h.list.render();

    headerButton(h.container).click();
    h.list.destroy();
    finish.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchQuiet).toHaveBeenCalledTimes(3);
    h.cleanup();
  });

  it("never takes a feed-refresh slot for a bulk fetch", async () => {
    const acquire = vi.spyOn(globalFetchSemaphore, "acquire");
    const fetchQuiet = storingFetch();
    const h = createArticleListHarness({
      settings: settingsWith(),
      callbacks: {
        onFetchCoverImage: fetchQuiet,
        onFetchCoverImageQuiet: fetchQuiet,
      },
      articles: makeArticles(4),
    });
    h.list.render();

    headerButton(h.container).click();
    await vi.waitFor(() => expect(notices()).toHaveLength(1));

    expect(fetchQuiet).toHaveBeenCalledTimes(4);
    expect(acquire).not.toHaveBeenCalled();
    h.cleanup();
  });

  describe("keeping the button's state current", () => {
    function fetched(guid: string): FeedItem {
      return buildArticle({
        guid,
        title: `Fetched ${guid}`,
        link: `https://example.com/${guid}`,
        coverImage: PAGE_IMAGE,
        coverImageFromPage: true,
      });
    }

    function harnessFor(articles: FeedItem[]) {
      const fetchQuiet = storingFetch();
      const h = createArticleListHarness({
        settings: settingsWith(),
        callbacks: {
          onFetchCoverImage: fetchQuiet,
          onFetchCoverImageQuiet: fetchQuiet,
          onRestoreCoverImage: vi.fn(async () => true),
        },
        articles,
      });
      h.list.render();
      return { h, fetchQuiet };
    }

    function isDisabled(container: HTMLElement): boolean {
      return headerButton(container).getAttribute("aria-disabled") === "true";
    }

    it("becomes available again when a filter change brings in cards that need a cover", () => {
      const { h } = harnessFor([fetched("a"), fetched("b")]);
      expect(isDisabled(h.container)).toBe(true);

      h.list.refilter(new Set(), new Set(), "OR", makeArticles(2), 1, 1, 10, 2);

      expect(isDisabled(h.container)).toBe(false);
      h.cleanup();
    });

    it("becomes unavailable when a filter change leaves nothing to fetch", () => {
      const { h } = harnessFor(makeArticles(2));
      expect(isDisabled(h.container)).toBe(false);

      h.list.refilter(new Set(), new Set(), "OR", [fetched("a")], 1, 1, 10, 1);

      expect(isDisabled(h.container)).toBe(true);
      h.cleanup();
    });

    it("becomes available when a card's cover is restored from its own control", () => {
      const restored = fetched("a");
      const { h } = harnessFor([restored]);
      expect(isDisabled(h.container)).toBe(true);

      restored.coverImage = "";
      restored.coverImageFromPage = undefined;
      h.list.replaceArticleInPlace(restored);

      expect(isDisabled(h.container)).toBe(false);
      h.cleanup();
    });

    it("follows a card that is inserted into the page", () => {
      const { h } = harnessFor([fetched("a")]);
      expect(isDisabled(h.container)).toBe(true);

      h.list.insertArticleInPlace(
        buildArticle({ guid: "new", link: "https://example.com/new" }),
        "newest",
      );

      expect(isDisabled(h.container)).toBe(false);
      h.cleanup();
    });

    it("follows a card that is removed from the page", () => {
      const needy = buildArticle({
        guid: "needy",
        link: "https://example.com/n",
      });
      const { h } = harnessFor([fetched("a"), needy]);
      expect(isDisabled(h.container)).toBe(false);

      h.list.removeArticleInPlace("needy");

      expect(isDisabled(h.container)).toBe(true);
      h.cleanup();
    });

    it("runs a press that arrives while the button still looks unavailable", async () => {
      const stale = fetched("a");
      const { h, fetchQuiet } = harnessFor([stale]);
      expect(isDisabled(h.container)).toBe(true);

      // The card changed behind the list's back, so the look is out of date.
      stale.coverImage = "";
      stale.coverImageFromPage = undefined;
      headerButton(h.container).click();
      await vi.waitFor(() => expect(notices()).toHaveLength(1));

      expect(fetchQuiet).toHaveBeenCalledTimes(1);
      expect(notices()).toEqual(["Fetched 1 of 1 cover image."]);
      h.cleanup();
    });

    it("says so, and requests nothing, when a press finds no card that needs a cover", () => {
      const { h, fetchQuiet } = harnessFor([fetched("a")]);

      headerButton(h.container).click();

      expect(fetchQuiet).not.toHaveBeenCalled();
      expect(notices()).toEqual(["No cards on this page need a cover image."]);
      h.cleanup();
    });
  });
});
