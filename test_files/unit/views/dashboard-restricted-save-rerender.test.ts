import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { RESTRICTED_ARTICLE_REASON } from "../../../src/utils/full-article-fetch";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {}
    destroy(): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refilter(..._args: any[]): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelectedArticle(..._args: any[]): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hasArticle(..._args: any[]): boolean {
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insertArticleInPlace(..._args: any[]): boolean {
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeArticleInPlace(..._args: any[]): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateArticleInPlace(..._args: any[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    showEditFeedModal(..._args: any[]): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    verifyAllSavedArticles(..._args: any[]): void {}
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

async function makeView(settings: RssDashboardSettings): Promise<any> {
  const { RssDashboardView } =
    await import("../../../src/views/dashboard-view");
  const app = new App();
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
  };
  const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never);
  view.render = vi.fn();
  return view;
}

describe("Dashboard restricted save rerender", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("rerenders the inline reader when a saved article becomes restricted", async () => {
    const settings = cloneSettings();
    settings.articleSaving.saveFullContent = true;

    const feed = makeFeed("https://example.com/feed", [
      { title: "Restricted article" },
    ]);
    settings.feeds = [feed];

    const view = await makeView(settings);
    const article = feed.items[0];

    view.inlineArticle = article;
    view.selectedArticle = article;
    view.saver = {
      saveArticleWithFullContent: vi.fn(async (item: FeedItem) => {
        item.restrictedReason = RESTRICTED_ARTICLE_REASON;
        return { path: "Articles/Restricted article.md" };
      }),
      saveArticle: vi.fn(),
    };

    await view.handleArticleSave(article);

    expect(view.render).toHaveBeenCalledTimes(1);
  });
});
