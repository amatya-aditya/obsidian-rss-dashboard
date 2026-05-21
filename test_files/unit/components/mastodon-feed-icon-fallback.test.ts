import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { Sidebar } from "../../../src/components/sidebar";
import { ArticleList } from "../../../src/components/article-list";
import { ArticleHeader } from "../../../src/components/article-header";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App } from "../../stubs/obsidian";
import type { SidebarCallbacks, SidebarOptions } from "../../../src/components/sidebar";
import {
  RssDashboardSettings,
  Feed,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

// ============================================================================
// I. Sidebar — Mastodon feed icon fallback
// ============================================================================

describe("Mastodon Feed Icon — Sidebar", () => {
  let app: App;
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let plugin: {
    settings: RssDashboardSettings;
    saveSettings: ReturnType<typeof vi.fn>;
  };
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;

  beforeEach(() => {
    app = ObsidianStubs.App.createMock();
    container = document.createElement("div");
    document.body.appendChild(container);

    settings = {
      ...DEFAULT_SETTINGS,
      feeds: [],
      folders: [],
      display: { ...DEFAULT_SETTINGS.display },
      media: {
        ...DEFAULT_SETTINGS.media,
        useMastodonProfileImages: true,
        useDomainIconsRss: false,
      },
      availableTags: [],
    } as unknown as RssDashboardSettings;

    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
    };

    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: false,
      collapsedFolders: [],
    };

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
      onAddFeed: vi.fn().mockResolvedValue(undefined),
      onEditFeed: vi.fn(),
      onDeleteFeed: vi.fn(),
      onDeleteFolder: vi.fn(),
      onRefreshFeeds: vi.fn().mockResolvedValue(undefined),
      onUpdateFeed: vi.fn().mockResolvedValue(undefined),
      onImportOpml: vi.fn(),
      onExportOpml: vi.fn(),
      onToggleSidebar: vi.fn(),
    };
  });

  afterEach(() => {
    container.remove();
  });

  it("uses Mastodon instance domain favicon instead of generic RSS icon when no profile image is set", async () => {
    /*
     * RED: sidebar.ts renderFeed() has no Mastodon branch — Mastodon feeds
     * with no iconUrl fall through to setIcon("rss").
     */
    settings.feeds = [
      {
        title: "Mastodon Feed",
        url: "https://mastodon.social/@user.rss",
        folder: "Mastodon",
        items: [{ read: false }],
        // iconUrl absent: no profile image fetched yet
      } as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );

    // renderDomainFavicon calls the private isFaviconUrlAvailable which hits
    // requestUrl (throw-stubbed in tests).  Spy it so the async pre-check
    // returns "available" without network access.
    vi
      .spyOn(
        sidebar as unknown as {
          isFaviconUrlAvailable: (faviconUrl: string) => Promise<boolean>;
        },
        "isFaviconUrlAvailable",
      )
      .mockResolvedValue(true);

    sidebar.render();

    // Allow the microtask queue to drain the async renderDomainFavicon call.
    await new Promise((r) => setTimeout(r, 0));


    const feedRow = container.querySelector(
      '[data-feed-url="https://mastodon.social/@user.rss"]',
    );
    expect(feedRow).not.toBeNull();

    const feedIcon = feedRow!.querySelector(
      ".rss-dashboard-feed-icon",
    ) as HTMLElement;
    expect(feedIcon).not.toBeNull();

    // renderFallbackFeedIcon pre-sets `data-icon="rss"` on the container
    // before renderDomainFavicon empties it and appends the Mastodon <img>.
    // The <img>.src is the real signal that the Mastodon branch ran.
    const faviconImg = feedIcon.querySelector<HTMLImageElement>(
      ".rss-dashboard-feed-favicon",
    );
    expect(faviconImg).not.toBeNull();
    expect(faviconImg?.src).toContain("mastodon.social");

  });

  it("still shows generic RSS icon for non-Mastodon feeds with no iconUrl", () => {
    settings.feeds = [
      {
        title: "Generic RSS",
        url: "https://example.com/rss",
        folder: "RSS",
        items: [{ read: false }],
      } as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const feedRow = container.querySelector(
      '[data-feed-url="https://example.com/rss"]',
    ) as HTMLElement;
    const iconEl = feedRow.querySelector(".rss-dashboard-feed-icon") as HTMLElement;
    expect(iconEl.dataset.icon).toBe("rss");
  });
});

