import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  Sidebar,
  SidebarOptions,
  SidebarCallbacks,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { REDUCED_MOTION_QUERY } from "../../../src/utils/motion-preference";

installObsidianDomPolyfills();

describe("Sidebar search scroll honors reduced motion (#867)", () => {
  let container: HTMLElement;
  let sidebar: Sidebar;
  let scrollIntoView: ReturnType<typeof vi.spyOn>;
  const originalWidth = window.innerWidth;

  const mockReducedMotion = (reduce: boolean): void => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: reduce && query === REDUCED_MOTION_QUERY,
        }) as MediaQueryList,
    );
  };

  beforeEach(() => {
    // Fake timers drive the delayed scroll that follows focusing the input.
    vi.useFakeTimers();
    // The scroll only runs on a narrow (mobile) window.
    window.innerWidth = 600;
    scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    container = createDiv();
    document.body.appendChild(container);

    const settings = {
      feeds: [],
      folders: [],
      display: {
        sidebarRowSpacing: 10,
        sidebarRowIndentation: 20,
        sidebarItemPaddingLeft: 2,
        sidebarItemPaddingRight: 2,
      },
      media: { useDomainIconsRss: false },
      availableTags: [],
    } as unknown as RssDashboardSettings;

    const options: SidebarOptions = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
    };

    const callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onToggleTagsCollapse: vi.fn(),
      onToggleFolderCollapse: vi.fn(),
      onToggleSidebar: vi.fn(),
    } as unknown as SidebarCallbacks;

    const plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
    };

    sidebar = new Sidebar(
      ObsidianStubs.App.createMock() as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();
  });

  afterEach(() => {
    sidebar.destroy();
    container.remove();
    window.innerWidth = originalWidth;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const openSearchAndSettle = (): void => {
    container.querySelector<HTMLElement>('[aria-label="Search"]')?.click();
    vi.runAllTimers();
  };

  it("scrolls the search input into view smoothly by default", () => {
    mockReducedMotion(false);
    openSearchAndSettle();

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("scrolls the search input into view instantly when the user prefers reduced motion", () => {
    mockReducedMotion(true);
    openSearchAndSettle();

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
    });
    expect(scrollIntoView).not.toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );
  });
});
