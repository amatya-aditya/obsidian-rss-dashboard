import { Notice, Menu, MenuItem, setIcon, Setting } from "obsidian";
import { FeedItem, RssDashboardSettings, Tag } from "../types/types";
import {
  formatDateWithRelative,
  ensureUtf8Meta,
  setCssProps,
  TABLET_LAYOUT_MAX_WIDTH,
} from "../utils/platform-utils";
import { HighlightService } from "../services/highlight-service";

const MAX_VISIBLE_TAGS = 6;

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      if (parts.length === 3 && parts[0] === "feeds") {
        return `${parts[1]}.${parts[2]}`;
      } else if (parts.length >= 3) {
        return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
      } else {
        return hostname;
      }
    }
    return hostname;
  } catch {
    const match = url.match(/https?:\/\/([^/?]+)/);
    if (match) {
      const hostname = match[1];
      const parts = hostname.split(".");
      if (parts.length >= 2) {
        if (parts.length === 3 && parts[0] === "feeds") {
          return `${parts[1]}.${parts[2]}`;
        } else if (parts.length >= 3) {
          return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
        } else {
          return hostname;
        }
      }
      return hostname;
    }
    return "";
  }
}

function getFaviconUrl(domain: string): string {
  if (!domain) return "";
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=32`;
}

interface ArticleListCallbacks {
  onArticleClick: (article: FeedItem) => void;
  onToggleViewStyle: (style: "list" | "card") => void;
  onRefreshFeeds: () => Promise<void> | void;
  onArticleUpdate: (
    article: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => void;
  onArticleSave: (article: FeedItem) => void;
  onOpenSavedArticle?: (article: FeedItem) => void;
  onOpenInReaderView?: (article: FeedItem) => void;
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
  onMarkAllAsRead?: () => void;
  onMarkAllAsUnread?: () => void;
  onPersistSettings?: () => Promise<void> | void;
  onOpenTagsSettings?: () => Promise<void> | void;
}

export class ArticleList {
  private container: HTMLElement;
  private settings: RssDashboardSettings;
  private title: string;
  private articles: FeedItem[];
  private selectedArticle: FeedItem | null;
  private callbacks: ArticleListCallbacks;
  private refreshButton: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private currentPage: number;
  private totalPages: number;
  private pageSize: number;
  private totalArticles: number;
  private currentFeedUrl: string | null = null;
  private showFeedSource: boolean = true;
  private statusFilters: Set<string>;
  private tagFilters: Set<string>;
  private filterLogic: "AND" | "OR";
  private articleSearchQuery: string = "";
  private articleSearchDesktopInput: HTMLInputElement | null = null;
  private articleSearchDropdownInput: HTMLInputElement | null = null;
  private documentListeners: Array<{
    target: Document;
    type: string;
    listener: EventListenerOrEventListenerObject;
  }> = [];
  private activePortal: HTMLElement | null = null;
  private activeFilterToggleBtn: HTMLElement | null = null;
  private activeFilterOutsideListenerCleanup: (() => void) | null = null;
  private tagsDropdownCleanup: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    settings: RssDashboardSettings,
    title: string,
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
  }

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.closeActiveFilterMenu();
    this.documentListeners.forEach(({ target, type, listener }) => {
      target.removeEventListener(type, listener);
    });
    this.documentListeners = [];
    if (this.tagsDropdownCleanup) {
      this.tagsDropdownCleanup();
      this.tagsDropdownCleanup = null;
    }
  }

  private closeActiveFilterMenu(): void {
    if (this.activeFilterOutsideListenerCleanup) {
      this.activeFilterOutsideListenerCleanup();
      this.activeFilterOutsideListenerCleanup = null;
    }
    if (this.activePortal) {
      this.activePortal.remove();
      this.activePortal = null;
    }
    if (this.activeFilterToggleBtn) {
      this.activeFilterToggleBtn.removeClass("active");
      this.activeFilterToggleBtn = null;
    }
  }

  private updateFilterTriggerBadge(button: HTMLElement): void {
    button.classList.remove("has-active-filters");
    button
      .querySelectorAll(".rss-dashboard-filter-badge")
      .forEach((el) => el.remove());

    const count = this.statusFilters.size + this.tagFilters.size;
    if (count > 0) {
      button.classList.add("has-active-filters");
      button.createDiv({
        cls: "rss-dashboard-filter-badge",
        text: String(count),
      });
    }
  }

  private isMobileViewport(): boolean {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  private shouldShowToolbarForView(view: "list" | "card"): boolean {
    if (!this.isMobileViewport()) {
      return true;
    }

    const showToolbarSetting =
      view === "card"
        ? this.settings.display.mobileShowCardToolbar
        : this.settings.display.mobileShowListToolbar;

    return showToolbarSetting;
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

  private addDocumentListener(
    target: Document,
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

  render(): void {
    const articlesList = this.container.querySelector(
      ".rss-dashboard-articles-list",
    );
    const scrollPosition = articlesList?.scrollTop;

    this.container.empty();

    this.renderHeader();
    this.renderArticles();

    if (articlesList && scrollPosition !== undefined) {
      requestAnimationFrame(() => {
        articlesList.scrollTop = scrollPosition;
      });
    }
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
  ): void {
    this.statusFilters = statusFilters;
    this.tagFilters = tagFilters;
    this.filterLogic = filterLogic;
    this.articles = articles;

    // Update all filter trigger badges (desktop + mobile)
    this.container
      .querySelectorAll(".rss-dashboard-filter-trigger")
      .forEach((el) => this.updateFilterTriggerBadge(el as HTMLElement));

    // Remove both the articles list and the pagination wrapper
    // (pagination is rendered as a sibling to the articles list)
    this.container
      .querySelectorAll(
        ".rss-dashboard-articles-list, .rss-dashboard-pagination-wrapper",
      )
      .forEach((el) => el.remove());
    this.renderArticles();
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

    requestAnimationFrame(() => {
      setCssProps(targetEl, {
        opacity: "0",
        "max-height": "0",
        "margin-top": "0",
        "margin-bottom": "0",
        "padding-top": "0",
        "padding-bottom": "0",
      });
    });

    setTimeout(() => {
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
    const temp = document.createElement("div");

    if (this.settings.viewStyle === "list") {
      this.renderListView(temp, [article]);
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

    requestAnimationFrame(() => {
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

    setTimeout(() => {
      setCssProps(newEl, {
        overflow: "",
        "max-height": "",
        transition: "",
      });
    }, 320);

    return true;
  }

  public setSelectedArticle(article: FeedItem): void {
    this.selectedArticle = article;
    // Remove active class from any currently active element
    this.container
      .querySelectorAll<HTMLElement>(
        ".rss-dashboard-article-item.active, .rss-dashboard-article-card.active",
      )
      .forEach((el) => el.classList.remove("active"));
    // Add active class to the newly selected article element
    const targetEl = this.container.querySelector<HTMLElement>(
      `#article-${CSS.escape(article.guid)}`,
    );
    if (targetEl) {
      targetEl.classList.add("active");
    }
  }

  public updateArticleInPlace(article: FeedItem): void {
    const index = this.articles.findIndex((a) => a.guid === article.guid);
    if (index !== -1) {
      this.articles[index] = article;
    }

    const targetId = `article-${article.guid}`;
    const articleEls = Array.from(
      this.container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-article-item, .rss-dashboard-article-card",
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
      articleEl.querySelectorAll<HTMLElement>(".rss-dashboard-article-tags"),
    );

    const hasTags = tags.length > 0;
    if (!hasTags && existingContainers.length > 0) {
      existingContainers.forEach((container) => container.remove());
      return;
    }

    if (hasTags && existingContainers.length === 0) {
      if (articleEl.classList.contains("rss-dashboard-article-card")) {
        const cardContent = articleEl.querySelector<HTMLElement>(
          ".rss-dashboard-card-content",
        );
        if (cardContent) {
          existingContainers.push(
            cardContent.createDiv({
              cls: "rss-dashboard-article-tags",
            }),
          );
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
            cls: "rss-dashboard-article-tags rss-dashboard-list-body-tags",
          });
          if (listFooter) {
            articleContent.insertBefore(tagContainer, listFooter);
          }
          existingContainers.push(tagContainer);
        }
      } else {
        const toolbar = articleEl.querySelector<HTMLElement>(
          ".rss-dashboard-action-toolbar",
        );
        if (toolbar) {
          existingContainers.push(
            toolbar.createDiv({ cls: "rss-dashboard-article-tags" }),
          );
        }
      }
    }

    existingContainers.forEach((container) => {
      container.empty();
      const tagsToShow = tags.slice(0, MAX_VISIBLE_TAGS);
      tagsToShow.forEach((tag) => {
        const tagEl = container.createDiv({
          cls: "rss-dashboard-article-tag",
          text: tag.name,
        });
        tagEl.style.setProperty(
          "--tag-color",
          tag.color || "var(--interactive-accent)",
        );
      });

      if (tags.length > MAX_VISIBLE_TAGS) {
        const overflow = container.createDiv({
          cls: "rss-dashboard-tag-overflow",
          text: `+${tags.length - MAX_VISIBLE_TAGS}`,
        });
        overflow.title = tags
          .slice(MAX_VISIBLE_TAGS)
          .map((t) => t.name)
          .join(", ");
      }
    });
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
      ".rss-dashboard-article-item, .rss-dashboard-article-card",
    );

    articleElements.forEach((el) => {
      const titleEl = el.querySelector(".rss-dashboard-article-title");
      const title = titleEl?.textContent?.toLowerCase() || "";

      if (query && !title.includes(query)) {
        (el as HTMLElement).classList.add("search-hidden");
      } else {
        (el as HTMLElement).classList.remove("search-hidden");
      }
    });
  }

  private renderHeader(): void {
    const articlesHeader = this.container.createDiv({
      cls: "rss-dashboard-articles-header",
    });

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        // Keep header actions compact on narrow panes.
        if (width <= TABLET_LAYOUT_MAX_WIDTH) {
          articlesHeader.classList.add("is-narrow");
        } else {
          articlesHeader.classList.remove("is-narrow");
        }
      }
    });
    this.resizeObserver.observe(articlesHeader);

    const leftSection = articlesHeader.createDiv({
      cls: "rss-dashboard-header-left",
    });

    const sidebarToggleButton = leftSection.createDiv({
      cls: "rss-dashboard-sidebar-toggle",
      attr: { title: "Toggle sidebar" },
    });
    setIcon(
      sidebarToggleButton,
      this.settings.sidebarCollapsed ? "panel-left-open" : "panel-left-close",
    );
    sidebarToggleButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks.onToggleSidebar();
    });

    // Add feed logo if viewing a specific feed
    if (this.currentFeedUrl) {
      const feedIconContainer = leftSection.createDiv({
        cls: "rss-dashboard-header-feed-icon",
      });
      this.renderHeaderFeedIcon(feedIconContainer, this.currentFeedUrl);
    }

    leftSection.createDiv({
      cls: "rss-dashboard-articles-title",
      text: this.title,
    });

    const rightSection = articlesHeader.createDiv({
      cls: "rss-dashboard-header-right",
    });

    const mobileFilterButton = rightSection.createEl("button", {
      cls: "rss-dashboard-mobile-filter-button rss-dashboard-filter-trigger",
      attr: { title: "Filters" },
    });
    const mobileFilterIcon = mobileFilterButton.createDiv({
      cls: "rss-dashboard-mobile-filter-icon",
    });
    setIcon(mobileFilterIcon, "filter");
    this.updateFilterTriggerBadge(mobileFilterButton);
    mobileFilterButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showFiltersMenu(mobileFilterButton);
    });

    const hamburgerMenu = rightSection.createDiv({
      cls: "rss-dashboard-hamburger-menu",
    });

    const hamburgerButton = hamburgerMenu.createDiv({
      cls: "rss-dashboard-hamburger-button",
      attr: { title: "Menu" },
    });
    setIcon(hamburgerButton, "menu");

    const dropdownMenu = hamburgerMenu.createDiv({
      cls: "rss-dashboard-dropdown-menu",
    });

    const dropdownControls = dropdownMenu.createDiv({
      cls: "rss-dashboard-dropdown-controls",
    });

    this.createControls(dropdownControls, { includeFilter: false });

    const desktopControls = rightSection.createDiv({
      cls: "rss-dashboard-desktop-controls",
    });

    this.createControls(desktopControls);

    hamburgerButton.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle("active");
      hamburgerButton.classList.toggle("active");
    });

    const handleDocumentClick = (e: Event) => {
      const clickTarget = e.target as Node;
      const isInsideHamburgerMenu = hamburgerMenu.contains(clickTarget);
      const isInsideActiveFilterMenu =
        this.activePortal?.contains(clickTarget) ?? false;

      if (!isInsideHamburgerMenu && !isInsideActiveFilterMenu) {
        dropdownMenu.classList.remove("active");
        hamburgerButton.classList.remove("active");
      }
    };

    this.addDocumentListener(
      this.container.ownerDocument || document,
      "click",
      handleDocumentClick,
    );
  }

  private createControls(
    container: HTMLElement,
    options?: { includeFilter?: boolean },
  ): void {
    const articleControls = container.createDiv({
      cls: "rss-dashboard-article-controls",
    });
    const includeFilter = options?.includeFilter ?? true;

    const isDropdown = container.classList.contains(
      "rss-dashboard-dropdown-controls",
    );

    const createSelectControl = (
      iconName: string,
      classNames: string[],
      labelText?: string,
    ): HTMLSelectElement => {
      const selectWrapper = articleControls.createDiv({
        cls:
          "rss-dashboard-select-with-icon" +
          (!isDropdown && labelText ? " rss-dashboard-select-with-label" : ""),
      });
      const selectIcon = selectWrapper.createDiv({
        cls: "rss-dashboard-select-icon",
      });
      setIcon(selectIcon, iconName);

      if (!isDropdown && labelText) {
        selectWrapper.createSpan({
          cls: "rss-dashboard-select-label",
          text: labelText,
        });
      }

      const select = selectWrapper.createEl("select");
      select.addClass(...classNames);
      return select;
    };

    if (includeFilter) {
      const multiFilterBtn = articleControls.createEl("button", {
        cls: "rss-dashboard-multi-filter-btn rss-dashboard-filter-trigger",
      });
      const filterIcon = multiFilterBtn.createDiv();
      setIcon(filterIcon, "filter");
      multiFilterBtn.createSpan({ text: "Filter" });
      this.updateFilterTriggerBadge(multiFilterBtn);

      multiFilterBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showFiltersMenu(multiFilterBtn);
      });
    }

    // Article search input
    const searchContainer = articleControls.createDiv({
      cls: "rss-dashboard-article-search-container",
    });

    // Create search icon first (so it's absolutely positioned correctly)
    const searchIcon = searchContainer.createDiv({
      cls: "rss-dashboard-article-search-icon",
    });
    setIcon(searchIcon, "search");

    const searchInput = searchContainer.createEl("input", {
      cls: "rss-dashboard-article-search-input",
      attr: {
        type: "text",
        placeholder: "Search articles...",
        autocomplete: "off",
        spellcheck: "false",
      },
    });

    let clearSearchButton: HTMLButtonElement | null = null;
    if (isDropdown) {
      clearSearchButton = searchContainer.createEl("button", {
        cls: "rss-dashboard-article-search-clear-button is-hidden",
        attr: {
          type: "button",
          title: "Clear search",
          "aria-label": "Clear search",
        },
      });
      setIcon(clearSearchButton, "x");
    }

    // Store reference to sync between dropdown and desktop
    if (isDropdown) {
      this.articleSearchDropdownInput = searchInput;
    } else {
      this.articleSearchDesktopInput = searchInput;
    }

    let searchTimeout: number;
    const applySearchQuery = (rawValue: string, debounce = true): void => {
      const query = rawValue.toLowerCase().trim();
      this.articleSearchQuery = query;

      if (clearSearchButton) {
        const hasValue = rawValue.trim().length > 0;
        clearSearchButton.toggleClass("is-hidden", !hasValue);
      }

      // Sync the other search input if it exists
      if (isDropdown && this.articleSearchDesktopInput) {
        this.articleSearchDesktopInput.value = rawValue;
      } else if (!isDropdown && this.articleSearchDropdownInput) {
        this.articleSearchDropdownInput.value = rawValue;
      }

      if (searchTimeout) {
        window.clearTimeout(searchTimeout);
      }

      if (!debounce) {
        this.filterArticlesBySearch(query);
        return;
      }

      searchTimeout = window.setTimeout(() => {
        this.filterArticlesBySearch(query);
      }, 150);
    };

    // Search input event handler with debouncing
    searchInput.addEventListener("input", (e) => {
      applySearchQuery((e.target as HTMLInputElement)?.value || "", true);
    });

    if (clearSearchButton) {
      clearSearchButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        searchInput.value = "";
        applySearchQuery("", false);
        searchInput.focus();
      });
    }

    // Move age filter into its own space or keep as is?
    // For now, let's keep it but make it smaller or label it better.
    const ageDropdown = createSelectControl(
      "history",
      ["rss-dashboard-filter", "rss-dashboard-age-filter"],
      "Age:",
    );
    const ageOptions = {
      All: 0,
      "1 hour": 3600 * 1000,
      "2 hours": 2 * 3600 * 1000,
      "4 hours": 4 * 3600 * 1000,
      "8 hours": 8 * 3600 * 1000,
      "24 hours": 24 * 3600 * 1000,
      "48 hours": 48 * 3600 * 1000,
      "3 days": 3 * 24 * 3600 * 1000,
      "1 week": 7 * 24 * 3600 * 1000,
      "2 weeks": 14 * 24 * 3600 * 1000,
      "1 month": 30 * 24 * 3600 * 1000,
      "2 months": 60 * 24 * 3600 * 1000,
      "6 months": 180 * 24 * 3600 * 1000,
      "1 year": 365 * 24 * 3600 * 1000,
    };

    for (const [text, value] of Object.entries(ageOptions)) {
      ageDropdown.createEl("option", {
        text: text,
        value: String(value),
      });
    }

    const filterValue =
      typeof this.settings.articleFilter.value === "number"
        ? this.settings.articleFilter.value
        : 0;
    ageDropdown.value = String(filterValue);

    ageDropdown.addEventListener("change", (e: Event) => {
      const value = Number((e.target as HTMLSelectElement).value);
      this.callbacks.onFilterChange({
        type: value === 0 ? "none" : "age",
        value: value,
      });
    });

    const sortDropdown = createSelectControl(
      "arrow-up-down",
      ["rss-dashboard-sort"],
      "Sort:",
    );
    sortDropdown.createEl("option", {
      text: "Newest",
      value: "newest",
    });
    sortDropdown.createEl("option", {
      text: "Oldest",
      value: "oldest",
    });
    sortDropdown.value = this.settings.articleSort;
    sortDropdown.addEventListener("change", (e: Event) => {
      this.callbacks.onSortChange(
        (e.target as HTMLSelectElement).value as "newest" | "oldest",
      );
    });

    const groupDropdown = createSelectControl(
      "folders",
      ["rss-dashboard-group"],
      "Grouping:",
    );
    groupDropdown.createEl("option", {
      text: "None",
      value: "none",
    });
    groupDropdown.createEl("option", {
      text: "Feed",
      value: "feed",
    });
    groupDropdown.createEl("option", {
      text: "Date",
      value: "date",
    });
    groupDropdown.createEl("option", {
      text: "Folder",
      value: "folder",
    });
    groupDropdown.value = this.settings.articleGroupBy;
    groupDropdown.addEventListener("change", (e: Event) => {
      this.callbacks.onGroupChange(
        (e.target as HTMLSelectElement).value as
          | "none"
          | "feed"
          | "date"
          | "folder",
      );
    });

    const viewStyleToggle = articleControls.createDiv({
      cls: "rss-dashboard-view-toggle",
    });

    const listViewButton = viewStyleToggle.createEl("button", {
      cls:
        "rss-dashboard-list-view-button" +
        (this.settings.viewStyle === "list" ? " active" : ""),
    });
    const listIcon = listViewButton.createDiv();
    setIcon(listIcon, "list");
    listViewButton.createSpan({ text: "List" });

    listViewButton.addEventListener("click", () => {
      this.callbacks.onToggleViewStyle("list");
    });

    const cardViewButton = viewStyleToggle.createEl("button", {
      cls:
        "rss-dashboard-card-view-button" +
        (this.settings.viewStyle === "card" ? " active" : ""),
    });
    const cardIcon = cardViewButton.createDiv();
    setIcon(cardIcon, "layout-grid");
    cardViewButton.createSpan({ text: "Card" });

    cardViewButton.addEventListener("click", () => {
      this.callbacks.onToggleViewStyle("card");
    });

    if (isDropdown && this.isMobileViewport()) {
      const toolbarModeRow = articleControls.createDiv({
        cls: "rss-dashboard-toolbar-mode-row",
      });
      toolbarModeRow.createSpan({
        cls: "rss-dashboard-toolbar-mode-label",
        text: "Toolbar:",
      });

      const toolbarModeSelect = toolbarModeRow.createEl("select", {
        cls: "rss-dashboard-toolbar-mode-select",
        attr: { "aria-label": "Mobile toolbar mode" },
      });

      if (this.settings.viewStyle === "list") {
        toolbarModeSelect.createEl("option", {
          text: "2x2",
          value: "left-grid",
        });
        toolbarModeSelect.createEl("option", {
          text: "Bottom row",
          value: "bottom-row",
        });
        toolbarModeSelect.createEl("option", {
          text: "Single read/unread",
          value: "minimal",
        });
        toolbarModeSelect.createEl("option", {
          text: "None",
          value: "none",
        });
        toolbarModeSelect.value = this.settings.display.mobileShowListToolbar
          ? this.getMobileListToolbarStyle()
          : "none";
      } else {
        toolbarModeSelect.createEl("option", {
          text: "Bottom",
          value: "bottom",
        });
        toolbarModeSelect.createEl("option", {
          text: "None",
          value: "none",
        });
        toolbarModeSelect.value = this.settings.display.mobileShowCardToolbar
          ? "bottom"
          : "none";
      }

      toolbarModeSelect.addEventListener("change", (e: Event) => {
        const value = (e.target as HTMLSelectElement).value;

        if (this.settings.viewStyle === "list") {
          if (value === "none") {
            this.settings.display.mobileShowListToolbar = false;
          } else if (
            value === "left-grid" ||
            value === "bottom-row" ||
            value === "minimal"
          ) {
            this.settings.display.mobileShowListToolbar = true;
            this.settings.display.mobileListToolbarStyle = value;
          }
        } else {
          this.settings.display.mobileShowCardToolbar = value !== "none";
        }

        this.persistSettings();
        this.render();
      });
    }

    if (isDropdown && this.settings.viewStyle === "card") {
      const cardsPerRowRow = articleControls.createDiv({
        cls: "rss-dashboard-toolbar-mode-row",
      });
      cardsPerRowRow.createSpan({
        cls: "rss-dashboard-toolbar-mode-label",
        text: "Cards / row:",
      });

      const cardsPerRowSelect = cardsPerRowRow.createEl("select", {
        cls: "rss-dashboard-toolbar-mode-select",
        attr: { "aria-label": "Cards per row" },
      });

      cardsPerRowSelect.createEl("option", {
        text: "Auto",
        value: "0",
      });

      for (const count of [1, 2, 3, 4, 5, 6]) {
        cardsPerRowSelect.createEl("option", {
          text: `${count}`,
          value: String(count),
        });
      }

      cardsPerRowSelect.value = String(this.getCardColumnsPerRow());

      cardsPerRowSelect.addEventListener("change", (e: Event) => {
        const value = Number((e.target as HTMLSelectElement).value);
        this.settings.display.cardColumnsPerRow = Number.isFinite(value)
          ? Math.max(0, Math.min(6, Math.round(value)))
          : 0;
        this.persistSettings();
        this.render();
      });
    }

    const createRefreshButton = (
      parentEl: HTMLElement,
      extraClass = "",
      storeReference = false,
    ): void => {
      const dashboardRefreshButton = parentEl.createEl("button", {
        cls:
          "rss-dashboard-refresh-button" + (extraClass ? ` ${extraClass}` : ""),
      });
      const refreshIcon = dashboardRefreshButton.createDiv({
        cls: "rss-dashboard-refresh-icon",
      });
      setIcon(refreshIcon, "refresh-cw");
      dashboardRefreshButton.setAttr("title", "Refresh feeds");

      if (storeReference) {
        this.refreshButton = dashboardRefreshButton;
      }

      dashboardRefreshButton.addEventListener("click", () => {
        if (dashboardRefreshButton.classList.contains("refreshing")) return;
        void this.handleRefreshButtonClick();
      });
    };

    if (isDropdown) {
      createRefreshButton(viewStyleToggle, "rss-dashboard-view-refresh-button");
    } else {
      createRefreshButton(articleControls, "", true);
    }

    const markAllRow = articleControls.createDiv({
      cls: "rss-dashboard-mark-all-row",
    });

    markAllRow.createSpan({
      cls: "rss-dashboard-mark-all-label",
      text: "Mark all:",
    });

    const markAllButtonsContainer = markAllRow.createDiv({
      cls: "rss-dashboard-mark-all-buttons-row",
    });

    const markAllReadButton = markAllButtonsContainer.createEl("button", {
      cls: "rss-dashboard-mark-all-read-button rss-dashboard-mark-all-button",
    });
    const markReadIcon = markAllReadButton.createDiv({
      cls: "rss-dashboard-mark-all-read-icon",
    });
    setIcon(markReadIcon, "check-circle");
    markAllReadButton.createSpan({
      cls: "rss-dashboard-mark-all-read-text",
      text: "Read",
    });
    markAllReadButton.setAttr(
      "title",
      "Mark all articles in current view as read",
    );

    markAllReadButton.addEventListener("click", () => {
      this.callbacks.onMarkAllAsRead?.();
    });

    const markAllUnreadButton = markAllButtonsContainer.createEl("button", {
      cls: "rss-dashboard-mark-all-unread-button rss-dashboard-mark-all-button",
    });
    const markUnreadIcon = markAllUnreadButton.createDiv({
      cls: "rss-dashboard-mark-all-unread-icon",
    });
    setIcon(markUnreadIcon, "circle");
    markAllUnreadButton.createSpan({
      cls: "rss-dashboard-mark-all-unread-text",
      text: "Unread",
    });
    markAllUnreadButton.setAttr(
      "title",
      "Mark all articles in current view as unread",
    );

    markAllUnreadButton.addEventListener("click", () => {
      this.callbacks.onMarkAllAsUnread?.();
    });
  }

  private showFiltersMenu(toggleBtn: HTMLElement): void {
    const targetDocument = toggleBtn.ownerDocument;
    const targetBody = targetDocument.body;
    const targetWindow = targetDocument.defaultView || window;

    // Toggle close when clicking the same trigger.
    if (this.activePortal && this.activeFilterToggleBtn === toggleBtn) {
      this.closeActiveFilterMenu();
      return;
    }
    this.closeActiveFilterMenu();

    // Remove any existing menus from stale state.
    targetDocument
      .querySelectorAll(".rss-dashboard-filter-menu-portal")
      .forEach((el) => el.remove());

    const menuPortal = targetBody.createDiv({
      cls: "rss-dashboard-filter-menu rss-dashboard-filter-menu-portal",
    });
    this.activePortal = menuPortal;
    this.activeFilterToggleBtn = toggleBtn;
    toggleBtn.addClass("active");
    const pendingStatusFilters = new Set(this.statusFilters);
    const pendingTagFilters = new Set(this.tagFilters);
    let pendingFilterLogic: "AND" | "OR" = this.filterLogic;
    const currentBypassAll = this.settings.filters?.bypassAll ?? false;
    let pendingBypassAll = currentBypassAll;
    const currentHighlightsEnabled = this.settings.highlights?.enabled ?? false;
    let pendingHighlightsEnabled = currentHighlightsEnabled;
    const currentStatusBarVisible =
      this.settings.display.showFilterStatusBar ?? true;
    let pendingStatusBarVisible = currentStatusBarVisible;
    const removeTagSubmenus = () => {
      menuPortal
        .querySelectorAll(".rss-dashboard-tag-submenu")
        .forEach((el) => el.remove());
    };

    // Logic Toggles: And / Or
    const logicToggles = menuPortal.createDiv({
      cls: "rss-dashboard-filter-logic-toggles",
    });

    const andBtn = logicToggles.createEl("button", {
      cls:
        "rss-dashboard-filter-logic-btn" +
        (pendingFilterLogic === "AND" ? " active" : ""),
      text: "And",
    });
    const orBtn = logicToggles.createEl("button", {
      cls:
        "rss-dashboard-filter-logic-btn" +
        (pendingFilterLogic === "OR" ? " active" : ""),
      text: "Or",
    });

    andBtn.addEventListener("click", () => {
      pendingFilterLogic = "AND";
      andBtn.addClass("active");
      orBtn.removeClass("active");
    });

    orBtn.addEventListener("click", () => {
      pendingFilterLogic = "OR";
      orBtn.addClass("active");
      andBtn.removeClass("active");
    });

    menuPortal.createDiv({ cls: "rss-dashboard-filter-menu-separator" });

    const filterOptions = [
      { id: "unread", name: "Unread", icon: "circle" },
      { id: "read", name: "Read", icon: "check-circle" },
      { id: "saved", name: "Saved", icon: "save" },
      { id: "starred", name: "Starred", icon: "star" },
      { id: "podcasts", name: "Podcast", icon: "mic" },
      { id: "videos", name: "Videos", icon: "play" },
      { id: "tagged", name: "Tagged", icon: "tag" },
    ];

    filterOptions.forEach((opt) => {
      const item = menuPortal.createDiv({
        cls: "rss-dashboard-filter-menu-item",
      });

      const checkbox = item.createEl("input", {
        attr: { type: "checkbox" },
        cls: "rss-dashboard-filter-checkbox",
      });
      checkbox.checked = this.statusFilters.has(opt.id);

      const iconDiv = item.createDiv({
        cls: "rss-dashboard-filter-menu-icon",
      });
      setIcon(iconDiv, opt.icon);

      item.createDiv({
        cls: "rss-dashboard-filter-menu-text",
        text: opt.name,
      });

      if (opt.id === "tagged") {
        const arrow = item.createDiv({
          cls: "rss-dashboard-filter-menu-arrow",
        });
        setIcon(arrow, "chevron-right");

        // Submenu logic
        item.addEventListener("mouseenter", () => {
          this.showTagsSubMenu(item, menuPortal, pendingTagFilters);
        });
      } else {
        item.addEventListener("mouseenter", () => {
          removeTagSubmenus();
        });
      }

      checkbox.addEventListener("change", (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          pendingStatusFilters.add(opt.id);
        } else {
          pendingStatusFilters.delete(opt.id);
        }
      });

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            pendingStatusFilters.add(opt.id);
          } else {
            pendingStatusFilters.delete(opt.id);
          }
        }
      });
    });

    // Add separator after filter options
    const postFilterSeparator = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-separator",
    });
    postFilterSeparator.addEventListener("mouseenter", removeTagSubmenus);

    const statusBarItem = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-status-bar-toggle",
    });
    const statusBarCheckbox = statusBarItem.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    statusBarCheckbox.checked = pendingStatusBarVisible;
    const statusBarIconDiv = statusBarItem.createDiv({
      cls: "rss-dashboard-filter-menu-icon",
    });
    setIcon(statusBarIconDiv, "info");
    statusBarItem.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "Show Status Bar",
    });
    statusBarCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      pendingStatusBarVisible = statusBarCheckbox.checked;
    });
    statusBarItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== statusBarCheckbox) {
        statusBarCheckbox.checked = !statusBarCheckbox.checked;
        pendingStatusBarVisible = statusBarCheckbox.checked;
      }
    });
    statusBarItem.addEventListener("mouseenter", removeTagSubmenus);

    const postStatusBarSeparator = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-separator",
    });
    postStatusBarSeparator.addEventListener("mouseenter", removeTagSubmenus);

    const bypassItem = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-bypass-filters-toggle",
    });
    const bypassCheckbox = bypassItem.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    bypassCheckbox.checked = pendingBypassAll;
    const bypassIconDiv = bypassItem.createDiv({
      cls: "rss-dashboard-filter-menu-icon",
    });
    setIcon(bypassIconDiv, "power");
    bypassItem.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "Bypass All Filters",
    });
    bypassCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      pendingBypassAll = bypassCheckbox.checked;
    });
    bypassItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== bypassCheckbox) {
        bypassCheckbox.checked = !bypassCheckbox.checked;
        pendingBypassAll = bypassCheckbox.checked;
      }
    });
    bypassItem.addEventListener("mouseenter", removeTagSubmenus);

    const postBypassSeparator = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-separator",
    });
    postBypassSeparator.addEventListener("mouseenter", removeTagSubmenus);

    // Add "Show Highlights" toggle
    const highlightsItem = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-highlights-toggle",
    });

    const highlightsCheckbox = highlightsItem.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    highlightsCheckbox.checked = pendingHighlightsEnabled;

    const highlightsIconDiv = highlightsItem.createDiv({
      cls: "rss-dashboard-filter-menu-icon",
    });
    setIcon(highlightsIconDiv, "highlighter");

    highlightsItem.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "Show Highlights",
    });

    highlightsCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      pendingHighlightsEnabled = highlightsCheckbox.checked;
    });

    highlightsItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== highlightsCheckbox) {
        highlightsCheckbox.checked = !highlightsCheckbox.checked;
        pendingHighlightsEnabled = highlightsCheckbox.checked;
      }
    });
    highlightsItem.addEventListener("mouseenter", removeTagSubmenus);

    const preApplySeparator = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-separator",
    });
    preApplySeparator.addEventListener("mouseenter", removeTagSubmenus);

    const applyBtn = menuPortal.createEl("button", {
      cls: "rss-dashboard-filter-apply-btn",
      text: "Apply",
    });
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      if (pendingFilterLogic !== this.filterLogic) {
        this.callbacks.onFilterChange({
          type: "logic",
          value: null,
          logic: pendingFilterLogic,
        });
      }

      const statusKeys = new Set([
        ...Array.from(this.statusFilters),
        ...Array.from(pendingStatusFilters),
      ]);
      statusKeys.forEach((id) => {
        const wasChecked = this.statusFilters.has(id);
        const isChecked = pendingStatusFilters.has(id);
        if (wasChecked !== isChecked) {
          this.callbacks.onFilterChange({
            type: id,
            value: null,
            checked: isChecked,
          });
        }
      });

      const tagKeys = new Set([
        ...Array.from(this.tagFilters),
        ...Array.from(pendingTagFilters),
      ]);
      tagKeys.forEach((tagName) => {
        const wasChecked = this.tagFilters.has(tagName);
        const isChecked = pendingTagFilters.has(tagName);
        if (wasChecked !== isChecked) {
          this.callbacks.onFilterChange({
            type: tagName,
            value: null,
            checked: isChecked,
            isTag: true,
          });
        }
      });

      if (pendingBypassAll !== currentBypassAll) {
        void this.callbacks.onFilterChange({
          type: "bypass-filters",
          value: pendingBypassAll,
          checked: pendingBypassAll,
        });
      }

      if (pendingHighlightsEnabled !== currentHighlightsEnabled) {
        if (!this.settings.highlights) {
          this.settings.highlights = {
            enabled: false,
            defaultColor: "#ffd700",
            caseSensitive: false,
            highlightInContent: true,
            highlightInTitles: true,
            highlightInSummaries: true,
            words: [],
          };
        }
        this.settings.highlights.enabled = pendingHighlightsEnabled;
        void this.callbacks.onFilterChange({
          type: "highlights",
          value: pendingHighlightsEnabled,
          checked: pendingHighlightsEnabled,
        });
      }

      if (pendingStatusBarVisible !== currentStatusBarVisible) {
        void this.callbacks.onFilterChange({
          type: "status-bar-visibility",
          value: pendingStatusBarVisible,
          checked: pendingStatusBarVisible,
        });
      }

      this.closeActiveFilterMenu();
    });

    // Position the menu
    const rect = toggleBtn.getBoundingClientRect();
    menuPortal.style.top = `${rect.bottom + 5}px`;
    menuPortal.style.left = `${rect.left}px`;
    targetWindow.requestAnimationFrame(() => {
      const menuRect = menuPortal.getBoundingClientRect();
      const margin = 8;
      const maxLeft = targetWindow.innerWidth - menuRect.width - margin;
      const nextLeft = Math.max(margin, Math.min(rect.left, maxLeft));
      menuPortal.style.left = `${nextLeft}px`;
    });

    // Close menu on click outside
    targetWindow.setTimeout(() => {
      if (this.activePortal !== menuPortal) {
        return;
      }

      const handleClickOutside = (e: Event) => {
        if (this.activePortal !== menuPortal) {
          return;
        }

        if (
          !menuPortal.contains(e.target as Node) &&
          !toggleBtn.contains(e.target as Node)
        ) {
          this.closeActiveFilterMenu();
        }
      };

      this.activeFilterOutsideListenerCleanup = this.addDocumentListener(
        targetDocument,
        "mousedown",
        handleClickOutside,
      );
    }, 0);
  }

  private showTagsSubMenu(
    parentItem: HTMLElement,
    parentMenu: HTMLElement,
    pendingTagFilters: Set<string>,
  ): void {
    // Remove existing submenus
    parentMenu
      .querySelectorAll(".rss-dashboard-tag-submenu")
      .forEach((el) => el.remove());

    const subMenu = parentMenu.createDiv({
      cls: "rss-dashboard-filter-menu rss-dashboard-tag-submenu",
    });

    if (this.settings.availableTags.length === 0) {
      subMenu.createDiv({
        cls: "rss-dashboard-filter-menu-item empty",
        text: "No tags available",
      });
    }

    this.settings.availableTags.forEach((tag) => {
      const item = subMenu.createDiv({
        cls: "rss-dashboard-filter-menu-item",
      });

      const checkbox = item.createEl("input", {
        attr: { type: "checkbox" },
        cls: "rss-dashboard-filter-checkbox",
      });
      checkbox.checked = pendingTagFilters.has(tag.name);

      const colorDot = item.createDiv({
        cls: "rss-dashboard-tag-color-dot",
      });
      colorDot.style.setProperty("--tag-color", tag.color);

      item.createDiv({
        cls: "rss-dashboard-filter-menu-text",
        text: tag.name,
      });

      checkbox.addEventListener("change", (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          pendingTagFilters.add(tag.name);
        } else {
          pendingTagFilters.delete(tag.name);
        }
      });

      item.addEventListener("click", (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            pendingTagFilters.add(tag.name);
          } else {
            pendingTagFilters.delete(tag.name);
          }
        }
      });
    });

    // Position the submenu using fixed viewport coordinates
    const rect = parentItem.getBoundingClientRect();
    const parentMenuRect = parentMenu.getBoundingClientRect();

    // Start: position fixed, to the right of the parent menu
    let subLeft = parentMenuRect.right + 4;
    let subTop = rect.top;

    subMenu.addClass("rss-dashboard-submenu-fixed");
    subMenu.style.setProperty("--submenu-top", `${subTop}px`);
    subMenu.style.setProperty("--submenu-left", `${subLeft}px`);

    // After the browser renders it, flip left if it goes off-screen
    requestAnimationFrame(() => {
      const subRect = subMenu.getBoundingClientRect();
      if (subRect.right > window.innerWidth) {
        subMenu.style.setProperty(
          "--submenu-left",
          `${parentMenuRect.left - subRect.width - 4}px`,
        );
      }
      if (subRect.bottom > window.innerHeight) {
        subMenu.style.setProperty(
          "--submenu-top",
          `${window.innerHeight - subRect.height - 8}px`,
        );
      }
    });
  }

  private renderArticles(): void {
    const articlesList = this.container.createDiv({
      cls: `rss-dashboard-articles-list rss-dashboard-${this.settings.viewStyle}-view`,
    });
    if (this.settings.viewStyle === "card") {
      const cardColumns = this.getCardColumnsPerRow();
      if (cardColumns > 0) {
        articlesList.style.setProperty(
          "grid-template-columns",
          `repeat(${cardColumns}, minmax(0, 1fr))`,
        );
      } else {
        articlesList.style.removeProperty("grid-template-columns");
      }
    }
    const showToolbar = this.shouldShowToolbarForView(this.settings.viewStyle);
    articlesList.toggleClass(
      "rss-dashboard-mobile-toolbar-hidden",
      !showToolbar,
    );

    if (
      this.settings.viewStyle === "list" &&
      this.isMobileViewport() &&
      showToolbar
    ) {
      articlesList.addClass(
        `rss-dashboard-mobile-list-style-${this.getMobileListToolbarStyle()}`,
      );
    }

    if (this.articles.length === 0) {
      const emptyState = articlesList.createDiv({
        cls: "rss-dashboard-empty-state",
      });
      const iconDiv = emptyState.createDiv();
      setIcon(iconDiv, "rss");
      iconDiv.addClass("rss-dashboard-empty-state-icon");
      new Setting(emptyState).setName("No articles found").setHeading();
      emptyState.createEl("p", {
        text: "Try refreshing your feeds or adding new ones.",
      });
      return;
    }

    const prevScroll = this.container.scrollTop;

    if (this.settings.articleGroupBy === "none") {
      if (this.settings.viewStyle === "list") {
        this.renderListView(articlesList, this.articles);
      } else {
        this.renderCardView(articlesList, this.articles);
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
        } else {
          this.renderCardView(groupContainer, groupArticles);
        }
      }
    }

    const paginationWrapper = this.container.createDiv({
      cls: "rss-dashboard-pagination-wrapper",
    });
    this.renderPagination(
      paginationWrapper,
      this.currentPage,
      this.totalPages,
      this.pageSize,
      this.totalArticles,
    );

    if (this.container) this.container.scrollTop = prevScroll;
  }

  private groupArticles(
    articles: FeedItem[],
    groupBy: "feed" | "date" | "folder" | "none",
  ): Record<string, FeedItem[]> {
    if (groupBy === "none") return { "All articles": articles };

    return articles.reduce(
      (acc, article) => {
        let key: string;
        switch (groupBy) {
          case "feed":
            key = article.feedTitle || "Uncategorized";
            break;
          case "date":
            key = formatDateWithRelative(article.pubDate).text;
            break;

          case "folder":
            key = this.getFeedFolder(article.feedUrl) || "Uncategorized";
            break;
          default:
            key = "All articles";
        }

        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(article);
        return acc;
      },
      {} as Record<string, FeedItem[]>,
    );
  }

  private getFeedFolder(feedUrl: string): string | undefined {
    const feed = this.settings.feeds.find((f) => f.url === feedUrl);
    return feed?.folder;
  }

  private renderFeedIcon(
    container: HTMLElement,
    feedUrl: string,
    mediaType?: "article" | "video" | "podcast",
  ): void {
    const iconContainer = container.createDiv({
      cls: "rss-dashboard-article-feed-icon",
    });

    if (mediaType === "video") {
      setIcon(iconContainer, "play");
      iconContainer.addClass("video");
    } else if (mediaType === "podcast") {
      setIcon(iconContainer, "mic");
      iconContainer.addClass("podcast");
    } else if (this.settings.display.useDomainFavicons) {
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

    if (mediaType === "video") {
      setIcon(container, "play");
      container.addClass("video");
    } else if (mediaType === "podcast") {
      setIcon(container, "mic");
      container.addClass("podcast");
    } else if (this.settings.display.useDomainFavicons) {
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
      cls: `rss-dashboard-read-toggle ${article.read ? "read" : "unread"}`,
      attr: {
        title: article.read ? "Mark as unread" : "Mark as read",
      },
    });
    setIcon(readToggle, article.read ? "check-circle" : "circle");
    readToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const newReadState = !article.read;
      article.read = newReadState;
      this.callbacks.onArticleUpdate(article, { read: newReadState }, false);
      readToggle.classList.toggle("read", newReadState);
      readToggle.classList.toggle("unread", !newReadState);
      setIcon(readToggle, newReadState ? "check-circle" : "circle");
    });
  }

  private createSaveButton(
    actionToolbar: HTMLElement,
    article: FeedItem,
  ): void {
    const saveButton = actionToolbar.createDiv({
      cls: `rss-dashboard-save-toggle ${article.saved ? "saved" : ""}`,
      attr: {
        title: article.saved
          ? "Click to open saved article"
          : this.settings.articleSaving.saveFullContent
            ? "Save full article content to notes"
            : "Save article summary to notes",
      },
    });
    setIcon(saveButton, "save");
    if (!saveButton.querySelector("svg")) {
      saveButton.textContent = "S";
    }
    saveButton.addEventListener("click", (e) => {
      e.stopPropagation();
      if (article.saved) {
        if (this.callbacks.onOpenSavedArticle) {
          this.callbacks.onOpenSavedArticle(article);
        } else {
          new Notice("Article already saved. Look in your notes.");
        }
      } else if (this.callbacks.onArticleSave) {
        if (saveButton.classList.contains("saving")) {
          return;
        }
        saveButton.classList.add("saving");
        saveButton.setAttribute("title", "Saving article...");
        this.callbacks.onArticleSave(article);
        article.saved = true;
        saveButton.classList.add("saved");
        setIcon(saveButton, "save");
        if (!saveButton.querySelector("svg")) {
          saveButton.textContent = "S";
        }
        saveButton.classList.remove("saving");
        saveButton.setAttribute("title", "Click to open saved article");
      }
    });
  }

  private createStarToggle(
    actionToolbar: HTMLElement,
    article: FeedItem,
  ): void {
    const starToggle = actionToolbar.createDiv({
      cls: `rss-dashboard-star-toggle ${article.starred ? "starred" : "unstarred"}`,
      attr: {
        title: article.starred
          ? "Remove from starred items"
          : "Add to starred items",
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
    starToggle.addEventListener("click", (e) => {
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
      cls: "rss-dashboard-tags-toggle",
      attr: { title: "Manage tags" },
    });
    setIcon(tagsToggle, "tag");
    tagsToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      this.createPortalDropdown(tagsToggle, article, (tag, checked) => {
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

        this.callbacks.onArticleUpdate(
          article,
          { tags: [...article.tags] },
          false,
        );

        let articleEl = this.container.querySelector(
          `[id="article-${article.guid}"]`,
        ) as HTMLElement;
        if (!articleEl) {
          articleEl = this.container
            .closest(".rss-dashboard-container")
            ?.querySelector(`[id="article-${article.guid}"]`) as HTMLElement;
        }
        if (!articleEl) {
          articleEl = document.getElementById(
            `article-${article.guid}`,
          ) as HTMLElement;
        }
        if (articleEl) {
          articleEl.classList.add("rss-dashboard-tag-change-feedback");
          window.setTimeout(() => {
            articleEl.classList.remove("rss-dashboard-tag-change-feedback");
          }, 200);
          this.syncArticleTags(articleEl, article);
          void articleEl.offsetHeight;
        } else {
          const tempIndicator = document.body.createDiv({
            cls: "rss-dashboard-tag-change-notification",
            text: `Tag "${tag.name}" ${checked ? "added" : "removed"}`,
          });
          window.setTimeout(() => {
            if (tempIndicator.parentNode) {
              tempIndicator.parentNode.removeChild(tempIndicator);
            }
          }, 1500);
        }
      });
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
      const isMobileList = this.isMobileViewport();
      const showListToolbar = this.shouldShowToolbarForView("list");
      const listToolbarStyle = this.getMobileListToolbarStyle();
      const useBottomRow =
        isMobileList && showListToolbar && listToolbarStyle === "bottom-row";
      const useMinimal =
        isMobileList && showListToolbar && listToolbarStyle === "minimal";
      if (useBottomRow) {
        articleEl.addClass("rss-dashboard-list-item-bottom-row");
      }
      const contentEl = articleEl.createDiv("rss-dashboard-article-content");
      const mainGrid = contentEl.createDiv("rss-dashboard-article-grid");
      const headlineEl = mainGrid.createDiv("rss-dashboard-grid-headline");
      const titleEl = headlineEl.createDiv({
        cls: "rss-dashboard-article-title rss-dashboard-list-title",
      });
      if (
        this.settings.highlights?.enabled &&
        this.settings.highlights.highlightInTitles
      ) {
        const highlightService = new HighlightService(this.settings.highlights);
        highlightService.setHighlightedText(titleEl, article.title);
      } else {
        titleEl.textContent = article.title;
      }
      const dateInfo = formatDateWithRelative(article.pubDate);
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
            "rss-dashboard-article-tags",
          );
          article.tags.forEach((tag) => {
            const tagEl = articleTags.createDiv({
              cls: "rss-dashboard-article-tag",
              text: tag.name,
            });
            tagEl.style.setProperty("--tag-color", tag.color);
          });
        }
      } else {
        actionsEl.addClass("rss-dashboard-grid-actions-empty");
      }
      if (this.showFeedSource) {
        const sourceEl = mainGrid.createDiv("rss-dashboard-grid-source");
        const metaEl = sourceEl.createDiv("rss-dashboard-article-meta");
        this.renderFeedIcon(metaEl, article.feedUrl, article.mediaType);
        metaEl
          .createSpan("rss-dashboard-article-source")
          .setText(article.feedTitle);
      }
      if (showListToolbar && useBottomRow) {
        if (article.tags && article.tags.length > 0) {
          const bodyTags = contentEl.createDiv(
            "rss-dashboard-article-tags rss-dashboard-list-body-tags",
          );
          const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
          tagsToShow.forEach((tag) => {
            const tagEl = bodyTags.createDiv({
              cls: "rss-dashboard-article-tag",
              text: tag.name,
            });
            tagEl.style.setProperty("--tag-color", tag.color);
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
      const card = container.createDiv({
        cls:
          "rss-dashboard-article-card" +
          (this.selectedArticle && article.guid === this.selectedArticle.guid
            ? " active"
            : "") +
          (article.read ? " read" : " unread") +
          (article.saved ? " saved" : "") +
          (article.mediaType === "video"
            ? " rss-dashboard-youtube-article"
            : "") +
          (article.mediaType === "podcast"
            ? " rss-dashboard-podcast-article"
            : ""),
        attr: { id: `article-${article.guid}` },
      });

      const cardContent = card.createDiv({
        cls: "rss-dashboard-card-content",
      });

      const cardTitleEl = cardContent.createDiv({
        cls: "rss-dashboard-article-title",
      });

      if (
        this.settings.highlights?.enabled &&
        this.settings.highlights.highlightInTitles
      ) {
        const highlightService = new HighlightService(this.settings.highlights);
        highlightService.setHighlightedText(cardTitleEl, article.title);
      } else {
        cardTitleEl.textContent = article.title;
      }

      if (this.showFeedSource) {
        const articleMeta = cardContent.createDiv({
          cls: "rss-dashboard-article-meta",
        });

        const feedContainer = articleMeta.createDiv({
          cls: "rss-dashboard-article-feed-container",
        });

        this.renderFeedIcon(feedContainer, article.feedUrl, article.mediaType);
        feedContainer.createDiv({
          cls: "rss-dashboard-article-feed",
          text: article.feedTitle,
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

      if (coverImgSrc) {
        const coverContainer = cardContent.createDiv({
          cls:
            "rss-dashboard-cover-container" +
            (article.summary ? " has-summary" : ""),
        });
        const coverImg = coverContainer.createEl("img", {
          cls: "rss-dashboard-cover-image",
          attr: {
            src: coverImgSrc,
            alt: article.title,
          },
        });
        coverImg.onerror = () => {
          coverContainer.remove();
        };

        if (article.summary) {
          const summaryOverlay = coverContainer.createDiv({
            cls: "rss-dashboard-summary-overlay",
          });
          if (
            this.settings.highlights?.enabled &&
            this.settings.highlights.highlightInSummaries
          ) {
            const highlightService = new HighlightService(
              this.settings.highlights,
            );
            highlightService.setHighlightedText(
              summaryOverlay,
              article.summary,
            );
          } else {
            summaryOverlay.textContent = article.summary;
          }
        }
      } else if (article.summary) {
        const summaryOnlyContainer = cardContent.createDiv({
          cls: "rss-dashboard-cover-summary-only",
        });
        if (
          this.settings.highlights?.enabled &&
          this.settings.highlights.highlightInSummaries
        ) {
          const highlightService = new HighlightService(
            this.settings.highlights,
          );
          highlightService.setHighlightedText(
            summaryOnlyContainer,
            article.summary,
          );
        } else {
          summaryOnlyContainer.textContent = article.summary;
        }
      }

      if (article.tags && article.tags.length > 0) {
        const tagsContainer = cardContent.createDiv({
          cls: "rss-dashboard-article-tags",
        });
        const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
        tagsToShow.forEach((tag) => {
          const tagEl = tagsContainer.createDiv({
            cls: "rss-dashboard-article-tag",
            text: tag.name,
          });
          tagEl.style.setProperty("--tag-color", tag.color);
        });
        if (article.tags.length > MAX_VISIBLE_TAGS) {
          const overflowTag = tagsContainer.createDiv({
            cls: "rss-dashboard-tag-overflow",
            text: `+${article.tags.length - MAX_VISIBLE_TAGS}`,
          });
          overflowTag.title = article.tags
            .slice(MAX_VISIBLE_TAGS)
            .map((t) => t.name)
            .join(", ");
        }
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
        const dateInfo = formatDateWithRelative(article.pubDate);
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
    }
  }
  private renderPagination(
    container: HTMLElement,
    currentPage: number,
    totalPages: number,
    pageSize: number,
    totalArticles: number,
  ): void {
    const paginationContainer = container.createDiv({
      cls: "rss-dashboard-pagination",
    });

    const prevButton = paginationContainer.createEl("button", {
      cls: "rss-dashboard-pagination-btn prev",
      text: "<",
    });
    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => this.callbacks.onPageChange(currentPage - 1);

    const maxPagesToShow = 7;
    let startPage = Math.max(1, currentPage - 3);
    let endPage = Math.min(totalPages, currentPage + 3);
    if (endPage - startPage < maxPagesToShow - 1) {
      if (startPage === 1) {
        endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
      } else if (endPage === totalPages) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
      }
    }
    if (startPage > 1) {
      this.createPageButton(paginationContainer, 1, currentPage);
      if (startPage > 2) {
        paginationContainer.createEl("span", {
          text: "...",
          cls: "rss-dashboard-pagination-ellipsis",
        });
      }
    }
    for (let i = startPage; i <= endPage; i++) {
      this.createPageButton(paginationContainer, i, currentPage);
    }
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationContainer.createEl("span", {
          text: "...",
          cls: "rss-dashboard-pagination-ellipsis",
        });
      }
      this.createPageButton(paginationContainer, totalPages, currentPage);
    }

    const nextButton = paginationContainer.createEl("button", {
      cls: "rss-dashboard-pagination-btn next",
      text: ">",
    });
    nextButton.disabled = currentPage === totalPages;
    nextButton.onclick = () => this.callbacks.onPageChange(currentPage + 1);

    const pageSizeDropdown = paginationContainer.createEl("select", {
      cls: "rss-dashboard-page-size-dropdown",
    });
    const pageSizeOptions = [10, 20, 40, 50, 60, 80, 100];
    for (const size of pageSizeOptions) {
      const opt = pageSizeDropdown.createEl("option", {
        text: String(size),
        value: String(size),
      });
      if (size === pageSize) opt.selected = true;
    }
    pageSizeDropdown.onchange = (e) => {
      const size = Number((e.target as HTMLSelectElement).value);
      this.callbacks.onPageSizeChange(size);
    };

    const startIdx = (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(currentPage * pageSize, totalArticles);
    paginationContainer.createEl("span", {
      cls: "rss-dashboard-pagination-results",
      text: `Results: ${startIdx} - ${endIdx} of ${totalArticles}`,
    });
  }

  private createPageButton(
    container: HTMLElement,
    page: number,
    currentPage: number,
  ) {
    const btn = container.createEl("button", {
      cls:
        "rss-dashboard-pagination-btn" +
        (page === currentPage ? " active" : ""),
      text: String(page),
    });
    btn.disabled = page === currentPage;
    btn.onclick = () => this.callbacks.onPageChange(page);
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
              this.callbacks.onOpenSavedArticle(article);
            }
          });
      });

      menu.addItem((item: MenuItem) => {
        item
          .setTitle("Open in reader view")
          .setIcon("book-open")
          .onClick(() => {
            if (this.callbacks.onOpenInReaderView) {
              this.callbacks.onOpenInReaderView(article);
            }
          });
      });

      menu.addSeparator();
    }

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Open in browser")
        .setIcon("globe-2")
        .onClick(() => {
          window.open(article.link, "_blank");
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
            this.callbacks.onArticleSave(article);
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

    const targetDocument = toggleElement.ownerDocument;
    const targetBody = targetDocument.body;
    const targetWindow = targetDocument.defaultView || window;
    const isMobile = targetWindow.matchMedia("(max-width: 768px)").matches;

    targetDocument
      .querySelectorAll(
        ".rss-dashboard-tags-dropdown-content-portal, .rss-dashboard-tags-sheet-backdrop",
      )
      .forEach((el) => {
        (el as HTMLElement).parentNode?.removeChild(el);
      });

    const sheetBackdrop = isMobile
      ? targetBody.createDiv({
          cls: "rss-dashboard-tags-sheet-backdrop",
        })
      : null;

    const portalDropdown = targetBody.createDiv({
      cls: "rss-dashboard-tags-dropdown-content rss-dashboard-tags-dropdown-content-portal",
    });
    if (isMobile) {
      portalDropdown.addClass("rss-dashboard-tags-mobile-sheet");
      const sheetHeader = portalDropdown.createDiv({
        cls: "rss-dashboard-tags-sheet-header",
      });
      sheetHeader.createDiv({
        cls: "rss-dashboard-tags-sheet-title",
        text: "Manage tags",
      });
      const sheetActions = sheetHeader.createDiv({
        cls: "rss-dashboard-tags-sheet-actions",
      });
      const addTagBtn = sheetActions.createEl("button", {
        cls: "rss-dashboard-tags-sheet-btn",
        text: "Add tag",
      });
      setIcon(addTagBtn, "plus");
      addTagBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.tagsDropdownCleanup) {
          this.tagsDropdownCleanup();
        }
        const result = this.callbacks.onOpenTagsSettings?.();
        if (result instanceof Promise) {
          void result;
        }
      });
      const doneBtn = sheetActions.createEl("button", {
        cls: "rss-dashboard-tags-sheet-btn rss-dashboard-tags-sheet-btn-done",
        text: "Done",
      });
      doneBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.tagsDropdownCleanup) {
          this.tagsDropdownCleanup();
        }
      });
    }
    const tagsListContainer = portalDropdown.createDiv({
      cls: "rss-dashboard-tag-list",
    });
    const tagSeparator = portalDropdown.createDiv({
      cls: "rss-dashboard-tag-item-separator",
    });

    const updateTagSeparatorVisibility = () => {
      const hasTags = this.settings.availableTags.length > 0;
      tagSeparator.style.display = hasTags ? "" : "none";
    };

    const deleteTagFromProfile = (tag: Tag) => {
      const tagIndex = this.settings.availableTags.findIndex(
        (t) => t.name === tag.name,
      );
      if (tagIndex === -1) {
        return;
      }

      this.settings.availableTags.splice(tagIndex, 1);
      this.settings.feeds.forEach((feed) => {
        feed.items.forEach((item) => {
          if (item.tags) {
            item.tags = item.tags.filter((t) => t.name !== tag.name);
          }
        });
      });

      if (article.tags?.some((t) => t.name === tag.name)) {
        onTagChange(tag, false);
      }

      this.persistSettings();
      new Notice(`Tag "${tag.name}" deleted successfully!`);
      updateTagSeparatorVisibility();
    };

    const appendTagItem = (tag: Tag, checkedOverride?: boolean) => {
      const tagItem = tagsListContainer.createDiv({
        cls: "rss-dashboard-tag-item",
      });
      const hasTag =
        checkedOverride ??
        (article.tags?.some((t) => t.name === tag.name) || false);

      const tagCheckbox = tagItem.createEl("input", {
        attr: { type: "checkbox" },
        cls: "rss-dashboard-tag-checkbox",
      });
      tagCheckbox.checked = hasTag;

      const tagLabel = tagItem.createDiv({
        cls: "rss-dashboard-tag-label",
        text: tag.name,
      });
      tagLabel.style.setProperty("--tag-color", tag.color);
      const deleteButton = tagItem.createEl("button", {
        cls: "rss-dashboard-tag-delete-button",
        attr: { title: `Delete "${tag.name}" tag`, "aria-label": "Delete tag" },
      });
      setIcon(deleteButton, "trash");

      tagCheckbox.addEventListener("change", (e) => {
        e.stopPropagation();
        const isChecked = (e.target as HTMLInputElement).checked;

        tagCheckbox.checked = isChecked;

        tagItem.classList.add("rss-dashboard-tag-item-processing");

        onTagChange(tag, isChecked);

        window.setTimeout(() => {
          tagItem.classList.remove("rss-dashboard-tag-item-processing");
        }, 200);
      });

      deleteButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteTagFromProfile(tag);
        tagItem.remove();
      });

      tagItem.appendChild(tagCheckbox);
      tagItem.appendChild(tagLabel);
      tagItem.appendChild(deleteButton);
    };

    for (const tag of this.settings.availableTags) {
      appendTagItem(tag);
    }
    updateTagSeparatorVisibility();

    if (!isMobile) {
      const inlineAddRow = portalDropdown.createDiv({
        cls: "rss-dashboard-tag-inline-add-row",
      });

      const colorInput = inlineAddRow.createEl("input", {
        attr: {
          type: "color",
          value: "#3498db",
        },
        cls: "rss-dashboard-tag-inline-color",
      });

      const nameInput = inlineAddRow.createEl("input", {
        attr: {
          type: "text",
          placeholder: "Add new tag...",
          autocomplete: "off",
        },
        cls: "rss-dashboard-tag-inline-input",
      });
      nameInput.spellcheck = false;

      const addButton = inlineAddRow.createEl("button", {
        cls: "rss-dashboard-tag-inline-button",
        attr: { title: "Add tag" },
      });
      setIcon(addButton, "plus");

      const submitInlineTag = () => {
        const tagName = nameInput.value.trim();
        const tagColor = colorInput.value;

        if (!tagName) {
          new Notice("Please enter a tag name!");
          return;
        }

        if (
          this.settings.availableTags.some(
            (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
          )
        ) {
          new Notice("A tag with this name already exists!");
          return;
        }

        const newTag: Tag = {
          name: tagName,
          color: tagColor,
        };

        this.settings.availableTags.push(newTag);
        this.persistSettings();
        onTagChange(newTag, true);
        appendTagItem(newTag, true);

        nameInput.value = "";
        requestAnimationFrame(() => nameInput.focus());
        new Notice(`Tag "${tagName}" added`);
      };

      addButton.addEventListener("click", (e) => {
        e.stopPropagation();
        submitInlineTag();
      });

      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          submitInlineTag();
        }
      });
    } // end !isMobile

    targetBody.appendChild(portalDropdown);
    portalDropdown.addClass("rss-dashboard-tags-dropdown-content-portal");

    let removeDesktopListener: (() => void) | null = null;
    let removeViewportListener: (() => void) | null = null;
    let isClosed = false;

    const closeDropdown = () => {
      if (isClosed) {
        return;
      }
      isClosed = true;
      portalDropdown.remove();
      sheetBackdrop?.remove();
      removeDesktopListener?.();
      removeDesktopListener = null;
      removeViewportListener?.();
      removeViewportListener = null;
      if (this.tagsDropdownCleanup === closeDropdown) {
        this.tagsDropdownCleanup = null;
      }
    };
    this.tagsDropdownCleanup = closeDropdown;

    if (isMobile) {
      const syncMobileViewportHeight = () => {
        const vvp = targetWindow.visualViewport;
        const viewportHeight = vvp?.height ?? targetWindow.innerHeight;
        portalDropdown.style.setProperty(
          "max-height",
          `${viewportHeight - 16}px`,
          "important",
        );
      };
      syncMobileViewportHeight();

      const visualViewport = targetWindow.visualViewport;
      if (visualViewport) {
        visualViewport.addEventListener("resize", syncMobileViewportHeight);
        visualViewport.addEventListener("scroll", syncMobileViewportHeight);
        removeViewportListener = () => {
          visualViewport.removeEventListener(
            "resize",
            syncMobileViewportHeight,
          );
          visualViewport.removeEventListener(
            "scroll",
            syncMobileViewportHeight,
          );
        };
      } else {
        targetWindow.addEventListener("resize", syncMobileViewportHeight);
        removeViewportListener = () => {
          targetWindow.removeEventListener("resize", syncMobileViewportHeight);
        };
      }

      if (sheetBackdrop) {
        sheetBackdrop.addEventListener("click", () => {
          closeDropdown();
        });
      }

      return;
    }

    const rect = toggleElement.getBoundingClientRect();
    const dropdownRect = portalDropdown.getBoundingClientRect();
    const appContainer =
      this.container.closest(".workspace-leaf-content") || targetBody;
    const appContainerRect = appContainer.getBoundingClientRect();

    let left = rect.right;
    let top = rect.top;

    if (left + dropdownRect.width > appContainerRect.right) {
      left = rect.left - dropdownRect.width;
    }

    if (left < appContainerRect.left) {
      left = appContainerRect.left;
    }

    if (top + dropdownRect.height > targetWindow.innerHeight) {
      top = targetWindow.innerHeight - dropdownRect.height - 5;
    }

    portalDropdown.style.left = `${left}px`;
    portalDropdown.style.top = `${top}px`;

    targetWindow.setTimeout(() => {
      if (isClosed) {
        return;
      }
      const handleClickOutside = (ev: MouseEvent) => {
        if (portalDropdown && !portalDropdown.contains(ev.target as Node)) {
          closeDropdown();
        }
      };
      targetDocument.addEventListener("mousedown", handleClickOutside);
      removeDesktopListener = () => {
        targetDocument.removeEventListener("mousedown", handleClickOutside);
      };
    }, 0);
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
  const htmlWithMeta = ensureUtf8Meta(html);
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlWithMeta, "text/html");
  const img = doc.querySelector("img");
  return img ? img.getAttribute("src") : null;
}
