import { afterEach, describe, expect, it, vi } from "vitest";
import { buildArticle, createArticleListHarness } from "./article-list-harness";
import type { RssDashboardSettings } from "../../../src/types/types";

describe("Phase 7 - ArticleList in-place updates", () => {
  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("updateArticleInPlace should sync read/saved/starred classes and toggle tooltips", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
        display: {
          mobileListToolbarStyle: "left-grid",
        } as unknown as RssDashboardSettings["display"],
      },
      articles: [
        buildArticle({
          guid: "1",
          title: "One",
          read: false,
          saved: false,
          starred: false,
        }),
      ],
    });
    h.list.render();

    const articleEl = h.getArticleEl("1");
    expect(articleEl).not.toBeNull();
    expect(articleEl?.classList.contains("unread")).toBe(true);
    expect(articleEl?.classList.contains("saved")).toBe(false);
    expect(articleEl?.classList.contains("unstarred")).toBe(true);

    const readToggle = articleEl?.querySelector<HTMLElement>(
      ".rss-dashboard-read-toggle",
    );
    const saveToggle = articleEl?.querySelector<HTMLElement>(
      ".rss-dashboard-save-toggle",
    );
    const starToggle = articleEl?.querySelector<HTMLElement>(
      ".rss-dashboard-star-toggle",
    );

    expect(readToggle?.getAttribute("aria-label")).toBe("Mark as read (m)");
    expect(saveToggle?.getAttribute("aria-label")).toContain("Save");
    expect(starToggle?.getAttribute("aria-label")).toBe(
      "Add to starred items (f)",
    );

    h.list.updateArticleInPlace({
      ...h.articles[0],
      read: true,
      saved: true,
      starred: true,
    });

    expect(articleEl?.classList.contains("read")).toBe(true);
    expect(articleEl?.classList.contains("unread")).toBe(false);
    expect(articleEl?.classList.contains("saved")).toBe(true);
    expect(articleEl?.classList.contains("starred")).toBe(true);
    expect(articleEl?.classList.contains("unstarred")).toBe(false);

    expect(readToggle?.getAttribute("aria-label")).toBe("Mark as unread (m)");
    expect(saveToggle?.getAttribute("aria-label")).toBe(
      "Click to open saved article (s)",
    );
    expect(starToggle?.getAttribute("aria-label")).toBe(
      "Remove from starred items (f)",
    );

    h.cleanup();
  });

  it("marks an article unread on the first toggle click after an in-place update marked it read", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
        display: {
          mobileListToolbarStyle: "left-grid",
        } as unknown as RssDashboardSettings["display"],
      },
      articles: [buildArticle({ guid: "1", title: "One", read: false })],
    });
    h.list.render();

    // Mark page as read hands the list a fresh copy of each article, not the
    // object the rendered card was built from.
    h.list.updateArticleInPlace({ ...h.articles[0], read: true });

    const readToggle = h
      .getArticleEl("1")
      ?.querySelector<HTMLElement>(".rss-dashboard-read-toggle");
    readToggle?.click();

    expect(h.callbacks.onArticleUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ guid: "1" }),
      { read: false },
      false,
    );
    expect(readToggle?.classList.contains("unread")).toBe(true);

    h.cleanup();
  });

  it("updates only the matching feed when two visible articles share a guid", () => {
    const firstFeedUrl = "https://first.example/feed.xml";
    const secondFeedUrl = "https://second.example/feed.xml";
    const first = buildArticle({
      guid: "shared-guid",
      feedUrl: firstFeedUrl,
      saved: true,
    });
    const second = buildArticle({
      guid: "shared-guid",
      feedUrl: secondFeedUrl,
      saved: true,
    });
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: [first, second],
    });
    h.list.render();

    h.list.updateArticleInPlace({ ...second, saved: false, tags: [] });

    const rows = Array.from(
      h.container.querySelectorAll<HTMLElement>("#article-shared-guid"),
    );
    const firstRow = rows.find((row) => row.dataset.feedUrl === firstFeedUrl);
    const secondRow = rows.find((row) => row.dataset.feedUrl === secondFeedUrl);
    expect(firstRow?.classList.contains("saved")).toBe(true);
    expect(secondRow?.classList.contains("saved")).toBe(false);
    expect(h.list.hasArticle("shared-guid", firstFeedUrl)).toBe(true);
    expect(h.list.hasArticle("shared-guid", secondFeedUrl)).toBe(true);

    h.cleanup();
  });

  it("syncVisibleArticlesFromSource should refresh tag colors for cloned visible articles", () => {
    const visibleArticle = buildArticle({
      guid: "1",
      title: "One",
      tags: [{ name: "tag1", color: "#000000" }],
    });
    const backingArticle = buildArticle({
      guid: "1",
      title: "One",
      tags: [{ name: "tag1", color: "#ff0000" }],
    });

    const h = createArticleListHarness({
      settings: {
        viewStyle: "card",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: [visibleArticle],
    });
    h.list.render();

    const articleEl = h.getArticleEl("1");
    const tagEl = articleEl?.querySelector<HTMLElement>(
      ".rss-dashboard-tag-badge",
    );
    expect(tagEl?.style.getPropertyValue("--tag-color")).toBe("#000000");

    h.list.syncVisibleArticlesFromSource(() => backingArticle);
    h.list.refreshVisibleArticleTags();

    const updatedTagEl = h
      .getArticleEl("1")
      ?.querySelector<HTMLElement>(".rss-dashboard-tag-badge");
    expect(updatedTagEl?.style.getPropertyValue("--tag-color")).toBe("#ff0000");

    h.cleanup();
  });

  it("removeArticleInPlace should remove the element after the timeout and restore scrollTop", () => {
    vi.useFakeTimers();

    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: [
        buildArticle({ guid: "1", title: "One" }),
        buildArticle({ guid: "2", title: "Two" }),
      ],
    });
    h.list.render();

    const listEl = h.getArticlesListEl();
    expect(listEl).not.toBeNull();
    if (!listEl) throw new Error("Expected articles list element");
    listEl.scrollTop = 123;

    expect(h.getArticleEl("1")).not.toBeNull();
    h.list.removeArticleInPlace("1");

    expect(h.list.hasArticle("1")).toBe(false);
    expect(h.getArticleEl("1")).not.toBeNull();

    vi.advanceTimersByTime(319);
    expect(h.getArticleEl("1")).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(h.getArticleEl("1")).toBeNull();
    expect(listEl.scrollTop).toBe(123);

    h.cleanup();
  });

  it("mark-all fallback should mutate articles, persist settings, and rerender (read)", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      callbacks: {
        onMarkAllAsRead: undefined,
        onPersistSettings: vi.fn(),
      },
      articles: [
        buildArticle({ guid: "1", title: "One", read: false }),
        buildArticle({ guid: "2", title: "Two", read: false }),
      ],
    });
    h.list.render();

    const btn = h.container.querySelector<HTMLButtonElement>(
      "button.rss-dashboard-mark-read",
    );
    expect(btn).not.toBeNull();
    btn?.click();

    expect(h.articles.every((a) => a.read)).toBe(true);
    expect(h.callbacks.onPersistSettings).toHaveBeenCalled();
    expect(h.getArticleEl("1")?.classList.contains("read")).toBe(true);
    expect(h.getArticleEl("2")?.classList.contains("read")).toBe(true);

    h.cleanup();
  });

  it("mark-all fallback should mutate articles and rerender (unread)", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      callbacks: {
        onMarkAllAsUnread: undefined,
      },
      articles: [
        buildArticle({ guid: "1", title: "One", read: true }),
        buildArticle({ guid: "2", title: "Two", read: true }),
      ],
    });
    h.list.render();

    const buttons = Array.from(
      h.container.querySelectorAll<HTMLButtonElement>(
        ".rss-dashboard-mark-all-buttons-row button.rss-dashboard-mark-all-button",
      ),
    );
    const btn = buttons.find((b) => b.textContent?.includes("Unread"));
    expect(btn).not.toBeNull();
    btn?.click();

    expect(h.articles.every((a) => !a.read)).toBe(true);
    expect(h.getArticleEl("1")?.classList.contains("unread")).toBe(true);
    expect(h.getArticleEl("2")?.classList.contains("unread")).toBe(true);

    h.cleanup();
  });

  it("pagination caps visible pages at 5 and adds mark-page-read between next and page size", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: Array.from({ length: 10 }, (_, index) =>
        buildArticle({ guid: String(index + 1), title: `Item ${index + 1}` }),
      ),
      currentPage: 4,
      totalPages: 10,
      pageSize: 10,
      totalArticles: 100,
    });
    h.list.render();

    const pagination = h.container.querySelector(".rss-dashboard-pagination");
    const buttons = Array.from(
      pagination?.querySelectorAll<HTMLButtonElement>(
        "button.rss-dashboard-pagination-btn",
      ) ?? [],
    );
    const buttonTexts = buttons.map((button) => button.textContent?.trim());

    expect(buttonTexts).toEqual([
      "<",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "10",
      ">",
      "Mark page read",
    ]);

    const ellipsis = Array.from(
      pagination?.querySelectorAll(".rss-dashboard-pagination-ellipsis") ?? [],
    ).map((node) => node.textContent?.trim());
    expect(ellipsis).toEqual(["..."]);

    const nextButton = pagination?.querySelector<HTMLButtonElement>(
      ".rss-dashboard-pagination-btn.next",
    );
    const markPageReadButton = pagination?.querySelector<HTMLButtonElement>(
      ".rss-dashboard-pagination-mark-page-read",
    );
    const pageSizeDropdown = pagination?.querySelector<HTMLSelectElement>(
      ".rss-dashboard-page-size-dropdown",
    );

    expect(
      nextButton?.parentElement?.classList.contains(
        "rss-dashboard-pagination-pages",
      ),
    ).toBe(true);
    expect(markPageReadButton?.nextElementSibling).toBe(
      pageSizeDropdown?.parentElement,
    );

    h.cleanup();
  });

  it("mark-page fallback should mutate only current page articles, persist, and rerender", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      callbacks: {
        onMarkPageAsRead: undefined,
        onPersistSettings: vi.fn(),
      },
      articles: [
        buildArticle({ guid: "1", title: "One", read: false }),
        buildArticle({ guid: "2", title: "Two", read: true }),
        buildArticle({ guid: "3", title: "Three", read: false }),
      ],
      currentPage: 2,
      totalPages: 4,
      pageSize: 3,
      totalArticles: 12,
    });
    h.list.render();

    const btn = h.container.querySelector<HTMLButtonElement>(
      "button.rss-dashboard-pagination-mark-page-read",
    );
    expect(btn).not.toBeNull();
    btn?.click();

    expect(h.articles.map((article) => article.read)).toEqual([
      true,
      true,
      true,
    ]);
    expect(h.callbacks.onPersistSettings).toHaveBeenCalledTimes(1);
    expect(h.getArticleEl("1")?.classList.contains("read")).toBe(true);
    expect(h.getArticleEl("2")?.classList.contains("read")).toBe(true);
    expect(h.getArticleEl("3")?.classList.contains("read")).toBe(true);

    h.cleanup();
  });
  // #409: in Obsidian, activeDocument.createDiv() appends to the document and
  // throws, so the insert must build the new row in a detached element.
  it.each(["list", "card", "feed"] as const)(
    "inserts a newly matching article into an ungrouped %s view without touching the document",
    (viewStyle) => {
      vi.useFakeTimers();
      const h = createArticleListHarness({
        settings: { viewStyle, articleGroupBy: "none", articleSort: "newest" },
        articles: [
          buildArticle({
            guid: "older",
            pubDate: new Date("2024-01-01T00:00:00Z").toISOString(),
          }),
        ],
        pageSize: 50,
        totalArticles: 1,
      });
      h.list.render();

      const starred = buildArticle({
        guid: "starred",
        starred: true,
        pubDate: new Date("2024-01-02T00:00:00Z").toISOString(),
      });

      expect(h.list.insertArticleInPlace(starred, "newest")).toBe(true);
      vi.runOnlyPendingTimers();

      expect(
        h.getArticlesListEl()?.querySelector("#article-starred"),
      ).not.toBeNull();
      expect(document.childElementCount).toBe(1);
    },
  );
});

