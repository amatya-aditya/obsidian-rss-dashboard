import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

// Regression coverage for GH Issue #332: starring/unstarring from the
// dashboard's primary star entry point (the selected-article action, which
// backs the card star toggle, context-menu star action, and star hotkey —
// they all resolve to the same `updateArticleStatus` seam) must never
// mutate article tags, and must leave a manually assigned "Favorite" tag
// untouched in both directions.

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    refilter(..._args: unknown[]): void {}
    setSelectedArticle(..._args: unknown[]): void {}
    hasArticle(..._args: unknown[]): boolean {
      return false;
    }
    insertArticleInPlace(..._args: unknown[]): boolean {
      return false;
    }
    removeArticleInPlace(..._args: unknown[]): void {}
    updateArticleInPlace(..._args: unknown[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
    showEditFeedModal(..._args: unknown[]): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor(..._args: unknown[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor(..._args: unknown[]) {}
    open(): void {}
    close(): void {}
  },
}));

vi.mock("../../../src/views/reader-view", () => ({
  ReaderView: class ReaderViewMock {},
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaverMock {
    constructor(..._args: unknown[]) {}
    verifyAllSavedArticles(..._args: unknown[]): void {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(url: string, items: Partial<FeedItem>[] = []): Feed {
  return {
    title: `Feed (${url})`,
    url,
    folder: "",
    items: items.map((item, index) => ({
      title: `Item ${index}`,
      link: `${url}#${index}`,
      description: "<p>Excerpt</p>",
      pubDate: new Date(Date.now() - index * 1000).toISOString(),
      guid: `${url}#${index}`,
      read: false,
      starred: false,
      tags: [],
      feedTitle: `Feed (${url})`,
      feedUrl: url,
      coverImage: "",
      ...item,
    })),
    lastUpdated: Date.now(),
  };
}

interface DashboardViewInternal {
  selectedArticle: FeedItem | null;
  actionToggleStarStatus(): Promise<void>;
}

async function makeView(
  settings: RssDashboardSettings,
): Promise<{ view: DashboardViewInternal; updateArticle: ReturnType<typeof vi.fn> }> {
  const { RssDashboardView } =
    await import("../../../src/views/dashboard-view");
  const app = new App();
  const updateArticle = vi.fn(async () => {});
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle,
  };
  const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(
    leaf,
    plugin as never,
  ) as unknown as DashboardViewInternal & { render: unknown };
  (view as unknown as { render: unknown }).render = vi.fn();
  return { view, updateArticle };
}

describe("Dashboard star/tag independence (GH Issue #332)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("starring the selected article leaves its tags untouched", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [
      { starred: false, tags: [{ name: "news", color: "#111111" }] },
    ]);
    settings.feeds = [feed];

    const { view } = await makeView(settings);
    view.selectedArticle = feed.items[0];

    await view.actionToggleStarStatus();

    expect(feed.items[0].starred).toBe(true);
    expect(feed.items[0].tags).toEqual([{ name: "news", color: "#111111" }]);
  });

  it("unstarring the selected article leaves a manually assigned Favorite tag untouched", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [
      {
        starred: true,
        tags: [
          { name: "Favorite", color: "#f1c40f" },
          { name: "news", color: "#111111" },
        ],
      },
    ]);
    settings.feeds = [feed];

    const { view } = await makeView(settings);
    view.selectedArticle = feed.items[0];

    await view.actionToggleStarStatus();

    expect(feed.items[0].starred).toBe(false);
    expect(feed.items[0].tags).toEqual([
      { name: "Favorite", color: "#f1c40f" },
      { name: "news", color: "#111111" },
    ]);
  });

  it("starring an untagged article leaves it with no tags (no Favorite chip added)", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [
      { starred: false, tags: [] },
    ]);
    settings.feeds = [feed];

    const { view } = await makeView(settings);
    view.selectedArticle = feed.items[0];

    await view.actionToggleStarStatus();

    expect(feed.items[0].starred).toBe(true);
    expect(feed.items[0].tags).toEqual([]);
  });
});
