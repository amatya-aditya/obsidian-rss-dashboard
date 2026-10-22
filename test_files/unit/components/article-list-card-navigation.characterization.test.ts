import { afterEach, describe, expect, it, vi } from "vitest";
import { buildArticle, createArticleListHarness } from "./article-list-harness";

type Direction = "left" | "right" | "up" | "down";

interface CardSpec {
  guid: string;
  top: number;
  left: number;
}

// jsdom has no layout, so each card reports the rectangle the spec gives it.
function setupCards(specs: CardSpec[]) {
  const h = createArticleListHarness({ settings: { viewStyle: "card" } });
  for (const spec of specs) {
    const card = h.container.createDiv({
      cls: "rss-dashboard-article-card",
    });
    card.dataset.articleGuid = spec.guid;
    card.getBoundingClientRect = () =>
      ({
        top: spec.top,
        left: spec.left,
        bottom: spec.top + 100,
        right: spec.left + 100,
        width: 100,
        height: 100,
        x: spec.left,
        y: spec.top,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  const navigate = (guid: string, direction: Direction): string | null =>
    h.list.getCardNavigationTargetGuid(guid, direction);
  return { h, navigate };
}

// Three rows: a b c / d e / f
const GRID: CardSpec[] = [
  { guid: "a", top: 0, left: 0 },
  { guid: "b", top: 0, left: 200 },
  { guid: "c", top: 0, left: 400 },
  { guid: "d", top: 200, left: 0 },
  { guid: "e", top: 200, left: 200 },
  { guid: "f", top: 400, left: 0 },
];

describe("ArticleList.getCardNavigationTargetGuid characterization", () => {
  afterEach(() => {
    document.body.empty();
  });

  it("returns null when there are no cards", () => {
    const { h, navigate } = setupCards([]);
    expect(navigate("a", "right")).toBeNull();
    h.cleanup();
  });

  it("returns the first card when the current guid is not rendered", () => {
    const { h, navigate } = setupCards(GRID);
    expect(navigate("missing", "down")).toBe("a");
    h.cleanup();
  });

  it("moves left and right within a row and stops at the row edges", () => {
    const { h, navigate } = setupCards(GRID);
    expect(navigate("b", "left")).toBe("a");
    expect(navigate("b", "right")).toBe("c");
    expect(navigate("a", "left")).toBeNull();
    expect(navigate("c", "right")).toBeNull();
    expect(navigate("e", "right")).toBeNull();
    h.cleanup();
  });

  it("moves up and down keeping the column and stops at the first and last row", () => {
    const { h, navigate } = setupCards(GRID);
    expect(navigate("b", "down")).toBe("e");
    expect(navigate("e", "up")).toBe("b");
    expect(navigate("a", "up")).toBeNull();
    expect(navigate("f", "down")).toBeNull();
    h.cleanup();
  });

  it("clamps the column to the last card of a shorter target row", () => {
    const { h, navigate } = setupCards(GRID);
    expect(navigate("c", "down")).toBe("e");
    expect(navigate("e", "down")).toBe("f");
    h.cleanup();
  });

  it("groups cards whose tops differ by up to 6px into one row", () => {
    const { h, navigate } = setupCards([
      { guid: "a", top: 0, left: 0 },
      { guid: "b", top: 6, left: 200 },
      { guid: "c", top: 7, left: 400 },
    ]);
    expect(navigate("a", "right")).toBe("b");
    expect(navigate("b", "right")).toBe("c");
    expect(navigate("b", "down")).toBeNull();
    h.cleanup();
  });

  it("orders rows and columns by position rather than DOM order", () => {
    const { h, navigate } = setupCards([
      { guid: "d", top: 200, left: 200 },
      { guid: "b", top: 0, left: 200 },
      { guid: "c", top: 200, left: 0 },
      { guid: "a", top: 0, left: 0 },
    ]);
    expect(navigate("a", "right")).toBe("b");
    expect(navigate("a", "down")).toBe("c");
    expect(navigate("d", "left")).toBe("c");
    expect(navigate("d", "up")).toBe("b");
    h.cleanup();
  });

  it("ignores cards that have no article guid", () => {
    const { h, navigate } = setupCards(GRID);
    const stray = h.container.createDiv({ cls: "rss-dashboard-article-card" });
    stray.getBoundingClientRect = () =>
      ({ top: 0, left: 100, width: 10, height: 10 }) as DOMRect;
    expect(navigate("a", "right")).toBe("b");
    h.cleanup();
  });
});

describe("ArticleList.renderArticles characterization", () => {
  afterEach(() => {
    document.body.empty();
  });

  it("renders pagination before the list when paginationPosition is top", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        display: { paginationPosition: "top" },
      },
      articles: [buildArticle({ guid: "1" })],
      totalPages: 2,
      totalArticles: 20,
    });
    h.list.render();
    const kids = Array.from(h.container.children);
    const pagIdx = kids.findIndex((el) =>
      el.classList.contains("rss-dashboard-pagination-wrapper"),
    );
    const listIdx = kids.findIndex((el) =>
      el.classList.contains("rss-dashboard-articles-list"),
    );
    expect(pagIdx).toBeGreaterThanOrEqual(0);
    expect(pagIdx).toBeLessThan(listIdx);
    h.cleanup();
  });

  it("renders pagination after the list when paginationPosition is bottom", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        display: { paginationPosition: "bottom" },
      },
      articles: [buildArticle({ guid: "1" })],
      totalPages: 2,
      totalArticles: 20,
    });
    h.list.render();
    const kids = Array.from(h.container.children);
    const pagIdx = kids.findIndex((el) =>
      el.classList.contains("rss-dashboard-pagination-wrapper"),
    );
    const listIdx = kids.findIndex((el) =>
      el.classList.contains("rss-dashboard-articles-list"),
    );
    expect(pagIdx).toBeGreaterThan(listIdx);
    h.cleanup();
  });

  it("renders no pagination wrapper at the bottom when there are no articles", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        display: { paginationPosition: "top" },
      },
      articles: [],
    });
    h.list.render();
    expect(
      h.container.querySelector(".rss-dashboard-pagination-wrapper"),
    ).toBeNull();
    h.cleanup();
  });

  it("renders the view-style class on the articles list", () => {
    for (const viewStyle of ["list", "card", "feed"] as const) {
      const h = createArticleListHarness({
        settings: { viewStyle, articleGroupBy: "none" },
        articles: [buildArticle({ guid: "1" })],
      });
      h.list.render();
      expect(
        h.container.querySelector(
          `.rss-dashboard-articles-list.rss-dashboard-${viewStyle}-view`,
        ),
      ).not.toBeNull();
      h.cleanup();
    }
  });

  it("renders grouped articles for each view style with a collapsible header", () => {
    for (const viewStyle of ["list", "card", "feed"] as const) {
      const h = createArticleListHarness({
        settings: { viewStyle, articleGroupBy: "date" },
        articles: [buildArticle({ guid: "1" })],
      });
      h.list.render();
      const groups = h.container.querySelectorAll(
        ".rss-dashboard-article-group",
      );
      expect(groups.length).toBeGreaterThan(0);
      expect(
        groups[0]?.querySelector(".rss-dashboard-article-group-toggle"),
      ).not.toBeNull();
      h.cleanup();
    }
  });

  it("starts a group collapsed when its name is in collapsedFeedSections", () => {
    const probe = createArticleListHarness({
      settings: { viewStyle: "list", articleGroupBy: "date" },
      articles: [buildArticle({ guid: "1" })],
    });
    probe.list.render();
    const groupName =
      probe.container.querySelector(".rss-dashboard-article-group-title")
        ?.textContent ?? "";
    probe.cleanup();
    expect(groupName).not.toBe("");

    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "date",
        collapsedFeedSections: [groupName],
      },
      articles: [buildArticle({ guid: "1" })],
    });
    h.list.render();
    expect(
      h.container
        .querySelector(".rss-dashboard-article-group-content")
        ?.classList.contains("collapsed"),
    ).toBe(true);
    expect(
      h.container
        .querySelector(".rss-dashboard-article-group-toggle")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    h.cleanup();
  });

  it("wires the empty-state action to the callback matching actionTarget", () => {
    for (const [actionTarget, key] of [
      ["per-feed-settings", "onOpenPerFeedSettings"],
      ["view-filter", "onOpenViewFilters"],
    ] as const) {
      const onAction = vi.fn();
      const h = createArticleListHarness({
        settings: { viewStyle: "list" },
        articles: [],
        callbacks: { [key]: onAction },
      });
      h.list.setEmptyStateContext({
        type: "AllArticlesFiltered",
        unfilteredCount: 3,
        filteredCount: 0,
        filterReason: "view-filter",
        actionLabel: "Act",
        actionTarget,
      });
      h.list.render();
      h.container
        .querySelector<HTMLElement>(".rss-dashboard-empty-state-button")
        ?.click();
      expect(onAction).toHaveBeenCalledTimes(1);
      h.cleanup();
    }
  });
});
