/**
 * Characterization tests for the feed and folder row code in `Sidebar`
 * (`renderFeed`, `renderFolder`), pinned before they are split (#600, part of
 * #436). They describe what the rows do today, quirks included, and must keep
 * passing unchanged through the split.
 *
 * Everything runs through `Sidebar.render()` and real DOM events on the
 * rendered rows. Callbacks, `saveSettings`, the context-menu builders and the
 * batch-move method are spies, so each test sees which one a gesture reached.
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
import type { Feed, Folder, RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { failedFeedIconUrls } from "../../../src/utils/favicon-utils";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

interface TestPlugin {
  settings: RssDashboardSettings;
  saveSettings: ReturnType<typeof vi.fn>;
  backgroundImportQueue?: Array<{ url: string; importStatus?: string }>;
  activeRefreshState?: Map<string, { status: string }>;
  isShardFolderHiddenFromSync?: boolean;
  getFeedShardHealth?: (feed: Feed) => string | null;
}

interface SidebarSpies {
  showFeedContextMenu: ReturnType<typeof vi.fn>;
  showFolderContextMenu: ReturnType<typeof vi.fn>;
  batchMove: ReturnType<typeof vi.fn>;
}

type SidebarInternals = {
  showFeedContextMenu: (event: MouseEvent, feed: Feed) => void;
  showFolderContextMenu: (
    event: MouseEvent,
    folder: Folder,
    path: string,
    name: string,
  ) => void;
  batchMoveFeedsAndFoldersToFolder: (
    destination: string,
    feedUrls: string[],
    folderPaths?: string[],
  ) => void;
};

const NOW = 1_700_000_000_000;

function makeFeed(
  title: string,
  url: string,
  folder: string,
  unread = 1,
): Feed {
  return {
    title,
    url,
    folder,
    items: Array.from({ length: unread }, () => ({ read: false })),
    lastUpdated: 0,
  } as unknown as Feed;
}

function makeFolders(): Folder[] {
  return [
    {
      name: "News",
      subfolders: [{ name: "Tech", subfolders: [] }],
    },
    { name: "Empty", subfolders: [] },
    {
      name: "Videos",
      subfolders: [{ name: "Clips", subfolders: [] }],
      pinned: true,
    },
  ] as Folder[];
}

function makeFeeds(): Feed[] {
  return [
    makeFeed("Alpha", "https://a.test/feed", "News"),
    makeFeed("Beta", "https://b.test/feed", "News"),
    makeFeed("Gamma", "https://c.test/feed", "News/Tech"),
    makeFeed("Rooted", "https://root.test/feed", ""),
  ];
}

interface FakeDataTransfer {
  setData: ReturnType<typeof vi.fn>;
  getData: (key: string) => string;
  types: string[];
  effectAllowed: string;
  store: Record<string, string>;
}

/** A drag payload holder: `setData` records, `getData` reads back, `types` follows. */
function makeDataTransfer(
  initial: Record<string, string> = {},
): FakeDataTransfer {
  const store: Record<string, string> = { ...initial };
  const dt: FakeDataTransfer = {
    store,
    types: Object.keys(initial),
    effectAllowed: "none",
    setData: vi.fn((key: string, value: string) => {
      store[key] = value;
      if (!dt.types.includes(key)) dt.types.push(key);
    }),
    getData: (key: string) => store[key] ?? "",
  };
  return dt;
}

function dragEvent(
  type: string,
  dataTransfer: FakeDataTransfer | null,
  clientY = 0,
): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  Object.defineProperty(event, "clientY", { value: clientY });
  return event;
}

