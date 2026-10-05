/**
 * Characterization tests for `Sidebar.renderFeedFolders`, pinned before the
 * events of its root area are extracted (#647, part of #436). They describe
 * what the folder tree section does today, quirks included, and must keep
 * passing unchanged through the extraction.
 *
 * Everything runs through `Sidebar.render()`, real `dragover`, `dragleave`,
 * `drop` and `contextmenu` events on the rendered tree, and the stub `Menu`.
 * Notices are read from the stub's log. The spies on `Sidebar` methods
 * (`batchMoveFeedsAndFoldersToFolder`, `showFolderNameModal`,
 * `showAddFeedModal`) are the methods the root area calls back into; they stay
 * on `Sidebar`. Expectations are written out by hand.
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
import { moveFolder } from "../../../src/services/sidebar-ordering-controller";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Wrap the real folder mover so a test can make it fail in ways the real one never does.
vi.mock("../../../src/services/sidebar-ordering-controller", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/services/sidebar-ordering-controller")
  >("../../../src/services/sidebar-ordering-controller");
  return { ...actual, moveFolder: vi.fn(actual.moveFolder) };
});

installObsidianDomPolyfills();

const NOW = 1_700_000_000_000;
const OLD = 1;

const ALPHA = "https://alpha.test/feed";
const BETA = "https://beta.test/feed";
const GAMMA = "https://gamma.test/feed";
const DELTA = "https://delta.test/feed";
const EPSILON = "https://epsilon.test/feed";
const ROOTED = "https://rooted.test/feed";
const ZULU = "https://zulu.test/feed";
const ORPHAN = "https://orphan.test/feed";

const EMPTY_STATE =
  "No feeds yet — add one of your own or visit the Discover tab!";

interface SidebarInternals {
  batchMoveFeedsAndFoldersToFolder: (
    destination: string,
    feedUrls: string[],
    folderPaths: string[],
  ) => void;
  showFolderNameModal: (options: {
    title: string;
    defaultValue?: string;
    existingNames?: string[];
    onSubmit: (name: string) => void;
  }) => void;
  showAddFeedModal: (folder?: string) => void;
  isTagsExpanded: boolean;
}

interface TestPlugin {
  settings: RssDashboardSettings;
  saveSettings: MockInstance<() => Promise<void>>;
}

function makeFeed(
  title: string,
  url: string,
  folder: string,
  items: Array<{ read: boolean }> = [{ read: false }],
): Feed {
  return { title, url, folder, items, lastUpdated: 0 } as unknown as Feed;
}

function makeFolder(name: string, subfolders: Folder[] = []): Folder {
  return { name, subfolders, modifiedAt: OLD } as Folder;
}

function makeFolders(): Folder[] {
  return [
    makeFolder("News", [makeFolder("Tech", [makeFolder("Deep")])]),
    makeFolder("Archive", [makeFolder("Old")]),
    makeFolder("Empty"),
    makeFolder("Newsletter"),
  ];
}

function makeFeeds(): Feed[] {
  return [
    makeFeed("Alpha", ALPHA, "News"),
    makeFeed("Beta", BETA, "News"),
    makeFeed("Gamma", GAMMA, "News/Tech"),
    makeFeed("Delta", DELTA, "News/Tech/Deep"),
    makeFeed("Epsilon", EPSILON, "Archive"),
    makeFeed("Rooted", ROOTED, ""),
    makeFeed("Zulu", ZULU, ""),
  ];
}

interface FakeDataTransfer {
  getData: (key: string) => string;
  types: string[];
}

/** A drag payload: the multi keys hold JSON lists, the single keys a lone value. */
function payload(keys: Record<string, string>): FakeDataTransfer {
  return { types: Object.keys(keys), getData: (key) => keys[key] ?? "" };
}