// Keyboard users keep their place when the row they were on leaves the list
// (#1385). The list tells the dashboard before the row goes and the dashboard
// takes focus back afterwards (#1468). This replaced "focus the next row's read
// control": a read control is a role="button", which the dashboard keymap
// ignores, so the user's shortcuts went dead until they clicked back in.
describe("ArticleList in-place removal hands focus back to the dashboard (#1468)", () => {
  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function listFixture(guidCount: number) {
    // The harness container is detached; jsdom only moves focus for a
    // connected subtree, so attach one for these tests.
    const container = createDiv();
    document.body.appendChild(container);
    const dashboard = createDiv({ attr: { tabindex: "-1" } });
    document.body.appendChild(dashboard);
    const events: string[] = [];
    const h = createArticleListHarness({
      container,
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: Array.from({ length: guidCount }, (_, index) =>
        buildArticle({ guid: String(index + 1), title: `One ${index + 1}` }),
      ),
    });
    Object.assign(h.callbacks, {
      onFocusedRowRemoval: () => {
        events.push("before");
        return () => {
          events.push("after");
          dashboard.focus();
        };
      },
    });
    h.list.render();
    return { ...h, dashboard, events };
  }

  const readControl = (h: ReturnType<typeof listFixture>, guid: string) =>
    h
      .getArticleEl(guid)
      ?.querySelector<HTMLElement>(".rss-dashboard-read-toggle") ?? null;

  it("tells the dashboard before the row leaves and returns focus to it afterwards", () => {
    vi.useFakeTimers();
    const h = listFixture(3);
    readControl(h, "2")?.focus();

    h.list.removeArticleInPlace("2");
    expect(h.events).toEqual(["before"]);
    vi.advanceTimersByTime(320);

    expect(h.events).toEqual(["before", "after"]);
    expect(document.activeElement).toBe(h.dashboard);
    h.cleanup();
  });

  it("does not land focus on another card's read control", () => {
    vi.useFakeTimers();
    const h = listFixture(3);
    readControl(h, "3")?.focus();

    h.list.removeArticleInPlace("3");
    vi.advanceTimersByTime(320);

    expect(document.activeElement).not.toBe(readControl(h, "2"));
    expect(document.activeElement).toBe(h.dashboard);
    h.cleanup();
  });

  it("falls back to the article list when nothing hands focus back", () => {
    vi.useFakeTimers();
    const h = listFixture(1);
    Object.assign(h.callbacks, { onFocusedRowRemoval: undefined });
    readControl(h, "1")?.focus();

    h.list.removeArticleInPlace("1");
    vi.advanceTimersByTime(320);

    expect(document.activeElement).toBe(h.getArticlesListEl());
    h.cleanup();
  });

  it("leaves focus alone when the removed row did not hold it", () => {
    vi.useFakeTimers();
    const h = listFixture(2);
    const other = createEl("button");
    document.body.appendChild(other);
    other.focus();

    h.list.removeArticleInPlace("1");
    vi.advanceTimersByTime(320);

    expect(h.events).toEqual([]);
    expect(document.activeElement).toBe(other);
    h.cleanup();
  });

  it("moves focus at once when reduced motion skips the collapse", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
        }) as MediaQueryList,
    );
    const h = listFixture(2);
    readControl(h, "1")?.focus();

    h.list.removeArticleInPlace("1");

    expect(document.activeElement).toBe(h.dashboard);
    h.cleanup();
  });
});

