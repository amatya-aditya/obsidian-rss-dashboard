import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { Sidebar, SidebarOptions, SidebarCallbacks } from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App } from "../../stubs/obsidian";
import { RssDashboardSettings, Folder, Feed } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

describe("Sidebar Rendering", () => {
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
      feeds: [
        { title: "Feed 1", url: "url1", folder: "Folder 1", items: [{ read: false }, { read: true }] },
        { title: "Feed 2", url: "url2", folder: "Folder 2", items: [{ read: false }] },
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
      availableTags: [
        { name: "Tag 1", color: "#ff0000" },
      ],
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

  it("should render successfully", () => {
    const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
    sidebar.render();
    
    expect(container.classList.contains("rss-dashboard-sidebar")).toBe(true);
    expect(container.querySelector(".rss-dashboard-sidebar-controls-surface")).not.toBeNull();
  });

  it("should render the All Feeds button", () => {
    const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
    sidebar.render();
    
    const allFeedsBtn = container.querySelector(".rss-dashboard-all-feeds-button");
    expect(allFeedsBtn).not.toBeNull();
    expect(allFeedsBtn?.textContent).toContain("All Feeds");
  });

  it("should show unread badge for All Feeds if at least one unread item exists", () => {
    const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
    sidebar.render();
    
    const badge = container.querySelector(".rss-dashboard-all-feeds-unread");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("2"); // Feed 1 has 1 unread, Feed 2 has 1 unread
  });

  it("should render folders and feeds", () => {
    const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
    sidebar.render();
    
    const foldersSection = container.querySelector(".rss-dashboard-feed-folders-section");
    expect(foldersSection).not.toBeNull();
    
    const folder1 = container.querySelector("[data-folder-path=\"Folder 1\"]");
    expect(folder1).not.toBeNull();
    
    const feed1 = container.querySelector("[data-feed-url=\"url1\"]");
    expect(feed1).not.toBeNull();
  });

  it("should render the tags section when tags are expanded", () => {
    const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
    sidebar["isTagsExpanded"] = true;
    sidebar.render();
    
    const tagsSection = container.querySelector(".rss-dashboard-sidebar-tags-section");
    expect(tagsSection).not.toBeNull();
    
    const tag1 = container.querySelector(".rss-dashboard-sidebar-tag-label");
    expect(tag1).not.toBeNull();
    expect(tag1?.textContent).toContain("Tag 1");
  });

  it("should call onTagToggle when a tag is clicked", () => {
    const sidebar = new Sidebar(app as any, container, plugin, settings, options, callbacks);
    sidebar["isTagsExpanded"] = true;
    sidebar.render();
    
    const tag1 = container.querySelector(".rss-dashboard-sidebar-tag-row") as HTMLElement;
    tag1.click();
    
    expect(callbacks.onTagToggle).toHaveBeenCalledWith("Tag 1");
  });
});
