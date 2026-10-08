import { afterEach, describe, expect, it } from "vitest";
import { buildArticle, createArticleListHarness } from "./article-list-harness";

type Harness = ReturnType<typeof createArticleListHarness>;

function typeSearch(h: Harness, value: string): void {
  const input = h.container.querySelector<HTMLInputElement>(
    ".rss-dashboard-article-search-input",
  );
  if (!input) throw new Error("search input not rendered");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function isHidden(h: Harness, guid: string): boolean {
  return (
    h.getArticleEl(guid)?.classList.contains("rss-dashboard-search-hidden") ??
    false
  );
}

describe("ArticleList search query casing (#902)", () => {
  let h: Harness;

  afterEach(() => h.cleanup());

  function setup(viewStyle: "list" | "card" | "feed" = "card"): void {
    h = createArticleListHarness({
      settings: { viewStyle, articleGroupBy: "none", articleSort: "newest" },
      articles: [
        buildArticle({ guid: "1", title: "Samsung unveils new AI chip" }),
        buildArticle({ guid: "2", title: "Something else entirely" }),
      ],
    });
    h.list.render();
  }

  it.each(["list", "card", "feed"] as const)(
    "keeps matching %s items visible for a query with uppercase letters",
    (viewStyle) => {
      setup(viewStyle);
      typeSearch(h, "Samsung");
      expect(isHidden(h, "1")).toBe(false);
      expect(isHidden(h, "2")).toBe(true);
    },
  );

  it("matches a multi-word mixed-case query and ignores surrounding whitespace", () => {
    setup();
    typeSearch(h, "  AI Chip ");
    expect(isHidden(h, "1")).toBe(false);
    expect(isHidden(h, "2")).toBe(true);
  });

  it("keeps the match visible after the list is recreated by refilter", () => {
    setup();
    typeSearch(h, "Samsung");
    h.list.refilter(new Set(), new Set(), "OR", h.articles, 1, 1, 10, 2);
    expect(isHidden(h, "1")).toBe(false);
    expect(isHidden(h, "2")).toBe(true);
  });

  it("shows every item again when the query is cleared", () => {
    setup();
    typeSearch(h, "Samsung");
    typeSearch(h, "");
    expect(isHidden(h, "2")).toBe(false);
  });
});
