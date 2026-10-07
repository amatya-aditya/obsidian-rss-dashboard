import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { ReaderView } from "../../../src/views/reader-view";
import type RssDashboardPlugin from "../../../main";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: any[]) {}
    render(): void {}
    destroy(): void {}
    refilter(..._args: any[]): void {}
    setSelectedArticle(..._args: any[]): void {}
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
    constructor(..._args: any[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
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
    constructor(..._args: any[]) {}
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
    RssDashboardView.prototype as unknown as {
      registerDomEvent: (...args: unknown[]) => void;
    },
    "registerDomEvent",
  );
  const view = new RssDashboardView(leaf, plugin);
  // Skip render() — hotkey tests don't exercise the article rendering pipeline
  (view as unknown as { render: () => void }).render = vi.fn();
  return { view, spy };
}

/**
 * Extract the handler registered for (activeDocument, "keydown") from the prototype spy.
 */
function getKeydownHandler(spy: unknown): ((e: KeyboardEvent) => void) | null {
  const mockSpy = spy as { mock: { calls: unknown[][] } };
  for (const call of mockSpy.mock.calls) {
    if (call[0] === activeDocument && call[1] === "keydown") {
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
        getMostRecentLeaf: vi.fn(),
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
      settings: JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS),
      ) as typeof DEFAULT_SETTINGS,
      saveSettings: vi.fn(),
      updatePlaybackProgress: vi.fn(),
      refreshFeeds: vi.fn().mockResolvedValue(undefined),
    } as unknown as RssDashboardPlugin;

    // getMostRecentLeaf setup so Guard 1 passes
    vi.mocked(app.workspace.getMostRecentLeaf).mockReturnValue(leaf);
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
      activeDocument,
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

    // Test Space (next, select only) and Shift+Space (previous, select only)
    triggerKey(" ");
    expect(nextSpy).toHaveBeenCalledWith();
    triggerKey(" ", true);
    expect(prevSpy).toHaveBeenCalledWith();

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
    const inputEl = createEl("input");
    Object.defineProperty(e, "target", { value: inputEl });

    keydownHandler!(e);

    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["a native button", () => createEl("button")],
    [
      "a custom combobox",
      () => createDiv({ attr: { role: "combobox", tabindex: "0" } }),
    ],
  ])(
    "does not run the article-open hotkey when Enter is pressed on %s",
    (_label, makeTarget) => {
      const { view, spy } = makeViewWithRegisterSpy(leaf, plugin);
      (leaf as unknown as { view: unknown }).view = view;

      const keydownHandler = getKeydownHandler(spy);
      const openArticleSpy = vi.spyOn(view, "actionToggleArticleOpen");
      const target = makeTarget();
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "target", { value: target });

      keydownHandler!(event);

      expect(openArticleSpy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    },
  );

  it("ignores dashboard hotkeys while a modal is open", () => {
    const { view, spy } = makeViewWithRegisterSpy(leaf, plugin);
    (leaf as unknown as { view: unknown }).view = view;
    const keydownHandler = getKeydownHandler(spy);

    const moveSpy = vi
      .spyOn(view, "actionSidebarMoveNext")
      .mockImplementation(() => {});
    const deleteSpy = vi
      .spyOn(view, "actionSidebarDeleteFocused")
      .mockImplementation(() => {});

    // Obsidian mounts every open modal as a .modal-container under <body>.
    const modalContainer = document.body.createDiv({ cls: "modal-container" });
    const okButton = modalContainer.createEl("button");

    const fromButton = new KeyboardEvent("keydown", {
      key: "D",
      shiftKey: true,
    });
    Object.defineProperty(fromButton, "target", { value: okButton });
    keydownHandler!(fromButton);

    // Focus can also sit outside the modal (e.g. before it takes focus).
    const fromBody = new KeyboardEvent("keydown", { key: "L", shiftKey: true });
    Object.defineProperty(fromBody, "target", { value: document.body });
    keydownHandler!(fromBody);

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(moveSpy).not.toHaveBeenCalled();
    expect(fromButton.defaultPrevented).toBe(false);

    modalContainer.remove();
    keydownHandler!(new KeyboardEvent("keydown", { key: "L", shiftKey: true }));
    expect(moveSpy).toHaveBeenCalledTimes(1);
  });

  describe("article navigation keys", () => {
    function setup() {
      const { view, spy } = makeViewWithRegisterSpy(leaf, plugin);
      (leaf as unknown as { view: unknown }).view = view;
      const keydownHandler = getKeydownHandler(spy)!;
      const nextSpy = vi
        .spyOn(view, "actionNavigateNext")
        .mockImplementation(() => {});
      const prevSpy = vi
        .spyOn(view, "actionNavigatePrevious")
        .mockImplementation(() => {});
      // Spy on the selection path so a stray "select" is visible.
      const selectSpy = vi
        .spyOn(
          view as unknown as { selectArticle: () => Promise<void> },
          "selectArticle",
        )
        .mockResolvedValue(undefined);
      const press = (key: string, shiftKey = false) => {
        const e = new KeyboardEvent("keydown", {
          key,
          shiftKey,
          cancelable: true,
        });
        Object.defineProperty(e, "target", { value: document.body });
        keydownHandler(e);
        return e;
      };
      return { view, nextSpy, prevSpy, selectSpy, press };
    }

    function openReaderLeaf() {
      // The module is mocked above as an empty class, so construct it bare.
      const readerView = new (
        ReaderView as unknown as new () => {
          actionToggleArticleOpen: ReturnType<typeof vi.fn>;
        }
      )();
      readerView.actionToggleArticleOpen = vi.fn();
      const readerLeaf = { view: readerView, detach: vi.fn() };
      vi.mocked(app.workspace.getLeavesOfType).mockImplementation(
        (type: string) =>
          (type === "rss-reader-view" ? [readerLeaf] : []) as never,
      );
      return { readerView, readerLeaf };
    }

    it.each([
      ["closed", false],
      ["open", true],
    ])(
      "j opens the previous article and l opens the next one with the Reader %s",
      (_label, readerOpen) => {
        const { nextSpy, prevSpy, press } = setup();
        if (readerOpen) openReaderLeaf();

        const jEvent = press("j");
        expect(prevSpy).toHaveBeenCalledTimes(1);
        expect(prevSpy).toHaveBeenCalledWith({ open: true });
        expect(nextSpy).not.toHaveBeenCalled();
        expect(jEvent.defaultPrevented).toBe(true);

        const lEvent = press("l");
        expect(nextSpy).toHaveBeenCalledTimes(1);
        expect(nextSpy).toHaveBeenCalledWith({ open: true });
        expect(prevSpy).toHaveBeenCalledTimes(1);
        expect(lEvent.defaultPrevented).toBe(true);
      },
    );

    it("keeps Space and Shift+Space as next and previous without opening", () => {
      const { nextSpy, prevSpy, press } = setup();

      press(" ");
      press(" ", true);

      expect(nextSpy).toHaveBeenCalledWith();
      expect(prevSpy).toHaveBeenCalledWith();
    });

    it("k closes the Reader when it is open and selects nothing", () => {
      const { nextSpy, prevSpy, selectSpy, press } = setup();
      const { readerView, readerLeaf } = openReaderLeaf();

      const event = press("k");

      expect(readerView.actionToggleArticleOpen).toHaveBeenCalledTimes(1);
      expect(readerLeaf.detach).not.toHaveBeenCalled();
      expect(prevSpy).not.toHaveBeenCalled();
      expect(nextSpy).not.toHaveBeenCalled();
      expect(selectSpy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it("k does nothing and selects nothing when the Reader is closed", () => {
      const { nextSpy, prevSpy, selectSpy, press } = setup();

      press("k");

      expect(prevSpy).not.toHaveBeenCalled();
      expect(nextSpy).not.toHaveBeenCalled();
      expect(selectSpy).not.toHaveBeenCalled();
    });

    it("k closes a Reader leaf whose view has not loaded yet", () => {
      const { press } = setup();
      const readerLeaf = { view: {}, detach: vi.fn() };
      vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([
        readerLeaf,
      ] as never);

      press("k");

      expect(readerLeaf.detach).toHaveBeenCalledTimes(1);
    });

    it("leaves Shift+J and Shift+L on the sidebar", () => {
      const { view, nextSpy, prevSpy, press } = setup();
      const sidebarNext = vi
        .spyOn(view, "actionSidebarMoveNext")
        .mockImplementation(() => {});
      const sidebarPrev = vi
        .spyOn(view, "actionSidebarMovePrevious")
        .mockImplementation(() => {});

      press("L", true);
      press("J", true);

      expect(sidebarNext).toHaveBeenCalledTimes(1);
      expect(sidebarPrev).toHaveBeenCalledTimes(1);
      expect(nextSpy).not.toHaveBeenCalled();
      expect(prevSpy).not.toHaveBeenCalled();
    });
  });
});
