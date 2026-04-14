import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Platform } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { ReaderView } from "../../../src/views/reader-view";

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
  ReaderView: class ReaderViewMock {
    setReturnLeaf = vi.fn();
    displayItem = vi.fn(async () => {});
    isPodcastPlaying = vi.fn(() => false);
  },
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
    folder: "RSS",
    items: items.map((item, index) => ({
      title: `Item ${index}`,
      link: `${url}/articles/${index}`,
      description: "",
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

type MockReaderView = InstanceType<typeof ReaderView> & {
  setReturnLeaf: ReturnType<typeof vi.fn>;
  displayItem: ReturnType<typeof vi.fn>;
  isPodcastPlaying: ReturnType<typeof vi.fn>;
};

type MockLeaf = {
  id: string;
  app: App;
  view: MockReaderView;
  setViewState: ReturnType<typeof vi.fn>;
  loadIfDeferred: ReturnType<typeof vi.fn>;
};

function createReaderLeaf(app: App, id: string): MockLeaf {
  const view = new ReaderView() as MockReaderView;
  view.setReturnLeaf = vi.fn();
  view.displayItem = vi.fn(async () => {});
  view.isPodcastPlaying = vi.fn(() => false);

  return {
    id,
    app,
    view,
    setViewState: vi.fn(async () => {}),
    loadIfDeferred: vi.fn(async () => {}),
  };
}

async function createDashboardView(
  settings: RssDashboardSettings,
  workspaceOverrides: Partial<App["workspace"]> = {},
) {
  const { RssDashboardView } = await import("../../../src/views/dashboard-view");
  const app = new App();
  Object.assign(app.workspace, workspaceOverrides);

  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
  };
  const dashboardLeaf = {
    app,
    updateHeader: vi.fn(),
  } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(dashboardLeaf, plugin as never);
  view.render = vi.fn();
  return { app, plugin, view, dashboardLeaf };
}

describe("Dashboard reader location", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    Platform.isMobile = false;
  });

  it("opens article clicks in the main split when readerViewLocation is main", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "main";
    const mainLeaf = createReaderLeaf(new App(), "main");
    const { view, dashboardLeaf } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(() => mainLeaf),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleArticleClick(feed.items[0]);

    expect((view.app.workspace.getLeaf as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("split");
    expect(mainLeaf.setViewState).toHaveBeenCalledWith({
      type: "rss-reader-view",
      active: true,
    });
    expect(mainLeaf.view.setReturnLeaf).toHaveBeenCalledWith(dashboardLeaf);
    expect(mainLeaf.view.displayItem).toHaveBeenCalledWith(feed.items[0], []);
  });

  it("opens article clicks in the right sidebar when readerViewLocation is right-sidebar", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "right-sidebar";
    settings.media.openInSplitView = false;
    const rightLeaf = createReaderLeaf(new App(), "right");
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(() => rightLeaf),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleArticleClick(feed.items[0]);

    expect((view.app.workspace.getRightLeaf as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(false);
    expect(rightLeaf.setViewState).toHaveBeenCalledWith({
      type: "rss-reader-view",
      active: true,
    });
    expect(windowOpenSpy).not.toHaveBeenCalled();
    windowOpenSpy.mockRestore();
  });

  it("opens article clicks in the left sidebar when readerViewLocation is left-sidebar", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "left-sidebar";
    const leftLeaf = createReaderLeaf(new App(), "left");
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(() => leftLeaf),
      getRightLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleArticleClick(feed.items[0]);

    expect((view.app.workspace.getLeftLeaf as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(false);
    expect(leftLeaf.setViewState).toHaveBeenCalledWith({
      type: "rss-reader-view",
      active: true,
    });
  });

  it("reuses the reader leaf in the configured target location instead of the first existing reader leaf", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "right-sidebar";
    const leftLeaf = createReaderLeaf(new App(), "left-existing");
    const rightLeaf = createReaderLeaf(new App(), "right-target");
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => [leftLeaf]),
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(() => rightLeaf),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleArticleClick(feed.items[0]);

    expect(rightLeaf.setViewState).toHaveBeenCalledTimes(1);
    expect(leftLeaf.setViewState).not.toHaveBeenCalled();
  });

  it("uses readerViewLocation for explicit open-in-reader actions too", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "right-sidebar";
    const rightLeaf = createReaderLeaf(new App(), "right");
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(() => rightLeaf),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleOpenInReaderView(feed.items[0]);

    expect((view.app.workspace.getRightLeaf as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(false);
    expect(rightLeaf.setViewState).toHaveBeenCalledTimes(1);
  });

  it("ignores legacy media.openInSplitView when readerViewLocation targets a sidebar", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "left-sidebar";
    settings.media.openInSplitView = false;
    const leftLeaf = createReaderLeaf(new App(), "left");
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(() => leftLeaf),
      getRightLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleOpenInReaderView(feed.items[0]);

    expect(leftLeaf.setViewState).toHaveBeenCalledTimes(1);
    expect(windowOpenSpy).not.toHaveBeenCalled();
    windowOpenSpy.mockRestore();
  });

  it("keeps podcast-active opens in the configured sidebar target", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{ mediaType: "podcast" }]);
    settings.feeds = [feed];
    settings.readerViewLocation = "right-sidebar";
    const existingReaderLeaf = createReaderLeaf(new App(), "existing");
    existingReaderLeaf.view.isPodcastPlaying.mockReturnValue(true);
    const rightLeaf = createReaderLeaf(new App(), "right-target");
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => [existingReaderLeaf]),
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(() => rightLeaf),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleArticleClick(feed.items[0]);

    expect(rightLeaf.setViewState).toHaveBeenCalledTimes(1);
    expect(existingReaderLeaf.setViewState).not.toHaveBeenCalled();
  });
});
