// The keyboard route to an article's cover-image action (#1466): Shift+C on
// the selected card runs whatever the visible control and the context menu
// would, resolved at the moment of the press, so a fetch and a restore
// alternate. The tests drive a real keydown through the dashboard's own
// listener, and pin that a restore asks the page for nothing.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { App, Menu, WorkspaceLeaf } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  mockRAF,
  originalRAF,
  ResizeObserverMock,
} from "../components/article-list-component-fixtures";
import { ArticleList } from "../../../src/components/article-list";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

vi.mock("../../../src/utils/platform-utils", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/utils/platform-utils")
  >()),
  robustFetch: vi.fn(),
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    clearFolderPathCache(): void {}
    focusSidebar(): void {}
    hasKeyboardFocus(): boolean {
      return false;
    }
    blurSidebarFocus(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor(..._args: unknown[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor(..._args: unknown[]) {}
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
    constructor(..._args: unknown[]) {}
    verifyAllSavedArticles(..._args: unknown[]): void {}
  },
}));

const FEED_URL = "https://example.com/feed.xml";
const PAGE_IMAGE = "https://page.example.com/hero.jpg";
const FEED_IMAGE = "https://img.example.com/feed.jpg";
const COVER_FETCH_LABEL = "Fetch and replace cover image";
const COVER_REPLACE_LABEL = "Replace cover image from the fetch";
const COVER_RESTORE_LABEL = "Restore cover image from feed";
const COVER_REMOVE_LABEL = "Remove fetched cover image";
// The control names the key beside its sentence (#1467); menu items keep it.
const COVER_HINT = " (Shift + c)";
const COVER_BUTTON = ".rss-dashboard-fetch-cover-button";
const FETCHING_CLASS = "rss-dashboard-cover-fetching";

// Private members the test wires or reads; the view keeps them private.
type ArticleListInstance = InstanceType<typeof ArticleList>;

interface ViewInternals {
  selectedArticle: FeedItem | null;
  articleList: ArticleListInstance | null;
  buildArticleListCallbacks(): ConstructorParameters<typeof ArticleList>[6];
}

interface HarnessOptions {
  article?: Partial<FeedItem>;
  viewStyle?: "card" | "feed" | "list";
  showCoverImage?: boolean;
  select?: boolean;
  restorer?: boolean;
}

interface Harness {
  view: RssDashboardView;
  article: FeedItem;
  list: ArticleListInstance;
  settings: RssDashboardSettings;
  plugin: {
    settings: RssDashboardSettings;
    updateArticle: MockInstance;
    fetchPageCoverImage: MockInstance;
    warmCoverImage: MockInstance;
    toggleYouTubeFocusMode: MockInstance;
  };
  press: () => KeyboardEvent;
  articleEl: () => HTMLElement | null;
  coverLabel: () => string | null;
  cleanup: () => void;
}

function makeArticle(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Item",
    link: "https://example.com/a",
    description: "",
    pubDate: "2026-05-12T00:00:00.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: FEED_URL,
    coverImage: "",
    ...overrides,
  };
}

function makeFeed(items: FeedItem[]): Feed {
  return {
    title: "Feed",
    url: FEED_URL,
    folder: "",
    items,
    lastUpdated: 0,
  };
}

