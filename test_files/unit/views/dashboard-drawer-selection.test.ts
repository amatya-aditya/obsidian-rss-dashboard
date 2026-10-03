import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Platform, type WorkspaceLeaf } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import type { MobileNavigationModal } from "../../../src/modals/mobile-navigation-modal";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function feed(title: string, folder = ""): Feed {
  return {
    title,
    url: `https://example.com/${title}`,
    folder,
    items: [],
    lastUpdated: 0,
  };
}

describe("Dashboard selection through the navigation drawer", () => {
  let view: RssDashboardView;
  let internals: {
    mobileSidebarModal: MobileNavigationModal | null;
    currentFeed: Feed | null;
  };

  beforeEach(() => {
    installObsidianDomPolyfills();
    vi.stubGlobal("innerWidth", 1000);
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.feeds = [feed("First"), feed("Middle"), feed("Last")];
    settings.folders = [
      { name: "News", subfolders: [] },
      { name: "Tech", subfolders: [] },
    ];
    const plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
    } as unknown as RssDashboardPlugin;
    const leaf = { app: new App() } as unknown as WorkspaceLeaf;
    view = new RssDashboardView(leaf, plugin);
    // Exercise the real drawer and selection handlers without rebuilding the article UI.
    vi.spyOn(view, "render").mockResolvedValue(undefined);
    internals = view as unknown as typeof internals;
  });

  afterEach(() => {
    internals.mobileSidebarModal?.close();
    document.body.empty();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function openDrawer(): HTMLElement {
    view.openMobileSidebar();
    expect(internals.mobileSidebarModal).not.toBeNull();
    return internals.mobileSidebarModal!.contentEl;
  }

  function clickRow(
    container: HTMLElement,
    selector: string,
    modifiers: MouseEventInit = {},
  ): void {
    const row = container.querySelector<HTMLElement>(selector);
    expect(row).not.toBeNull();
    row!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, ...modifiers }),
    );
  }

  it("selects the range from a previous feed click and closes the drawer", () => {
    clickRow(openDrawer(), '[data-feed-url="https://example.com/First"]');
    expect(internals.mobileSidebarModal).toBeNull();

    clickRow(openDrawer(), '[data-feed-url="https://example.com/Last"]', {
      shiftKey: true,
    });

    expect(view.selectedFeeds).toEqual([
      "https://example.com/First",
      "https://example.com/Middle",
      "https://example.com/Last",
    ]);
    expect(internals.mobileSidebarModal).toBeNull();
  });

  it.each(["ctrlKey", "metaKey"] as const)(
    "adds a folder using %s while the drawer stays open",
    (modifier) => {
      clickRow(openDrawer(), '[data-folder-path="News"]');
      const drawer = openDrawer();

      clickRow(drawer, '[data-folder-path="Tech"]', { [modifier]: true });

      expect(view.selectedFolders).toEqual(["News", "Tech"]);
      expect(view.currentFolder).toBeNull();
      expect(internals.mobileSidebarModal).not.toBeNull();
      expect(
        drawer.querySelectorAll(
          ".rss-dashboard-feed-folder-header.multi-selected",
        ),
      ).toHaveLength(2);
    },
  );

  it.each(["ctrlKey", "metaKey"] as const)(
    "adds feeds using %s while the drawer stays open",
    (modifier) => {
      vi.spyOn(Platform, "isMacOS", "get").mockReturnValue(
        modifier === "metaKey",
      );
      clickRow(openDrawer(), ".rss-dashboard-all-feeds-button");
      const drawer = openDrawer();

      clickRow(drawer, '[data-feed-url="https://example.com/First"]', {
        [modifier]: true,
      });
      expect(internals.mobileSidebarModal).not.toBeNull();
      clickRow(drawer, '[data-feed-url="https://example.com/Last"]', {
        [modifier]: true,
      });

      expect(view.selectedFeeds).toEqual([
        "https://example.com/First",
        "https://example.com/Last",
      ]);
      expect(internals.currentFeed).toBeNull();
      expect(internals.mobileSidebarModal).not.toBeNull();
      expect(
        drawer.querySelectorAll(".rss-dashboard-feed.multi-selected"),
      ).toHaveLength(2);
    },
  );

  it("keeps the open feed when Ctrl/Cmd+click adds another feed (#547)", () => {
    clickRow(openDrawer(), '[data-feed-url="https://example.com/First"]');
    expect(internals.currentFeed?.title).toBe("First");

    clickRow(openDrawer(), '[data-feed-url="https://example.com/Last"]', {
      ctrlKey: true,
    });

    expect(view.selectedFeeds).toEqual([
      "https://example.com/First",
      "https://example.com/Last",
    ]);
    expect(internals.currentFeed).toBeNull();
  });
});
