import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type WorkspaceLeaf } from "obsidian";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../src/types/types";

type ViewState = {
  currentFolder: string | null;
  unreadArticlesPage: number;
  readArticlesPage: number;
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const openViews: RssDashboardView[] = [];

beforeEach(() => {
  // jsdom lacks CSS.escape; fixture identifiers contain only letters/hyphens.
  vi.stubGlobal("CSS", { escape: (value: string) => value });
});

afterEach(async () => {
  for (const view of openViews.splice(0)) await view.onClose();
  document.body.empty();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const reduceMotion = (): void => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
      }) as MediaQueryList,
  );
};

type FixtureOptions = {
  viewStyle?: "list" | "card" | "feed";
  folder?: string | null;
  read?: boolean;
  articleCount?: number;
  pageSize?: number;
  page?: number;
};

async function fixture(options: FixtureOptions = {}) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.viewStyle = options.viewStyle ?? "card";
  settings.articleGroupBy = "none";
  settings.articleFilter = { type: "none", value: null };
  settings.dashboardMultiFilters = {
    statusFilters: [],
    tagFilters: [],
    logic: "OR",
  };
  settings.display.showFilterStatusBar = true;
  settings.display.showAllFeedsUnreadBadges = true;
  settings.allArticlesPageSize = 0;
  settings.keywordRules.rules = [];
  settings.folders = [];

  const url = "https://example.com/feed";
  const count = options.articleCount ?? 2;
  const items: FeedItem[] = Array.from({ length: count }, (_, index) => ({
    guid: `a${index + 1}`,
    title: `Article ${index + 1}`,
    link: `${url}/${index + 1}`,
    description: "",
    pubDate: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    read: options.read ?? false,
    starred: false,
    tags: [],
    feedUrl: url,
    feedTitle: "Feed",
    coverImage: "",
  }));
  settings.feeds = [
    { title: "Feed", url, folder: "", items, lastUpdated: 0 } as Feed,
  ];
  settings.unreadArticlesPageSize = options.pageSize ?? 0;
  settings.readArticlesPageSize = options.pageSize ?? 0;

  const app = new App();
  const persistence = deferred();
  const updateArticle = vi.fn(() => persistence.promise);
  const queueArticleStateSave = vi.fn();
  const flushPendingWrites = vi.fn(async () => {});
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle,
    queueArticleStateSave,
    flushPendingWrites,
    resolveCachedImageUrl: () => undefined,
  };
  const view = new RssDashboardView(
    { app } as unknown as WorkspaceLeaf,
    plugin as never,
  );
  const state = view as unknown as ViewState;
  state.currentFolder =
    options.folder === undefined ? "unread" : options.folder;
  state.unreadArticlesPage = options.page ?? 1;
  state.readArticlesPage = options.page ?? 1;
  openViews.push(view);
  document.body.append(view.containerEl);
  await view.onOpen();

  const row = (guid: string) =>
    Array.from(view.containerEl.querySelectorAll<HTMLElement>("[id]")).find(
      (element) => element.id === `article-${guid}`,
    ) ?? null;
  const rowIds = () =>
    Array.from(
      view.containerEl.querySelectorAll<HTMLElement>(
        ".rss-dashboard-article-item, .rss-dashboard-article-card, .rss-dashboard-feed-item",
      ),
    )
      .map((element) => element.id)
      .sort();
  const sidebarUnread = () =>
    view.containerEl.querySelector(".rss-dashboard-all-feeds-unread")
      ?.textContent ?? null;
  const status = () =>
    view.containerEl.querySelector(".rss-dashboard-filter-subheader")
      ?.textContent ?? "";
  const clickRead = (guid: string) => {
    const control = row(guid)?.querySelector<HTMLElement>(
      ".rss-dashboard-read-toggle",
    );
    if (!control) throw new Error(`No read control for ${guid}`);
    control.click();
  };

  return {
    view,
    items,
    updateArticle,
    queueArticleStateSave,
    flushPendingWrites,
    persistence,
    row,
    rowIds,
    sidebarUnread,
    status,
    clickRead,
  };
}

