import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Sidebar,
  type SidebarCallbacks,
  type SidebarOptions,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { RssDashboardSettings } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

installObsidianDomPolyfills();

describe("Sidebar.setAllFoldersCollapsed", () => {
  let sidebar: Sidebar;
  let onBatchToggleFolders: ReturnType<typeof vi.fn>;
  let settings: RssDashboardSettings;

  beforeEach(() => {
    const container = createDiv();
    settings = {
      feeds: [],
      folders: [
        { name: "News", subfolders: [{ name: "Tech", subfolders: [] }] },
        { name: "Blogs", subfolders: [] },
      ],
      collapsedFolders: [],
      display: {},
      media: {},
    } as unknown as RssDashboardSettings;
    onBatchToggleFolders = vi.fn();
    const options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
    } as SidebarOptions;
    const callbacks = { onBatchToggleFolders } as unknown as SidebarCallbacks;
    sidebar = new Sidebar(
      ObsidianStubs.App.createMock() as never,
      container,
      { settings } as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    vi.spyOn(sidebar, "render").mockReturnValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collapses every folder, nested ones included", () => {
    sidebar.setAllFoldersCollapsed(true);

    expect(onBatchToggleFolders).toHaveBeenCalledTimes(1);
    const [toCollapse, toExpand] = onBatchToggleFolders.mock.calls[0] as [
      string[],
      string[],
    ];
    expect(toCollapse.slice().sort()).toEqual(["Blogs", "News", "News/Tech"]);
    expect(toExpand).toEqual([]);
  });

  it("expands every folder", () => {
    sidebar.setAllFoldersCollapsed(false);

    const [toCollapse, toExpand] = onBatchToggleFolders.mock.calls[0] as [
      string[],
      string[],
    ];
    expect(toCollapse).toEqual([]);
    expect(toExpand.slice().sort()).toEqual(["Blogs", "News", "News/Tech"]);
  });

  it("does nothing when there are no folders", () => {
    settings.folders = [];
    sidebar.clearFolderPathCache();

    sidebar.setAllFoldersCollapsed(true);

    expect(onBatchToggleFolders).not.toHaveBeenCalled();
  });
});
