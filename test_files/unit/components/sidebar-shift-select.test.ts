import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  Sidebar,
  SidebarOptions,
  SidebarCallbacks,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App } from "../../stubs/obsidian";
import type {
  Feed,
  Folder,
  RssDashboardSettings,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

function createMockEnv() {
  const app = ObsidianStubs.App.createMock() as unknown as App;
  const container = document.createElement("div");
  const settings = {
    feeds: [] as Feed[],
    folders: [] as Folder[],
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
      onAddFeed: vi.fn(),
      onEditFeed: vi.fn(),
      onDeleteFeed: vi.fn(),
      onDeleteFolder: vi.fn(),
      onRefreshFeeds: vi.fn(),
      onUpdateFeed: vi.fn(),
      onImportOpml: vi.fn(),
      onExportOpml: vi.fn(),
      onToggleSidebar: vi.fn(),
      onRangeSelect: vi.fn(),
    } as SidebarCallbacks;
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
    ] as Partial<Folder>[] as Folder[];

    callbacks.onRangeSelect = vi.fn();

    const sidebar = new Sidebar(
      app,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const folderA = container.querySelector(
      '[data-folder-path="A"]',
    ) as HTMLElement;
    expect(folderA).toBeTruthy();

    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    });
    folderA.dispatchEvent(evt);

    expect(vi.mocked(callbacks.onRangeSelect)).toHaveBeenCalled();
    const [clickedKey, visibleKeys] = vi.mocked(callbacks.onRangeSelect).mock
      .calls[0];

    expect(clickedKey).toBe("folder:A");
    expect(Array.isArray(visibleKeys)).toBe(true);
    expect(visibleKeys).toEqual(
      expect.arrayContaining(["folder:A", "folder:B"]),
    );
  });

  it("calls onRangeSelect when Shift+clicking a feed", () => {
    settings.folders = [{ name: "F", subfolders: [] }] as Partial<Folder>[] as Folder[];
    settings.feeds = [
      {
        url: "https://example.com/feed1",
        title: "Feed1",
        items: [],
        folder: "F",
      },
    ] as Partial<Feed>[] as Feed[];

    callbacks.onRangeSelect = vi.fn();

    const sidebar = new Sidebar(
      app,
      container,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const feedEl = container.querySelector(
      '[data-feed-url="https://example.com/feed1"]',
    ) as HTMLElement;
    expect(feedEl).toBeTruthy();

    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    });
    feedEl.dispatchEvent(evt);

    expect(vi.mocked(callbacks.onRangeSelect)).toHaveBeenCalled();
    const [clickedKey, visibleKeys] = vi.mocked(callbacks.onRangeSelect).mock
      .calls[0];

    expect(clickedKey).toBe("feed:https://example.com/feed1");
    expect(Array.isArray(visibleKeys)).toBe(true);
  });
});
