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

describe("Right-clicking a feed inside a fully-selected folder", () => {
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
      makeFeed("Feed 3", "https://feed3.com", "FolderA"),
    ];

    const folders: Folder[] = [{ name: "FolderA", subfolders: [] }];

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

    // The whole folder is selected (e.g. via ctrl-click on the folder header,
    // or a shift-range-select that happened to cover every feed in it).
    // Every feed row renders as visually "multi-selected" in this state
    // (see renderFeed's isSelectedFolder check).
    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: ["FolderA"],
      selectedFeeds: [],
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

    sidebar = new Sidebar(
      app,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();
  });

  it("shows the bulk 'Delete selection' menu, not the single-feed one, and deletes every feed in the folder", () => {
    const feed2El = container.querySelector(
      '[data-feed-url="https://feed2.com"]',
    ) as HTMLElement;
    expect(feed2El).toBeTruthy();
    expect(feed2El.classList.contains("multi-selected")).toBe(true);

    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 50,
    });
    feed2El.dispatchEvent(contextMenuEvent);

    const deleteSelectionItem = ObsidianStubs.Menu.lastItems.find((item) =>
      item.title.toLowerCase().includes("delete selection"),
    );
    const deleteSingleFeedItem = ObsidianStubs.Menu.lastItems.find(
      (item) => item.title === "Delete feed",
    );

    // Right-clicking a feed that's only "selected" via its parent folder
    // should show the bulk delete option, not fall back to single-feed delete.
    expect(deleteSelectionItem).toBeTruthy();
    expect(deleteSingleFeedItem).toBeFalsy();

    deleteSelectionItem?.trigger();

    const okButton = document.querySelector(
      ".rss-folder-name-modal-ok",
    ) as HTMLButtonElement;
    expect(okButton).toBeTruthy();
    okButton.click();

    expect(callbacks.onDeleteFolder).toHaveBeenCalledWith("FolderA");
  });
});
