import { afterEach, describe, expect, it } from "vitest";
import { buildArticle, createArticleListHarness } from "./article-list-harness";

// The dashboard rebuilds its ArticleList on every render, so the search a user
// typed has to be handed to the new list rather than living only inside the
// old one (#1465).
describe("ArticleList restoring a search into a rebuilt list", () => {
  let cleanup = () => {};

  afterEach(() => cleanup());

  function setup() {
    const h = createArticleListHarness({
      settings: { viewStyle: "card" },
      articles: [
        buildArticle({ guid: "1", title: "Samsung unveils new AI chip" }),
        buildArticle({ guid: "2", title: "Something else entirely" }),
      ],
    });
    cleanup = h.cleanup;
    return h;
  }

  function searchInput(h: ReturnType<typeof setup>): HTMLInputElement | null {
    return h.container.querySelector<HTMLInputElement>(
      ".rss-dashboard-article-search-input",
    );
  }

  it("shows the restored query and filters the rows when set before render", () => {
    const h = setup();

    h.list.setSearchQuery("Samsung");
    h.list.render();

    expect(searchInput(h)?.value).toBe("Samsung");
    expect(h.getVisibleArticleIds()).toEqual(["1"]);
  });

  it("restores a query into a list that has already rendered", () => {
    const h = setup();
    h.list.render();

    h.list.setSearchQuery("Samsung");

    expect(searchInput(h)?.value).toBe("Samsung");
    expect(h.getVisibleArticleIds()).toEqual(["1"]);
  });

  it("keeps the query case as typed while matching without case", () => {
    const h = setup();

    h.list.setSearchQuery("  SAMSUNG ");
    h.list.render();

    expect(searchInput(h)?.value).toBe("  SAMSUNG ");
    expect(h.getVisibleArticleIds()).toEqual(["1"]);
  });

  it("shows every row again when the restored query is empty", () => {
    const h = setup();

    h.list.setSearchQuery("");
    h.list.render();

    expect(searchInput(h)?.value).toBe("");
    expect(h.getVisibleArticleIds()).toEqual(["1", "2"]);
  });

  it("unhides the rows when a rendered list's restored query is cleared", () => {
    const h = setup();
    h.list.setSearchQuery("Samsung");
    h.list.render();

    h.list.setSearchQuery("");

    expect(searchInput(h)?.value).toBe("");
    expect(h.getVisibleArticleIds()).toEqual(["1", "2"]);
  });
});
