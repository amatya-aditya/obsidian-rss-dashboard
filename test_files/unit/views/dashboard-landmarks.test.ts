/**
 * The dashboard's content area is its one `main` landmark and the inline
 * Reader body is a named region inside it (WCAG 2.2 1.3.1 Info and
 * Relationships, 2.4.1 Bypass Blocks; Slice 4 audit rows L-001 and R-004 of
 * #826, AC-014g).
 *
 * Obsidian itself exposes no landmark around a view (audit L-001), so the
 * dashboard must not add a second `main` of its own, and a re-render must not
 * stack another one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { RssDashboardView } from "../../../src/views/dashboard-view";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    refilter(..._args: unknown[]): void {}
    setSelectedArticle(..._args: unknown[]): void {}
    setEmptyStateContext(..._args: unknown[]): void {}
    updateRefreshButtonText(..._args: unknown[]): void {}
    hasArticle(..._args: unknown[]): boolean {
      return false;
    }
    insertArticleInPlace(..._args: unknown[]): boolean {
      return false;
    }
    removeArticleInPlace(..._args: unknown[]): void {}
    updateArticleInPlace(..._args: unknown[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
    showEditFeedModal(..._args: unknown[]): void {}
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

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(url: string, titles: string[]): Feed {
  return {
    title: `Feed (${url})`,
    url,
    folder: "",
    items: titles.map((title, index) => ({
      title,
      link: `${url}#${index}`,
      description: "<p>Excerpt</p>",
      pubDate: new Date(Date.now() - index * 1000).toISOString(),
      guid: `${url}#${index}`,
      read: false,
      starred: false,
      tags: [],
      feedTitle: `Feed (${url})`,
      feedUrl: url,
      coverImage: "",
    })) as FeedItem[],
    lastUpdated: Date.now(),
  };
}

interface DashboardViewInternal {
  containerEl: HTMLElement;
  inlineArticle: FeedItem | null;
  selectedArticle: FeedItem | null;
  render(): void;
}

function makeView(settings: RssDashboardSettings): DashboardViewInternal {
  const app = new App();
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
  };
  const leaf = {
    app,
    updateHeader: vi.fn(),
  } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(
    leaf,
    plugin as never,
  ) as unknown as DashboardViewInternal;
  // render() draws into the second child of the view root.
  view.containerEl.empty();
  view.containerEl.createDiv();
  view.containerEl.createDiv();
  document.body.appendChild(view.containerEl);
  return view;
}

describe("Dashboard landmarks", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  function build(): { view: DashboardViewInternal; feed: Feed } {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", ["Article one", "Two"]);
    settings.feeds = [feed];
    return { view: makeView(settings), feed };
  }

  it("makes the content area the dashboard's one main landmark", () => {
    const { view } = build();
    view.render();

    const mains = view.containerEl.querySelectorAll('[role="main"]');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toBe(
      view.containerEl.querySelector(".rss-dashboard-content"),
    );
  });

  it("keeps a single main across re-renders and the switch to the inline Reader", () => {
    const { view, feed } = build();
    view.render();
    view.render();
    expect(view.containerEl.querySelectorAll('[role="main"]')).toHaveLength(1);

    view.inlineArticle = feed.items[0];
    view.selectedArticle = feed.items[0];
    view.render();
    expect(view.containerEl.querySelectorAll('[role="main"]')).toHaveLength(1);
  });

  it("puts the inline Reader body in a region named by the article title", () => {
    const { view, feed } = build();
    view.inlineArticle = feed.items[0];
    view.selectedArticle = feed.items[0];
    view.render();

    const body = view.containerEl.querySelector<HTMLElement>(
      ".inline-reader-content",
    )!;
    expect(body.getAttribute("role")).toBe("region");
    expect(body.closest('[role="main"]')).not.toBeNull();

    const labelId = body.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const label = document.getElementById(labelId!);
    expect(label?.textContent).toBe("Article one");
    // Obsidian draws a tooltip from aria-label; the name comes from the title.
    expect(body.hasAttribute("aria-label")).toBe(false);
  });

  it("gives the region a fresh title after another article opens", () => {
    const { view, feed } = build();
    view.inlineArticle = feed.items[0];
    view.render();
    view.inlineArticle = feed.items[1];
    view.render();

    const regions = view.containerEl.querySelectorAll<HTMLElement>(
      ".inline-reader-content",
    );
    expect(regions).toHaveLength(1);
    const label = document.getElementById(
      regions[0].getAttribute("aria-labelledby")!,
    );
    expect(label?.textContent).toBe("Two");
  });

  it("does not turn the article list into a landmark", () => {
    const { view } = build();
    view.render();

    expect(
      view.containerEl.querySelector(
        '.rss-dashboard-articles[role], .rss-dashboard-article-card[role="article"]',
      ),
    ).toBeNull();
  });
});
