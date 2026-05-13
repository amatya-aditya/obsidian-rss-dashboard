import { readFileSync } from "fs";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  Sidebar,
  SidebarOptions,
  SidebarCallbacks,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App } from "../../stubs/obsidian";
import { RssDashboardSettings, Folder, Feed } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const SIDEBAR_CSS = readFileSync("src/styles/sidebar.css", "utf-8");

describe("Sidebar Rendering", () => {
  let app: App;
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let plugin: any;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;

  beforeEach(() => {
    app = ObsidianStubs.App.createMock();
    container = document.createElement("div");
    document.body.appendChild(container);

    styleEl = document.createElement("style");
    styleEl.textContent = SIDEBAR_CSS;
    document.head.appendChild(styleEl);

    settings = {
      feeds: [
        {
          title: "Feed 1",
          url: "url1",
          folder: "Folder 1",
          items: [{ read: false }, { read: true }],
        },
        {
          title: "Feed 2",
          url: "url2",
          folder: "Folder 2",
          items: [{ read: false }],
        },
      ],
      folders: [
        { name: "Folder 1", subfolders: [] },
        { name: "Folder 2", subfolders: [] },
      ],
      display: {
        sidebarRowSpacing: 10,
        sidebarRowIndentation: 20,
        sidebarItemPaddingLeft: 2,
        sidebarItemPaddingRight: 2,
        showAllFeedsUnreadBadges: true,
        showFolderUnreadBadges: true,
        showFeedUnreadBadges: true,
      },
      availableTags: [{ name: "Tag 1", color: "#ff0000" }],
    } as unknown as RssDashboardSettings;

    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: false,
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
      onToggleSidebar: vi.fn(),
    } as unknown as SidebarCallbacks;

    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    styleEl.remove();
    container.remove();
  });

  it("should render successfully", () => {
    const sidebar = new Sidebar(
      app as any,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    expect(container.classList.contains("rss-dashboard-sidebar")).toBe(true);
    expect(
      container.querySelector(".rss-dashboard-sidebar-controls-surface"),
    ).not.toBeNull();
  });

  it("should render the All Feeds button", () => {
    const sidebar = new Sidebar(
      app as any,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const allFeedsBtn = container.querySelector(
      ".rss-dashboard-all-feeds-button",
    );
    expect(allFeedsBtn).not.toBeNull();
    expect(allFeedsBtn?.textContent).toContain("All Feeds");
  });

  it("should show unread badge for All Feeds if at least one unread item exists", () => {
    const sidebar = new Sidebar(
      app as any,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const badge = container.querySelector(".rss-dashboard-all-feeds-unread");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("2"); // Feed 1 has 1 unread, Feed 2 has 1 unread
  });

  it("should render folders and feeds", () => {
    const sidebar = new Sidebar(
      app as any,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const foldersSection = container.querySelector(
      ".rss-dashboard-feed-folders-section",
    );
    expect(foldersSection).not.toBeNull();

    const folder1 = container.querySelector('[data-folder-path="Folder 1"]');
    expect(folder1).not.toBeNull();

    const feed1 = container.querySelector('[data-feed-url="url1"]');
    expect(feed1).not.toBeNull();
  });

  it("uses favicon flow for non-YouTube video feeds instead of play icon", () => {
    settings.display.useDomainFavicons = true;
    settings.feeds = [
      {
        title: "Bloomberg Video Feed",
        url: "https://www.bloomberg.com/feed/podcast.xml",
        folder: "Folder 1",
        mediaType: "video",
        items: [{ read: false }],
      } as Feed,
    ];

    const sidebar = new Sidebar(
      app as any,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const feedRow = container.querySelector(
      '[data-feed-url="https://www.bloomberg.com/feed/podcast.xml"]',
    ) as HTMLElement;
    const icon = feedRow.querySelector(
      ".rss-dashboard-feed-icon",
    ) as HTMLElement;

    expect(feedRow.classList.contains("video-feed")).toBe(false);
    expect(icon.dataset.icon).not.toBe("play");
  });

  it("shows play icon for YouTube video feeds", () => {
    settings.display.useDomainFavicons = true;
    settings.feeds = [
      {
        title: "YouTube Feed",
        url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC123",
        folder: "Folder 1",
        mediaType: "video",
        items: [{ read: false }],
      } as Feed,
    ];

    const sidebar = new Sidebar(
      app as any,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const feedRow = container.querySelector(
      '[data-feed-url="https://www.youtube.com/feeds/videos.xml?channel_id=UC123"]',
    ) as HTMLElement;
    const icon = feedRow.querySelector(
      ".rss-dashboard-feed-icon",
    ) as HTMLElement;

    expect(feedRow.classList.contains("video-feed")).toBe(true);
    expect(icon.dataset.icon).toBe("play");
  });

  it("keeps the feed icon at a fixed size when the row is width constrained", () => {
    settings.feeds = [
      {
        title:
          "A very long feed title that should truncate before the icon shrinks",
        url: "url1",
        folder: "Folder 1",
        items: [{ read: false }],
      } as Feed,
    ];

    const sidebar = new Sidebar(
      app as any,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const feedRow = container.querySelector(
      '[data-feed-url="url1"]',
    ) as HTMLElement;
    const feedName = feedRow.querySelector(
      ".rss-dashboard-feed-name",
    ) as HTMLElement;
    const icon = feedRow.querySelector(
      ".rss-dashboard-feed-icon",
    ) as HTMLElement;

    expect(feedName).not.toBeNull();
    expect(icon).not.toBeNull();

    const iconStyle = window.getComputedStyle(icon);
    const feedNameStyle = window.getComputedStyle(feedName);

    expect(iconStyle.width).toBe("16px");
    expect(iconStyle.height).toBe("16px");
    expect(iconStyle.flexShrink).toBe("0");
    expect(feedNameStyle.overflow).toBe("hidden");
    expect(feedNameStyle.textOverflow).toBe("ellipsis");
    expect(feedNameStyle.whiteSpace).toBe("nowrap");
  });

  it("should toggle a folder from the chevron without opening the folder", () => {
    const sidebar = new Sidebar(
      app as any,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const folderHeader = container.querySelector(
      '[data-folder-path="Folder 1"].rss-dashboard-feed-folder-header',
    ) as HTMLElement;
    const toggleButton = folderHeader.querySelector(
      ".rss-dashboard-feed-folder-toggle",
    ) as HTMLElement;
    const folderFeeds = folderHeader.parentElement?.querySelector(
      ".rss-dashboard-folder-feeds",
    ) as HTMLElement;

    expect(folderHeader.classList.contains("collapsed")).toBe(false);
    expect(folderFeeds.classList.contains("collapsed")).toBe(false);

    toggleButton.click();

    expect(folderHeader.classList.contains("collapsed")).toBe(true);
    expect(folderFeeds.classList.contains("collapsed")).toBe(true);
    expect(callbacks.onToggleFolderCollapse).toHaveBeenCalledWith(
      "Folder 1",
      false,
    );
    expect(callbacks.onFolderClick).not.toHaveBeenCalled();
  });

  it("should open the folder context menu from a long press", () => {
    vi.useFakeTimers();

    try {
      const sidebar = new Sidebar(
        app as any,
        container,
        plugin,
        settings,
        options,
        callbacks,
      );
      const showFolderContextMenuSpy = vi
        .spyOn(sidebar as any, "showFolderContextMenu")
        .mockImplementation(() => undefined);

      sidebar.render();

      const folderHeader = container.querySelector(
        '[data-folder-path="Folder 1"].rss-dashboard-feed-folder-header',
      ) as HTMLElement;

      folderHeader.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
      vi.advanceTimersByTime(500);

      expect(showFolderContextMenuSpy).toHaveBeenCalledTimes(1);
      expect(showFolderContextMenuSpy.mock.calls[0][1]).toMatchObject({
        name: "Folder 1",
      });
      expect(showFolderContextMenuSpy.mock.calls[0][2]).toBe("Folder 1");
      expect(showFolderContextMenuSpy.mock.calls[0][3]).toBe("Folder 1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("should render the tags section when tags are expanded", () => {
    const sidebar = new Sidebar(
      app as any,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar["isTagsExpanded"] = true;
    sidebar.render();

    const tagsSection = container.querySelector(
      ".rss-dashboard-sidebar-tags-section",
    );
    expect(tagsSection).not.toBeNull();

    const tag1 = container.querySelector(".rss-dashboard-sidebar-tag-label");
    expect(tag1).not.toBeNull();
    expect(tag1?.textContent).toContain("Tag 1");
  });

  it("should call onTagToggle when a tag is clicked", () => {
    const sidebar = new Sidebar(
      app as any,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar["isTagsExpanded"] = true;
    sidebar.render();

    const tag1 = container.querySelector(
      ".rss-dashboard-sidebar-tag-row",
    ) as HTMLElement;
    tag1.click();

    expect(callbacks.onTagToggle).toHaveBeenCalledWith("Tag 1");
  });
});
