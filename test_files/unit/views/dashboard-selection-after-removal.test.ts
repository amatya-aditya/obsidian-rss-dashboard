import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type WorkspaceLeaf } from "obsidian";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../src/types/types";

/**
 * When an action drops the selected card from the filtered list, the selection
 * moves to its rendered neighbour without opening the Reader, and mark-read-next
 * opens that neighbour once (#1468). Newest-first order renders a3, a2, a1.
 */
type ViewSeams = {
  currentFolder: string | null;
  selectedArticle: FeedItem | null;
  openSelectedArticle: (article: FeedItem) => Promise<void>;
  articleList: { getRenderedNeighbour: () => unknown };
};

const openViews: RssDashboardView[] = [];

beforeEach(() => {
  // jsdom lacks CSS.escape; fixture identifiers contain only letters/digits.
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  // Skip the collapse animation so a removal is synchronous.
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
      }) as MediaQueryList,
  );
});

afterEach(async () => {
  for (const view of openViews.splice(0)) await view.onClose();
  document.body.empty();
  vi.restoreAllMocks();
  // The CSS stub stays for the file: selection scrolls on a later frame, which
  // can land after a test ends. The isolated environment discards it.
});

type FixtureOptions = {
  viewStyle?: "list" | "card" | "feed";
  groupBy?: "none" | "feed";
  folder?: string | null;
  articleCount?: number;
  read?: boolean;
  starred?: boolean;
  /** Tags every article and filters the dashboard to this tag. */
  tagFilter?: string;
  /** Adds a second feed of two articles and collapses the named section. */
  collapsedSection?: "Feed" | "Feed Two";
};

async function fixture(options: FixtureOptions = {}) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.viewStyle = options.viewStyle ?? "list";
  settings.articleGroupBy = options.groupBy ?? "none";
  settings.articleFilter = { type: "none", value: null };
  settings.dashboardMultiFilters = {
    statusFilters: [],
    tagFilters: options.tagFilter ? [options.tagFilter] : [],
    logic: "OR",
  };
  settings.allArticlesPageSize = 0;
  settings.unreadArticlesPageSize = 0;
  settings.readArticlesPageSize = 0;
  settings.starredArticlesPageSize = 0;
  settings.keywordRules.rules = [];
  settings.folders = [];

  const url = "https://example.com/feed";
  const items: FeedItem[] = Array.from(
    { length: options.articleCount ?? 3 },
    (_, index) => ({
      guid: `a${index + 1}`,
      title: `Article ${index + 1}`,
      link: `${url}/${index + 1}`,
      description: "",
      pubDate: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
      read: options.read ?? false,
      starred: options.starred ?? false,
      tags: options.tagFilter
        ? [{ name: options.tagFilter, color: "#123456" }]
        : [],
      feedUrl: url,
      feedTitle: "Feed",
      coverImage: "",
    }),
  );
  settings.feeds = [
    { title: "Feed", url, folder: "", items, lastUpdated: 0 } as Feed,
  ];
  if (options.collapsedSection) {
    const otherUrl = "https://example.com/other";
    const otherItems: FeedItem[] = ["b1", "b2"].map((guid, index) => ({
      guid,
      title: `Other ${guid}`,
      link: `${otherUrl}/${guid}`,
      description: "",
      pubDate: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
      read: false,
      starred: false,
      tags: [],
      feedUrl: otherUrl,
      feedTitle: "Feed Two",
      coverImage: "",
    }));
    settings.feeds.push({
      title: "Feed Two",
      url: otherUrl,
      folder: "",
      items: otherItems,
      lastUpdated: 0,
    } as Feed);
    settings.collapsedFeedSections = [options.collapsedSection];
  }

  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
    queueArticleStateSave: vi.fn(),
    flushPendingWrites: vi.fn(async () => {}),
    resolveCachedImageUrl: () => undefined,
  };
  const view = new RssDashboardView(
    { app: new App() } as unknown as WorkspaceLeaf,
    plugin as never,
  );
  const seams = view as unknown as ViewSeams;
  seams.currentFolder =
    options.folder === undefined ? "unread" : options.folder;
  openViews.push(view);
  document.body.append(view.containerEl);
  await view.onOpen();

  // Replacing the open path keeps the tests off the Reader leaf.
  const opened: string[] = [];
  vi.spyOn(seams, "openSelectedArticle").mockImplementation((article) => {
    opened.push(article.guid);
    return Promise.resolve();
  });

  const row = (guid: string) =>
    Array.from(view.containerEl.querySelectorAll<HTMLElement>("[id]")).find(
      (element) => element.id === `article-${guid}`,
    ) ?? null;
  const control = (guid: string, selector: string) => {
    const el = row(guid)?.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`No ${selector} for ${guid}`);
    return el;
  };
  const select = (guid: string) => {
    const item = settings.feeds
      .flatMap((feed) => feed.items)
      .find((candidate) => candidate.guid === guid);
    if (!item) throw new Error(`No item ${guid}`);
    view.setSelectedArticleFromExternal(item);
  };
  const selectedGuid = () => seams.selectedArticle?.guid ?? null;
  const highlighted = () =>
    Array.from(
      view.containerEl.querySelectorAll<HTMLElement>(
        ".rss-dashboard-article-item.active, .rss-dashboard-article-card.active, .rss-dashboard-feed-item.active",
      ),
    ).map((element) => element.id);

  return {
    view,
    seams,
    plugin,
    items,
    url,
    opened,
    row,
    control,
    select,
    selectedGuid,
    highlighted,
  };
}

