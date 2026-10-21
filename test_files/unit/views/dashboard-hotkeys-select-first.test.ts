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
import type { RssDashboardSettings, FeedItem } from "../../../src/types/types";
import type { Feed } from "../../../src/types/types";
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
  openSelectedArticle(article: FeedItem): Promise<void>;
  currentFolder: string | null;
  currentFeed: Feed | null;
  selectedTags: string[];
  activeStatusFilters: Set<string>;
  activeTagFilters: Set<string>;
  allArticlesPage: number;
  unreadArticlesPage: number;
  feedPages: Record<string, number>;
  folderPages: Record<string, number>;
  selectedArticle: FeedItem | null;
  articleList: { setSelectedArticle(article: FeedItem): void };
}

const PAGE_SIZE = 10;
// Three pages of ten in one scope: page 3 exists, so the key has a page to
// leave, and the rows on page 1 are the first ten articles.
const SCOPE_SIZE = 25;

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

interface PressOptions {
  key?: string;
  target?: HTMLElement;
  ctrlKey?: boolean;
  repeat?: boolean;
}

describe("Dashboard backquote selects the first article of the scope (#1465)", () => {
  let view: RssDashboardView;
  let plugin: RssDashboardPlugin;
  let internals: ViewInternals;
  let articles: FeedItem[];
  let settings: RssDashboardSettings;
  let listContainer: HTMLElement;
  let listRenderSpy: ReturnType<typeof vi.spyOn>;
  let scrollIntoViewSpy: Mock<() => void>;

  // A real bubbling keydown from a target inside the document, so the press
  // travels through the dashboard's own listener as it does in Obsidian.
  function press(options: PressOptions = {}): KeyboardEvent {
    const target = options.target ?? document.body;
    const event = new KeyboardEvent("keydown", {
      key: options.key ?? "`",
      ctrlKey: options.ctrlKey ?? false,
      repeat: options.repeat ?? false,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
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
    // The page change waits one frame before selecting; run it inline.
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
    plugin.settings.allArticlesPageSize = PAGE_SIZE;
    plugin.settings.unreadArticlesPageSize = PAGE_SIZE;
    settings = plugin.settings;

    view = new RssDashboardView(leaf, plugin);
    (leaf as unknown as { view: unknown }).view = view;
    vi.mocked(app.workspace.getActiveViewOfType).mockReturnValue(view);
    document.body.appendChild(view.containerEl);
    // The page change asks for a real render; the rows below stand in for
    // page 1 so the selection is observable in the DOM.
    vi.spyOn(view, "render").mockResolvedValue(undefined);

    articles = makeArticles(SCOPE_SIZE);
    internals = view as unknown as ViewInternals;
    const proto = RssDashboardView.prototype as unknown as ViewInternals;
    vi.spyOn(proto, "getFilteredArticles").mockImplementation(() => articles);

    // An unread status scope sitting on its third page, so the key has to
    // move the view back to page 1 before it can select anything.
    internals.currentFolder = "unread";
    internals.unreadArticlesPage = 3;

    listContainer = document.body.createDiv();
    const listSettings = createDefaultSettings();
    listSettings.viewStyle = "list";
    const list = createArticleListInstance(
      listContainer,
      listSettings,
      articles.slice(0, PAGE_SIZE),
      createMockCallbacks(),
      null,
      SCOPE_SIZE,
    );
    list.render();
    listRenderSpy = vi.spyOn(list, "render");
    internals.articleList = list;
    scrollIntoViewSpy.mockClear();
  });

  afterEach(() => {
    view.unload();
    document.body.empty();
    window.requestAnimationFrame = originalRAF;
    vi.restoreAllMocks();
  });

  it("returns a later page to page 1 and selects its first article", () => {
    const event = press();

    expect(internals.unreadArticlesPage).toBe(1);
    expect(internals.selectedArticle?.guid).toBe("g1");
    expect(selectedGuid()).toBe("g1");
    expect(event.defaultPrevented).toBe(true);
  });

  it("selects without opening the Reader or a split", () => {
    const openSpy = vi
      .spyOn(
        RssDashboardView.prototype as unknown as ViewInternals,
        "openSelectedArticle",
      )
      .mockResolvedValue(undefined);
    const leavesSpy = vi.mocked(view.app.workspace.getLeavesOfType);
    leavesSpy.mockClear();

    press();

    expect(openSpy).not.toHaveBeenCalled();
    expect(leavesSpy).not.toHaveBeenCalled();
  });

  it("scrolls the selected article into view", () => {
    press();

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewSpy.mock.instances[0]).toBe(
      listContainer.querySelector("#article-g1"),
    );
  });

  it("selects the first article on page 1 without re-paginating", () => {
    internals.unreadArticlesPage = 1;
    internals.articleList.setSelectedArticle(articles[4]);
    vi.mocked(view.render).mockClear();

    const event = press();

    expect(view.render).not.toHaveBeenCalled();
    expect(internals.unreadArticlesPage).toBe(1);
    expect(internals.selectedArticle?.guid).toBe("g1");
    expect(selectedGuid()).toBe("g1");
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves the folder, filters, search, page and page size untouched", () => {
    internals.selectedTags = ["tag1"];
    internals.activeStatusFilters = new Set(["unread"]);
    internals.activeTagFilters = new Set(["tag1"]);
    const searchInput = listContainer.querySelector<HTMLInputElement>(
      ".rss-dashboard-article-search-input",
    );
    expect(searchInput, "the article search box").not.toBeNull();
    // "article" matches every row, so the search narrows nothing away but the
    // list is left holding a live query.
    searchInput!.value = "article";
    searchInput!.dispatchEvent(new Event("input"));
    const rowsBefore = listContainer.querySelectorAll(
      ".rss-dashboard-article-item",
    ).length;
    listRenderSpy.mockClear();

    press();

    expect(internals.currentFolder).toBe("unread");
    expect(internals.selectedTags).toEqual(["tag1"]);
    expect([...internals.activeStatusFilters]).toEqual(["unread"]);
    expect([...internals.activeTagFilters]).toEqual(["tag1"]);
    expect(settings.unreadArticlesPageSize).toBe(PAGE_SIZE);
    expect(internals.unreadArticlesPage).toBe(1);
    expect(listRenderSpy).not.toHaveBeenCalled();
    expect(
      listContainer.querySelectorAll(".rss-dashboard-article-item").length,
    ).toBe(rowsBefore);
    expect(searchInput?.value).toBe("article");
    expect(selectedGuid()).toBe("g1");
  });

  it("leaves the key unhandled, the sidebar focus alone, and selects nothing when the scope is empty", () => {
    vi.spyOn(
      RssDashboardView.prototype as unknown as ViewInternals,
      "getFilteredArticles",
    ).mockReturnValue([]);
    vi.mocked(view.render).mockClear();
    const blur = vi.fn();
    view.sidebar = {
      blurSidebarFocus: blur,
    } as unknown as typeof view.sidebar;

    const event = press();

    expect(event.defaultPrevented).toBe(false);
    expect(internals.selectedArticle).toBeNull();
    expect(selectedGuid()).toBeUndefined();
    expect(internals.unreadArticlesPage).toBe(3);
    expect(view.render).not.toHaveBeenCalled();
    // An unhandled press changes nothing at all, focus included.
    expect(blur).not.toHaveBeenCalled();
  });

  it.each([
    {
      scope: "a feed page",
      arrange: () => {
        internals.currentFolder = null;
        internals.currentFeed = { url: "feed-url" } as Feed;
        internals.feedPages["feed-url"] = 2;
      },
      page: () => internals.feedPages["feed-url"],
    },
    {
      scope: "a folder page",
      arrange: () => {
        internals.currentFeed = null;
        internals.currentFolder = "News";
        internals.folderPages["News"] = 2;
      },
      page: () => internals.folderPages["News"],
    },
    {
      scope: "a status-filter page",
      arrange: () => {
        internals.currentFeed = null;
        internals.currentFolder = "unread";
        internals.unreadArticlesPage = 2;
      },
      page: () => internals.unreadArticlesPage,
    },
  ])(
    "returns $scope to page 1 and selects its first article",
    ({ arrange, page }) => {
      arrange();
      expect(page()).toBe(2);

      press();

      expect(page()).toBe(1);
      expect(internals.selectedArticle?.guid).toBe("g1");
    },
  );

  it("acts once for a held key: the repeat press changes nothing", () => {
    const event = press({ repeat: true });

    // The row is not a repeat binding, so a held key acts once and the press
    // is still swallowed.
    expect(event.defaultPrevented).toBe(true);
    expect(internals.unreadArticlesPage).toBe(3);
    expect(internals.selectedArticle).toBeNull();
  });

  it.each([
    [
      "another view is active",
      () => {
        vi.mocked(view.app.workspace.getActiveViewOfType).mockReturnValue(null);
        return document.body;
      },
    ],
    [
      "a modal is open",
      () => {
        document.body.createDiv({ cls: "modal-container" });
        return document.body;
      },
    ],
    [
      "focus sits in an input",
      () => {
        const input = document.body.createEl("input");
        input.focus();
        return input;
      },
    ],
    [
      "focus sits in an editor",
      () => {
        const editor = document.body.createDiv({ cls: "cm-content" });
        editor.setAttribute("contenteditable", "true");
        return editor;
      },
    ],
  ])("does nothing when %s", (_label, arrange) => {
    const target = arrange();

    const event = press({ target });

    expect(event.defaultPrevented).toBe(false);
    expect(internals.unreadArticlesPage).toBe(3);
    expect(internals.selectedArticle).toBeNull();
  });

  it("does nothing while Ctrl, Cmd or Alt is held", () => {
    for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
      const event = new KeyboardEvent("keydown", {
        key: "`",
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(event);

      expect(event.defaultPrevented, modifier).toBe(false);
    }
    expect(internals.unreadArticlesPage).toBe(3);
    expect(internals.selectedArticle).toBeNull();
  });
});
