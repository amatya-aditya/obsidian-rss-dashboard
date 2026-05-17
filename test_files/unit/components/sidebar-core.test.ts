import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { Sidebar, SidebarOptions, SidebarCallbacks } from "../../../src/components/sidebar";
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
}

/** Typed interface for Sidebar private member access */
type TestSidebar = {
  app: App;
  container: HTMLElement;
  settings: RssDashboardSettings;
  options: SidebarOptions;
  extractDomain: (url: string) => string;
  getFaviconUrl: (domain: string) => string;
  isFaviconUrlAvailable: (url: string) => Promise<boolean>;
  renderFallbackFeedIcon: (el: HTMLElement) => void;
  cachedFolderPaths: string[] | null;
  getCachedFolderPaths: () => string[];
  renderHeader: (el: HTMLElement) => void;
  resizeObserver: ResizeObserver | null;
  destroy: () => void;
  render: () => void;
  clearFolderPathCache: () => void;
  focusSidebar: () => void;
  hasKeyboardFocus: () => boolean;
  moveFocusToNextItem: () => void;
  moveFocusToPreviousItem: () => void;
  jumpToNextFolder: () => void;
  jumpToPreviousFolder: () => void;
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
    container = document.createElement("div");
    
    settings = {
      feeds: [],
      folders: [],
      display: {
        sidebarRowSpacing: 10,
        sidebarRowIndentation: 20,
        sidebarItemPaddingLeft: 2,
        sidebarItemPaddingRight: 2,
      },
    } as unknown as RssDashboardSettings;

    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
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
    };
  });

  it("should initialize with correct properties", () => {
    const sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
    expect(sidebar).toBeDefined();
    const ts = sidebar as unknown as TestSidebar;
    // Accessing private members via typed boundary
    expect(ts.app).toBe(app);
    expect(ts.container).toBe(container);
    expect(ts.settings).toBe(settings);
    expect(ts.options).toBe(options);
  });

  describe("extractDomain", () => {
    let sidebar: Sidebar;

    beforeEach(() => {
      sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
    });

    it("should extract domain from simple URL", () => {
      const ts = sidebar as unknown as TestSidebar;
      expect(ts.extractDomain("https://example.com/rss")).toBe("example.com");
    });

    it("should extract domain from URL with subdomains", () => {
      const ts = sidebar as unknown as TestSidebar;
      expect(ts.extractDomain("https://blog.example.com/feed")).toBe("example.com");
    });

    it("should handle feeds.feedburner.com specifically", () => {
      const ts = sidebar as unknown as TestSidebar;
      expect(ts.extractDomain("http://feeds.feedburner.com/test")).toBe("feedburner.com");
    });

    it("should handle invalid URLs gracefully", () => {
      const ts = sidebar as unknown as TestSidebar;
      expect(ts.extractDomain("not-a-url")).toBe("");
    });
  });

  describe("getFaviconUrl", () => {
    let sidebar: Sidebar;

    beforeEach(() => {
      sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
    });

    it("should return Google S2 favicon URL", () => {
      const domain = "example.com";
      const expected = `https://www.google.com/s2/favicons?sz=32&domain_url=http://${domain}`;
      const ts = sidebar as unknown as TestSidebar;
      expect(ts.getFaviconUrl(domain)).toBe(expected);
    });

    it("should return empty string for empty domain", () => {
      const ts = sidebar as unknown as TestSidebar;
      expect(ts.getFaviconUrl("")).toBe("");
    });
  });

  describe("isFaviconUrlAvailable logic", () => {
    let sidebar: Sidebar;

    beforeEach(() => {
      sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
      // Use vi.spyOn for mocking exported stub functions
      vi.spyOn(ObsidianStubs, "requestUrl").mockImplementation(async () => ({ status: 200, text: "" }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return true for 200 OK headcount", async () => {
      vi.mocked(ObsidianStubs.requestUrl).mockResolvedValue({ status: 200, text: "" });
      const ts = sidebar as unknown as TestSidebar;
      const result = await ts.isFaviconUrlAvailable("http://fav.ico");
      expect(result).toBe(true);
      expect(ObsidianStubs.requestUrl).toHaveBeenCalledWith(expect.objectContaining({ method: "HEAD" }));
    });

    it("should retry with GET if HEAD returns 405", async () => {
      vi.mocked(ObsidianStubs.requestUrl)
        .mockResolvedValueOnce({ status: 405, text: "" })
        .mockResolvedValueOnce({ status: 200, text: "" });
        
      const ts = sidebar as unknown as TestSidebar;
      const result = await ts.isFaviconUrlAvailable("http://fav.ico");
      expect(result).toBe(true);
      expect(ObsidianStubs.requestUrl).toHaveBeenCalledTimes(2);
    });

    it("should return false if both HEAD and GET fail", async () => {
      vi.mocked(ObsidianStubs.requestUrl).mockRejectedValue(new Error("Network Error"));
      const ts = sidebar as unknown as TestSidebar;
      const result = await ts.isFaviconUrlAvailable("http://fav.ico");
      expect(result).toBe(false);
    });
  });

  describe("renderFallbackFeedIcon", () => {
    let sidebar: Sidebar;
    let iconEl: HTMLElement;

    beforeEach(() => {
      sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
      iconEl = document.createElement("div");
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
      sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
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
      const sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
      const headerSurface = document.createElement("div");
      const ts = sidebar as unknown as TestSidebar;
      ts.renderHeader(headerSurface);
      
      const header = headerSurface.querySelector(".rss-dashboard-sidebar-header");
      expect(header).toBeDefined();
    });
  });

  describe("lifecycle", () => {
    it("should disconnect resizeObserver on destroy", () => {
      const sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
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
      options.currentFeed = settings.feeds[1];
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

      const sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
      sidebar.render();

      const allFeedsIcon = container.querySelector(".rss-dashboard-all-feeds-icon");
      expect(allFeedsIcon?.classList.contains("refreshing")).toBe(true);

      const feedEls = Array.from(container.querySelectorAll(".rss-dashboard-feed"));
      const processingEl = feedEls.find((el) => el.getAttribute("data-feed-url") === processingFeed.url);
      const queuedEl = feedEls.find((el) => el.getAttribute("data-feed-url") === queuedFeed.url);

      expect(processingEl?.querySelector(".rss-dashboard-feed-icon")?.getAttribute("data-icon")).toBe("loader-2");
      expect(processingEl?.classList.contains("processing-feed")).toBe(true);
      expect(queuedEl?.querySelector(".rss-dashboard-feed-processing-indicator")?.textContent).toContain("⏳");
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

      const sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
      sidebar.render();

      const feedEl = container.querySelector(".rss-dashboard-feed");
      expect(feedEl?.querySelector(".rss-dashboard-feed-icon")?.getAttribute("data-icon")).toBe("loader-2");
      expect(feedEl?.querySelector(".rss-dashboard-feed-processing-indicator")).toBeNull();
    });
  });
});
