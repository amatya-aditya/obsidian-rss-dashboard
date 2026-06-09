import { Notice, Menu, MenuItem, setIcon, Setting } from "obsidian";
import { FeedItem, RssDashboardSettings, Tag } from "../types/types";
import { ArticleHeader } from "./article-header";
import { ArticleEmptyState } from "./article-empty-state";
import { extractDomain, getFaviconUrl } from "../utils/favicon-utils";
import { MediaService } from "../services/media-service";
import { MastodonService } from "../services/mastodon-service";
import {
  formatDateWithRelative,
  formatArticleDate,
  setCssProps,
  windowInstanceOf,
} from "../utils/platform-utils";
import type { FilterContext } from "../utils/filter-detection";
import { HighlightService } from "../services/highlight-service";
import { createTagsDropdownPortal } from "../utils/tags-dropdown-portal";
import {
  getPageSizeOptions,
  PAGE_SIZE_OPTIONS,
} from "../utils/page-size-options";
import { computeResultsRange } from "../utils/pagination-utils";
import { htmlToReadableText } from "../utils/html-text";
import {
  groupArticles as groupArticlesUtil,
  getFeedFolder as getFeedFolderUtil,
} from "./article-list/utils/article-grouping";
import {
  renderTagChips,
  createTagChip,
  createTagOverflowChip,
  renderSingleRowCardTagChips,
  layoutCardTagRows,
  MAX_VISIBLE_TAGS,
} from "./article-list/utils/tag-layout-utils";
import {
  extractFirstImageSrc,
  getArticlePreviewSummaryText as getArticlePreviewSummaryTextUtil,
  looksLikeStylesheetText,
  getCardPreviewSummaryText,
  shouldHighlightCardPreviewSummary,
  CARD_PREVIEW_SUMMARY_MAX_CHARS,
  CARD_PREVIEW_HIGHLIGHT_MAX_CHARS,
} from "./article-list/utils/article-preview-utils";
import {
  renderPagination as renderPaginationUtil,
  createPageButton as createPageButtonUtil,
} from "./article-list/utils/pagination";

const MAX_VISIBLE_TAGS_DERIVED = MAX_VISIBLE_TAGS;

interface ArticleListCallbacks {
  onArticleClick: (article: FeedItem) => void;
  onToggleViewStyle: (style: "list" | "card" | "feed") => void;
  onRefreshFeeds: () => Promise<void>;
  onSearch: (query: string) => void;
  onOpenViewFilters?: () => void;
  onOpenPerFeedSettings?: () => void;

  onArticleUpdate: (
    article: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => void;
  onArticleSave?: (article: FeedItem) => Promise<void> | void;
  onOpenSavedArticle?: (article: FeedItem) => Promise<void> | void;
  onOpenInReaderView?: (article: FeedItem) => void;
  onOpenInBrowser?: (article: FeedItem) => void;
  onToggleSidebar: () => void;
  onSortChange: (value: "newest" | "oldest") => void;
  onGroupChange: (value: "none" | "feed" | "date" | "folder") => void;
  onFilterChange: (value: {
    type: string;
    value: unknown;
    checked?: boolean;
    isTag?: boolean;
    logic?: "AND" | "OR";
  }) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onMarkPageAsRead?: () => void;
  onMarkAllAsRead?: () => void;
  onMarkAllAsUnread?: () => void;
  onPersistSettings?: () => Promise<void> | void;
  onOpenTagsSettings?: () => Promise<void> | void;
  onTagsMutated?: () => void;
}

export class ArticleList {
  private container: HTMLElement;
  private settings: RssDashboardSettings;
  private title: string;
  private titleTooltip: string | null;
  private headerTitleEl: HTMLElement | null = null;
  private articles: FeedItem[];
  private emptyStateContext: FilterContext | null = null;
  private selectedArticle: FeedItem | null;
  private callbacks: ArticleListCallbacks;
  private refreshButton: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private cardLayoutFrame: number | null = null;
  private currentPage: number;
  private totalPages: number;
  private pageSize: number;
  private totalArticles: number;
  private currentFeedUrl: string | null = null;
  private header: ArticleHeader | null = null;
  private highlightService: HighlightService | null = null;

  private showFeedSource: boolean = true;
  private statusFilters: Set<string>;
  private tagFilters: Set<string>;
  private filterLogic: "AND" | "OR";
  private articleSearchQuery: string = "";
  private tagsDropdownCleanup: (() => void) | null = null;
  private activePortal: HTMLElement | null = null;
  private activeFilterToggleBtn: HTMLElement | null = null;
  private activeFilterOutsideListenerCleanup: (() => void) | null = null;
  private pendingCardTopAnchor: boolean = false;
  private documentListeners: Array<{
    target: Document | Window;
    type: string;
    listener: EventListenerOrEventListenerObject;
  }> = [];

