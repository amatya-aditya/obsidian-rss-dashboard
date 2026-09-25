import { afterEach, describe, expect, it, vi } from "vitest";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App, WorkspaceLeaf } from "../../stubs/obsidian";
import type { RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Treat any viewport under 1000px as the phone/tablet drawer layout so tests
// can switch layouts by changing a window's width.
vi.mock("../../../src/utils/platform-utils", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/utils/platform-utils")
  >()),
  shouldUseMobileSidebarLayout: (viewportWidth?: number) =>
    (viewportWidth ?? 0) < 1000,
}));

installObsidianDomPolyfills();

interface ViewInternals {
  mobileSidebarModal: { close: () => void } | null;
}

interface PopoutWindow extends EventTarget {
  document: Document;
  innerWidth: number;
}

// Obsidian moves a leaf's DOM into a popout window's document without
// reopening the view. jsdom documents from createHTMLDocument have no window,
// so give this one a window that can receive resize events.
function createPopoutWindow(innerWidth: number): PopoutWindow {
  const popoutDocument = document.implementation.createHTMLDocument("Popout");
  const popoutWindow = Object.assign(new EventTarget(), {
    document: popoutDocument,
    innerWidth,
  });
  Object.defineProperty(popoutDocument, "defaultView", {
    configurable: true,
    value: popoutWindow,
  });
  return popoutWindow;
}

function createDashboard() {
  const app = ObsidianStubs.App.createMock() as unknown as App;
  const workspaceHandlers = new Map<string, Array<() => void>>();
  app.workspace = {
    on: vi.fn((name: string, callback: () => void) => {
      workspaceHandlers.set(name, [
        ...(workspaceHandlers.get(name) ?? []),
        callback,
      ]);
      return {};
    }),
    getLeavesOfType: vi.fn().mockReturnValue([]),
    onLayoutReady: vi.fn(),
  } as unknown as App["workspace"];
  const leaf = { view: null, setViewState: vi.fn(), app } as unknown as
    WorkspaceLeaf;
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
    maybeShowStorageDeprecationPrompt: vi.fn(),
  } as unknown as RssDashboardPlugin;
  const view = new RssDashboardView(leaf, plugin);
  document.body.appendChild(view.containerEl);
  const triggerLayoutChange = () =>
    workspaceHandlers.get("layout-change")?.forEach((callback) => callback());
  return { view, triggerLayoutChange };
}

/** Moves the view into a popout the way Obsidian does, then reports it. */
function moveToPopout(
  view: RssDashboardView,
  triggerLayoutChange: () => void,
  popout: PopoutWindow,
): void {
  popout.document.body.appendChild(view.containerEl);
  triggerLayoutChange();
}

describe("dashboard sidebar layout after moving to a popout window", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.empty();
  });

  it("closes the sidebar drawer when the popout is widened to the inline layout", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1400);
    const { view, triggerLayoutChange } = createDashboard();
    await view.onOpen();

    const popout = createPopoutWindow(600);
    moveToPopout(view, triggerLayoutChange, popout);
    const drawer = { close: vi.fn() };
    (view as unknown as ViewInternals).mobileSidebarModal = drawer;

    popout.innerWidth = 1400;
    popout.dispatchEvent(new Event("resize"));

    expect(drawer.close).toHaveBeenCalledTimes(1);
    await view.onClose();
  });

  it("ignores main-window resizes once the view lives in a popout", async () => {
    const mainWidth = vi.spyOn(window, "innerWidth", "get");
    mainWidth.mockReturnValue(600);
    const { view, triggerLayoutChange } = createDashboard();
    await view.onOpen();

    const popout = createPopoutWindow(600);
    moveToPopout(view, triggerLayoutChange, popout);
    const drawer = { close: vi.fn() };
    (view as unknown as ViewInternals).mobileSidebarModal = drawer;

    mainWidth.mockReturnValue(1400);
    window.dispatchEvent(new Event("resize"));

    expect(drawer.close).not.toHaveBeenCalled();
    await view.onClose();
  });
});
