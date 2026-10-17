import { afterEach, describe, expect, it } from "vitest";
import { createArticleListHarness } from "./article-list-harness";

describe("ArticleList card row grouping characterization", () => {
  afterEach(() => {
    document.body.empty();
  });

  // BUG: pinned, see #1262
  it("starts a new row for a card within tolerance of a later row member but not of the row's first card", () => {
    const h = createArticleListHarness({ settings: { viewStyle: "card" } });
    const tops: Array<[string, number, number]> = [
      ["a", 0, 0],
      ["b", 5, 200],
      ["c", 10, 400],
    ];
    for (const [guid, top, left] of tops) {
      const card = h.container.createDiv({
        cls: "rss-dashboard-article-card",
      });
      card.dataset.articleGuid = guid;
      card.getBoundingClientRect = () =>
        ({ top, left, width: 100, height: 100 }) as DOMRect;
    }

    // c sits 5px below b but 10px below a, so it lands in its own row.
    expect(h.list.getCardNavigationTargetGuid("b", "right")).toBeNull();
    expect(h.list.getCardNavigationTargetGuid("b", "down")).toBe("c");
    h.cleanup();
  });
});
