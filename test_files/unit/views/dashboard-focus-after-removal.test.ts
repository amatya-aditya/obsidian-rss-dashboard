import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type WorkspaceLeaf } from "obsidian";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../src/types/types";

/**
 * A removal that empties the current (or last) page rebuilds the list rather
 * than updating one row. The keyboard user who removed the row must keep a
 * sensible focus target after that rebuild (#1387, #1385).
 */
const openViews: RssDashboardView[] = [];

beforeEach(() => {
  vi.stubGlobal("CSS", { escape: (value: string) => value });
});
afterEach(async () => {
  for (const view of openViews.splice(0)) await view.onClose();
  document.body.empty();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface ViewSeams {
  currentFolder: string | null;
  unreadArticlesPage: number;
}

function fixture(itemCount: number) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.viewStyle = "list";
  settings.articleGroupBy = "none";
  settings.articleFilter = { type: "none", value: null };
  settings.dashboardMultiFilters = {
    statusFilters: [],
    tagFilters: [],
    logic: "OR",
  };
  settings.display.showFilterStatusBar = true;
  settings.unreadArticlesPageSize = 1;
  settings.allArticlesPageSize = 1;
  settings.keywordRules.rules = [];
  const url = "https://example.com/feed.xml";
  const items: FeedItem[] = Array.from({ length: itemCount }, (_, index) => ({
    guid: `article-${index + 1}`,
    title: `Article ${index + 1}`,
    link: `${url}/article-${index + 1}`,
    description: "",
    pubDate: `2026-10-12T12:0${index}:00Z`,
    read: false,
    starred: false,
    tags: [],
    feedUrl: url,
    feedTitle: "Example Feed",
    coverImage: "",
  }));
  const feed: Feed = {
    title: "Example Feed",
    url,
    folder: "",
    items,
    lastUpdated: 0,
  };
  settings.feeds = [feed];
  const app = new App();
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    resolveCachedImageUrl: () => undefined,
  };
  const view = new RssDashboardView(
    { app } as unknown as WorkspaceLeaf,
    plugin as never,
  );
  openViews.push(view);
  document.body.append(view.containerEl);
  const seams = view as unknown as ViewSeams;
  seams.currentFolder = "unread";
  const readControl = (guid: string) =>
    view.containerEl.querySelector<HTMLElement>(
      `#article-${guid} .rss-dashboard-read-toggle`,
    );
  const update = (guid: string, read: boolean) =>
    view.applyExternalArticleUpdate(guid, url, { read });
  return { view, seams, feed, readControl, update };
}

describe("dashboard focus after an in-place removal rebuilds the page", () => {
  it("moves focus to the remaining article when the last page disappears", () => {
    const f = fixture(2);
    f.seams.unreadArticlesPage = 2;
    f.view.render();
    const focused = f.readControl("article-1");
    expect(focused).not.toBeNull();
    focused?.focus();

    f.update("article-1", true);

    expect(f.readControl("article-2")?.classList.contains("read")).toBe(false);
    expect(document.activeElement).toBe(f.readControl("article-2"));
  });

  it("focuses the article list when no row remains", () => {
    vi.useFakeTimers();
    const f = fixture(1);
    f.view.render();
    const focused = f.readControl("article-1");
    expect(focused).not.toBeNull();
    focused?.focus();

    f.update("article-1", true);
    vi.advanceTimersByTime(320);

    const list = f.view.containerEl.querySelector(
      ".rss-dashboard-articles-list",
    );
    expect(list).not.toBeNull();
    expect(document.activeElement).toBe(list);
  });
});