// ============================================================================
// II. ArticleList — per-article image error fallback
// ============================================================================

describe("Mastodon Feed Icon — ArticleList renderFeedIcon", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let mockCallbacks: ConstructorParameters<typeof ArticleList>[6];

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = document.createElement("div");
    document.body.appendChild(container);

    settings = {
      ...DEFAULT_SETTINGS,
      viewStyle: "list",
      articleGroupBy: "none",
      articleSort: "newest",
      display: {
        ...DEFAULT_SETTINGS.display,
        cardColumnsPerRow: 3,
        cardSpacing: 15,
        mobileShowListToolbar: true,
        mobileShowCardToolbar: true,
      },
      articleFilter: {
        type: "none",
        value: 0,
      },
      articleSaving: {
        ...DEFAULT_SETTINGS.articleSaving,
        saveFullContent: false,
      },
      media: {
        ...DEFAULT_SETTINGS.media,
        useMastodonProfileImages: true,
        useDomainIconsRss: false,
      },
      feeds: [],
    } as unknown as RssDashboardSettings;

    mockCallbacks = {
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
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("uses Mastodon domain favicon for per-article icon instead of RSS when no profile image", () => {
    /*
     * RED: article-list.ts renderFeedIcon() falls through to setIcon("rss")
     * when a Mastodon feed has no iconUrl.
     */
    const mastodonFeed: Feed = {
      title: "Mastodon Feed",
      url: "https://mastodon.social/@user.rss",
      folder: "Mastodon",
      mediaType: "article",
      items: [
        {
          guid: "1",
          title: "Post",
          link: "https://mastodon.social/@user/1",
          description: "",
          pubDate: new Date().toISOString(),
          read: false,
          starred: false,
          tags: [],
          feedTitle: "Mastodon Feed",
          feedUrl: "https://mastodon.social/@user.rss",
          coverImage: "",
        },
      ],
      // no iconUrl
    } as unknown as Feed;

    settings.feeds = [mastodonFeed];

    const articleList = new ArticleList(
      container,
      settings,
      "All articles",
      null,
      mastodonFeed.items,
      null,
      mockCallbacks,
      1,
      1,
      10,
      1,
      new Set(),
      new Set(),
      "OR",
    );
    articleList.render();

    // renderFeedIcon() creates elements with class 'rss-dashboard-article-feed-icon'
    const feedIcon = container.querySelector(
      ".rss-dashboard-article-feed-icon",
    ) as HTMLElement;
    expect(feedIcon).not.toBeNull();

    // Must NOT carry the generic RSS icon
    expect(feedIcon.dataset.icon).not.toBe("rss");

    // Must carry a favicon img pointing at the Mastodon instance domain
    const faviconImg = feedIcon.querySelector<HTMLImageElement>(
      ".rss-dashboard-feed-favicon",
    );
    expect(faviconImg).not.toBeNull();
    expect(faviconImg?.src).toContain("mastodon.social");
  });

  it("uses Mastodon domain favicon for header icon helper when no profile image", () => {
    const mastodonFeed: Feed = {
      title: "Mastodon Feed",
      url: "https://mastodon.social/@user.rss",
      folder: "Mastodon",
      mediaType: "article",
      items: [
        {
          guid: "1",
          title: "Post",
          link: "https://mastodon.social/@user/1",
          description: "",
          pubDate: new Date().toISOString(),
          read: false,
          starred: false,
          tags: [],
          feedTitle: "Mastodon Feed",
          feedUrl: "https://mastodon.social/@user.rss",
          coverImage: "",
        },
      ],
    } as unknown as Feed;

    settings.feeds = [mastodonFeed];

    const articleList = new ArticleList(
      container,
      settings,
      "All articles",
      null,
      mastodonFeed.items,
      null,
      mockCallbacks,
      1,
      1,
      10,
      1,
      new Set(),
      new Set(),
      "OR",
      mastodonFeed.url,
    );

    const headerIconContainer = document.createElement("div");
    (
      articleList as unknown as {
        renderHeaderFeedIcon: (container: HTMLElement, feedUrl: string) => void;
      }
    ).renderHeaderFeedIcon(headerIconContainer, mastodonFeed.url);

    expect(headerIconContainer.dataset.icon).not.toBe("rss");
    const faviconImg = headerIconContainer.querySelector<HTMLImageElement>(
      ".rss-dashboard-header-favicon",
    );
    expect(faviconImg).not.toBeNull();
    expect(faviconImg?.src).toContain("mastodon.social");
  });
});

