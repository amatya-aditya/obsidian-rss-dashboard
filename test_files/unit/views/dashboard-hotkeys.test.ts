import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {}
    destroy(): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refilter(..._args: any[]): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelectedArticle(..._args: any[]): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hasArticle(..._args: any[]): boolean {
      return false;
    }
    getCardNavigationTargetGuid(): string | null {
      return null;
    }
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {}
    destroy(): void {}
    clearFolderPathCache(): void {}
    focusSidebar(): void {}
    hasKeyboardFocus(): boolean {
      return false;
    }
    moveFocusToNextItem(): void {}
    moveFocusToPreviousItem(): void {}
    jumpToNextFolder(): void {}
    jumpToPreviousFolder(): void {}
    openFocusedItem(): void {}
    toggleFocusedFolderCollapse(): void {}
    deleteFocusedItem(): void {}
    renameFocusedItem(): void {}
    blurSidebarFocus(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    open(): void {}
    close(): void {}
  },
}));

vi.mock("../../../src/views/reader-view", () => ({
  ReaderView: class ReaderViewMock {},
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaverMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    verifyAllSavedArticles(..._args: any[]): void {}
  },
}));

/**
 * Helper: spy on RssDashboardView.prototype.registerDomEvent BEFORE constructing
 * the view so calls made during the constructor (setupDashboardHotkeys) are captured.
 * Returns { view, spy, getKeydownHandler }.
 */
function makeViewWithRegisterSpy(
  leaf: WorkspaceLeaf,
  plugin: RssDashboardPlugin,
) {
  const spy = vi.spyOn(
    RssDashboardView.prototype as unknown as { registerDomEvent: (...args: unknown[]) => void },
    "registerDomEvent",
  );
  const view = new RssDashboardView(leaf, plugin);
  // Skip render() — hotkey tests don't exercise the article rendering pipeline
  (view as unknown as { render: () => void }).render = vi.fn();
  return { view, spy };
}

/**
 * Extract the handler registered for (document, "keydown") from the prototype spy.
 */
function getKeydownHandler(
  spy: unknown,
): ((e: KeyboardEvent) => void) | null {
  const mockSpy = spy as { mock: { calls: unknown[][] } };
  for (const call of mockSpy.mock.calls) {
    if (call[0] === document && call[1] === "keydown") {
      return call[2] as (e: KeyboardEvent) => void;
    }
  }
  return null;
}

describe("DashboardView Hotkeys", () => {
  let app: App;
  let leaf: WorkspaceLeaf;
  let plugin: RssDashboardPlugin;

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();

    app = {
      workspace: {
        on: vi.fn(),
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
      },
      vault: {
        on: vi.fn(),
      },
    } as unknown as App;

    leaf = {
      app,
      view: null,
      onClose: vi.fn(),
      onContextMenu: vi.fn(),
    } as unknown as WorkspaceLeaf;

    // Connect the view to the leaf correctly for activeLeaf checks
    (leaf as unknown as { view: unknown }).view = { app };

    plugin = {
      app,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS,
      saveSettings: vi.fn(),
      updatePlaybackProgress: vi.fn(),
      refreshFeeds: vi.fn().mockResolvedValue(undefined),
    } as unknown as RssDashboardPlugin;

    // activeLeaf setup so Guard 1 passes
    (app.workspace as unknown as { activeLeaf: WorkspaceLeaf }).activeLeaf = leaf;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers a document keydown listener instead of a custom scope", () => {
    // Spy on prototype BEFORE construction so the constructor call is captured
    const { view, spy } = makeViewWithRegisterSpy(leaf, plugin);
    // Link the view to the mock activeLeaf so guard passes
    (leaf as unknown as { view: unknown }).view = view;

    expect(spy).toHaveBeenCalledWith(
      document,
      "keydown",
      expect.any(Function),
    );
  });

  it("executes corresponding actions on keydown", () => {
    const { view, spy } = makeViewWithRegisterSpy(leaf, plugin);
    (leaf as unknown as { view: unknown }).view = view;

    const keydownHandler = getKeydownHandler(spy);
    expect(keydownHandler).toBeDefined();

    const refreshSpy = vi
      .spyOn(view, "actionRefreshFeeds")
      .mockImplementation(async () => {});
    const nextSpy = vi
      .spyOn(view, "actionNavigateNext")
      .mockImplementation(() => {});
    const prevSpy = vi
      .spyOn(view, "actionNavigatePrevious")
      .mockImplementation(() => {});
    const markAllReadSpy = vi
      .spyOn(view, "actionMarkAllAsRead")
      .mockImplementation(() => {});
    const markReadAndNextSpy = vi
      .spyOn(view, "actionMarkReadAndNext")
      .mockImplementation(async () => {});

    const triggerKey = (key: string, shiftKey = false) => {
      const e = new KeyboardEvent("keydown", { key, shiftKey });
      Object.defineProperty(e, "target", { value: document.body }); // Not an input
      keydownHandler!(e);
    };

    // Test 'r'
    triggerKey("r");
    expect(refreshSpy).toHaveBeenCalled();

    // Test 'j'
    triggerKey("j");
    expect(nextSpy).toHaveBeenCalled();

    // Test 'k'
    triggerKey("k");
    expect(prevSpy).toHaveBeenCalled();

// Test 'Shift+A'
     triggerKey("A", true);
     expect(markAllReadSpy).toHaveBeenCalled();

     // Test ',' (mark read and next)
     triggerKey(",");
     expect(markReadAndNextSpy).toHaveBeenCalled();
   });

  it("ignores hotkeys if the view is not the active leaf", () => {
    const { view, spy } = makeViewWithRegisterSpy(leaf, plugin);
    // Leaf is active, but view is NOT the leaf's view
    (leaf as unknown as { view: unknown }).view = { app };

    const keydownHandler = getKeydownHandler(spy);
    expect(keydownHandler).toBeDefined();

    const refreshSpy = vi
      .spyOn(view, "actionRefreshFeeds")
      .mockImplementation(async () => {});

    const e = new KeyboardEvent("keydown", { key: "r" });
    Object.defineProperty(e, "target", { value: document.body });
    keydownHandler!(e);

    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("ignores hotkeys if an input is focused", () => {
    const { view, spy } = makeViewWithRegisterSpy(leaf, plugin);
    (leaf as unknown as { view: unknown }).view = view;

    const keydownHandler = getKeydownHandler(spy);
    expect(keydownHandler).toBeDefined();

    const refreshSpy = vi
      .spyOn(view, "actionRefreshFeeds")
      .mockImplementation(async () => {});

    const e = new KeyboardEvent("keydown", { key: "r" });
    const inputEl = document.createElement("input");
    Object.defineProperty(e, "target", { value: inputEl });

    keydownHandler!(e);

    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
