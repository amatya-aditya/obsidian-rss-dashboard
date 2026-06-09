import { vi } from "vitest";
import { ArticleList } from "../../../src/components/article-list";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";

export type ArticleListCallbacks = ConstructorParameters<typeof ArticleList>[6];

interface TestCSS {
  escape: (s: string) => string;
}

interface TestWindow extends Window {
  CSS?: TestCSS;
}

const getWindowCSS = (): TestCSS => {
  const win = window as TestWindow;
  if (win.CSS === undefined) {
    const css: TestCSS = {
      escape: (s: string) => s.replace(/([^\w-])/g, "\\$1"),
    };
    win.CSS = css;
    return css;
  }
  if (win.CSS.escape === undefined) {
    win.CSS.escape = (s: string) => s.replace(/([^\w-])/g, "\\$1");
  }
  return win.CSS;
};

export const originalRAF = window.requestAnimationFrame;
export const mockRAF = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};

export class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

export function installObservingResizeObserver(
  onObserve: (el: Element) => void,
): void {
  const ObservingResizeObserver = class {
    constructor(_cb: ResizeObserverCallback) {}
    observe(el: Element) {
      onObserve(el);
    }
    unobserve() {}
    disconnect() {}
  };
  window.ResizeObserver =
    ObservingResizeObserver as unknown as typeof ResizeObserver;
}

export function installCapturingResizeObserver(handlers: {
  onConstruct: (cb: ResizeObserverCallback) => void;
  onDisconnect?: () => void;
}): void {
  const CapturingResizeObserver = class {
    constructor(cb: ResizeObserverCallback) {
      handlers.onConstruct(cb);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      handlers.onDisconnect?.();
    }
  };
  window.ResizeObserver =
    CapturingResizeObserver as unknown as typeof ResizeObserver;
}

export function makeBoundingRect(top: number, bottom: number) {
  return {
    top,
    bottom,
    left: 0,
    right: 0,
    width: 0,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

export function createDefaultSettings(): RssDashboardSettings {
  return {
    viewStyle: "list",
    articleGroupBy: "none",
    articleSort: "newest",
    display: {
      showCoverImage: true,
      showSummary: true,
      showFilterStatusBar: true,
      showSidebarScrollbar: true,
      showAllFeedsUnreadBadges: true,
      showFolderUnreadBadges: true,
      showFeedUnreadBadges: true,
      allFeedsUnreadBadgeColor: "#ff0000",
      folderUnreadBadgeColor: "#ff0000",
      feedUnreadBadgeColor: "#ff0000",
      allFeedsUnreadBadgeDefaultColor: "#ff0000",
      folderUnreadBadgeDefaultColor: "#ff0000",
      feedUnreadBadgeDefaultColor: "#ff0000",
      filterDisplayStyle: "inline" as const,
      mobileShowCardToolbar: true,
      mobileShowListToolbar: true,
      mobileListToolbarStyle: "bottom-row" as const,
      defaultFilter: "all" as const,
      hiddenFilters: [],
      hideDefaultRssIcon: false,
      autoMarkReadOnOpen: false,
      sidebarRowSpacing: 4,
      sidebarRowIndentation: 12,
      sidebarItemPaddingLeft: 8,
      sidebarItemPaddingRight: 8,
      cardColumnsPerRow: 3,
      cardSpacing: 15,
      hideEmptyFeeds: false,
      hideIconDashboard: false,
      hideIconDiscover: false,
      hideIconAddFeed: false,
      hideIconManageFeeds: false,
      hideIconSearch: false,
      hideIconTags: false,
      hideIconAddFolder: false,
      hideIconSort: false,
      hideIconCollapseAll: false,
      hideIconSettings: false,
      hideIconDivider: false,
      hideToolbarEntirely: false,
      iconOrder: [],
      articleDateStyle: "relative" as const,
    },
    articleFilter: {
      type: "none" as const,
      value: 0,
    },
    articleSaving: {
      addSavedTag: true,
      defaultFolder: ".",
      defaultTemplate: "",
      includeFrontmatter: true,
      frontmatterTemplate: "",
      saveFullContent: false,
      fetchTimeout: 10,
      savedTemplates: [],
    },
    media: {
      useDomainIconsRss: true,
      useDomainIconsPodcast: true,
      useDomainIconsTwitter: true,
      useDomainIconsYouTube: true,
    },
  } as unknown as RssDashboardSettings;
}

export function createDefaultArticles(): FeedItem[] {
  return [
    {
      guid: "1",
      title: "Article 1",
      link: "link1",
      description: "desc1",
      pubDate: new Date().toISOString(),
      read: false,
      starred: false,
      feedTitle: "Feed 1",
      feedUrl: "feed1",
      coverImage: "",
      tags: [],
    },
    {
      guid: "2",
      title: "Article 2",
      link: "link2",
      description: "desc2",
      pubDate: new Date().toISOString(),
      read: false,
      starred: false,
      feedTitle: "Feed 2",
      feedUrl: "feed2",
      coverImage: "",
      tags: [],
    },
  ];
}

export function createMockCallbacks(): ArticleListCallbacks {
  return {
    onArticleClick: vi.fn(),
    onToggleViewStyle: vi.fn(),
    onRefreshFeeds: vi.fn(async () => {}),
    onOpenViewFilters: vi.fn(),
    onOpenPerFeedSettings: vi.fn(),
    onArticleUpdate: vi.fn(),
    onArticleSave: vi.fn(),
    onOpenSavedArticle: vi.fn(),
    onOpenInReaderView: vi.fn(),
    onToggleSidebar: vi.fn(),
    onSortChange: vi.fn(),
    onGroupChange: vi.fn(),
    onFilterChange: vi.fn(),
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    onPersistSettings: vi.fn(),
    onSearch: vi.fn(),
  } as ArticleListCallbacks;
}

export interface ArticleListTestContext {
  container: HTMLElement;
  settings: RssDashboardSettings;
  mockCallbacks: ArticleListCallbacks;
  articles: FeedItem[];
}

export function setupArticleListBeforeEach(): ArticleListTestContext {
  installObsidianDomPolyfills();
  getWindowCSS();
  window.requestAnimationFrame = mockRAF;
  (
    window as unknown as { ResizeObserver: typeof ResizeObserver }
  ).ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

  const container = document.createElement("div");
  document.body.appendChild(container);
  Element.prototype.scrollIntoView = vi.fn();

  return {
    container,
    settings: createDefaultSettings(),
    articles: createDefaultArticles(),
    mockCallbacks: createMockCallbacks(),
  };
}

export function teardownArticleListAfterEach(): void {
  document.body.innerHTML = "";
  window.requestAnimationFrame = originalRAF;
  (
    window as unknown as { ResizeObserver: typeof ResizeObserver }
  ).ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  vi.restoreAllMocks();
}

export function createArticleListInstance(
  container: HTMLElement,
  settings: RssDashboardSettings,
  articles: FeedItem[],
  mockCallbacks: ArticleListCallbacks,
  selectedArticle: FeedItem | null = null,
  totalArticles?: number,
): ArticleList {
  return new ArticleList(
    container,
    settings,
    "All articles",
    null,
    articles,
    selectedArticle,
    mockCallbacks,
    1,
    1,
    10,
    totalArticles ?? articles.length,
    new Set(),
    new Set(),
    "OR",
  );
}