function dragEvent(
  type: "dragover" | "dragleave" | "drop",
  dataTransfer: FakeDataTransfer | null,
): DragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  Object.defineProperty(event, "clientY", { value: 0 });
  return event;
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("Sidebar folder tree root area (characterization)", () => {
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

  const rootSection = (): HTMLElement =>
    container.querySelector(
      ".rss-dashboard-feed-folders-section",
    ) as HTMLElement;
  const folderHeader = (path: string): HTMLElement =>
    container.querySelector(
      `.rss-dashboard-feed-folder-header[data-folder-path="${path}"]`,
    ) as HTMLElement;
  const folderFeedsList = (path: string): HTMLElement =>
    folderHeader(path).parentElement?.querySelector(
      ":scope > .rss-dashboard-folder-feeds",
    ) as HTMLElement;
  const feedRow = (url: string): HTMLElement =>
    container.querySelector(`[data-feed-url="${url}"]`) as HTMLElement;
  const allFeedsButton = (): HTMLElement =>
    container.querySelector(".rss-dashboard-all-feeds-button") as HTMLElement;
  /** The wrapper that holds the feeds that sit at the root. */
  const rootFeedsWrapper = (): HTMLElement | null =>
    rootSection().querySelector(":scope > .rss-dashboard-folder-feeds");

  const feed = (url: string): Feed =>
    settings.feeds.find((f) => f.url === url) as Feed;
  const rootNames = (): string[] => settings.folders.map((f) => f.name);
  const feedUrlsIn = (el: HTMLElement): string[] =>
    Array.from(el.querySelectorAll("[data-feed-url]")).map(
      (row) => row.getAttribute("data-feed-url") as string,
    );
  const renderedRootFolders = (): string[] =>
    Array.from(
      rootSection().querySelectorAll(
        ":scope > .rss-dashboard-feed-folder > .rss-dashboard-feed-folder-header",
      ),
    ).map((h) => h.getAttribute("data-folder-path") as string);

  function notices(): string[] {
    return noticeSpy.mock.calls
      .filter((call) => call[0] === "[Stub Notice]")
      .map((call) => String(call[1]));
  }

  const menuTitles = (): string[] =>
    ObsidianStubs.Menu.lastItems.map((item) => item.title);

  function clickItem(title: string): unknown {
    const item = ObsidianStubs.Menu.lastItems.find((i) => i.title === title);
    if (!item)
      throw new Error(`no menu item "${title}" in ${menuTitles().join(", ")}`);
    return item.trigger();
  }

  /** Dispatches a drag event and lets any save-then-render chain finish. */
  async function fire(
    el: HTMLElement,
    type: "dragover" | "dragleave" | "drop",
    dataTransfer: FakeDataTransfer | null = payload({}),
  ): Promise<DragEvent> {
    const event = dragEvent(type, dataTransfer);
    el.dispatchEvent(event);
    await flushPromises();
    return event;
  }

  /** Right-clicks an element; returns the event. */
  function rightClick(el: HTMLElement): MouseEvent {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 34,
    });
    el.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    vi.mocked(moveFolder).mockClear();
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
      display: { showFolderUnreadBadges: true, showFeedUnreadBadges: true },
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
      saveSettings: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    window.removeEventListener("error", recordUncaught);
    expect(uncaught).toEqual([]);
    vi.restoreAllMocks();
    container.remove();
    document.body.innerHTML = "";
  });

  describe("the section's content", () => {
    it("renders one folder-feeds section directly in the sidebar container, with All Feeds first", () => {
      build();

      expect(
        container.querySelectorAll(".rss-dashboard-feed-folders-section"),
      ).toHaveLength(1);
      expect(rootSection().parentElement).toBe(container);
      expect(rootSection().firstElementChild).toBe(allFeedsButton());
    });

    it("renders the root folders by name, in order, then the root feeds wrapper last", () => {
      build();

      expect(renderedRootFolders()).toEqual([
        "Archive",
        "Empty",
        "News",
        "Newsletter",
      ]);
      const children = Array.from(rootSection().children);
      expect(children[children.length - 1]).toBe(rootFeedsWrapper());
    });

    it("sorts the root folders by the folder sort order", () => {
      settings.folderSortOrder = { by: "name", ascending: false };
      build();

      expect(renderedRootFolders()).toEqual([
        "Newsletter",
        "News",
        "Empty",
        "Archive",
      ]);
    });

    it("keeps the stored order of root folders for a custom folder sort order", () => {
      settings.folderSortOrder = { by: "custom", ascending: true };
      build();

      expect(renderedRootFolders()).toEqual([
        "News",
        "Archive",
        "Empty",
        "Newsletter",
      ]);
    });

    it("lists the feeds with no folder in the root wrapper, in settings order", () => {
      build();

      expect(feedUrlsIn(rootFeedsWrapper() as HTMLElement)).toEqual([
        ROOTED,
        ZULU,
      ]);
    });

    it("lists a feed whose folder no longer exists at the root", () => {
      settings.feeds.push(makeFeed("Orphan", ORPHAN, "Gone/Missing"));
      build();

      expect(feedUrlsIn(rootFeedsWrapper() as HTMLElement)).toEqual([
        ROOTED,
        ZULU,
        ORPHAN,
      ]);
    });

    it("sorts the root feeds by the root entry of the feed sort orders", () => {
      settings.folderFeedSortOrders = { "": { by: "name", ascending: false } };
      build();

      expect(feedUrlsIn(rootFeedsWrapper() as HTMLElement)).toEqual([
        ZULU,
        ROOTED,
      ]);
    });

    it("keeps settings order for a custom root feed sort order", () => {
      settings.folderFeedSortOrders = {
        "": { by: "custom", ascending: false },
      };
      build();

      expect(feedUrlsIn(rootFeedsWrapper() as HTMLElement)).toEqual([
        ROOTED,
        ZULU,
      ]);
    });

    it("hides root feeds that have no unread items when empty feeds are hidden", () => {
      settings.display.hideEmptyFeeds = true;
      feed(ROOTED).items = [{ read: true }] as Feed["items"];
      build();

      expect(feedUrlsIn(rootFeedsWrapper() as HTMLElement)).toEqual([ZULU]);
    });

    it("hides root feeds with no items at all when empty feeds are hidden", () => {
      settings.display.hideEmptyFeeds = true;
      feed(ZULU).items = [];
      build();

      expect(feedUrlsIn(rootFeedsWrapper() as HTMLElement)).toEqual([ROOTED]);
    });

    it("still renders the root wrapper, empty, when hiding empty feeds removes every root feed", () => {
      settings.display.hideEmptyFeeds = true;
      feed(ROOTED).items = [];
      feed(ZULU).items = [];
      build();

      expect(rootFeedsWrapper()).not.toBeNull();
      expect(feedUrlsIn(rootFeedsWrapper() as HTMLElement)).toEqual([]);
    });

    it("renders no root wrapper when every feed sits in a folder", () => {
      settings.feeds = settings.feeds.filter((f) => f.folder);
      build();

      expect(rootFeedsWrapper()).toBeNull();
    });

    it("shows the empty state, and no feed rows, when there are no feeds", () => {
      settings.feeds = [];
      build();

      const empty = rootSection().querySelector(".rss-dashboard-empty-state");
      expect(empty?.textContent).toBe(EMPTY_STATE);
      expect(rootSection().querySelectorAll("[data-feed-url]")).toHaveLength(0);
    });

    it("shows no empty state when there are feeds", () => {
      build();

      expect(
        rootSection().querySelector(".rss-dashboard-empty-state"),
      ).toBeNull();
    });

    it("still renders folders under the empty state when there are folders but no feeds", () => {
      settings.feeds = [];
      build();

      expect(renderedRootFolders()).toEqual([
        "Archive",
        "Empty",
        "News",
        "Newsletter",
      ]);
      expect(
        rootSection().querySelector(".rss-dashboard-empty-state"),
      ).not.toBeNull();
    });

    it("renders with no folders at all", () => {
      settings.folders = [];
      settings.feeds = [makeFeed("Rooted", ROOTED, "")];
      build();

      expect(renderedRootFolders()).toEqual([]);
      expect(feedUrlsIn(rootFeedsWrapper() as HTMLElement)).toEqual([ROOTED]);
    });

    it("renders one root folder", () => {
      settings.folders = [makeFolder("Solo")];
      settings.feeds = [makeFeed("Rooted", ROOTED, "")];
      build();

      expect(renderedRootFolders()).toEqual(["Solo"]);
    });

    it("renders the tags section between All Feeds and the folders when tags are expanded", () => {
      build();
      internals.isTagsExpanded = true;
      sidebar.render();

      const tags = rootSection().querySelector(
        ".rss-dashboard-sidebar-tags-section",
      );
      expect(tags).not.toBeNull();
      expect(tags?.previousElementSibling).toBe(allFeedsButton());
      expect(
        tags?.nextElementSibling?.classList.contains(
          "rss-dashboard-feed-folder",
        ),
      ).toBe(true);
    });

    it("renders no tags section while tags are collapsed", () => {
      build();

      expect(
        rootSection().querySelector(".rss-dashboard-sidebar-tags-section"),
      ).toBeNull();
    });

    it("renders the section again, replacing the old one, on every render", () => {
      build();
      const first = rootSection();

      sidebar.render();

      expect(
        container.querySelectorAll(".rss-dashboard-feed-folders-section"),
      ).toHaveLength(1);
      expect(rootSection()).not.toBe(first);
    });
  });

  describe("the drop highlight", () => {
    it("adds drag-over and allows the drop while dragging over empty space in the section", async () => {
      build();

      const event = await fire(rootSection(), "dragover");

      expect(event.defaultPrevented).toBe(true);
      expect(rootSection().classList.contains("drag-over")).toBe(true);
    });

    it("highlights while dragging over the All Feeds button", async () => {
      build();

      await fire(allFeedsButton(), "dragover");

      expect(rootSection().classList.contains("drag-over")).toBe(true);
    });

    it("does not highlight over a folder header", async () => {
      build();

      await fire(folderHeader("Empty"), "dragover");

      expect(rootSection().classList.contains("drag-over")).toBe(false);
    });

    it("does not highlight over the feed list of a folder", async () => {
      build();

      await fire(folderFeedsList("News"), "dragover");

      expect(rootSection().classList.contains("drag-over")).toBe(false);
    });

    it("does not highlight over a feed that sits in a folder", async () => {
      build();

      await fire(feedRow(ALPHA), "dragover");

      expect(rootSection().classList.contains("drag-over")).toBe(false);
    });

    it("does not highlight over the root feeds wrapper or the feeds inside it", async () => {
      build();

      await fire(rootFeedsWrapper() as HTMLElement, "dragover");
      expect(rootSection().classList.contains("drag-over")).toBe(false);

      await fire(feedRow(ROOTED), "dragover");
      expect(rootSection().classList.contains("drag-over")).toBe(false);
    });

    it("removes drag-over when the drag leaves over empty space", async () => {
      build();
      await fire(rootSection(), "dragover");

      await fire(rootSection(), "dragleave");

      expect(rootSection().classList.contains("drag-over")).toBe(false);
    });

    it("keeps drag-over when a dragleave fires over a folder header or a feed list", async () => {
      build();
      await fire(rootSection(), "dragover");

      await fire(folderHeader("Empty"), "dragleave");
      expect(rootSection().classList.contains("drag-over")).toBe(true);

      await fire(folderFeedsList("News"), "dragleave");
      expect(rootSection().classList.contains("drag-over")).toBe(true);
    });

    it("keeps drag-over when a dragleave fires over the root feeds wrapper or a feed in it", async () => {
      build();
      await fire(rootSection(), "dragover");

      await fire(rootFeedsWrapper() as HTMLElement, "dragleave");
      expect(rootSection().classList.contains("drag-over")).toBe(true);

      await fire(feedRow(ROOTED), "dragleave");
      expect(rootSection().classList.contains("drag-over")).toBe(true);
    });

    it("clears drag-over as soon as the pointer leaves over any other element in the section", async () => {
      build();
      await fire(rootSection(), "dragover");

      await fire(allFeedsButton(), "dragleave");

      expect(rootSection().classList.contains("drag-over")).toBe(false);
    });

    it("leaves the highlight where it is when the drag moves from empty space onto a folder header", async () => {
      build();
      await fire(rootSection(), "dragover");

      // A dragover on a header neither adds nor removes the class.
      await fire(folderHeader("Empty"), "dragover");

      expect(rootSection().classList.contains("drag-over")).toBe(true);
    });
  });

  describe("dropping on the root area", () => {
    it("allows the drop and clears the highlight", async () => {
      build();
      await fire(rootSection(), "dragover");

      const event = await fire(
        rootSection(),
        "drop",
        payload({ "feed-url": GAMMA }),
      );

      expect(event.defaultPrevented).toBe(true);
      expect(rootSection().classList.contains("drag-over")).toBe(false);
    });

    it("sends feeds to the batch move with the root as destination, folders listed as dragged", async () => {
      build();
      const batch = vi.spyOn(internals, "batchMoveFeedsAndFoldersToFolder");

      await fire(
        rootSection(),
        "drop",
        payload({
          "feed-urls": JSON.stringify([ALPHA, GAMMA]),
          "folder-paths": JSON.stringify(["Archive"]),
        }),
      );

      expect(batch).toHaveBeenCalledTimes(1);
      expect(batch).toHaveBeenCalledWith("", [ALPHA, GAMMA], ["Archive"]);
    });

    it("sends two or more folders to the batch move", async () => {
      build();
      const batch = vi.spyOn(internals, "batchMoveFeedsAndFoldersToFolder");

      await fire(
        rootSection(),
        "drop",
        payload({
          "folder-paths": JSON.stringify(["News/Tech", "Archive/Old"]),
        }),
      );

      expect(batch).toHaveBeenCalledWith("", [], ["News/Tech", "Archive/Old"]);
    });

    it("sends a lone dragged feed, read from the single key, to the batch move", async () => {
      build();
      const batch = vi.spyOn(internals, "batchMoveFeedsAndFoldersToFolder");

      await fire(rootSection(), "drop", payload({ "feed-url": GAMMA }));

      expect(batch).toHaveBeenCalledTimes(1);
      expect(batch).toHaveBeenCalledWith("", [GAMMA], []);
    });

    it("sends a feed together with a single folder to the batch move, not to the folder move", async () => {
      build();
      const batch = vi
        .spyOn(internals, "batchMoveFeedsAndFoldersToFolder")
        .mockImplementation(() => undefined);

      await fire(
        rootSection(),
        "drop",
        payload({ "feed-url": ALPHA, "folder-path": "News/Tech" }),
      );

      expect(batch).toHaveBeenCalledTimes(1);
      expect(batch).toHaveBeenCalledWith("", [ALPHA], ["News/Tech"]);
      expect(rootNames()).toEqual(["News", "Archive", "Empty", "Newsletter"]);
    });

    it("does nothing but allow the drop when nothing was dragged", async () => {
      build();
      const batch = vi.spyOn(internals, "batchMoveFeedsAndFoldersToFolder");

      const event = await fire(rootSection(), "drop", payload({}));

      expect(event.defaultPrevented).toBe(true);
      expect(batch).not.toHaveBeenCalled();
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(notices()).toEqual([]);
    });

    it("allows the drop and does nothing else when the event carries no data transfer", async () => {
      build();
      const batch = vi.spyOn(internals, "batchMoveFeedsAndFoldersToFolder");
      rootSection().classList.add("drag-over");

      const event = await fire(rootSection(), "drop", null);

      expect(event.defaultPrevented).toBe(true);
      expect(rootSection().classList.contains("drag-over")).toBe(false);
      expect(batch).not.toHaveBeenCalled();
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it("ignores a drop whose single folder is listed only under the list key", async () => {
      build();
      const batch = vi.spyOn(internals, "batchMoveFeedsAndFoldersToFolder");

      // One path in the list payload: not enough for the batch route, and the
      // single-folder key is absent, so nothing moves.
      await fire(
        rootSection(),
        "drop",
        payload({ "folder-paths": JSON.stringify(["News/Tech"]) }),
      );

      expect(batch).not.toHaveBeenCalled();
      expect(rootNames()).toEqual(["News", "Archive", "Empty", "Newsletter"]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it("lets a drop on a folder header go to the folder, not the root", async () => {
      build();
      const batch = vi.spyOn(internals, "batchMoveFeedsAndFoldersToFolder");

      await fire(
        folderHeader("Empty"),
        "drop",
        payload({ "feed-urls": JSON.stringify([ROOTED]) }),
      );

      expect(batch).toHaveBeenCalledTimes(1);
      expect(batch).toHaveBeenCalledWith("Empty", [ROOTED], []);
    });

    it("lets a drop on the root feeds wrapper pass without moving anything", async () => {
      build();
      const batch = vi.spyOn(internals, "batchMoveFeedsAndFoldersToFolder");

      const event = await fire(
        rootFeedsWrapper() as HTMLElement,
        "drop",
        payload({ "feed-url": ALPHA }),
      );

      expect(event.defaultPrevented).toBe(false);
      expect(batch).not.toHaveBeenCalled();
      expect(feed(ALPHA).folder).toBe("News");
    });

    it("does not clear the highlight when the drop lands on the root feeds wrapper", async () => {
      build();
      rootSection().classList.add("drag-over");

      await fire(
        rootFeedsWrapper() as HTMLElement,
        "drop",
        payload({ "feed-url": ALPHA }),
      );

      expect(rootSection().classList.contains("drag-over")).toBe(true);
    });
  });

  // The rows stop these events before they reach the section, so an element
  // that only carries a row's class (and none of its handlers) is the way to
  // reach the section's own checks.
  describe("elements that look like rows but have no handlers of their own", () => {
    const classes = [
      "rss-dashboard-feed-folder-header",
      "rss-dashboard-folder-feeds",
    ];

    const bareChild = (cls: string): HTMLElement =>
      rootSection().createDiv({ cls });

    it("is not highlighted over by a drag", async () => {
      build();

      for (const cls of classes) {
        await fire(bareChild(cls), "dragover");
        expect(rootSection().classList.contains("drag-over")).toBe(false);
      }
    });

    it("keeps the highlight when a drag leaves over one", async () => {
      build();

      for (const cls of classes) {
        rootSection().classList.add("drag-over");
        await fire(bareChild(cls), "dragleave");
        expect(rootSection().classList.contains("drag-over")).toBe(true);
      }
    });

    it("passes a drop on without moving anything", async () => {
      build();
      const batch = vi.spyOn(internals, "batchMoveFeedsAndFoldersToFolder");

      for (const cls of classes) {
        const event = await fire(
          bareChild(cls),
          "drop",
          payload({ "feed-url": ALPHA }),
        );
        expect(event.defaultPrevented).toBe(false);
      }

      expect(batch).not.toHaveBeenCalled();
    });

    it("opens no root menu on right-click when the element looks like a feed, a folder header or All Feeds", () => {
      build();

      for (const cls of [
        "rss-dashboard-feed",
        "rss-dashboard-feed-folder-header",
        "rss-dashboard-all-feeds-button",
      ]) {
        ObsidianStubs.Menu.lastItems = [];
        const event = rightClick(bareChild(cls));
        expect(event.defaultPrevented).toBe(false);
        expect(menuTitles()).toEqual([]);
      }
    });

    it("opens the root menu on right-click over a bare element of another class", () => {
      build();

      const event = rightClick(bareChild("some-other-class"));

      expect(event.defaultPrevented).toBe(true);
      expect(menuTitles()).toEqual(["Add folder", "Add feed"]);
    });
  });

  describe("dropping a lone folder on the root area", () => {
    const dropFolder = (path: string) =>
      fire(rootSection(), "drop", payload({ "folder-path": path }));

    it("moves a nested folder to the end of the root, with its feeds and subfolders", async () => {
      build();

      await dropFolder("News/Tech");

      expect(rootNames()).toEqual([
        "News",
        "Archive",
        "Empty",
        "Newsletter",
        "Tech",
      ]);
      expect(settings.folders[0].subfolders).toEqual([]);
      expect(feed(GAMMA).folder).toBe("Tech");
      expect(feed(DELTA).folder).toBe("Tech/Deep");
      expect(feed(ALPHA).folder).toBe("News");
    });

    it("moves a root folder to the end of the root", async () => {
      build();

      await dropFolder("News");

      expect(rootNames()).toEqual(["Archive", "Empty", "Newsletter", "News"]);
      expect(feed(ALPHA).folder).toBe("News");
    });

    it("switches the folder sort order to custom, so the redrawn tree keeps the stored order", async () => {
      build();

      await dropFolder("News/Tech");

      expect(settings.folderSortOrder).toEqual({
        by: "custom",
        ascending: true,
      });
    });

    it("saves once, then redraws the tree with the folder at the root", async () => {
      build();

      await dropFolder("News/Tech");

      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(renderedRootFolders()).toEqual([
        "News",
        "Archive",
        "Empty",
        "Newsletter",
        "Tech",
      ]);
      expect(notices()).toEqual([]);
    });

    it("redraws only after the save resolves", async () => {
      let finishSave: () => void = () => undefined;
      plugin.saveSettings.mockReturnValue(
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
      );
      build();

      await dropFolder("News/Tech");
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(renderedRootFolders()).toEqual([
        "Archive",
        "Empty",
        "News",
        "Newsletter",
      ]);

      finishSave();
      await flushPromises();

      expect(renderedRootFolders()).toEqual([
        "News",
        "Archive",
        "Empty",
        "Newsletter",
        "Tech",
      ]);
    });

    it("refreshes the cached folder paths so the moved folder's feeds are not drawn at the root", async () => {
      build();

      await dropFolder("News/Tech");

      expect(feedUrlsIn(rootFeedsWrapper() as HTMLElement)).toEqual([
        ROOTED,
        ZULU,
      ]);
      // The Tech list holds its subfolder too, so it lists Delta as well.
      expect(feedUrlsIn(folderFeedsList("Tech")).sort()).toEqual([
        DELTA,
        GAMMA,
      ]);
      expect(feedUrlsIn(folderFeedsList("Tech/Deep"))).toEqual([DELTA]);
    });

    it("clears the highlight", async () => {
      build();
      rootSection().classList.add("drag-over");

      await dropFolder("News/Tech");

      expect(rootSection().classList.contains("drag-over")).toBe(false);
    });

    it("refuses a folder whose name is already taken at the root, saying so, and changes nothing", async () => {
      settings.folders.push(makeFolder("Old"));
      build();

      await dropFolder("Archive/Old");

      expect(notices()).toEqual([
        'A folder named "Old" already exists at the destination level.',
      ]);
      expect(rootNames()).toEqual([
        "News",
        "Archive",
        "Empty",
        "Newsletter",
        "Old",
      ]);
      expect(settings.folders[1].subfolders.map((f) => f.name)).toEqual([
        "Old",
      ]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });

    it("refuses a folder path that does not exist, saying so", async () => {
      build();

      await dropFolder("Nope/Missing");

      expect(notices()).toEqual(["Dragged folder not found."]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it("shows a fallback notice, and does not save, when the mover refuses without a reason", async () => {
      build();
      vi.mocked(moveFolder).mockReturnValueOnce({ ok: false });

      await dropFolder("News/Tech");

      expect(notices()).toEqual(["Unable to move folder."]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });

    it("treats a move that succeeds without a new path as refused", async () => {
      options.currentFolder = "News/Tech";
      build();
      vi.mocked(moveFolder).mockReturnValueOnce({ ok: true });

      await dropFolder("News/Tech");

      expect(notices()).toEqual(["Unable to move folder."]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });

    it("shows the mover's own reason for a refusal that has a path", async () => {
      build();
      vi.mocked(moveFolder).mockReturnValueOnce({
        ok: false,
        error: "Nope.",
        newPath: "X",
      });

      await dropFolder("News/Tech");

      expect(notices()).toEqual(["Nope."]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it("asks the mover to append the dragged folder at the root, whatever the target", async () => {
      build();

      await dropFolder("News/Tech");

      expect(moveFolder).toHaveBeenCalledTimes(1);
      expect(moveFolder).toHaveBeenCalledWith(settings, {
        draggedPath: "News/Tech",
        targetPath: "",
        placement: "rootAppend",
      });
    });

    it("keeps the highlight cleared even when the move is refused", async () => {
      build();
      rootSection().classList.add("drag-over");

      await dropFolder("Nope/Missing");

      expect(rootSection().classList.contains("drag-over")).toBe(false);
    });

    it("sends the open folder to its new path when it is the dragged folder", async () => {
      options.currentFolder = "News/Tech";
      build();

      await dropFolder("News/Tech");

      expect(callbacks.onFolderClick).toHaveBeenCalledTimes(1);
      expect(callbacks.onFolderClick).toHaveBeenCalledWith("Tech");
    });

    it("sends the open folder to its new path when it sits inside the dragged folder", async () => {
      options.currentFolder = "News/Tech/Deep";
      build();

      await dropFolder("News/Tech");

      expect(callbacks.onFolderClick).toHaveBeenCalledWith("Tech/Deep");
    });

    it("leaves the open folder alone when it is outside the dragged folder", async () => {
      options.currentFolder = "Archive";
      build();

      await dropFolder("News/Tech");

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });

    it("compares whole path segments, so 'News/Tech' does not capture 'News/Technology'", async () => {
      options.currentFolder = "News/Technology";
      build();

      await dropFolder("News/Tech");

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });

    it("does not report an open root folder when it is reordered within the root", async () => {
      options.currentFolder = "News";
      build();

      await dropFolder("News");

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });

    it("leaves the open folder alone when no folder is open", async () => {
      options.currentFolder = null;
      build();

      await dropFolder("News/Tech");

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });

    it("calls the open-folder callback before the save", async () => {
      options.currentFolder = "News/Tech";
      const order: string[] = [];
      (callbacks.onFolderClick as ReturnType<typeof vi.fn>).mockImplementation(
        () => order.push("click"),
      );
      plugin.saveSettings.mockImplementation(() => {
        order.push("save");
        return Promise.resolve();
      });
      build();

      await dropFolder("News/Tech");

      expect(order).toEqual(["click", "save"]);
    });

    it("ignores an empty single-folder key", async () => {
      build();

      await fire(rootSection(), "drop", payload({ "folder-path": "" }));

      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(rootNames()).toEqual(["News", "Archive", "Empty", "Newsletter"]);
    });
  });

  describe("right-clicking the tree", () => {
    it("opens an Add folder and Add feed menu on empty space, at the pointer", () => {
      build();

      const event = rightClick(rootSection());

      expect(event.defaultPrevented).toBe(true);
      expect(titleIconLog).toEqual([
        { title: "Add folder", icon: "folder-plus" },
        { title: "Add feed", icon: "rss" },
      ]);
      expect(menuTitles()).toEqual(["Add folder", "Add feed"]);
      expect(atMouseEvent).toHaveBeenCalledTimes(1);
      expect(atMouseEvent).toHaveBeenCalledWith(event);
      expect(atPosition).not.toHaveBeenCalled();
    });

    it("opens the same menu over the empty state", () => {
      settings.feeds = [];
      build();

      const event = rightClick(
        rootSection().querySelector(
          ".rss-dashboard-empty-state",
        ) as HTMLElement,
      );

      expect(event.defaultPrevented).toBe(true);
      expect(menuTitles()).toEqual(["Add folder", "Add feed"]);
    });

    it("opens the same menu over the wrapper that holds the root feeds", () => {
      build();

      rightClick(rootFeedsWrapper() as HTMLElement);

      expect(menuTitles()).toEqual(["Add folder", "Add feed"]);
    });

    it("builds a new menu on every right-click", () => {
      build();

      rightClick(rootSection());
      rightClick(rootSection());

      expect(atMouseEvent).toHaveBeenCalledTimes(2);
      expect(menuTitles()).toEqual(["Add folder", "Add feed"]);
    });

    it("does not offer it over a feed, a folder header or the All Feeds button", () => {
      build();

      for (const el of [
        feedRow(ROOTED),
        feedRow(ALPHA),
        folderHeader("Empty"),
        allFeedsButton(),
      ]) {
        ObsidianStubs.Menu.lastItems = [];
        titleIconLog = [];
        rightClick(el);
        expect(menuTitles()).not.toEqual(["Add folder", "Add feed"]);
      }
    });

    it("leaves a right-click on a row to the row's own menu, not the root's", () => {
      build();

      const event = rightClick(folderHeader("Empty"));

      expect(event.defaultPrevented).toBe(true);
      expect(menuTitles()).toContain("Add subfolder");
      expect(menuTitles()).not.toContain("Add folder");
    });

    it("opens the Add folder dialog listing the root folder names, under that title", () => {
      build();
      const modal = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);
      rightClick(rootSection());

      clickItem("Add folder");

      expect(modal).toHaveBeenCalledTimes(1);
      const dialog = modal.mock.calls[0][0];
      expect(dialog.title).toBe("Add folder");
      expect(dialog.existingNames).toEqual([
        "News",
        "Archive",
        "Empty",
        "Newsletter",
      ]);
      expect(dialog.defaultValue).toBeUndefined();
    });

    it("reads the root folder names when the item is clicked, not when the menu opens", () => {
      build();
      const modal = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);
      rightClick(rootSection());
      settings.folders.push(makeFolder("Later"));

      clickItem("Add folder");

      expect(modal.mock.calls[0][0].existingNames).toEqual([
        "News",
        "Archive",
        "Empty",
        "Newsletter",
        "Later",
      ]);
    });

    it("creates the folder at the root, saves, and redraws when the dialog is submitted", async () => {
      build();
      const modal = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);
      rightClick(rootSection());
      clickItem("Add folder");

      modal.mock.calls[0][0].onSubmit("Fresh");
      await flushPromises();

      expect(rootNames()).toEqual([
        "News",
        "Archive",
        "Empty",
        "Newsletter",
        "Fresh",
      ]);
      expect(settings.folders[4]).toEqual({
        name: "Fresh",
        subfolders: [],
        createdAt: NOW,
        modifiedAt: NOW,
      });
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(renderedRootFolders()).toContain("Fresh");
    });

    it("redraws twice for a new folder, once from the creation and once from the menu", async () => {
      build();
      const modal = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);
      const render = vi.spyOn(sidebar, "render");
      rightClick(rootSection());
      clickItem("Add folder");

      modal.mock.calls[0][0].onSubmit("Fresh");
      await flushPromises();

      expect(render).toHaveBeenCalledTimes(2);
    });

    it("saves nothing and still redraws once when the new folder's name already exists", async () => {
      build();
      const modal = vi
        .spyOn(internals, "showFolderNameModal")
        .mockImplementation(() => undefined);
      const render = vi.spyOn(sidebar, "render");
      rightClick(rootSection());
      clickItem("Add folder");

      modal.mock.calls[0][0].onSubmit("Empty");
      await flushPromises();

      expect(rootNames()).toEqual(["News", "Archive", "Empty", "Newsletter"]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(render).toHaveBeenCalledTimes(1);
    });

    it("opens the Add feed dialog with no preset folder", () => {
      build();
      const modal = vi
        .spyOn(internals, "showAddFeedModal")
        .mockImplementation(() => undefined);
      rightClick(rootSection());

      clickItem("Add feed");

      expect(modal).toHaveBeenCalledTimes(1);
      expect(modal).toHaveBeenCalledWith();
    });
  });
});
