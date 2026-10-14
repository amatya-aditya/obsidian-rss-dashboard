/**
 * Sidebar feed, folder and "All feeds" rows expose a role, an accessible name
 * and their state to assistive technology (WCAG 2.2 4.1.2 Name, Role, Value;
 * Slice 4 audit rows L-004 and L-005 of #826, AC-014b).
 *
 * Everything runs through `Sidebar.render()` and the rendered DOM. The keyboard
 * tests pin that the existing paths (Shift+S focus, arrow-key movement,
 * Shift+F10 context menu, click selection) keep working with the new semantics.
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

type SidebarInternals = {
  focusSidebar: () => void;
  moveFocusToNextItem: () => void;
  moveFocusToPreviousItem: () => void;
  jumpToPreviousFolder: () => void;
  openFocusedItem: () => void;
  forceExpandFolderForSearch: (folderEl: HTMLElement) => void;
  resetSidebarSearchPresentation: () => void;
  refreshStatusInPlace: () => void;
  showFeedContextMenu: (event: MouseEvent, feed: Feed) => void;
  showFolderContextMenu: (event: MouseEvent) => void;
};

function makeFeed(title: string, url: string, folder: string, unread = 1) {
  return {
    title,
    url,
    folder,
    items: Array.from({ length: unread }, () => ({ read: false })),
    lastUpdated: 0,
  } as unknown as Feed;
}

/** Every keyboard-navigable sidebar row, found by its class, not its role. */
const ROW_SELECTOR =
  ".rss-dashboard-all-feeds-button, .rss-dashboard-feed-folder-header, .rss-dashboard-feed";

/**
 * The accessible name a browser computes for a row: `aria-labelledby` first,
 * then `aria-label`, then the text content. jsdom ships no name computation.
 */
function accessibleName(el: HTMLElement): string {
  const ids = el.getAttribute("aria-labelledby");
  if (ids) {
    return ids
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
  }
  return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
}

