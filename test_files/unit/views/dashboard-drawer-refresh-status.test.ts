import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type WorkspaceLeaf } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import type { MobileNavigationModal } from "../../../src/modals/mobile-navigation-modal";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { lucideIconId } from "../test-icon-helpers";

function feed(title: string): Feed {
  return {
    title,
    url: `https://example.com/${title}`,
    folder: "",
    items: [],
    lastUpdated: 0,
  };
}

/**
 * On mobile the visible sidebar is the navigation drawer's own Sidebar, not
 * the dashboard view's inline one. Refresh status must reach the drawer while
 * it stays open, the way it reaches the inline sidebar on desktop.
 */
describe("Navigation drawer live refresh status", () => {
  let view: RssDashboardView;
  let plugin: {
    settings: typeof DEFAULT_SETTINGS;
    saveSettings: ReturnType<typeof vi.fn>;
    activeRefreshState: Map<string, { status: string; startedAt: number }>;
    isMultiFeedRefreshActive: boolean;
    isGlobalRefreshCancellable: boolean;
    globalRefreshProgress: { completed: number; total: number };
  };
  let internals: { mobileSidebarModal: MobileNavigationModal | null };

  beforeEach(() => {
    installObsidianDomPolyfills();
    vi.stubGlobal("innerWidth", 1000);
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.feeds = [feed("First"), feed("Second")];
    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      activeRefreshState: new Map(),
      isMultiFeedRefreshActive: false,
      isGlobalRefreshCancellable: false,
      globalRefreshProgress: { completed: 0, total: 0 },
    };
    const leaf = { app: new App() } as unknown as WorkspaceLeaf;
    view = new RssDashboardView(leaf, plugin as unknown as RssDashboardPlugin);
    // Exercise the real drawer without rebuilding the article UI.
    vi.spyOn(view, "render").mockResolvedValue(undefined);
    internals = view as unknown as typeof internals;
  });

  afterEach(() => {
    internals.mobileSidebarModal?.close();
    document.body.empty();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Opens the drawer and returns the sidebar element it renders into. */
  function openDrawer(): HTMLElement {
    view.openMobileSidebar();
    const drawer = document.body.querySelector<HTMLElement>(
      ".rss-dashboard-sidebar-container",
    );
    expect(drawer).not.toBeNull();
    return drawer!;
  }

  function allFeedsProgress(drawer: HTMLElement): string | undefined {
    return drawer.querySelector(".rss-dashboard-all-feeds-progress")
      ?.textContent;
  }

  function allFeedsIcon(drawer: HTMLElement): HTMLElement | null {
    return drawer.querySelector(".rss-dashboard-all-feeds-icon");
  }

  it("shows the run's progress in the open drawer as it changes", () => {
    const drawer = openDrawer();
    expect(allFeedsProgress(drawer)).toBeUndefined();

    plugin.isMultiFeedRefreshActive = true;
    plugin.isGlobalRefreshCancellable = true;
    plugin.globalRefreshProgress = { completed: 1, total: 2 };

    view.refreshSidebarOnly();

    expect(allFeedsProgress(drawer)).toBe("1/2");
  });

  it("updates only the progress text without rebuilding the drawer rows", () => {
    const drawer = openDrawer();

    plugin.isMultiFeedRefreshActive = true;
    plugin.isGlobalRefreshCancellable = true;
    plugin.globalRefreshProgress = { completed: 0, total: 2 };
    // The batch-start render creates the progress row and the feed rows.
    view.refreshSidebarOnly();
    const row = drawer.querySelector(
      '[data-feed-url="https://example.com/First"]',
    );
    expect(row).not.toBeNull();

    plugin.globalRefreshProgress = { completed: 2, total: 2 };
    view.refreshGlobalRefreshProgressOnly();

    expect(allFeedsProgress(drawer)).toBe("2/2");
    expect(
      drawer.querySelector('[data-feed-url="https://example.com/First"]'),
    ).toBe(row);
  });

  it("surfaces a feed that starts refreshing in the open drawer", () => {
    const drawer = openDrawer();
    const url = "https://example.com/First";
    expect(
      drawer.querySelector(`[data-feed-url="${url}"].processing-feed`),
    ).toBeNull();

    plugin.activeRefreshState.set(url, { status: "processing", startedAt: 1 });

    view.refreshSidebarOnly();

    expect(
      drawer.querySelector(`[data-feed-url="${url}"].processing-feed`),
    ).not.toBeNull();
  });

  it("shows the Stop affordance for a cancellable run and the spinner otherwise", () => {
    plugin.isMultiFeedRefreshActive = true;
    plugin.isGlobalRefreshCancellable = true;
    plugin.globalRefreshProgress = { completed: 0, total: 2 };

    const drawer = openDrawer();
    expect(allFeedsIcon(drawer)?.classList.contains("stop")).toBe(true);
    expect(allFeedsIcon(drawer)?.classList.contains("refreshing")).toBe(false);
    expect(allFeedsIcon(drawer)?.getAttribute("aria-label")).toBe(
      "Stop refresh",
    );
    expect(lucideIconId(allFeedsIcon(drawer))).toBe("square-stop");

    // A non-cancellable run (for example a due refresh) spins instead.
    plugin.isGlobalRefreshCancellable = false;
    view.refreshSidebarOnly();

    expect(allFeedsIcon(drawer)?.classList.contains("refreshing")).toBe(true);
    expect(allFeedsIcon(drawer)?.classList.contains("stop")).toBe(false);
    expect(lucideIconId(allFeedsIcon(drawer))).toBe("refresh-cw");
  });

  it("reflects a refresh already running when the drawer opens", () => {
    plugin.isMultiFeedRefreshActive = true;
    plugin.isGlobalRefreshCancellable = true;
    plugin.globalRefreshProgress = { completed: 1, total: 3 };

    const drawer = openDrawer();

    expect(allFeedsProgress(drawer)).toBe("1/3");
    expect(allFeedsIcon(drawer)?.classList.contains("stop")).toBe(true);
  });

  it("applies the dashboard's current selection to the open drawer", () => {
    plugin.settings.folders = [{ name: "News", subfolders: [] }];
    plugin.settings.feeds = [{ ...feed("First"), folder: "News" }];
    const drawer = openDrawer();
    expect(
      drawer
        .querySelector(".rss-dashboard-all-feeds-button")
        ?.classList.contains("active"),
    ).toBe(true);

    view.currentFolder = "News";
    view.refreshSidebarOnly();

    expect(
      drawer
        .querySelector(".rss-dashboard-all-feeds-button")
        ?.classList.contains("active"),
    ).toBe(false);
    expect(
      drawer
        .querySelector('[data-folder-path="News"]')
        ?.classList.contains("active"),
    ).toBe(true);
  });

  it("stops updating once the drawer is closed", () => {
    plugin.isMultiFeedRefreshActive = true;
    plugin.isGlobalRefreshCancellable = true;
    plugin.globalRefreshProgress = { completed: 1, total: 3 };
    const drawer = openDrawer();
    expect(allFeedsProgress(drawer)).toBe("1/3");

    internals.mobileSidebarModal!.close();
    expect(internals.mobileSidebarModal).toBeNull();
    expect(drawer.isConnected).toBe(false);

    // No live drawer remains, so a later status change must not throw or
    // re-attach the closed drawer.
    plugin.globalRefreshProgress = { completed: 3, total: 3 };
    view.refreshSidebarOnly();

    expect(drawer.isConnected).toBe(false);
  });

  describe("active input state", () => {
    const flushFrames = async () => {
      await new Promise((r) => window.setTimeout(r, 0));
      await new Promise((r) => window.setTimeout(r, 0));
    };
    let sidebar: {
      isSearchExpanded: boolean;
      isAddTagExpanded: boolean;
      isTagsExpanded: boolean;
      searchQuery: string;
      render(): void;
    };

    function openDrawerWithSidebar(): HTMLElement {
      const drawer = openDrawer();
      sidebar = (
        internals.mobileSidebarModal as unknown as { sidebar: typeof sidebar }
      ).sidebar;
      return drawer;
    }

    beforeEach(() => {
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
        window.setTimeout(() => cb(0), 0),
      );
      window.requestAnimationFrame = (cb: FrameRequestCallback) =>
        window.setTimeout(() => cb(0), 0);
    });

    it("keeps the search field's caret and selection across a status redraw", async () => {
      const drawer = openDrawerWithSidebar();
      sidebar.isSearchExpanded = true;
      sidebar.searchQuery = "First";
      sidebar.render();
      await flushFrames();
      let input = drawer.querySelector<HTMLInputElement>(
        ".rss-dashboard-search-input",
      )!;
      input.focus();
      input.setSelectionRange(2, 2);

      plugin.activeRefreshState.set("https://example.com/First", {
        status: "processing",
        startedAt: 1,
      });
      view.refreshSidebarOnly();
      await flushFrames();

      input = drawer.querySelector<HTMLInputElement>(
        ".rss-dashboard-search-input",
      )!;
      expect(input.value).toBe("First");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
    });

    it("keeps an unsaved tag name and colour across a status redraw", async () => {
      const drawer = openDrawerWithSidebar();
      sidebar.isTagsExpanded = true;
      sidebar.isAddTagExpanded = true;
      sidebar.render();
      await flushFrames();
      const name = drawer.querySelector<HTMLInputElement>(
        ".rss-dashboard-sidebar-add-tag-input",
      )!;
      const color = drawer.querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-color-picker",
      )!;
      name.value = "Draft";
      color.value = "#123456";
      name.focus();
      name.setSelectionRange(1, 3);

      view.refreshSidebarOnly();
      await flushFrames();

      const nextName = drawer.querySelector<HTMLInputElement>(
        ".rss-dashboard-sidebar-add-tag-input",
      )!;
      const nextColor = drawer.querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-color-picker",
      )!;
      expect(nextName.value).toBe("Draft");
      expect(nextColor.value).toBe("#123456");
      expect(document.activeElement).toBe(nextName);
      expect([nextName.selectionStart, nextName.selectionEnd]).toEqual([1, 3]);
    });
  });
});