// ============================================================================
// III. ArticleHeader — reader view Mastodon icon fallback
// ============================================================================

describe("Mastodon Feed Icon — ArticleHeader renderHeaderFeedIcon", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let mockCallbacks: ConstructorParameters<typeof ArticleHeader>[8];

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = document.createElement("div");
    document.body.appendChild(container);

    settings = {
      ...DEFAULT_SETTINGS,
      viewStyle: "list",
      articleSort: "newest",
      articleGroupBy: "none",
      articleFilter: { value: 0 },
      feeds: [],
      display: {
        ...DEFAULT_SETTINGS.display,
        cardColumnsPerRow: 0,
        cardSpacing: 15,
      },
      media: {
        ...DEFAULT_SETTINGS.media,
        useDomainIconsRss: false,
      },
    } as unknown as RssDashboardSettings;

    mockCallbacks = {
      onToggleSidebar: vi.fn(),
      onSearch: vi.fn(),
      onSortChange: vi.fn(),
      onGroupChange: vi.fn(),
      onFilterChange: vi.fn(),
      onToggleViewStyle: vi.fn(),
      onPersistSettings: vi.fn(),
      onRefreshFeeds: vi.fn(),
      onMarkAllAsRead: vi.fn(),
      onMarkAllAsUnread: vi.fn(),
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders Mastodon domain favicon in reader-view header feed icon when no profile image", () => {
    /*
     * RED: article-header.ts renderHeaderFeedIcon() has no Mastodon branch —
     * it falls through to setIcon("rss") for Mastodon feeds without iconUrl.
     *
     * currentFeedUrl must be non-null: render() only creates feedIcon at
     * line 183-187 when currentFeedUrl is truthy.
     */
    settings.feeds = [
      {
        title: "Mastodon RSS",
        url: "https://mastodon.social/@user.rss",
        folder: "Mastodon",
        lastUpdated: Date.now(),
        mediaType: "article",
        items: [
          {
            guid: "header-1",
            title: "Header Post",
            link: "https://mastodon.social/@user/1",
            description: "",
            pubDate: new Date().toISOString(),
            read: false,
            starred: false,
            tags: [],
            feedTitle: "Mastodon RSS",
            feedUrl: "https://mastodon.social/@user.rss",
            coverImage: "",
          },
        ],
        // No iconUrl — profile image was never fetched
      },
    ];

    const header = new ArticleHeader(
      container,
      settings,
      "Test Title",
      null,
      "https://mastodon.social/@user.rss", // ← non-null so feedIcon div is created
      new Set(),
      new Set(),
      "OR",
      mockCallbacks,
    );
    header.render();

    // render() creates feedIcon with class "rss-dashboard-header-feed-icon" at line 184-186
    const feedIcon = container.querySelector(
      ".rss-dashboard-header-feed-icon",
    ) as HTMLElement;
    expect(feedIcon).not.toBeNull();

    // Should NOT carry the generic RSS icon
    expect(feedIcon.dataset.icon).not.toBe("rss");

    // Should render an <img> pointing at mastodon.social
    const img = feedIcon.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img?.src).toContain("mastodon.social");
  });
});