describe("Shift+C runs the selected article's cover-image action (#1466)", () => {
  let noticeLog: MockInstance;

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    // jsdom has no CSS.escape, which ArticleList uses to find the row by id.
    (window as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
      escape: (s: string) => s.replace(/([^\w-])/g, "\\$1"),
    };
    // Run the list's deferred scroll work inline instead of a later frame.
    window.requestAnimationFrame = mockRAF;
    (
      window as unknown as { ResizeObserver: typeof ResizeObserver }
    ).ResizeObserver = ResizeObserverMock;
    Element.prototype.scrollIntoView = vi.fn();
    noticeLog = vi.spyOn(console, "debug");
    noticeLog.mockClear();
  });

  afterEach(() => {
    document.body.empty();
    window.requestAnimationFrame = originalRAF;
    vi.restoreAllMocks();
  });

  function makeHarness(options: HarnessOptions = {}): Harness {
    const article = makeArticle(options.article);
    const settings = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as RssDashboardSettings;
    settings.viewStyle = options.viewStyle ?? "card";
    settings.display.showCoverImage = options.showCoverImage ?? true;
    settings.feeds = [makeFeed([article])];

    const app = {
      workspace: {
        on: vi.fn(),
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        getActiveViewOfType: vi.fn(),
        trigger: vi.fn(),
      },
      vault: { on: vi.fn() },
    } as unknown as App;
    const leaf = { app, view: null } as unknown as WorkspaceLeaf;

    const plugin = {
      app,
      settings,
      saveSettings: vi.fn(async () => {}),
      updateArticle: vi.fn(async () => {}),
      fetchPageCoverImage: vi.fn(async () => ({
        status: "found" as const,
        url: PAGE_IMAGE,
      })),
      warmCoverImage: vi.fn(),
      toggleYouTubeFocusMode: vi.fn(),
      resolveCachedImageUrl: (url: string) => url,
      refreshFeeds: vi.fn().mockResolvedValue(undefined),
      openTagsSettings: vi.fn(),
      refreshOpenTagColorViews: vi.fn(),
    };
    const view = new RssDashboardView(leaf, plugin as never);
    (leaf as unknown as { view: unknown }).view = view;
    vi.mocked(app.workspace.getActiveViewOfType).mockReturnValue(view);
    document.body.appendChild(view.containerEl);

    const internals = view as unknown as ViewInternals;
    const callbacks = internals.buildArticleListCallbacks();
    if (options.restorer === false) delete callbacks.onRestoreCoverImage;

    const listContainer = view.containerEl.createDiv();
    const list = new ArticleList(
      listContainer,
      settings,
      "All articles",
      null,
      [article],
      article,
      callbacks,
      1,
      1,
      10,
      1,
      new Set(),
      new Set(),
      "OR",
      null,
      true,
      app,
    );
    list.render();

    internals.articleList = list;
    internals.selectedArticle = options.select === false ? null : article;

    return {
      view,
      article,
      list,
      settings,
      plugin,
      press: () => {
        const event = new KeyboardEvent("keydown", {
          key: "C",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        document.body.dispatchEvent(event);
        return event;
      },
      articleEl: () =>
        listContainer.querySelector<HTMLElement>("#article-guid-1"),
      coverLabel: () =>
        listContainer
          .querySelector<HTMLElement>(COVER_BUTTON)
          ?.getAttribute("aria-label") ?? null,
      cleanup: () => {
        list.destroy();
        view.unload();
      },
    };
  }

  /** The messages the Notice stub logged in this test, oldest first. */
  function notices(): unknown[] {
    return noticeLog.mock.calls
      .filter((call) => call[0] === "[Stub Notice]")
      .map((call) => call[1]);
  }

  function waitForReplace(
    h: Harness,
    previous: HTMLElement | null,
  ): Promise<void> {
    return vi.waitFor(() => expect(h.articleEl()).not.toBe(previous));
  }

  it("fetches the page cover and stores it with the page-origin marker", async () => {
    const h = makeHarness();
    const before = h.articleEl();
    const untouched = {
      title: h.article.title,
      link: h.article.link,
      read: h.article.read,
      starred: h.article.starred,
      tags: h.article.tags,
    };

    const event = h.press();
    await waitForReplace(h, before);

    expect(event.defaultPrevented).toBe(true);
    expect(h.plugin.fetchPageCoverImage).toHaveBeenCalledTimes(1);
    expect(h.plugin.fetchPageCoverImage).toHaveBeenCalledWith(h.article.link);
    expect(h.article.coverImage).toBe(PAGE_IMAGE);
    expect(h.article.coverImageFromPage).toBe(true);
    expect({
      title: h.article.title,
      link: h.article.link,
      read: h.article.read,
      starred: h.article.starred,
      tags: h.article.tags,
    }).toEqual(untouched);
    expect(
      h
        .articleEl()
        ?.querySelector(".rss-dashboard-cover-image")
        ?.getAttribute("src"),
    ).toBe(PAGE_IMAGE);
    expect(notices()).toEqual([]);
    h.cleanup();
  });

  it("restores on the second press without a page request, then fetches on the third", async () => {
    const h = makeHarness({
      article: { content: `<p><img src="${FEED_IMAGE}"></p>` },
    });

    const first = h.articleEl();
    h.press();
    await waitForReplace(h, first);
    expect(h.article.coverImage).toBe(PAGE_IMAGE);

    const fetched = h.articleEl();
    h.press();
    await waitForReplace(h, fetched);
    expect(h.plugin.fetchPageCoverImage).toHaveBeenCalledTimes(1);
    expect(h.article.coverImage).toBe(FEED_IMAGE);
    expect(h.article.coverImageFromPage).toBeUndefined();
    expect(h.coverLabel()).toBe(COVER_REPLACE_LABEL + COVER_HINT);

    const restored = h.articleEl();
    h.press();
    await waitForReplace(h, restored);
    expect(h.plugin.fetchPageCoverImage).toHaveBeenCalledTimes(2);
    expect(h.article.coverImage).toBe(PAGE_IMAGE);
    expect(h.article.coverImageFromPage).toBe(true);
    expect(h.coverLabel()).toBe(COVER_RESTORE_LABEL + COVER_HINT);
    h.cleanup();
  });

  it("clears the cover when the feed supplies none, then resolves back to the fetch", async () => {
    const h = makeHarness();

    const first = h.articleEl();
    h.press();
    await waitForReplace(h, first);
    expect(h.coverLabel()).toBe(COVER_REMOVE_LABEL + COVER_HINT);

    const fetched = h.articleEl();
    h.press();
    await waitForReplace(h, fetched);
    expect(h.plugin.fetchPageCoverImage).toHaveBeenCalledTimes(1);
    expect(h.article.coverImage).toBe("");
    expect(h.article.coverImageFromPage).toBeUndefined();
    expect(h.coverLabel()).toBe(COVER_FETCH_LABEL + COVER_HINT);

    const cleared = h.articleEl();
    h.press();
    await waitForReplace(h, cleared);
    expect(h.plugin.fetchPageCoverImage).toHaveBeenCalledTimes(2);
    expect(h.article.coverImage).toBe(PAGE_IMAGE);
    h.cleanup();
  });

  it("shows the busy state and starts no second request while one is in flight", async () => {
    const h = makeHarness();
    let finish!: (result: { status: "found"; url: string }) => void;
    h.plugin.fetchPageCoverImage.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const before = h.articleEl();
    const firstPress = h.press();
    const busyEl = h.articleEl();
    expect(firstPress.defaultPrevented).toBe(true);
    expect(busyEl?.classList.contains(FETCHING_CLASS)).toBe(true);
    expect(busyEl?.getAttribute("aria-busy")).toBe("true");

    const secondPress = h.press();
    expect(secondPress.defaultPrevented).toBe(true);
    expect(h.plugin.fetchPageCoverImage).toHaveBeenCalledTimes(1);

    finish({ status: "found", url: PAGE_IMAGE });
    await vi.waitFor(() => expect(h.articleEl()).not.toBe(before));

    expect(h.articleEl()?.classList.contains(FETCHING_CLASS)).toBe(false);
    expect(h.articleEl()?.getAttribute("aria-busy")).toBeNull();
    expect(h.article.coverImage).toBe(PAGE_IMAGE);
    h.cleanup();
  });

  it("starts no second request when the visible control already has one running", async () => {
    const h = makeHarness();
    let finish!: (result: { status: "found"; url: string }) => void;
    h.plugin.fetchPageCoverImage.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    h.articleEl()?.querySelector<HTMLElement>(COVER_BUTTON)?.click();
    expect(h.plugin.fetchPageCoverImage).toHaveBeenCalledTimes(1);

    const event = h.press();

    expect(event.defaultPrevented).toBe(true);
    expect(h.plugin.fetchPageCoverImage).toHaveBeenCalledTimes(1);

    finish({ status: "found", url: PAGE_IMAGE });
    await vi.waitFor(() => expect(h.article.coverImage).toBe(PAGE_IMAGE));
    h.cleanup();
  });

  it("rebuilds the article in place, keeping it selected without scrolling or jumping", async () => {
    const h = makeHarness();
    const before = h.articleEl();
    const scrollEl =
      h.articleEl()?.closest<HTMLElement>(".rss-dashboard-articles-list") ??
      null;
    expect(scrollEl, "the articles list").not.toBeNull();
    scrollEl!.scrollTop = 140;
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    scrollIntoView.mockClear();

    h.press();
    await waitForReplace(h, before);

    expect((h.view as unknown as ViewInternals).selectedArticle).toBe(
      h.article,
    );
    expect(h.articleEl()?.classList.contains("active")).toBe(true);
    expect(scrollEl!.scrollTop).toBe(140);
    expect(scrollIntoView).not.toHaveBeenCalled();
    h.cleanup();
  });

  it.each([
    ["no article is selected", { select: false }],
    ["the view is List", { viewStyle: "list" as const }],
    ["cover-image display is off", { showCoverImage: false }],
    [
      "the link is not an http(s) page",
      { article: { link: "mailto:a@b.example" } },
    ],
  ])(
    "leaves the key unhandled and changes nothing when %s",
    (_label, options) => {
      const h = makeHarness(options as HarnessOptions);
      const before = h.articleEl();

      const event = h.press();

      expect(event.defaultPrevented).toBe(false);
      expect(h.plugin.fetchPageCoverImage).not.toHaveBeenCalled();
      expect(h.articleEl()).toBe(before);
      expect(h.article.coverImage).toBe(
        (options as HarnessOptions).article?.coverImage ?? "",
      );
      expect(notices()).toEqual([]);
      h.cleanup();
    },
  );

  it("leaves a restore unhandled when no restore handler is wired, like the other surfaces", () => {
    const h = makeHarness({
      restorer: false,
      article: {
        coverImage: PAGE_IMAGE,
        coverImageFromPage: true,
        content: `<p><img src="${FEED_IMAGE}"></p>`,
      },
    });

    // The control is not offered and the context menu does not list it.
    expect(h.coverLabel()).toBeNull();
    h.articleEl()?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(Menu.lastItems.map((item) => item.title)).not.toContain(
      COVER_RESTORE_LABEL,
    );
    // The shortcut makes the same call.
    const event = h.press();

    expect(event.defaultPrevented).toBe(false);
    expect(h.plugin.fetchPageCoverImage).not.toHaveBeenCalled();
    expect(h.article.coverImage).toBe(PAGE_IMAGE);
    expect(h.article.coverImageFromPage).toBe(true);
    expect(notices()).toEqual([]);
    h.cleanup();
  });

  it("keeps Shift+F on YouTube focus mode", () => {
    const h = makeHarness();

    const event = new KeyboardEvent("keydown", {
      key: "F",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);

    expect(h.plugin.toggleYouTubeFocusMode).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(h.plugin.fetchPageCoverImage).not.toHaveBeenCalled();
    h.cleanup();
  });
});
