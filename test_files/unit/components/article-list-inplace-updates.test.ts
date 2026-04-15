import { afterEach, describe, expect, it, vi } from "vitest";
import { buildArticle, createArticleListHarness } from "./article-list-harness";

describe("Phase 7 - ArticleList in-place updates", () => {
  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("updateArticleInPlace should sync read/saved/starred classes and toggle titles", () => {
    const h = createArticleListHarness({
      settings: {
        viewStyle: "list",
        articleGroupBy: "none",
        articleSort: "newest",
        display: {
          mobileListToolbarStyle: "left-grid",
        } as any,
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

    expect(readToggle?.getAttribute("title")).toBe("Mark as read");
    expect(saveToggle?.getAttribute("title")).toContain("Save");
    expect(starToggle?.getAttribute("title")).toBe("Add to starred items");

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

    expect(readToggle?.getAttribute("title")).toBe("Mark as unread");
    expect(saveToggle?.getAttribute("title")).toBe(
      "Click to open saved article",
    );
    expect(starToggle?.getAttribute("title")).toBe("Remove from starred items");

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
      ".rss-dashboard-article-tag",
    );
    expect(tagEl?.style.getPropertyValue("--tag-color")).toBe("#000000");

    h.list.syncVisibleArticlesFromSource(() => backingArticle);
    h.list.refreshVisibleArticleTags();

    const updatedTagEl = h
      .getArticleEl("1")
      ?.querySelector<HTMLElement>(".rss-dashboard-article-tag");
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
    expect((h.callbacks as any).onPersistSettings).toHaveBeenCalled();
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

    expect(nextButton?.nextElementSibling).toBe(markPageReadButton);
    expect(markPageReadButton?.nextElementSibling).toBe(pageSizeDropdown);

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
    expect((h.callbacks as any).onPersistSettings).toHaveBeenCalledTimes(1);
    expect(h.getArticleEl("1")?.classList.contains("read")).toBe(true);
    expect(h.getArticleEl("2")?.classList.contains("read")).toBe(true);
    expect(h.getArticleEl("3")?.classList.contains("read")).toBe(true);

    h.cleanup();
  });
});
