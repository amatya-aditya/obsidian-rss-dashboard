/**
 * Characterization tests for `Sidebar.showFolderContextMenu`, pinned before it
 * is extracted (#635, part of #436). They describe what the folder row's
 * context menu does today, quirks included, and must keep passing unchanged
 * through the extraction.
 *
 * The menu is opened two ways: by a real `contextmenu` event on a rendered
 * folder row, and by calling `showFolderContextMenu` with hand-made arguments
 * (a folder that is not in the settings, an event that was never dispatched).
 * Items are read from the stub `Menu` and run through their `onClick`. The
 * spies on `Sidebar` methods (`showAddFeedModal`, `showFolderNameModal`,
 * `sortFeedsInFolder`, ...) are the methods the menu calls back into; they stay
 * on `Sidebar` as delegates. Titles, icons and arguments are written out by
 * hand.
 */
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import {
  Sidebar,
  type SidebarCallbacks,
  type SidebarOptions,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type {
  Feed,
  Folder,
  RssDashboardSettings,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const NOW = 1_700_000_000_000;

/** The menu of an unpinned folder that is not part of a selection, in order. */
const FULL_MENU: Array<[string, string]> = [
  ["Refresh details", "info"],
  ["Add feed", "rss"],
  ["Add subfolder", "folder-plus"],
  ["Rename folder", "edit"],
  ["Sort feeds (a to z)", "sort-asc"],
  ["Sort feeds (z to a)", "sort-desc"],
  ["Mark all as read", "check-circle"],
  ["Refresh feeds in folder", "refresh-cw"],
  ["Auto tag feeds in folder...", "tags"],
  ["Refresh all feeds", "refresh-cw"],
  ["Pin folder", "lock"],
  ["Delete folder", "trash"],
];

const SELECTION_MENU: Array<[string, string]> = [
  ["Refresh details", "info"],
  ["Mark selection as read", "check-circle"],
  ["Mark selection as unread", "circle"],
  ["Move selection to folder", "folder-open"],
  ["Delete selection", "trash"],
];

interface SidebarInternals {
  showFolderContextMenu: (
    event: MouseEvent,
    folder: Folder,
    path: string,
    name: string,
  ) => void;
  showRefreshDetails: (
    anchor: HTMLElement,
    feeds: Feed[],
    scope: "all" | "feed" | "aggregate",
  ) => void;
  showAddFeedModal: (folder?: string) => void;
  showFolderNameModal: (options: {
    title: string;
    defaultValue?: string;
    existingNames?: string[];
    onSubmit: (name: string) => void;
  }) => void;
  addSubfolderByPath: (parent: string, name: string) => Promise<void>;
  renameFolderByPath: (path: string, name: string) => Promise<void>;
  sortFeedsInFolder: (
    path: string,
    by: string,
    ascending: boolean,
  ) => Promise<void>;
  showFolderAutoTagModal: (path: string) => void;
  showConfirmModal: (message: string, onConfirm: () => void) => void;
}

interface TestPlugin {
  settings: RssDashboardSettings;
  saveSettings: ReturnType<typeof vi.fn>;
  refreshFeedsInFolder: ReturnType<typeof vi.fn>;
  cancelPendingStartupRefresh: ReturnType<typeof vi.fn>;
  refreshFeeds: ReturnType<typeof vi.fn>;
  manifest: { id: string };
}

interface NameModalOptions {
  title: string;
  defaultValue?: string;
  existingNames?: string[];
  onSubmit: (name: string) => void;
}

function makeFeed(title: string, url: string, folder: string): Feed {
  return {
    title,
    url,
    folder,
    items: [{ read: false }, { read: false }],
    lastUpdated: 0,
  } as unknown as Feed;
}

function makeFolders(): Folder[] {
  return [
    {
      name: "News",
      subfolders: [
        { name: "Tech", subfolders: [{ name: "Releases", subfolders: [] }] },
        { name: "Reports", subfolders: [] },
      ],
    },
    { name: "Empty", subfolders: [] },
    { name: "Videos", subfolders: [], pinned: true },
  ] as Folder[];
}

function makeFeeds(): Feed[] {
  return [
    makeFeed("Alpha", "https://a.test/feed", "News"),
    makeFeed("Beta", "https://b.test/feed", "News"),
    makeFeed("Gamma", "https://c.test/feed", "News/Tech"),
    makeFeed("Delta", "https://d.test/feed", "News/Tech/Releases"),
    // A folder name that only starts like "News", and a feed outside any folder.
    makeFeed("Lookalike", "https://l.test/feed", "NewsExtra"),
    makeFeed("Rooted", "https://root.test/feed", ""),
    makeFeed("Clip", "https://clip.test/feed", "Videos"),
  ];
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("Sidebar folder context menu (characterization)", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;
  let plugin: TestPlugin;
  let sidebar: Sidebar;
  let internals: SidebarInternals;
  let noticeSpy: MockInstance<typeof console.debug>;
  let uncaught: string[];
  let titleIconLog: Array<{ title: string; icon: string }>;
  let atMouseEvent: MockInstance;
  let atPosition: MockInstance;
  // jsdom reports an error thrown inside an event listener as a window
  // "error" event instead of throwing it from dispatchEvent.
  const recordUncaught = (event: ErrorEvent): void => {
    uncaught.push(String(event.message));
    event.preventDefault();
  };

  function build(): void {
    sidebar = new Sidebar(
      ObsidianStubs.App.createMock() as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    internals = sidebar as unknown as SidebarInternals;
    sidebar.render();
  }

  const folderHeader = (path: string): HTMLElement =>
    container.querySelector(
      `.rss-dashboard-feed-folder-header[data-folder-path="${path}"]`,
    ) as HTMLElement;

  /** Right-clicks a rendered folder row, which opens the menu. */
  function rightClick(path: string): MouseEvent {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 34,
    });
    folderHeader(path).dispatchEvent(event);
    return event;
  }

  /** Calls the method directly with a made-up folder and an undispatched event. */
  function callMenu(
    path: string,
    folderObj: Folder,
    name = folderObj.name,
  ): MouseEvent {
    const event = new MouseEvent("contextmenu", { clientX: 12, clientY: 34 });
    internals.showFolderContextMenu(event, folderObj, path, name);
    return event;
  }

  const folder = (name: string): Folder =>
    settings.folders.find((f) => f.name === name) as Folder;

  const menuTitles = (): string[] =>
    ObsidianStubs.Menu.lastItems.map((item) => item.title);

  /** What the menu offers, as [title, icon] pairs in order. */
  const menuEntries = (): Array<[string, string]> =>
    titleIconLog.map((entry) => [entry.title, entry.icon]);

  /** Runs one item's click handler. */
  function clickItem(title: string): unknown {
    const item = ObsidianStubs.Menu.lastItems.find((i) => i.title === title);
    if (!item)
      throw new Error(`no menu item "${title}" in ${menuTitles().join(", ")}`);
    return item.trigger();
  }

  function notices(): string[] {
    return noticeSpy.mock.calls
      .filter((call) => call[0] === "[Stub Notice]")
      .map((call) => String(call[1]));
  }

  beforeEach(() => {
    uncaught = [];
    window.addEventListener("error", recordUncaught);
    noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(NOW);

    // The stub drops icons, so record each item's title and icon in call order.
    titleIconLog = [];
    const itemProto = ObsidianStubs.MenuItem.prototype as unknown as {
      setTitle: (t: string | DocumentFragment) => unknown;
      setIcon: (i: string) => unknown;
    };
    const realSetTitle = itemProto.setTitle;
    vi.spyOn(itemProto, "setTitle").mockImplementation(function (
      this: unknown,
      t: string | DocumentFragment,
    ) {
      titleIconLog.push({ title: typeof t === "string" ? t : "", icon: "" });
      return realSetTitle.call(this, t);
    });
    vi.spyOn(itemProto, "setIcon").mockImplementation(function (
      this: unknown,
      icon: string,
    ) {
      titleIconLog[titleIconLog.length - 1].icon = icon;
      return this;
    });
    atMouseEvent = vi.spyOn(ObsidianStubs.Menu.prototype, "showAtMouseEvent");
    atPosition = vi.spyOn(ObsidianStubs.Menu.prototype, "showAtPosition");
    ObsidianStubs.Menu.lastItems = [];

    container = createDiv();
    document.body.appendChild(container);

    settings = {
      feeds: makeFeeds(),
      folders: makeFolders(),
      collapsedFolders: [],
      display: {
        showFolderUnreadBadges: true,
        showFeedUnreadBadges: true,
      },
      availableTags: [],
    } as unknown as RssDashboardSettings;

    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
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
      onToggleSidebar: vi.fn(),
      onDeleteFolder: vi.fn(),
    } as unknown as SidebarCallbacks;

    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      refreshFeedsInFolder: vi.fn().mockResolvedValue(undefined),
      cancelPendingStartupRefresh: vi.fn(),
      refreshFeeds: vi.fn().mockResolvedValue(undefined),
      manifest: { id: "rss-dashboard" },
    };
  });

  afterEach(() => {
    window.removeEventListener("error", recordUncaught);
    expect(uncaught).toEqual([]);
    vi.restoreAllMocks();
    container.remove();
    document.body.innerHTML = "";
  });

  describe("opening the menu", () => {
    it("opens when a folder row is right-clicked, at the pointer", () => {
      build();

      const event = rightClick("News");

      expect(event.defaultPrevented).toBe(true);
      expect(menuTitles()).toEqual(FULL_MENU.map(([title]) => title));
      expect(atMouseEvent).toHaveBeenCalledTimes(1);
      expect(atMouseEvent).toHaveBeenCalledWith(event);
      expect(atPosition).not.toHaveBeenCalled();
    });

    it("keeps the right-click from reaching the sidebar container", () => {
      build();
      const reached = vi.fn();
      container.addEventListener("contextmenu", reached);

      rightClick("News");

      expect(reached).not.toHaveBeenCalled();
    });

    it("passes the folder object, its path and its name from the row to the method", () => {
      build();
      const spy = vi
        .spyOn(internals, "showFolderContextMenu")
        .mockImplementation(() => undefined);

      rightClick("News/Tech");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][1]).toBe(folder("News").subfolders[0]);
      expect(spy.mock.calls[0][2]).toBe("News/Tech");
      expect(spy.mock.calls[0][3]).toBe("Tech");
    });

    it("builds a new menu for every call, so only the latest one is current", () => {
      build();

      rightClick("News");
      rightClick("Empty");

      expect(ObsidianStubs.Menu.lastItems).toHaveLength(FULL_MENU.length);
      expect(atMouseEvent).toHaveBeenCalledTimes(2);
    });

    it("falls back to the pointer position when the menu has no showAtMouseEvent", () => {
      build();
      const proto = ObsidianStubs.Menu.prototype as unknown as {
        showAtMouseEvent: unknown;
      };
      const original = proto.showAtMouseEvent;
      proto.showAtMouseEvent = undefined;
      try {
        callMenu("News", folder("News"));
      } finally {
        proto.showAtMouseEvent = original;
      }

      expect(atPosition).toHaveBeenCalledTimes(1);
      expect(atPosition).toHaveBeenCalledWith({ x: 12, y: 34 });
    });
  });

  describe("menu contents", () => {
    it("lists every folder action with its icon, in order, for an unpinned folder", () => {
      build();

      rightClick("News");

      expect(menuEntries()).toEqual(FULL_MENU);
    });

    it("offers Unpin folder with the unlock icon for a pinned folder", () => {
      build();

      rightClick("Videos");

      expect(menuEntries()).toEqual(
        FULL_MENU.map(([title, icon]): [string, string] =>
          title === "Pin folder" ? ["Unpin folder", "unlock"] : [title, icon],
        ),
      );
    });

    it("builds the same menu for a nested folder and an empty one", () => {
      build();

      rightClick("News/Tech/Releases");
      expect(menuEntries()).toEqual(FULL_MENU);
      titleIconLog = [];
      rightClick("Empty");
      expect(menuEntries()).toEqual(FULL_MENU);
    });

    it("builds a menu even for a folder that is not in the settings", () => {
      build();
      const ghost = { name: "Ghost", subfolders: [] } as Folder;

      callMenu("Ghost", ghost);

      expect(menuEntries()).toEqual(FULL_MENU);
    });

    it("takes the pinned state from the folder object it was given, not from the path", () => {
      build();
      const pinnedGhost = {
        name: "News",
        subfolders: [],
        pinned: true,
      } as Folder;

      callMenu("News", pinnedGhost);

      expect(menuTitles()).toContain("Unpin folder");
      expect(menuTitles()).not.toContain("Pin folder");
    });

    it("adds no separator to the folder menu", () => {
      build();
      const separator = vi.spyOn(ObsidianStubs.Menu.prototype, "addSeparator");

      rightClick("News");

      expect(separator).not.toHaveBeenCalled();
    });
  });

  describe("multi-selected folders", () => {
    it("shows Refresh details and the selection actions when the folder is selected", () => {
      options.selectedFolders = ["News"];
      build();

      rightClick("News");

      expect(menuEntries()).toEqual(SELECTION_MENU);
    });

    it("keeps the folder actions out of a selected folder's menu", () => {
      options.selectedFolders = ["News", "Empty"];
      build();

      rightClick("Empty");

      expect(menuTitles()).not.toContain("Add feed");
      expect(menuTitles()).not.toContain("Delete folder");
      expect(menuTitles()).toContain("Delete selection");
    });

    it("matches the selection by the folder's full path, so a selected nested folder gets the selection menu", () => {
      options.selectedFolders = ["News/Tech"];
      build();

      rightClick("News/Tech");

      expect(menuEntries()).toEqual(SELECTION_MENU);
    });

    it("does not match a nested folder just because a folder with its bare name is selected", () => {
      options.selectedFolders = ["Tech"];
      build();

      rightClick("News/Tech");

      expect(menuEntries()).toEqual(FULL_MENU);
    });

    it("shows the full folder menu for a folder outside the selection", () => {
      options.selectedFolders = ["News"];
      build();

      rightClick("Empty");

      expect(menuEntries()).toEqual(FULL_MENU);
    });

    it("treats a single selected folder as a multi-selection", () => {
      options.selectedFolders = ["Empty"];
      options.selectedFeeds = [];
      build();

      rightClick("Empty");

      expect(menuTitles()).toEqual(SELECTION_MENU.map(([title]) => title));
    });

    it("shows the full folder menu when only one feed is selected and no folder", () => {
      options.selectedFolders = [];
      options.selectedFeeds = ["https://a.test/feed"];
      build();

      rightClick("News");

      expect(menuEntries()).toEqual(FULL_MENU);
    });

    it("opens the selection menu at the pointer, without the position fallback", () => {
      options.selectedFolders = ["News"];
      build();

      const event = rightClick("News");

      expect(atMouseEvent).toHaveBeenCalledTimes(1);
      expect(atMouseEvent).toHaveBeenCalledWith(event);
    });

    it("throws when a selection menu has no showAtMouseEvent, because only the full menu has the fallback", () => {
      options.selectedFolders = ["News"];
      build();
      const proto = ObsidianStubs.Menu.prototype as unknown as {
        showAtMouseEvent: unknown;
      };
      const original = proto.showAtMouseEvent;
      proto.showAtMouseEvent = undefined;
      try {
        expect(() => callMenu("News", folder("News"))).toThrow(TypeError);
      } finally {
        proto.showAtMouseEvent = original;
      }
      expect(atPosition).not.toHaveBeenCalled();
    });

    it("runs the Refresh details item of a selection menu on the folder's feeds", () => {
      options.selectedFolders = ["News"];
      build();
      const spy = vi
        .spyOn(internals, "showRefreshDetails")
        .mockImplementation(() => undefined);

      rightClick("News");
      clickItem("Refresh details");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][2]).toBe("aggregate");
    });
  });

  describe("Refresh details", () => {
    it("anchors on the folder row that was right-clicked", () => {
      build();
      const spy = vi
        .spyOn(internals, "showRefreshDetails")
        .mockImplementation(() => undefined);

      rightClick("News");
      clickItem("Refresh details");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe(folderHeader("News"));
    });

    it("anchors on the folder row, not on the inner element that was right-clicked", () => {
      build();
      const spy = vi
        .spyOn(internals, "showRefreshDetails")
        .mockImplementation(() => undefined);
      const inner = folderHeader("News").firstElementChild as HTMLElement;

      inner.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      clickItem("Refresh details");

      expect(spy.mock.calls[0][0]).toBe(folderHeader("News"));
      expect(spy.mock.calls[0][0]).not.toBe(inner);
    });

    it("anchors on the sidebar container when the event has no element target", () => {
      build();
      const spy = vi
        .spyOn(internals, "showRefreshDetails")
        .mockImplementation(() => undefined);

      callMenu("News", folder("News"));
      clickItem("Refresh details");

      expect(spy.mock.calls[0][0]).toBe(container);
    });

    it("details the feeds of the folder and all its subfolders, in settings order, as an aggregate", () => {
      build();
      const spy = vi
        .spyOn(internals, "showRefreshDetails")
        .mockImplementation(() => undefined);

      rightClick("News");
      clickItem("Refresh details");

      const feeds = spy.mock.calls[0][1];
      expect(feeds.map((f) => f.title)).toEqual([
        "Alpha",
        "Beta",
        "Gamma",
        "Delta",
      ]);
      expect(spy.mock.calls[0][2]).toBe("aggregate");
    });

    it("details only the folder's own subtree for a nested folder", () => {
      build();
      const spy = vi
        .spyOn(internals, "showRefreshDetails")
        .mockImplementation(() => undefined);

      rightClick("News/Tech");
      clickItem("Refresh details");

      expect(spy.mock.calls[0][1].map((f) => f.title)).toEqual([
        "Gamma",
        "Delta",
      ]);
    });

    it("details no feeds for an empty folder", () => {
      build();
      const spy = vi
        .spyOn(internals, "showRefreshDetails")
        .mockImplementation(() => undefined);

      rightClick("Empty");
      clickItem("Refresh details");

      expect(spy.mock.calls[0][1]).toEqual([]);
    });

    it("reads the feeds when the item is clicked, not when the menu opens", () => {
      build();
      const spy = vi
        .spyOn(internals, "showRefreshDetails")
        .mockImplementation(() => undefined);

      rightClick("Empty");
      settings.feeds.push(makeFeed("Late", "https://late.test/feed", "Empty"));
      clickItem("Refresh details");

      expect(spy.mock.calls[0][1].map((f) => f.title)).toEqual(["Late"]);
    });
  });

  describe("Add feed", () => {
    it("opens the add feed dialog with the folder's full path preselected", () => {
      build();
      const spy = vi
        .spyOn(internals, "showAddFeedModal")
        .mockImplementation(() => undefined);

      rightClick("News/Tech");
      clickItem("Add feed");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("News/Tech");
    });
  });

  describe("Add subfolder", () => {
    function openDialog(path: string): NameModalOptions {
      const spy = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);
      rightClick(path);
      clickItem("Add subfolder");
      expect(spy).toHaveBeenCalledTimes(1);
      return spy.mock.calls[0][0] as NameModalOptions;
    }

    it("opens the name dialog titled Add subfolder, with the existing subfolder names", () => {
      build();

      const dialog = openDialog("News");

      expect(dialog.title).toBe("Add subfolder");
      expect(dialog.existingNames).toEqual(["Tech", "Reports"]);
      expect(dialog.defaultValue).toBeUndefined();
    });

    it("lists no existing names for a folder without subfolders", () => {
      build();

      expect(openDialog("Empty").existingNames).toEqual([]);
    });

    it("lists no existing names for a path that is not in the settings", () => {
      build();
      const spy = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);

      callMenu("Ghost", { name: "Ghost", subfolders: [] } as Folder);
      clickItem("Add subfolder");

      expect((spy.mock.calls[0][0] as NameModalOptions).existingNames).toEqual(
        [],
      );
    });

    it("reads the existing names when the item is clicked, not when the menu opens", () => {
      build();
      const spy = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);

      rightClick("Empty");
      folder("Empty").subfolders.push({
        name: "Fresh",
        subfolders: [],
      } as Folder);
      clickItem("Add subfolder");

      expect((spy.mock.calls[0][0] as NameModalOptions).existingNames).toEqual([
        "Fresh",
      ]);
    });

    it("creates the subfolder under the folder, saves, and redraws the sidebar twice, when the dialog is submitted", async () => {
      build();
      const dialog = openDialog("News/Tech");
      const render = vi.spyOn(sidebar, "render");

      dialog.onSubmit("Guides");
      await flushPromises();

      const tech = folder("News").subfolders[0];
      expect(tech.subfolders.map((f) => f.name)).toEqual([
        "Releases",
        "Guides",
      ]);
      expect(tech.subfolders[1]).toMatchObject({
        name: "Guides",
        subfolders: [],
        createdAt: NOW,
        modifiedAt: NOW,
      });
      expect(tech.modifiedAt).toBe(NOW);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      // once from addSubfolderByPath itself and once from the menu's then()
      expect(render).toHaveBeenCalledTimes(2);
    });

    it("renders the new subfolder in the tree after submit", async () => {
      build();
      const dialog = openDialog("Empty");

      dialog.onSubmit("Child");
      await flushPromises();

      expect(folderHeader("Empty/Child")).not.toBeNull();
    });

    it("creates nothing and does not save when the name is already used", async () => {
      build();
      const dialog = openDialog("News");
      const render = vi.spyOn(sidebar, "render");

      dialog.onSubmit("Tech");
      await flushPromises();

      expect(folder("News").subfolders.map((f) => f.name)).toEqual([
        "Tech",
        "Reports",
      ]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      // the menu's own then() still redraws
      expect(render).toHaveBeenCalledTimes(1);
    });

    it("calls addSubfolderByPath with the folder's path and the submitted name", async () => {
      build();
      const spy = vi
        .spyOn(internals, "addSubfolderByPath")
        .mockResolvedValue(undefined);
      const dialog = openDialog("News");

      dialog.onSubmit("Guides");
      await flushPromises();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("News", "Guides");
    });
  });

  describe("Rename folder", () => {
    function openDialog(path: string): NameModalOptions {
      const spy = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);
      rightClick(path);
      clickItem("Rename folder");
      expect(spy).toHaveBeenCalledTimes(1);
      return spy.mock.calls[0][0] as NameModalOptions;
    }

    it("opens the name dialog titled Rename folder, prefilled with the folder's name", () => {
      build();

      const dialog = openDialog("News/Tech");

      expect(dialog.title).toBe("Rename folder");
      expect(dialog.defaultValue).toBe("Tech");
    });

    it("lists the siblings' names, including its own, for a nested folder", () => {
      build();

      expect(openDialog("News/Tech").existingNames).toEqual([
        "Tech",
        "Reports",
      ]);
    });

    it("lists every top-level folder's name, including its own, for a top-level folder", () => {
      build();

      expect(openDialog("Empty").existingNames).toEqual([
        "News",
        "Empty",
        "Videos",
      ]);
    });

    it("lists the siblings under the immediate parent for a deeper folder", () => {
      build();

      expect(openDialog("News/Tech/Releases").existingNames).toEqual([
        "Releases",
      ]);
    });

    it("lists no names for a nested path whose parent is not in the settings", () => {
      build();
      const spy = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);

      callMenu("Ghost/Child", { name: "Child", subfolders: [] } as Folder);
      clickItem("Rename folder");

      expect((spy.mock.calls[0][0] as NameModalOptions).existingNames).toEqual(
        [],
      );
    });

    it("lists the top-level folders for a top-level path that is not in the settings", () => {
      build();
      const spy = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);

      callMenu("Ghost", { name: "Ghost", subfolders: [] } as Folder);
      clickItem("Rename folder");

      expect((spy.mock.calls[0][0] as NameModalOptions).existingNames).toEqual([
        "News",
        "Empty",
        "Videos",
      ]);
    });

    it("prefills the name it was given, not the folder object's own name", () => {
      build();
      const spy = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);

      callMenu("News", folder("News"), "Shown name");
      clickItem("Rename folder");

      expect((spy.mock.calls[0][0] as NameModalOptions).defaultValue).toBe(
        "Shown name",
      );
    });

    it("renames the folder, moves its feeds, saves and redraws twice when a new name is submitted", async () => {
      build();
      const dialog = openDialog("News/Tech");
      const render = vi.spyOn(sidebar, "render");

      dialog.onSubmit("Gadgets");
      await flushPromises();

      expect(folder("News").subfolders.map((f) => f.name)).toEqual([
        "Gadgets",
        "Reports",
      ]);
      expect(
        settings.feeds
          .map((f) => [f.title, f.folder])
          .filter(([t]) => ["Gamma", "Delta"].includes(t)),
      ).toEqual([
        ["Gamma", "News/Gadgets"],
        ["Delta", "News/Gadgets/Releases"],
      ]);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(2);
    });

    it("does nothing when the submitted name is the same as the current one", async () => {
      build();
      const spy = vi
        .spyOn(internals, "renameFolderByPath")
        .mockResolvedValue(undefined);
      const dialog = openDialog("News/Tech");
      const render = vi.spyOn(sidebar, "render");

      dialog.onSubmit("Tech");
      await flushPromises();

      expect(spy).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it("calls renameFolderByPath with the folder's path and the new name", async () => {
      build();
      const spy = vi
        .spyOn(internals, "renameFolderByPath")
        .mockResolvedValue(undefined);
      const dialog = openDialog("Empty");

      dialog.onSubmit("Vacant");
      await flushPromises();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("Empty", "Vacant");
    });

    it("compares the submitted name with the name the menu was opened with, even if the folder was renamed meanwhile", async () => {
      build();
      const spy = vi
        .spyOn(internals, "renameFolderByPath")
        .mockResolvedValue(undefined);
      const dialog = openDialog("Empty");

      folder("Empty").name = "Renamed elsewhere";
      dialog.onSubmit("Empty");
      await flushPromises();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("Sort feeds", () => {
    it("sorts the folder's feeds by name, ascending, for a to z", () => {
      build();
      const spy = vi
        .spyOn(internals, "sortFeedsInFolder")
        .mockResolvedValue(undefined);

      rightClick("News");
      clickItem("Sort feeds (a to z)");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("News", "name", true);
    });

    it("sorts the folder's feeds by name, descending, for z to a", () => {
      build();
      const spy = vi
        .spyOn(internals, "sortFeedsInFolder")
        .mockResolvedValue(undefined);

      rightClick("News");
      clickItem("Sort feeds (z to a)");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("News", "name", false);
    });

    it("sorts a nested folder by its full path, not its name", () => {
      build();
      const spy = vi
        .spyOn(internals, "sortFeedsInFolder")
        .mockResolvedValue(undefined);

      rightClick("News/Tech");
      clickItem("Sort feeds (a to z)");
      clickItem("Sort feeds (z to a)");

      expect(spy.mock.calls).toEqual([
        ["News/Tech", "name", true],
        ["News/Tech", "name", false],
      ]);
    });

    it("reorders only the folder's own feeds, and records the order for that folder", async () => {
      build();
      settings.feeds = [
        makeFeed("Zed", "https://z.test/feed", "News"),
        makeFeed("Rooted", "https://root.test/feed", ""),
        makeFeed("Abe", "https://abe.test/feed", "News"),
      ];

      rightClick("News");
      clickItem("Sort feeds (a to z)");
      await flushPromises();

      expect(settings.feeds.map((f) => f.title)).toEqual([
        "Rooted",
        "Abe",
        "Zed",
      ]);
      expect(settings.folderFeedSortOrders?.News).toEqual({
        by: "name",
        ascending: true,
      });
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(notices()).toEqual(['Feeds in "News" sorted by name (ascending)']);
    });

    it("tells the user when the folder has no feeds of its own", async () => {
      build();

      rightClick("Empty");
      clickItem("Sort feeds (z to a)");
      await flushPromises();

      expect(notices()).toEqual(["No feeds found in this folder"]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it("leaves feeds in subfolders out of a parent's sort", async () => {
      build();
      settings.feeds = [
        makeFeed("Zed", "https://z.test/feed", "News/Tech"),
        makeFeed("Abe", "https://abe.test/feed", "News/Tech"),
      ];

      rightClick("News");
      clickItem("Sort feeds (a to z)");
      await flushPromises();

      expect(notices()).toEqual(["No feeds found in this folder"]);
      expect(settings.feeds.map((f) => f.title)).toEqual(["Zed", "Abe"]);
    });
  });

  describe("Mark all as read", () => {
    it("marks every article of the folder and its subfolders as read, and leaves the rest", () => {
      build();

      rightClick("News");
      clickItem("Mark all as read");

      const readByTitle = Object.fromEntries(
        settings.feeds.map((f) => [f.title, f.items.every((i) => i.read)]),
      );
      expect(readByTitle).toEqual({
        Alpha: true,
        Beta: true,
        Gamma: true,
        Delta: true,
        Lookalike: false,
        Rooted: false,
        Clip: false,
      });
    });

    it("marks only the subtree of a nested folder", () => {
      build();

      rightClick("News/Tech");
      clickItem("Mark all as read");

      const readByTitle = Object.fromEntries(
        settings.feeds.map((f) => [f.title, f.items.every((i) => i.read)]),
      );
      expect(readByTitle.Alpha).toBe(false);
      expect(readByTitle.Gamma).toBe(true);
      expect(readByTitle.Delta).toBe(true);
    });

    it("saves and then redraws, not before the save resolves", async () => {
      build();
      let resolveSave: () => void = () => undefined;
      plugin.saveSettings.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
      );
      const render = vi.spyOn(sidebar, "render");

      rightClick("News");
      clickItem("Mark all as read");
      await flushPromises();

      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(render).not.toHaveBeenCalled();

      resolveSave();
      await flushPromises();

      expect(render).toHaveBeenCalledTimes(1);
    });

    it("saves and redraws even when the folder holds no feeds", async () => {
      build();
      const render = vi.spyOn(sidebar, "render");

      rightClick("Empty");
      clickItem("Mark all as read");
      await flushPromises();

      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(1);
    });

    it("reads the folder structure when clicked, so a subfolder added after opening is included", () => {
      build();

      rightClick("Empty");
      folder("Empty").subfolders.push({
        name: "Late",
        subfolders: [],
      } as Folder);
      settings.feeds.push(
        makeFeed("LateFeed", "https://late.test/feed", "Empty/Late"),
      );
      clickItem("Mark all as read");

      const late = settings.feeds.find((f) => f.title === "LateFeed") as Feed;
      expect(late.items.every((i) => i.read)).toBe(true);
    });
  });

  describe("refresh items", () => {
    it("refreshes the feeds of the folder by its full path", () => {
      build();

      rightClick("News/Tech");
      clickItem("Refresh feeds in folder");

      expect(plugin.refreshFeedsInFolder).toHaveBeenCalledTimes(1);
      expect(plugin.refreshFeedsInFolder).toHaveBeenCalledWith("News/Tech");
      expect(plugin.refreshFeeds).not.toHaveBeenCalled();
    });

    it("cancels the pending startup refresh and then refreshes all feeds", () => {
      build();
      const order: string[] = [];
      plugin.cancelPendingStartupRefresh.mockImplementation(() => {
        order.push("cancel");
      });
      plugin.refreshFeeds.mockImplementation(() => {
        order.push("refresh");
        return undefined;
      });

      rightClick("News");
      clickItem("Refresh all feeds");

      expect(order).toEqual(["cancel", "refresh"]);
      expect(plugin.refreshFeedsInFolder).not.toHaveBeenCalled();
    });

    it("calls refreshFeeds with no arguments", () => {
      build();

      rightClick("News");
      clickItem("Refresh all feeds");

      expect(plugin.refreshFeeds).toHaveBeenCalledWith();
    });
  });

  describe("Auto tag", () => {
    it("opens the folder's auto tag dialog by its full path", () => {
      build();
      const spy = vi
        .spyOn(internals, "showFolderAutoTagModal")
        .mockImplementation(() => undefined);

      rightClick("News/Tech");
      clickItem("Auto tag feeds in folder...");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("News/Tech");
    });

    it("says the folder was not found when its path is not in the settings", () => {
      build();

      callMenu("Ghost", { name: "Ghost", subfolders: [] } as Folder);
      clickItem("Auto tag feeds in folder...");

      expect(notices()).toEqual(["Folder not found"]);
    });
  });

  describe("Pin and Unpin", () => {
    it("pins an unpinned folder, stamps it, saves and then redraws", async () => {
      build();
      const render = vi.spyOn(sidebar, "render");

      rightClick("Empty");
      clickItem("Pin folder");

      expect(folder("Empty").pinned).toBe(true);
      expect(folder("Empty").modifiedAt).toBe(NOW);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(render).not.toHaveBeenCalled();

      await flushPromises();
      expect(render).toHaveBeenCalledTimes(1);
    });

    it("unpins a pinned folder", async () => {
      build();

      rightClick("Videos");
      clickItem("Unpin folder");
      await flushPromises();

      expect(folder("Videos").pinned).toBe(false);
      expect(folder("Videos").modifiedAt).toBe(NOW);
    });

    it("moves a newly pinned folder to the top of the redrawn tree", async () => {
      build();

      rightClick("Empty");
      clickItem("Pin folder");
      await flushPromises();

      const order = Array.from(
        container.querySelectorAll(
          ".rss-dashboard-feed-folder-header[data-folder-path]",
        ),
      )
        .map((el) => (el as HTMLElement).dataset.folderPath)
        .filter((p) => p && !p.includes("/"));
      expect(order.slice(0, 2).sort()).toEqual(["Empty", "Videos"]);
    });

    it("changes the folder object it was given, not the one found by path", async () => {
      build();
      const copy = { name: "Empty", subfolders: [] } as Folder;

      callMenu("Empty", copy);
      clickItem("Pin folder");
      await flushPromises();

      expect(copy.pinned).toBe(true);
      expect(folder("Empty").pinned).toBeUndefined();
    });

    it("sets the same state again if the same item is clicked twice, because the state was read when the menu opened", async () => {
      build();

      rightClick("Empty");
      clickItem("Pin folder");
      clickItem("Pin folder");
      await flushPromises();

      expect(folder("Empty").pinned).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    });
  });

  describe("Delete folder", () => {
    it("asks for confirmation naming the folder, without deleting yet", () => {
      build();
      const spy = vi
        .spyOn(internals, "showConfirmModal")
        .mockImplementation(() => undefined);

      rightClick("News/Tech");
      clickItem("Delete folder");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe(
        "Are you sure you want to delete the folder 'Tech' and all its subfolders and feeds?",
      );
      expect(callbacks.onDeleteFolder).not.toHaveBeenCalled();
    });

    it("names the folder by the name it was given, not the path", () => {
      build();
      const spy = vi
        .spyOn(internals, "showConfirmModal")
        .mockImplementation(() => undefined);

      callMenu("News", folder("News"), "Shown name");
      clickItem("Delete folder");

      expect(spy.mock.calls[0][0]).toContain("'Shown name'");
    });

    it("deletes the folder by its full path once confirmed", () => {
      build();
      const spy = vi
        .spyOn(internals, "showConfirmModal")
        .mockImplementation(() => undefined);

      rightClick("News/Tech");
      clickItem("Delete folder");
      spy.mock.calls[0][1]();

      expect(callbacks.onDeleteFolder).toHaveBeenCalledTimes(1);
      expect(callbacks.onDeleteFolder).toHaveBeenCalledWith("News/Tech");
    });

    it("opens a confirmation dialog with the message through the real modal", () => {
      build();

      rightClick("Empty");
      clickItem("Delete folder");

      const message = document.querySelector(".rss-sidebar-confirm-message");
      expect(message?.textContent).toBe(
        "Are you sure you want to delete the folder 'Empty' and all its subfolders and feeds?",
      );
      expect(callbacks.onDeleteFolder).not.toHaveBeenCalled();
    });
  });
});
