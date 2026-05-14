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

import type { RssDashboardView } from "../../../src/views/dashboard-view";

interface DashboardViewInternal {
  inlineArticle: FeedItem | null;
  selectedArticle: FeedItem | null;
  saver: {
    saveArticleWithFullContent: ReturnType<typeof vi.fn>;
    saveArticle: ReturnType<typeof vi.fn>;
  };
  handleArticleSave(article: FeedItem): Promise<void>;
  render: ReturnType<typeof vi.fn>;
}

async function makeView(settings: RssDashboardSettings): Promise<DashboardViewInternal> {
  const { RssDashboardView } =
    await import("../../../src/views/dashboard-view");
  const app = new App();
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
  };
  const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never) as unknown as DashboardViewInternal;
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
