import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Platform, type TFile } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { deleteTagFromSettings } from "../../../src/utils/tag-settings";
import { updateTagInSettings } from "../../../src/utils/tag-settings";
import { ReaderView } from "../../../src/views/reader-view";
import { RssDashboardView } from "../../../src/views/dashboard-view";

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
    showEditFeedModal(..._args: any[]): void {}
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
  ReaderView: class ReaderViewMock {
    setReturnLeaf = vi.fn();
    displayItem = vi.fn(async () => {});
    focusReaderView = vi.fn();
    isPodcastPlaying = vi.fn(() => false);
  },
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

type MockReaderView = {
  setReturnLeaf: ReturnType<typeof vi.fn>;
  displayItem: ReturnType<typeof vi.fn>;
  focusReaderView: ReturnType<typeof vi.fn>;
  isPodcastPlaying: ReturnType<typeof vi.fn>;
};

type TestDashboardView = {
  app: App;
  containerEl: HTMLElement;
  render: ReturnType<typeof vi.fn>;
  inlineArticle: import("../../../src/types/types").FeedItem | null;
  handleArticleClick: (
    item: import("../../../src/types/types").FeedItem,
  ) => Promise<void>;
  handleOpenInReaderView: (
    item: import("../../../src/types/types").FeedItem,
  ) => Promise<void>;
  handleFeedClick: (
    feed: import("../../../src/types/types").Feed,
  ) => Promise<void>;
  openSavedArticleFile: (
    file: TFile,
    article?: import("../../../src/types/types").FeedItem,
  ) => Promise<void>;
  renderInlineArticle: (container: HTMLElement) => void;
  applyExternalArticleUpdate: (
    articleGuid: string,
    feedUrl: string,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => void;
  handleArticleUpdate: (
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => Promise<void>;
  articleList: {
    setSelectedArticle: ReturnType<typeof vi.fn>;
    scheduleCardTopAnchorOnResize: ReturnType<typeof vi.fn>;
    scrollSelectedCardToTop: ReturnType<typeof vi.fn>;
  };
};

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaverMock {
    constructor(..._args: any[]) {}
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
): Promise<{
  app: App;
  plugin: unknown;
  view: TestDashboardView;
  dashboardLeaf: unknown;
}> {
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
  return {
    app,
    plugin,
    view: view as unknown as TestDashboardView,
    dashboardLeaf,
  };
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
    expect(mainLeaf.view.focusReaderView).toHaveBeenCalledTimes(1);
  }, 10000);

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
    expect(existingLeaf.view.focusReaderView).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the reader when opening from the dashboard", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "main";
    const mainLeaf = createReaderLeaf(new App(), "main");
    const revealLeaf = vi.fn(async () => {});
    const setActiveLeaf = vi.fn();
    const { view, dashboardLeaf } = await createDashboardView(settings, {
      activeLeaf: null,
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(() => mainLeaf),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(),
      revealLeaf,
      setActiveLeaf,
    });

    await view.handleArticleClick(feed.items[0]);

    expect(mainLeaf.setViewState).toHaveBeenCalledWith({
      type: "rss-reader-view",
      active: true,
    });
    expect(revealLeaf).toHaveBeenCalledWith(mainLeaf);
    expect(setActiveLeaf).toHaveBeenCalledWith(mainLeaf, { focus: true });
    expect(mainLeaf.view.focusReaderView).toHaveBeenCalledTimes(1);
    expect(setActiveLeaf).not.toHaveBeenCalledWith(dashboardLeaf, {
      focus: true,
    });
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

  it("builds the inline Reader toolbar from named native buttons with one Tab stop", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{ starred: false }]);
    settings.feeds = [feed];
    const { view } = await createDashboardView(settings);
    view.inlineArticle = feed.items[0];

    const container = createDiv();
    activeDocument.body.appendChild(container);
    view.renderInlineArticle(container);
    const toolbarButtons = [
      ...container.querySelectorAll<HTMLElement>(".rss-reader-actions button"),
    ];

    expect(toolbarButtons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Save article",
      "Mark as read/unread",
      "Star/unstar article",
      "Open in browser",
    ]);
    expect(
      container.querySelectorAll(".rss-reader-actions [role='button']"),
    ).toHaveLength(0);
    expect(toolbarButtons.filter((b) => b.tabIndex === 0)).toEqual([
      toolbarButtons[0],
    ]);
    container.remove();
  });

  it("renders the inline Reader back button as a named native button that leaves the article", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    const { view } = await createDashboardView(settings);
    view.inlineArticle = feed.items[0];
    const renderSpy = vi
      .spyOn(view as unknown as { render: () => Promise<void> }, "render")
      .mockResolvedValue();

    const container = createDiv();
    activeDocument.body.appendChild(container);
    view.renderInlineArticle(container);
    const back = container.querySelector<HTMLElement>(
      ".rss-reader-back-button",
    )!;

    expect(back.tagName).toBe("BUTTON");
    expect(back.getAttribute("type")).toBe("button");
    expect(back.getAttribute("aria-label")).toBe("Back to dashboard");
    expect(back.hasAttribute("role")).toBe(false);
    expect(back.classList.contains("clickable-icon")).toBe(true);

    back.click();

    expect(view.inlineArticle).toBeNull();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    container.remove();
  });

  it("exposes the inline Reader star as a native toggle button", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{ starred: false }]);
    settings.feeds = [feed];
    const { view } = await createDashboardView(settings);
    view.inlineArticle = feed.items[0];
    view.handleArticleUpdate = vi.fn(async () => {});

    const container = createDiv();
    view.renderInlineArticle(container);
    const starButton = container.querySelector<HTMLElement>(
      ".rss-reader-star-toggle",
    );

    // A native button is keyboard-operable on its own (Enter and Space click it
    // in a browser), so it carries no role, tabindex or keydown handler.
    expect(starButton?.tagName).toBe("BUTTON");
    expect(starButton?.getAttribute("type")).toBe("button");
    expect(starButton?.hasAttribute("role")).toBe(false);
    expect(starButton?.getAttribute("aria-pressed")).toBe("false");

    for (const key of ["Enter", " "]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      starButton?.dispatchEvent(event);

      // Not handled here: the browser's own click is the only activation.
      expect(event.defaultPrevented).toBe(false);
      expect(view.handleArticleUpdate).not.toHaveBeenCalled();
    }

    // The click a browser synthesizes for Enter or Space.
    starButton?.click();
    expect(view.handleArticleUpdate).toHaveBeenLastCalledWith(
      feed.items[0],
      { starred: true },
      true,
    );

    container.remove();
    view.inlineArticle = { ...feed.items[0], starred: true };
    const starredContainer = createDiv();
    view.renderInlineArticle(starredContainer);
    expect(
      starredContainer
        .querySelector(".rss-reader-star-toggle")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    starredContainer.remove();
  });

  it("clears the inline Reader save control in place for a matching feed article", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [
      { saved: true, tags: [{ name: "Saved", color: "blue" }] },
    ]);
    settings.feeds = [feed];
    const { view } = await createDashboardView(settings);
    view.inlineArticle = feed.items[0];

    const inlineContainer = createDiv();
    view.containerEl.appendChild(inlineContainer);
    view.renderInlineArticle(inlineContainer);
    const body = inlineContainer.querySelector(".inline-reader-content");
    const saveButton = inlineContainer.querySelector<HTMLElement>(
      ".inline-reader-header [aria-label='Save article']",
    );
    expect(saveButton?.classList.contains("saved")).toBe(true);

    view.applyExternalArticleUpdate(feed.items[0].guid, feed.url, {
      read: true,
    });
    expect(saveButton?.classList.contains("saved")).toBe(true);

    view.applyExternalArticleUpdate(feed.items[0].guid, feed.url, {
      saved: false,
      savedFilePath: undefined,
      tags: [],
    });

    expect(view.inlineArticle?.saved).toBe(false);
    expect(saveButton?.classList.contains("saved")).toBe(false);
    expect(inlineContainer.querySelector(".inline-reader-content")).toBe(body);
    inlineContainer.remove();
  });

  describe("inline Reader tag chips", () => {
    async function openInlineWithChips(
      tags: { name: string; color: string }[],
    ) {
      const settings = cloneSettings();
      settings.availableTags = tags.map((t) => ({ ...t }));
      const feed = makeFeed("https://example.com/feed", [
        { tags: tags.map((t) => ({ ...t })) },
      ]);
      settings.feeds = [feed];
      const { view } = await createDashboardView(settings);
      view.inlineArticle = feed.items[0];

      const container = createDiv();
      view.containerEl.appendChild(container);
      view.renderInlineArticle(container);
      const body = container.querySelector<HTMLElement>(
        ".inline-reader-content",
      )!;
      // Mirror the article renderer's header, which the stubbed renderer skips.
      const header = body.createDiv({ cls: "rss-reader-article-header" });
      const bodyText = body.createDiv({ cls: "rss-reader-body", text: "Body" });
      const tagsEl = header.createDiv({ cls: "rss-reader-tags" });
      for (const tag of tags) {
        const chip = tagsEl.createDiv({ cls: "rss-reader-tag" });
        chip.textContent = tag.name;
        chip.style.setProperty("--tag-color", tag.color);
      }
      return { view, settings, feed, container, body, bodyText, header };
    }

    const chips = (container: HTMLElement) =>
      Array.from(
        container.querySelectorAll<HTMLElement>(".rss-reader-tag"),
      ).map((el) => [el.textContent, el.style.getPropertyValue("--tag-color")]);

    it("drops a deleted tag's chip without rebuilding the article body", async () => {
      const { view, settings, container, body, bodyText } =
        await openInlineWithChips([
          { name: "Video", color: "#d04747" },
          { name: "News", color: "#3498db" },
        ]);

      deleteTagFromSettings(settings, "Video");
      (view as unknown as { refreshTagColors: () => void }).refreshTagColors();

      expect(chips(container)).toEqual([["News", "#3498db"]]);
      expect(container.querySelector(".inline-reader-content")).toBe(body);
      expect(body.contains(bodyText)).toBe(true);
    });

    it("removes the chip container when the last tag is deleted", async () => {
      const { view, settings, container } = await openInlineWithChips([
        { name: "Video", color: "#d04747" },
      ]);

      deleteTagFromSettings(settings, "Video");
      (view as unknown as { refreshTagColors: () => void }).refreshTagColors();

      expect(container.querySelector(".rss-reader-tags")).toBeNull();
    });

    it("shows a recolored tag's new color and a renamed tag's new name", async () => {
      const { view, settings, container } = await openInlineWithChips([
        { name: "Video", color: "#d04747" },
        { name: "News", color: "#3498db" },
      ]);

      updateTagInSettings(settings, settings.availableTags[0], {
        color: "#00ff00",
      });
      updateTagInSettings(settings, settings.availableTags[1], {
        name: "World",
      });
      (view as unknown as { refreshTagColors: () => void }).refreshTagColors();

      expect(chips(container)).toEqual([
        ["Video", "#00ff00"],
        ["World", "#3498db"],
      ]);
    });

    it("adds a chip when an assignment arrives from another tag-edit surface", async () => {
      const { view, feed, container } = await openInlineWithChips([]);
      container.querySelector(".rss-reader-tags")?.remove();

      view.applyExternalArticleUpdate(feed.items[0].guid, feed.url, {
        tags: [{ name: "Fresh", color: "#123456" }],
      });

      expect(chips(container)).toEqual([["Fresh", "#123456"]]);
    });

    it("keeps a saved article's chips current the same way", async () => {
      const { view, settings, feed, container } = await openInlineWithChips([
        { name: "Video", color: "#d04747" },
      ]);
      feed.items[0].saved = true;

      deleteTagFromSettings(settings, "Video");
      (view as unknown as { refreshTagColors: () => void }).refreshTagColors();

      expect(container.querySelector(".rss-reader-tags")).toBeNull();
    });
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

  it("opens saved articles in the configured sidebar location", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.readerViewLocation = "main";
    settings.savedArticleOpenLocation = "right-sidebar";
    const rightLeaf = {
      openFile: vi.fn(async () => {}),
    };
    const revealLeaf = vi.fn(async () => {});
    const { view } = await createDashboardView(settings, {
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(() => rightLeaf),
      revealLeaf,
    });
    const scratchVault = App.createMock().vault;
    await scratchVault.createFolder("RSS articles");
    const savedFile = await scratchVault.create(
      "RSS articles/saved-article.md",
      "# Saved article",
    );

    await view.openSavedArticleFile(savedFile, feed.items[0]);

    expect(
      view.app.workspace.getRightLeaf as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith(false);
    expect(rightLeaf.openFile).toHaveBeenCalledWith(savedFile);
    expect(revealLeaf).toHaveBeenCalledWith(rightLeaf);
  });

  it("renders saved articles inline when savedArticleOpenLocation is inline", async () => {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{}]);
    settings.feeds = [feed];
    settings.savedArticleOpenLocation = "inline";
    const { view } = await createDashboardView(settings, {
      getLeaf: vi.fn(),
      getLeftLeaf: vi.fn(),
      getRightLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
    });
    const scratchVault = App.createMock().vault;
    await scratchVault.createFolder("RSS articles");
    const savedFile = await scratchVault.create(
      "RSS articles/saved-inline.md",
      "# Saved inline",
    );

    await view.openSavedArticleFile(savedFile, feed.items[0]);

    expect(view.inlineArticle).toBe(feed.items[0]);
    expect(view.render).toHaveBeenCalled();
    expect(
      view.app.workspace.getLeaf as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
  });
});
