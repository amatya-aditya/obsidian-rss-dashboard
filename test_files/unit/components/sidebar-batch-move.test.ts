import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
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
  Folder,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

installObsidianDomPolyfills();

interface TestPlugin extends Partial<RssDashboardPlugin> {
  settings: RssDashboardSettings;
  saveSettings: Mock<() => Promise<void>>;
}

function makeFeed(title: string, url: string, folder = ""): Feed {
  return {
    title,
    url,
    folder,
    items: [],
    lastUpdated: 0,
  };
}

describe("Sidebar Batch Move (TDD)", () => {
  let app: App;
  let container: HTMLElement;
  let plugin: TestPlugin;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;
  let sidebar: Sidebar;

  beforeEach(() => {
    app = ObsidianStubs.App.createMock();
    container = createDiv();

    const feeds: Feed[] = [
      makeFeed("Feed 1", "https://feed1.com", "FolderA"),
      makeFeed("Feed 2", "https://feed2.com", "FolderA"),
      makeFeed("Feed 3", "https://feed3.com", "FolderB"),
      makeFeed("Feed 4", "https://feed4.com", ""),
    ];

    const folders: Folder[] = [
      { name: "FolderA", subfolders: [] },
      { name: "FolderB", subfolders: [] },
      { name: "FolderC", subfolders: [] },
    ];

    settings = {
      feeds,
      folders,
      display: {
        sidebarRowSpacing: 10,
        sidebarRowIndentation: 20,
        sidebarItemPaddingLeft: 2,
        sidebarItemPaddingRight: 2,
      },
    } as unknown as RssDashboardSettings;

    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
    };

    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
      selectedFeeds: ["https://feed1.com", "https://feed2.com"],
    };

    callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onToggleTagsCollapse: vi.fn(),
      onToggleFolderCollapse: vi.fn(),
      onBatchToggleFolders: vi.fn(),
      onAddFolder: vi.fn(),
      onAddSubfolder: vi.fn(),
      onAddFeed: vi.fn(),
      onEditFeed: vi.fn(),
      onDeleteFeed: vi.fn(),
      onDeleteFolder: vi.fn(),
      onRefreshFeeds: vi.fn(),
      onRetryFailedFeeds: vi.fn(),
      onUpdateFeed: vi.fn(),
    };

    sidebar = new Sidebar(app, container, plugin as unknown as RssDashboardPlugin, settings, options, callbacks);
    sidebar.render();
  });

  it("dragstart on a selected feed populates feed-urls with all selected feeds", () => {
    const feed1El = container.querySelector('[data-feed-url="https://feed1.com"]') as HTMLElement;
    expect(feed1El).toBeTruthy();

    const dataStore: Record<string, string> = {};
    const dataTransfer = {
      setData: vi.fn((key: string, val: string) => {
        dataStore[key] = val;
      }),
      getData: vi.fn((key: string) => dataStore[key] || ""),
      types: [] as string[],
      effectAllowed: "none",
    };

    const dragEvent = new Event("dragstart", { bubbles: true }) as DragEvent;
    Object.defineProperty(dragEvent, "dataTransfer", { value: dataTransfer });

    feed1El.dispatchEvent(dragEvent);

    expect(dataTransfer.setData).toHaveBeenCalledWith("feed-url", "https://feed1.com");
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "feed-urls",
      JSON.stringify(["https://feed1.com", "https://feed2.com"]),
    );
  });

  it("dragstart on an unselected feed with active multi-selection auto-includes that feed", () => {
    // feed3 is not in options.selectedFeeds initially
    const feed3El = container.querySelector('[data-feed-url="https://feed3.com"]') as HTMLElement;
    expect(feed3El).toBeTruthy();

    const dataStore: Record<string, string> = {};
    const dataTransfer = {
      setData: vi.fn((key: string, val: string) => {
        dataStore[key] = val;
      }),
      getData: vi.fn((key: string) => dataStore[key] || ""),
      types: [] as string[],
      effectAllowed: "none",
    };

    const dragEvent = new Event("dragstart", { bubbles: true }) as DragEvent;
    Object.defineProperty(dragEvent, "dataTransfer", { value: dataTransfer });

    feed3El.dispatchEvent(dragEvent);

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "feed-urls",
      JSON.stringify(["https://feed1.com", "https://feed2.com", "https://feed3.com"]),
    );
  });

  it("dropping multiple feeds onto a folder header moves all of them into that folder", () => {
    const folderCEl = container.querySelector('[data-folder-path="FolderC"]') as HTMLElement;
    expect(folderCEl).toBeTruthy();

    const dataTransfer = {
      getData: vi.fn((key: string) => {
        if (key === "feed-urls") {
          return JSON.stringify(["https://feed1.com", "https://feed2.com"]);
        }
        if (key === "feed-url") return "https://feed1.com";
        return "";
      }),
      types: ["feed-urls", "feed-url"],
    };

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(dropEvent, "clientY", { value: 100 });

    folderCEl.dispatchEvent(dropEvent);

    expect(settings.feeds.find((f) => f.url === "https://feed1.com")?.folder).toBe("FolderC");
    expect(settings.feeds.find((f) => f.url === "https://feed2.com")?.folder).toBe("FolderC");
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it("dropping multiple feeds onto root moves all of them to root", () => {
    const rootSection = container.querySelector(".rss-dashboard-feed-folders-section") as HTMLElement;
    expect(rootSection).toBeTruthy();

    const dataTransfer = {
      getData: vi.fn((key: string) => {
        if (key === "feed-urls") {
          return JSON.stringify(["https://feed1.com", "https://feed2.com"]);
        }
        if (key === "feed-url") return "https://feed1.com";
        return "";
      }),
      types: ["feed-urls", "feed-url"],
    };

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });

    rootSection.dispatchEvent(dropEvent);

    expect(settings.feeds.find((f) => f.url === "https://feed1.com")?.folder).toBe("");
    expect(settings.feeds.find((f) => f.url === "https://feed2.com")?.folder).toBe("");
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it("dropping multiple feeds onto another feed reorders them adjacent to that feed", () => {
    const feed3El = container.querySelector('[data-feed-url="https://feed3.com"]') as HTMLElement;
    expect(feed3El).toBeTruthy();
    // feed3 is in FolderB

    const dataTransfer = {
      getData: vi.fn((key: string) => {
        if (key === "feed-urls") {
          return JSON.stringify(["https://feed1.com", "https://feed2.com"]);
        }
        if (key === "feed-url") return "https://feed1.com";
        return "";
      }),
      types: ["feed-urls", "feed-url"],
    };

    // Mock getBoundingClientRect
    feed3El.getBoundingClientRect = () => ({
      top: 100,
      bottom: 150,
      height: 50,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 100,
      toJSON: () => {},
    });

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    // clientY = 110 (< 125, so 'before')
    Object.defineProperty(dropEvent, "clientY", { value: 110 });

    feed3El.dispatchEvent(dropEvent);

    expect(settings.feeds.find((f) => f.url === "https://feed1.com")?.folder).toBe("FolderB");
    expect(settings.feeds.find((f) => f.url === "https://feed2.com")?.folder).toBe("FolderB");
    const urls = settings.feeds.map((f) => f.url);
    const idx1 = urls.indexOf("https://feed1.com");
    const idx2 = urls.indexOf("https://feed2.com");
    const idx3 = urls.indexOf("https://feed3.com");
    expect(idx1).toBeLessThan(idx3);
    expect(idx2).toBeLessThan(idx3);
    expect(idx1 + 1).toBe(idx2);
  });

  it("dropping multiple feeds onto one of the dragged feeds is a no-op", () => {
    const feed1El = container.querySelector('[data-feed-url="https://feed1.com"]') as HTMLElement;
    expect(feed1El).toBeTruthy();

    const dataTransfer = {
      getData: vi.fn((key: string) => {
        if (key === "feed-urls") {
          return JSON.stringify(["https://feed1.com", "https://feed2.com"]);
        }
        if (key === "feed-url") return "https://feed1.com";
        return "";
      }),
      types: ["feed-urls", "feed-url"],
    };

    const initialOrder = settings.feeds.map((f) => f.url);

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(dropEvent, "clientY", { value: 110 });

    feed1El.dispatchEvent(dropEvent);

    // Order and folders must be untouched
    expect(settings.feeds.map((f) => f.url)).toEqual(initialOrder);
  });

  it("context menu on multi-selected feed includes 'Move selection to folder'", () => {
    const feed1El = container.querySelector('[data-feed-url="https://feed1.com"]') as HTMLElement;
    expect(feed1El).toBeTruthy();

    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 50,
    });

    feed1El.dispatchEvent(contextMenuEvent);

    const moveItem = ObsidianStubs.Menu.lastItems.find((item) =>
      item.title.toLowerCase().includes("move selection to folder"),
    );
    expect(moveItem).toBeTruthy();
  });

  it("clicking 'Move selection to folder' submenu item moves selection to chosen folder", () => {
    const feed1El = container.querySelector('[data-feed-url="https://feed1.com"]') as HTMLElement;
    expect(feed1El).toBeTruthy();

    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 50,
    });

    feed1El.dispatchEvent(contextMenuEvent);

    const moveItem = ObsidianStubs.Menu.lastItems.find((item) =>
      item.title.toLowerCase().includes("move selection to folder"),
    );
    expect(moveItem).toBeTruthy();

    // Trigger opening the submenu
    moveItem?.trigger();

    // Now Menu.lastItems has the submenu items: Root, FolderA, FolderB, FolderC, Create new folder
    const folderCItem = ObsidianStubs.Menu.lastItems.find((item) => item.title === "FolderC");
    expect(folderCItem).toBeTruthy();

    // Trigger moving to FolderC
    folderCItem?.trigger();

    expect(settings.feeds.find((f) => f.url === "https://feed1.com")?.folder).toBe("FolderC");
    expect(settings.feeds.find((f) => f.url === "https://feed2.com")?.folder).toBe("FolderC");
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it("handles mixed move of folders and feeds, reparenting folders into target", () => {
    // Select feed1 and FolderA, drop onto FolderC
    const folderCEl = container.querySelector('[data-folder-path="FolderC"]') as HTMLElement;
    expect(folderCEl).toBeTruthy();

    const dataTransfer = {
      getData: vi.fn((key: string) => {
        if (key === "feed-urls") {
          return JSON.stringify(["https://feed1.com"]);
        }
        if (key === "folder-paths") {
          return JSON.stringify(["FolderB"]);
        }
        return "";
      }),
      types: ["feed-urls", "folder-paths"],
    };

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(dropEvent, "clientY", { value: 100 });

    folderCEl.dispatchEvent(dropEvent);

    expect(settings.feeds.find((f) => f.url === "https://feed1.com")?.folder).toBe("FolderC");
    const folderC = settings.folders.find((f) => f.name === "FolderC");
    expect(folderC?.subfolders.some((sub) => sub.name === "FolderB")).toBe(true);
  });

  it("skips circular folder nesting on mixed move but still moves feeds", () => {
    // Add subfolder to FolderA
    const folderA = settings.folders.find((f) => f.name === "FolderA");
    folderA?.subfolders.push({ name: "SubA", subfolders: [] });

    // Call batchMoveFeedsAndFoldersToFolder directly to test circular nesting protection
    (sidebar as unknown as {
      batchMoveFeedsAndFoldersToFolder: (dest: string, feeds: string[], folders: string[]) => void;
    }).batchMoveFeedsAndFoldersToFolder("FolderA/SubA", ["https://feed1.com"], ["FolderA"]);

    // feed1 moved to FolderA/SubA
    expect(settings.feeds.find((f) => f.url === "https://feed1.com")?.folder).toBe("FolderA/SubA");
    // FolderA was NOT nested into itself/descendant
    expect(settings.folders.some((f) => f.name === "FolderA")).toBe(true);
  });
});
