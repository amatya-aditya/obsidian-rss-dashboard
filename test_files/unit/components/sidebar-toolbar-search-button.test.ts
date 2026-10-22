/**
 * The sidebar toolbar's search toggle is a native button (#1478): it keeps its
 * pressed state, accessible name and click behaviour with no role, tabindex or
 * hand-written keydown handler.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  Sidebar,
  type SidebarCallbacks,
  type SidebarOptions,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

describe("Sidebar toolbar search toggle", () => {
  let container: HTMLElement;
  let toolbarHost: HTMLElement;
  let sidebar: Sidebar;

  const searchButton = (): HTMLElement =>
    toolbarHost.querySelector<HTMLElement>('[aria-label="Search feeds"]')!;

  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    container = createDiv();
    toolbarHost = createDiv();
    document.body.append(container, toolbarHost);
    const settings = {
      feeds: [],
      folders: [],
      collapsedFolders: [],
      display: { iconOrder: [], hideToolbarEntirely: false },
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
    const callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onToggleTagsCollapse: vi.fn(),
      onToggleFolderCollapse: vi.fn(),
      onToggleSidebar: vi.fn(),
      onAddFolder: vi.fn(),
      onActivateDiscover: vi.fn(),
      onManageFeeds: vi.fn(),
      onBatchToggleFolders: vi.fn(),
    } as unknown as SidebarCallbacks;
    const plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      manifest: { id: "rss-dashboard" },
    };
    sidebar = new Sidebar(
      ObsidianStubs.App.createMock() as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.renderToolbar(toolbarHost);
  });

  afterEach(() => {
    container.remove();
    toolbarHost.remove();
    vi.restoreAllMocks();
  });

  it("is a native button with no role, tabindex or keydown wiring", () => {
    const button = searchButton();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.hasAttribute("role")).toBe(false);
    expect(button.hasAttribute("tabindex")).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.classList.contains("is-active")).toBe(false);
  });

  it("toggles the search field on click without letting the click bubble", () => {
    const bubbled = vi.fn();
    toolbarHost.addEventListener("click", bubbled);
    const renderSpy = vi.spyOn(sidebar, "render");

    searchButton().click();

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(bubbled).not.toHaveBeenCalled();
    sidebar.renderToolbar(toolbarHost);
    const buttons = toolbarHost.querySelectorAll<HTMLElement>(
      '[aria-label="Search feeds"]',
    );
    const pressed = buttons[buttons.length - 1];
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    expect(pressed.classList.contains("is-active")).toBe(true);
  });
});
