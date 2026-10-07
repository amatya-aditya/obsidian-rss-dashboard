import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import {
  Sidebar,
  type SidebarCallbacks,
  type SidebarOptions,
} from "../../../src/components/sidebar";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type Folder,
  type RssDashboardSettings,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
  setCssProps: (el: HTMLElement, props: Record<string, string>) => {
    for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
  },
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

type KeydownHandler = (e: KeyboardEvent) => void;

/**
 * The real RssDashboardView runs its real keydown handler against a real
 * Sidebar, so these tests cover the whole path from a key press to the row it
 * acts on. Only the sidebar callbacks are spies.
 */
describe("Dashboard sidebar hotkeys act only while the sidebar has keyboard focus", () => {
  let view: RssDashboardView;
  let keydown: KeydownHandler;
  let callbacks: SidebarCallbacks;
  let sidebar: Sidebar;

  const press = (key: string, shiftKey = false) => {
    const e = new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(e, "target", { value: document.body });
    keydown(e);
  };

  const confirmModals = () =>
    document.body.querySelectorAll(".rss-sidebar-confirm-modal");
  const closeModals = () => {
    document.body
      .querySelectorAll<HTMLElement>(".modal-container")
      .forEach((el) => el.remove());
  };

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();

    const app = {
      workspace: {
        on: vi.fn(),
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        getMostRecentLeaf: vi.fn(),
      },
      vault: { on: vi.fn() },
    } as unknown as App;
    const leaf = { app } as unknown as WorkspaceLeaf;

    const settings = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as RssDashboardSettings;
    settings.folders = [
      { name: "Folder 1", subfolders: [] },
      { name: "Folder 2", subfolders: [] },
    ] as Folder[];
    settings.feeds = [
      {
        title: "Feed 1",
        url: "https://example.com/feed-1.xml",
        folder: "Folder 1",
        items: [{ read: false }],
      } as Feed,
      {
        title: "Feed 2",
        url: "https://example.com/feed-2.xml",
        folder: "Folder 2",
        items: [{ read: false }],
      } as Feed,
    ];
    settings.collapsedFolders = [];

    const plugin = {
      app,
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      updatePlaybackProgress: vi.fn(),
      refreshFeeds: vi.fn().mockResolvedValue(undefined),
      getFeedShardHealth: vi.fn().mockReturnValue(null),
      globalRefreshProgress: { completed: 0, total: 0 },
    } as unknown as RssDashboardPlugin;

    const registerSpy = vi.spyOn(
      RssDashboardView.prototype as unknown as {
        registerDomEvent: (...args: unknown[]) => void;
      },
      "registerDomEvent",
    );
    view = new RssDashboardView(leaf, plugin);
    (leaf as unknown as { view: unknown }).view = view;
    vi.mocked(app.workspace.getMostRecentLeaf).mockReturnValue(leaf);
    const call = registerSpy.mock.calls.find(
      (c) => c[0] === activeDocument && c[1] === "keydown",
    );
    keydown = call?.[2] as KeydownHandler;

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
    };
    const options: SidebarOptions = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
    };
    const sidebarContainer = document.body.createDiv();
    sidebar = new Sidebar(
      app,
      sidebarContainer,
      plugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();
    (view as unknown as { sidebar: Sidebar }).sidebar = sidebar;
  });

  afterEach(() => {
    closeModals();
    vi.restoreAllMocks();
  });

  // Shift+S focuses the sidebar on All feeds; Shift+L twice reaches Feed 1.
  const focusFeed1 = () => {
    press("S", true);
    press("L", true);
    press("L", true);
  };

  it("deletes the focused feed on Shift+D while the sidebar has focus", () => {
    focusFeed1();
    press("D", true);

    expect(confirmModals()).toHaveLength(1);
    expect(confirmModals()[0]?.textContent).toContain("Feed 1");
  });

  it("ignores Shift+D after an article key hands the keyboard back to the dashboard", () => {
    focusFeed1();
    press(" "); // Space selects without opening, so the mocked workspace needs no leaf
    press("D", true);

    expect(confirmModals()).toHaveLength(0);
  });

  it("ignores Shift+D after Shift+O opened the focused row", () => {
    focusFeed1();
    press("O", true);
    expect(callbacks.onFeedClick).toHaveBeenCalledTimes(1);
    press("D", true);

    expect(confirmModals()).toHaveLength(0);
  });

  it("ignores Shift+D after a click outside the sidebar blurs it", () => {
    focusFeed1();
    sidebar.blurSidebarFocus();
    press("D", true);

    expect(confirmModals()).toHaveLength(0);
  });

  it("ignores Shift+O and Shift+Enter once focus is back on the dashboard", () => {
    focusFeed1();
    press(" ");
    press("O", true);
    press("Enter", true);

    expect(callbacks.onFeedClick).not.toHaveBeenCalled();
    expect(callbacks.onFolderClick).not.toHaveBeenCalled();
  });

  it("ignores Shift+X once focus is back on the dashboard", () => {
    press("S", true);
    press("L", true);
    press(" ");
    press("X", true);

    expect(callbacks.onToggleFolderCollapse).not.toHaveBeenCalled();
  });

  it("toggles the focused folder on Shift+X while the sidebar has focus", () => {
    press("S", true);
    press("L", true);
    press("X", true);

    expect(callbacks.onToggleFolderCollapse).toHaveBeenCalledWith("Folder 1");
  });

  it("opens the focused feed on Shift+Enter while the sidebar has focus", () => {
    focusFeed1();
    press("Enter", true);

    expect(callbacks.onFeedClick).toHaveBeenCalledTimes(1);
  });

  it("resumes at the remembered row when Shift+S focuses the sidebar again", () => {
    focusFeed1();
    press(" ");
    press("S", true);
    press("D", true);

    expect(confirmModals()).toHaveLength(1);
    expect(confirmModals()[0]?.textContent).toContain("Feed 1");
  });
});
