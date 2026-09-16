import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App, WorkspaceLeaf } from "../../stubs/obsidian";
import type { Feed, RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

function createMockEnv() {
  const app = ObsidianStubs.App.createMock() as unknown as App;
  app.workspace = {
    on: vi.fn(),
    getLeavesOfType: vi.fn().mockReturnValue([]),
    onLayoutReady: vi.fn(),
  } as unknown as App["workspace"];
  const leaf = {
    view: null,
    setViewState: vi.fn(),
    app,
  } as unknown as WorkspaceLeaf;
  const settings = {
    feeds: [],
    folders: [],
    display: {
      sidebarRowSpacing: 10,
      sidebarRowIndentation: 20,
      sidebarItemPaddingLeft: 2,
      sidebarItemPaddingRight: 2,
    },
    availableTags: [],
    dashboardMultiFilters: {},
    articleFilter: { type: "age", value: 0 },
    viewStyle: "list",
  } as unknown as RssDashboardSettings;
  const plugin = {
    app,
    settings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    removeCachedImagesForDeletedFeed: vi.fn().mockResolvedValue(undefined),
  } as unknown as RssDashboardPlugin;
  return { app, leaf, settings, plugin };
}

describe("Dashboard multi-select: root-displayed feeds", () => {
  let leaf: WorkspaceLeaf;
  let settings: RssDashboardSettings;
  let plugin: RssDashboardPlugin;

  beforeEach(() => {
    const env = createMockEnv();
    leaf = env.leaf;
    settings = env.settings;
    plugin = env.plugin;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("ctrl-click: shows '2 selected feed(s)', not a folder message, for two plain root feeds", async () => {
    settings.feeds = [
      { url: "https://root1.com", title: "Root1", items: [], folder: "", lastUpdated: 0 } satisfies Feed,
      { url: "https://root2.com", title: "Root2", items: [], folder: "", lastUpdated: 0 } satisfies Feed,
    ];
    settings.folders = [];

    const view = new RssDashboardView(leaf, plugin);
    await view.onOpen();
    const containerEl = (view as unknown as { containerEl: HTMLElement }).containerEl;

    const feedEls = settings.feeds.map((f) =>
      containerEl.querySelector(`[data-feed-url="${f.url}"]`) as HTMLElement,
    );
    feedEls.forEach((el) => expect(el).toBeTruthy());

    for (const el of feedEls) {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    }
    expect(view.selectedFeeds.length).toBe(2);
    expect(view.selectedFolders.length).toBe(0);
  });

  it("shift-click range-select over two feeds orphaned from a deleted folder collapses them into a phantom folder delete", async () => {
    // These feeds still carry the name of a folder that no longer exists in
    // settings.folders (e.g. the folder was deleted previously). The sidebar
    // displays them under the root section because their folder isn't a real
    // path anymore (see the `!allFolderPaths.has(feed.folder)` root-feeds filter).
    settings.feeds = [
      { url: "https://orphan1.com", title: "Orphan1", items: [], folder: "DeletedFolder", lastUpdated: 0 } satisfies Feed,
      { url: "https://orphan2.com", title: "Orphan2", items: [], folder: "DeletedFolder", lastUpdated: 0 } satisfies Feed,
    ];
    settings.folders = [];

    const view = new RssDashboardView(leaf, plugin);
    await view.onOpen();
    const containerEl = (view as unknown as { containerEl: HTMLElement }).containerEl;

    const feedEls = settings.feeds.map((f) =>
      containerEl.querySelector(`[data-feed-url="${f.url}"]`) as HTMLElement,
    );
    feedEls.forEach((el) => expect(el).toBeTruthy());

    // Click the first feed normally to set the range anchor, then shift-click the second.
    feedEls[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    feedEls[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));

    // The user selected two feeds, not a folder — the resulting selection
    // state (and the resulting confirm message) must reflect that.
    expect(view.selectedFeeds.length).toBe(2);
    expect(view.selectedFolders.length).toBe(0);
  });
});
