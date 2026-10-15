/**
 * Article footers are not landmarks (WCAG 2.2 1.3.1 Info and Relationships;
 * Slice 4 audit row L-002 of #826, AC-014g).
 *
 * A `<footer>` outside an `article`, `main` or `section` is exposed as a
 * `contentinfo` landmark, so a page of 50 cards listed 50 identical, unnamed
 * landmarks. The footer holds an action toolbar and a date, which are ordinary
 * content. Cards also must not become `role="article"`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderCardView } from "../../../../../src/components/article-list/views/card-view";
import { renderFeedView } from "../../../../../src/components/article-list/views/feed-view";
import { renderListView } from "../../../../../src/components/article-list/views/list-view";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

describe("article footers", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createDiv();
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  const articles = () => [
    makeArticle(),
    makeArticle({ guid: "second-guid", title: "Second Article" }),
  ];

  const views = [
    {
      name: "card",
      footer: ".rss-dashboard-card-footer",
      item: ".rss-dashboard-article-card",
      render: () =>
        renderCardView(
          container,
          articles(),
          { ...baseViewContext(), showCardToolbar: true },
          baseViewDeps(),
        ),
    },
    {
      name: "feed",
      footer: ".rss-dashboard-feed-footer",
      item: ".rss-dashboard-feed-item",
      render: () =>
        renderFeedView(
          container,
          articles(),
          baseViewContext(),
          baseViewDeps(),
        ),
    },
    {
      name: "list (bottom row)",
      footer: ".rss-dashboard-list-footer",
      item: ".rss-dashboard-article-item",
      render: () =>
        renderListView(
          container,
          articles(),
          {
            ...baseViewContext(),
            showListToolbar: true,
            listToolbarStyle: "bottom-row",
          },
          baseViewDeps(),
        ),
    },
  ];

  it.each(views)(
    "keeps the $name footer out of the landmark list",
    ({ render, footer }) => {
      render();

      expect(container.querySelectorAll(footer)).toHaveLength(2);
      // The element name alone makes a landmark: neither a <footer> nor an
      // explicit contentinfo role may be left on the footer.
      expect(container.querySelectorAll("footer")).toHaveLength(0);
      expect(container.querySelectorAll('[role="contentinfo"]')).toHaveLength(
        0,
      );
    },
  );

  it.each(views)(
    "keeps the $name footer's contents in place",
    ({ render, footer }) => {
      render();

      const footerEl = container.querySelector(footer)!;
      expect(
        footerEl.querySelector(".rss-dashboard-action-toolbar"),
      ).toBeTruthy();
      expect(
        footerEl.querySelector(".rss-dashboard-article-date"),
      ).toBeTruthy();
    },
  );

  it.each(views)("gives no $name item an article role", ({ render, item }) => {
    render();

    expect(container.querySelectorAll(item).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[role="article"]')).toHaveLength(0);
    expect(container.querySelectorAll("article")).toHaveLength(0);
  });
});
