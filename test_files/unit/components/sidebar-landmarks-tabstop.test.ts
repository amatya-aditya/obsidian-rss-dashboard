/**
 * The sidebar is a named `navigation` landmark and its feed, folder and
 * "All feeds" rows are one Tab stop with roving focus (WCAG 2.2 1.3.1, 2.4.1
 * Bypass Blocks, 2.4.3 Focus Order; Slice 4 audit rows L-001 and L-005b of
 * #826, AC-014g).
 *
 * Pattern: the rows keep `role="link"` (#1136). A single Tab stop with roving
 * `tabindex` is how a flat list of links is made reachable without a `tree`
 * restructure. The remembered row, or the open row before any, holds
 * `tabindex="0"`; every other row is `-1`, so Shift+S, the arrow keys, Enter,
 * Shift+X and Shift+F10 keep working on the row that has focus.
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
  openFocusedItem: () => void;
  refreshStatusInPlace: () => void;
  filterFeedsAndFolders: (query: string) => void;
  showFeedContextMenu: (event: MouseEvent, feed: Feed) => void;
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

const ROW_SELECTOR =
  ".rss-dashboard-all-feeds-button, .rss-dashboard-feed-folder-header, .rss-dashboard-feed";

describe("Sidebar landmark and Tab stop (AC-014g)", () => {
  let layout: HTMLElement;
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;
  let sidebar: Sidebar;
  let internals: SidebarInternals;
  let feedMenu: MockInstance;
  let activeRefreshState: Map<string, { status: string }>;

  let alpha: Feed;
  let gamma: Feed;
  let rooted: Feed;

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
    sidebar.render();
  }

  const rows = (): HTMLElement[] => [
    ...container.querySelectorAll<HTMLElement>(ROW_SELECTOR),
  ];
  const tabStops = (): HTMLElement[] =>
    rows().filter((row) => row.getAttribute("tabindex") === "0");
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
    layout = createDiv({ cls: "rss-dashboard-layout" });
    container = layout.createDiv({ cls: "rss-dashboard-sidebar-container" });
    document.body.appendChild(layout);
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("navigation landmark", () => {
    it("exposes the sidebar as a navigation named from visible text", () => {
      build();

      expect(container.getAttribute("role")).toBe("navigation");
      const label = document.getElementById(
        container.getAttribute("aria-labelledby") ?? "",
      );
      expect(label).not.toBeNull();
      expect(container.contains(label)).toBe(true);
      expect(label?.textContent).toBe("Feeds");
      // Obsidian draws a hover tooltip from aria-label over the whole sidebar.
      expect(container.hasAttribute("aria-label")).toBe(false);
    });

    it("stays one navigation across re-renders", () => {
      build();
      sidebar.render();
      sidebar.render();

      expect(document.querySelectorAll('[role="navigation"]')).toHaveLength(1);
      const label = document.getElementById(
        container.getAttribute("aria-labelledby") ?? "",
      );
      expect(label?.textContent).toBe("Feeds");
    });

    it("adds no other landmark to the sidebar", () => {
      build();

      expect(
        container.querySelectorAll(
          '[role="main"], [role="contentinfo"], [role="banner"], [role="complementary"], main, nav, header, footer, aside',
        ),
      ).toHaveLength(0);
    });
  });

  describe("one Tab stop", () => {
    it("puts a single Tab stop on All feeds when nothing is open", () => {
      build();

      expect(rows()).toHaveLength(7);
      expect(tabStops()).toEqual([allFeedsRow()]);
      for (const row of rows().filter((r) => r !== allFeedsRow())) {
        expect(row.getAttribute("tabindex")).toBe("-1");
      }
    });

    it("puts the Tab stop on the open feed", () => {
      options.currentFeed = rooted;
      build();

      expect(tabStops()).toEqual([feedRow(rooted.url)]);
    });

    it("puts the Tab stop on the open folder", () => {
      options.currentFolder = "News/Tech";
      build();

      expect(tabStops()).toEqual([folderRow("News/Tech")]);
    });

    it("moves the Tab stop to the row Shift+S and the arrows reach, and keeps it there after a render", () => {
      options.currentFeed = alpha;
      build();
      internals.focusSidebar();
      expect(tabStops()).toEqual([feedRow(alpha.url)]);

      internals.moveFocusToNextItem();
      const moved = document.activeElement as HTMLElement;
      expect(moved).not.toBe(feedRow(alpha.url));
      expect(tabStops()).toEqual([moved]);

      const movedIndex = rows().indexOf(moved);
      sidebar.render();
      expect(tabStops()).toHaveLength(1);
      expect(rows().indexOf(tabStops()[0])).toBe(movedIndex);
    });

    it("keeps the remembered row as the Tab stop after the sidebar loses keyboard focus", () => {
      options.currentFeed = alpha;
      build();
      internals.focusSidebar();
      internals.moveFocusToNextItem();
      const moved = document.activeElement as HTMLElement;

      sidebar.blurSidebarFocus();

      expect(tabStops()).toEqual([moved]);
    });

    it("keeps the Tab stop off rows hidden inside a collapsed folder", () => {
      settings.collapsedFolders = ["News"];
      options.currentFeed = alpha;
      build();

      const stops = tabStops();
      expect(stops).toHaveLength(1);
      expect(
        stops[0]?.closest(".rss-dashboard-folder-feeds.collapsed"),
      ).toBeNull();
    });

    it("moves the Tab stop out of a folder that is collapsed by its toggle", () => {
      options.currentFeed = alpha;
      build();
      expect(tabStops()).toEqual([feedRow(alpha.url)]);

      folderRow("News")
        .querySelector<HTMLElement>(".rss-dashboard-feed-folder-toggle")!
        .click();

      const stops = tabStops();
      expect(stops).toHaveLength(1);
      expect(
        stops[0]?.closest(".rss-dashboard-folder-feeds.collapsed"),
      ).toBeNull();
    });

    it("moves the Tab stop off rows a search hides, and back when it clears", () => {
      options.currentFeed = rooted;
      build();
      expect(tabStops()).toEqual([feedRow(rooted.url)]);

      internals.filterFeedsAndFolders("alpha");
      const stops = tabStops();
      expect(stops).toHaveLength(1);
      expect(stops[0]?.closest(".rss-dashboard-search-hidden")).toBeNull();

      internals.filterFeedsAndFolders("");
      expect(tabStops()).toEqual([feedRow(rooted.url)]);
    });

    it("keeps the Tab stop on the same row when a refresh redraws it in place", () => {
      options.currentFeed = alpha;
      build();
      const before = feedRow(alpha.url);

      activeRefreshState.set(alpha.url, { status: "refreshing" });
      internals.refreshStatusInPlace();

      const after = feedRow(alpha.url);
      expect(after).not.toBe(before);
      expect(tabStops()).toEqual([after]);
    });

    it("leaves the refresh button inside All feeds in the Tab order", () => {
      build();
      const refresh = allFeedsRow().querySelector("button");

      expect(refresh).not.toBeNull();
      expect(refresh?.getAttribute("tabindex")).not.toBe("-1");
    });
  });

  describe("keyboard paths keep working with a Tab stop", () => {
    it("treats a row reached with Tab like Shift+S: focused class, and arrows continue from it", () => {
      build();
      const target = feedRow(gamma.url);

      target.focus();

      expect(sidebar.hasKeyboardFocus()).toBe(true);
      expect(target.hasClass("rss-dashboard-sidebar-row-focused")).toBe(true);
      expect(tabStops()).toEqual([target]);

      internals.moveFocusToNextItem();
      const rowsNow = rows();
      expect(document.activeElement).toBe(rowsNow[rowsNow.indexOf(target) + 1]);
    });

    it("opens the row reached with Tab on Enter", () => {
      build();
      feedRow(alpha.url).focus();

      internals.openFocusedItem();

      expect(callbacks.onFeedClick).toHaveBeenCalledWith(alpha);
    });

    it("opens the context menu of the row reached with Tab on Shift+F10", () => {
      build();
      const target = feedRow(alpha.url);
      target.focus();

      target.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );

      expect(feedMenu).toHaveBeenCalledTimes(1);
      expect(feedMenu.mock.calls[0]?.[1]).toBe(alpha);
    });

    it("does not take keyboard focus when the mouse focuses a row", () => {
      build();
      const target = feedRow(alpha.url);

      target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      target.focus();

      expect(sidebar.hasKeyboardFocus()).toBe(false);
      expect(target.hasClass("rss-dashboard-sidebar-row-focused")).toBe(false);
    });

    it("takes keyboard focus again for a Tab press after an earlier click", () => {
      vi.useFakeTimers();
      build();
      const clicked = feedRow(alpha.url);
      clicked.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      clicked.focus();
      vi.advanceTimersByTime(1);

      feedRow(gamma.url).focus();

      expect(sidebar.hasKeyboardFocus()).toBe(true);
    });

    it("ignores focus on something that is not a row", () => {
      build();
      const refresh = allFeedsRow().querySelector<HTMLElement>("button")!;

      refresh.focus();

      expect(sidebar.hasKeyboardFocus()).toBe(false);
    });

    it("hands the keys back to the dashboard when Tab moves focus out to the rest of the view", () => {
      build();
      feedRow(alpha.url).focus();
      expect(sidebar.hasKeyboardFocus()).toBe(true);
      const toolbarButton = layout.createEl("button");

      feedRow(alpha.url).dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: toolbarButton,
        }),
      );

      expect(sidebar.hasKeyboardFocus()).toBe(false);
    });

    it("keeps keyboard focus when a dialog outside the view takes focus", () => {
      build();
      feedRow(alpha.url).focus();
      const dialogButton = document.body.createEl("button");

      feedRow(alpha.url).dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: dialogButton,
        }),
      );

      expect(sidebar.hasKeyboardFocus()).toBe(true);
    });

    it("keeps keyboard focus while focus moves between sidebar controls", () => {
      build();
      feedRow(alpha.url).focus();
      const refresh = allFeedsRow().querySelector<HTMLElement>("button")!;

      feedRow(alpha.url).dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: refresh }),
      );

      expect(sidebar.hasKeyboardFocus()).toBe(true);
    });
  });
});
