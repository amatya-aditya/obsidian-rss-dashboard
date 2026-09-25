import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import {
  Sidebar,
  SidebarOptions,
  SidebarCallbacks,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App } from "../../stubs/obsidian";
import {
  RssDashboardSettings,
  Folder,
  type Feed,
  type FeedRefreshState,
  type FeedMetadata,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

installObsidianDomPolyfills();

interface TestApp extends App {
  workspace: App["workspace"];
}

/** Typed interface for the plugin surface under test */
interface TestPlugin extends Partial<RssDashboardPlugin> {
  settings: RssDashboardSettings;
  saveSettings: Mock<() => Promise<void>>;
  activeRefreshState?: Map<string, FeedRefreshState>;
  backgroundImportQueue?: FeedMetadata[];
  refreshFeeds: Mock<() => Promise<void>>;
  refreshFailedFeeds: Mock<() => Promise<void>>;
  getFeedShardHealth?: (feed: Feed) => "missing" | "corrupt" | "rebuilt" | null;
  isShardFolderHiddenFromSync?: boolean;
  cancelPendingStartupRefresh: Mock<() => void>;
  cancelGlobalRefresh: Mock<() => void>;
  isMultiFeedRefreshActive?: boolean;
  isGlobalRefreshCancellable?: boolean;
  globalRefreshProgress?: { completed: number; total: number };
}

/** Typed interface for Sidebar private member access */
type TestSidebar = {
  app: App;
  container: HTMLElement;
  settings: RssDashboardSettings;
  options: SidebarOptions;
  renderFallbackFeedIcon: (el: HTMLElement) => void;
  cachedFolderPaths: string[] | null;
  getCachedFolderPaths: () => string[];
  renderHeader: (el: HTMLElement) => void;
  resizeObserver: ResizeObserver | null;
  destroy: () => void;
  render: () => void;
  renderFeed: (feed: Feed, container: HTMLElement) => void;
  refreshGlobalRefreshProgressOnly: () => void;
  clearFolderPathCache: () => void;
  focusSidebar: () => void;
  hasKeyboardFocus: () => boolean;
  moveFocusToNextItem: () => void;
  moveFocusToPreviousItem: () => void;
  jumpToNextFolder: () => void;
  jumpToPreviousFolder: () => void;
  deleteFocusedItem: () => void;
  openFocusedItem: () => void;
  focusedSidebarTarget: { type: string; path?: string; url?: string } | null;
};

describe("Sidebar Core", () => {
  let app: App;
  let container: HTMLElement;
  let plugin: TestPlugin;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;

  beforeEach(() => {
    app = ObsidianStubs.App.createMock() as TestApp;
    container = createDiv();

    settings = {
      feeds: [],
      folders: [],
      display: {
        sidebarRowSpacing: 10,
        sidebarRowIndentation: 20,
        sidebarItemPaddingLeft: 2,
        sidebarItemPaddingRight: 2,
      },
      media: {
        useDomainIconsRss: false,
      },
    } as unknown as RssDashboardSettings;

    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
    };

    callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onToggleTagsCollapse: vi.fn(),
      onToggleFolderCollapse: vi.fn(),
      onAddFolder: vi.fn(),
      onAddSubfolder: vi.fn(),
      onAddFeed: vi.fn(),
      onEditFeed: vi.fn(),
      onDeleteFeed: vi.fn(),
      onDeleteFolder: vi.fn(),
      onRefreshFeeds: vi.fn(),
      onUpdateFeed: vi.fn(),
      onImportOpml: vi.fn(),
      onExportOpml: vi.fn(),
      onToggleSidebar: vi.fn(),
    };

    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      refreshFeeds: vi.fn().mockResolvedValue(undefined),
      refreshFailedFeeds: vi.fn().mockResolvedValue(undefined),
      getFeedShardHealth: vi.fn().mockReturnValue(null),
      cancelPendingStartupRefresh: vi.fn(),
      cancelGlobalRefresh: vi.fn(),
      isGlobalRefreshCancellable: false,
      globalRefreshProgress: { completed: 0, total: 0 },
    };
    callbacks.onRetryFailedFeeds = plugin.refreshFailedFeeds;
  });

  it("should initialize with correct properties", () => {
    const sidebar = new Sidebar(
      app,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    expect(sidebar).toBeDefined();
    const ts = sidebar as unknown as TestSidebar;
    // Accessing private members via typed boundary
    expect(ts.app).toBe(app);
    expect(ts.container).toBe(container);
    expect(ts.settings).toBe(settings);
    expect(ts.options).toBe(options);
  });

  describe("renderFallbackFeedIcon", () => {
    let sidebar: Sidebar;
    let iconEl: HTMLElement;

    beforeEach(() => {
      sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      iconEl = createDiv();
    });

    it("should add rss icon by default", () => {
      const ts = sidebar as unknown as TestSidebar;
      ts.renderFallbackFeedIcon(iconEl);
      expect(iconEl.dataset.icon).toBe("rss");
      expect(iconEl.classList.contains("rss-icon-hidden")).toBe(false);
    });

    it("should hide icon if setting enabled", () => {
      settings.display.hideDefaultRssIcon = true;
      const ts = sidebar as unknown as TestSidebar;
      ts.renderFallbackFeedIcon(iconEl);
      expect(iconEl.classList.contains("rss-icon-hidden")).toBe(true);
    });
  });

  describe("Folder path caching", () => {
    let sidebar: Sidebar;

    beforeEach(() => {
      sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      settings.folders = [
        { name: "folder1", subfolders: [] },
        { name: "folder2", subfolders: [] },
      ] as Folder[];
    });

    it("should cache folder paths after first call", () => {
      const ts = sidebar as unknown as TestSidebar;
      expect(ts.cachedFolderPaths).toBeNull();
      const paths = ts.getCachedFolderPaths();
      expect(paths).toContain("folder1");
      expect(ts.cachedFolderPaths).not.toBeNull();
    });

    it("should clear cache when clearFolderPathCache is called", () => {
      const ts = sidebar as unknown as TestSidebar;
      ts.getCachedFolderPaths();
      sidebar.clearFolderPathCache();
      expect(ts.cachedFolderPaths).toBeNull();
    });
  });

  describe("renderHeader basics", () => {
    it("should render sidebar header container", () => {
      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      const headerSurface = createDiv();
      const ts = sidebar as unknown as TestSidebar;
      ts.renderHeader(headerSurface);

      const header = headerSurface.querySelector(
        ".rss-dashboard-sidebar-header",
      );
      expect(header).toBeDefined();
    });

    it("does not render a duplicate close button when the mobile modal provides one", () => {
      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      const headerSurface = createDiv();
      const ts = sidebar as unknown as TestSidebar;

      ts.renderHeader(headerSurface);

      expect(
        headerSurface.querySelector(".rss-dashboard-header-close-button"),
      ).toBeNull();
    });
  });

  describe("lifecycle", () => {
    it("should disconnect resizeObserver on destroy", () => {
      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      const mockObserver = { disconnect: vi.fn() };
      const ts = sidebar as unknown as TestSidebar;
      ts.resizeObserver = mockObserver as unknown as ResizeObserver;

      sidebar.destroy();
      expect(mockObserver.disconnect).toHaveBeenCalled();
      expect(ts.resizeObserver).toBeNull();
    });
  });

  describe("sidebar keyboard navigation", () => {
    beforeEach(() => {
      document.body.appendChild(container);
      settings.folders = [
        { name: "Folder 1", subfolders: [] },
        { name: "Folder 2", subfolders: [] },
      ] as Folder[];
      settings.feeds = [
        {
          title: "Feed 1",
          url: "https://example.com/feed-1.xml",
          folder: "Folder 1",
          items: [{ read: false }],
        } as Feed,
        {
          title: "Feed 2",
          url: "https://example.com/feed-2.xml",
          folder: "Folder 2",
          items: [{ read: false }],
        } as Feed,
      ];
    });

    it("focuses the current feed by default and scrolls it into view", () => {
      const currentFeed = settings.feeds[1];
      if (!currentFeed) throw new Error("Expected second feed fixture");
      options.currentFeed = currentFeed;
      const scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView");
      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );

      sidebar.render();
      const ts = sidebar as unknown as TestSidebar;
      ts.focusSidebar();

      expect(ts.hasKeyboardFocus()).toBe(true);
      expect(ts.focusedSidebarTarget).toEqual({
        type: "feed",
        url: "https://example.com/feed-2.xml",
      });
      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        block: "nearest",
        behavior: "auto",
      });
    });

    it("moves up and down visible rows and opens the focused feed", () => {
      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );

      sidebar.render();
      const ts = sidebar as unknown as TestSidebar;
      ts.focusSidebar();
      ts.moveFocusToNextItem();
      ts.moveFocusToNextItem();
      ts.openFocusedItem();

      expect(ts.focusedSidebarTarget).toEqual({
        type: "feed",
        url: "https://example.com/feed-1.xml",
      });
      expect(callbacks.onFeedClick).toHaveBeenCalledWith(settings.feeds[0]);

      ts.moveFocusToPreviousItem();
      expect(ts.focusedSidebarTarget).toEqual({
        type: "folder",
        path: "Folder 1",
      });
    });

    it("jumps between folders from both folder and feed rows", () => {
      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );

      sidebar.render();
      const ts = sidebar as unknown as TestSidebar;
      ts.focusSidebar();
      ts.jumpToNextFolder();

      expect(ts.focusedSidebarTarget).toEqual({
        type: "folder",
        path: "Folder 1",
      });

      ts.moveFocusToNextItem();
      expect(ts.focusedSidebarTarget).toEqual({
        type: "feed",
        url: "https://example.com/feed-1.xml",
      });

      ts.jumpToNextFolder();
      expect(ts.focusedSidebarTarget).toEqual({
        type: "folder",
        path: "Folder 2",
      });

      ts.jumpToPreviousFolder();
      expect(ts.focusedSidebarTarget).toEqual({
        type: "folder",
        path: "Folder 1",
      });
    });
    describe("delete confirmation", () => {
      afterEach(() => {
        document.body.empty();
      });

      const openConfirms = () =>
        document.body.querySelectorAll(".rss-sidebar-confirm-modal");

      it("shows at most one delete confirmation when the delete hotkey repeats", () => {
        const sidebar = new Sidebar(
          app,
          container,
          plugin as unknown as RssDashboardPlugin,
          settings,
          options,
          callbacks,
        );

        sidebar.render();
        const ts = sidebar as unknown as TestSidebar;
        ts.focusSidebar();
        ts.moveFocusToNextItem();
        ts.moveFocusToNextItem();
        ts.deleteFocusedItem();
        // Focus moves while the first confirmation is still open.
        ts.moveFocusToNextItem();
        ts.deleteFocusedItem();

        expect(openConfirms()).toHaveLength(1);
        expect(openConfirms()[0]?.textContent).toContain("Feed 1");
      });

      it("allows a new delete confirmation once the previous one is dismissed", () => {
        const sidebar = new Sidebar(
          app,
          container,
          plugin as unknown as RssDashboardPlugin,
          settings,
          options,
          callbacks,
        );

        sidebar.render();
        const ts = sidebar as unknown as TestSidebar;
        ts.focusSidebar();
        ts.moveFocusToNextItem();
        ts.moveFocusToNextItem();
        ts.deleteFocusedItem();
        openConfirms()[0]
          ?.querySelector<HTMLButtonElement>(".rss-folder-name-modal-cancel")
          ?.click();
        expect(openConfirms()).toHaveLength(0);

        ts.deleteFocusedItem();
        openConfirms()[0]
          ?.querySelector<HTMLButtonElement>(".rss-folder-name-modal-ok")
          ?.click();

        expect(callbacks.onDeleteFeed).toHaveBeenCalledTimes(1);
        expect(callbacks.onDeleteFeed).toHaveBeenCalledWith(settings.feeds[0]);
      });
    });

    it("skips feeds inside collapsed folders when moving focus", () => {
      settings.collapsedFolders = ["Folder 1"];
      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );

      sidebar.render();
      const ts = sidebar as unknown as TestSidebar;
      ts.focusSidebar();
      ts.moveFocusToNextItem();
      expect(ts.focusedSidebarTarget).toEqual({
        type: "folder",
        path: "Folder 1",
      });

      ts.moveFocusToNextItem();
      expect(ts.focusedSidebarTarget).toEqual({
        type: "folder",
        path: "Folder 2",
      });

      ts.moveFocusToPreviousItem();
      expect(ts.focusedSidebarTarget).toEqual({
        type: "folder",
        path: "Folder 1",
      });
    });
  });

  describe("refresh progress rendering", () => {
    function createFeed(overrides: Partial<Feed> = {}): Feed {
      return {
        title: "Feed A",
        url: "https://example.com/a.xml",
        folder: "",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
        ...overrides,
      };
    }

    it("shows rebuilt shard guidance in the feed refresh details without a native tooltip", () => {
      const rebuiltFeed = createFeed({
        title: "Rebuilt shard",
        feedId: "feed-rebuilt",
      });
      settings.feeds = [rebuiltFeed];
      plugin.getFeedShardHealth = vi.fn().mockReturnValue("rebuilt");

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();

      const warnings = Array.from(
        container.querySelectorAll(".rss-dashboard-feed-shard-warning-badge"),
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.hasAttribute("title")).toBe(false);
      expect(document.body.textContent).toContain(
        "Feed shard file was missing or corrupted and was rebuilt. Restore the shard from the last known backup if one exists, or refresh the feed to fetch newest articles.",
      );
    });

    it("leaves per-feed missing-shard warnings to the dashboard's single alert when the storage folder is hidden from sync", () => {
      settings.feeds = [
        createFeed({ title: "Missing one", feedId: "feed-1" }),
        createFeed({ title: "Missing two", feedId: "feed-2" }),
      ];
      plugin.getFeedShardHealth = vi.fn().mockReturnValue("missing");
      plugin.isShardFolderHiddenFromSync = true;

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();

      expect(
        container.querySelectorAll(".rss-dashboard-feed-shard-warning-badge"),
      ).toHaveLength(0);
      expect(document.body.textContent).not.toContain("Repair/rebuild storage");
    });

    it("shows the all-feeds spinner and per-feed queued/processing indicators from plugin refresh state", () => {
      const processingFeed = createFeed({
        title: "Processing Feed",
        url: "https://example.com/processing.xml",
      });
      const queuedFeed = createFeed({
        title: "Queued Feed",
        url: "https://example.com/queued.xml",
      });

      settings.feeds = [processingFeed, queuedFeed];
      plugin.activeRefreshState = new Map([
        [processingFeed.url, { status: "processing", startedAt: Date.now() }],
        [queuedFeed.url, { status: "pending", startedAt: Date.now() }],
      ]);

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();

      const allFeedsIcon = container.querySelector(
        ".rss-dashboard-all-feeds-icon",
      );
      expect(allFeedsIcon?.classList.contains("refreshing")).toBe(true);

      const feedEls = Array.from(
        container.querySelectorAll(".rss-dashboard-feed"),
      );
      const processingEl = feedEls.find(
        (el) => el.getAttribute("data-feed-url") === processingFeed.url,
      );
      const queuedEl = feedEls.find(
        (el) => el.getAttribute("data-feed-url") === queuedFeed.url,
      );

      expect(
        processingEl
          ?.querySelector(".rss-dashboard-feed-icon")
          ?.getAttribute("data-icon"),
      ).toBe("loader-2");
      expect(processingEl?.classList.contains("processing-feed")).toBe(true);
      expect(
        queuedEl?.querySelector(".rss-dashboard-feed-processing-indicator")
          ?.textContent,
      ).toContain("⏳");
    });

    it("uses plain click for global refresh and Shift+click for failed-feed retry", () => {
      settings.feeds = [
        createFeed({ lastFetchError: "network down" }),
        createFeed({
          title: "Feed B",
          url: "https://example.com/b.xml",
        }),
      ];
      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );

      sidebar.render();
      const icon = container.querySelector(
        ".rss-dashboard-all-feeds-icon",
      ) as HTMLElement;
      // aria-label is the short hover tooltip; aria-labelledby still wins as
      // the accessible name, so screen readers get the full description.
      expect(icon.getAttribute("aria-label")).toBe("Refresh all feeds");
      const labelId = icon.getAttribute("aria-labelledby") ?? "";
      expect(container.querySelector(`#${labelId}`)?.textContent).toBe(
        "Refresh all feeds. Shift+click to retry failed feeds.",
      );

      icon.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      icon.dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: true }),
      );

      expect(plugin.refreshFeeds).toHaveBeenCalledTimes(1);
      expect(plugin.refreshFailedFeeds).toHaveBeenCalledTimes(1);
    });

    it("exposes failed-feed retry from the all-feeds context menu", () => {
      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();

      const allFeedsButton = container.querySelector(
        ".rss-dashboard-all-feeds-button",
      ) as HTMLElement;
      allFeedsButton.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );

      const retryItem = ObsidianStubs.Menu.lastItems.find(
        (item) => item.title === "Retry failed feeds",
      );
      expect(retryItem).toBeDefined();
      retryItem?.trigger();
      expect(plugin.refreshFailedFeeds).toHaveBeenCalledTimes(1);
    });

    describe("refresh details from the all-feeds context menu", () => {
      function openRefreshDetails(): void {
        const sidebar = new Sidebar(
          app,
          container,
          plugin as unknown as RssDashboardPlugin,
          settings,
          options,
          callbacks,
        );
        sidebar.render();
        container
          .querySelector(".rss-dashboard-all-feeds-button")
          ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        ObsidianStubs.Menu.lastItems
          .find((item) => item.title === "Refresh details")
          ?.trigger();
      }

      afterEach(() => {
        ObsidianStubs.Platform.isMobile = false;
        activeDocument
          .querySelectorAll(
            ".modal-container, .rss-dashboard-refresh-details-manual",
          )
          .forEach((el) => el.remove());
      });

      it("opens a readable modal on mobile that stays open until dismissed", async () => {
        vi.useFakeTimers();
        ObsidianStubs.Platform.isMobile = true;
        settings.feeds = [createFeed({ title: "Example feed" })];

        openRefreshDetails();
        await vi.advanceTimersByTimeAsync(10_000);

        const modal = document.querySelector<HTMLElement>(
          ".rss-dashboard-refresh-details-modal",
        );
        expect(modal?.textContent).toContain("Refresh details");
        expect(
          modal?.querySelectorAll(".rss-dashboard-refresh-details-line").length,
        ).toBeGreaterThan(0);
        expect(
          document.querySelector(".rss-dashboard-refresh-details-manual"),
        ).toBeNull();
        // Obsidian positions and animates phone modals itself. The plugin's
        // `rss-dashboard-modal` class re-centers with a transform on top of
        // that, which pushed this modal mostly off an iPhone screen.
        expect(modal?.classList.contains("rss-dashboard-modal")).toBe(false);
        vi.useRealTimers();
      });

      it("keeps the anchored popover on desktop", () => {
        settings.feeds = [createFeed({ title: "Example feed" })];

        openRefreshDetails();

        expect(
          document.querySelector(".rss-dashboard-refresh-details-manual"),
        ).not.toBeNull();
        expect(
          document.querySelector(".rss-dashboard-refresh-details-modal"),
        ).toBeNull();
      });
    });

    it("prefers import processing visuals over refresh visuals when both exist", () => {
      const feed = createFeed({
        title: "Imported Feed",
        url: "https://example.com/importing.xml",
      });

      settings.feeds = [feed];
      plugin.activeRefreshState = new Map([
        [feed.url, { status: "pending", startedAt: Date.now() }],
      ]);
      plugin.backgroundImportQueue = [
        {
          ...feed,
          importStatus: "processing",
        },
      ];

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();

      const feedEl = container.querySelector(".rss-dashboard-feed");
      expect(
        feedEl
          ?.querySelector(".rss-dashboard-feed-icon")
          ?.getAttribute("data-icon"),
      ).toBe("loader-2");
      expect(
        feedEl?.querySelector(".rss-dashboard-feed-processing-indicator"),
      ).toBeNull();
    });

    it("shows a stop icon when global refresh is cancellable", () => {
      settings.feeds = [
        createFeed({ url: "https://example.com/a.xml" }),
        createFeed({ url: "https://example.com/b.xml" }),
      ];
      plugin.isGlobalRefreshCancellable = true;
      plugin.globalRefreshProgress = { completed: 1, total: 2 };

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();

      const icon = container.querySelector(
        ".rss-dashboard-all-feeds-icon",
      ) as HTMLElement;
      expect(icon.tagName).toBe("BUTTON");
      expect(icon.getAttribute("type")).toBe("button");
      expect(icon.getAttribute("aria-label")).toBe("Stop refresh");
      expect(icon.getAttribute("aria-labelledby")).toBeTruthy();
      expect(icon.classList.contains("stop")).toBe(true);
      expect(icon.classList.contains("refreshing")).toBe(false);
    });

    it("routes icon click to cancelGlobalRefresh when cancellable", () => {
      settings.feeds = [createFeed({ url: "https://example.com/a.xml" })];
      plugin.isGlobalRefreshCancellable = true;

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();

      const icon = container.querySelector(
        ".rss-dashboard-all-feeds-icon",
      ) as HTMLElement;
      icon.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(plugin.cancelGlobalRefresh).toHaveBeenCalledTimes(1);
      expect(plugin.refreshFeeds).not.toHaveBeenCalled();
    });

    it("uses a refresh tooltip when the all-feeds row is idle", () => {
      settings.feeds = [createFeed({ url: "https://example.com/a.xml" })];

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();

      expect(
        container
          .querySelector(".rss-dashboard-all-feeds-icon")
          ?.getAttribute("aria-label"),
      ).toBe("Refresh all feeds");
    });

    it("shows progress text when global refresh is cancellable", () => {
      settings.feeds = [
        createFeed({ url: "https://example.com/a.xml" }),
        createFeed({ url: "https://example.com/b.xml" }),
        createFeed({ url: "https://example.com/c.xml" }),
      ];
      plugin.isGlobalRefreshCancellable = true;
      plugin.globalRefreshProgress = { completed: 2, total: 3 };

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();

      const progressEl = container.querySelector(
        ".rss-dashboard-all-feeds-progress",
      );
      expect(progressEl).not.toBeNull();
      expect(progressEl?.textContent).toContain("2/3");
    });

    it("updates global refresh progress without rebuilding feed rows", () => {
      const feed = createFeed({ url: "https://example.com/a.xml" });
      settings.feeds = [feed];
      plugin.isGlobalRefreshCancellable = true;
      plugin.globalRefreshProgress = { completed: 0, total: 1 };

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();
      const originalFeedRow = container.querySelector(
        `[data-feed-url="${feed.url}"]`,
      );

      plugin.globalRefreshProgress = { completed: 1, total: 1 };
      (sidebar as unknown as TestSidebar).refreshGlobalRefreshProgressOnly();

      expect(
        container.querySelector(".rss-dashboard-all-feeds-progress")
          ?.textContent,
      ).toBe("1/1");
      expect(container.querySelector(`[data-feed-url="${feed.url}"]`)).toBe(
        originalFeedRow,
      );
    });

    it("restores sidebar scroll before a subsequent status redraw", () => {
      const feed = createFeed({ url: "https://example.com/a.xml" });
      settings.feeds = [feed];
      vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
      const empty = container.empty.bind(container);
      vi.spyOn(container, "empty").mockImplementation(() => {
        empty();
        container.scrollTop = 0;
        return container;
      });

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();
      container.scrollTop = 180;

      sidebar.render();

      expect(container.scrollTop).toBe(180);
    });

    it("does not show stop icon when refresh is active but not cancellable", () => {
      settings.feeds = [createFeed({ url: "https://example.com/a.xml" })];
      plugin.isMultiFeedRefreshActive = true;
      plugin.isGlobalRefreshCancellable = false;

      const sidebar = new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
      sidebar.render();

      const icon = container.querySelector(
        ".rss-dashboard-all-feeds-icon",
      ) as HTMLElement;
      expect(icon.classList.contains("refreshing")).toBe(true);
      expect(icon.classList.contains("stop")).toBe(false);
    });
  });
  // ── RED: multi-folder ctrl+click selection ────────────────────────────────
  // Tests written BEFORE implementation (TDD red phase). These will fail until
  // SidebarOptions.selectedFolders and SidebarCallbacks.onFolderMultiSelect
  // are implemented in sidebar.ts.
  describe("multi-folder ctrl+click selection", () => {
    function makeSidebarWithFolders(
      folderNames: string[],
      selectedFolders: string[] = [],
    ): Sidebar {
      // Attach to DOM so click events propagate correctly.
      document.body.appendChild(container);
      settings.folders = folderNames.map(
        (name) => ({ name, subfolders: [] }) as Folder,
      );
      settings.feeds = [];
      options.selectedFolders = selectedFolders;
      callbacks.onFolderMultiSelect = vi.fn();
      return new Sidebar(
        app,
        container,
        plugin as unknown as RssDashboardPlugin,
        settings,
        options,
        callbacks,
      );
    }

    afterEach(() => {
      // Clean up DOM between tests.
      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
      container = createDiv();
    });

    it("ctrl+click on a folder calls onFolderMultiSelect with that folder added to the selection", () => {
      const sidebar = makeSidebarWithFolders(["News", "Tech"]);
      sidebar.render();

      const folderHeader = container.querySelector(
        "[data-folder-path='News']",
      ) as HTMLElement;
      expect(folderHeader).not.toBeNull();

      // Dispatch a ctrl+click
      folderHeader.dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true, button: 0 }),
      );

      expect(callbacks.onFolderMultiSelect).toHaveBeenCalledWith(["News"]);
      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });

    it("ctrl+click a second folder appends it to the existing selection", () => {
      // Start with 'News' already selected
      const sidebar = makeSidebarWithFolders(["News", "Tech"], ["News"]);
      sidebar.render();

      const techHeader = container.querySelector(
        "[data-folder-path='Tech']",
      ) as HTMLElement;
      expect(techHeader).not.toBeNull();

      techHeader.dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true, button: 0 }),
      );

      expect(callbacks.onFolderMultiSelect).toHaveBeenCalledWith([
        "News",
        "Tech",
      ]);
    });

    it("ctrl+click an already-selected folder removes it from the selection", () => {
      // Start with both folders selected
      const sidebar = makeSidebarWithFolders(
        ["News", "Tech"],
        ["News", "Tech"],
      );
      sidebar.render();

      const newsHeader = container.querySelector(
        "[data-folder-path='News']",
      ) as HTMLElement;
      newsHeader.dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true, button: 0 }),
      );

      // After removing 'News', only 'Tech' should remain
      expect(callbacks.onFolderMultiSelect).toHaveBeenCalledWith(["Tech"]);
    });

    it("plain click on a folder calls onFolderClick (not onFolderMultiSelect)", () => {
      const sidebar = makeSidebarWithFolders(["News", "Tech"], ["News"]);
      sidebar.render();

      const techHeader = container.querySelector(
        "[data-folder-path='Tech']",
      ) as HTMLElement;
      techHeader.dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: false, button: 0 }),
      );

      expect(callbacks.onFolderMultiSelect).not.toHaveBeenCalled();
      expect(callbacks.onFolderClick).toHaveBeenCalledWith("Tech");
    });

    it("renders the multi-selected CSS class on folders in selectedFolders", () => {
      const sidebar = makeSidebarWithFolders(
        ["News", "Tech", "Science"],
        ["News", "Science"],
      );
      sidebar.render();

      const newsHeader = container.querySelector(
        "[data-folder-path='News']",
      ) as HTMLElement;
      const techHeader = container.querySelector(
        "[data-folder-path='Tech']",
      ) as HTMLElement;
      const scienceHeader = container.querySelector(
        "[data-folder-path='Science']",
      ) as HTMLElement;

      expect(newsHeader.classList.contains("multi-selected")).toBe(true);
      expect(scienceHeader.classList.contains("multi-selected")).toBe(true);
      expect(techHeader.classList.contains("multi-selected")).toBe(false);
    });

    it("does not add multi-selected class when selectedFolders is empty", () => {
      const sidebar = makeSidebarWithFolders(["News", "Tech"], []);
      sidebar.render();

      const allHeaders = Array.from(
        container.querySelectorAll(".rss-dashboard-feed-folder-header"),
      );
      expect(
        allHeaders.every((h) => !h.classList.contains("multi-selected")),
      ).toBe(true);
    });

    it("meta+click (macOS) also triggers multi-select", () => {
      const sidebar = makeSidebarWithFolders(["News"]);
      sidebar.render();

      const folderHeader = container.querySelector(
        "[data-folder-path='News']",
      ) as HTMLElement;
      folderHeader.dispatchEvent(
        new MouseEvent("click", { bubbles: true, metaKey: true, button: 0 }),
      );

      expect(callbacks.onFolderMultiSelect).toHaveBeenCalledWith(["News"]);
      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });
  });
});
