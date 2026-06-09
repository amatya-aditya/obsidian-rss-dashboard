import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderListView } from "../../../../../src/components/article-list/views/list-view";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

describe("list-view", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders list items with title", () => {
    renderListView(
      container,
      [makeArticle()],
      {
        ...baseViewContext(),
        showListToolbar: true,
        listToolbarStyle: "left-grid",
      },
      baseViewDeps(),
    );

    const item = container.querySelector(".rss-dashboard-article-item");
    expect(item).toBeTruthy();
    expect(
      item?.querySelector(".rss-dashboard-list-title")?.textContent,
    ).toBe("Test Article");
  });

  it("applies bottom-row layout class when configured", () => {
    renderListView(
      container,
      [makeArticle()],
      {
        ...baseViewContext(),
        showListToolbar: true,
        listToolbarStyle: "bottom-row",
      },
      baseViewDeps(),
    );

    expect(
      container.querySelector(".rss-dashboard-list-item-bottom-row"),
    ).toBeTruthy();
    expect(container.querySelector(".rss-dashboard-list-footer")).toBeTruthy();
  });

  it("creates action toolbar in left-grid mode when toolbar is shown", () => {
    const deps = baseViewDeps();
    renderListView(
      container,
      [makeArticle()],
      {
        ...baseViewContext(),
        showListToolbar: true,
        listToolbarStyle: "left-grid",
      },
      deps,
    );

    expect(container.querySelector(".rss-dashboard-list-toolbar")).toBeTruthy();
    expect(deps.createArticleActionButtons).toHaveBeenCalled();
  });

  it("omits toolbar when showListToolbar is false", () => {
    const deps = baseViewDeps();
    renderListView(
      container,
      [makeArticle()],
      {
        ...baseViewContext(),
        showListToolbar: false,
        listToolbarStyle: "left-grid",
      },
      deps,
    );

    expect(deps.createArticleActionButtons).not.toHaveBeenCalled();
    expect(
      container.querySelector(".rss-dashboard-grid-actions-empty"),
    ).toBeTruthy();
  });

  it("calls onArticleClick when item is clicked", () => {
    const article = makeArticle();
    const onArticleClick = vi.fn();
    renderListView(
      container,
      [article],
      {
        ...baseViewContext({ callbacks: { onArticleClick } }),
        showListToolbar: false,
        listToolbarStyle: "minimal",
      },
      baseViewDeps(),
    );

    container.querySelector(".rss-dashboard-article-item")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    expect(onArticleClick).toHaveBeenCalledWith(article);
  });
});
