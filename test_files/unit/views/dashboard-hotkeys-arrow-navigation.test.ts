import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import {
  createArticleListInstance,
  createDefaultSettings,
  createMockCallbacks,
  mockRAF,
  originalRAF,
  ResizeObserverMock,
} from "../components/article-list-component-fixtures";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type { FeedItem } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";

vi.mock("../../../src/utils/platform-utils", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/utils/platform-utils")
  >()),
  robustFetch: vi.fn(),
  shouldUseMobileSidebarLayout: () => false,
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

// Private members the test fakes or reads; the view keeps them private.
interface ViewInternals {
  getFilteredArticles(): FeedItem[];
  getCurrentPage(): number;
  getCurrentPageSize(): number;
  openSelectedArticle(article: FeedItem): Promise<void>;
  articleList: unknown;
  selectedArticle: FeedItem | null;
}

type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function makeArticles(count: number): FeedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    guid: `g${i + 1}`,
    title: `Article ${i + 1}`,
    link: `link${i + 1}`,
    description: `desc${i + 1}`,
    pubDate: new Date().toISOString(),
    read: false,
    starred: false,
    feedTitle: "Feed",
    feedUrl: "feed",
    coverImage: "",
    tags: [],
  })) as FeedItem[];
}

describe("DashboardView arrow keys outside card view", () => {
  let view: RssDashboardView;
  let plugin: RssDashboardPlugin;
  let articles: FeedItem[];
  let listContainer: HTMLElement;
  let scrollIntoViewSpy: Mock<() => void>;

  // Dispatches a real bubbling keydown from <body> and returns the event so a
  // test can read whether the dashboard cancelled it.
  function press(key: ArrowKey): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    return event;
  }

  function selectedGuid(): string | undefined {
    return listContainer
      .querySelector(".rss-dashboard-article-item.active")
      ?.id.replace("article-", "");
  }

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    // jsdom has no CSS.escape, which ArticleList uses to find the row by id.
    (window as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
      escape: (s: string) => s.replace(/([^\w-])/g, "\\$1"),
    };
    // ArticleList scrolls selection from a requestAnimationFrame render pass.
    window.requestAnimationFrame = mockRAF;
    (
      window as unknown as { ResizeObserver: typeof ResizeObserver }
    ).ResizeObserver = ResizeObserverMock;
    scrollIntoViewSpy = vi.fn<() => void>();
    Element.prototype.scrollIntoView = scrollIntoViewSpy;

    const app = {
      workspace: {
        on: vi.fn(),
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        getActiveViewOfType: vi.fn(),
      },
      vault: { on: vi.fn() },
    } as unknown as App;
    const leaf = { app, view: null } as unknown as WorkspaceLeaf;
    plugin = {
      app,
      settings: JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS),
      ) as typeof DEFAULT_SETTINGS,
      saveSettings: vi.fn(),
      refreshFeeds: vi.fn().mockResolvedValue(undefined),
    } as unknown as RssDashboardPlugin;
    plugin.settings.viewStyle = "list";

    view = new RssDashboardView(leaf, plugin);
    (leaf as unknown as { view: unknown }).view = view;
    vi.mocked(app.workspace.getActiveViewOfType).mockReturnValue(view);
    document.body.appendChild(view.containerEl);

    // Page 1 of one page holds all five articles; the real ArticleList draws
    // the rows so selection and scrolling are observable in the DOM.
    articles = makeArticles(5);
    const internals = view as unknown as ViewInternals;
    const proto = RssDashboardView.prototype as unknown as ViewInternals;
    vi.spyOn(proto, "getFilteredArticles").mockImplementation(() => articles);
    vi.spyOn(proto, "getCurrentPage").mockReturnValue(1);
    vi.spyOn(proto, "getCurrentPageSize").mockReturnValue(10);

    listContainer = document.body.createDiv();
    const listSettings = createDefaultSettings();
    listSettings.viewStyle = "list";
    const list = createArticleListInstance(
      listContainer,
      listSettings,
      articles,
      createMockCallbacks(),
      null,
      articles.length,
    );
    list.render();
    internals.articleList = list;
    scrollIntoViewSpy.mockClear();
  });

  afterEach(() => {
    view.unload();
    document.body.empty();
    window.requestAnimationFrame = originalRAF;
    vi.restoreAllMocks();
  });

  it("selects the first article on Down when nothing is selected yet", () => {
    const event = press("ArrowDown");

    expect(selectedGuid()).toBe("g1");
    expect(event.defaultPrevented).toBe(true);
  });

  it("moves the selection down and scrolls the selected row into view in list view", () => {
    press("ArrowDown");
    scrollIntoViewSpy.mockClear();

    const event = press("ArrowDown");

    expect(selectedGuid()).toBe("g2");
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewSpy.mock.instances[0]).toBe(
      listContainer.querySelector("#article-g2"),
    );
    expect(event.defaultPrevented).toBe(true);
  });

  it("moves the selection up and scrolls the selected row into view in list view", () => {
    press("ArrowDown");
    press("ArrowDown");
    press("ArrowDown");
    scrollIntoViewSpy.mockClear();

    const event = press("ArrowUp");

    expect(selectedGuid()).toBe("g2");
    expect(scrollIntoViewSpy.mock.instances[0]).toBe(
      listContainer.querySelector("#article-g2"),
    );
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not open the article when an arrow moves the selection", () => {
    const openSpy = vi
      .spyOn(
        RssDashboardView.prototype as unknown as ViewInternals,
        "openSelectedArticle",
      )
      .mockResolvedValue(undefined);

    press("ArrowDown");
    press("ArrowDown");

    expect(openSpy).not.toHaveBeenCalled();
  });

  it("stays on the last article when Down is pressed at the end of the list", () => {
    for (let i = 0; i < articles.length + 2; i++) press("ArrowDown");

    expect(selectedGuid()).toBe("g5");
  });

  it("stays on the first article when Up is pressed at the start of the list", () => {
    press("ArrowDown");
    press("ArrowUp");
    press("ArrowUp");

    expect(selectedGuid()).toBe("g1");
  });

  it("steps the selection the same way in feed view", () => {
    plugin.settings.viewStyle = "feed";
    press("ArrowDown");

    const event = press("ArrowDown");

    expect((view as unknown as ViewInternals).selectedArticle?.guid).toBe("g2");
    expect(event.defaultPrevented).toBe(true);
  });

  it.each(["ArrowLeft", "ArrowRight"] as const)(
    "leaves %s uncancelled and the selection alone in list view",
    (key) => {
      press("ArrowDown");

      const event = press(key);

      expect(event.defaultPrevented).toBe(false);
      expect(selectedGuid()).toBe("g1");
    },
  );

  it.each(["ArrowLeft", "ArrowRight"] as const)(
    "leaves %s uncancelled in feed view",
    (key) => {
      plugin.settings.viewStyle = "feed";

      expect(press(key).defaultPrevented).toBe(false);
    },
  );

  it("keeps cancelling all four arrows in card view", () => {
    plugin.settings.viewStyle = "card";
    const nav = vi.spyOn(
      (
        view as unknown as {
          articleList: { getCardNavigationTargetGuid: () => string | null };
        }
      ).articleList,
      "getCardNavigationTargetGuid",
    );
    nav.mockReturnValue("g3");
    press("ArrowDown");

    for (const key of [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ] as const) {
      expect(press(key).defaultPrevented).toBe(true);
    }
    expect(nav).toHaveBeenCalledWith("g1", "up");
    expect(selectedGuid()).toBe("g3");
  });

  it("moves the sidebar row, not the article selection, when the sidebar has focus", () => {
    vi.spyOn(view, "isSidebarFocused").mockReturnValue(true);
    const moveNext = vi
      .spyOn(view, "actionSidebarMoveNext")
      .mockImplementation(() => {});
    const movePrevious = vi
      .spyOn(view, "actionSidebarMovePrevious")
      .mockImplementation(() => {});

    const down = press("ArrowDown");
    const up = press("ArrowUp");

    expect(moveNext).toHaveBeenCalledTimes(1);
    expect(movePrevious).toHaveBeenCalledTimes(1);
    expect(down.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);
    expect(selectedGuid()).toBeUndefined();
  });
});