describe("Sidebar row semantics (AC-014b)", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;
  let sidebar: Sidebar;
  let internals: SidebarInternals;
  let feedMenu: MockInstance;
  let folderMenu: MockInstance;

  let alpha: Feed;
  let gamma: Feed;
  let rooted: Feed;
  let activeRefreshState: Map<string, { status: string }>;

  function build(): void {
    const plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      activeRefreshState,
      getFeedShardHealth: vi.fn().mockReturnValue(null),
    };
    sidebar = new Sidebar(
      ObsidianStubs.App.createMock() as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    internals = sidebar as unknown as SidebarInternals;
    feedMenu = vi
      .spyOn(internals, "showFeedContextMenu")
      .mockImplementation(() => undefined);
    folderMenu = vi
      .spyOn(internals, "showFolderContextMenu")
      .mockImplementation(() => undefined);
    sidebar.render();
  }

  const feedRow = (url: string): HTMLElement =>
    container.querySelector(`[data-feed-url="${url}"]`)!;
  const folderRow = (path: string): HTMLElement =>
    container.querySelector(
      `.rss-dashboard-feed-folder-header[data-folder-path="${path}"]`,
    )!;
  const allFeedsRow = (): HTMLElement =>
    container.querySelector(".rss-dashboard-all-feeds-button")!;

  beforeEach(() => {
    alpha = makeFeed("Alpha", "https://a.test/feed", "News", 3);
    gamma = makeFeed("Gamma", "https://c.test/feed", "News/Tech", 1);
    rooted = makeFeed("Rooted", "https://root.test/feed", "", 2);
    activeRefreshState = new Map();
    container = createDiv();
    document.body.appendChild(container);
    settings = {
      feeds: [alpha, gamma, rooted],
      folders: [
        { name: "News", subfolders: [{ name: "Tech", subfolders: [] }] },
        { name: "Empty", subfolders: [] },
      ] as Folder[],
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
      onToggleFolderCollapse: vi.fn(),
    } as unknown as SidebarCallbacks;
  });

  afterEach(() => {
    sidebar.destroy();
    document.body.empty();
    vi.restoreAllMocks();
  });

  describe("role and name", () => {
    it("gives every feed, folder and All feeds row a link role", () => {
      build();
      for (const row of [
        allFeedsRow(),
        folderRow("News"),
        folderRow("News/Tech"),
        folderRow("Empty"),
        feedRow(alpha.url),
        feedRow(gamma.url),
        feedRow(rooted.url),
      ]) {
        expect(row.getAttribute("role")).toBe("link");
      }
      // Four feed-like rows are not the only rows: nothing else gained the role.
      expect(container.querySelectorAll('[role="link"]')).toHaveLength(7);
    });

    it("names a feed row after its title and unread count", () => {
      build();
      expect(accessibleName(feedRow(alpha.url))).toBe("Alpha 3");
      expect(accessibleName(feedRow(rooted.url))).toBe("Rooted 2");
    });

    it("names a feed row after its title alone when the unread badge is hidden", () => {
      settings.display.showFeedUnreadBadges = false;
      build();
      expect(accessibleName(feedRow(alpha.url))).toBe("Alpha");
    });

    it("names a folder row after its name and unread count, not its toggle", () => {
      build();
      // News holds Alpha (3) and, through Tech, Gamma (1).
      expect(accessibleName(folderRow("News"))).toBe("News 4");
      expect(accessibleName(folderRow("News/Tech"))).toBe("Tech 1");
      expect(accessibleName(folderRow("Empty"))).toBe("Empty");
    });

    it("names the All feeds row after its label and unread count, not its refresh button", () => {
      settings.display.showAllFeedsUnreadBadges = true;
      build();
      expect(accessibleName(allFeedsRow())).toBe("All feeds (3) 6");
    });

    it("keeps the refresh button inside the All feeds row reachable as a button", () => {
      build();
      const refresh = allFeedsRow().querySelector("button");
      expect(refresh).not.toBeNull();
      expect(refresh?.getAttribute("aria-label")).toBe("Refresh all feeds");
    });

    it("gives each row a name that resolves to elements inside that row", () => {
      build();
      const rows = [
        ...container.querySelectorAll<HTMLElement>('[role="link"]'),
      ];
      for (const row of rows) {
        const ids = (row.getAttribute("aria-labelledby") ?? "").split(/\s+/);
        expect(ids.length).toBeGreaterThan(0);
        const first = document.getElementById(ids[0] ?? "");
        expect(first).not.toBeNull();
        expect(row.contains(first)).toBe(true);
      }
      const allIds = [...document.querySelectorAll("[id]")].map((e) => e.id);
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it("updates a folder row's name when its unread badge goes away or comes back", () => {
      build();
      expect(accessibleName(folderRow("News/Tech"))).toBe("Tech 1");

      for (const item of gamma.items) item.read = true;
      internals.refreshStatusInPlace();
      expect(accessibleName(folderRow("News/Tech"))).toBe("Tech");

      for (const item of gamma.items) item.read = false;
      internals.refreshStatusInPlace();
      expect(accessibleName(folderRow("News/Tech"))).toBe("Tech 1");
    });
  });

  describe("current row", () => {
    it("marks only the open feed with aria-current", () => {
      options.currentFeed = alpha;
      build();
      expect(feedRow(alpha.url).getAttribute("aria-current")).toBe("true");
      expect(feedRow(gamma.url).hasAttribute("aria-current")).toBe(false);
      expect(feedRow(rooted.url).hasAttribute("aria-current")).toBe(false);
      expect(allFeedsRow().hasAttribute("aria-current")).toBe(false);
      expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(
        1,
      );
    });

    it("marks only the open folder with aria-current", () => {
      options.currentFolder = "News/Tech";
      build();
      expect(folderRow("News/Tech").getAttribute("aria-current")).toBe("true");
      expect(folderRow("News").hasAttribute("aria-current")).toBe(false);
      expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(
        1,
      );
    });

    it("does not mark a folder current only because it holds the open feed", () => {
      options.currentFeed = alpha;
      build();
      // The folder is still highlighted for sighted users (active class).
      expect(folderRow("News").classList.contains("active")).toBe(true);
      expect(folderRow("News").hasAttribute("aria-current")).toBe(false);
    });

    it("marks the All feeds row when nothing narrower is open", () => {
      build();
      expect(allFeedsRow().getAttribute("aria-current")).toBe("true");
      expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(
        1,
      );
    });

    it("moves aria-current to the newly opened row on the next render", () => {
      options.currentFeed = alpha;
      build();
      options.currentFeed = rooted;
      sidebar.render();
      expect(feedRow(alpha.url).hasAttribute("aria-current")).toBe(false);
      expect(feedRow(rooted.url).getAttribute("aria-current")).toBe("true");
    });

    it("keeps aria-current when a refresh redraws the open feed's row in place", () => {
      options.currentFeed = alpha;
      build();
      // A refresh run reaching the feed makes the sidebar redraw just its row.
      activeRefreshState.set(alpha.url, { status: "processing" });
      const before = feedRow(alpha.url);
      internals.refreshStatusInPlace();
      const row = feedRow(alpha.url);
      expect(row).not.toBe(before);
      expect(row.getAttribute("role")).toBe("link");
      expect(row.getAttribute("aria-current")).toBe("true");
    });
  });

  describe("expanded state", () => {
    it("exposes aria-expanded on folders that have contents", () => {
      settings.collapsedFolders = ["News/Tech"];
      build();
      expect(folderRow("News").getAttribute("aria-expanded")).toBe("true");
      expect(folderRow("News/Tech").getAttribute("aria-expanded")).toBe(
        "false",
      );
    });

    it("omits aria-expanded on a folder with nothing to expand and on feeds", () => {
      build();
      expect(folderRow("Empty").hasAttribute("aria-expanded")).toBe(false);
      expect(feedRow(alpha.url).hasAttribute("aria-expanded")).toBe(false);
      expect(allFeedsRow().hasAttribute("aria-expanded")).toBe(false);
    });

    it("flips aria-expanded when the folder's toggle is clicked", () => {
      build();
      const toggle = folderRow("News").querySelector<HTMLElement>(
        ".rss-dashboard-feed-folder-toggle",
      )!;
      toggle.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 }),
      );
      expect(folderRow("News").getAttribute("aria-expanded")).toBe("false");
      toggle.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 }),
      );
      expect(folderRow("News").getAttribute("aria-expanded")).toBe("true");
    });

    it("follows a search that force-expands a collapsed folder and its reset", () => {
      settings.collapsedFolders = ["News"];
      build();
      expect(folderRow("News").getAttribute("aria-expanded")).toBe("false");

      internals.forceExpandFolderForSearch(folderRow("News").parentElement!);
      expect(folderRow("News").getAttribute("aria-expanded")).toBe("true");

      internals.resetSidebarSearchPresentation();
      expect(folderRow("News").getAttribute("aria-expanded")).toBe("false");
    });

    it("does not announce the decorative chevron on its own", () => {
      build();
      const toggle = folderRow("News").querySelector(
        ".rss-dashboard-feed-folder-toggle",
      );
      expect(toggle?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  describe("keyboard paths keep working", () => {
    it("keeps every row focusable, with one of them the Tab stop (AC-014g)", () => {
      build();
      const rows = [...container.querySelectorAll(ROW_SELECTOR)];
      expect(rows).toHaveLength(7);
      expect(rows.map((row) => row.getAttribute("tabindex")).sort()).toEqual([
        "-1",
        "-1",
        "-1",
        "-1",
        "-1",
        "-1",
        "0",
      ]);
    });

    it("moves focus to the current row on Shift+S and along the rows on the arrows", () => {
      options.currentFeed = rooted;
      build();
      internals.focusSidebar();
      expect(document.activeElement).toBe(feedRow(rooted.url));
      expect(
        feedRow(rooted.url).hasClass("rss-dashboard-sidebar-row-focused"),
      ).toBe(true);

      internals.moveFocusToPreviousItem();
      // The row before the root feed is the last row of the folder tree.
      const rows = [...container.querySelectorAll<HTMLElement>(ROW_SELECTOR)];
      const index = rows.indexOf(feedRow(rooted.url));
      expect(document.activeElement).toBe(rows[index - 1]);

      internals.moveFocusToNextItem();
      expect(document.activeElement).toBe(feedRow(rooted.url));
    });

    it("opens the context menu for the focused row on Shift+F10", () => {
      options.currentFeed = alpha;
      build();
      internals.focusSidebar();
      const row = document.activeElement as HTMLElement;
      expect(row).toBe(feedRow(alpha.url));

      // Shift+F10 makes the browser fire contextmenu at the focused element.
      row.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      expect(feedMenu).toHaveBeenCalledTimes(1);
      expect(feedMenu.mock.calls[0]?.[1]).toBe(alpha);

      internals.jumpToPreviousFolder();
      const folder = document.activeElement as HTMLElement;
      expect(folder).toBe(folderRow("News/Tech"));
      folder.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      expect(folderMenu).toHaveBeenCalledTimes(1);
    });

    it("still selects a row by click", () => {
      build();
      feedRow(alpha.url).dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 }),
      );
      expect(callbacks.onFeedClick).toHaveBeenCalledWith(
        alpha,
        expect.anything(),
      );

      folderRow("News").dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 }),
      );
      expect(callbacks.onFolderClick).toHaveBeenCalledWith("News");

      allFeedsRow().dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 }),
      );
      expect(callbacks.onFolderClick).toHaveBeenCalledWith(null);
    });
  });
});
