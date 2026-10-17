import { afterEach, describe, expect, it } from "vitest";
import { createArticleListHarness } from "./article-list-harness";

// jsdom has no layout, so each card reports the rectangle the spec gives it.
function setupCards(specs: Array<[guid: string, top: number, left: number]>) {
  const h = createArticleListHarness({ settings: { viewStyle: "card" } });
  for (const [guid, top, left] of specs) {
    const card = h.container.createDiv({
      cls: "rss-dashboard-article-card",
    });
    card.dataset.articleGuid = guid;
    card.getBoundingClientRect = () =>
      ({ top, left, width: 100, height: 100 }) as DOMRect;
  }
  return h;
}

describe("ArticleList card row grouping tolerance", () => {
  afterEach(() => {
    document.body.empty();
  });

  it("keeps a card in the row of a later member within tolerance, even when the row's first card is not", () => {
    // a=0, b=5, c=10: c is 10px below a but only 5px below b, so all three share a row.
    const h = setupCards([
      ["a", 0, 0],
      ["b", 5, 200],
      ["c", 10, 400],
    ]);

    expect(h.list.getCardNavigationTargetGuid("a", "right")).toBe("b");
    expect(h.list.getCardNavigationTargetGuid("b", "right")).toBe("c");
    expect(h.list.getCardNavigationTargetGuid("b", "down")).toBeNull();
    h.cleanup();
  });

  it("keeps rows a card height apart separate when their tops drift within tolerance", () => {
    const h = setupCards([
      ["a", 0, 0],
      ["b", 5, 200],
      ["c", 200, 0],
      ["d", 205, 200],
    ]);

    expect(h.list.getCardNavigationTargetGuid("a", "down")).toBe("c");
    expect(h.list.getCardNavigationTargetGuid("b", "down")).toBe("d");
    expect(h.list.getCardNavigationTargetGuid("d", "up")).toBe("b");
    h.cleanup();
  });
});
