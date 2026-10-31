import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderListView } from "../../../../../src/components/article-list/views/list-view";
import { MAX_VISIBLE_TAGS } from "../../../../../src/components/article-list/utils/tag-layout-utils";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

describe("list-view characterization", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createDiv();
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.empty();
    vi.clearAllMocks();
  });

  it("preserves bottom-row item state, source, tags, dates, and event behavior", () => {
    const article = makeArticle({
      guid: "podcast-guid",
      mediaType: "podcast",
      read: true,
      starred: true,
      saved: true,
      tags: Array.from({ length: MAX_VISIBLE_TAGS + 2 }, (_, index) => ({
        name: `Tag ${index + 1}`,
        color: `#${index + 1}`,
      })),
    });
    const onArticleClick = vi.fn();
    const showArticleContextMenu = vi.fn();
    const renderFeedIcon = vi.fn();
    const createArticleActionButtons = vi.fn();
    const scheduleMathRendering = vi.fn();
    const ctx = {
      ...baseViewContext({
        callbacks: { onArticleClick },
        selectedArticle: article,
      }),
      showListToolbar: true,
      listToolbarStyle: "bottom-row" as const,
    };

    renderListView(
      container,
      [article],
      ctx,
      baseViewDeps({
        createArticleActionButtons,
        renderFeedIcon,
        scheduleMathRendering,
        showArticleContextMenu,
      }),
    );

    const item = container.querySelector<HTMLElement>(
      ".rss-dashboard-article-item",
    );
    expect(item?.classList.contains("active")).toBe(true);
    expect(item?.classList.contains("read")).toBe(true);
    expect(item?.classList.contains("starred")).toBe(true);
    expect(item?.classList.contains("saved")).toBe(true);
    expect(item?.classList.contains("podcast")).toBe(true);
    expect(item?.id).toBe("article-podcast-guid");
    expect(item?.dataset.feedUrl).toBe(article.feedUrl);
    expect(item?.classList.contains("rss-dashboard-list-item-bottom-row")).toBe(
      true,
    );
    expect(item?.querySelector(".rss-dashboard-list-title")?.textContent).toBe(
      article.title,
    );
    expect(scheduleMathRendering).toHaveBeenCalledWith(
      item?.querySelector(".rss-dashboard-list-title"),
    );
    expect(item?.querySelector(".rss-dashboard-grid-time")).toBeNull();
    expect(
      item?.querySelector(".rss-dashboard-grid-actions-empty"),
    ).toBeTruthy();
    expect(item?.querySelector(".rss-dashboard-list-footer")).toBeTruthy();
    expect(
      item?.querySelectorAll(
        ".rss-dashboard-list-body-tags .rss-dashboard-tag-badge",
      ),
    ).toHaveLength(MAX_VISIBLE_TAGS);
    expect(
      item?.querySelector(".rss-dashboard-tag-overflow")?.textContent,
    ).toBe("+2");
    expect(
      item
        ?.querySelector(".rss-dashboard-tag-overflow")
        ?.getAttribute("aria-label"),
    ).toBe("Tag 7, Tag 8");
    expect(renderFeedIcon).toHaveBeenCalledWith(
      item?.querySelector(".rss-dashboard-article-meta"),
      article.feedUrl,
      article.mediaType,
    );
    expect(createArticleActionButtons).toHaveBeenCalledWith(
      item?.querySelector(
        ".rss-dashboard-list-footer .rss-dashboard-action-toolbar",
      ),
      article,
      "full",
    );

    item?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    item?.dispatchEvent(contextMenuEvent);
    expect(onArticleClick).toHaveBeenCalledWith(article);
    expect(showArticleContextMenu).toHaveBeenCalledWith(
      contextMenuEvent,
      article,
    );
    expect(contextMenuEvent.defaultPrevented).toBe(true);
  });

  it.each([
    { style: "left-grid" as const, mode: "full" as const, showsTags: true },
    {
      style: "minimal" as const,
      mode: "minimal-read" as const,
      showsTags: false,
    },
  ])("preserves the $style toolbar variant", ({ style, mode, showsTags }) => {
    const article = makeArticle({
      tags: [{ name: "Research", color: "#123456" }],
    });
    const createArticleActionButtons = vi.fn();

    renderListView(
      container,
      [article],
      {
        ...baseViewContext(),
        showListToolbar: true,
        listToolbarStyle: style,
      },
      baseViewDeps({ createArticleActionButtons }),
    );

    const item = container.querySelector<HTMLElement>(
      ".rss-dashboard-article-item",
    );
    expect(item?.querySelector(".rss-dashboard-action-toolbar")).toBeTruthy();
    expect(
      !!item?.querySelector(
        ".rss-dashboard-tag-container .rss-dashboard-tag-badge",
      ),
    ).toBe(showsTags);
    expect(createArticleActionButtons).toHaveBeenCalledWith(
      item?.querySelector(".rss-dashboard-action-toolbar"),
      article,
      mode,
    );
  });
});
