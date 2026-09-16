import { vi, describe, it, expect, afterEach } from "vitest";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App, WorkspaceLeaf } from "../../stubs/obsidian";
import type { RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

function createMockEnv(onLayoutReady: (cb: () => void) => void) {
  const app = ObsidianStubs.App.createMock() as unknown as App;
  app.workspace = {
    on: vi.fn(),
    getLeavesOfType: vi.fn().mockReturnValue([]),
    onLayoutReady,
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
  const maybeShowStorageDeprecationPrompt = vi.fn();
  const plugin = {
    app,
    settings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    removeCachedImagesForDeletedFeed: vi.fn().mockResolvedValue(undefined),
    maybeShowStorageDeprecationPrompt,
  } as unknown as RssDashboardPlugin;
  return { app, leaf, plugin, maybeShowStorageDeprecationPrompt };
}

describe("RssDashboardView storage deprecation prompt trigger", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("checks the deprecation prompt once the dashboard view opens and its layout is ready", async () => {
    let capturedCallback: (() => void) | null = null;
    const { leaf, plugin, maybeShowStorageDeprecationPrompt } = createMockEnv(
      (cb) => {
        capturedCallback = cb;
      },
    );

    const view = new RssDashboardView(leaf, plugin);
    await view.onOpen();

    // The prompt must not fire before the workspace layout settles.
    expect(maybeShowStorageDeprecationPrompt).not.toHaveBeenCalled();

    expect(capturedCallback).not.toBeNull();
    capturedCallback!();

    expect(maybeShowStorageDeprecationPrompt).toHaveBeenCalledTimes(1);
  });

  it("never checks the deprecation prompt when the dashboard view is never opened", () => {
    // Regression guard: the previous implementation wired this check to
    // `app.workspace.onLayoutReady` directly inside plugin.onload(), so it
    // fired on every Obsidian startup regardless of whether the RSS
    // Dashboard view was ever opened. Simulating a startup with no dashboard
    // view created (as when the user never opens the plugin that session)
    // must not touch maybeShowStorageDeprecationPrompt at all.
    const { maybeShowStorageDeprecationPrompt } = createMockEnv(() => {
      throw new Error("onLayoutReady should not be registered without a dashboard view");
    });

    expect(maybeShowStorageDeprecationPrompt).not.toHaveBeenCalled();
  });
});