/** jsdom has no layout, so give a row a fixed box: top 100, height 40. */
function giveRowBox(el: HTMLElement, height = 40): void {
  el.getBoundingClientRect = () =>
    ({
      top: 100,
      height,
      bottom: 100 + height,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("Sidebar row interactions (characterization)", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;
  let plugin: TestPlugin;
  let sidebar: Sidebar;
  let spies: SidebarSpies;
  let noticeSpy: MockInstance<typeof console.debug>;

  function build(): void {
    sidebar = new Sidebar(
      ObsidianStubs.App.createMock() as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    const internals = sidebar as unknown as SidebarInternals;
    spies = {
      showFeedContextMenu: vi
        .spyOn(internals, "showFeedContextMenu")
        .mockImplementation(() => undefined),
      showFolderContextMenu: vi
        .spyOn(internals, "showFolderContextMenu")
        .mockImplementation(() => undefined),
      batchMove: vi
        .spyOn(internals, "batchMoveFeedsAndFoldersToFolder")
        .mockImplementation(() => undefined),
    };
    sidebar.render();
  }

  const feedRow = (url: string): HTMLElement =>
    container.querySelector(`[data-feed-url="${url}"]`) as HTMLElement;
  const folderHeader = (path: string): HTMLElement =>
    container.querySelector(
      `.rss-dashboard-feed-folder-header[data-folder-path="${path}"]`,
    ) as HTMLElement;
  const folderFeedsList = (path: string): HTMLElement =>
    folderHeader(path).parentElement?.querySelector(
      ":scope > .rss-dashboard-folder-feeds",
    ) as HTMLElement;

  /** Dispatches a click and reports whether it still reached the container. */
  function click(
    el: HTMLElement,
    init: MouseEventInit = {},
  ): { event: MouseEvent; reachedContainer: boolean } {
    let reachedContainer = false;
    const listener = () => {
      reachedContainer = true;
    };
    container.addEventListener("click", listener);
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...init,
    });
    el.dispatchEvent(event);
    container.removeEventListener("click", listener);
    return { event, reachedContainer };
  }

  /** Dispatches a drag event and reports whether it reached the container. */
  function drag(
    el: HTMLElement,
    type: string,
    dataTransfer: FakeDataTransfer | null,
    clientY = 0,
  ): { event: DragEvent; reachedContainer: boolean } {
    let reachedContainer = false;
    const listener = () => {
      reachedContainer = true;
    };
    container.addEventListener(type, listener);
    const event = dragEvent(type, dataTransfer, clientY);
    el.dispatchEvent(event);
    container.removeEventListener(type, listener);
    return { event, reachedContainer };
  }

  beforeEach(() => {
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
      onRangeSelect: vi.fn(),
      onFolderMultiSelect: vi.fn(),
    } as unknown as SidebarCallbacks;

    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
    };

    noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    failedFeedIconUrls.clear();
    container.remove();
    document.body.innerHTML = "";
  });

  /** The text of every Notice shown (the stub logs it through console.debug). */
  function notices(): string[] {
    return noticeSpy.mock.calls
      .filter((call) => call[0] === "[Stub Notice]")
      .map((call) => String(call[1]));
  }

  describe("feed row: click", () => {
    it("hands a plain click to onFeedClick with the feed and the event, and keeps it from bubbling", () => {
      build();
      const row = feedRow("https://a.test/feed");

      const { event, reachedContainer } = click(row);

      expect(callbacks.onFeedClick).toHaveBeenCalledTimes(1);
      expect(callbacks.onFeedClick).toHaveBeenCalledWith(
        settings.feeds[0],
        event,
      );
      expect(callbacks.onRangeSelect).not.toHaveBeenCalled();
      expect(reachedContainer).toBe(false);
    });

    it("hands Ctrl and Meta clicks to onFeedClick too; the caller decides what they mean", () => {
      build();
      const row = feedRow("https://a.test/feed");

      click(row, { ctrlKey: true });
      click(row, { metaKey: true });

      expect(callbacks.onFeedClick).toHaveBeenCalledTimes(2);
      expect(callbacks.onRangeSelect).not.toHaveBeenCalled();
    });

    it("sends a Shift click to onRangeSelect with the row key and every visible row key, and not to onFeedClick", () => {
      build();

      const { reachedContainer } = click(feedRow("https://b.test/feed"), {
        shiftKey: true,
      });

      expect(callbacks.onFeedClick).not.toHaveBeenCalled();
      expect(reachedContainer).toBe(false);
      expect(callbacks.onRangeSelect).toHaveBeenCalledTimes(1);
      const [clickedKey, visibleKeys] = vi.mocked(callbacks.onRangeSelect!).mock
        .calls[0];
      expect(clickedKey).toBe("feed:https://b.test/feed");
      // Pinned folders sort first; root feeds come last.
      expect(visibleKeys).toEqual([
        "all-feeds",
        "folder:Videos",
        "folder:Videos/Clips",
        "folder:Empty",
        "folder:News",
        "folder:News/Tech",
        "feed:https://c.test/feed",
        "feed:https://a.test/feed",
        "feed:https://b.test/feed",
        "feed:https://root.test/feed",
      ]);
    });

    it("ignores a Shift click quietly when the caller gave no onRangeSelect", () => {
      delete callbacks.onRangeSelect;
      build();

      click(feedRow("https://a.test/feed"), { shiftKey: true });

      expect(callbacks.onFeedClick).not.toHaveBeenCalled();
    });
  });

  describe("feed row: context menu", () => {
    it("opens the feed menu on contextmenu, cancelling the native menu and the bubble", () => {
      build();
      const row = feedRow("https://a.test/feed");
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      let reachedContainer = false;
      container.addEventListener("contextmenu", () => {
        reachedContainer = true;
      });

      row.dispatchEvent(event);

      expect(spies.showFeedContextMenu).toHaveBeenCalledTimes(1);
      expect(spies.showFeedContextMenu).toHaveBeenCalledWith(
        event,
        settings.feeds[0],
      );
      expect(event.defaultPrevented).toBe(true);
      expect(reachedContainer).toBe(false);
    });

    it("opens the feed menu after a 500 ms touch press, passing a synthetic contextmenu at the touch point", () => {
      vi.useFakeTimers();
      build();
      const row = feedRow("https://a.test/feed");

      row.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerType: "touch",
          clientX: 12,
          clientY: 34,
        }),
      );
      vi.advanceTimersByTime(499);
      expect(spies.showFeedContextMenu).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(spies.showFeedContextMenu).toHaveBeenCalledTimes(1);
      const [event, feed] = spies.showFeedContextMenu.mock.calls[0] as [
        MouseEvent,
        Feed,
      ];
      expect(event.type).toBe("contextmenu");
      expect(event.clientX).toBe(12);
      expect(event.clientY).toBe(34);
      expect(feed).toBe(settings.feeds[0]);
    });

    it("does not open the menu when the press ends, is cancelled or moves before 500 ms, or is a mouse press", () => {
      vi.useFakeTimers();
      build();
      const row = feedRow("https://a.test/feed");

      for (const endType of ["pointerup", "pointercancel", "pointermove"]) {
        row.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerType: "touch",
          }),
        );
        vi.advanceTimersByTime(200);
        row.dispatchEvent(new PointerEvent(endType, { bubbles: true }));
        vi.advanceTimersByTime(1000);
      }
      row.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerType: "mouse",
        }),
      );
      vi.advanceTimersByTime(1000);

      expect(spies.showFeedContextMenu).not.toHaveBeenCalled();
    });

    it("swallows the click that follows a long press before it reaches onFeedClick", () => {
      vi.useFakeTimers();
      build();
      const row = feedRow("https://a.test/feed");
      row.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerType: "touch",
        }),
      );
      vi.advanceTimersByTime(500);

      const { event, reachedContainer } = click(row);

      expect(callbacks.onFeedClick).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      expect(reachedContainer).toBe(false);

      // The guard resets after one click.
      click(row);
      expect(callbacks.onFeedClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("feed row: dragstart", () => {
    it("drags just this feed when nothing is selected", () => {
      build();
      const dt = makeDataTransfer();

      drag(feedRow("https://a.test/feed"), "dragstart", dt);

      expect(dt.store["feed-url"]).toBe("https://a.test/feed");
      expect(dt.store["feed-urls"]).toBe(
        JSON.stringify(["https://a.test/feed"]),
      );
      expect(dt.store["folder-paths"]).toBeUndefined();
      expect(dt.effectAllowed).toBe("move");
      expect(options.selectedFeeds).toEqual([]);
    });

    it("drags every selected feed when this one is among them", () => {
      options.selectedFeeds = ["https://a.test/feed", "https://b.test/feed"];
      build();
      const dt = makeDataTransfer();

      drag(feedRow("https://b.test/feed"), "dragstart", dt);

      expect(dt.store["feed-url"]).toBe("https://b.test/feed");
      expect(dt.store["feed-urls"]).toBe(
        JSON.stringify(["https://a.test/feed", "https://b.test/feed"]),
      );
    });

    it("adds an unselected feed to the selection array in place, then drags the whole selection", () => {
      const selection = ["https://a.test/feed"];
      options.selectedFeeds = selection;
      build();
      const dt = makeDataTransfer();

      drag(feedRow("https://root.test/feed"), "dragstart", dt);

      expect(selection).toEqual([
        "https://a.test/feed",
        "https://root.test/feed",
      ]);
      expect(options.selectedFeeds).toBe(selection);
      expect(dt.store["feed-urls"]).toBe(
        JSON.stringify(["https://a.test/feed", "https://root.test/feed"]),
      );
    });

    it("also carries the selected folders as folder-paths", () => {
      options.selectedFolders = ["Empty", "News/Tech"];
      build();
      const dt = makeDataTransfer();

      drag(feedRow("https://a.test/feed"), "dragstart", dt);

      expect(dt.store["folder-paths"]).toBe(
        JSON.stringify(["Empty", "News/Tech"]),
      );
    });

    it("does nothing when the event has no dataTransfer", () => {
      options.selectedFeeds = ["https://a.test/feed"];
      build();

      expect(() =>
        drag(feedRow("https://root.test/feed"), "dragstart", null),
      ).not.toThrow();
      expect(options.selectedFeeds).toEqual(["https://a.test/feed"]);
    });
  });

  describe("feed row: dragover and dragleave", () => {
    it("marks the upper half as a drop before and the lower half as a drop after, for a feed drag", () => {
      build();
      const row = feedRow("https://b.test/feed");
      giveRowBox(row);
      const dt = makeDataTransfer({ "feed-urls": "[]" });

      const upper = drag(row, "dragover", dt, 110);
      expect(upper.event.defaultPrevented).toBe(true);
      expect(upper.reachedContainer).toBe(false);
      expect(row.classList.contains("drag-over-before")).toBe(true);
      expect(row.classList.contains("drag-over-after")).toBe(false);

      drag(row, "dragover", dt, 130);
      expect(row.classList.contains("drag-over-before")).toBe(false);
      expect(row.classList.contains("drag-over-after")).toBe(true);
    });

    it("treats the exact midpoint as the lower half", () => {
      build();
      const row = feedRow("https://b.test/feed");
      giveRowBox(row);

      drag(row, "dragover", makeDataTransfer({ "feed-url": "x" }), 120);

      expect(row.classList.contains("drag-over-after")).toBe(true);
    });

    it("ignores folder drags, and drags that carry no feed, leaving them to whatever is behind the row", () => {
      build();
      const row = feedRow("https://root.test/feed");
      giveRowBox(row);

      const folderDrag = drag(
        row,
        "dragover",
        makeDataTransfer({ "folder-path": "News", "feed-urls": "[]" }),
        110,
      );
      const otherDrag = drag(
        row,
        "dragover",
        makeDataTransfer({ "text/plain": "hello" }),
        110,
      );
      const noPayload = drag(row, "dragover", null, 110);

      for (const result of [folderDrag, otherDrag, noPayload]) {
        expect(result.event.defaultPrevented).toBe(false);
        expect(result.reachedContainer).toBe(true);
      }
      expect(row.classList.contains("drag-over-before")).toBe(false);
      expect(row.classList.contains("drag-over-after")).toBe(false);
    });

    it("hands an ignored drag to the enclosing folder's feed list, which accepts it", () => {
      build();
      const row = feedRow("https://b.test/feed");
      giveRowBox(row);

      const { event, reachedContainer } = drag(
        row,
        "dragover",
        makeDataTransfer({ "folder-path": "Empty" }),
        110,
      );

      expect(row.classList.contains("drag-over-before")).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(reachedContainer).toBe(false);
      expect(folderFeedsList("News").classList.contains("drag-over")).toBe(
        true,
      );
    });

    it("clears both markers on dragleave and stops the event", () => {
      build();
      const row = feedRow("https://b.test/feed");
      row.classList.add("drag-over-before", "drag-over-after");

      const { reachedContainer } = drag(row, "dragleave", null);

      expect(row.classList.contains("drag-over-before")).toBe(false);
      expect(row.classList.contains("drag-over-after")).toBe(false);
      expect(reachedContainer).toBe(false);
    });
  });

  describe("feed row: drop", () => {
    it("ignores folder drops, empty payloads and a drop onto one of the dragged feeds, leaving the event alone", () => {
      build();
      const row = feedRow("https://root.test/feed");
      giveRowBox(row);

      const folderDrop = drag(
        row,
        "drop",
        makeDataTransfer({
          "folder-paths": JSON.stringify(["Empty"]),
          "feed-urls": JSON.stringify(["https://a.test/feed"]),
        }),
        110,
      );
      const emptyDrop = drag(row, "drop", makeDataTransfer({ "text/plain": "x" }), 110);
      const selfDrop = drag(
        row,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify([
            "https://a.test/feed",
            "https://root.test/feed",
          ]),
        }),
        110,
      );
      const noPayload = drag(row, "drop", null, 110);

      for (const result of [folderDrop, emptyDrop, selfDrop, noPayload]) {
        expect(result.event.defaultPrevented).toBe(false);
        expect(result.reachedContainer).toBe(true);
      }
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(spies.batchMove).not.toHaveBeenCalled();
      expect(settings.feeds.map((f) => f.title)).toEqual([
        "Alpha",
        "Beta",
        "Gamma",
        "Rooted",
      ]);
    });

    it("hands an ignored drop on a feed inside a folder to that folder's feed list, which batch-moves it into the folder", () => {
      build();
      const row = feedRow("https://b.test/feed");
      giveRowBox(row);

      const { event, reachedContainer } = drag(
        row,
        "drop",
        makeDataTransfer({
          "folder-paths": JSON.stringify(["Empty"]),
          "feed-urls": JSON.stringify(["https://root.test/feed"]),
        }),
        110,
      );

      expect(spies.batchMove).toHaveBeenCalledWith(
        "News",
        ["https://root.test/feed"],
        ["Empty"],
      );
      expect(event.defaultPrevented).toBe(true);
      expect(reachedContainer).toBe(false);
      expect(settings.feeds[1].title).toBe("Beta");
    });

    it("moves a feed before the target when dropped on its upper half, into the target's folder", async () => {
      build();
      const row = feedRow("https://a.test/feed");
      giveRowBox(row);
      row.classList.add("drag-over-before");

      const { event, reachedContainer } = drag(
        row,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify(["https://c.test/feed"]),
        }),
        110,
      );

      expect(event.defaultPrevented).toBe(true);
      expect(reachedContainer).toBe(false);
      expect(settings.feeds.map((f) => f.title)).toEqual([
        "Gamma",
        "Alpha",
        "Beta",
        "Rooted",
      ]);
      expect(settings.feeds[0].folder).toBe("News");
      expect(settings.folderFeedSortOrders?.News).toEqual({
        by: "custom",
        ascending: true,
      });
      await flushPromises();
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it("moves a feed after the target when dropped on its lower half", () => {
      build();
      const row = feedRow("https://a.test/feed");
      giveRowBox(row);

      drag(
        row,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify(["https://c.test/feed"]),
        }),
        130,
      );

      expect(settings.feeds.map((f) => f.title)).toEqual([
        "Alpha",
        "Gamma",
        "Beta",
        "Rooted",
      ]);
    });

    it("moves a whole dragged group, using the single feed-url when feed-urls is absent", () => {
      build();
      const row = feedRow("https://root.test/feed");
      giveRowBox(row);

      drag(
        row,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify([
            "https://a.test/feed",
            "https://b.test/feed",
          ]),
        }),
        110,
      );
      expect(settings.feeds.map((f) => f.title)).toEqual([
        "Gamma",
        "Alpha",
        "Beta",
        "Rooted",
      ]);
      expect(settings.feeds[1].folder).toBe("");
      expect(settings.feeds[2].folder).toBe("");

      drag(
        row,
        "drop",
        makeDataTransfer({ "feed-url": "https://c.test/feed" }),
        130,
      );
      expect(settings.feeds.map((f) => f.title)).toEqual([
        "Alpha",
        "Beta",
        "Rooted",
        "Gamma",
      ]);
    });

    it("stamps modifiedAt on the folders the feed left and joined, and nothing for the root", async () => {
      build();
      const news = settings.folders[0];
      const tech = news.subfolders[0];
      const row = feedRow("https://a.test/feed");
      giveRowBox(row);

      drag(
        row,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify(["https://c.test/feed"]),
        }),
        110,
      );

      expect(tech.modifiedAt).toBe(NOW);
      expect(news.modifiedAt).toBe(NOW);
      await flushPromises();

      // Dropping onto a root feed joins no folder.
      settings.folders[0].modifiedAt = undefined;
      const rootRow = feedRow("https://root.test/feed");
      giveRowBox(rootRow);
      drag(
        rootRow,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify(["https://a.test/feed"]),
        }),
        110,
      );
      expect(news.modifiedAt).toBe(NOW);
      expect(settings.folders[1].modifiedAt).toBeUndefined();
    });

    it("moves the feed to the root when the target feed has no folder property at all", () => {
      delete (settings.feeds[3] as { folder?: string }).folder;
      build();
      const row = feedRow("https://root.test/feed");
      giveRowBox(row);

      drag(
        row,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify(["https://c.test/feed"]),
        }),
        110,
      );

      expect(settings.feeds.find((f) => f.title === "Gamma")?.folder).toBe("");
      expect(settings.folders[0].subfolders[0].modifiedAt).toBe(NOW);
      expect(settings.folders[0].modifiedAt).toBeUndefined();
    });

    it("clears the selection, saves, and re-renders after a move", async () => {
      options.selectedFeeds = ["https://c.test/feed"];
      options.selectedFolders = ["Empty"];
      build();
      const render = vi.spyOn(sidebar, "render");
      const row = feedRow("https://a.test/feed");
      giveRowBox(row);

      drag(
        row,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify(["https://c.test/feed"]),
        }),
        110,
      );

      expect(options.selectedFeeds).toEqual([]);
      expect(options.selectedFolders).toEqual([]);
      expect(render).not.toHaveBeenCalled();
      await flushPromises();
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(1);
    });

    it("shows the error as a notice and changes nothing when the move is refused", async () => {
      build();
      const row = feedRow("https://a.test/feed");
      giveRowBox(row);
      options.selectedFeeds = ["keep"];

      const { event } = drag(
        row,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify(["https://unknown.test/feed"]),
        }),
        110,
      );
      await flushPromises();

      expect(event.defaultPrevented).toBe(true);
      expect(notices()).toEqual(["Dragged feeds not found."]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(options.selectedFeeds).toEqual(["keep"]);
    });

    it("clears the drag markers when a drop is accepted", () => {
      build();
      const row = feedRow("https://a.test/feed");
      giveRowBox(row);
      row.classList.add("drag-over-before", "drag-over-after");

      drag(
        row,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify(["https://c.test/feed"]),
        }),
        110,
      );

      expect(row.classList.contains("drag-over-before")).toBe(false);
      expect(row.classList.contains("drag-over-after")).toBe(false);
    });
  });

  describe("feed row: appearance and state", () => {
    it("is draggable and carries its url, title and folder", () => {
      build();

      const row = feedRow("https://a.test/feed");

      expect(row.getAttribute("draggable")).toBe("true");
      expect(row.getAttribute("data-feed-title")).toBe("Alpha");
      expect(row.getAttribute("data-feed-folder")).toBe("News");
      expect(row.getAttribute("tabindex")).toBe("-1");
      expect(
        feedRow("https://root.test/feed").getAttribute("data-feed-folder"),
      ).toBe("");
    });

    it("marks the open feed active but not multi-selected", () => {
      options.currentFeed = settings.feeds[0];
      build();

      const row = feedRow("https://a.test/feed");

      expect(row.classList.contains("active")).toBe(true);
      expect(row.classList.contains("multi-selected")).toBe(false);
    });

    it("marks a selected feed active and multi-selected", () => {
      options.selectedFeeds = ["https://b.test/feed"];
      build();

      const row = feedRow("https://b.test/feed");

      expect(row.classList.contains("active")).toBe(true);
      expect(row.classList.contains("multi-selected")).toBe(true);
      expect(
        feedRow("https://a.test/feed").classList.contains("multi-selected"),
      ).toBe(false);
    });

    it("marks every feed under a selected folder, however deep, as multi-selected", () => {
      options.selectedFolders = ["News"];
      build();

      for (const url of ["https://a.test/feed", "https://c.test/feed"]) {
        expect(feedRow(url).classList.contains("multi-selected")).toBe(true);
      }
      expect(
        feedRow("https://root.test/feed").classList.contains("multi-selected"),
      ).toBe(false);
    });

    it("does not treat a folder whose name only starts the same way as an ancestor", () => {
      settings.feeds.push(makeFeed("Newsy", "https://n.test/feed", "Newsletters"));
      settings.folders.push({ name: "Newsletters", subfolders: [] } as Folder);
      options.selectedFolders = ["News"];
      build();

      expect(
        feedRow("https://n.test/feed").classList.contains("multi-selected"),
      ).toBe(false);
    });

    it("treats missing selection and collapsed lists as empty", () => {
      delete options.selectedFeeds;
      (options as { selectedFolders?: string[] }).selectedFolders = undefined;
      (settings as { collapsedFolders?: string[] }).collapsedFolders = undefined;
      build();

      const row = feedRow("https://a.test/feed");
      expect(row.classList.contains("multi-selected")).toBe(false);
      expect(folderHeader("News").classList.contains("collapsed")).toBe(false);

      const feedDrag = makeDataTransfer();
      drag(row, "dragstart", feedDrag);
      expect(feedDrag.store["feed-urls"]).toBe(
        JSON.stringify(["https://a.test/feed"]),
      );
      expect(feedDrag.store["folder-paths"]).toBeUndefined();

      const folderDrag = makeDataTransfer();
      drag(folderHeader("News"), "dragstart", folderDrag);
      expect(folderDrag.store["folder-paths"]).toBe(JSON.stringify(["News"]));
      expect(folderDrag.store["feed-urls"]).toBeUndefined();
    });

    it("shows the unread count only when badges are on and the count is above zero", () => {
      settings.feeds[1] = makeFeed("Beta", "https://b.test/feed", "News", 0);
      settings.feeds[0] = makeFeed("Alpha", "https://a.test/feed", "News", 3);
      build();

      const count = (url: string) =>
        feedRow(url).querySelector(".rss-dashboard-feed-unread-count");
      expect(count("https://a.test/feed")?.textContent).toBe("3");
      expect(count("https://b.test/feed")).toBeNull();

      container.empty();
      settings.display.showFeedUnreadBadges = false;
      sidebar.render();
      expect(count("https://a.test/feed")).toBeNull();
    });

    it("shows a shard warning icon when the feed's shard is unhealthy, unless the shard folder is hidden from sync", () => {
      plugin.getFeedShardHealth = (feed) =>
        feed.url === "https://a.test/feed" ? "missing" : null;
      build();

      const badge = (url: string) =>
        feedRow(url).querySelector(".rss-dashboard-feed-shard-warning-badge");
      expect((badge("https://a.test/feed") as HTMLElement).dataset.icon).toBe(
        "alert-triangle",
      );
      expect(badge("https://b.test/feed")).toBeNull();

      container.empty();
      plugin.isShardFolderHiddenFromSync = true;
      sidebar.render();
      expect(badge("https://a.test/feed")).toBeNull();
    });

    it("shows the fetch error badge with the error as its label, unless badges are hidden", () => {
      settings.feeds[0].lastFetchError = "HTTP 500";
      build();

      const badge = () =>
        feedRow("https://a.test/feed").querySelector<HTMLElement>(
          ".rss-dashboard-feed-error-badge",
        );
      expect(badge()?.getAttribute("aria-label")).toBe("Feed error: HTTP 500");
      expect(badge()?.dataset.icon).toBe("alert-circle");

      container.empty();
      settings.display.hideFeedFetchErrorBadges = true;
      sidebar.render();
      expect(badge()).toBeNull();
    });
  });

  describe("feed row: icon", () => {
    const icon = (url: string) =>
      feedRow(url).querySelector(".rss-dashboard-feed-icon") as HTMLElement;

    it("shows a spinner on a feed with no articles that is being imported", () => {
      settings.feeds[0].items = [];
      plugin.backgroundImportQueue = [
        { url: "https://a.test/feed", importStatus: "processing" },
      ];
      build();

      expect(icon("https://a.test/feed").dataset.icon).toBe("loader-2");
      expect(icon("https://a.test/feed").classList.contains("processing")).toBe(
        true,
      );
      expect(
        feedRow("https://a.test/feed").classList.contains("processing-feed"),
      ).toBe(true);
      expect(
        feedRow("https://a.test/feed").querySelector(
          ".rss-dashboard-feed-processing-indicator",
        ),
      ).toBeNull();
    });

    it("shows a spinner on a feed that is being refreshed", () => {
      plugin.activeRefreshState = new Map([
        ["https://a.test/feed", { status: "processing" }],
      ]);
      build();

      expect(icon("https://a.test/feed").dataset.icon).toBe("loader-2");
      expect(
        feedRow("https://a.test/feed").classList.contains("processing-feed"),
      ).toBe(true);
    });

    it("shows the queued-for-import hourglass, and prefers it to the queued-for-refresh one", () => {
      settings.feeds[0].items = [];
      plugin.backgroundImportQueue = [
        { url: "https://a.test/feed", importStatus: "pending" },
      ];
      plugin.activeRefreshState = new Map([
        ["https://a.test/feed", { status: "pending" }],
      ]);
      build();

      const indicators = feedRow("https://a.test/feed").querySelectorAll(
        ".rss-dashboard-feed-processing-indicator",
      );
      expect(indicators).toHaveLength(1);
      expect(indicators[0].textContent).toBe("⏳");
      expect(indicators[0].getAttribute("aria-label")).toBe(
        "Articles being fetched in background",
      );
      expect(icon("https://a.test/feed").dataset.icon).toBe("rss");
    });

    it("shows the queued-for-refresh hourglass for a pending refresh", () => {
      plugin.activeRefreshState = new Map([
        ["https://a.test/feed", { status: "pending" }],
      ]);
      build();

      const indicator = feedRow("https://a.test/feed").querySelector(
        ".rss-dashboard-feed-processing-indicator",
      );
      expect(indicator?.getAttribute("aria-label")).toBe(
        "Feed queued for refresh",
      );
    });

    it("ignores an import queue entry for a feed that already has articles", () => {
      plugin.backgroundImportQueue = [
        { url: "https://a.test/feed", importStatus: "processing" },
      ];
      build();

      expect(icon("https://a.test/feed").dataset.icon).toBe("rss");
      expect(
        feedRow("https://a.test/feed").querySelector(
          ".rss-dashboard-feed-processing-indicator",
        ),
      ).toBeNull();
    });

    it("shows a play icon for a YouTube video feed and a mic for a podcast feed", () => {
      settings.feeds[0] = {
        ...makeFeed("Tube", "https://www.youtube.com/feeds/videos.xml?channel_id=UC1", "News"),
        mediaType: "video",
      } as Feed;
      settings.feeds[1] = {
        ...makeFeed("Pod", "https://pod.test/feed", "News"),
        mediaType: "podcast",
      } as Feed;
      build();

      const tube = feedRow(
        "https://www.youtube.com/feeds/videos.xml?channel_id=UC1",
      );
      expect(tube.classList.contains("video-feed")).toBe(true);
      expect(
        (tube.querySelector(".rss-dashboard-feed-icon") as HTMLElement).dataset
          .icon,
      ).toBe("play");
      expect(
        tube
          .querySelector(".rss-dashboard-feed-icon")
          ?.classList.contains("video"),
      ).toBe(true);

      const pod = feedRow("https://pod.test/feed");
      expect(pod.classList.contains("podcast-feed")).toBe(true);
      expect(icon("https://pod.test/feed").dataset.icon).toBe("mic");
      expect(icon("https://pod.test/feed").classList.contains("podcast")).toBe(
        true,
      );
    });

    it("draws the feed's own icon image when domain icons are on and the feed has one", () => {
      settings.display.useDomainIconsRss = true;
      settings.feeds[0].iconUrl = "https://a.test/icon.png";
      build();

      const img = icon("https://a.test/feed").querySelector(
        "img.rss-dashboard-feed-icon-img",
      ) as HTMLImageElement;
      expect(img.getAttribute("src")).toBe("https://a.test/icon.png");
      expect(img.getAttribute("alt")).toBe("Alpha");
    });

    it("falls back to the RSS icon when the feed's own icon fails to load, and remembers the failure", () => {
      settings.display.useDomainIconsRss = true;
      settings.feeds[0].iconUrl = "https://a.test/icon.png";
      build();
      const img = icon("https://a.test/feed").querySelector(
        "img",
      ) as HTMLImageElement;

      img.onerror?.(new Event("error"));

      expect(failedFeedIconUrls.has("https://a.test/icon.png")).toBe(true);
      expect(icon("https://a.test/feed").querySelector("img")).toBeNull();
      expect(icon("https://a.test/feed").dataset.icon).toBe("rss");

      // A rebuilt row skips the image that failed.
      container.empty();
      sidebar.render();
      expect(icon("https://a.test/feed").querySelector("img")).toBeNull();
      expect(icon("https://a.test/feed").dataset.icon).toBe("rss");
    });

    it("draws the site favicon for a feed with no icon when domain icons are on", () => {
      settings.display.useDomainIconsRss = true;
      build();

      const img = icon("https://a.test/feed").querySelector(
        "img.rss-dashboard-feed-favicon",
      ) as HTMLImageElement;
      expect(img.getAttribute("src")).toBe(
        "https://www.google.com/s2/favicons?sz=32&domain_url=http://a.test",
      );
    });

    it("draws the site favicon for a resolved Mastodon feed, even with domain icons off", () => {
      settings.feeds[0] = makeFeed(
        "Toots",
        "https://social.test/@someone.rss",
        "News",
      );
      build();

      const img = icon("https://social.test/@someone.rss").querySelector(
        "img.rss-dashboard-feed-favicon",
      ) as HTMLImageElement;
      expect(img.getAttribute("src")).toContain("domain_url=http://social.test");
    });

    it("falls back to the RSS icon when a feed's url has no domain to take a favicon from", () => {
      settings.display.useDomainIconsRss = true;
      settings.feeds[0] = makeFeed("Odd", "not a url", "News");
      build();

      expect(icon("not a url").querySelector("img")).toBeNull();
      expect(icon("not a url").dataset.icon).toBe("rss");
    });

    it("shows the generic RSS icon by default, and an empty hidden icon when the default is hidden", () => {
      build();
      expect(icon("https://a.test/feed").dataset.icon).toBe("rss");

      container.empty();
      settings.display.hideDefaultRssIcon = true;
      sidebar.render();
      expect(icon("https://a.test/feed").dataset.icon).toBeUndefined();
      expect(
        icon("https://a.test/feed").classList.contains("rss-icon-hidden"),
      ).toBe(true);
    });
  });

  describe("folder row: click", () => {
    it("toggles a folder from the chevron without opening it", () => {
      build();
      const header = folderHeader("News");
      const toggle = header.querySelector(
        ".rss-dashboard-feed-folder-toggle",
      ) as HTMLElement;
      const list = folderFeedsList("News");
      expect(toggle.dataset.icon).toBe("chevron-down");
      expect(toggle.getAttribute("aria-label")).toBe("Collapse folder");

      const { reachedContainer } = click(toggle);

      expect(header.classList.contains("collapsed")).toBe(true);
      expect(list.classList.contains("collapsed")).toBe(true);
      expect(toggle.dataset.icon).toBe("chevron-right");
      expect(toggle.getAttribute("aria-label")).toBe("Expand folder");
      expect(callbacks.onToggleFolderCollapse).toHaveBeenCalledWith(
        "News",
        false,
      );
      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
      expect(reachedContainer).toBe(true);

      click(toggle);

      expect(header.classList.contains("collapsed")).toBe(false);
      expect(list.classList.contains("collapsed")).toBe(false);
      expect(toggle.dataset.icon).toBe("chevron-down");
      expect(toggle.getAttribute("aria-label")).toBe("Collapse folder");
      expect(callbacks.onToggleFolderCollapse).toHaveBeenCalledTimes(2);
    });

    it("opens an empty folder when its chevron is clicked, instead of toggling it", () => {
      build();
      const header = folderHeader("Empty");
      const toggle = header.querySelector(
        ".rss-dashboard-feed-folder-toggle",
      ) as HTMLElement;

      click(toggle);

      expect(callbacks.onFolderClick).toHaveBeenCalledWith("Empty");
      expect(callbacks.onToggleFolderCollapse).not.toHaveBeenCalled();
      expect(header.classList.contains("collapsed")).toBe(false);
    });

    it("handles a chevron click before Shift or Ctrl, so a Shift click on the chevron still toggles", () => {
      build();
      const toggle = folderHeader("News").querySelector(
        ".rss-dashboard-feed-folder-toggle",
      ) as HTMLElement;

      click(toggle, { shiftKey: true });
      click(toggle, { ctrlKey: true });

      expect(callbacks.onToggleFolderCollapse).toHaveBeenCalledTimes(2);
      expect(callbacks.onRangeSelect).not.toHaveBeenCalled();
      expect(callbacks.onFolderMultiSelect).not.toHaveBeenCalled();
    });

    it("opens the folder on a plain click", () => {
      build();

      click(folderHeader("News"));

      expect(callbacks.onFolderClick).toHaveBeenCalledTimes(1);
      expect(callbacks.onFolderClick).toHaveBeenCalledWith("News");
    });

    it("ignores clicks from a button other than the primary one", () => {
      build();
      const header = folderHeader("News");

      click(header, { button: 1 });
      click(header, { button: 2, shiftKey: true });
      click(header, { button: 1, ctrlKey: true });

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
      expect(callbacks.onRangeSelect).not.toHaveBeenCalled();
      expect(callbacks.onFolderMultiSelect).not.toHaveBeenCalled();
    });

    it("sends a Shift click to onRangeSelect with the folder key and the visible row keys", () => {
      build();

      click(folderHeader("News/Tech"), { shiftKey: true });

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
      const [clickedKey, visibleKeys] = vi.mocked(callbacks.onRangeSelect!).mock
        .calls[0];
      expect(clickedKey).toBe("folder:News/Tech");
      expect(visibleKeys).toContain("feed:https://root.test/feed");
      expect(visibleKeys[0]).toBe("all-feeds");
    });

    it("ignores a Shift click quietly when the caller gave no onRangeSelect", () => {
      delete callbacks.onRangeSelect;
      build();

      click(folderHeader("News"), { shiftKey: true });

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });

    it("toggles a folder into the selection on Ctrl or Meta click, starting from the selected folders", () => {
      options.selectedFolders = ["Empty"];
      build();

      click(folderHeader("News"), { ctrlKey: true });
      expect(callbacks.onFolderMultiSelect).toHaveBeenLastCalledWith([
        "Empty",
        "News",
      ]);

      click(folderHeader("Empty"), { metaKey: true });
      expect(callbacks.onFolderMultiSelect).toHaveBeenLastCalledWith([]);

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
      expect(options.selectedFolders).toEqual(["Empty"]);
    });

    it("starts a Ctrl click from the open folder when no folders are selected", () => {
      options.currentFolder = "Empty";
      build();

      click(folderHeader("News"), { ctrlKey: true });
      expect(callbacks.onFolderMultiSelect).toHaveBeenLastCalledWith([
        "Empty",
        "News",
      ]);

      click(folderHeader("Empty"), { ctrlKey: true });
      expect(callbacks.onFolderMultiSelect).toHaveBeenLastCalledWith([]);
    });

    it("starts a Ctrl click from nothing when no folder is selected or open", () => {
      build();

      click(folderHeader("News"), { ctrlKey: true });

      expect(callbacks.onFolderMultiSelect).toHaveBeenLastCalledWith(["News"]);
    });

    it("swallows a Ctrl click without opening the folder when the caller gave no onFolderMultiSelect", () => {
      delete callbacks.onFolderMultiSelect;
      build();

      click(folderHeader("News"), { ctrlKey: true });

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });
  });

  describe("folder row: context menu", () => {
    it("opens the folder menu on contextmenu, cancelling the native menu and the bubble", () => {
      build();
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      let reachedContainer = false;
      container.addEventListener("contextmenu", () => {
        reachedContainer = true;
      });

      folderHeader("News/Tech").dispatchEvent(event);

      expect(spies.showFolderContextMenu).toHaveBeenCalledTimes(1);
      const [sentEvent, folder, path, name] =
        spies.showFolderContextMenu.mock.calls[0];
      expect(sentEvent).toBe(event);
      expect(folder).toBe(settings.folders[0].subfolders[0]);
      expect(path).toBe("News/Tech");
      expect(name).toBe("Tech");
      expect(event.defaultPrevented).toBe(true);
      expect(reachedContainer).toBe(false);
    });

    it("opens the folder menu after a 500 ms touch press", () => {
      vi.useFakeTimers();
      build();

      folderHeader("News").dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerType: "touch",
          clientX: 5,
          clientY: 6,
        }),
      );
      vi.advanceTimersByTime(500);

      expect(spies.showFolderContextMenu).toHaveBeenCalledTimes(1);
      const [event, folder, path, name] =
        spies.showFolderContextMenu.mock.calls[0];
      expect(event.type).toBe("contextmenu");
      expect(event.clientX).toBe(5);
      expect(event.clientY).toBe(6);
      expect(folder).toBe(settings.folders[0]);
      expect(path).toBe("News");
      expect(name).toBe("News");
    });

    it("does not open the menu for a mouse press, or when the press ends first", () => {
      vi.useFakeTimers();
      build();
      const header = folderHeader("News");

      header.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
      );
      vi.advanceTimersByTime(600);
      header.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
      );
      vi.advanceTimersByTime(300);
      header.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      vi.advanceTimersByTime(600);

      expect(spies.showFolderContextMenu).not.toHaveBeenCalled();
    });

    it("swallows the click that follows a long press before it reaches onFolderClick", () => {
      vi.useFakeTimers();
      build();
      const header = folderHeader("News");
      header.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
      );
      vi.advanceTimersByTime(500);

      const { event, reachedContainer } = click(header);

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      expect(reachedContainer).toBe(false);

      click(header);
      expect(callbacks.onFolderClick).toHaveBeenCalledWith("News");
    });
  });

  describe("folder row: dragstart", () => {
    it("drags just this folder when nothing is selected", () => {
      build();
      const dt = makeDataTransfer();

      drag(folderHeader("News"), "dragstart", dt);

      expect(dt.store["folder-path"]).toBe("News");
      expect(dt.store["folder-paths"]).toBe(JSON.stringify(["News"]));
      expect(dt.store["feed-urls"]).toBeUndefined();
      expect(dt.effectAllowed).toBe("move");
    });

    it("drags every selected folder when this one is among them", () => {
      options.selectedFolders = ["Empty", "News"];
      build();
      const dt = makeDataTransfer();

      drag(folderHeader("News"), "dragstart", dt);

      expect(dt.store["folder-path"]).toBe("News");
      expect(dt.store["folder-paths"]).toBe(JSON.stringify(["Empty", "News"]));
    });

    it("adds an unselected folder to the selection array in place, then drags the whole selection", () => {
      const selection = ["Empty"];
      options.selectedFolders = selection;
      build();
      const dt = makeDataTransfer();

      drag(folderHeader("News"), "dragstart", dt);

      expect(selection).toEqual(["Empty", "News"]);
      expect(options.selectedFolders).toBe(selection);
      expect(dt.store["folder-paths"]).toBe(JSON.stringify(["Empty", "News"]));
    });

    it("also carries the selected feeds as feed-urls", () => {
      options.selectedFeeds = ["https://a.test/feed"];
      build();
      const dt = makeDataTransfer();

      drag(folderHeader("News"), "dragstart", dt);

      expect(dt.store["feed-urls"]).toBe(
        JSON.stringify(["https://a.test/feed"]),
      );
      expect(dt.store["feed-url"]).toBeUndefined();
    });

    it("does nothing when the event has no dataTransfer", () => {
      options.selectedFolders = ["Empty"];
      build();

      expect(() => drag(folderHeader("News"), "dragstart", null)).not.toThrow();
      expect(options.selectedFolders).toEqual(["Empty"]);
    });
  });

  describe("folder row: dragover and dragleave", () => {
    const FOLDER_DRAG = { "folder-path": "Empty", "folder-paths": "[]" };

    it("marks the top quarter as before, the bottom quarter as after, and the middle as nest, for a folder drag", () => {
      build();
      const header = folderHeader("News");
      giveRowBox(header);
      const dt = makeDataTransfer(FOLDER_DRAG);
      const classes = () =>
        ["drag-over", "drag-over-before", "drag-over-after", "drag-over-nest"]
          .filter((cls) => header.classList.contains(cls))
          .join(",");

      const first = drag(header, "dragover", dt, 105);
      expect(classes()).toBe("drag-over-before");
      expect(first.event.defaultPrevented).toBe(true);
      expect(first.reachedContainer).toBe(false);

      drag(header, "dragover", dt, 135);
      expect(classes()).toBe("drag-over-after");

      drag(header, "dragover", dt, 120);
      expect(classes()).toBe("drag-over-nest");
    });

    it("puts the exact quarter lines in the middle band", () => {
      build();
      const header = folderHeader("News");
      giveRowBox(header);
      const dt = makeDataTransfer(FOLDER_DRAG);

      drag(header, "dragover", dt, 110);
      expect(header.classList.contains("drag-over-nest")).toBe(true);
      drag(header, "dragover", dt, 130);
      expect(header.classList.contains("drag-over-nest")).toBe(true);
    });

    it("treats a row with no height as the middle band", () => {
      build();
      const header = folderHeader("News");
      giveRowBox(header, 0);

      drag(header, "dragover", makeDataTransfer(FOLDER_DRAG), 100);

      expect(header.classList.contains("drag-over-nest")).toBe(true);
    });

    it("marks a feed drag with the plain drag-over class", () => {
      build();
      const header = folderHeader("News");
      giveRowBox(header);

      drag(header, "dragover", makeDataTransfer({ "feed-urls": "[]" }), 105);
      expect(header.classList.contains("drag-over")).toBe(true);
      expect(header.classList.contains("drag-over-before")).toBe(false);

      header.classList.remove("drag-over");
      drag(header, "dragover", makeDataTransfer({ "feed-url": "x" }), 105);
      expect(header.classList.contains("drag-over")).toBe(true);
    });

    it("lets a folder drag win when the payload carries both a folder and a feed", () => {
      build();
      const header = folderHeader("News");
      giveRowBox(header);

      drag(
        header,
        "dragover",
        makeDataTransfer({ "folder-paths": "[]", "feed-urls": "[]" }),
        105,
      );

      expect(header.classList.contains("drag-over-before")).toBe(true);
      expect(header.classList.contains("drag-over")).toBe(false);
    });

    it("cancels and stops any dragover with a payload but marks nothing for an unrelated drag, leaving old markers in place", () => {
      build();
      const header = folderHeader("News");
      giveRowBox(header);
      header.classList.add("drag-over-after");

      const unrelated = drag(
        header,
        "dragover",
        makeDataTransfer({ "text/plain": "x" }),
        105,
      );
      const noPayload = drag(header, "dragover", null, 105);

      expect(unrelated.event.defaultPrevented).toBe(true);
      expect(unrelated.reachedContainer).toBe(false);
      expect(header.classList.contains("drag-over-after")).toBe(true);
      expect(noPayload.event.defaultPrevented).toBe(false);
      expect(noPayload.reachedContainer).toBe(true);
    });

    it("clears all four markers on dragleave and stops the event", () => {
      build();
      const header = folderHeader("News");
      header.classList.add(
        "drag-over",
        "drag-over-before",
        "drag-over-after",
        "drag-over-nest",
      );

      const { reachedContainer } = drag(header, "dragleave", null);

      for (const cls of [
        "drag-over",
        "drag-over-before",
        "drag-over-after",
        "drag-over-nest",
      ]) {
        expect(header.classList.contains(cls)).toBe(false);
      }
      expect(reachedContainer).toBe(false);
    });
  });

  describe("folder row: drop", () => {
    it("batch-moves dropped feeds, with any dragged folders, into the folder", () => {
      build();
      const header = folderHeader("Empty");
      header.classList.add("drag-over", "drag-over-nest");

      const { event, reachedContainer } = drag(
        header,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify(["https://a.test/feed"]),
          "folder-paths": JSON.stringify(["Videos"]),
        }),
        120,
      );

      expect(spies.batchMove).toHaveBeenCalledTimes(1);
      expect(spies.batchMove).toHaveBeenCalledWith(
        "Empty",
        ["https://a.test/feed"],
        ["Videos"],
      );
      expect(event.defaultPrevented).toBe(true);
      expect(reachedContainer).toBe(false);
      expect(header.classList.contains("drag-over")).toBe(false);
      expect(header.classList.contains("drag-over-nest")).toBe(false);
    });

    it("batch-moves several dragged folders into the folder", () => {
      build();

      drag(
        folderHeader("News"),
        "drop",
        makeDataTransfer({
          "folder-paths": JSON.stringify(["Empty", "Videos"]),
          "folder-path": "Empty",
        }),
        120,
      );

      expect(spies.batchMove).toHaveBeenCalledWith(
        "News",
        [],
        ["Empty", "Videos"],
      );
    });

    it("clears the markers and does nothing else when the drop carries no payload or an empty one", () => {
      build();
      const header = folderHeader("News");
      header.classList.add("drag-over-before");

      const noPayload = drag(header, "drop", null);
      header.classList.add("drag-over-before");
      const empty = drag(header, "drop", makeDataTransfer({ "text/plain": "x" }));

      expect(noPayload.event.defaultPrevented).toBe(true);
      expect(empty.event.defaultPrevented).toBe(true);
      expect(header.classList.contains("drag-over-before")).toBe(false);
      expect(spies.batchMove).not.toHaveBeenCalled();
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(notices()).toEqual([]);
    });

    it("nests a single dragged folder into the target when dropped in the middle band", async () => {
      build();
      const header = folderHeader("News");
      giveRowBox(header);

      drag(
        header,
        "drop",
        makeDataTransfer({ "folder-path": "Empty" }),
        120,
      );

      expect(settings.folders.map((f) => f.name)).toEqual(["News", "Videos"]);
      expect(settings.folders[0].subfolders.map((f) => f.name)).toEqual([
        "Tech",
        "Empty",
      ]);
      expect(spies.batchMove).not.toHaveBeenCalled();
      await flushPromises();
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it("places a single dragged folder before or after the target from the top or bottom quarter", () => {
      build();
      const header = folderHeader("News");
      giveRowBox(header);

      drag(header, "drop", makeDataTransfer({ "folder-path": "Videos" }), 105);
      expect(settings.folders.map((f) => f.name)).toEqual([
        "Videos",
        "News",
        "Empty",
      ]);

      drag(header, "drop", makeDataTransfer({ "folder-path": "Videos" }), 135);
      expect(settings.folders.map((f) => f.name)).toEqual([
        "News",
        "Videos",
        "Empty",
      ]);
    });

    it("re-renders after the move is saved", async () => {
      build();
      const render = vi.spyOn(sidebar, "render");
      const header = folderHeader("News");
      giveRowBox(header);

      drag(header, "drop", makeDataTransfer({ "folder-path": "Empty" }), 120);

      expect(render).not.toHaveBeenCalled();
      await flushPromises();
      expect(render).toHaveBeenCalledTimes(1);
    });

    it("shows the reason as a notice and changes nothing when the move is refused", async () => {
      build();
      const header = folderHeader("News/Tech");
      giveRowBox(header);

      drag(header, "drop", makeDataTransfer({ "folder-path": "News" }), 120);
      await flushPromises();

      expect(notices()).toEqual([
        "Cannot move a folder into itself or a descendant.",
      ]);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(settings.folders.map((f) => f.name)).toEqual([
        "News",
        "Empty",
        "Videos",
      ]);
    });

    it("keeps the open folder open under its new path when it, or a folder inside it, is moved", () => {
      options.currentFolder = "Videos/Clips";
      build();
      const header = folderHeader("News");
      giveRowBox(header);

      drag(header, "drop", makeDataTransfer({ "folder-path": "Videos" }), 120);

      expect(callbacks.onFolderClick).toHaveBeenCalledTimes(1);
      expect(callbacks.onFolderClick).toHaveBeenCalledWith(
        "News/Videos/Clips",
      );
    });

    it("remaps the open folder when it is the moved folder itself", () => {
      options.currentFolder = "Videos";
      build();
      const header = folderHeader("News");
      giveRowBox(header);

      drag(header, "drop", makeDataTransfer({ "folder-path": "Videos" }), 120);

      expect(callbacks.onFolderClick).toHaveBeenCalledWith("News/Videos");
    });

    it("leaves the open folder alone when an unrelated folder is moved, or when one with a similar name is", () => {
      options.currentFolder = "Videos2";
      build();
      const header = folderHeader("News");
      giveRowBox(header);

      drag(header, "drop", makeDataTransfer({ "folder-path": "Videos" }), 120);

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });
  });

  describe("folder row: feed list drop zone", () => {
    it("lights up on dragover, stopping the event, and clears on dragleave", () => {
      build();
      const list = folderFeedsList("News");

      const over = drag(list, "dragover", makeDataTransfer());
      expect(over.event.defaultPrevented).toBe(true);
      expect(over.reachedContainer).toBe(false);
      expect(list.classList.contains("drag-over")).toBe(true);

      const leave = drag(list, "dragleave", null);
      expect(leave.reachedContainer).toBe(false);
      expect(list.classList.contains("drag-over")).toBe(false);
    });

    it("batch-moves dropped feeds and folders into the folder", () => {
      build();
      const list = folderFeedsList("Empty");
      list.classList.add("drag-over");

      const { event, reachedContainer } = drag(
        list,
        "drop",
        makeDataTransfer({
          "feed-urls": JSON.stringify(["https://a.test/feed"]),
          "folder-paths": JSON.stringify(["Videos"]),
        }),
      );

      expect(spies.batchMove).toHaveBeenCalledWith(
        "Empty",
        ["https://a.test/feed"],
        ["Videos"],
      );
      expect(event.defaultPrevented).toBe(true);
      expect(reachedContainer).toBe(false);
      expect(list.classList.contains("drag-over")).toBe(false);
    });

    it("batch-moves a single dragged folder, which the header's own drop would nest or reorder instead", () => {
      build();

      drag(
        folderFeedsList("News"),
        "drop",
        makeDataTransfer({ "folder-path": "Empty" }),
      );

      expect(spies.batchMove).toHaveBeenCalledWith("News", [], ["Empty"]);
    });

    it("does nothing for an empty payload or none", () => {
      build();
      const list = folderFeedsList("News");

      drag(list, "drop", makeDataTransfer({ "text/plain": "x" }));
      drag(list, "drop", null);

      expect(spies.batchMove).not.toHaveBeenCalled();
    });
  });

  describe("folder row: appearance and contents", () => {
    it("carries its name and path and is draggable", () => {
      build();

      const header = folderHeader("News/Tech");

      expect(header.getAttribute("draggable")).toBe("true");
      expect(header.getAttribute("data-folder-name")).toBe("Tech");
      expect(header.getAttribute("tabindex")).toBe("-1");
      expect(
        header.querySelector(".rss-dashboard-feed-folder-name")?.textContent,
      ).toBe("Tech");
    });

    it("shows an expanded chevron, or a collapsed one for a folder in collapsedFolders, with the matching labels and lists", () => {
      settings.collapsedFolders = ["News"];
      build();

      const news = folderHeader("News");
      const toggle = news.querySelector(
        ".rss-dashboard-feed-folder-toggle",
      ) as HTMLElement;
      expect(news.classList.contains("collapsed")).toBe(true);
      expect(folderFeedsList("News").classList.contains("collapsed")).toBe(true);
      expect(toggle.dataset.icon).toBe("chevron-right");
      expect(toggle.getAttribute("aria-label")).toBe("Expand folder");

      const tech = folderHeader("News/Tech");
      expect(tech.classList.contains("collapsed")).toBe(false);
      expect(
        (
          tech.querySelector(".rss-dashboard-feed-folder-toggle") as HTMLElement
        ).dataset.icon,
      ).toBe("chevron-down");
    });

    it("marks the open folder, and a folder holding the open feed, as active", () => {
      options.currentFolder = "Empty";
      options.currentFeed = settings.feeds[2];
      build();

      expect(folderHeader("Empty").classList.contains("active")).toBe(true);
      expect(folderHeader("News/Tech").classList.contains("active")).toBe(true);
      expect(folderHeader("News").classList.contains("active")).toBe(false);
    });

    it("marks selected folders as multi-selected", () => {
      options.selectedFolders = ["News"];
      build();

      expect(folderHeader("News").classList.contains("multi-selected")).toBe(
        true,
      );
      expect(folderHeader("Empty").classList.contains("multi-selected")).toBe(
        false,
      );
    });

    it("shows a lock for a pinned folder and an unread badge that counts feeds in subfolders", () => {
      settings.feeds[2] = makeFeed("Gamma", "https://c.test/feed", "News/Tech", 4);
      build();

      expect(
        folderHeader("Videos").querySelector(".rss-dashboard-folder-pin-icon")
          ?.getAttribute("data-icon"),
      ).toBe("lock");
      expect(
        folderHeader("News").querySelector(".rss-dashboard-folder-pin-icon"),
      ).toBeNull();
      const badge = (path: string) =>
        folderHeader(path).querySelector(".rss-dashboard-folder-unread-count");
      expect(badge("News")?.textContent).toBe("6");
      expect(badge("News/Tech")?.textContent).toBe("4");
      expect(badge("Empty")).toBeNull();

      container.empty();
      settings.display.showFolderUnreadBadges = false;
      sidebar.render();
      expect(badge("News")).toBeNull();
    });

    it("nests subfolders and feeds inside the folder's feed list, subfolders first", () => {
      build();

      const list = folderFeedsList("News");
      const children = Array.from(list.children) as HTMLElement[];

      expect(children[0].classList.contains("rss-dashboard-feed-folder")).toBe(
        true,
      );
      expect(
        children[0]
          .querySelector(".rss-dashboard-feed-folder-header")
          ?.getAttribute("data-folder-path"),
      ).toBe("News/Tech");
      expect(children.slice(1).map((el) => el.dataset.feedUrl)).toEqual([
        "https://a.test/feed",
        "https://b.test/feed",
      ]);
    });

    it("orders a folder's feeds by its own sort order when one is set", () => {
      settings.folderFeedSortOrders = {
        News: { by: "name", ascending: false },
      } as RssDashboardSettings["folderFeedSortOrders"];
      build();

      const urls = Array.from(folderFeedsList("News").children)
        .map((el) => (el as HTMLElement).dataset.feedUrl)
        .filter(Boolean);

      expect(urls).toEqual(["https://b.test/feed", "https://a.test/feed"]);
    });

    it("keeps the feeds in settings order when the folder has no sort order", () => {
      settings.feeds = [
        makeFeed("Zed", "https://z.test/feed", "News"),
        makeFeed("Ann", "https://ann.test/feed", "News"),
      ];
      build();

      const urls = Array.from(folderFeedsList("News").children)
        .map((el) => (el as HTMLElement).dataset.feedUrl)
        .filter(Boolean);

      expect(urls).toEqual(["https://z.test/feed", "https://ann.test/feed"]);
    });

    it("orders subfolders by the folder sort order", () => {
      settings.folders[0].subfolders = [
        { name: "Alpha", subfolders: [] },
        { name: "Beta", subfolders: [] },
      ] as Folder[];
      settings.folderSortOrder = { by: "name", ascending: false };
      build();

      const paths = Array.from(
        folderFeedsList("News").querySelectorAll(
          ".rss-dashboard-feed-folder-header",
        ),
      ).map((el) => el.getAttribute("data-folder-path"));

      expect(paths).toEqual(["News/Beta", "News/Alpha"]);
    });

    it("hides feeds with no unread articles when hide-empty-feeds is on", () => {
      settings.feeds = [
        makeFeed("Unread", "https://u.test/feed", "News", 2),
        makeFeed("None", "https://n.test/feed", "News", 0),
        {
          ...makeFeed("Read", "https://r.test/feed", "News", 0),
          items: [{ read: true }],
        } as unknown as Feed,
      ];
      settings.display.hideEmptyFeeds = true;
      build();

      expect(feedRow("https://u.test/feed")).not.toBeNull();
      expect(feedRow("https://n.test/feed")).toBeNull();
      expect(feedRow("https://r.test/feed")).toBeNull();
    });

    it("applies hide-empty-feeds after the folder sort order", () => {
      settings.feeds = [
        makeFeed("Ann", "https://ann.test/feed", "News", 1),
        makeFeed("Bob", "https://bob.test/feed", "News", 0),
        makeFeed("Cy", "https://cy.test/feed", "News", 1),
      ];
      settings.folderFeedSortOrders = {
        News: { by: "name", ascending: false },
      } as RssDashboardSettings["folderFeedSortOrders"];
      settings.display.hideEmptyFeeds = true;
      build();

      const urls = Array.from(folderFeedsList("News").children)
        .map((el) => (el as HTMLElement).dataset.feedUrl)
        .filter(Boolean);

      expect(urls).toEqual(["https://cy.test/feed", "https://ann.test/feed"]);
    });
  });
});
