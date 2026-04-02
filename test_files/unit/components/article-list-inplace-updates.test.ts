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
    expect(saveToggle?.getAttribute("title")).toBe("Click to open saved article");
    expect(starToggle?.getAttribute("title")).toBe("Remove from starred items");

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
});
