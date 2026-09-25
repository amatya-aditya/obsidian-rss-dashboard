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

describe("Sidebar Delete Selection", () => {
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
      selectedFeeds: [
        "https://feed1.com",
        "https://feed2.com",
        "https://feed3.com",
      ],
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

  it("deletes every selected feed, not just one, when confirming 'Delete selection'", () => {
    (sidebar as unknown as { deleteSelection: () => void }).deleteSelection();

    const okButton = document.querySelector(
      ".rss-folder-name-modal-ok",
    ) as HTMLButtonElement;
    expect(okButton).toBeTruthy();
    okButton.click();

    expect(callbacks.onDeleteFeed).toHaveBeenCalledTimes(3);
    const deletedUrls = (callbacks.onDeleteFeed as Mock).mock.calls.map(
      (call) => (call[0] as Feed).url,
    );
    expect(deletedUrls).toEqual([
      "https://feed1.com",
      "https://feed2.com",
      "https://feed3.com",
    ]);
  });
  it("counts feeds inside selected and nested folders in the confirmation message", () => {
    settings.feeds = [
      makeFeed("A1", "https://a1.com", "FolderA"),
      makeFeed("A2", "https://a2.com", "FolderA"),
      makeFeed("A Sub", "https://asub.com", "FolderA/Sub"),
      makeFeed("A Sub Deep", "https://asubdeep.com", "FolderA/Sub/Deep"),
      makeFeed("B1", "https://b1.com", "FolderB"),
      makeFeed("Tech delete", "https://tech-del.com", "Tech"),
      makeFeed("Tech keep 1", "https://tech-keep1.com", "Tech"),
      makeFeed("Tech keep 2", "https://tech-keep2.com", "Tech"),
      makeFeed("Tech archive", "https://tech-archive.com", "Tech/Archive"),
      makeFeed("Root delete", "https://root-del.com", ""),
    ];
    settings.folders = [
      {
        name: "FolderA",
        subfolders: [
          { name: "Sub", subfolders: [{ name: "Deep", subfolders: [] }] },
        ],
      },
      { name: "FolderB", subfolders: [] },
      { name: "Tech", subfolders: [{ name: "Archive", subfolders: [] }] },
    ] as Folder[];
    // FolderA's nested subfolders are covered through their ancestor; the
    // kept Tech folder has one nested subfolder selected on its own.
    options.selectedFolders = ["FolderA", "FolderB", "Tech/Archive"];
    // One explicit feed also lives in a selected folder: count it once.
    options.selectedFeeds = [
      "https://a1.com",
      "https://tech-del.com",
      "https://root-del.com",
    ];

    (sidebar as unknown as { deleteSelection: () => void }).deleteSelection();

    const message = document.querySelector(".rss-sidebar-confirm-message");
    expect(message?.textContent).toBe(
      "Are you sure you want to delete 3 folder(s) and 8 feed(s)?",
    );
  });
});
