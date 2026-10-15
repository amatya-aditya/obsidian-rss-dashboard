/**
 * The dashboard's hotkey listener skips keys pressed on an interactive control
 * so a focused button or field keeps its own keys (`isInteractiveTarget`). A
 * sidebar row is a script-focusable link (#826 AC-014b) whose keys are the
 * dashboard's own (arrow keys, Enter, Shift+X, ...), so it must not count as
 * a control, or every sidebar key stops working once a row has focus.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { isInteractiveTarget } from "../../../src/hotkeys/dashboard-hotkeys";
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

describe("isInteractiveTarget with sidebar rows", () => {
  let container: HTMLElement;
  let sidebar: Sidebar;

  beforeEach(() => {
    container = createDiv();
    document.body.appendChild(container);
    const feed = {
      title: "Alpha",
      url: "https://a.test/feed",
      folder: "News",
      items: [{ read: false }],
    } as unknown as Feed;
    const settings = {
      feeds: [feed],
      folders: [{ name: "News", subfolders: [] }] as Folder[],
      collapsedFolders: [],
      display: { showFolderUnreadBadges: true, showFeedUnreadBadges: true },
      availableTags: [],
    } as unknown as RssDashboardSettings;
    const options: SidebarOptions = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
      selectedFeeds: [],
    };
    const plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      activeRefreshState: new Map(),
      getFeedShardHealth: vi.fn().mockReturnValue(null),
    };
    sidebar = new Sidebar(
      ObsidianStubs.App.createMock() as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      {
        onFolderClick: vi.fn(),
        onFeedClick: vi.fn(),
        onToggleFolderCollapse: vi.fn(),
      } as unknown as SidebarCallbacks,
    );
    sidebar.render();
  });

  afterEach(() => {
    sidebar.destroy();
    document.body.empty();
  });

  it("lets the dashboard handle keys pressed on a focused sidebar row", () => {
    const rows = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-all-feeds-button, .rss-dashboard-feed-folder-header, .rss-dashboard-feed",
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(isInteractiveTarget(row)).toBe(false);
    }
  });

  it("lets the dashboard handle keys on the row that holds the Tab stop", () => {
    // AC-014g: one row is tabindex="0" and the rest are "-1". Neither value
    // turns a row into a control.
    const rows = [
      ...container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-all-feeds-button, .rss-dashboard-feed-folder-header, .rss-dashboard-feed",
      ),
    ];
    expect(
      rows.filter((row) => row.getAttribute("tabindex") === "0"),
    ).toHaveLength(1);
    for (const row of rows) {
      expect(isInteractiveTarget(row)).toBe(false);
    }
  });

  it("lets the dashboard handle keys whose target is text inside a sidebar row", () => {
    const name = container.querySelector(".rss-dashboard-feed-name")!;
    expect(isInteractiveTarget(name)).toBe(false);
  });

  it("still leaves a real button inside a row, such as All feeds refresh, to the button", () => {
    const refresh = container.querySelector(
      ".rss-dashboard-all-feeds-button button",
    )!;
    expect(isInteractiveTarget(refresh)).toBe(true);
  });

  it("still treats an ordinary link outside the sidebar as a control", () => {
    const link = container.createDiv({ attr: { role: "link" } });
    expect(isInteractiveTarget(link)).toBe(true);
  });
});
