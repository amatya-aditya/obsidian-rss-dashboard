import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderListView } from "../../../../../src/components/article-list/views/list-view";
import { MAX_VISIBLE_TAGS } from "../../../../../src/components/article-list/utils/tag-layout-utils";
import type { Tag } from "../../../../../src/types/types";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

describe("list-view", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createDiv();
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
    expect(item?.querySelector(".rss-dashboard-list-title")?.textContent).toBe(
      "Test Article",
    );
  });

  it("renders list tags from the registry when article copies are stale", () => {
    const context = baseViewContext();
    context.tagAppearanceSettings = {
      availableTags: [
        { name: "Topic", color: "#234567", textColor: "#765432" },
      ],
    };
    renderListView(
      container,
      [
        makeArticle({
          tags: [{ name: "Topic", color: "#stale", textColor: "#stale" }],
        }),
      ],
      {
        ...context,
        showListToolbar: true,
        listToolbarStyle: "left-grid",
      },
      baseViewDeps(),
    );

    const chip = container.querySelector<HTMLElement>(
      ".rss-dashboard-action-toolbar .rss-dashboard-tag-badge",
    );
    expect(chip?.style.getPropertyValue("--tag-color")).toBe("#234567");
    expect(chip?.style.getPropertyValue("--tag-text-color")).toBe("#765432");
  });

  it("renders list overflow chips with the first hidden tag's resolved appearance", () => {
    const context = baseViewContext();
    context.tagAppearanceSettings = {
      availableTags: [
        { name: "Hidden", color: "#234567", textColor: "#765432" },
      ],
    };
    const tags: Tag[] = Array.from(
      { length: MAX_VISIBLE_TAGS },
      (_, index) => ({
        name: `Visible ${index + 1}`,
        color: "#111111",
      }),
    );
    tags.push({ name: "Hidden", color: "#stale", textColor: "#stale" });

    renderListView(
      container,
      [makeArticle({ tags })],
      {
        ...context,
        showListToolbar: true,
        listToolbarStyle: "bottom-row",
      },
      baseViewDeps(),
    );

    const overflow = container.querySelector<HTMLElement>(
      ".rss-dashboard-list-body-tags .rss-dashboard-tag-overflow",
    );
    expect(overflow?.style.getPropertyValue("--tag-color")).toBe("#234567");
    expect(overflow?.style.getPropertyValue("--tag-text-color")).toBe(
      "#765432",
    );
  });

  it("shows the first-seen date in the date badge when pubDate is empty and the fallback setting is on", () => {
    const firstSeenMs = Date.parse("2026-01-01T00:00:00Z");
    const ctx = baseViewContext();
    ctx.settings.useFirstSeenDateFallback = true;
    renderListView(
      container,
      [makeArticle({ pubDate: "", firstSeenMs })],
      {
        ...ctx,
        showListToolbar: true,
        listToolbarStyle: "left-grid",
      },
      baseViewDeps(),
    );

    const dateEl = container.querySelector(".rss-dashboard-article-date");
    expect(dateEl?.textContent).not.toMatch(/Invalid date/i);
    expect(dateEl?.textContent).toMatch(/\*$/);
    expect(dateEl?.getAttribute("aria-label")).toContain("First seen:");
  });

  it("shows 'Unknown date', not the first-seen date, in the date badge when pubDate is empty and the fallback setting is off", () => {
    const firstSeenMs = Date.parse("2026-01-01T00:00:00Z");
    renderListView(
      container,
      [makeArticle({ pubDate: "", firstSeenMs })],
      {
        ...baseViewContext(),
        showListToolbar: true,
        listToolbarStyle: "left-grid",
      },
      baseViewDeps(),
    );

    const dateEl = container.querySelector(".rss-dashboard-article-date");
    expect(dateEl?.textContent).toBe("Unknown date");
    expect(dateEl?.textContent).not.toMatch(/\*$/);
    expect(dateEl?.getAttribute("aria-label")).not.toContain("First seen:");
  });

  it("schedules math rendering for a list title while preserving its source", () => {
    const scheduleMathRendering = vi.fn();
    const rawTitle = String.raw`Direct product of $\mathrm{GL}_n$`;
    renderListView(
      container,
      [makeArticle({ title: rawTitle })],
      {
        ...baseViewContext(),
        showListToolbar: true,
        listToolbarStyle: "left-grid",
      },
      baseViewDeps({ scheduleMathRendering }),
    );

    const title = container.querySelector<HTMLElement>(
      ".rss-dashboard-article-title",
    );
    expect(scheduleMathRendering).toHaveBeenCalledWith(title);
    expect(title?.dataset.articleTitle).toBe(rawTitle);
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

    container
      .querySelector(".rss-dashboard-article-item")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onArticleClick).toHaveBeenCalledWith(article);
  });
});
