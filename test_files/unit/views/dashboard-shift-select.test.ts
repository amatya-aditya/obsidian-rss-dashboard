/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App, WorkspaceLeaf } from "../../stubs/obsidian";
import type { RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

function createMockEnv() {
  const app = ObsidianStubs.App.createMock() as unknown as App;
  app.workspace = {
    on: vi.fn(),
    getLeavesOfType: vi.fn().mockReturnValue([]),
  } as any;
  const leaf = {
    view: null,
    setViewState: vi.fn(),
  } as unknown as WorkspaceLeaf;
  const settings = {
    feeds: [],
    folders: [],
    display: {},
    availableTags: [],
    dashboardMultiFilters: {},
    articleFilter: { type: "age", value: 0 },
    viewStyle: "list",
  } as unknown as RssDashboardSettings;
  const plugin = {
    settings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
  } as unknown as RssDashboardPlugin;
  return { app, leaf, settings, plugin };
}

describe("Dashboard Shift+Click Range Select", () => {
  let app: App;
  let leaf: WorkspaceLeaf;
  let settings: RssDashboardSettings;
  let plugin: RssDashboardPlugin;

  beforeEach(() => {
    const env = createMockEnv();
    app = env.app;
    leaf = env.leaf;
    settings = env.settings;
    plugin = env.plugin;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("selects Folder A and specific feeds of Folder B but not Folder B itself", () => {
    settings.folders = [
      { name: "A", subfolders: [] },
      { name: "B", subfolders: [] },
    ] as any;
    settings.feeds = [
      { url: "https://feed.A1", title: "A1", items: [], folder: "A" },
      { url: "https://feed.A2", title: "A2", items: [], folder: "A" },
      { url: "https://feed.B1", title: "B1", items: [], folder: "B" },
      { url: "https://feed.B2", title: "B2", items: [], folder: "B" },
      { url: "https://feed.B3", title: "B3", items: [], folder: "B" },
    ] as any;

    const view = new RssDashboardView(leaf, plugin);
    
    // Simulate setting initial anchor
    (view as any).lastClickAnchorKey = "folder:A";

    const visibleKeys = [
      "folder:A",
      "feed:https://feed.A1",
      "feed:https://feed.A2",
      "folder:B",
      "feed:https://feed.B1",
      "feed:https://feed.B2",
      "feed:https://feed.B3",
    ];

    // Simulate shift-click on feed B2
    (view as any).handleSidebarRangeSelect("feed:https://feed.B2", visibleKeys);

    // Folder A should be selected (all its feeds are in range)
    expect(view.selectedFolders).toContain("A");
    
    // Folder B should NOT be selected (B3 is not in range)
    expect(view.selectedFolders).not.toContain("B");

    // All overlapping feeds from Folder B should be in selectedFeeds
    expect(view.selectedFeeds).toContain("https://feed.B1");
    expect(view.selectedFeeds).toContain("https://feed.B2");
    expect(view.selectedFeeds).not.toContain("https://feed.B3");
  });
});
