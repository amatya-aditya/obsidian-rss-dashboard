/**
 * Characterization tests for `Sidebar.batchMoveFeedsAndFoldersToFolder`,
 * pinned before it is extracted (#609, part of #436). They describe what a
 * batch move does today, quirks included, and must keep passing unchanged
 * through the extraction.
 *
 * Everything runs through `Sidebar.render()` and real drop events (or the
 * "Move selection to folder" menu) on the rendered tree. Notices are read from
 * the stub's log. `moveFeedsToFolderAppend` is wrapped so a test can see what
 * it was asked to move and make it fail; by default it runs for real.
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
import { moveFeedsToFolderAppend } from "../../../src/services/sidebar-ordering-controller";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Wrap the real feed mover so tests can inspect its calls and force a failure.
vi.mock("../../../src/services/sidebar-ordering-controller", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/services/sidebar-ordering-controller")
  >("../../../src/services/sidebar-ordering-controller");
  return { ...actual, moveFeedsToFolderAppend: vi.fn(actual.moveFeedsToFolderAppend) };
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

const SKIPPED_NOTICE = "Skipped moving folder into itself or its subfolder.";

interface TestPlugin {
  settings: RssDashboardSettings;
  saveSettings: ReturnType<typeof vi.fn>;
}

function makeFeed(title: string, url: string, folder: string): Feed {
  return { title, url, folder, items: [], lastUpdated: 0 } as unknown as Feed;
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

function listPayload(feeds: string[], folders: string[] = []): FakeDataTransfer {
  const keys: Record<string, string> = {};
  if (feeds.length > 0) keys["feed-urls"] = JSON.stringify(feeds);
  if (folders.length > 0) keys["folder-paths"] = JSON.stringify(folders);
  return payload(keys);
}

function dropEvent(dataTransfer: FakeDataTransfer | null): DragEvent {
  const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  Object.defineProperty(event, "clientY", { value: 0 });
  return event;
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("Sidebar batch move (characterization)", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;
  let plugin: TestPlugin;
  let sidebar: Sidebar;
  let noticeSpy: MockInstance<typeof console.debug>;
  const moveFeeds = vi.mocked(moveFeedsToFolderAppend);

  function build(): void {
    sidebar = new Sidebar(
      ObsidianStubs.App.createMock() as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();
  }

  const folderHeader = (path: string): HTMLElement =>
    container.querySelector(
      `.rss-dashboard-feed-folder-header[data-folder-path="${path}"]`,
    ) as HTMLElement;
  const folderFeedsList = (path: string): HTMLElement =>
    folderHeader(path).parentElement?.querySelector(
      ":scope > .rss-dashboard-folder-feeds",
    ) as HTMLElement;
  const rootSection = (): HTMLElement =>
    container.querySelector(".rss-dashboard-feed-folders-section") as HTMLElement;
  const feedRow = (url: string): HTMLElement =>
    container.querySelector(`[data-feed-url="${url}"]`) as HTMLElement;

  const feed = (url: string): Feed =>
    settings.feeds.find((f) => f.url === url) as Feed;
  const folderAt = (path: string): Folder | undefined => {
    let list = settings.folders;
    let found: Folder | undefined;
    for (const name of path.split("/")) {
      found = list.find((f) => f.name === name);
      if (!found) return undefined;
      list = found.subfolders;
    }
    return found;
  };
  const rootNames = (): string[] => settings.folders.map((f) => f.name);

  /** Drops a payload on an element and lets the save-then-render chain finish. */
  async function drop(
    el: HTMLElement,
    dataTransfer: FakeDataTransfer | null,
  ): Promise<void> {
    el.dispatchEvent(dropEvent(dataTransfer));
    await flushPromises();
  }

  /** The text of every Notice shown (the stub logs it through console.debug). */
  function notices(): string[] {
    return noticeSpy.mock.calls
      .filter((call) => call[0] === "[Stub Notice]")
      .map((call) => String(call[1]));
  }

  beforeEach(async () => {
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
      onRangeSelect: vi.fn(),
      onFolderMultiSelect: vi.fn(),
      onSelectionCleared: vi.fn(),
    } as unknown as SidebarCallbacks;

    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
    };

    noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(NOW);

    // Run the real feed mover unless a test overrides it.
    moveFeeds.mockReset();
    const actual = await vi.importActual<
      typeof import("../../../src/services/sidebar-ordering-controller")
    >("../../../src/services/sidebar-ordering-controller");
    moveFeeds.mockImplementation(actual.moveFeedsToFolderAppend);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
    document.body.innerHTML = "";
  });

  describe("where a drop reaches the batch move", () => {
    it("moves dropped feeds onto a folder header, appended after the folder's last feed", async () => {
      build();

      await drop(folderHeader("Archive"), listPayload([ALPHA]));

      expect(feed(ALPHA).folder).toBe("Archive");
      // Alpha leaves the front and lands right after Epsilon, the last Archive feed.
      expect(settings.feeds.map((f) => f.url)).toEqual([
        BETA,
        GAMMA,
        DELTA,
        EPSILON,
        ALPHA,
        ROOTED,
      ]);
      expect(notices()).toEqual(['Moved 1 feed to "Archive"']);
    });

    it("moves dropped feeds and folders together onto a folder header", async () => {
      build();

      await drop(folderHeader("Empty"), listPayload([ROOTED], ["Archive"]));

      expect(feed(ROOTED).folder).toBe("Empty");
      expect(folderAt("Empty/Archive/Old")).toBeDefined();
      expect(rootNames()).toEqual(["News", "Empty", "Newsletter"]);
      // Epsilon travelled with its folder.
      expect(feed(EPSILON).folder).toBe("Empty/Archive");
      expect(notices()).toEqual(['Moved 1 feed and 1 folder to "Empty"']);
    });

    it("moves two or more dropped folders onto a folder header", async () => {
      build();

      await drop(folderHeader("News"), listPayload([], ["Archive", "Empty"]));

      expect(folderAt("News")?.subfolders.map((f) => f.name)).toEqual([
        "Tech",
        "Archive",
        "Empty",
      ]);
      expect(rootNames()).toEqual(["News", "Newsletter"]);
      expect(feed(EPSILON).folder).toBe("News/Archive");
      expect(notices()).toEqual(['Moved 2 folders to "News"']);
    });

    it("moves feeds dropped on a deeply nested folder header and names its full path", async () => {
      build();

      await drop(folderHeader("News/Tech/Deep"), listPayload([ROOTED]));

      expect(feed(ROOTED).folder).toBe("News/Tech/Deep");
      expect(notices()).toEqual(['Moved 1 feed to "News/Tech/Deep"']);
    });

    it("moves feeds dropped on a folder's feed list, in the order they sit in settings", async () => {
      build();

      await drop(folderFeedsList("News/Tech"), listPayload([ROOTED, EPSILON]));

      expect(feed(ROOTED).folder).toBe("News/Tech");
      expect(feed(EPSILON).folder).toBe("News/Tech");
      // The payload order is [Rooted, Epsilon]; settings order wins.
      expect(settings.feeds.map((f) => f.url)).toEqual([
        ALPHA,
        BETA,
        GAMMA,
        EPSILON,
        ROOTED,
        DELTA,
      ]);
      expect(notices()).toEqual(['Moved 2 feeds to "News/Tech"']);
    });

    it("sends even a single folder dropped on a feed list through the batch move", async () => {
      build();

      await drop(folderFeedsList("Empty"), listPayload([], ["Archive"]));

      expect(folderAt("Empty/Archive")).toBeDefined();
      expect(notices()).toEqual(['Moved 1 folder to "Empty"']);
    });

    it("reads the single-item payload keys on a feed list drop", async () => {
      build();

      await drop(
        folderFeedsList("Empty"),
        payload({ "feed-url": ROOTED, "folder-path": "Archive" }),
      );

      expect(feed(ROOTED).folder).toBe("Empty");
      expect(folderAt("Empty/Archive")).toBeDefined();
      expect(notices()).toEqual(['Moved 1 feed and 1 folder to "Empty"']);
    });

    it("ignores a feed list drop that carries no feeds or folders", async () => {
      build();

      await drop(folderFeedsList("Empty"), payload({}));
      await drop(folderFeedsList("Empty"), null);

      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(notices()).toEqual([]);
    });

    it("moves feeds and two or more folders dropped on the root area to the root", async () => {
      build();

      await drop(rootSection(), listPayload([ALPHA], ["News/Tech", "Archive/Old"]));

      expect(feed(ALPHA).folder).toBe("");
      expect(rootNames()).toEqual([
        "News",
        "Archive",
        "Empty",
        "Newsletter",
        "Tech",
        "Old",
      ]);
      expect(feed(GAMMA).folder).toBe("Tech");
      expect(feed(DELTA).folder).toBe("Tech/Deep");
      expect(notices()).toEqual(['Moved 1 feed and 2 folders to root']);
    });

    it("moves a lone dragged feed dropped on the root area to the root", async () => {
      build();

      await drop(rootSection(), payload({ "feed-url": GAMMA }));

      expect(feed(GAMMA).folder).toBe("");
      expect(notices()).toEqual(["Moved 1 feed to root"]);
    });

    it("runs the move once for a drop on a folder header, not again from the root area", async () => {
      build();

      // The header handler stops the event, so the root area never sees it.
      await drop(folderHeader("Empty"), listPayload([ROOTED]));

      expect(feed(ROOTED).folder).toBe("Empty");
      expect(notices()).toEqual(['Moved 1 feed to "Empty"']);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe("notice wording", () => {
    it("uses singular for one feed and plural for several", async () => {
      build();

      await drop(folderHeader("Empty"), listPayload([ALPHA]));
      expect(notices()).toEqual(['Moved 1 feed to "Empty"']);

      noticeSpy.mockClear();
      await drop(folderHeader("Empty"), listPayload([BETA, GAMMA]));
      expect(notices()).toEqual(['Moved 2 feeds to "Empty"']);
    });

    it("uses plural for several folders", async () => {
      build();

      await drop(folderHeader("News"), listPayload([], ["Archive", "Empty"]));

      expect(notices()).toEqual(['Moved 2 folders to "News"']);
    });

    it("uses singular for one folder, which only a mixed selection can send", async () => {
      build();

      await drop(folderHeader("Newsletter"), listPayload([ROOTED], ["Empty"]));

      expect(notices()).toEqual(['Moved 1 feed and 1 folder to "Newsletter"']);
    });

    it("lists feeds before folders, each with its own count", async () => {
      build();

      await drop(
        folderHeader("Empty"),
        listPayload([ALPHA, BETA, ROOTED], ["Archive", "Newsletter"]),
      );

      expect(notices()).toEqual(['Moved 3 feeds and 2 folders to "Empty"']);
    });

    it("labels the root destination 'root' without quotes", async () => {
      build();

      await drop(rootSection(), listPayload([ALPHA, BETA]));

      expect(notices()).toEqual(["Moved 2 feeds to root"]);
    });

    it("shows no moved notice when nothing moved", async () => {
      build();

      await drop(folderHeader("News"), listPayload([ALPHA, BETA]));

      expect(notices()).toEqual([]);
    });
  });

  describe("folders skipped for being the destination or its ancestor", () => {
    it("skips a folder dropped on its own descendant but still moves the feeds", async () => {
      build();

      await drop(folderHeader("News/Tech"), listPayload([ROOTED], ["News"]));

      expect(rootNames()).toEqual(["News", "Archive", "Empty", "Newsletter"]);
      expect(feed(ROOTED).folder).toBe("News/Tech");
      expect(notices()).toEqual([SKIPPED_NOTICE, 'Moved 1 feed to "News/Tech"']);
    });

    it("skips a folder dropped on itself", async () => {
      build();

      await drop(folderHeader("News"), listPayload([ROOTED], ["News"]));

      expect(rootNames()).toEqual(["News", "Archive", "Empty", "Newsletter"]);
      expect(feed(ROOTED).folder).toBe("News");
      expect(notices()).toEqual([SKIPPED_NOTICE, 'Moved 1 feed to "News"']);
    });

    it("shows the skip notice once however many folders were skipped, and before the moved notice", async () => {
      build();

      await drop(
        folderHeader("News/Tech/Deep"),
        listPayload([ROOTED], ["News", "News/Tech", "Empty"]),
      );

      expect(folderAt("News/Tech/Deep/Empty")).toBeDefined();
      expect(notices()).toEqual([
        SKIPPED_NOTICE,
        'Moved 1 feed and 1 folder to "News/Tech/Deep"',
      ]);
    });

    it("changes nothing but the notice when every folder is skipped", async () => {
      build();

      await drop(folderHeader("News/Tech/Deep"), listPayload([], ["News", "News/Tech"]));

      expect(rootNames()).toEqual(["News", "Archive", "Empty", "Newsletter"]);
      expect(notices()).toEqual([SKIPPED_NOTICE]);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it("compares whole path segments, so 'News' does not block 'Newsletter'", async () => {
      build();

      await drop(folderHeader("Newsletter"), listPayload([ROOTED], ["News"]));

      expect(folderAt("Newsletter/News/Tech")).toBeDefined();
      expect(feed(ALPHA).folder).toBe("Newsletter/News");
      expect(notices()).toEqual(['Moved 1 feed and 1 folder to "Newsletter"']);
    });

    it("shows a refused folder move's own reason (duplicate name, unknown path) instead of the nesting skip", async () => {
      // A second "Tech" at the root, so moving it into News collides with News/Tech.
      settings.folders.push(makeFolder("Tech"));
      build();

      await drop(folderHeader("News"), listPayload([ROOTED], ["Tech", "Ghost"]));

      expect(notices()).toEqual([
        'A folder named "Tech" already exists at the destination level.',
        "Dragged folder not found.",
        'Moved 1 feed to "News"',
      ]);
      expect(rootNames()).toContain("Tech");
      expect(folderAt("News")?.subfolders.map((f) => f.name)).toEqual(["Tech"]);
    });

    it("shows a reason shared by several refused folders once", async () => {
      build();

      await drop(folderHeader("News"), listPayload([ROOTED], ["Ghost", "Phantom"]));

      expect(notices()).toEqual([
        "Dragged folder not found.",
        'Moved 1 feed to "News"',
      ]);
    });

    it("shows no refusal for a subfolder dragged with its parent, which moved with it", async () => {
      build();

      await drop(folderHeader("Empty"), listPayload([], ["News", "News/Tech"]));

      expect(folderAt("Empty/News/Tech/Deep")).toBeDefined();
      expect(notices()).toEqual(['Moved 1 folder to "Empty"']);
    });
  });

  describe("root and nested destinations", () => {
    it("nests folders under a folder destination and appends them at the end of the root for the root", async () => {
      build();

      await drop(folderHeader("Empty"), listPayload([], ["Archive", "Newsletter"]));
      expect(folderAt("Empty")?.subfolders.map((f) => f.name)).toEqual([
        "Archive",
        "Newsletter",
      ]);

      await drop(rootSection(), listPayload([], ["Empty/Archive", "Empty/Newsletter"]));
      expect(rootNames()).toEqual(["News", "Empty", "Archive", "Newsletter"]);
    });

    it("moves a root folder dropped on the root to the end and still reports it as moved", async () => {
      build();

      await drop(rootSection(), listPayload([], ["News", "Archive"]));

      expect(rootNames()).toEqual(["Empty", "Newsletter", "News", "Archive"]);
      expect(notices()).toEqual(["Moved 2 folders to root"]);
    });

    it("remaps the feeds, collapsed folders and sort-order keys of a moved folder", async () => {
      settings.collapsedFolders = ["News/Tech"];
      settings.folderFeedSortOrders = { "News/Tech": { by: "name", ascending: true } };
      build();

      await drop(folderHeader("Empty"), listPayload([], ["News", "Archive"]));

      expect(feed(GAMMA).folder).toBe("Empty/News/Tech");
      expect(settings.collapsedFolders).toEqual(["Empty/News/Tech"]);
      expect(Object.keys(settings.folderFeedSortOrders ?? {})).toContain(
        "Empty/News/Tech",
      );
      expect(settings.folderSortOrder?.by).toBe("custom");
    });

    it("switches the destination's feed order to custom when feeds move in", async () => {
      build();

      await drop(folderHeader("Empty"), listPayload([ROOTED]));

      expect(settings.folderFeedSortOrders?.["Empty"]).toEqual({
        by: "custom",
        ascending: true,
      });
    });

    it("leaves the sort orders alone when nothing moved", async () => {
      build();

      await drop(folderHeader("News"), listPayload([ALPHA]));

      expect(settings.folderFeedSortOrders).toBeUndefined();
      expect(settings.folderSortOrder).toBeUndefined();
    });
  });

  describe("feeds that are skipped, ignored or already there", () => {
    it("does not move or count feeds already in the destination folder", async () => {
      build();

      await drop(folderHeader("News"), listPayload([ALPHA, BETA, ROOTED]));

      expect(moveFeeds).toHaveBeenCalledTimes(1);
      expect(moveFeeds.mock.calls[0]?.[1]).toEqual({
        draggedUrls: [ROOTED],
        destinationFolderPath: "News",
      });
      expect(notices()).toEqual(['Moved 1 feed to "News"']);
    });

    it("never calls the feed mover when every dragged feed is already in the destination", async () => {
      build();
      const order = settings.feeds.map((f) => f.url);

      await drop(folderHeader("News"), listPayload([ALPHA, BETA]));

      expect(moveFeeds).not.toHaveBeenCalled();
      expect(settings.feeds.map((f) => f.url)).toEqual(order);
      expect(notices()).toEqual([]);
    });

    it("ignores dragged URLs that match no feed", async () => {
      build();

      await drop(folderHeader("Empty"), listPayload(["https://ghost.test/feed", ROOTED]));

      expect(moveFeeds.mock.calls[0]?.[1]).toEqual({
        draggedUrls: [ROOTED],
        destinationFolderPath: "Empty",
      });
      expect(notices()).toEqual(['Moved 1 feed to "Empty"']);
    });

    it("does nothing to feeds when none of the dragged URLs match", async () => {
      build();

      await drop(folderHeader("Empty"), listPayload(["https://ghost.test/feed"]));

      expect(moveFeeds).not.toHaveBeenCalled();
      expect(notices()).toEqual([]);
    });

    it("treats a feed with no folder as already at the root", async () => {
      delete (feed(ROOTED) as { folder?: string }).folder;
      build();

      await drop(rootSection(), listPayload([ROOTED]));

      expect(moveFeeds).not.toHaveBeenCalled();
      expect(notices()).toEqual([]);
    });
  });

  describe("modifiedAt stamps", () => {
    it("stamps every folder the feeds left, once each, and the destination", async () => {
      build();

      await drop(folderHeader("Empty"), listPayload([ALPHA, BETA, EPSILON, ROOTED]));

      expect(folderAt("News")?.modifiedAt).toBe(NOW);
      expect(folderAt("Archive")?.modifiedAt).toBe(NOW);
      expect(folderAt("Empty")?.modifiedAt).toBe(NOW);
      // Untouched folders keep their old stamp.
      expect(folderAt("News/Tech")?.modifiedAt).toBe(OLD);
      expect(folderAt("Archive/Old")?.modifiedAt).toBe(OLD);
      expect(folderAt("Newsletter")?.modifiedAt).toBe(OLD);
    });

    it("stamps only the destination folder itself, not its ancestors", async () => {
      build();

      await drop(folderHeader("News/Tech"), listPayload([ROOTED]));

      expect(folderAt("News/Tech")?.modifiedAt).toBe(NOW);
      expect(folderAt("News")?.modifiedAt).toBe(OLD);
    });

    it("stamps only the folder a feed left, not its ancestors", async () => {
      build();

      await drop(folderHeader("Empty"), listPayload([DELTA]));

      expect(folderAt("News/Tech/Deep")?.modifiedAt).toBe(NOW);
      expect(folderAt("News/Tech")?.modifiedAt).toBe(OLD);
      expect(folderAt("News")?.modifiedAt).toBe(OLD);
    });

    it("stamps the folder a feed left when the destination is the root, and nothing else", async () => {
      build();

      await drop(rootSection(), listPayload([ALPHA]));

      expect(folderAt("News")?.modifiedAt).toBe(NOW);
      expect(folderAt("Archive")?.modifiedAt).toBe(OLD);
      expect(folderAt("Empty")?.modifiedAt).toBe(OLD);
    });

    it("stamps the destination even when nothing moved", async () => {
      build();

      await drop(folderHeader("News"), listPayload([ALPHA]));

      expect(folderAt("News")?.modifiedAt).toBe(NOW);
    });

    it("does not stamp the folders that were moved, only the destination", async () => {
      build();

      await drop(folderHeader("News"), listPayload([], ["Archive", "Empty"]));

      expect(folderAt("News")?.modifiedAt).toBe(NOW);
      expect(folderAt("News/Archive")?.modifiedAt).toBe(OLD);
      expect(folderAt("News/Empty")?.modifiedAt).toBe(OLD);
    });

    it("looks up a feed's old folder after folders moved, so a moved folder is stamped under its new path", async () => {
      build();

      await drop(folderHeader("Empty"), listPayload([EPSILON], ["Archive"]));

      expect(feed(EPSILON).folder).toBe("Empty");
      expect(folderAt("Empty/Archive")?.modifiedAt).toBe(NOW);
      expect(notices()).toEqual(['Moved 1 feed and 1 folder to "Empty"']);
    });

    it("stamps the destination but not the old folders when the feed mover fails", async () => {
      moveFeeds.mockReturnValueOnce({ ok: false, error: "Boom." });
      build();

      await drop(folderHeader("Empty"), listPayload([ALPHA]));

      expect(feed(ALPHA).folder).toBe("News");
      expect(folderAt("News")?.modifiedAt).toBe(OLD);
      expect(folderAt("Empty")?.modifiedAt).toBe(NOW);
    });
  });

  describe("when the feed mover fails", () => {
    it("shows its error as a notice, counts no feeds moved, and still saves", async () => {
      moveFeeds.mockReturnValueOnce({ ok: false, error: "Boom." });
      options.selectedFeeds = [ALPHA];
      build();

      await drop(folderHeader("Empty"), listPayload([ALPHA]));

      expect(notices()).toEqual(["Boom."]);
      expect(options.selectedFeeds).toEqual([]);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it("falls back to 'Unable to move feeds.' when the failure has no message", async () => {
      moveFeeds.mockReturnValueOnce({ ok: false });
      build();

      await drop(folderHeader("Empty"), listPayload([ALPHA]));

      expect(notices()).toEqual(["Unable to move feeds."]);
    });

    it("shows the error first, then the skip notice, then the moved notice for the folders", async () => {
      moveFeeds.mockReturnValueOnce({ ok: false, error: "Boom." });
      build();

      await drop(
        folderHeader("News/Tech"),
        listPayload([ROOTED], ["News", "Archive"]),
      );

      expect(notices()).toEqual([
        "Boom.",
        SKIPPED_NOTICE,
        'Moved 1 folder to "News/Tech"',
      ]);
    });
  });

  describe("after the move", () => {
    it("clears both selections, including when nothing moved", async () => {
      options.selectedFeeds = [ALPHA, BETA];
      options.selectedFolders = ["Archive"];
      build();

      await drop(folderHeader("News"), listPayload([ALPHA]));

      expect(options.selectedFeeds).toEqual([]);
      expect(options.selectedFolders).toEqual([]);
    });

    it("saves once, and re-renders only after the save resolves", async () => {
      let resolveSave: () => void = () => undefined;
      plugin.saveSettings.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
      );
      build();
      const before = feedRow(ROOTED);

      folderHeader("Empty").dispatchEvent(dropEvent(listPayload([ROOTED])));
      await flushPromises();

      // Saved, but the old tree is still on screen.
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(feedRow(ROOTED)).toBe(before);

      resolveSave();
      await flushPromises();

      expect(feedRow(ROOTED)).not.toBe(before);
      expect(
        folderHeader("Empty").parentElement?.querySelector(
          `[data-feed-url="${ROOTED}"]`,
        ),
      ).not.toBeNull();
    });

    it("saves and re-renders even when nothing moved", async () => {
      build();
      const before = folderHeader("News");

      await drop(before, listPayload([ALPHA]));

      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(folderHeader("News")).not.toBe(before);
    });

    it("clears the folder path cache once", async () => {
      build();
      const clear = vi.spyOn(sidebar, "clearFolderPathCache");

      await drop(folderHeader("Empty"), listPayload([ROOTED], ["Archive"]));

      expect(clear).toHaveBeenCalledTimes(1);
    });

    it("reopens the open folder at its new path after a batch moves it", async () => {
      options.currentFolder = "News";
      build();

      await drop(folderHeader("Empty"), listPayload([], ["News", "Archive"]));

      expect(folderAt("Empty/News")).toBeDefined();
      expect(callbacks.onFolderClick).toHaveBeenCalledTimes(1);
      expect(callbacks.onFolderClick).toHaveBeenCalledWith("Empty/News");
    });

    it("reopens a folder inside a moved folder at its new path", async () => {
      options.currentFolder = "News/Tech";
      build();

      await drop(folderHeader("Empty"), listPayload([], ["News", "Archive"]));

      expect(callbacks.onFolderClick).toHaveBeenCalledWith("Empty/News/Tech");
    });

    it("reports the open folder after clearing the selection, so the folder stays open", async () => {
      options.currentFolder = "News";
      options.selectedFolders = ["News", "Archive"];
      build();

      await drop(folderHeader("Empty"), listPayload([], ["News", "Archive"]));

      const selectionCleared = vi.mocked(callbacks.onSelectionCleared!);
      const folderClick = vi.mocked(callbacks.onFolderClick);
      expect(selectionCleared).toHaveBeenCalledTimes(1);
      expect(callbacks.onFolderMultiSelect).not.toHaveBeenCalled();
      expect(folderClick).toHaveBeenCalledWith("Empty/News");
      expect(selectionCleared.mock.invocationCallOrder[0]).toBeLessThan(
        folderClick.mock.invocationCallOrder[0],
      );
    });

    it("leaves the open folder alone when the batch did not move it", async () => {
      options.currentFolder = "Newsletter";
      build();

      await drop(folderHeader("Empty"), listPayload([], ["News", "Archive"]));

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });

    it("leaves the open folder alone when its folder was refused", async () => {
      options.currentFolder = "News";
      build();

      await drop(folderHeader("News/Tech"), listPayload([ROOTED], ["News"]));

      expect(callbacks.onFolderClick).not.toHaveBeenCalled();
    });
  });

  describe("the 'Move selection to folder' menu", () => {
    function openMoveMenu(): void {
      options.selectedFeeds = [ALPHA, ROOTED];
      options.selectedFolders = ["Archive"];
      build();
      feedRow(ALPHA).dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      const moveItem = ObsidianStubs.Menu.lastItems.find(
        (item) => item.title === "Move selection to folder",
      );
      moveItem?.trigger();
    }

    function chooseMenuItem(title: string): void {
      const item = ObsidianStubs.Menu.lastItems.find((i) => i.title === title);
      expect(item).toBeDefined();
      item?.trigger();
    }

    it("lists the root, every folder path in sorted order, then 'Create new folder...'", () => {
      openMoveMenu();

      expect(ObsidianStubs.Menu.lastItems.map((i) => i.title)).toEqual([
        "Root (no folder)",
        "Archive",
        "Archive/Old",
        "Empty",
        "News",
        "News/Tech",
        "News/Tech/Deep",
        "Newsletter",
        "Create new folder...",
      ]);
    });

    it("moves the selected feeds and folders to the root", async () => {
      openMoveMenu();

      chooseMenuItem("Root (no folder)");
      await flushPromises();

      // Rooted and Archive were already at the root: Rooted is skipped, Archive reported as moved.
      expect(feed(ALPHA).folder).toBe("");
      expect(rootNames()).toEqual(["News", "Empty", "Newsletter", "Archive"]);
      expect(notices()).toEqual(["Moved 1 feed and 1 folder to root"]);
      expect(options.selectedFeeds).toEqual([]);
      expect(options.selectedFolders).toEqual([]);
    });

    it("moves the selected feeds and folders to the chosen folder", async () => {
      openMoveMenu();

      chooseMenuItem("News/Tech");
      await flushPromises();

      expect(feed(ALPHA).folder).toBe("News/Tech");
      expect(feed(ROOTED).folder).toBe("News/Tech");
      expect(folderAt("News/Tech/Archive/Old")).toBeDefined();
      expect(notices()).toEqual(['Moved 2 feeds and 1 folder to "News/Tech"']);
    });

    it("creates the folder, then moves the selection into it", async () => {
      openMoveMenu();
      const modal = vi
        .spyOn(sidebar, "showFolderNameModal")
        .mockImplementation(({ onSubmit }) => onSubmit("Fresh"));

      chooseMenuItem("Create new folder...");
      await flushPromises();

      expect(modal.mock.calls[0]?.[0]).toMatchObject({
        title: "Create new folder",
        existingNames: ["News", "Archive", "Empty", "Newsletter"],
      });
      expect(rootNames()).toContain("Fresh");
      expect(feed(ALPHA).folder).toBe("Fresh");
      expect(feed(ROOTED).folder).toBe("Fresh");
      expect(folderAt("Fresh/Archive")).toBeDefined();
      expect(notices()).toEqual(['Moved 2 feeds and 1 folder to "Fresh"']);
    });

    it("moves the selection into an existing folder when the new name matches one", async () => {
      openMoveMenu();
      vi.spyOn(sidebar, "showFolderNameModal").mockImplementation(({ onSubmit }) =>
        onSubmit("Empty"),
      );

      chooseMenuItem("Create new folder...");
      await flushPromises();

      expect(rootNames().filter((n) => n === "Empty")).toHaveLength(1);
      expect(feed(ALPHA).folder).toBe("Empty");
      expect(notices()).toEqual(['Moved 2 feeds and 1 folder to "Empty"']);
    });
  });
});