describe("dashboard write-back article state", () => {
  it("starts removing a card under the unread filter and updates the counts before persistence resolves", async () => {
    reduceMotion();
    const f = await fixture({ viewStyle: "card" });
    expect(f.rowIds()).toEqual(["article-a1", "article-a2"]);
    expect(f.sidebarUnread()).toBe("2");
    expect(f.status()).toContain("Showing 2");

    f.clickRead("a1");

    expect(f.row("a1")).toBeNull();
    expect(f.rowIds()).toEqual(["article-a2"]);
    expect(f.sidebarUnread()).toBe("1");
    expect(f.status()).toContain("Showing 1");
    expect(f.updateArticle).toHaveBeenCalledWith(
      "a1",
      "https://example.com/feed",
      { read: true },
      false,
    );
  });

  it("starts removing a feed row marked unread under the read filter before persistence resolves", async () => {
    reduceMotion();
    const f = await fixture({
      viewStyle: "feed",
      folder: "read",
      read: true,
      articleCount: 2,
    });
    expect(f.rowIds()).toEqual(["article-a1", "article-a2"]);
    expect(f.status()).toContain("Showing 2");

    f.clickRead("a2");

    expect(f.row("a2")).toBeNull();
    expect(f.rowIds()).toEqual(["article-a1"]);
    expect(f.sidebarUnread()).toBe("1");
    expect(f.status()).toContain("Showing 1");
    expect(f.updateArticle).toHaveBeenCalledWith(
      "a2",
      "https://example.com/feed",
      { read: false },
      false,
    );
  });

  it("removes each of several quickly clicked cards without waiting for persistence", async () => {
    reduceMotion();
    const f = await fixture({ viewStyle: "card", articleCount: 3 });
    expect(f.sidebarUnread()).toBe("3");

    f.clickRead("a1");
    f.clickRead("a2");
    expect(f.rowIds()).toEqual(["article-a3"]);
    expect(f.sidebarUnread()).toBe("1");

    f.clickRead("a3");
    expect(f.rowIds()).toEqual([]);
    expect(f.sidebarUnread()).toBeNull();
    expect(f.status()).toContain("Showing 0");
    expect(f.updateArticle).toHaveBeenCalledTimes(3);
  });

  it("clamps to the previous page when the last row on the page is removed", async () => {
    reduceMotion();
    const f = await fixture({
      viewStyle: "card",
      articleCount: 3,
      pageSize: 2,
      page: 2,
    });
    expect(f.rowIds()).toEqual(["article-a1"]);
    expect(f.status()).toContain("Showing 3");

    f.clickRead("a1");

    expect(f.rowIds()).toEqual(["article-a2", "article-a3"]);
    expect(f.status()).toContain("Showing 2");
    expect(f.sidebarUnread()).toBe("2");
  });

  it("shows the empty state when the last matching row is removed", async () => {
    reduceMotion();
    const f = await fixture({ viewStyle: "card", articleCount: 1 });

    f.clickRead("a1");

    expect(f.rowIds()).toEqual([]);
    expect(
      f.view.containerEl.querySelector(".rss-dashboard-empty-state"),
    ).not.toBeNull();
    expect(f.status()).toContain("Showing 0");
  });

  // #1468 replaced "focus the next card's read control": a read control is a
  // role="button", which the dashboard keymap ignores, so shortcuts went dead.
  it("returns focus to the dashboard after the focused row leaves", async () => {
    reduceMotion();
    const f = await fixture({ viewStyle: "card", articleCount: 3 });
    const focused = f
      .row("a2")
      ?.querySelector<HTMLElement>(".rss-dashboard-read-toggle");
    focused?.focus();
    expect(document.activeElement).toBe(focused);

    f.clickRead("a2");

    expect(document.activeElement).toBe(f.view.containerEl);
  });

  it("hands UI article-state descriptors to the plugin facade when marking all as read", async () => {
    reduceMotion();
    const f = await fixture({ viewStyle: "card", articleCount: 2 });

    f.view.actionMarkAllAsRead();

    expect(f.queueArticleStateSave).toHaveBeenCalledTimes(1);
    expect(f.queueArticleStateSave.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        {
          feedUrl: "https://example.com/feed",
          guid: "a1",
          changes: { read: true },
        },
        {
          feedUrl: "https://example.com/feed",
          guid: "a2",
          changes: { read: true },
        },
      ]),
    );
  });

  it("does not rebuild the page when a removal leaves it non-empty", async () => {
    reduceMotion();
    const f = await fixture({
      viewStyle: "card",
      articleCount: 5,
      pageSize: 2,
      page: 1,
    });
    const render = vi.spyOn(f.view, "render");
    const firstRowId = f.rowIds()[0];
    if (!firstRowId) throw new Error("Expected a rendered row");

    f.clickRead(firstRowId.replace(/^article-/, ""));

    // The total fell from 5 to 4, a page multiple, but page 1 still has rows.
    // Only an emptied page or list needs the full rebuild (#1380).
    expect(render).not.toHaveBeenCalled();
  });

  it("notifies once when persisting a dashboard change fails", async () => {
    reduceMotion();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const f = await fixture({ viewStyle: "card", articleCount: 1 });
    f.updateArticle.mockRejectedValueOnce(new Error("disk full"));

    f.clickRead("a1");

    await vi.waitFor(() => {
      const notices = debug.mock.calls
        .filter((args) => args[0] === "[Stub Notice]")
        .map((args) => String(args[1]))
        .filter((message) => message.includes("disk full"));
      expect(notices).toHaveLength(1);
    });
  });

  it("flushes queued article state when the dashboard closes", async () => {
    const f = await fixture();

    await f.view.onClose();

    expect(f.flushPendingWrites).toHaveBeenCalledTimes(1);
  });

  it("starts the card collapse immediately and removes it after the animation", async () => {
    const f = await fixture({ viewStyle: "card", articleCount: 2 });

    f.clickRead("a1");

    const leaving = f.row("a1");
    expect(leaving).not.toBeNull();
    expect(leaving?.style.transition).toContain("opacity");

    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(f.row("a1")).toBeNull();
    expect(f.rowIds()).toEqual(["article-a2"]);
  });
});
