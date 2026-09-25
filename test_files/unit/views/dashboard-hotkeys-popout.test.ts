import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { JSDOM } from "jsdom";
import {
  installObsidianDomPolyfills,
  installWindowNodePolyfills,
  migrateElementToWindow,
} from "../test-dom-polyfills";
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

// A popout is a separate window with its own document and DOM classes, like
// the Electron window Obsidian opens for "Move to new window".
function openPopoutWindow(): Window {
  const popout = new JSDOM("<!doctype html><html><body></body></html>")
    .window as unknown as Window;
  installWindowNodePolyfills(popout);
  return popout;
}

function pressKey(
  target: EventTarget,
  win: Window,
  key: string,
  shiftKey = false,
) {
  const KeyboardEventCtor = (
    win as unknown as { KeyboardEvent: typeof KeyboardEvent }
  ).KeyboardEvent;
  target.dispatchEvent(
    new KeyboardEventCtor("keydown", { key, shiftKey, bubbles: true }),
  );
}

describe("DashboardView hotkeys in a popout window", () => {
  let app: App;
  let leaf: WorkspaceLeaf;
  let plugin: RssDashboardPlugin;
  let view: RssDashboardView;
  let popout: Window;

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
      vault: { on: vi.fn() },
    } as unknown as App;

    leaf = { app, view: null } as unknown as WorkspaceLeaf;
    plugin = {
      app,
      settings: JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS),
      ) as typeof DEFAULT_SETTINGS,
      saveSettings: vi.fn(),
      refreshFeeds: vi.fn().mockResolvedValue(undefined),
    } as unknown as RssDashboardPlugin;

    view = new RssDashboardView(leaf, plugin);
    (leaf as unknown as { view: unknown }).view = view;
    // The dashboard is the leaf the user last focused, in whichever window
    vi.mocked(app.workspace.getMostRecentLeaf).mockReturnValue(leaf);
    document.body.appendChild(view.containerEl);

    popout = openPopoutWindow();
  });

  afterEach(() => {
    view.unload();
    popout.close();
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("runs hotkeys pressed in the popout after the dashboard moves there", () => {
    const nextSpy = vi
      .spyOn(view, "actionNavigateNext")
      .mockImplementation(() => {});
    const focusSidebarSpy = vi
      .spyOn(view, "actionFocusSidebar")
      .mockImplementation(() => {});

    migrateElementToWindow(view.containerEl, popout);

    pressKey(popout.document.body, popout, "j");
    pressKey(popout.document.body, popout, "S", true);

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(focusSidebarSpy).toHaveBeenCalledTimes(1);
  });

  it("stops answering keys pressed in the main window once the dashboard is in a popout", () => {
    const nextSpy = vi
      .spyOn(view, "actionNavigateNext")
      .mockImplementation(() => {});

    migrateElementToWindow(view.containerEl, popout);
    pressKey(document.body, window, "j");

    expect(nextSpy).not.toHaveBeenCalled();
  });

  it("answers the main window again after the dashboard moves back", () => {
    const nextSpy = vi
      .spyOn(view, "actionNavigateNext")
      .mockImplementation(() => {});

    migrateElementToWindow(view.containerEl, popout);
    migrateElementToWindow(view.containerEl, window);
    pressKey(document.body, window, "j");
    pressKey(popout.document.body, popout, "j");

    expect(nextSpy).toHaveBeenCalledTimes(1);
  });

  it("lets an input in the popout keep the keys typed into it", () => {
    const nextSpy = vi
      .spyOn(view, "actionNavigateNext")
      .mockImplementation(() => {});

    migrateElementToWindow(view.containerEl, popout);
    // Created by the popout's own document, so it belongs to the popout's realm
    const input = popout.document.createEl("input");
    view.containerEl.appendChild(input);
    pressKey(input, popout, "j");

    expect(nextSpy).not.toHaveBeenCalled();
  });
  it("pauses hotkeys while a dialog is open in the popout", () => {
    const nextSpy = vi
      .spyOn(view, "actionNavigateNext")
      .mockImplementation(() => {});

    migrateElementToWindow(view.containerEl, popout);
    // Obsidian mounts every open modal as a .modal-container under <body>
    const modal = popout.document.createDiv({ cls: "modal-container" });
    popout.document.body.appendChild(modal);
    pressKey(popout.document.body, popout, "j");

    expect(nextSpy).not.toHaveBeenCalled();
  });

  it("keeps popout hotkeys working while a dialog is open in the main window", () => {
    const nextSpy = vi
      .spyOn(view, "actionNavigateNext")
      .mockImplementation(() => {});

    migrateElementToWindow(view.containerEl, popout);
    document.body.createDiv({ cls: "modal-container" });
    pressKey(popout.document.body, popout, "j");

    expect(nextSpy).toHaveBeenCalledTimes(1);
  });
});