// #867: the row collapse and expand are driven by inline styles, which the
// reduced-motion stylesheet cannot override, so the list asks for the
// preference itself.
describe("ArticleList in-place updates honor reduced motion (#867)", () => {
  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const reduceMotion = (): void => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
        }) as MediaQueryList,
    );
  };

  it("removes an article at once without a collapse transition", () => {
    vi.useFakeTimers();
    reduceMotion();
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: [
        buildArticle({ guid: "1", title: "One" }),
        buildArticle({ guid: "2", title: "Two" }),
      ],
    });
    h.list.render();
    const listEl = h.getArticlesListEl();
    if (!listEl) throw new Error("Expected articles list element");
    listEl.scrollTop = 123;

    h.list.removeArticleInPlace("1");

    expect(h.list.hasArticle("1")).toBe(false);
    expect(h.getArticleEl("1")).toBeNull();
    expect(h.getArticleEl("2")).not.toBeNull();
    expect(listEl.scrollTop).toBe(123);

    h.cleanup();
  });

  it("inserts an article without starting it collapsed and transitioning open", () => {
    vi.useFakeTimers();
    reduceMotion();
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: [
        buildArticle({
          guid: "older",
          pubDate: new Date("2024-01-01T00:00:00Z").toISOString(),
        }),
      ],
      pageSize: 50,
      totalArticles: 1,
    });
    h.list.render();

    const inserted = buildArticle({
      guid: "newer",
      pubDate: new Date("2024-01-02T00:00:00Z").toISOString(),
    });
    expect(h.list.insertArticleInPlace(inserted, "newest")).toBe(true);

    const row = h
      .getArticlesListEl()
      ?.querySelector<HTMLElement>("#article-newer");
    expect(row).not.toBeNull();
    expect(row?.style.maxHeight).toBe("");
    expect(row?.style.opacity).toBe("");
    expect(row?.style.transition).toBe("");

    h.cleanup();
  });

  it("rebuilds one card in place when its cover image changed (#1314)", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "card",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: [buildArticle({ guid: "1", title: "One", coverImage: "" })],
    });
    h.list.render();

    const before = h.getArticleEl("1");
    expect(before).not.toBeNull();
    expect(before?.querySelector(".rss-dashboard-cover-image")).toBeNull();

    h.articles[0].coverImage = "https://cdn.example.com/hero.jpg";
    expect(h.list.replaceArticleInPlace(h.articles[0])).toBe(true);

    const after = h.getArticleEl("1");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    expect(
      after?.querySelector(".rss-dashboard-cover-image")?.getAttribute("src"),
    ).toBe("https://cdn.example.com/hero.jpg");
    expect(h.getVisibleArticleIds()).toEqual(["1"]);

    h.cleanup();
  });

  it("keeps focus on the same card control after an in-place rebuild (#1314)", () => {
    // The harness container is detached; jsdom only moves focus for a connected
    // subtree, so attach one for this test.
    const container = createDiv();
    document.body.appendChild(container);
    const h = createArticleListHarness({
      container,
      settings: {
        viewStyle: "card",
        articleGroupBy: "none",
        articleSort: "newest",
        display: {
          showCoverImage: true,
        } as unknown as RssDashboardSettings["display"],
      },
      callbacks: { onFetchCoverImage: vi.fn(async () => true) },
      articles: [buildArticle({ guid: "1", title: "One", coverImage: "" })],
    });
    h.list.render();

    const button = h
      .getArticleEl("1")
      ?.querySelector<HTMLElement>('[data-rss-action="fetch-cover-image"]');
    expect(button).not.toBeNull();
    button?.focus();
    expect(document.activeElement).toBe(button);

    h.articles[0].coverImage = "https://cdn.example.com/hero.jpg";
    h.list.replaceArticleInPlace(h.articles[0]);

    expect(document.activeElement?.getAttribute("data-rss-action")).toBe(
      "fetch-cover-image",
    );

    h.cleanup();
  });

  it("rebuilds a grouped feed item without adding a second section (#1314)", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "feed",
        articleGroupBy: "feed",
        articleSort: "newest",
      },
      articles: [buildArticle({ guid: "1", coverImage: "" })],
    });
    h.list.render();
    expect(
      h.container.querySelectorAll(".rss-dashboard-feed-section"),
    ).toHaveLength(1);

    h.articles[0].coverImage = "https://cdn.example.com/hero.jpg";
    expect(h.list.replaceArticleInPlace(h.articles[0])).toBe(true);

    expect(
      h.container.querySelectorAll(".rss-dashboard-feed-section"),
    ).toHaveLength(1);
    expect(
      h
        .getArticleEl("1")
        ?.querySelector(".rss-dashboard-feed-hero-image")
        ?.getAttribute("src"),
    ).toBe("https://cdn.example.com/hero.jpg");

    h.cleanup();
  });

  it("reports when the article has no rendered element to rebuild (#1314)", () => {
    const h = createArticleListHarness({
      settings: { viewStyle: "card", articleGroupBy: "none" },
      articles: [buildArticle({ guid: "1" })],
    });
    h.list.render();

    expect(
      h.list.replaceArticleInPlace(buildArticle({ guid: "missing" })),
    ).toBe(false);

    h.cleanup();
  });
});