  constructor(
    container: HTMLElement,
    settings: RssDashboardSettings,
    title: string,
    titleTooltip: string | null,
    articles: FeedItem[],
    selectedArticle: FeedItem | null,
    callbacks: ArticleListCallbacks,
    currentPage: number,
    totalPages: number,
    pageSize: number,
    totalArticles: number,
    statusFilters: Set<string>,
    tagFilters: Set<string>,
    filterLogic: "AND" | "OR",
    currentFeedUrl?: string | null,
    showFeedSource: boolean = true,
  ) {
    this.container = container;
    this.settings = settings;
    this.title = title;
    this.titleTooltip = titleTooltip;
    this.articles = articles;
    this.selectedArticle = selectedArticle;
    this.callbacks = callbacks;
    this.currentPage = currentPage;
    this.totalPages = totalPages;
    this.pageSize = pageSize;
    this.totalArticles = totalArticles;
    this.statusFilters = statusFilters;
    this.tagFilters = tagFilters;
    this.filterLogic = filterLogic;
    this.currentFeedUrl = currentFeedUrl || null;
    this.showFeedSource = showFeedSource;

    if (this.settings.highlights?.enabled) {
      this.highlightService = new HighlightService(this.settings.highlights);
    }

    // Header and filter logic were extracted to ArticleHeader and ArticleFilterMenu
    // to reduce this file's length and complexity. Legacy methods like renderHeader(),
    // createControls(), and showFiltersMenu() now live in those respective classes.
    this.header = new ArticleHeader(
      this.container,
      this.settings,
      this.title,
      this.titleTooltip,
      this.currentFeedUrl,
      this.statusFilters,
      this.tagFilters,
      this.filterLogic,
      {
        onToggleSidebar: () => this.callbacks.onToggleSidebar(),
        onSearch: (q) => {
          this.articleSearchQuery = q;
          this.filterArticlesBySearch(q);
          this.callbacks.onSearch(q);
        },
        onSortChange: (s) => this.callbacks.onSortChange(s),
        onGroupChange: (g) => this.callbacks.onGroupChange(g),
        onFilterChange: (f) => this.callbacks.onFilterChange(f),
        onToggleViewStyle: (v) => this.callbacks.onToggleViewStyle(v),
        onPersistSettings: () => {
          if (this.callbacks.onPersistSettings) {
            void this.callbacks.onPersistSettings();
          }
        },
        onRefreshFeeds: () => this.callbacks.onRefreshFeeds(),
        onMarkAllAsRead: () => {
          if (this.callbacks.onMarkAllAsRead) {
            this.callbacks.onMarkAllAsRead();
          } else {
            this.articles.forEach((a) => (a.read = true));
            if (this.callbacks.onPersistSettings)
              void this.callbacks.onPersistSettings();
            this.render();
          }
        },
        onMarkAllAsUnread: () => {
          if (this.callbacks.onMarkAllAsUnread) {
            this.callbacks.onMarkAllAsUnread();
          } else {
            this.articles.forEach((a) => (a.read = false));
            if (this.callbacks.onPersistSettings)
              void this.callbacks.onPersistSettings();
            this.render();
          }
        },
      },
    );
  }

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.cardLayoutFrame !== null) {
      activeWindow.cancelAnimationFrame(this.cardLayoutFrame);
      this.cardLayoutFrame = null;
    }
    if (this.header) {
      this.header.destroy();
    }
    this.documentListeners.forEach(({ target, type, listener }) => {
      target.removeEventListener(type, listener);
    });
    this.documentListeners = [];
    if (this.tagsDropdownCleanup) {
      this.tagsDropdownCleanup();
      this.tagsDropdownCleanup = null;
    }
  }

  private isMobileViewport(): boolean {
    return activeWindow.matchMedia("(max-width: 768px)").matches;
  }

  private shouldShowToolbarForView(view: "list" | "card" | "feed"): boolean {
    if (view === "list") {
      return this.settings.display.mobileShowListToolbar;
    }

    if (view === "feed") {
      return true; // Feed view always shows toolbar as per requirements
    }

    if (!this.isMobileViewport()) {
      return true;
    }

    return this.settings.display.mobileShowCardToolbar;
  }

  private getMobileListToolbarStyle(): "left-grid" | "bottom-row" | "minimal" {
    const style = this.settings.display.mobileListToolbarStyle;
    if (
      style === "left-grid" ||
      style === "bottom-row" ||
      style === "minimal"
    ) {
      return style;
    }
    return "minimal";
  }

  public refreshVisibleArticleTags(): void {
    this.articles.forEach((article) => {
      this.updateArticleInPlace(article);
    });
  }

  public syncVisibleArticlesFromSource(
    resolveSourceArticle: (article: FeedItem) => FeedItem | null,
  ): void {
    this.articles.forEach((article, index) => {
      const sourceArticle = resolveSourceArticle(article);
      if (!sourceArticle) {
        return;
      }

      Object.assign(article, sourceArticle, {
        feedTitle: article.feedTitle,
        feedUrl: article.feedUrl,
      });
      article.tags = sourceArticle.tags?.map((tag) => ({ ...tag })) ?? [];
      this.articles[index] = article;
    });
  }

  private persistSettings(): void {
    const result = this.callbacks.onPersistSettings?.();
    if (result instanceof Promise) {
      void result;
    }
  }

  private getCardColumnsPerRow(): number {
    const value = this.settings.display.cardColumnsPerRow;
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    return Math.max(1, Math.min(6, Math.round(value)));
  }

  private getCardSpacing(): number {
    const value = this.settings.display.cardSpacing;
    if (!Number.isFinite(value)) {
      return 15;
    }
    return Math.max(0, Math.min(40, Math.round(value)));
  }

  private getCardGridTemplateColumns(cardColumns: number): string | null {
    if (cardColumns > 0) {
      return `repeat(${cardColumns}, minmax(0, 1fr))`;
    }

    return null;
  }

  private applyCardGridLayout(
    articlesList: HTMLElement,
    _containerWidth: number,
  ): void {
    const cardColumns = this.getCardColumnsPerRow();
    const gridTemplateColumns = this.getCardGridTemplateColumns(cardColumns);

    if (gridTemplateColumns) {
      articlesList.style.setProperty(
        "grid-template-columns",
        gridTemplateColumns,
      );
      return;
    }

    articlesList.style.removeProperty("grid-template-columns");
  }

  private scheduleCardTagLayout(root: ParentNode = this.container): void {
    if (this.settings.viewStyle !== "card") {
      return;
    }

    if (this.cardLayoutFrame !== null) {
      activeWindow.cancelAnimationFrame(this.cardLayoutFrame);
    }

    this.cardLayoutFrame = activeWindow.requestAnimationFrame(() => {
      this.cardLayoutFrame = null;
      layoutCardTagRows(root, this.articles);
    });
  }

  private layoutCardTagRows(root: ParentNode = this.container): void {
    layoutCardTagRows(root, this.articles);
  }

  private layoutSingleCardTagRow(card: HTMLElement): void {
    const tagsContainer = card.querySelector<HTMLElement>(
      ".rss-dashboard-card-tags-region .rss-dashboard-tag-container",
    );
    const articleGuid = card.dataset.articleGuid;
    if (!tagsContainer || !articleGuid) {
      return;
    }

    const article = this.articles.find((item) => item.guid === articleGuid);
    if (!article?.tags?.length) {
      tagsContainer.empty();
      return;
    }

    renderSingleRowCardTagChips(tagsContainer, article.tags);
  }

  private renderTagChips(container: HTMLElement, tags: Tag[]): void {
    renderTagChips(container, tags);
  }

  private createTagChip(container: HTMLElement, tag: Tag): HTMLElement {
    return createTagChip(container, tag);
  }

  private createTagOverflowChip(
    container: HTMLElement,
    hiddenTags: Tag[],
  ): HTMLElement {
    return createTagOverflowChip(container, hiddenTags);
  }

  private renderSingleRowCardTagChips(
    container: HTMLElement,
    tags: Tag[],
  ): void {
    renderSingleRowCardTagChips(container, tags);
  }

  private ensureCardTagsContainer(articleEl: HTMLElement): HTMLElement | null {
    if (!articleEl.classList.contains("rss-dashboard-article-card")) {
      return null;
    }

    let tagsRegion = articleEl.querySelector<HTMLElement>(
      ".rss-dashboard-card-tags-region",
    );
    if (!tagsRegion) {
      tagsRegion = activeDocument.createElement("div");
      tagsRegion.className = "rss-dashboard-card-tags-region";
      const cardFooter = articleEl.querySelector<HTMLElement>(
        ".rss-dashboard-card-footer",
      );
      if (cardFooter) {
        articleEl.insertBefore(tagsRegion, cardFooter);
      } else {
        articleEl.appendChild(tagsRegion);
      }
    }

    let tagsContainer = tagsRegion.querySelector<HTMLElement>(
      ".rss-dashboard-tag-container",
    );
    if (!tagsContainer) {
      tagsContainer = tagsRegion.createDiv({
        cls: "rss-dashboard-tag-container",
      });
    }

    return tagsContainer;
  }

  private ensureFeedTagsContainer(articleEl: HTMLElement): HTMLElement | null {
    if (!articleEl.classList.contains("rss-dashboard-feed-item")) {
      return null;
    }

    let tagsRegion = articleEl.querySelector<HTMLElement>(
      ".rss-dashboard-feed-tags-region",
    );
    if (!tagsRegion) {
      tagsRegion = activeDocument.createElement("div");
      tagsRegion.className = "rss-dashboard-feed-tags-region";
      const feedFooter = articleEl.querySelector<HTMLElement>(
        ".rss-dashboard-feed-footer",
      );
      if (feedFooter) {
        articleEl.insertBefore(tagsRegion, feedFooter);
      } else {
        articleEl.appendChild(tagsRegion);
      }
    }

    let tagsContainer = tagsRegion.querySelector<HTMLElement>(
      ".rss-dashboard-tag-container",
    );
    if (!tagsContainer) {
      tagsContainer = tagsRegion.createDiv({
        cls: "rss-dashboard-tag-container",
      });
    }

    return tagsContainer;
  }

  private addDocumentListener(
    target: Document | Window,
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) {
    target.addEventListener(type, listener);
    const entry = { target, type, listener };
    this.documentListeners.push(entry);
    return () => {
      target.removeEventListener(type, listener);
      this.documentListeners = this.documentListeners.filter(
        (e) => e !== entry,
      );
    };
  }

  setEmptyStateContext(context: FilterContext | null): void {
    this.emptyStateContext = context;
  }

  render(): void {
    const scrollPosition = this.container.scrollTop;

    this.container.empty();
    this.headerTitleEl = null;

    if (this.header) {
      this.header.render();
    }
    this.renderArticles();
    if (this.articleSearchQuery) {
      this.filterArticlesBySearch(this.articleSearchQuery);
    }

    activeWindow.requestAnimationFrame(() => {
      const shouldForceCardTopAnchor =
        this.pendingCardTopAnchor && this.settings.viewStyle === "card";

      if (!shouldForceCardTopAnchor) {
        this.container.scrollTop = scrollPosition;
      }

      if (this.selectedArticle) {
        this.scrollSelectedArticleIntoViewIfNeeded(this.selectedArticle, {
          forceCardTopAnchor: shouldForceCardTopAnchor,
        });
      }
    });
  }

  private getArticlesListElement(): HTMLElement | null {
    return this.container;
  }

  private isArticleFullyVisibleInList(
    listEl: HTMLElement,
    articleEl: HTMLElement,
  ): boolean {
    const listRect = listEl.getBoundingClientRect();
    const articleRect = articleEl.getBoundingClientRect();

    if (listRect.height <= 0 || articleRect.height <= 0) {
      return false;
    }

    return (
      articleRect.top >= listRect.top && articleRect.bottom <= listRect.bottom
    );
  }

  private getCardTopAnchorViewportInset(listEl: HTMLElement): number {
    const stickyHeaderEl = listEl.querySelector<HTMLElement>(
      ".rss-dashboard-articles-header",
    );
    if (!stickyHeaderEl) {
      return 0;
    }

    const listRect = listEl.getBoundingClientRect();
    const headerRect = stickyHeaderEl.getBoundingClientRect();
    const overlapTop = Math.max(listRect.top, headerRect.top);
    const overlapBottom = Math.min(listRect.bottom, headerRect.bottom);

    return Math.max(0, overlapBottom - overlapTop);
  }

  private scrollSelectedArticleIntoViewIfNeeded(
    article: FeedItem,
    options?: { forceCardTopAnchor?: boolean },
  ): void {
    const listEl = this.getArticlesListElement();
    const articleEl = this.container.querySelector<HTMLElement>(
      `#article-${CSS.escape(article.guid)}`,
    );

    if (!listEl || !articleEl) {
      return;
    }

    if (options?.forceCardTopAnchor) {
      const listRect = listEl.getBoundingClientRect();
      const articleRect = articleEl.getBoundingClientRect();
      const topAnchorInset = this.getCardTopAnchorViewportInset(listEl);
      const nextScrollTop =
        listEl.scrollTop + (articleRect.top - listRect.top - topAnchorInset);
      listEl.scrollTop = Math.max(0, nextScrollTop);
      this.pendingCardTopAnchor = false;
      return;
    }

    if (this.isArticleFullyVisibleInList(listEl, articleEl)) {
      this.pendingCardTopAnchor = false;
      return;
    }

    articleEl.scrollIntoView({ block: "nearest", behavior: "auto" });
    this.pendingCardTopAnchor = false;
  }

  /**
   * Update filters and re-render only the articles section,
   * leaving the header (and any open filter menus) intact.
   */
  public refilter(
    statusFilters: Set<string>,
    tagFilters: Set<string>,
    filterLogic: "AND" | "OR",
    articles: FeedItem[],
    currentPage: number,
    totalPages: number,
    pageSize: number,
    totalArticles: number,
  ): void {
    this.statusFilters = statusFilters;
    this.tagFilters = tagFilters;
    this.filterLogic = filterLogic;
    this.articles = articles;
    this.currentPage = currentPage;
    this.totalPages = totalPages;
    this.pageSize = pageSize;
    this.totalArticles = totalArticles;

    // Update all filter trigger badges (desktop + mobile)
    if (this.header) {
      this.header.updateFilters(
        this.statusFilters,
        this.tagFilters,
        this.filterLogic,
      );
      this.header.updateFilterBadge();
    }

    // Remove both the articles list and the pagination wrapper
    // (pagination is rendered as a sibling to the articles list)
    this.container
      .querySelectorAll(
        ".rss-dashboard-articles-list, .rss-dashboard-pagination-wrapper",
      )
      .forEach((el) => el.remove());
    this.renderArticles();

    // Ensure local search filter is reapplied after articles list is recreated
    if (this.articleSearchQuery) {
      this.filterArticlesBySearch(this.articleSearchQuery);
    }
  }

  public updateHeaderTitle(title: string, tooltip: string | null): void {
    this.title = title;
    this.titleTooltip = tooltip;

    if (this.header) {
      this.header.updateTitle(title, tooltip);
    }
  }

  public updateCardSpacingLayout(cardSpacing: number): void {
    this.settings.display.cardSpacing = cardSpacing;

    const articlesList = this.container.querySelector<HTMLElement>(
      ".rss-dashboard-articles-list.rss-dashboard-card-view",
    );
    if (!articlesList) {
      return;
    }

    articlesList.style.setProperty(
      "--rss-dashboard-card-gap",
      `${this.getCardSpacing()}px`,
    );
  }

  public refreshCardTagLayout(): void {
    const articlesList = this.container.querySelector<HTMLElement>(
      ".rss-dashboard-articles-list.rss-dashboard-card-view",
    );
    if (!articlesList) {
      return;
    }

    this.scheduleCardTagLayout(articlesList);
  }

  public removeArticleInPlace(guid: string): void {
    this.articles = this.articles.filter((a) => a.guid !== guid);

    const targetEl = this.container.querySelector<HTMLElement>(
      `#article-${CSS.escape(guid)}`,
    );
    if (!targetEl) return;

    const listEl = this.container.querySelector<HTMLElement>(
      ".rss-dashboard-articles-list",
    );
    const scrollPos = listEl?.scrollTop ?? 0;

    const originalHeight = targetEl.offsetHeight;
    setCssProps(targetEl, {
      overflow: "hidden",
      "max-height": `${originalHeight}px`,
      transition:
        "opacity 150ms ease, max-height 200ms ease 100ms, margin 200ms ease 100ms, padding 200ms ease 100ms",
    });

    activeWindow.requestAnimationFrame(() => {
      setCssProps(targetEl, {
        opacity: "0",
        "max-height": "0",
        "margin-top": "0",
        "margin-bottom": "0",
        "padding-top": "0",
        "padding-bottom": "0",
      });
    });

    activeWindow.setTimeout(() => {
      targetEl.remove();
      if (listEl) listEl.scrollTop = scrollPos;
    }, 320);
  }

  public hasArticle(guid: string): boolean {
    return this.articles.some((a) => a.guid === guid);
  }

  private findSortedInsertIndex(
    article: FeedItem,
    sortOrder: "newest" | "oldest",
  ): number {
    const newTime = new Date(article.pubDate).getTime();
    for (let i = 0; i < this.articles.length; i++) {
      const existingTime = new Date(this.articles[i].pubDate).getTime();
      if (
        sortOrder === "newest" ? newTime > existingTime : newTime < existingTime
      ) {
        return i;
      }
    }
    return this.articles.length;
  }

  public insertArticleInPlace(
    article: FeedItem,
    sortOrder: "newest" | "oldest",
  ): boolean {
    if (this.settings.articleGroupBy !== "none") {
      return false;
    }

    const listEl = this.container.querySelector<HTMLElement>(
      ".rss-dashboard-articles-list",
    );
    if (!listEl) {
      return false;
    }

    const insertIdx = this.findSortedInsertIndex(article, sortOrder);
    const temp = activeDocument.createDiv();

    if (this.settings.viewStyle === "list") {
      this.renderListView(temp, [article]);
    } else if (this.settings.viewStyle === "feed") {
      this.renderFeedView(temp, [article]);
    } else {
      this.renderCardView(temp, [article]);
    }

    const newEl = temp.firstElementChild as HTMLElement | null;
    if (!newEl) {
      return false;
    }

    const nextArticle = this.articles[insertIdx];
    const referenceEl = nextArticle
      ? listEl.querySelector<HTMLElement>(
          `#article-${CSS.escape(nextArticle.guid)}`,
        )
      : null;

    if (nextArticle && !referenceEl) {
      return false;
    }

    this.articles.splice(insertIdx, 0, article);

    if (referenceEl) {
      listEl.insertBefore(newEl, referenceEl);
    } else {
      listEl.appendChild(newEl);
    }

    const naturalHeight = newEl.offsetHeight;
    setCssProps(newEl, {
      overflow: "hidden",
      "max-height": "0",
      opacity: "0",
      "margin-top": "0",
      "margin-bottom": "0",
      "padding-top": "0",
      "padding-bottom": "0",
    });

    activeWindow.requestAnimationFrame(() => {
      setCssProps(newEl, {
        transition:
          "opacity 150ms ease, max-height 200ms ease 100ms, margin 200ms ease 100ms, padding 200ms ease 100ms",
        "max-height": `${naturalHeight}px`,
        opacity: "1",
        "margin-top": "",
        "margin-bottom": "",
        "padding-top": "",
        "padding-bottom": "",
      });
    });

    activeWindow.setTimeout(() => {
      setCssProps(newEl, {
        overflow: "",
        "max-height": "",
        transition: "",
      });
    }, 320);

    return true;
  }

  public setSelectedArticle(
    article: FeedItem,
    options?: { forceCardTopAnchor?: boolean },
  ): void {
    this.selectedArticle = article;
    if (options?.forceCardTopAnchor) {
      this.pendingCardTopAnchor = true;
    }
    // Remove active class from any currently active element
    this.container
      .querySelectorAll<HTMLElement>(
        ".rss-dashboard-article-item.active, .rss-dashboard-article-card.active, .rss-dashboard-feed-item.active",
      )
      .forEach((el) => el.classList.remove("active"));
    // Add active class to the newly selected article element
    const targetEl = this.container.querySelector<HTMLElement>(
      `#article-${CSS.escape(article.guid)}`,
    );
    if (targetEl) {
      targetEl.classList.add("active");
      this.scrollSelectedArticleIntoViewIfNeeded(article, {
        forceCardTopAnchor:
          options?.forceCardTopAnchor === true &&
          this.settings.viewStyle === "card",
      });
    }
  }

  public getCardNavigationTargetGuid(
    currentGuid: string,
    direction: "left" | "right" | "up" | "down",
  ): string | null {
    const cards = Array.from(
      this.container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-article-card",
      ),
    );
    if (cards.length === 0) {
      return null;
    }

    const currentIndex = cards.findIndex(
      (card) => card.dataset.articleGuid === currentGuid,
    );
    if (currentIndex === -1) {
      return cards[0].dataset.articleGuid ?? null;
    }

    const rowTolerance = 6;
    const positionedCards = cards
      .map((card) => ({
        guid: card.dataset.articleGuid ?? null,
        rect: card.getBoundingClientRect(),
      }))
      .filter(
        (entry): entry is { guid: string; rect: DOMRect } =>
          entry.guid !== null,
      );
    const rows: Array<Array<{ guid: string; rect: DOMRect }>> = [];
    positionedCards.forEach((entry) => {
      const existingRow = rows.find(
        (row) => Math.abs(row[0].rect.top - entry.rect.top) <= rowTolerance,
      );
      if (existingRow) {
        existingRow.push(entry);
        return;
      }
      rows.push([entry]);
    });
    rows.forEach((row) => row.sort((a, b) => a.rect.left - b.rect.left));
    rows.sort((a, b) => a[0].rect.top - b[0].rect.top);

    const currentRowIndex = rows.findIndex((row) =>
      row.some((entry) => entry.guid === currentGuid),
    );
    if (currentRowIndex === -1) {
      return null;
    }

    const currentRow = rows[currentRowIndex];
    const currentColumnIndex = currentRow.findIndex(
      (entry) => entry.guid === currentGuid,
    );
    if (currentColumnIndex === -1) {
      return null;
    }

    if (direction === "left") {
      return currentColumnIndex > 0
        ? currentRow[currentColumnIndex - 1].guid
        : null;
    }

    if (direction === "right") {
      return currentColumnIndex < currentRow.length - 1
        ? currentRow[currentColumnIndex + 1].guid
        : null;
    }

    const targetRowIndex =
      direction === "up" ? currentRowIndex - 1 : currentRowIndex + 1;
    if (targetRowIndex < 0 || targetRowIndex >= rows.length) {
      return null;
    }

    const targetRow = rows[targetRowIndex];
    const targetColumnIndex = Math.min(
      currentColumnIndex,
      targetRow.length - 1,
    );

    return targetRow[targetColumnIndex]?.guid ?? null;
  }

  /**
   * Arm a one-shot ResizeObserver relock for card-view top-anchoring.
   *
   * Call this immediately after opening a split or sidebar reader leaf.
   * The relock fires after the container geometry settles (first resize
   * notification + one rAF debounce), which is later than any fixed
   * requestAnimationFrame delay and therefore captures the final grid
   * layout instead of an intermediate one.
   *
   * A 500 ms fallback timeout handles the edge case where the dashboard
   * container width does not change at all (e.g. the sidebar opens
   * without shrinking the main panel).
   */
  public scheduleCardTopAnchorOnResize(): void {
    this.pendingCardTopAnchor = true;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    const applyRelock = (): void => {
      if (
        this.pendingCardTopAnchor &&
        this.selectedArticle &&
        this.settings.viewStyle === "card"
      ) {
        this.scrollSelectedArticleIntoViewIfNeeded(this.selectedArticle, {
          forceCardTopAnchor: true,
        });
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
    };

    const fallbackId = activeWindow.setTimeout(applyRelock, 500);

    this.resizeObserver = new ResizeObserver(() => {
      if (this.cardLayoutFrame !== null) {
        activeWindow.cancelAnimationFrame(this.cardLayoutFrame);
      }
      this.cardLayoutFrame = activeWindow.requestAnimationFrame(() => {
        this.cardLayoutFrame = null;
        activeWindow.clearTimeout(fallbackId);
        applyRelock();
      });
    });

    this.resizeObserver.observe(this.container);
  }

  /**
   * Scroll the selected card so its top edge aligns with the top of the
   * list container. Called from the `layout-change` handler in DashboardView
   * after Obsidian has fully committed its new panel geometry (post-animation).
   */
  public scrollSelectedCardToTop(): void {
    if (!this.selectedArticle || this.settings.viewStyle !== "card") {
      return;
    }
    const listEl = this.getArticlesListElement();
    const articleEl = this.container.querySelector<HTMLElement>(
      `#article-${CSS.escape(this.selectedArticle.guid)}`,
    );
    if (!listEl || !articleEl) {
      return;
    }
    const listRect = listEl.getBoundingClientRect();
    const articleRect = articleEl.getBoundingClientRect();
    const topAnchorInset = this.getCardTopAnchorViewportInset(listEl);
    listEl.scrollTop = Math.max(
      0,
      listEl.scrollTop + (articleRect.top - listRect.top - topAnchorInset),
    );
    this.pendingCardTopAnchor = false;
  }

  public updateArticleInPlace(article: FeedItem): void {
    const index = this.articles.findIndex((a) => a.guid === article.guid);
    if (index !== -1) {
      this.articles[index] = article;
    }

    const targetId = `article-${article.guid}`;
    const articleEls = Array.from(
      this.container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-article-item, .rss-dashboard-article-card, .rss-dashboard-feed-item",
      ),
    ).filter((el) => el.id === targetId);

    if (articleEls.length === 0) {
      return;
    }

    articleEls.forEach((articleEl) => {
      this.syncArticleElement(articleEl, article);
    });
  }

  private syncArticleElement(articleEl: HTMLElement, article: FeedItem): void {
    articleEl.classList.toggle("read", !!article.read);
    articleEl.classList.toggle("unread", !article.read);
    articleEl.classList.toggle("saved", !!article.saved);
    articleEl.classList.toggle("starred", !!article.starred);
    articleEl.classList.toggle("unstarred", !article.starred);

    const readToggle = articleEl.querySelector<HTMLElement>(
      ".rss-dashboard-read-toggle",
    );
    if (readToggle) {
      readToggle.classList.toggle("read", !!article.read);
      readToggle.classList.toggle("unread", !article.read);
      readToggle.setAttr(
        "title",
        article.read ? "Mark as unread" : "Mark as read",
      );
      setIcon(readToggle, article.read ? "check-circle" : "circle");
    }

    const saveToggle = articleEl.querySelector<HTMLElement>(
      ".rss-dashboard-save-toggle",
    );
    if (saveToggle) {
      saveToggle.classList.toggle("saved", !!article.saved);
      saveToggle.setAttr(
        "title",
        article.saved
          ? "Click to open saved article"
          : this.settings.articleSaving.saveFullContent
            ? "Save full article content to notes"
            : "Save article summary to notes",
      );
    }

    const starToggle = articleEl.querySelector<HTMLElement>(
      ".rss-dashboard-star-toggle",
    );
    if (starToggle) {
      starToggle.classList.toggle("starred", !!article.starred);
      starToggle.classList.toggle("unstarred", !article.starred);
      starToggle.setAttr(
        "title",
        article.starred ? "Remove from starred items" : "Add to starred items",
      );
      const starIcon = starToggle.querySelector<HTMLElement>(
        ".rss-dashboard-star-icon",
      );
      if (starIcon) {
        setIcon(starIcon, article.starred ? "star" : "star-off");
      }
    }

    this.syncArticleTags(articleEl, article);
  }

  private syncArticleTags(articleEl: HTMLElement, article: FeedItem): void {
    const tags = article.tags || [];
    const existingContainers = Array.from(
      articleEl.querySelectorAll<HTMLElement>(".rss-dashboard-tag-container"),
    );

    const hasTags = tags.length > 0;
    if (articleEl.classList.contains("rss-dashboard-article-card")) {
      articleEl.classList.toggle(
        "rss-dashboard-article-card--has-tags",
        hasTags,
      );
    }
    if (!hasTags && existingContainers.length > 0) {
      existingContainers.forEach((container) => container.remove());
      if (articleEl.classList.contains("rss-dashboard-article-card")) {
        articleEl
          .querySelectorAll(".rss-dashboard-card-tags-region")
          .forEach((el) => el.remove());
      }
      if (articleEl.classList.contains("rss-dashboard-feed-item")) {
        articleEl
          .querySelectorAll(".rss-dashboard-feed-tags-region")
          .forEach((el) => el.remove());
      }
      return;
    }

    let tagsContainerAdded = false;
    if (hasTags && existingContainers.length === 0) {
      if (articleEl.classList.contains("rss-dashboard-article-card")) {
        const tagsContainer = this.ensureCardTagsContainer(articleEl);
        if (tagsContainer) {
          existingContainers.push(tagsContainer);
          tagsContainerAdded = true;
        }
      } else if (
        articleEl.classList.contains("rss-dashboard-list-item-bottom-row")
      ) {
        const articleContent = articleEl.querySelector<HTMLElement>(
          ".rss-dashboard-article-content",
        );
        const listFooter = articleEl.querySelector<HTMLElement>(
          ".rss-dashboard-list-footer",
        );
        if (articleContent) {
          const tagContainer = articleContent.createDiv({
            cls: "rss-dashboard-tag-container rss-dashboard-list-body-tags",
          });
          if (listFooter) {
            articleContent.insertBefore(tagContainer, listFooter);
          }
          existingContainers.push(tagContainer);
          tagsContainerAdded = true;
        }
      } else if (articleEl.classList.contains("rss-dashboard-feed-item")) {
        const tagsContainer = this.ensureFeedTagsContainer(articleEl);
        if (tagsContainer) {
          existingContainers.push(tagsContainer);
          tagsContainerAdded = true;
        }
      } else {
        const toolbar = articleEl.querySelector<HTMLElement>(
          ".rss-dashboard-action-toolbar",
        );
        if (toolbar) {
          const tagContainer = toolbar.createDiv({
            cls: "rss-dashboard-tag-container",
          });
          existingContainers.push(tagContainer);
          tagsContainerAdded = true;
        }
      }
    }

    if (tagsContainerAdded) {
      articleEl.classList.add("rss-dashboard-tags-newly-added");
    }

    existingContainers.forEach((container) => {
      const isCardTagStrip = !!container.closest(
        ".rss-dashboard-card-tags-region",
      );
      const isFeedTagStrip = !!container.closest(
        ".rss-dashboard-feed-tags-region",
      );
      if (
        (articleEl.classList.contains("rss-dashboard-article-card") &&
          isCardTagStrip) ||
        (articleEl.classList.contains("rss-dashboard-feed-item") &&
          isFeedTagStrip)
      ) {
        renderSingleRowCardTagChips(container, tags);
        return;
      }

      this.renderTagChips(container, tags);
    });

    if (articleEl.classList.contains("rss-dashboard-article-card")) {
      this.scheduleCardTagLayout(articleEl);
    }
  }

  /**
   * Filter articles by search query (client-side filtering by title)
   */
  private filterArticlesBySearch(query: string): void {
    const articlesList = this.container.querySelector(
      ".rss-dashboard-articles-list",
    );

    if (!articlesList) return;

    const articleElements = articlesList.querySelectorAll(
      ".rss-dashboard-article-item, .rss-dashboard-article-card, .rss-dashboard-feed-item",
    );

    articleElements.forEach((el) => {
      const titleEl = el.querySelector(".rss-dashboard-article-title");
      const title = titleEl?.textContent?.toLowerCase() || "";

      if (query && !title.includes(query)) {
        (el as HTMLElement).classList.add("rss-dashboard-search-hidden");
      } else {
        (el as HTMLElement).classList.remove("rss-dashboard-search-hidden");
      }
    });
  }

  private renderArticles(): void {
    const articlesList = this.container.createDiv({
      cls: `rss-dashboard-articles-list rss-dashboard-${this.settings.viewStyle}-view`,
    });
    if (this.settings.viewStyle === "card") {
      // Keep card layout controls in one render-time path so both hamburger
      // controls and formal settings stay in sync with the same persisted fields.
      const cardSpacing = this.getCardSpacing();

      this.applyCardGridLayout(articlesList, this.container.clientWidth);

      articlesList.style.setProperty(
        "--rss-dashboard-card-gap",
        `${cardSpacing}px`,
      );
    }
    const showToolbar = this.shouldShowToolbarForView(this.settings.viewStyle);
    articlesList.toggleClass(
      "rss-dashboard-mobile-toolbar-hidden",
      !showToolbar,
    );

    if (this.settings.viewStyle === "list" && showToolbar) {
      articlesList.addClass(
        `rss-dashboard-mobile-list-style-${this.getMobileListToolbarStyle()}`,
      );
    }

    if (this.articles.length === 0) {
      const emptyState = new ArticleEmptyState();
      const onAction =
        this.emptyStateContext?.actionTarget === "per-feed-settings"
          ? this.callbacks.onOpenPerFeedSettings
          : this.emptyStateContext?.actionTarget === "view-filter"
            ? this.callbacks.onOpenViewFilters
            : undefined;
      emptyState.render(
        articlesList,
        this.emptyStateContext ?? {
          type: "NoArticlesAtAll",
          unfilteredCount: 0,
        },
        { onAction },
      );
      return;
    }

    if (this.settings.articleGroupBy === "none") {
      if (this.settings.viewStyle === "list") {
        this.renderListView(articlesList, this.articles);
      } else if (this.settings.viewStyle === "feed") {
        this.renderFeedView(articlesList, this.articles);
      } else {
        this.renderCardView(articlesList, this.articles);
        this.scheduleCardTagLayout(articlesList);
      }
    } else {
      const groupedArticles = this.groupArticles(
        this.articles,
        this.settings.articleGroupBy,
      );
      for (const groupName in groupedArticles) {
        const groupContainer = articlesList.createDiv({
          cls: "rss-dashboard-article-group",
        });
        new Setting(groupContainer).setName(groupName).setHeading();
        const groupArticles = groupedArticles[groupName];
        if (this.settings.viewStyle === "list") {
          this.renderListView(groupContainer, groupArticles);
        } else if (this.settings.viewStyle === "feed") {
          this.renderFeedView(groupContainer, groupArticles);
        } else {
          this.renderCardView(groupContainer, groupArticles);
          this.scheduleCardTagLayout(groupContainer);
        }
      }
    }

    const paginationWrapper = this.container.createDiv({
      cls: "rss-dashboard-pagination-wrapper",
    });
    renderPaginationUtil({
      container: paginationWrapper,
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      pageSize: this.pageSize,
      totalArticles: this.totalArticles,
      articles: this.articles,
      deps: {
        isMobileViewport: () => this.isMobileViewport(),
        onPageChange: (page: number) => this.callbacks.onPageChange(page),
        onPageSizeChange: (pageSize: number) =>
          this.callbacks.onPageSizeChange(pageSize),
        onMarkPageAsRead: this.callbacks.onMarkPageAsRead,
        onPersistSettings: this.callbacks.onPersistSettings,
        notices: {
          show: (message: string) => new Notice(message),
        },
      },
    });
  }

  private groupArticles(
    articles: FeedItem[],
    groupBy: "feed" | "date" | "folder" | "none",
  ): Record<string, FeedItem[]> {
    return groupArticlesUtil(
      articles,
      groupBy,
      (feedUrl: string) => this.getFeedFolder(feedUrl),
    );
  }

  private getFeedFolder(feedUrl: string): string | undefined {
    return getFeedFolderUtil(feedUrl, this.settings.feeds);
  }

  private getCardPreviewSummaryText(summary: string): string {
    if (!summary) {
      return "";
    }

    const readableText = summary.includes("<")
      ? htmlToReadableText(summary)
      : summary;
    const normalized = readableText.replace(/\s+/g, " ").trim();
    if (normalized.length <= CARD_PREVIEW_SUMMARY_MAX_CHARS) {
      return normalized;
    }

    return `${normalized.slice(0, CARD_PREVIEW_SUMMARY_MAX_CHARS - 1)}…`;
  }

  private looksLikeStylesheetText(text: string): boolean {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return false;

    return (
      /^\.[\w-]+[\s,{.#[\w-]*]*\{\s*[\w-]+\s*:/i.test(normalized) ||
      /(?:^|[\s;}])(?:border|padding|background(?:-color)?|font-family|color|overflow-wrap)\s*:/i.test(
        normalized,
      )
    );
  }

  private getArticlePreviewSummaryText(article: FeedItem): string {
    const candidates = [
      article.summary || "",
      article.description || "",
      article.content || "",
    ];

    for (const candidate of candidates) {
      const previewText = this.getCardPreviewSummaryText(candidate);
      if (previewText && !this.looksLikeStylesheetText(previewText)) {
        return previewText;
      }
    }

    return "";
  }

  private shouldHighlightCardPreviewSummary(summaryText: string): boolean {
    return summaryText.length <= CARD_PREVIEW_HIGHLIGHT_MAX_CHARS;
  }

private renderFeedIcon(
     container: HTMLElement,
     feedUrl: string,
     mediaType?: "article" | "video" | "podcast",
   ): void {
     const iconContainer = container.createDiv({
       cls: "rss-dashboard-article-feed-icon",
     });
     const isYouTubeFeed = MediaService.isYouTubeFeed(feedUrl);
     const feed = this.settings.feeds?.find((f) => f.url === feedUrl);

     if (feed && MediaService.shouldShowFeedIcon(feed, this.settings.display)) {
       // Show cached feed logo when available and enabled
      const imgEl = iconContainer.createEl("img", {
        attr: { src: feed.iconUrl!, alt: feed.title || feedUrl },
        cls: "rss-dashboard-article-feed-icon-img",
      });
      imgEl.onerror = () => {
        iconContainer.empty();
        if (MediaService.isTwitterOrNitterFeed(feedUrl)) {
          const faviconUrl = getFaviconUrl("twitter.com");
          const fallbackImg = iconContainer.createEl("img", {
            attr: {
              src: faviconUrl,
              alt: "Twitter/X",
            },
            cls: "rss-dashboard-feed-favicon",
          });
          fallbackImg.onerror = () => {
            iconContainer.empty();
            if (!this.settings.display.hideDefaultRssIcon) {
              setIcon(iconContainer, "rss");
            }
          };
        } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
          const domain = extractDomain(feedUrl);
          if (domain) {
            const faviconUrl = getFaviconUrl(domain);
            const fallbackImg = iconContainer.createEl("img", {
              attr: {
                src: faviconUrl,
                alt: "Mastodon",
              },
              cls: "rss-dashboard-feed-favicon",
            });
            fallbackImg.onerror = () => {
              iconContainer.empty();
              if (!this.settings.display.hideDefaultRssIcon) {
                setIcon(iconContainer, "rss");
              }
            };
          } else if (!this.settings.display.hideDefaultRssIcon) {
            setIcon(iconContainer, "rss");
          }
        } else if (!this.settings.display.hideDefaultRssIcon) {
          setIcon(iconContainer, "rss");
        }
      };
    } else if (MediaService.isTwitterOrNitterFeed(feedUrl)) {
      const faviconUrl = getFaviconUrl("twitter.com");
      iconContainer.empty();
      const imgEl = iconContainer.createEl("img", {
        attr: {
          src: faviconUrl,
          alt: "Twitter/X",
        },
        cls: "rss-dashboard-feed-favicon",
      });
      imgEl.onerror = () => {
        iconContainer.empty();
        if (!this.settings.display.hideDefaultRssIcon) {
          setIcon(iconContainer, "rss");
        }
      };
    } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
      const domain = extractDomain(feedUrl);
      if (domain) {
        const faviconUrl = getFaviconUrl(domain);
        iconContainer.empty();
        const imgEl = iconContainer.createEl("img", {
          attr: {
            src: faviconUrl,
            alt: "Mastodon",
          },
          cls: "rss-dashboard-feed-favicon",
        });
        imgEl.onerror = () => {
          iconContainer.empty();
          if (!this.settings.display.hideDefaultRssIcon) {
            setIcon(iconContainer, "rss");
          }
        };
      } else if (!this.settings.display.hideDefaultRssIcon) {
        setIcon(iconContainer, "rss");
      }
    } else if (mediaType === "video" && isYouTubeFeed) {
      setIcon(iconContainer, "play");
      iconContainer.addClass("video");
    } else if (mediaType === "podcast") {
      setIcon(iconContainer, "mic");
      iconContainer.addClass("podcast");
    } else if (this.settings.display.useDomainIconsRss) {
      const domain = extractDomain(feedUrl);
      if (domain) {
        const faviconUrl = getFaviconUrl(domain);
        iconContainer.empty();
        const imgEl = iconContainer.createEl("img", {
          attr: {
            src: faviconUrl,
            alt: domain,
          },
          cls: "rss-dashboard-feed-favicon",
        });
        imgEl.onerror = () => {
          iconContainer.empty();
          if (!this.settings.display.hideDefaultRssIcon) {
            setIcon(iconContainer, "rss");
          }
        };
      } else if (!this.settings.display.hideDefaultRssIcon) {
        setIcon(iconContainer, "rss");
      }
    } else if (!this.settings.display.hideDefaultRssIcon) {
      setIcon(iconContainer, "rss");
    }
  }