describe.each(["list", "card", "feed"] as const)(
  "selection follows a removed card in %s view",
  (viewStyle) => {
    it("selects the next rendered card without opening the Reader", async () => {
      const f = await fixture({ viewStyle });
      f.select("a2");

      await f.view.actionToggleReadStatus();

      expect(f.row("a2")).toBeNull();
      expect(f.selectedGuid()).toBe("a1");
      expect(f.highlighted()).toEqual(["article-a1"]);
      expect(f.opened).toEqual([]);
    });

    it("selects the previous card when the last rendered card is removed", async () => {
      const f = await fixture({ viewStyle });
      f.select("a1");

      await f.view.actionToggleReadStatus();

      expect(f.selectedGuid()).toBe("a2");
      expect(f.highlighted()).toEqual(["article-a2"]);
    });

    it("clears the selection when the only matching card is removed", async () => {
      const f = await fixture({ viewStyle, articleCount: 1 });
      f.select("a1");

      await f.view.actionToggleReadStatus();
      expect(f.selectedGuid()).toBeNull();
      expect(f.highlighted()).toEqual([]);

      // A following toggle has nothing to act on.
      f.plugin.updateArticle.mockClear();
      await f.view.actionToggleReadStatus();
      expect(f.plugin.updateArticle).not.toHaveBeenCalled();
    });
  },
);

