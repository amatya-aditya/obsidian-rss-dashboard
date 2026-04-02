import { vi } from "vitest";
import { ArticleList } from "../../../src/components/article-list";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type ArticleListCallbacks = ConstructorParameters<typeof ArticleList>[6];

export interface ArticleListHarnessOverrides {
  container?: HTMLElement;
  settings?: Partial<RssDashboardSettings>;
  callbacks?: Partial<ArticleListCallbacks>;
  articles?: FeedItem[];
  selectedArticle?: FeedItem | null;
  title?: string;
  titleTooltip?: string | null;
  currentPage?: number;
  totalPages?: number;
  pageSize?: number;
  totalArticles?: number;
  statusFilters?: Set<string>;
  tagFilters?: Set<string>;
  filterLogic?: "AND" | "OR";
  currentFeedUrl?: string | null;
  showFeedSource?: boolean;
}

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = (target as Record<string, unknown>)[key];
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      deepMerge(targetValue, sourceValue);
      continue;
    }
    (target as Record<string, unknown>)[key] = sourceValue;
  }
  return target;
}

function installCssEscapePolyfill(): void {
  if (typeof (window as any).CSS === "undefined") {
    (window as any).CSS = {
      escape: (s: string) => s.replace(/([^\w-])/g, "\\$1"),
    };
  } else if (typeof (window as any).CSS.escape === "undefined") {
    (window as any).CSS.escape = (s: string) => s.replace(/([^\w-])/g, "\\$1");
  }
}

export function buildArticle(overrides: Partial<FeedItem> = {}): FeedItem {
  const pubDate =
    overrides.pubDate ?? new Date("2026-01-01T00:00:00Z").toISOString();
  return {
    guid: overrides.guid ?? "guid",
    title: overrides.title ?? "Title",
    link: overrides.link ?? "https://example.com",
    pubDate,
    description: overrides.description ?? "<p>desc</p>",
    read: overrides.read ?? false,
    starred: overrides.starred ?? false,
    saved: overrides.saved ?? false,
    tags: overrides.tags ?? [],
    feedTitle: overrides.feedTitle ?? "Feed",
    feedUrl: overrides.feedUrl ?? "https://example.com/feed",
    coverImage: overrides.coverImage ?? "",
  } as FeedItem;
}

export function createArticleListHarness(overrides: ArticleListHarnessOverrides = {}) {
  installObsidianDomPolyfills();
  installCssEscapePolyfill();

  const mockRAF = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
  let restoreRaf = () => {};
  try {
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(mockRAF);
    restoreRaf = () => rafSpy.mockRestore();
  } catch {
    const originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = mockRAF;
    restoreRaf = () => {
      window.requestAnimationFrame = originalRAF;
    };
  }

  const createdContainer = !overrides.container;
  const container =
    overrides.container ?? (document.body as unknown as HTMLElement).createDiv();

  const settings = cloneSettings();
  if (overrides.settings) {
    deepMerge(settings as unknown as Record<string, unknown>, overrides.settings);
  }

  const callbacks: ArticleListCallbacks = {
    onArticleClick: vi.fn(),
    onToggleViewStyle: vi.fn(),
    onRefreshFeeds: vi.fn(async () => {}),
    onSearch: vi.fn(),
    onArticleUpdate: vi.fn(),
    onArticleSave: vi.fn(),
    onToggleSidebar: vi.fn(),
    onSortChange: vi.fn(),
    onGroupChange: vi.fn(),
    onFilterChange: vi.fn(),
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    onPersistSettings: vi.fn(),
  } as ArticleListCallbacks;
  if (overrides.callbacks) {
    Object.assign(callbacks as unknown as Record<string, unknown>, overrides.callbacks);
  }

  const articles = overrides.articles ?? [];
  const selectedArticle = overrides.selectedArticle ?? null;
  const currentPage = overrides.currentPage ?? 1;
  const totalPages = overrides.totalPages ?? 1;
  const pageSize = overrides.pageSize ?? 10;
  const totalArticles = overrides.totalArticles ?? articles.length;
  const statusFilters = overrides.statusFilters ?? new Set<string>();
  const tagFilters = overrides.tagFilters ?? new Set<string>();
  const filterLogic = overrides.filterLogic ?? "OR";
  const currentFeedUrl = overrides.currentFeedUrl ?? null;
  const showFeedSource = overrides.showFeedSource ?? true;

  const list = new ArticleList(
    container,
    settings,
    overrides.title ?? "All articles",
    overrides.titleTooltip ?? null,
    articles,
    selectedArticle,
    callbacks,
    currentPage,
    totalPages,
    pageSize,
    totalArticles,
    statusFilters,
    tagFilters,
    filterLogic,
    currentFeedUrl,
    showFeedSource,
  );

  const getHeaderEl = () =>
    container.querySelector<HTMLElement>(".rss-dashboard-articles-header");
  const getArticlesListEl = () =>
    container.querySelector<HTMLElement>(".rss-dashboard-articles-list");
  const getPaginationEl = () =>
    container.querySelector<HTMLElement>(".rss-dashboard-pagination-wrapper");
  const getArticleEl = (guid: string) =>
    container.querySelector<HTMLElement>(`#article-${CSS.escape(guid)}`);
  const getVisibleArticleIds = () =>
    Array.from(
      container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-article-item, .rss-dashboard-article-card, .rss-dashboard-feed-item",
      ),
    )
      .filter((el) => !el.classList.contains("rss-dashboard-search-hidden"))
      .map((el) => el.id.replace(/^article-/, ""));

  const cleanup = () => {
    restoreRaf();
    if (createdContainer) {
      container.remove();
    }
  };

  return {
    container,
    settings,
    callbacks,
    articles,
    list,
    buildArticle,
    getHeaderEl,
    getArticlesListEl,
    getPaginationEl,
    getArticleEl,
    getVisibleArticleIds,
    cleanup,
  };
}
