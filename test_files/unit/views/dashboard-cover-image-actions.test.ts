// The dashboard's two cover-image actions (#1330): what the manual fetch
// stores on the item, and what the restore puts back for it. The restore is
// local, so the tests also pin that it asks the plugin for no page at all.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { RssDashboardView } from "../../../src/views/dashboard-view";

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

const FEED_URL = "https://example.com/feed.xml";
const PAGE_IMAGE = "https://page.example.com/hero.jpg";
const FEED_IMAGE = "https://img.example.com/feed.jpg";

/** Typed accessor for the view's private cover-image actions. */
interface CoverActionsAPI {
  handleFetchCoverImage(
    article: FeedItem,
    options?: { quiet?: boolean },
  ): Promise<boolean>;
  handleRestoreCoverImage(article: FeedItem): Promise<boolean>;
}

interface Harness {
  view: CoverActionsAPI;
  plugin: {
    settings: RssDashboardSettings;
    saveSettings: MockInstance;
    updateArticle: MockInstance;
    fetchPageCoverImage: MockInstance;
    warmCoverImage: MockInstance;
  };
  settings: RssDashboardSettings;
  article: FeedItem;
}

function makeArticle(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Item",
    link: "https://example.com/a",
    description: "",
    pubDate: "2026-05-12T00:00:00.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: FEED_URL,
    coverImage: "",
    ...overrides,
  };
}

function makeFeed(items: FeedItem[]): Feed {
  return {
    title: "Feed",
    url: FEED_URL,
    folder: "",
    items,
    lastUpdated: 0,
  };
}

function makeHarness(articleOverrides: Partial<FeedItem> = {}): Harness {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  const article = makeArticle(articleOverrides);
  settings.feeds = [makeFeed([article])];

  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
    fetchPageCoverImage: vi.fn(async () => ({
      status: "found" as const,
      url: PAGE_IMAGE,
    })),
    warmCoverImage: vi.fn(),
    removeCachedImagesForDeletedFeed: vi.fn(async () => {}),
  };

  const view = new RssDashboardView(
    { app: new App() } as unknown as import("obsidian").WorkspaceLeaf,
    plugin as never,
  );

  return {
    view: view as unknown as CoverActionsAPI,
    plugin,
    settings,
    article,
  };
}