describe("selection after removal, other filters and paths", () => {
  it("applies under the read filter when a card is marked unread", async () => {
    const f = await fixture({ folder: "read", read: true });
    f.select("a2");

    await f.view.actionToggleReadStatus();

    expect(f.row("a2")).toBeNull();
    expect(f.selectedGuid()).toBe("a1");
  });

  it("applies under the starred filter when a card is unstarred", async () => {
    const f = await fixture({ folder: "starred", starred: true });
    f.select("a2");

    await f.view.actionToggleStarStatus();

    expect(f.row("a2")).toBeNull();
    expect(f.selectedGuid()).toBe("a1");
  });

  it("skips rows the local search hides when choosing the neighbour", async () => {
    const f = await fixture();
    f.row("a1")?.classList.add("rss-dashboard-search-hidden");
    f.select("a2");

    await f.view.actionToggleReadStatus();

    expect(f.selectedGuid()).toBe("a3");
  });

  it("still finds a neighbour when the search hid the selected card itself", async () => {
    const f = await fixture();
    f.select("a2");
    f.row("a2")?.classList.add("rss-dashboard-search-hidden");

    await f.view.actionToggleReadStatus();

    expect(f.selectedGuid()).toBe("a1");
  });

  it("uses the rendered order in a grouped feed view", async () => {
    const f = await fixture({ viewStyle: "feed", groupBy: "feed" });
    f.select("a2");

    await f.view.actionToggleReadStatus();

    expect(f.selectedGuid()).toBe("a1");
  });

  it("applies under a tag filter when a tag edit drops the card", async () => {
    const f = await fixture({ tagFilter: "Review" });
    f.select("a2");

    f.view.applyExternalArticleUpdate("a2", f.url, { tags: [] });

    expect(f.row("a2")).toBeNull();
    expect(f.selectedGuid()).toBe("a1");
    expect(f.opened).toEqual([]);
  });

  it.each(["Feed", "Feed Two"] as const)(
    "skips cards in the collapsed %s section",
    async (collapsedSection) => {
      const f = await fixture({
        viewStyle: "feed",
        groupBy: "feed",
        collapsedSection,
      });
      const visible = Array.from(
        f.view.containerEl.querySelectorAll<HTMLElement>(
          ".rss-dashboard-feed-item",
        ),
      ).filter(
        (row) => !row.closest(".rss-dashboard-feed-section-cards.collapsed"),
      );
      const guidOf = (row: HTMLElement | undefined) =>
        row?.id.replace(/^article-/, "") ?? "";
      expect(visible.length).toBeGreaterThan(1);
      f.select(guidOf(visible[visible.length - 1]));

      await f.view.actionToggleReadStatus();

      // The collapsed section's cards are not on screen, so they never win.
      expect(f.selectedGuid()).toBe(guidOf(visible[visible.length - 2]));
    },
  );

  it("follows an update that arrives from the Reader", async () => {
    const f = await fixture();
    f.select("a2");

    f.view.applyExternalArticleUpdate("a2", f.url, { read: true });

    expect(f.selectedGuid()).toBe("a1");
    expect(f.opened).toEqual([]);
  });

  it("leaves mark all as read to its bulk re-render", async () => {
    const f = await fixture();
    f.select("a2");
    const walk = vi.spyOn(f.seams.articleList, "getRenderedNeighbour");

    f.view.actionMarkAllAsRead();

    expect(walk).not.toHaveBeenCalled();
  });
});

describe("mark read and next", () => {
  it("opens the advanced neighbour once when the filter removed the card", async () => {
    const f = await fixture();
    f.select("a3");

    await f.view.actionMarkReadAndNext();

    expect(f.opened).toEqual(["a2"]);
  });

  it("walks the list once across several presses with no skips", async () => {
    const f = await fixture();
    f.select("a3");

    await f.view.actionMarkReadAndNext();
    await f.view.actionMarkReadAndNext();
    await f.view.actionMarkReadAndNext();

    expect(f.opened).toEqual(["a2", "a1"]);
  });

  it("advances and opens one article when the read card stays in the list", async () => {
    const f = await fixture({ folder: null, read: true });
    f.select("a3");

    await f.view.actionMarkReadAndNext();

    expect(f.opened).toEqual(["a2"]);
  });
});

describe("footer control activation", () => {
  const click = (el: HTMLElement, detail: number) =>
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail }),
    );

  it("selects the card without opening it and hands focus to the dashboard after a click", async () => {
    const f = await fixture({ viewStyle: "card", folder: null });
    const star = f.control("a2", ".rss-dashboard-star-toggle");
    star.focus();

    click(star, 1);

    expect(f.selectedGuid()).toBe("a2");
    expect(f.opened).toEqual([]);
    expect(document.activeElement).toBe(f.view.containerEl);
  });

  it("keeps focus on the control and opens nothing for Enter", async () => {
    const f = await fixture({ viewStyle: "card", folder: null });
    const star = f.control("a2", ".rss-dashboard-star-toggle");
    star.focus();

    star.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(document.activeElement).toBe(star);
    expect(f.opened).toEqual([]);
  });

  it("still ends with a usable selection and focus when the click removes the card", async () => {
    const f = await fixture();
    const read = f.control("a2", ".rss-dashboard-read-toggle");
    read.focus();

    click(read, 1);

    expect(f.row("a2")).toBeNull();
    expect(f.selectedGuid()).toBe("a1");
    expect(document.activeElement).toBe(f.view.containerEl);
  });
});
