/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  Sidebar,
  SidebarOptions,
  SidebarCallbacks,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App } from "../../stubs/obsidian";
import type { RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

function createMockEnv() {
  const app = ObsidianStubs.App.createMock() as unknown as App;
  const container = document.createElement("div");
  const settings = {
    feeds: [],
    folders: [],
    display: {},
    availableTags: [],
  } as unknown as RssDashboardSettings;
  const plugin = {} as unknown as RssDashboardPlugin;
  return { app, container, settings, plugin };
}

describe("Sidebar Shift+Click Range Select (TDD)", () => {
  let app: App;
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let plugin: RssDashboardPlugin;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;

  beforeEach(() => {
    const env = createMockEnv();
    app = env.app;
    container = env.container;
    settings = env.settings;
    plugin = env.plugin;

    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
    };

    callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onToggleTagsCollapse: vi.fn(),
      onToggleFolderCollapse: vi.fn(),
      onAddFolder: vi.fn(),
      onAddSubfolder: vi.fn(),
      onAddFeed: vi.fn() as any,
      onEditFeed: vi.fn() as any,
      onDeleteFeed: vi.fn() as any,
      onDeleteFolder: vi.fn() as any,
      onRefreshFeeds: vi.fn() as any,
      onUpdateFeed: vi.fn() as any,
      onImportOpml: vi.fn(),
      onExportOpml: vi.fn(),
      onToggleSidebar: vi.fn(),
    } as unknown as SidebarCallbacks;
  });

  afterEach(() => {
    // Clean up DOM and mocks between tests
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("calls onRangeSelect when Shift+clicking a folder", () => {
    // Setup two folders
    settings.folders = [
      { name: "A", subfolders: [] },
      { name: "B", subfolders: [] },
    ] as any;

    callbacks.onRangeSelect = vi.fn();

    const sidebar = new Sidebar(app, container, plugin, settings, options, callbacks);
    sidebar.render();

    const folderA = container.querySelector('[data-folder-path="A"]') as HTMLElement;
    expect(folderA).toBeTruthy();

    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true });
    folderA.dispatchEvent(evt);

    expect(callbacks.onRangeSelect).toHaveBeenCalled();
    const call = (callbacks.onRangeSelect as any).mock.calls[0];
    const clickedKey = call[0];
    const visibleKeys = call[1];
    expect(clickedKey).toBe("folder:A");
    expect(Array.isArray(visibleKeys)).toBe(true);
    expect(visibleKeys).toEqual(expect.arrayContaining(["folder:A", "folder:B"]));
  });

  it("calls onRangeSelect when Shift+clicking a feed", () => {
    settings.folders = [{ name: "F", subfolders: [] }] as any;
    settings.feeds = [
      { url: "https://example.com/feed1", title: "Feed1", items: [], folder: "F" },
    ] as any;

    callbacks.onRangeSelect = vi.fn();

    const sidebar = new Sidebar(app, container, plugin, settings, options, callbacks);
    sidebar.render();

    const feedEl = container.querySelector('[data-feed-url="https://example.com/feed1"]') as HTMLElement;
    expect(feedEl).toBeTruthy();

    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true });
    feedEl.dispatchEvent(evt);

    expect(callbacks.onRangeSelect).toHaveBeenCalled();
    const call = (callbacks.onRangeSelect as any).mock.calls[0];
    const clickedKey = call[0];
    const visibleKeys = call[1];
    expect(clickedKey).toBe("feed:https://example.com/feed1");
    expect(Array.isArray(visibleKeys)).toBe(true);
  });
});
