import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type WorkspaceLeaf } from "obsidian";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../src/types/types";

/**
 * Once `,` opens an article the Reader is the active view, so the next `,` is
 * the Reader's. It must walk the dashboard's list exactly as the dashboard's
 * own `,` does: mark the article read, then open its neighbour once, never the
 * first row of the page (#1468). Newest-first order renders a4, a3, a2, a1.
 */
type ReaderSeams = {
  currentItem: FeedItem | null;
  getDashboardView: () => RssDashboardView | null;
};
type ViewSeams = {
  currentFolder: string | null;
  openSelectedArticle: (article: FeedItem) => Promise<void>;
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

async function fixture() {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.viewStyle = "list";
  settings.articleGroupBy = "none";
  settings.articleFilter = { type: "none", value: null };
  settings.dashboardMultiFilters = {
    statusFilters: [],
    tagFilters: [],
    logic: "OR",
  };
  settings.unreadArticlesPageSize = 0;
  settings.keywordRules.rules = [];
  settings.folders = [];

  const url = "https://example.com/feed";
  const items: FeedItem[] = Array.from({ length: 4 }, (_, index) => ({
    guid: `a${index + 1}`,
    title: `Article ${index + 1}`,
    link: `${url}/${index + 1}`,
    description: "",
    pubDate: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    read: false,
    starred: false,
    tags: [],
    feedUrl: url,
    feedTitle: "Feed",
    coverImage: "",
  }));
  settings.feeds = [
    { title: "Feed", url, folder: "", items, lastUpdated: 0 } as Feed,
  ];

  const app = new App();
  const makeLeaf = () => ({ app }) as unknown as WorkspaceLeaf;
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
    queueArticleStateSave: vi.fn(),
    flushPendingWrites: vi.fn(async () => {}),
    resolveCachedImageUrl: () => undefined,
  };
  const view = new RssDashboardView(makeLeaf(), plugin as never);
  (view as unknown as ViewSeams).currentFolder = "unread";
  openViews.push(view);
  document.body.append(view.containerEl);
  await view.onOpen();

  const reader = new ReaderView(
    makeLeaf(),
    settings,
    {} as never,
    () => {},
    async (item, update, rerender) => {
      // The plugin writes the stored article before the dashboard hears of it.
      Object.assign(item, update);
      await Promise.resolve();
      view.applyExternalArticleUpdate(
        item.guid,
        item.feedUrl,
        update,
        rerender,
      );
    },
  );
  const readerSeams = reader as unknown as ReaderSeams;
  readerSeams.getDashboardView = () => view;

  // Opening an article loads it into the Reader, as the real open path does.
  const opened: string[] = [];
  vi.spyOn(
    view as unknown as ViewSeams,
    "openSelectedArticle",
  ).mockImplementation((article) => {
    opened.push(article.guid);
    readerSeams.currentItem = article;
    return Promise.resolve();
  });

  const start = (guid: string) => {
    const item = items.find((candidate) => candidate.guid === guid);
    if (!item) throw new Error(`No item ${guid}`);
    view.setSelectedArticleFromExternal(item);
    readerSeams.currentItem = item;
  };
  const press = async () => {
    reader.actionMarkReadAndNext();
    // Let the Reader's deferred dashboard update and any open settle.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  };
  return { opened, start, press };
}

describe("Reader mark read and next", () => {
  it("opens the neighbour once, not the first row, when started mid-list", async () => {
    const f = await fixture();
    f.start("a3");

    await f.press();

    expect(f.opened).toEqual(["a2"]);
  });

  it("walks the list once across several presses with no skips", async () => {
    const f = await fixture();
    f.start("a4");

    await f.press();
    await f.press();
    await f.press();
    await f.press();

    // The fourth press finds nothing left to open.
    expect(f.opened).toEqual(["a3", "a2", "a1"]);
  });
});
