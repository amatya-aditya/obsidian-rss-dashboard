import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { RssDashboardView } from "../../../src/views/dashboard-view";

// ── Module mocks (same pattern as dashboard-lifecycle.test.ts) ────────────────
vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: any[]) {}
    render(): void {}
    destroy(): void {}
    refilter(..._args: any[]): void {}
    setSelectedArticle(..._args: any[]): void {}
    hasArticle(..._args: any[]): boolean {
      return false;
    }
    insertArticleInPlace(..._args: any[]): boolean {
      return false;
    }
    removeArticleInPlace(..._args: any[]): void {}
    updateArticleInPlace(..._args: any[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: any[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor(..._args: any[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor(..._args: any[]) {}
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
    constructor(..._args: any[]) {}
    verifyAllSavedArticles(..._args: any[]): void {}
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(
  url: string,
  folder = "",
  items: Partial<FeedItem>[] = [],
): Feed {
  return {
    title: `Feed (${url})`,
    url,
    folder,
    items: items.map((item, idx) => ({
      title: `Item ${idx}`,
      link: `${url}#${idx}`,
      description: "",
      pubDate: new Date(Date.now() - idx * 1000).toISOString(),
      guid: `${url}#${idx}`,
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
interface DashViewTestAPI {
  render: () => void;
  selectedFolders: string[];
  selectedFeeds: string[];
  getArticlesTitle(): string;
  handleDeleteFolder(folder: string): void;
  handleDeleteFeed(feed: Feed): void;
}

async function makeView(
  settings: RssDashboardSettings,
): Promise<DashViewTestAPI> {
  const app = new App();
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    removeCachedImagesForDeletedFeed: vi.fn(async () => {}),
  };
  const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never);
  view.render = vi.fn();
  return view as unknown as DashViewTestAPI;
}

function makeSettings(): RssDashboardSettings {
  const settings = cloneSettings();
  settings.feeds = [
    makeFeed("https://news.com", "News"),
    makeFeed("https://news-deep.com", "News/World/Europe"),
    makeFeed("https://tech-del.com", "Tech"),
    makeFeed("https://tech-keep.com", "Tech"),
    makeFeed("https://root.com", ""),
  ];
  settings.folders = [
    {
      name: "News",
      subfolders: [
        {
          name: "World",
          subfolders: [{ name: "Europe", subfolders: [] }],
        },
      ],
    },
    { name: "Tech", subfolders: [] },
  ] as RssDashboardSettings["folders"];
  return settings;
}

describe("Dashboard — title after deleting the selection", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
  });

  it("drops deleted folders and feeds from the header selection", async () => {
    const settings = makeSettings();
    const view = await makeView(settings);
    view.selectedFolders = ["News", "News/World"];
    view.selectedFeeds = ["https://tech-del.com", "https://root.com"];
    expect(view.getArticlesTitle()).toBe(
      "Folders: News, News/World (Feeds: 4)",
    );

    // Same order the sidebar's "Delete selection" uses: folders, then feeds.
    view.handleDeleteFolder("News");
    view.handleDeleteFolder("News/World");
    for (const url of ["https://tech-del.com", "https://root.com"]) {
      const feed = settings.feeds.find((f) => f.url === url);
      if (feed) view.handleDeleteFeed(feed);
    }

    expect(view.getArticlesTitle()).not.toMatch(/Folders:|feeds|Feeds:/);
  });

  it("keeps surviving selected folders and feeds in the header", async () => {
    const settings = makeSettings();
    const view = await makeView(settings);
    view.selectedFolders = ["News", "Tech"];
    view.selectedFeeds = ["https://root.com"];

    view.handleDeleteFolder("News");

    expect(view.getArticlesTitle()).toBe("Folders: Tech (Feeds: 3)");
  });
});
