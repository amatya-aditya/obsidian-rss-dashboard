/**
 * Characterization tests for `RssDashboardView.onOpen`, `render` and
 * `renderFilterSubheader`.
 *
 * Each method is over the 150-line function limit. These tests pin what they
 * do today so each can be split into smaller private methods without these
 * tests changing. They are read-only on refactor PRs; see
 * docs/development/architecture.md.
 *
 * `Sidebar`, `ArticleList` and `ArticleRenderer` are replaced by recorders so
 * a test sees the exact constructor arguments and callback names the view
 * wires up. Everything else (DOM, workspace events, the view's own methods)
 * is real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App, WorkspaceLeaf } from "../../stubs/obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type HighlightWord,
  type RssDashboardSettings,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { RssDashboardView } from "../../../src/views/dashboard-view";

const recorded = vi.hoisted(() => ({
  sidebars: [] as Array<{ args: unknown[]; renders: number; cleared: number }>,
  articleLists: [] as Array<{
    args: unknown[];
    renders: number;
    destroyed: number;
    emptyStateContext: unknown;
    onRender?: () => void;
  }>,
  articleRenderers: [] as Array<Record<string, unknown>>,
  feedManagerOpened: 0,
  articleListOnRender: undefined as undefined | (() => void),
}));

vi.mock("../../../src/utils/platform-utils", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/utils/platform-utils")
  >()),
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    record: { args: unknown[]; renders: number; cleared: number };
    constructor(...args: unknown[]) {
      this.record = { args, renders: 0, cleared: 0 };
      recorded.sidebars.push(this.record);
    }
    render(): void {
      this.record.renders++;
    }
    clearFolderPathCache(): void {
      this.record.cleared++;
    }
    destroy(): void {}
  },
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    record: {
      args: unknown[];
      renders: number;
      destroyed: number;
      emptyStateContext: unknown;
    };
    constructor(...args: unknown[]) {
      this.record = {
        args,
        renders: 0,
        destroyed: 0,
        emptyStateContext: undefined,
      };
      recorded.articleLists.push(this.record);
    }
    render(): void {
      this.record.renders++;
      recorded.articleListOnRender?.();
    }
    destroy(): void {
      this.record.destroyed++;
    }
    setEmptyStateContext(context: unknown): void {
      this.record.emptyStateContext = context;
    }
    refilter(): void {}
    setSelectedArticle(): void {}
    updateHeaderTitle(): void {}
    updateRefreshButtonText(): void {}
  },
}));

vi.mock("../../../src/components/article-renderer", () => ({
  ArticleRenderer: class ArticleRendererMock {
    constructor(options: Record<string, unknown>) {
      recorded.articleRenderers.push(options);
    }
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor() {}
    open(): void {
      recorded.feedManagerOpened++;
    }
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor() {}
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
    constructor() {}
    verifyAllSavedArticles(): void {}
  },
}));

interface ViewInternals {
  onOpen(): Promise<void>;
  onClose(): Promise<void>;
  render(): void;
  renderFilterSubheader(container: HTMLElement): void;
  containerEl: HTMLElement;
  settings: RssDashboardSettings;
  sidebarContainer: HTMLElement | null;
  dashboardContainer: HTMLElement | null;
  sidebar: { record: { args: unknown[]; renders: number } } | null;
  articleList: unknown;
  inlineArticle: FeedItem | null;
  selectedTags: string[];
  activeTagFilters: Set<string>;
  activeStatusFilters: Set<string>;
  currentFeed: Feed | null;
  selectedArticle: FeedItem | null;
  isRenderInProgress: boolean;
  isFilterSubheaderCollapsed: boolean;
  keywordFilterTooltip: string;
  keywordFilterStats: {
    bypassActive: boolean;
    filtersActive: boolean;
    articlesRetrieved: number;
    globalExcluded: number;
    feedExcluded: number;
  };
  highlightMatchCounts: Array<{ word: HighlightWord; count: number }>;
  dashboardMultiFilterCounts: {
    shown: number;
    filteredOut: number;
    total: number;
  } | null;
  openViewingFiltersMenu: () => void;
  renderInlineArticle: (container: HTMLElement) => void;
  renderToolbar: (container: HTMLElement) => void;
  getFilteredArticles: () => FeedItem[];
  computeHighlightMatchCounts: (articles: FeedItem[]) => void;
  getCurrentPageSize: () => number;
  updateArticleStatus: (...args: unknown[]) => Promise<void>;
  leaf: unknown;
  getSidebarKeyboardController: () => unknown;
  register: (cb: () => unknown) => void;
  registerEvent: (ref: unknown) => void;
  registerDomEvent: (el: unknown, type: string, cb: unknown) => void;
}

interface PluginSpies {
  saveSettings: ReturnType<typeof vi.fn>;
  maybeShowStorageDeprecationPrompt: ReturnType<typeof vi.fn>;
  updatePlaybackProgress: ReturnType<typeof vi.fn>;
  openSettingsToTab: ReturnType<typeof vi.fn>;
}

interface Harness {
  view: ViewInternals;
  app: App;
  settings: RssDashboardSettings;
  plugin: PluginSpies;
}

function makeItem(n: number, extra: Partial<FeedItem> = {}): FeedItem {
  return {
    title: `Item ${n}`,
    link: `https://example.com/${n}`,
    description: "",
    pubDate: new Date(Date.now() - n * 1000).toISOString(),
    guid: `guid-${n}`,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...extra,
  } as FeedItem;
}

function createHarness(
  options: {
    items?: FeedItem[];
    userStateUnreadable?: boolean;
    shardFolderHiddenFromSync?: boolean;
  } = {},
): Harness {
  const app = ObsidianStubs.App.createMock() as App;
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.feeds = [
    {
      title: "Feed",
      url: "https://example.com/feed.xml",
      folder: "",
      items: options.items ?? [],
      lastUpdated: Date.now(),
    } as Feed,
  ];
  const plugin: PluginSpies & Record<string, unknown> = {
    app,
    settings,
    isUserStateUnreadable: options.userStateUnreadable ?? false,
    isShardFolderHiddenFromSync: options.shardFolderHiddenFromSync ?? false,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    maybeShowStorageDeprecationPrompt: vi.fn(),
    updatePlaybackProgress: vi.fn(),
    openSettingsToTab: vi.fn().mockResolvedValue(undefined),
  };
  const leaf = {
    view: null,
    setViewState: vi.fn(),
    app,
  } as unknown as WorkspaceLeaf;
  const view = new RssDashboardView(
    leaf,
    plugin as unknown as RssDashboardPlugin,
  ) as unknown as ViewInternals;
  document.body.appendChild(view.containerEl);
  return { view, app, settings, plugin };
}

const SIDEBAR_CALLBACK_NAMES = [
  "onAddFeed",
  "onAddFolder",
  "onAddSubfolder",
  "onBatchToggleFolders",
  "onClearTags",
  "onDeleteFeed",
  "onDeleteFolder",
  "onEditFeed",
  "onExportOpml",
  "onFeedClick",
  "onFolderClick",
  "onFolderMultiSelect",
  "onImportOpml",
  "onManageFeeds",
  "onRangeSelect",
  "onRefreshFeeds",
  "onRetryFailedFeeds",
  "onSelectionCleared",
  "onTagFilterModeChange",
  "onTagToggle",
  "onToggleFolderCollapse",
  "onToggleSidebar",
  "onToggleTagsCollapse",
  "onUpdateFeed",
];

const ARTICLE_LIST_CALLBACK_NAMES = [
  "onArticleClick",
  "onArticleCustomSave",
  "onArticleSave",
  "onArticleUpdate",
  "onFilterChange",
  "onGroupChange",
  "onMarkAllAsRead",
  "onMarkAllAsUnread",
  "onMarkPageAsRead",
  "onOpenInReaderView",
  "onOpenPerFeedSettings",
  "onOpenSavedArticle",
  "onOpenTagsSettings",
  "onOpenViewFilters",
  "onPageChange",
  "onPageSizeChange",
  "onPersistSettings",
  "onRefreshFeeds",
  "onRenderArticleTitle",
  "onResolveCachedImageUrl",
  "onSearch",
  "onSortChange",
  "onTagsMutated",
  "onToggleSidebar",
  "onToggleViewStyle",
];

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  recorded.sidebars.length = 0;
  recorded.articleLists.length = 0;
  recorded.articleRenderers.length = 0;
  recorded.feedManagerOpened = 0;
  recorded.articleListOnRender = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.empty();
});

describe("Dashboard onOpen characterization", () => {
  it("builds the article renderer from the view's app and settings and wires its callbacks", async () => {
    const { view, app, settings, plugin } = createHarness();
    const renderSpy = vi.spyOn(view, "render");
    const updateStatus = vi
      .spyOn(view, "updateArticleStatus")
      .mockResolvedValue(undefined);

    await view.onOpen();

    expect(recorded.articleRenderers).toHaveLength(1);
    const options = recorded.articleRenderers[0] as {
      app: unknown;
      component: unknown;
      settings: unknown;
      onArticleSave: (item: FeedItem) => void;
      onArticleUpdate: (...args: unknown[]) => void;
      onOpenSavedArticle: (file: unknown) => void;
      onPlaybackProgress: (...args: unknown[]) => void;
    };
    expect(options.app).toBe(app);
    expect(options.component).toBe(view);
    expect(options.settings).toBe(settings);

    const item = makeItem(1);
    renderSpy.mockClear();
    options.onArticleSave(item);
    expect(item.saved).toBe(true);
    expect(renderSpy).toHaveBeenCalledTimes(1);

    options.onArticleUpdate(item, { read: true }, true);
    expect(updateStatus).toHaveBeenCalledWith(item, { read: true }, true);

    options.onPlaybackProgress(item, 12, 100, true);
    expect(plugin.updatePlaybackProgress).toHaveBeenCalledWith(
      item.feedUrl,
      item.guid,
      12,
      100,
      true,
      item,
    );

    const openFile = vi.fn();
    vi.spyOn(app.workspace, "getLeaf").mockReturnValue({
      openFile,
    } as never);
    options.onOpenSavedArticle({ path: "saved.md" });
    expect(openFile).toHaveBeenCalledWith({ path: "saved.md" });
  });

  it("asks for the storage deprecation prompt only once the layout is ready", async () => {
    const { view, app, plugin } = createHarness();

    await view.onOpen();
    expect(plugin.maybeShowStorageDeprecationPrompt).not.toHaveBeenCalled();

    (
      app.workspace as unknown as { triggerLayoutReady(): void }
    ).triggerLayoutReady();
    expect(plugin.maybeShowStorageDeprecationPrompt).toHaveBeenCalledTimes(1);
  });

  it("registers its workspace events, DOM events and cleanup in a fixed order", async () => {
    const { view } = createHarness();
    const order: string[] = [];
    vi.spyOn(view, "registerEvent").mockImplementation(() => {
      order.push("event");
    });
    vi.spyOn(view, "registerDomEvent").mockImplementation(((
      _el: unknown,
      type: string,
    ) => {
      order.push(`dom:${type}`);
    }) as never);
    const originalRegister = view.register.bind(view);
    vi.spyOn(view, "register").mockImplementation((cb: () => unknown) => {
      order.push("register");
      originalRegister(cb);
    });

    await view.onOpen();

    // filters-updated, tags-mutated, layout-change, then the container's click
    // and copy listeners, the math-selection cleanup, active-leaf-change, the
    // refresh announcer, and (from the first render) the sidebar resize drag.
    expect(order).toEqual([
      "event",
      "event",
      "event",
      "dom:click",
      "dom:copy",
      "register",
      "event",
      "event",
      "dom:mousedown",
      "dom:mousemove",
      "dom:mouseup",
    ]);
  });

  it("creates the layout, sidebar container and content, then renders and flags the view ready", async () => {
    const { view } = createHarness();

    await view.onOpen();

    const container = view.containerEl.children[1] as HTMLElement;
    expect(container.classList.contains("rss-dashboard-container")).toBe(true);
    const layout = container.querySelector(".rss-dashboard-layout");
    expect(layout).not.toBeNull();
    expect(view.dashboardContainer).toBe(layout);
    expect(view.sidebarContainer?.parentElement).toBe(layout);
    expect(
      view.sidebarContainer?.classList.contains(
        "rss-dashboard-sidebar-container",
      ),
    ).toBe(true);
    expect(layout?.querySelector(".rss-dashboard-content")).not.toBeNull();
    expect(view.containerEl.tabIndex).toBe(-1);
    expect(view.containerEl.hasAttribute("data-rss-ready")).toBe(true);
    expect(recorded.articleLists).toHaveLength(1);
  });

  it("constructs the sidebar once with the view's selection state and every callback", async () => {
    const { view, app, settings, plugin } = createHarness();
    view.selectedTags = ["alpha"];

    await view.onOpen();

    expect(recorded.sidebars).toHaveLength(1);
    const [appArg, containerArg, pluginArg, settingsArg, options, callbacks] =
      recorded.sidebars[0].args as [
        unknown,
        unknown,
        unknown,
        unknown,
        Record<string, unknown>,
        Record<string, unknown>,
      ];
    expect(appArg).toBe(app);
    expect(containerArg).toBe(view.sidebarContainer);
    expect(pluginArg).toBe(plugin);
    expect(settingsArg).toBe(settings);
    expect(Object.keys(options).sort()).toEqual([
      "collapsedFolders",
      "currentFeed",
      "currentFolder",
      "selectedFeeds",
      "selectedFolders",
      "selectedTags",
      "tagsCollapsed",
    ]);
    expect(options.selectedTags).toEqual(["alpha"]);
    expect(Object.keys(callbacks).sort()).toEqual(SIDEBAR_CALLBACK_NAMES);

    // Manage feeds opens the feed manager modal.
    (callbacks.onManageFeeds as () => void)();
    expect(recorded.feedManagerOpened).toBe(1);
  });

  it("keeps the existing sidebar when it opens again and re-parents its container", async () => {
    const { view } = createHarness();
    await view.onOpen();
    const sidebar = view.sidebar;
    const sidebarContainer = view.sidebarContainer!;
    const layout = view.dashboardContainer!;
    // Detach the sidebar container, as if the layout had been rebuilt.
    layout.remove();
    const freshLayout = view.containerEl.children[1].createDiv({
      cls: "rss-dashboard-layout",
    });

    await view.onOpen();

    expect(recorded.sidebars).toHaveLength(1);
    expect(view.sidebar).toBe(sidebar);
    expect(view.sidebarContainer).toBe(sidebarContainer);
    expect(sidebarContainer.parentElement).toBe(freshLayout);
    expect(view.dashboardContainer).toBe(freshLayout);
  });

  it("does nothing past the setup when the view has no content container", async () => {
    const { view } = createHarness();
    view.containerEl.empty();

    await view.onOpen();

    expect(recorded.articleRenderers).toHaveLength(1);
    expect(view.sidebar).toBeUndefined();
    expect(recorded.articleLists).toHaveLength(0);
    expect(view.containerEl.hasAttribute("data-rss-ready")).toBe(false);
  });

  it("re-renders when the filters-updated event arrives", async () => {
    const { view, app } = createHarness();
    await view.onOpen();
    const renderSpy = vi.spyOn(view, "render");

    app.workspace.trigger("rss-dashboard:filters-updated", {});

    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  describe("tags-mutated handler", () => {
    function withTags(h: Harness): void {
      h.settings.availableTags = [{ name: "keep", color: "#fff" }] as never;
    }

    it("drops sidebar and header tags that no longer exist and re-renders", async () => {
      const h = createHarness();
      withTags(h);
      await h.view.onOpen();
      h.view.selectedTags = ["keep", "gone"];
      h.view.activeTagFilters = new Set(["keep", "gone2"]);
      // A real render re-reads the header filters from settings, so stub it.
      const renderSpy = vi.spyOn(h.view, "render").mockImplementation(() => {});
      const sidebarRenders = recorded.sidebars[0].renders;

      h.app.workspace.trigger("rss-dashboard:tags-mutated");

      expect(h.view.selectedTags).toEqual(["keep"]);
      expect([...h.view.activeTagFilters]).toEqual(["keep"]);
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(recorded.sidebars[0].renders).toBe(sidebarRenders); // the stubbed render did not reach the sidebar
    });

    it("renders only the sidebar when no selected tag was removed", async () => {
      const h = createHarness();
      withTags(h);
      await h.view.onOpen();
      h.view.selectedTags = ["keep"];
      const renderSpy = vi.spyOn(h.view, "render");
      const sidebarRenders = recorded.sidebars[0].renders;

      h.app.workspace.trigger("rss-dashboard:tags-mutated");

      expect(renderSpy).not.toHaveBeenCalled();
      expect(recorded.sidebars[0].renders).toBe(sidebarRenders + 1);
    });
  });

  it("focuses the container on a click outside any interactive element, but not on a button", async () => {
    const { view } = createHarness();
    await view.onOpen();
    const focus = vi.spyOn(view.containerEl, "focus");
    const blur = vi.fn();
    view.getSidebarKeyboardController = () => ({ blurSidebarFocus: blur });

    const plain = view.containerEl.createDiv();
    plain.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(blur).toHaveBeenCalledTimes(1);

    const inSidebar = view.containerEl.createDiv({
      cls: "rss-dashboard-sidebar",
    });
    inSidebar.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(blur).toHaveBeenCalledTimes(1);
    focus.mockClear();

    const button = view.containerEl.createEl("button");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(focus).not.toHaveBeenCalled();
  });

  it("focuses the container when its own leaf becomes active", async () => {
    const { view, app } = createHarness();
    await view.onOpen();
    const focus = vi.spyOn(view.containerEl, "focus");

    app.workspace.trigger("active-leaf-change", {});
    expect(focus).not.toHaveBeenCalled();

    app.workspace.trigger("active-leaf-change", view.leaf);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("mounts one refresh announcer in the view root", async () => {
    const { view } = createHarness();

    await view.onOpen();

    expect(
      view.containerEl.querySelectorAll(".rss-dashboard-refresh-announcer"),
    ).toHaveLength(1);
  });
});

describe("Dashboard render characterization", () => {
  async function openedView(
    options: Parameters<typeof createHarness>[0] = {},
  ): Promise<Harness> {
    const h = createHarness(options);
    await h.view.onOpen();
    recorded.articleLists.length = 0;
    return h;
  }

  it("queues one trailing render when render is called while one is running", async () => {
    const { view } = await openedView();
    let calls = 0;
    recorded.articleListOnRender = () => {
      calls++;
      if (calls === 1) {
        view.render();
        view.render();
      }
    };

    view.render();

    expect(recorded.articleLists).toHaveLength(2);
    expect(view.isRenderInProgress).toBe(false);
  });

  it("destroys the previous article list before building a new one", async () => {
    const { view } = createHarness();
    await view.onOpen();
    const first = recorded.articleLists[0];

    view.render();

    expect(first.destroyed).toBe(1);
    expect(recorded.articleLists).toHaveLength(2);
  });

  it("marks the container sidebar-collapsed from the setting", async () => {
    const { view, settings } = await openedView();

    settings.sidebarCollapsed = true;
    view.render();
    expect(view.containerEl.classList.contains("sidebar-collapsed")).toBe(true);

    settings.sidebarCollapsed = false;
    view.render();
    expect(view.containerEl.classList.contains("sidebar-collapsed")).toBe(
      false,
    );
  });

  it("refreshes the sidebar's options and settings, clears its path cache and renders it", async () => {
    const { view, settings } = await openedView();
    view.selectedTags = ["beta"];
    const record = recorded.sidebars[0];
    const rendersBefore = record.renders;
    const clearedBefore = record.cleared;

    view.render();

    const sidebar = view.sidebar as unknown as {
      options: Record<string, unknown>;
      settings: unknown;
    };
    expect(record.cleared).toBe(clearedBefore + 1);
    expect(record.renders).toBe(rendersBefore + 1);
    expect(sidebar.settings).toBe(settings);
    expect(Object.keys(sidebar.options).sort()).toEqual([
      "collapsedFolders",
      "currentFeed",
      "currentFolder",
      "selectedFeeds",
      "selectedFolders",
      "selectedTags",
      "tagsCollapsed",
    ]);
    expect(sidebar.options.selectedTags).toBe(view.selectedTags);
  });

  it("empties the content area and rebuilds toolbar, filter strip and articles container in order", async () => {
    const { view } = await openedView();
    const content = view.containerEl.querySelector(
      ".rss-dashboard-content",
    ) as HTMLElement;
    content.createDiv({ cls: "stale" });

    view.render();

    const classes = Array.from(content.children).map((c) => c.className);
    expect(classes[0]).toBe("rss-dashboard-toolbar");
    expect(classes[1]).toBe("rss-dashboard-filter-subheader");
    expect(classes[2]).toBe("rss-dashboard-articles");
    expect(content.querySelector(".stale")).toBeNull();
  });

  it("builds the article list for the current page with copies of the filter state", async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(i));
    const { view } = await openedView({ items });
    view.getCurrentPageSize = () => 2;
    // render re-reads the multi-filter state from settings.
    view.settings.dashboardMultiFilters = {
      statusFilters: ["unread"],
      tagFilters: ["t"],
      logic: "OR",
    } as never;

    view.render();

    const args = recorded.articleLists[0].args;
    const container = args[0] as HTMLElement;
    expect(container.className).toBe("rss-dashboard-articles");
    expect((args[4] as FeedItem[]).length).toBe(2);
    expect(args[5]).toBe(view.selectedArticle);
    expect(Object.keys(args[6] as object).sort()).toEqual(
      ARTICLE_LIST_CALLBACK_NAMES,
    );
    expect(args[7]).toBe(1); // current page
    expect(args[8]).toBe(3); // total pages
    expect(args[9]).toBe(2); // page size
    expect(args[10]).toBe(5); // total articles
    expect(args[11]).toEqual(new Set(["unread"]));
    expect(args[11]).not.toBe(view.activeStatusFilters);
    expect(args[12]).toEqual(new Set(["t"]));
    expect(args[12]).not.toBe(view.activeTagFilters);
    expect(args[13]).toBe("OR");
    expect(args[14]).toBeUndefined(); // no current feed
    expect(args[15]).toBe(true); // all-articles view
    expect(recorded.articleLists[0].renders).toBe(1);
  });

  it("gives the article list its empty-state context after counting scope, age and view filters", async () => {
    const { view } = await openedView();

    view.render();

    expect(recorded.articleLists[0].emptyStateContext).toMatchObject({
      type: "NoArticlesAtAll",
      unfilteredCount: 0,
    });
  });

  it("clamps an out-of-range page back into range", async () => {
    const items = Array.from({ length: 3 }, (_, i) => makeItem(i));
    const { view } = await openedView({ items });
    view.getCurrentPageSize = () => 2;
    (view as unknown as { allArticlesPage: number }).allArticlesPage = 9;

    view.render();

    expect(
      (view as unknown as { allArticlesPage: number }).allArticlesPage,
    ).toBe(2);
    expect(recorded.articleLists[0].args[7]).toBe(2);
  });

  it("computes highlight counts after filtering and before the filter strip draws", async () => {
    const { view } = await openedView();
    const order: string[] = [];
    const filtered = view.getFilteredArticles.bind(view);
    view.getFilteredArticles = () => {
      order.push("filter");
      return filtered();
    };
    view.computeHighlightMatchCounts = () => {
      order.push("counts");
    };
    const strip = view.renderFilterSubheader.bind(view);
    view.renderFilterSubheader = (c) => {
      order.push("strip");
      strip(c);
    };

    view.render();

    expect(order).toEqual(["filter", "counts", "strip"]);
  });

  it("renders only the inline article when one is open", async () => {
    const { view } = await openedView();
    view.inlineArticle = makeItem(1);
    const inline = vi.fn();
    view.renderInlineArticle = inline;
    const toolbar = vi.fn();
    view.renderToolbar = toolbar;

    view.render();

    expect(inline).toHaveBeenCalledTimes(1);
    expect((inline.mock.calls[0][0] as HTMLElement).className).toBe(
      "rss-dashboard-content",
    );
    expect(toolbar).not.toHaveBeenCalled();
    expect(recorded.articleLists).toHaveLength(0);
    expect(view.isRenderInProgress).toBe(false);
  });

  it("returns quietly when the view has no content container", async () => {
    const { view } = await openedView();
    view.containerEl.empty();

    expect(() => view.render()).not.toThrow();
    expect(recorded.articleLists).toHaveLength(0);
    expect(view.isRenderInProgress).toBe(false);
  });

  it("clears the in-progress flag when a step throws, so the next render runs", async () => {
    const { view } = await openedView();
    const original = view.renderToolbar.bind(view);
    view.renderToolbar = () => {
      throw new Error("boom");
    };

    expect(() => view.render()).toThrow("boom");
    expect(view.isRenderInProgress).toBe(false);

    view.renderToolbar = original;
    view.render();
    expect(recorded.articleLists).toHaveLength(1);
  });
});

describe("Dashboard renderFilterSubheader characterization", () => {
  function strip(
    configure: (view: ViewInternals, settings: RssDashboardSettings) => void,
    options: Parameters<typeof createHarness>[0] = {},
  ): { container: HTMLElement; h: Harness } {
    const h = createHarness(options);
    configure(h.view, h.settings);
    const container = document.body.createDiv();
    h.view.renderFilterSubheader(container);
    return { container, h };
  }

  const keywordStats = {
    bypassActive: false,
    filtersActive: true,
    articlesRetrieved: 9,
    globalExcluded: 3,
    feedExcluded: 1,
  };

  function word(text: string, color = ""): HighlightWord {
    return { text, color, enabled: true } as HighlightWord;
  }

  it("shows only the refresh status row when no stats apply", () => {
    const { container } = strip(() => {});

    const rows = container.querySelectorAll(
      ".rss-dashboard-filter-subheader-content > *",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].classList.contains("rss-dashboard-refresh-status-row")).toBe(
      true,
    );
    expect(
      rows[0]
        .querySelector(".rss-dashboard-refresh-status-text")
        ?.getAttribute("aria-live"),
    ).toBe("polite");
  });

  it("draws the rows in order: refresh status, keyword rules, highlights, viewing filters", () => {
    const { container } = strip((view) => {
      view.keywordFilterStats = keywordStats;
      view.highlightMatchCounts = [{ word: word("a"), count: 1 }];
      view.dashboardMultiFilterCounts = { shown: 1, filteredOut: 0, total: 1 };
    });

    const rows = Array.from(
      container.querySelectorAll(".rss-dashboard-filter-subheader-content > *"),
    ).map((el) => el.className);
    expect(rows).toEqual([
      "rss-dashboard-filter-stats-row rss-dashboard-refresh-status-row",
      "rss-dashboard-filter-stats-row",
      "rss-dashboard-highlight-stats",
      "rss-dashboard-filter-stats-row rss-dashboard-viewing-filter-stats-row",
    ]);
  });

  it("describes the keyword rules counts and opens the Rules settings tab from its edit button", () => {
    const { container, h } = strip((view) => {
      view.keywordFilterStats = keywordStats;
    });

    const row = container.querySelectorAll(
      ".rss-dashboard-filter-stats-row",
    )[1] as HTMLElement;
    expect(
      row.querySelector(".rss-dashboard-filter-stats-text")?.textContent,
    ).toBe(
      "Articles retrieved: 9 | Excluded by global keyword rules: 3 | Excluded by per-feed keyword rules: 1",
    );
    const edit = row.querySelector("button") as HTMLButtonElement;
    expect(edit.getAttribute("aria-label")).toBe("Edit keyword rules");
    expect(edit.getAttribute("type")).toBe("button");
    const click = new MouseEvent("click", { bubbles: true });
    const stop = vi.spyOn(click, "stopPropagation");
    edit.dispatchEvent(click);
    expect(stop).toHaveBeenCalled();
    expect(h.plugin.openSettingsToTab).toHaveBeenCalledWith("Rules");
  });

  it("says keyword rules are bypassed, with the article count, when bypass is on", () => {
    const { container } = strip((view) => {
      view.keywordFilterStats = {
        ...keywordStats,
        bypassActive: true,
        filtersActive: false,
      };
    });

    expect(
      container.querySelectorAll(".rss-dashboard-filter-stats-text")[1]
        .textContent,
    ).toBe("Keyword rules bypassed - showing all 9 articles");
  });

  it("lists highlight chips with separators, dot colors and an edit button for the Highlights tab", () => {
    const { container, h } = strip((view, settings) => {
      settings.highlights.defaultColor = "#123456";
      view.highlightMatchCounts = [
        { word: word("alpha", "#ff0000"), count: 4 },
        { word: word("beta"), count: 0 },
      ];
    });

    const row = container.querySelector(
      ".rss-dashboard-highlight-stats",
    ) as HTMLElement;
    expect(row.querySelector(".rss-highlight-stats-label")?.textContent).toBe(
      "Highlights:",
    );
    const chips = row.querySelectorAll(".rss-highlight-stat-item");
    expect(Array.from(chips).map((c) => c.textContent)).toEqual([
      "alpha (4)",
      "beta (0)",
    ]);
    expect(row.querySelectorAll(".rss-highlight-stats-sep")).toHaveLength(1);
    const dots = row.querySelectorAll<HTMLElement>(".rss-highlight-dot");
    expect(dots[0].style.getPropertyValue("--highlight-color")).toBe("#ff0000");
    expect(dots[1].style.getPropertyValue("--highlight-color")).toBe("#123456");
    const edit = row.querySelector("button") as HTMLButtonElement;
    expect(edit.getAttribute("aria-label")).toBe("Edit highlights");
    edit.click();
    expect(h.plugin.openSettingsToTab).toHaveBeenCalledWith("Highlights");
  });

  it("words the viewing-filters row by whether any filter is active", () => {
    const counts = { shown: 5, filteredOut: 2, total: 7 };
    const none = strip((view) => {
      view.dashboardMultiFilterCounts = counts;
    });
    expect(
      none.container.querySelector(".rss-dashboard-viewing-filter-stats-text")
        ?.textContent,
    ).toBe("No filters applied - Showing 5 | Filtered out 2 | Total 7");

    const active = strip((view) => {
      view.dashboardMultiFilterCounts = counts;
      view.activeStatusFilters = new Set(["unread"]);
    });
    expect(
      active.container.querySelector(".rss-dashboard-viewing-filter-stats-text")
        ?.textContent,
    ).toBe("Viewing filters: Showing 5 | Filtered out 2 | Total 7");
  });

  it("opens the viewing filters menu from its button by click, Enter or Space only", () => {
    const { container, h } = strip((view) => {
      view.dashboardMultiFilterCounts = { shown: 1, filteredOut: 0, total: 1 };
    });
    const open = vi.fn();
    h.view.openViewingFiltersMenu = open;
    const button = container.querySelector(
      ".rss-dashboard-viewing-filter-open-btn",
    ) as HTMLElement;
    expect(button.getAttribute("role")).toBe("button");
    expect(button.getAttribute("tabindex")).toBe("0");
    expect(button.getAttribute("aria-label")).toBe("Open viewing filters");

    button.click();
    expect(open).toHaveBeenCalledTimes(1);

    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    const prevent = vi.spyOn(enter, "preventDefault");
    button.dispatchEvent(enter);
    expect(prevent).toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(2);

    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    expect(open).toHaveBeenCalledTimes(3);

    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    expect(open).toHaveBeenCalledTimes(3);
  });

  it("attaches the keyword filter tooltip to the content only when there is one", () => {
    const withTip = strip((view) => {
      view.keywordFilterTooltip = "Excluded: x";
    });
    expect(
      withTip.container
        .querySelector(".rss-dashboard-filter-subheader-content")
        ?.getAttribute("aria-label"),
    ).toBe("Excluded: x");

    const without = strip(() => {});
    expect(
      without.container
        .querySelector(".rss-dashboard-filter-subheader-content")
        ?.hasAttribute("aria-label"),
    ).toBe(false);
  });

  it("starts expanded and toggles collapsed state, label, aria-expanded and glyph on click", () => {
    const { container, h } = strip(() => {});
    const subheader = container.querySelector(
      ".rss-dashboard-filter-subheader",
    ) as HTMLElement;
    const toggle = subheader.querySelector(
      ".rss-dashboard-filter-subheader-toggle",
    ) as HTMLButtonElement;
    expect(subheader.classList.contains("is-collapsed")).toBe(false);
    expect(toggle.getAttribute("aria-label")).toBe("Collapse filter status");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("▴");

    toggle.click();

    expect(h.view.isFilterSubheaderCollapsed).toBe(true);
    expect(subheader.classList.contains("is-collapsed")).toBe(true);
    expect(toggle.getAttribute("aria-label")).toBe("Expand filter status");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe("▾");

    toggle.click();
    expect(h.view.isFilterSubheaderCollapsed).toBe(false);
  });

  it("draws a collapsed strip when the collapsed state was kept from an earlier render", () => {
    const { container } = strip((view) => {
      view.isFilterSubheaderCollapsed = true;
    });

    expect(
      container
        .querySelector(".rss-dashboard-filter-subheader")
        ?.classList.contains("is-collapsed"),
    ).toBe(true);
  });

  it("puts both storage alerts above the collapsible content, user-state first", () => {
    const { container } = strip(() => {}, {
      userStateUnreadable: true,
      shardFolderHiddenFromSync: true,
    });

    const kids = Array.from(
      container.querySelector(".rss-dashboard-filter-subheader")!.children,
    ).map((el) => el.className);
    expect(kids).toEqual([
      "rss-dashboard-user-state-alert",
      "rss-dashboard-user-state-alert rss-dashboard-hidden-storage-alert",
      "rss-dashboard-filter-subheader-content",
      "rss-dashboard-filter-subheader-toggle",
    ]);
  });

  it("keeps the alerts but drops the content and toggle when the status bar is off", () => {
    const { container } = strip(
      (_view, settings) => {
        settings.display.showFilterStatusBar = false;
      },
      { userStateUnreadable: true },
    );

    const kids = Array.from(
      container.querySelector(".rss-dashboard-filter-subheader")!.children,
    ).map((el) => el.className);
    expect(kids).toEqual(["rss-dashboard-user-state-alert"]);
  });
});