// The next selection comes from the rows the user can see (#1468).
describe("ArticleList neighbour while a removal is still collapsing (#1468)", () => {
  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("skips a row that is already collapsing when choosing the previous card", () => {
    vi.useFakeTimers();
    const container = createDiv();
    document.body.appendChild(container);
    const h = createArticleListHarness({
      container,
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: ["1", "2", "3"].map((guid) =>
        buildArticle({ guid, title: `One ${guid}` }),
      ),
    });
    h.list.render();
    const order = Array.from(
      h.container.querySelectorAll<HTMLElement>(".rss-dashboard-article-item"),
    ).map((row) => row.id.replace(/^article-/, ""));
    const [first, middle, last] = order as [string, string, string];

    // The middle row is mid-collapse when the last row goes too.
    h.list.removeArticleInPlace(middle);

    expect(h.list.getRenderedNeighbour(last)?.guid).toBe(first);
    h.cleanup();
  });
});

describe("ArticleList control activation in a popout window (#1468)", () => {
  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("selects the card when the clicked control belongs to another window", () => {
    const onArticleControlActivate = vi.fn();
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
      },
      articles: [buildArticle({ guid: "1", title: "One" })],
      callbacks: { onArticleControlActivate },
    });
    h.list.render();

    // A popout's elements fail `instanceof HTMLElement` in this window.
    const frame = createEl("iframe");
    document.body.appendChild(frame);
    const popoutWindow = frame.contentWindow as Window & {
      Node: typeof Node;
      Element: typeof Element;
    };
    // Obsidian adds `instanceOf` to every window's Node; mirror that here.
    popoutWindow.Node.prototype.instanceOf = Node.prototype.instanceOf;
    // Obsidian's DOM helpers exist on every window's Element too.
    popoutWindow.Element.prototype.createDiv = Element.prototype.createDiv;
    const row = popoutWindow.document.body.createDiv({
      cls: "rss-dashboard-article-item",
      attr: { id: "article-1" },
    });
    const control = row.createDiv({ cls: "rss-dashboard-star-toggle" });
    expect(control instanceof HTMLElement).toBe(false);

    const event = new MouseEvent("click", { bubbles: true, detail: 1 });
    Object.defineProperty(event, "target", { get: () => control });
    h.getArticlesListEl()?.dispatchEvent(event);

    expect(onArticleControlActivate).toHaveBeenCalledWith(
      expect.objectContaining({ guid: "1" }),
      true,
    );
    h.cleanup();
  });
});
