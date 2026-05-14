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

type MockReaderView = {
  setReturnLeaf: ReturnType<typeof vi.fn>;
  displayItem: ReturnType<typeof vi.fn>;
  isPodcastPlaying: ReturnType<typeof vi.fn>;
};

type TestDashboardView = {
  app: App;
  render: ReturnType<typeof vi.fn>;
  inlineArticle: import("../../../src/types/types").FeedItem | null;
  handleArticleClick: (item: import("../../../src/types/types").FeedItem) => Promise<void>;
  handleOpenInReaderView: (item: import("../../../src/types/types").FeedItem) => Promise<void>;
  handleFeedClick: (feed: import("../../../src/types/types").Feed) => Promise<void>;
  articleList: {
    setSelectedArticle: ReturnType<typeof vi.fn>;
    scheduleCardTopAnchorOnResize: ReturnType<typeof vi.fn>;
    scrollSelectedCardToTop: ReturnType<typeof vi.fn>;
  };
};

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

type MockLeaf = {
  id: string;
  app: App;
  view: MockReaderView;
  setViewState: ReturnType<typeof vi.fn>;
  loadIfDeferred: ReturnType<typeof vi.fn>;
};

function createReaderLeaf(app: App, id: string): MockLeaf {
  // Cast through unknown to bypass constructor argument requirements —
  // at runtime ReaderView is the zero-arg mock class registered above.
  const view = new (ReaderView as unknown as new () => MockReaderView)();
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
   workspaceOverrides: Record<string, unknown> = {},
): Promise<{ app: App; plugin: unknown; view: TestDashboardView; dashboardLeaf: unknown }> {
  const { RssDashboardView } =
    await import("../../../src/views/dashboard-view");
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
  const view = new RssDashboardView(
    dashboardLeaf,
    plugin as unknown as ConstructorParameters<typeof RssDashboardView>[1],
  );
  view.render = vi.fn();
  return { app, plugin, view: view as unknown as TestDashboardView, dashboardLeaf };
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

    expect(
      view.app.workspace.getLeaf as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith("split");
    expect(mainLeaf.setViewState).toHaveBeenCalledWith({
      type: "rss-reader-view",
      active: true,
    });
    expect(mainLeaf.view.setReturnLeaf).toHaveBeenCalledWith(dashboardLeaf);
    expect(mainLeaf.view.displayItem).toHaveBeenCalledWith(feed.items[0], []);
  });

  it("relocks the selected card after split open in card view", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.viewStyle = "card";
    settings.readerViewLocation = "main";
    settings.display.autoMarkReadOnOpen = false;
    const mainLeaf = createReaderLeaf(new App(), "main");

    const mockRef = {};
    let capturedLayoutChangeCallback: (() => void) | null = null;
    const workspaceOn = vi.fn((_name: string, cb: () => void) => {
      capturedLayoutChangeCallback = cb;
      return mockRef;
    });
    const workspaceOffref = vi.fn();

    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(() => mainLeaf),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
      on: workspaceOn,
      offref: workspaceOffref,
    });
    const setSelectedArticle = vi.fn();
    const scheduleCardTopAnchorOnResize = vi.fn();
    const scrollSelectedCardToTop = vi.fn();

    view.articleList = {
      setSelectedArticle,
      scheduleCardTopAnchorOnResize,
      scrollSelectedCardToTop,
    };

    await view.handleArticleClick(feed.items[0]);

    expect(setSelectedArticle).toHaveBeenCalledTimes(1);
    expect(setSelectedArticle).toHaveBeenCalledWith(feed.items[0]);
    expect(scheduleCardTopAnchorOnResize).toHaveBeenCalledTimes(1);
    expect(workspaceOn).toHaveBeenCalledWith(
      "layout-change",
      expect.any(Function),
    );

    // Simulate Obsidian firing layout-change after the workspace settles.
    expect(capturedLayoutChangeCallback).not.toBeNull();
    capturedLayoutChangeCallback!();

    expect(scrollSelectedCardToTop).toHaveBeenCalledTimes(1);
    // Handler self-deregisters after firing.
    expect(workspaceOffref).toHaveBeenCalledWith(mockRef);
  });

  it("reuses an existing reader leaf for article clicks when readerViewLocation is main", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "main";
    const existingLeaf = createReaderLeaf(new App(), "existing-main");
    const { view, dashboardLeaf } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => [existingLeaf]),
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleArticleClick(feed.items[0]);

    expect(
      view.app.workspace.getLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(existingLeaf.setViewState).toHaveBeenCalledWith({
      type: "rss-reader-view",
      active: true,
    });
    expect(existingLeaf.view.setReturnLeaf).toHaveBeenCalledWith(dashboardLeaf);
    expect(existingLeaf.view.displayItem).toHaveBeenCalledWith(
      feed.items[0],
      [],
    );
  });

  it("opens article clicks in the right sidebar when readerViewLocation is right-sidebar", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "right-sidebar";
    settings.media.openInSplitView = false;
    const rightLeaf = createReaderLeaf(new App(), "right");
    const windowOpenSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null);
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(() => rightLeaf),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleArticleClick(feed.items[0]);

    expect(
      view.app.workspace.getRightLeaf as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith(false);
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

    expect(
      view.app.workspace.getLeftLeaf as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith(false);
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

    expect(
      view.app.workspace.getRightLeaf as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith(false);
    expect(rightLeaf.setViewState).toHaveBeenCalledTimes(1);
  });

  it("opens article clicks in the external browser when readerViewLocation is external-browser", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "external-browser";
    const windowOpenSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null);
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleArticleClick(feed.items[0]);

    expect(windowOpenSpy).toHaveBeenCalledWith(feed.items[0].link, "_blank");
    expect(
      view.app.workspace.getLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(
      view.app.workspace.getRightLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(
      view.app.workspace.getLeftLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(view.inlineArticle).toBe(null);

    windowOpenSpy.mockRestore();
  });

  it("uses external browser for explicit open-in-reader actions when readerViewLocation is external-browser", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "external-browser";
    const windowOpenSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null);
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleOpenInReaderView(feed.items[0]);

    expect(windowOpenSpy).toHaveBeenCalledWith(feed.items[0].link, "_blank");
    expect(
      view.app.workspace.getLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(
      view.app.workspace.getRightLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(
      view.app.workspace.getLeftLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(view.inlineArticle).toBe(null);

    windowOpenSpy.mockRestore();
  });

  it("ignores legacy media.openInSplitView when readerViewLocation targets a sidebar", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "left-sidebar";
    settings.media.openInSplitView = false;
    const leftLeaf = createReaderLeaf(new App(), "left");
    const windowOpenSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null);
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
    const feed = makeFeed("https://example.com/feed", [
      { mediaType: "podcast" },
    ]);
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

  it("does not open a reader leaf and renders inline when readerViewLocation is inline", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "inline";
    const mainLeaf = createReaderLeaf(new App(), "main");
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(() => mainLeaf),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleArticleClick(feed.items[0]);

    // Should NOT open any leaf
    expect(
      view.app.workspace.getLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(
      view.app.workspace.getRightLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(
      view.app.workspace.getLeftLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();

    // Check state and re-render was triggered
    expect(view.inlineArticle).toBe(feed.items[0]);
    expect(view.render).toHaveBeenCalled();
  });

  it("uses inline mode for explicit open-in-reader actions too", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "inline";
    const mainLeaf = createReaderLeaf(new App(), "main");
    const { view } = await createDashboardView(settings, {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(() => mainLeaf),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
    });

    await view.handleOpenInReaderView(feed.items[0]);

    expect(view.inlineArticle).toBe(feed.items[0]);
    expect(view.render).toHaveBeenCalled();
  });

  it("exits inline mode when a feed is clicked in the sidebar", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "inline";
    const { view } = await createDashboardView(settings);

    view.inlineArticle = feed.items[0];

    // Trigger sidebar navigation (same as handleFeedClick)
    await view.handleFeedClick(feed);

    // Should clear inline article and render regular list
    expect(view.inlineArticle).toBe(null);
    expect(view.render).toHaveBeenCalled();
  });
});
