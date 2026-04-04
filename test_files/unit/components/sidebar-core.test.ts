import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { Sidebar, SidebarOptions, SidebarCallbacks } from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App } from "../../stubs/obsidian";
import {
  RssDashboardSettings,
  Folder,
  type Feed,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

describe("Sidebar Core", () => {
  let app: App;
  let container: HTMLElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let plugin: any;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;

  beforeEach(() => {
    app = ObsidianStubs.App.createMock();
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
    const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
    expect(sidebar).toBeDefined();
    // Accessing private members via bracket notation for testing
    expect(sidebar["app"]).toBe(app);
    expect(sidebar["container"]).toBe(container);
    expect(sidebar["settings"]).toBe(settings);
    expect(sidebar["options"]).toBe(options);
  });

  describe("extractDomain", () => {
    let sidebar: Sidebar;

    beforeEach(() => {
      sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
    });

    it("should extract domain from simple URL", () => {
      expect(sidebar["extractDomain"]("https://example.com/rss")).toBe("example.com");
    });

    it("should extract domain from URL with subdomains", () => {
      expect(sidebar["extractDomain"]("https://blog.example.com/feed")).toBe("example.com");
    });

    it("should handle feeds.feedburner.com specifically", () => {
      expect(sidebar["extractDomain"]("http://feeds.feedburner.com/test")).toBe("feedburner.com");
    });

    it("should handle invalid URLs gracefully", () => {
      expect(sidebar["extractDomain"]("not-a-url")).toBe("");
    });
  });

  describe("getFaviconUrl", () => {
    let sidebar: Sidebar;

    beforeEach(() => {
      sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
    });

    it("should return Google S2 favicon URL", () => {
      const domain = "example.com";
      const expected = `https://www.google.com/s2/favicons?sz=32&domain_url=http://${domain}`;
      expect(sidebar["getFaviconUrl"](domain)).toBe(expected);
    });

    it("should return empty string for empty domain", () => {
      expect(sidebar["getFaviconUrl"]("")).toBe("");
    });
  });

  describe("isFaviconUrlAvailable logic", () => {
    let sidebar: Sidebar;

    beforeEach(() => {
      sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
      // Use vi.spyOn for mocking exported stub functions
      vi.spyOn(ObsidianStubs, "requestUrl").mockImplementation(async () => ({ status: 200, text: "" }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return true for 200 OK headcount", async () => {
      vi.mocked(ObsidianStubs.requestUrl).mockResolvedValue({ status: 200, text: "" });
      const result = await sidebar["isFaviconUrlAvailable"]("http://fav.ico");
      expect(result).toBe(true);
      expect(ObsidianStubs.requestUrl).toHaveBeenCalledWith(expect.objectContaining({ method: "HEAD" }));
    });

    it("should retry with GET if HEAD returns 405", async () => {
      vi.mocked(ObsidianStubs.requestUrl)
        .mockResolvedValueOnce({ status: 405, text: "" })
        .mockResolvedValueOnce({ status: 200, text: "" });
        
      const result = await sidebar["isFaviconUrlAvailable"]("http://fav.ico");
      expect(result).toBe(true);
      expect(ObsidianStubs.requestUrl).toHaveBeenCalledTimes(2);
    });

    it("should return false if both HEAD and GET fail", async () => {
      vi.mocked(ObsidianStubs.requestUrl).mockRejectedValue(new Error("Network Error"));
      const result = await sidebar["isFaviconUrlAvailable"]("http://fav.ico");
      expect(result).toBe(false);
    });
  });

  describe("renderFallbackFeedIcon", () => {
    let sidebar: Sidebar;
    let iconEl: HTMLElement;

    beforeEach(() => {
      sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
      iconEl = document.createElement("div");
    });

    it("should add rss icon by default", () => {
      sidebar["renderFallbackFeedIcon"](iconEl);
      expect(iconEl.dataset.icon).toBe("rss");
      expect(iconEl.classList.contains("rss-icon-hidden")).toBe(false);
    });

    it("should hide icon if setting enabled", () => {
      settings.display.hideDefaultRssIcon = true;
      sidebar["renderFallbackFeedIcon"](iconEl);
      expect(iconEl.classList.contains("rss-icon-hidden")).toBe(true);
    });
  });

  describe("Folder path caching", () => {
    let sidebar: Sidebar;

    beforeEach(() => {
      sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
      settings.folders = [
        { name: "folder1", subfolders: [] },
        { name: "folder2", subfolders: [] },
      ] as Folder[];
    });

    it("should cache folder paths after first call", () => {
      expect(sidebar["cachedFolderPaths"]).toBeNull();
      const paths = sidebar["getCachedFolderPaths"]();
      expect(paths).toContain("folder1");
      expect(sidebar["cachedFolderPaths"]).not.toBeNull();
    });

    it("should clear cache when clearFolderPathCache is called", () => {
      sidebar["getCachedFolderPaths"]();
      sidebar.clearFolderPathCache();
      expect(sidebar["cachedFolderPaths"]).toBeNull();
    });
  });

  describe("renderHeader basics", () => {
    it("should render sidebar header container", () => {
      const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
      const headerSurface = container.createDiv();
      sidebar["renderHeader"](headerSurface);
      
      const header = headerSurface.querySelector(".rss-dashboard-sidebar-header");
      expect(header).toBeDefined();
    });
  });

  describe("lifecycle", () => {
    it("should disconnect resizeObserver on destroy", () => {
      const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
      const mockObserver = { disconnect: vi.fn() };
      sidebar["resizeObserver"] = mockObserver as any;
      
      sidebar.destroy();
      expect(mockObserver.disconnect).toHaveBeenCalled();
      expect(sidebar["resizeObserver"]).toBeNull();
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

      const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
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

      const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
      sidebar.render();

      const feedEl = container.querySelector(".rss-dashboard-feed");
      expect(feedEl?.querySelector(".rss-dashboard-feed-icon")?.getAttribute("data-icon")).toBe("loader-2");
      expect(feedEl?.querySelector(".rss-dashboard-feed-processing-indicator")).toBeNull();
    });
  });
});