private renderHeaderFeedIcon(container: HTMLElement, feedUrl: string): void {
     const feed = this.settings.feeds.find((f) => f.url === feedUrl);
     const mediaType = feed?.mediaType;
     const isYouTubeFeed = MediaService.isYouTubeFeed(feedUrl);

     if (feed && MediaService.shouldShowFeedIcon(feed, this.settings.display)) {
       // Show cached feed logo when available and enabled
       const imgEl = container.createEl("img", {
         attr: {
           src: feed.iconUrl!,
           alt: feed.title || feedUrl,
         },
         cls: "rss-dashboard-header-feed-icon-img",
       });
       imgEl.onerror = () => {
         container.empty();
        if (MediaService.isTwitterOrNitterFeed(feedUrl)) {
          const faviconUrl = getFaviconUrl("twitter.com");
          const fallbackImg = container.createEl("img", {
            attr: {
              src: faviconUrl,
              alt: "Twitter/X",
            },
            cls: "rss-dashboard-header-favicon",
          });
          fallbackImg.onerror = () => {
            container.empty();
            if (!this.settings.display.hideDefaultRssIcon) {
              setIcon(container, "rss");
            }
          };
        } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
          const domain = extractDomain(feedUrl);
          if (domain) {
            const faviconUrl = getFaviconUrl(domain);
            const fallbackImg = container.createEl("img", {
              attr: {
                src: faviconUrl,
                alt: "Mastodon",
              },
              cls: "rss-dashboard-header-favicon",
            });
            fallbackImg.onerror = () => {
              container.empty();
              if (!this.settings.display.hideDefaultRssIcon) {
                setIcon(container, "rss");
              }
            };
          } else if (!this.settings.display.hideDefaultRssIcon) {
            setIcon(container, "rss");
          }
        } else if (!this.settings.display.hideDefaultRssIcon) {
          setIcon(container, "rss");
        }
      };
    } else if (MediaService.isTwitterOrNitterFeed(feedUrl)) {
      const faviconUrl = getFaviconUrl("twitter.com");
      container.empty();
      const imgEl = container.createEl("img", {
        attr: {
          src: faviconUrl,
          alt: "Twitter/X",
        },
        cls: "rss-dashboard-header-favicon",
      });
      imgEl.onerror = () => {
        container.empty();
        if (!this.settings.display.hideDefaultRssIcon) {
          setIcon(container, "rss");
        }
      };
    } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
      const domain = extractDomain(feedUrl);
      if (domain) {
        const faviconUrl = getFaviconUrl(domain);
        container.empty();
        const imgEl = container.createEl("img", {
          attr: {
            src: faviconUrl,
            alt: "Mastodon",
          },
          cls: "rss-dashboard-header-favicon",
        });
        imgEl.onerror = () => {
          container.empty();
          if (!this.settings.display.hideDefaultRssIcon) {
            setIcon(container, "rss");
          }
        };
      } else if (!this.settings.display.hideDefaultRssIcon) {
        setIcon(container, "rss");
      }
    } else if (mediaType === "video" && isYouTubeFeed) {
      setIcon(container, "play");
      container.addClass("video");
    } else if (mediaType === "podcast") {
      setIcon(container, "mic");
      container.addClass("podcast");
    } else if (this.settings.display.useDomainIconsRss) {
      const domain = extractDomain(feedUrl);
      if (domain) {
        const faviconUrl = getFaviconUrl(domain);
        const imgEl = container.createEl("img", {
          attr: {
            src: faviconUrl,
            alt: domain,
          },
          cls: "rss-dashboard-header-favicon",
        });
        imgEl.onerror = () => {
          container.empty();
          if (!this.settings.display.hideDefaultRssIcon) {
            setIcon(container, "rss");
          }
        };
      } else if (!this.settings.display.hideDefaultRssIcon) {
        setIcon(container, "rss");
      }
    } else if (!this.settings.display.hideDefaultRssIcon) {
      setIcon(container, "rss");
    }
  }

  private createReadToggle(
    actionToolbar: HTMLElement,
    article: FeedItem,
  ): void {
    const readToggle = actionToolbar.createDiv({
      cls: `rss-dashboard-read-toggle clickable-icon ${article.read ? "read" : "unread"}`,
      attr: {
        title: article.read ? "Mark as unread" : "Mark as read",
        role: "button",
        tabindex: "0",
        "aria-label": article.read ? "Mark as unread" : "Mark as read",
      },
    });
    setIcon(readToggle, article.read ? "check-circle" : "circle");

    const toggleRead = (e: Event) => {
      e.stopPropagation();
      const newReadState = !article.read;
      article.read = newReadState;
      this.callbacks.onArticleUpdate(article, { read: newReadState }, false);
      readToggle.classList.toggle("read", newReadState);
      readToggle.classList.toggle("unread", !newReadState);
      setIcon(readToggle, newReadState ? "check-circle" : "circle");
    };

    readToggle.addEventListener("click", toggleRead);
    readToggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleRead(e);
      }
    });
  }

  private createSaveButton(
    actionToolbar: HTMLElement,
    article: FeedItem,
  ): void {
    const saveButton = actionToolbar.createDiv({
      cls: `rss-dashboard-save-toggle clickable-icon ${article.saved ? "saved" : ""}`,
      attr: {
        title: article.saved
          ? "Click to open saved article"
          : this.settings.articleSaving.saveFullContent
            ? "Save full article content to notes"
            : "Save article summary to notes",
        role: "button",
        tabindex: "0",
        "aria-label": "Save article",
      },
    });
    setIcon(saveButton, "save");
    if (!saveButton.querySelector("svg")) {
      saveButton.textContent = "S";
    }

    const toggleSave = async (e: Event) => {
      e.stopPropagation();
      e.preventDefault();

      if (article.saved) {
        if (this.callbacks.onOpenSavedArticle) {
          await this.callbacks.onOpenSavedArticle(article);
        } else {
          new Notice("Article already saved. Look in your notes.");
        }
      } else if (this.callbacks.onArticleSave) {
        if (saveButton.classList.contains("saving")) {
          return;
        }

        saveButton.classList.add("saving");
        saveButton.setAttribute("title", "Saving article...");

        try {
          await this.callbacks.onArticleSave(article);
          article.saved = true;
          saveButton.classList.add("saved");
          setIcon(saveButton, "save");
          if (!saveButton.querySelector("svg")) {
            saveButton.textContent = "S";
          }
          saveButton.setAttribute("title", "Click to open saved article");
        } catch (error) {
          console.error("Failed to save article via card button:", error);
          new Notice("Failed to save article.");
        } finally {
          saveButton.classList.remove("saving");
        }
      }
    };

    saveButton.addEventListener("click", (e) => {
      void toggleSave(e);
    });
    saveButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void toggleSave(e);
      }
    });
  }

  private createStarToggle(
    actionToolbar: HTMLElement,
    article: FeedItem,
  ): void {
    const starToggle = actionToolbar.createDiv({
      cls: `rss-dashboard-star-toggle clickable-icon ${article.starred ? "starred" : "unstarred"}`,
      attr: {
        title: article.starred
          ? "Remove from starred items"
          : "Add to starred items",
        role: "button",
        tabindex: "0",
        "aria-label": "Toggle star",
      },
    });
    const starIcon = starToggle.createSpan({
      cls: "rss-dashboard-star-icon",
    });
    starToggle.appendChild(starIcon);
    setIcon(starIcon, article.starred ? "star" : "star-off");
    if (!starIcon.querySelector("svg")) {
      starIcon.textContent = article.starred ? "*" : "o";
    }

    const toggleStar = (e: Event) => {
      e.stopPropagation();
      const newStarState = !article.starred;
      article.starred = newStarState;
      this.callbacks.onArticleUpdate(article, { starred: newStarState }, false);
      starToggle.classList.toggle("starred", newStarState);
      starToggle.classList.toggle("unstarred", !newStarState);
      const iconEl = starToggle.querySelector(".rss-dashboard-star-icon");
      if (iconEl) {
        setIcon(iconEl as HTMLElement, newStarState ? "star" : "star-off");
        if (!iconEl.querySelector("svg")) {
          iconEl.textContent = newStarState ? "*" : "o";
        }
      }
    };

    starToggle.addEventListener("click", toggleStar);
    starToggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleStar(e);
      }
    });
  }

  private createTagsToggle(
    actionToolbar: HTMLElement,
    article: FeedItem,
  ): void {
    const tagsDropdown = actionToolbar.createDiv({
      cls: "rss-dashboard-tags-dropdown",
    });
    const tagsToggle = tagsDropdown.createDiv({
      cls: "rss-dashboard-tags-toggle clickable-icon",
      attr: {
        title: "Manage tags",
        role: "button",
        tabindex: "0",
        "aria-label": "Manage tags",
      },
    });
    setIcon(tagsToggle, "tag");
    tagsToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showTagsDropdownPortal(tagsToggle, article);
    });
    tagsToggle.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.showTagsDropdownPortal(tagsToggle, article);
      }
    });
  }

  private showTagsDropdownPortal(anchor: HTMLElement, article: FeedItem): void {
    this.createPortalDropdown(anchor, article, (tag, checked) => {
      if (!article.tags) article.tags = [];
      if (checked) {
        if (!article.tags.some((t) => t.name === tag.name)) {
          article.tags.push({ ...tag });
        }
      } else {
        article.tags = article.tags.filter((t) => t.name !== tag.name);
      }

      const index = this.articles.findIndex((a) => a.guid === article.guid);
      if (index !== -1) {
        this.articles[index] = { ...article };
      }

      this.updateArticleInPlace(article);

      this.callbacks.onArticleUpdate(
        article,
        { tags: [...article.tags] },
        false,
      );

      const targetId = `article-${article.guid}`;
      const articleEls = Array.from(
        this.container.querySelectorAll<HTMLElement>(
          ".rss-dashboard-article-item, .rss-dashboard-article-card, .rss-dashboard-feed-item",
        ),
      ).filter((el) => el.id === targetId);

      if (articleEls.length > 0) {
        articleEls.forEach((articleEl) => {
          articleEl.classList.add("rss-dashboard-tag-change-feedback");
          activeWindow.setTimeout(() => {
            articleEl.classList.remove("rss-dashboard-tag-change-feedback");
          }, 200);
        });
      } else {
        const tempIndicator = activeDocument.body.createDiv({
          cls: "rss-dashboard-tag-change-notification",
          text: `Tag "${tag.name}" ${checked ? "added" : "removed"}`,
        });
        activeWindow.setTimeout(() => {
          if (tempIndicator.parentNode) {
            tempIndicator.parentNode.removeChild(tempIndicator);
          }
        }, 1500);
      }
    });
  }

  private createArticleActionButtons(
    actionToolbar: HTMLElement,
    article: FeedItem,
    mode: "full" | "minimal-read",
  ): void {
    this.createReadToggle(actionToolbar, article);
    if (mode === "minimal-read") {
      return;
    }
    this.createSaveButton(actionToolbar, article);
    this.createStarToggle(actionToolbar, article);
    this.createTagsToggle(actionToolbar, article);
  }

  private renderFeedView(container: HTMLElement, articles: FeedItem[]): void {
    for (const article of articles) {
      const hasTags = !!article.tags?.length;
      const feedItem = container.createDiv({
        cls:
          "rss-dashboard-feed-item" +
          (this.selectedArticle && article.guid === this.selectedArticle.guid
            ? " active"
            : "") +
          (article.read ? " read" : " unread") +
          (article.starred ? " starred" : " unstarred") +
          (article.saved ? " saved" : "") +
          (article.mediaType === "video"
            ? " rss-dashboard-youtube-article"
            : "") +
          (article.mediaType === "podcast"
            ? " rss-dashboard-podcast-article"
            : ""),
        attr: {
          id: `article-${article.guid}`,
          "data-article-guid": article.guid,
        },
      });

      const feedContent = feedItem.createDiv({
        cls: "rss-dashboard-feed-content",
      });

      // 1. Preview Image (Hero)
      let coverImgSrc = article.image || article.coverImage;
      if (!coverImgSrc && article.content) {
        const extracted = extractFirstImageSrc(article.content);
        if (extracted) coverImgSrc = extracted;
      }
      if (!coverImgSrc && article.summary) {
        const extracted = extractFirstImageSrc(article.summary);
        if (extracted) coverImgSrc = extracted;
      }
      if (
        !coverImgSrc &&
        article.enclosure?.type?.startsWith("image/") &&
        article.enclosure?.url
      ) {
        coverImgSrc = article.enclosure.url;
      }

      if (coverImgSrc) {
        const previewRegion = feedContent.createDiv({
          cls: "rss-dashboard-feed-preview-region",
        });
        // Blurred background for premium look and to handle small/varying aspect ratio images
        previewRegion.createDiv({
          cls: "rss-dashboard-feed-hero-blur",
          attr: {
            style: `background-image: url('${coverImgSrc}')`,
          },
        });
        previewRegion.createEl("img", {
          cls: "rss-dashboard-feed-hero-image",
          attr: {
            src: coverImgSrc,
            alt: article.title,
            loading: "lazy",
          },
        });
      }

      const textRegion = feedContent.createDiv({
        cls: "rss-dashboard-feed-text-region",
      });

      // 2. Title and Source
      const header = textRegion.createDiv({
        cls: "rss-dashboard-feed-header",
      });

      const titleEl = header.createDiv({
        cls: "rss-dashboard-article-title",
      });

      if (this.highlightService && this.settings.highlights.highlightInTitles) {
        this.highlightService.setHighlightedText(titleEl, article.title);
      } else {
        titleEl.textContent = article.title;
      }

      if (this.showFeedSource) {
        const articleMeta = header.createDiv({
          cls: "rss-dashboard-article-meta",
        });
        const feedContainer = articleMeta.createDiv({
          cls: "rss-dashboard-article-feed-container",
        });
        this.renderFeedIcon(feedContainer, article.feedUrl, article.mediaType);
        feedContainer.createDiv({
          cls: "rss-dashboard-article-feed",
          text: article.feedTitle,
          attr: { title: article.feedTitle },
        });
      }

      // 3. Clamped Summary/Content
      const feedPreviewText = this.getArticlePreviewSummaryText(article);
      if (feedPreviewText) {
        const summaryEl = textRegion.createDiv({
          cls: "rss-dashboard-feed-summary",
        });

        if (
          this.highlightService &&
          this.settings.highlights.highlightInSummaries
        ) {
          this.highlightService.setHighlightedText(summaryEl, feedPreviewText);
        } else {
          summaryEl.textContent = feedPreviewText;
        }
      }

      // 4. Tags
      if (hasTags) {
        const tagsRegion = feedItem.createDiv({
          cls: "rss-dashboard-feed-tags-region",
        });
        const tagsContainer = tagsRegion.createDiv({
          cls: "rss-dashboard-tag-container",
        });
        renderSingleRowCardTagChips(tagsContainer, article.tags ?? []);
      }

      // 5. Toolbar
      const feedFooter = feedItem.createEl("footer", {
        cls: "rss-dashboard-feed-footer",
      });
      const actionToolbar = feedFooter.createDiv({
        cls: "rss-dashboard-action-toolbar rss-dashboard-feed-toolbar",
      });
      this.createArticleActionButtons(actionToolbar, article, "full");

      const dateEl = actionToolbar.createDiv({
        cls: "rss-dashboard-article-date",
      });
      const dateInfo = formatArticleDate(
        article.pubDate,
        this.settings.display.articleDateStyle ?? "relative",
      );
      dateEl.textContent = dateInfo.text;
      dateEl.setAttribute("title", dateInfo.title);

      feedItem.addEventListener("click", () => {
        this.callbacks.onArticleClick(article);
      });

      feedItem.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.showArticleContextMenu(e, article);
      });
    }
  }

  private renderListView(container: HTMLElement, articles: FeedItem[]): void {
    for (const article of articles) {
      const articleEl = container.createDiv({
        cls:
          "rss-dashboard-article-item" +
          (this.selectedArticle && article.guid === this.selectedArticle.guid
            ? " active"
            : "") +
          (article.read ? " read" : " unread") +
          (article.starred ? " starred" : " unstarred") +
          (article.saved ? " saved" : "") +
          (article.mediaType === "video" ? " video" : "") +
          (article.mediaType === "podcast" ? " podcast" : ""),
        attr: { id: `article-${article.guid}` },
      });
      const showListToolbar = this.shouldShowToolbarForView("list");
      const listToolbarStyle = this.getMobileListToolbarStyle();
      const useBottomRow = showListToolbar && listToolbarStyle === "bottom-row";
      const useMinimal = showListToolbar && listToolbarStyle === "minimal";
      if (useBottomRow) {
        articleEl.addClass("rss-dashboard-list-item-bottom-row");
      }
      const contentEl = articleEl.createDiv("rss-dashboard-article-content");
      const mainGrid = contentEl.createDiv("rss-dashboard-article-grid");
      if (this.showFeedSource) {
        mainGrid.addClass("rss-dashboard-list-has-source");
      }
      if (showListToolbar && !useBottomRow) {
        mainGrid.addClass("rss-dashboard-list-has-actions");
      }
      const headlineEl = mainGrid.createDiv("rss-dashboard-grid-headline");
      const titleEl = headlineEl.createDiv({
        cls: "rss-dashboard-article-title rss-dashboard-list-title",
      });
      if (this.highlightService && this.settings.highlights.highlightInTitles) {
        this.highlightService.setHighlightedText(titleEl, article.title);
      } else {
        titleEl.textContent = article.title;
      }
      const dateInfo = formatArticleDate(
        article.pubDate,
        this.settings.display.articleDateStyle ?? "relative",
      );
      if (!useBottomRow) {
        const timeEl = mainGrid.createDiv("rss-dashboard-grid-time");
        const dateEl = timeEl.createSpan("rss-dashboard-article-date");
        dateEl.textContent = dateInfo.text;
        dateEl.setAttribute("title", dateInfo.title);
      }
      const actionsEl = mainGrid.createDiv("rss-dashboard-grid-actions");
      if (showListToolbar && !useBottomRow) {
        const actionToolbar = actionsEl.createDiv(
          "rss-dashboard-action-toolbar rss-dashboard-list-toolbar",
        );
        this.createArticleActionButtons(
          actionToolbar,
          article,
          useMinimal ? "minimal-read" : "full",
        );
        if (!useMinimal && article.tags && article.tags.length > 0) {
          const articleTags = actionToolbar.createDiv(
            "rss-dashboard-tag-container",
          );
          article.tags.forEach((tag) => {
            const tagEl = articleTags.createDiv({
              cls: "rss-dashboard-tag-badge",
              text: tag.name,
            });
            tagEl.style.setProperty(
              "--tag-color",
              tag.color || "var(--interactive-accent)",
            );
          });
        }
      } else {
        actionsEl.addClass("rss-dashboard-grid-actions-empty");
      }
      if (this.showFeedSource) {
        const sourceEl = mainGrid.createDiv("rss-dashboard-grid-source");
        const metaEl = sourceEl.createDiv("rss-dashboard-article-meta");
        this.renderFeedIcon(metaEl, article.feedUrl, article.mediaType);
        const sourceSpan = metaEl.createSpan("rss-dashboard-article-source");
        sourceSpan.setText(article.feedTitle);
        sourceSpan.setAttribute("title", article.feedTitle);
      }
      if (showListToolbar && useBottomRow) {
        if (article.tags && article.tags.length > 0) {
          const bodyTags = contentEl.createDiv(
            "rss-dashboard-tag-container rss-dashboard-list-body-tags",
          );
          const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
          tagsToShow.forEach((tag) => {
            const tagEl = bodyTags.createDiv({
              cls: "rss-dashboard-tag-badge",
              text: tag.name,
            });
            tagEl.style.setProperty(
              "--tag-color",
              tag.color || "var(--interactive-accent)",
            );
          });
          if (article.tags.length > MAX_VISIBLE_TAGS) {
            const overflowTag = bodyTags.createDiv({
              cls: "rss-dashboard-tag-overflow",
              text: `+${article.tags.length - MAX_VISIBLE_TAGS}`,
            });
            overflowTag.title = article.tags
              .slice(MAX_VISIBLE_TAGS)
              .map((t) => t.name)
              .join(", ");
          }
        }

        const listFooter = contentEl.createEl("footer", {
          cls: "rss-dashboard-list-footer",
        });
        const footerToolbar = listFooter.createDiv(
          "rss-dashboard-action-toolbar rss-dashboard-list-toolbar rss-dashboard-list-toolbar-bottom-row",
        );
        this.createArticleActionButtons(
          footerToolbar,
          article,
          useMinimal ? "minimal-read" : "full",
        );
        const footerDateEl = listFooter.createDiv({
          cls: "rss-dashboard-article-date rss-dashboard-list-footer-date",
        });
        footerDateEl.textContent = dateInfo.text;
        footerDateEl.setAttribute("title", dateInfo.title);
      }
      articleEl.addEventListener("click", () => {
        this.callbacks.onArticleClick(article);
      });
      articleEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.showArticleContextMenu(e, article);
      });
    }
  }

  private renderCardView(container: HTMLElement, articles: FeedItem[]): void {
    for (const article of articles) {
      const hasTags = !!article.tags?.length;
      const card = container.createDiv({
        cls:
          "rss-dashboard-article-card" +
          (hasTags ? " rss-dashboard-article-card--has-tags" : "") +
          (this.selectedArticle && article.guid === this.selectedArticle.guid
            ? " active"
            : "") +
          (article.read ? " read" : " unread") +
          (article.starred ? " starred" : " unstarred") +
          (article.saved ? " saved" : "") +
          (article.mediaType === "video"
            ? " rss-dashboard-youtube-article"
            : "") +
          (article.mediaType === "podcast"
            ? " rss-dashboard-podcast-article"
            : ""),
        attr: {
          id: `article-${article.guid}`,
          "data-article-guid": article.guid,
        },
      });

      const cardContent = card.createDiv({
        cls: "rss-dashboard-card-content",
      });

      const cardHeader = cardContent.createDiv({
        cls: "rss-dashboard-card-header",
      });

      const cardTitleEl = cardHeader.createDiv({
        cls: "rss-dashboard-article-title",
      });

      if (this.highlightService && this.settings.highlights.highlightInTitles) {
        this.highlightService.setHighlightedText(cardTitleEl, article.title);
      } else {
        cardTitleEl.textContent = article.title;
      }

      if (this.showFeedSource) {
        const articleMeta = cardHeader.createDiv({
          cls: "rss-dashboard-article-meta",
        });

        const feedContainer = articleMeta.createDiv({
          cls: "rss-dashboard-article-feed-container",
        });

        this.renderFeedIcon(feedContainer, article.feedUrl, article.mediaType);
        feedContainer.createDiv({
          cls: "rss-dashboard-article-feed",
          text: article.feedTitle,
          attr: { title: article.feedTitle },
        });
      }

      let coverImgSrc = article.coverImage;
      if (!coverImgSrc && article.content) {
        const extracted = extractFirstImageSrc(article.content);
        if (extracted) coverImgSrc = extracted;
      }
      if (!coverImgSrc && article.summary) {
        const extracted = extractFirstImageSrc(article.summary);
        if (extracted) coverImgSrc = extracted;
      }
      if (
        !coverImgSrc &&
        article.enclosure?.type?.startsWith("image/") &&
        article.enclosure?.url
      ) {
        coverImgSrc = article.enclosure.url;
      }

      const previewSummaryText = this.getArticlePreviewSummaryText(article);

      if (coverImgSrc) {
        const previewRegion = cardContent.createDiv({
          cls: "rss-dashboard-card-preview-region",
        });
        const coverContainer = previewRegion.createDiv({
          cls:
            "rss-dashboard-cover-container" +
            (previewSummaryText ? " has-summary" : ""),
        });
        const coverImg = coverContainer.createEl("img", {
          cls: "rss-dashboard-cover-image",
          attr: {
            src: coverImgSrc,
            alt: article.title,
          },
        });
        coverImg.onerror = () => {
          previewRegion.remove();
          this.scheduleCardTagLayout(card);
        };

        if (previewSummaryText) {
          const summaryOverlay = coverContainer.createDiv({
            cls: "rss-dashboard-summary-overlay",
          });
          if (
            this.highlightService &&
            this.settings.highlights.highlightInSummaries &&
            this.shouldHighlightCardPreviewSummary(previewSummaryText)
          ) {
            this.highlightService.setHighlightedText(
              summaryOverlay,
              previewSummaryText,
            );
          } else {
            summaryOverlay.textContent = previewSummaryText;
          }
        }
      } else if (previewSummaryText) {
        const previewRegion = cardContent.createDiv({
          cls: "rss-dashboard-card-preview-region",
        });
        const summaryOnlyContainer = previewRegion.createDiv({
          cls: "rss-dashboard-cover-summary-only",
        });
        if (
          this.highlightService &&
          this.settings.highlights.highlightInSummaries &&
          this.shouldHighlightCardPreviewSummary(previewSummaryText)
        ) {
          this.highlightService.setHighlightedText(
            summaryOnlyContainer,
            previewSummaryText,
          );
        } else {
          summaryOnlyContainer.textContent = previewSummaryText;
        }
      }

      if (hasTags) {
        const tagsRegion = card.createDiv({
          cls: "rss-dashboard-card-tags-region",
        });
        const tagsContainer = tagsRegion.createDiv({
          cls: "rss-dashboard-tag-container",
        });
        renderSingleRowCardTagChips(tagsContainer, article.tags ?? []);
      }

      if (this.shouldShowToolbarForView("card")) {
        const cardFooter = card.createEl("footer", {
          cls: "rss-dashboard-card-footer",
        });
        const actionToolbar = cardFooter.createDiv({
          cls: "rss-dashboard-action-toolbar rss-dashboard-card-toolbar",
        });
        this.createArticleActionButtons(actionToolbar, article, "full");

        const dateEl = actionToolbar.createDiv({
          cls: "rss-dashboard-article-date",
        });
        const dateInfo = formatArticleDate(
          article.pubDate,
          this.settings.display.articleDateStyle ?? "relative",
        );
        dateEl.textContent = dateInfo.text;
        dateEl.setAttribute("title", dateInfo.title);
      }

      card.addEventListener("click", () => {
        this.callbacks.onArticleClick(article);
      });

      card.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.showArticleContextMenu(e, article);
      });

      this.scheduleCardTagLayout(card);
    }
  }
  private showArticleContextMenu(event: MouseEvent, article: FeedItem): void {
    const menu = new Menu();

    if (article.saved) {
      menu.addItem((item: MenuItem) => {
        item
          .setTitle("Open saved article")
          .setIcon("file-text")
          .onClick(() => {
            if (this.callbacks.onOpenSavedArticle) {
              void this.callbacks.onOpenSavedArticle(article);
            }
          });
      });

      menu.addItem((item: MenuItem) => {
        item
          .setTitle("Open in reader view")
          .setIcon("book-open")
          .onClick(() => {
            if (this.callbacks.onOpenInReaderView) {
              void this.callbacks.onOpenInReaderView(article);
            }
          });
      });

      menu.addSeparator();
    }

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Open in browser")
        .setIcon("external-link")
        .onClick(() => {
          activeWindow.open(article.link, "_blank");
        });
    });

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Open in split view")
        .setIcon("panel-left")
        .onClick(() => {
          this.callbacks.onArticleClick(article);
        });
    });

    menu.addSeparator();

    menu.addItem((item: MenuItem) => {
      item
        .setTitle(article.read ? "Mark as unread" : "Mark as read")
        .setIcon(article.read ? "circle" : "check-circle")
        .onClick(() => {
          this.callbacks.onArticleUpdate(
            article,
            { read: !article.read },
            false,
          );
        });
    });

    menu.addItem((item: MenuItem) => {
      item
        .setTitle(article.starred ? "Unstar articles" : "Star articles")
        .setIcon("star")
        .onClick(() => {
          this.callbacks.onArticleUpdate(
            article,
            { starred: !article.starred },
            false,
          );
        });
    });

    if (!article.saved) {
      menu.addSeparator();
      menu.addItem((item: MenuItem) => {
        item
          .setTitle(
            this.settings.articleSaving.saveFullContent
              ? "Save full article"
              : "Save article summary",
          )
          .setIcon("save")
          .onClick(() => {
            if (this.callbacks.onArticleSave) {
              void this.callbacks.onArticleSave(article);
            }
          });
      });
    }

    menu.showAtMouseEvent(event);
  }

  private createPortalDropdown(
    toggleElement: HTMLElement,
    article: FeedItem,
    onTagChange: (tag: Tag, checked: boolean) => void,
  ): void {
    if (this.tagsDropdownCleanup) {
      this.tagsDropdownCleanup();
      this.tagsDropdownCleanup = null;
    }

    const cleanup = createTagsDropdownPortal({
      anchor: toggleElement,
      settings: this.settings,
      item: article,
      onTagAssignmentChange: onTagChange,
      onPersistSettings: () => this.persistSettings(),
      onAfterSettingsTagsMutated: () => {
        this.refreshVisibleArticleTags();
        this.callbacks.onTagsMutated?.();
      },
      onOpenTagsSettings: this.callbacks.onOpenTagsSettings,
      appContainer: this.container,
      onClosed: () => {
        if (this.tagsDropdownCleanup === cleanup) {
          this.tagsDropdownCleanup = null;
        }
      },
    });
    this.tagsDropdownCleanup = cleanup;
  }

  updateRefreshButtonText(text: string): void {
    if (this.refreshButton) {
      this.refreshButton.setAttribute("title", text);
    }
  }

  private setRefreshButtonsRefreshing(refreshing: boolean): void {
    this.container
      .querySelectorAll<HTMLElement>(".rss-dashboard-refresh-button")
      .forEach((button) => button.classList.toggle("refreshing", refreshing));
  }

  private async handleRefreshButtonClick(): Promise<void> {
    this.setRefreshButtonsRefreshing(true);
    try {
      await Promise.resolve(this.callbacks.onRefreshFeeds());
    } finally {
      this.setRefreshButtonsRefreshing(false);
    }
  }
}

function extractFirstImageSrc(html: string): string | null {
  if (!html) return null;

  // Use a regex for rapid extraction without full DOM parsing
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}