describe("dashboard cover-image actions (#1330)", () => {
  let noticeLog: MockInstance;

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    noticeLog = vi.spyOn(console, "debug");
    noticeLog.mockClear();
  });

  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  /** The messages the Notice stub logged in this test, oldest first. */
  function notices(): unknown[] {
    return noticeLog.mock.calls
      .filter((call) => call[0] === "[Stub Notice]")
      .map((call) => call[1]);
  }

  describe("handleFetchCoverImage", () => {
    it("stores the page image with its provenance marker and nothing else", async () => {
      const h = makeHarness();

      await expect(h.view.handleFetchCoverImage(h.article)).resolves.toBe(true);

      expect(h.plugin.updateArticle).toHaveBeenCalledWith(
        h.article.guid,
        FEED_URL,
        { coverImage: PAGE_IMAGE, coverImageFromPage: true },
        false,
      );
      expect(h.article.coverImage).toBe(PAGE_IMAGE);
      expect(h.article.coverImageFromPage).toBe(true);
      expect(h.article.read).toBe(false);
      expect(h.article.starred).toBe(false);
      expect(h.article.tags).toEqual([]);
      expect(h.plugin.warmCoverImage).toHaveBeenCalledWith(PAGE_IMAGE);
      expect(notices()).toEqual([]);
    });

    it("leaves the item alone and says why when the page has no image", async () => {
      const h = makeHarness();
      h.plugin.fetchPageCoverImage.mockResolvedValue({
        status: "none",
        url: "",
      });

      await expect(h.view.handleFetchCoverImage(h.article)).resolves.toBe(
        false,
      );

      expect(h.plugin.updateArticle).not.toHaveBeenCalled();
      expect(h.article.coverImage).toBe("");
      expect(h.article.coverImageFromPage).toBeUndefined();
      expect(notices()).toEqual(["No cover image found on that page."]);
    });

    // The bulk fetch (#1702) reports one summary for the whole run, so the
    // per-card Notices a single fetch shows would stack up behind it.
    it("stores the image the same way but stays silent in a quiet run", async () => {
      const h = makeHarness();

      await expect(
        h.view.handleFetchCoverImage(h.article, { quiet: true }),
      ).resolves.toBe(true);

      expect(h.plugin.updateArticle).toHaveBeenCalledWith(
        h.article.guid,
        FEED_URL,
        { coverImage: PAGE_IMAGE, coverImageFromPage: true },
        false,
      );
      expect(h.plugin.warmCoverImage).toHaveBeenCalledWith(PAGE_IMAGE);
      expect(notices()).toEqual([]);
    });

    it("reports a page with no image as false without a Notice in a quiet run", async () => {
      const h = makeHarness();
      h.plugin.fetchPageCoverImage.mockResolvedValue({
        status: "none",
        url: "",
      });

      await expect(
        h.view.handleFetchCoverImage(h.article, { quiet: true }),
      ).resolves.toBe(false);

      expect(h.plugin.updateArticle).not.toHaveBeenCalled();
      expect(notices()).toEqual([]);
    });

    it("reports an article that can no longer be saved as false without a Notice in a quiet run", async () => {
      const h = makeHarness();
      h.settings.feeds = [];

      await expect(
        h.view.handleFetchCoverImage(h.article, { quiet: true }),
      ).resolves.toBe(false);

      expect(notices()).toEqual([]);
    });
  });

  describe("handleRestoreCoverImage", () => {
    it("puts the feed's image back, offline, and drops the marker", async () => {
      const h = makeHarness({
        coverImage: PAGE_IMAGE,
        coverImageFromPage: true,
        content: `<p><img src="${FEED_IMAGE}"></p>`,
      });

      await expect(h.view.handleRestoreCoverImage(h.article)).resolves.toBe(
        true,
      );

      expect(h.plugin.fetchPageCoverImage).not.toHaveBeenCalled();
      expect(h.plugin.warmCoverImage).not.toHaveBeenCalled();
      expect(h.plugin.updateArticle).toHaveBeenCalledWith(
        h.article.guid,
        FEED_URL,
        { coverImage: FEED_IMAGE, coverImageFromPage: undefined },
        false,
      );
      expect(h.article.coverImage).toBe(FEED_IMAGE);
      expect(h.article.coverImageFromPage).toBeUndefined();
      expect(h.article.read).toBe(false);
      expect(h.article.starred).toBe(false);
      expect(notices()).toEqual([]);
    });

    it("clears the cover when the feed supplies none", async () => {
      const h = makeHarness({
        coverImage: PAGE_IMAGE,
        coverImageFromPage: true,
      });

      await expect(h.view.handleRestoreCoverImage(h.article)).resolves.toBe(
        true,
      );

      expect(h.plugin.updateArticle).toHaveBeenCalledWith(
        h.article.guid,
        FEED_URL,
        { coverImage: "", coverImageFromPage: undefined },
        false,
      );
      expect(h.article.coverImage).toBe("");
      expect(h.article.coverImageFromPage).toBeUndefined();
      expect(notices()).toEqual([]);
    });

    it("says so and leaves the item alone when it cannot be written", async () => {
      const h = makeHarness({
        coverImage: PAGE_IMAGE,
        coverImageFromPage: true,
        content: `<p><img src="${FEED_IMAGE}"></p>`,
      });
      // No feed in the dashboard holds the article any more.
      h.settings.feeds = [];

      await expect(h.view.handleRestoreCoverImage(h.article)).resolves.toBe(
        false,
      );

      expect(h.plugin.updateArticle).not.toHaveBeenCalled();
      expect(h.article.coverImage).toBe(PAGE_IMAGE);
      expect(notices()).toEqual([
        "Could not restore the cover image on this article.",
      ]);
    });
  });
});
