import { setIcon, setTooltip } from "obsidian";
import { ArticleGroupByOption, RssDashboardSettings } from "../types/types";
import { TABLET_LAYOUT_MAX_WIDTH } from "../utils/platform-utils";
import { ArticleFilterMenu, FilterChangeEvent } from "./article-filter-menu";
import { ArticleHeaderMenu } from "./article-header-menu";
import { renderHeaderFeedIcon } from "./article-list/utils/feed-icon";
import { ThemedSelectPopup } from "./themed-select-popup";
interface ArticleHeaderMenuController {
  destroy(): void;
  render(parent: HTMLElement): void;
  setSearchQuery(query: string): void;
  focusSearch(): Promise<boolean>;
}

export interface ArticleHeaderCallbacks {
  onToggleSidebar: () => void;
  onSearch: (query: string) => void;
  onSortChange: (value: "newest" | "oldest") => void;
  onGroupChange: (value: ArticleGroupByOption) => void;
  onFilterChange: (event: FilterChangeEvent) => void;
  onToggleViewStyle: (style: "list" | "card" | "feed") => void;
  onPersistSettings: () => Promise<void> | void;
  onRefreshFeeds: () => Promise<void>;
  onMarkAllAsRead: () => void;
  onMarkAllAsUnread: () => void;
}

/**
 * ArticleHeader Component
 *
 * Extracted from ArticleList.ts to reduce monolith complexity.
 * Manages the dashboard toolbar including:
 * - Sidebar toggle
 * - Current view title/tooltip
 * - Refresh feeds button
 * - Sort and Grouping selectors
 * - Filter menu trigger (multi-filter)
 * - View style selector (List, Card, Feed)
 */
export class ArticleHeader {
  private container: HTMLElement;
  private settings: RssDashboardSettings;
  private title: string;
  private titleTooltip: string | null;
  private currentFeedUrl: string | null;
  private callbacks: ArticleHeaderCallbacks;

  private headerTitleEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private articleSearchQuery: string = "";
  private articleSearchDesktopInput: HTMLInputElement | null = null;
  private headerMenu: ArticleHeaderMenuController | null = null;
  private popup = new ThemedSelectPopup({
    addDocumentListener: (target, type, listener) =>
      this.addDocumentListener(target, type, listener),
    persistSettings: () => this.callbacks.onPersistSettings(),
  });
  private documentListeners: Array<{
    target: Document | Window;
    type: string;
    listener: EventListenerOrEventListenerObject;
  }> = [];

  private statusFilters: Set<string>;
  private tagFilters: Set<string>;
  private filterLogic: "AND" | "OR";

  constructor(
    container: HTMLElement,
    settings: RssDashboardSettings,
    title: string,
    titleTooltip: string | null,
    currentFeedUrl: string | null,
    statusFilters: Set<string>,
    tagFilters: Set<string>,
    filterLogic: "AND" | "OR",
    callbacks: ArticleHeaderCallbacks,
  ) {
    this.container = container;
    this.settings = settings;
    this.title = title;
    this.titleTooltip = titleTooltip;
    this.currentFeedUrl = currentFeedUrl;
    this.statusFilters = statusFilters;
    this.tagFilters = tagFilters;
    this.filterLogic = filterLogic;
    this.callbacks = callbacks;
  }

  public updateFilters(
    statusFilters: Set<string>,
    tagFilters: Set<string>,
    filterLogic: "AND" | "OR",
  ): void {
    this.statusFilters = statusFilters;
    this.tagFilters = tagFilters;
    this.filterLogic = filterLogic;
  }

  public updateTitle(title: string, tooltip: string | null): void {
    this.title = title;
    this.titleTooltip = tooltip;
    if (this.headerTitleEl) {
      this.headerTitleEl.textContent = title;
      if (tooltip) {
        setTooltip(this.headerTitleEl, tooltip);
      } else {
        this.headerTitleEl.removeAttribute("aria-label");
      }
    }
  }

  public destroy(): void {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    const headerMenu: ArticleHeaderMenuController | null = this.headerMenu;
    if (headerMenu) {
      (headerMenu as { destroy: () => void }).destroy();
    }
    this.headerMenu = null;
    this.popup.close();
    this.documentListeners.forEach(({ target, type, listener }) =>
      target.removeEventListener(type, listener),
    );
    this.documentListeners = [];
  }

  /**
   * Renders the complete header into the container.
   * Replaces native HTML selects with custom themed triggers to ensure
   * proper Obsidian theme (Dark/Light mode) inheritance.
   */
  public render(): void {
    if (this.headerMenu) {
      this.headerMenu.destroy();
    }
    this.headerMenu = null;
    this.container.empty();
    const articlesHeader = this.container.createDiv({
      cls: "rss-dashboard-articles-header",
    });

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        articlesHeader.classList.toggle(
          "is-narrow",
          width <= TABLET_LAYOUT_MAX_WIDTH,
        );
      }
    });
    this.resizeObserver.observe(articlesHeader);

    const leftSection = articlesHeader.createDiv({
      cls: "rss-dashboard-header-left",
    });
    const sidebarToggle = leftSection.createEl("button", {
      cls: "rss-dashboard-sidebar-toggle clickable-icon",
      attr: { type: "button", "aria-label": "Toggle sidebar" },
    });
    setIcon(sidebarToggle, "sidebar");
    sidebarToggle.addEventListener("click", () =>
      this.callbacks.onToggleSidebar(),
    );

    if (this.currentFeedUrl) {
      const feedIcon = leftSection.createDiv({
        cls: "rss-dashboard-header-feed-icon",
      });
      renderHeaderFeedIcon(feedIcon, this.currentFeedUrl, {
        feeds: this.settings.feeds,
        display: this.settings.display,
      });
    }

    this.headerTitleEl = leftSection.createDiv({
      cls: "rss-dashboard-articles-title",
      text: this.title,
    });
    if (this.titleTooltip) {
      setTooltip(this.headerTitleEl, this.titleTooltip);
    }

    const rightSection = articlesHeader.createDiv({
      cls: "rss-dashboard-header-right",
    });

    const mobileFilterBtn = rightSection.createEl("button", {
      cls: "rss-dashboard-mobile-filter-button rss-dashboard-filter-trigger clickable-icon",
      attr: { type: "button", "aria-label": "Filters" },
    });
    setIcon(
      mobileFilterBtn.createDiv({ cls: "rss-dashboard-mobile-filter-icon" }),
      "filter",
    );
    this.updateFilterBadge(mobileFilterBtn);
    mobileFilterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showFiltersMenu(mobileFilterBtn);
    });

    const existingHeaderMenu: ArticleHeaderMenuController | null =
      this.headerMenu;
    if (existingHeaderMenu) {
      (existingHeaderMenu as { destroy: () => void }).destroy();
    }
    this.headerMenu = new ArticleHeaderMenu(
      this.settings,
      this.articleSearchQuery,
      {
        onSearch: (query) => {
          this.syncSearch(query);
          this.callbacks.onSearch(query);
        },
        onSortChange: (value) => this.callbacks.onSortChange(value),
        onGroupChange: (value) => this.callbacks.onGroupChange(value),
        onFilterChange: (event) => this.callbacks.onFilterChange(event),
        onToggleViewStyle: (style) => this.callbacks.onToggleViewStyle(style),
        onPersistSettings: () => this.callbacks.onPersistSettings(),
        onRefreshFeeds: () => this.callbacks.onRefreshFeeds(),
        onMarkAllAsRead: () => this.callbacks.onMarkAllAsRead(),
        onMarkAllAsUnread: () => this.callbacks.onMarkAllAsUnread(),
      },
    );
    this.headerMenu.render(rightSection);

    const desktopControls = rightSection.createDiv({
      cls: "rss-dashboard-desktop-controls",
    });
    this.createControls(desktopControls, { includeFilter: true });
  }

  private createControls(
    container: HTMLElement,
    options: { includeFilter: boolean },
  ): void {
    const controls = container.createDiv({
      cls: "rss-dashboard-article-controls",
    });

    if (options.includeFilter) {
      const filterBtn = controls.createEl("button", {
        cls: "rss-dashboard-multi-filter-btn rss-dashboard-filter-trigger",
      });
      setIcon(filterBtn.createDiv(), "filter");
      filterBtn.createSpan({ text: "Filter" });
      this.updateFilterBadge(filterBtn);
      filterBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showFiltersMenu(filterBtn);
      });
    }

    const searchContainer = controls.createDiv({
      cls: "rss-dashboard-article-search-container",
    });
    setIcon(
      searchContainer.createDiv({ cls: "rss-dashboard-article-search-icon" }),
      "search",
    );
    const searchInput = searchContainer.createEl("input", {
      cls: "rss-dashboard-article-search-input",
      attr: {
        type: "text",
        placeholder: "Search articles...",
        autocomplete: "off",
        spellcheck: "false",
      },
    });
    searchInput.value = this.articleSearchQuery;
    this.articleSearchDesktopInput = searchInput;

    searchInput.addEventListener("input", (e) => {
      const val = (e.target as HTMLInputElement).value;
      this.syncSearch(val);
      this.callbacks.onSearch(val);
    });

    this.popup.createSelector(
      controls,
      "history",
      "Age:",
      this.getAgeOptions(),
      () => this.getCurrentAgeFilterValue(),
      (val) =>
        this.callbacks.onFilterChange({
          type: Number(val) === 0 ? "none" : "age",
          value: Number(val),
        }),
      "rss-dashboard-filter",
    );

    this.popup.createSelector(
      controls,
      "sort-asc",
      "Sort:",
      { Newest: "newest", Oldest: "oldest" },
      () => this.settings.articleSort,
      (val) => this.callbacks.onSortChange(val as "newest" | "oldest"),
      "rss-dashboard-sort",
    );

    this.popup.createSelector(
      controls,
      "folders",
      "Grouping:",
      {
        None: "none",
        Feed: "feed",
        Date: "date",
        "Date > Feed": "date_feed",
        Folder: "folder",
        "Folder > Feed": "folder_feed",
      },
      () => this.settings.articleGroupBy,
      (val) => this.callbacks.onGroupChange(val as ArticleGroupByOption),
      "rss-dashboard-group",
    );

    const viewStyleRow = controls.createDiv({
      cls: "rss-dashboard-view-style-row",
    });
    this.popup.createViewStyleSelector(
      viewStyleRow,
      () => this.settings.viewStyle,
      (style) => this.callbacks.onToggleViewStyle(style),
    );

    this.createRefreshButton(controls, "");

    const markAllRow = controls.createDiv({
      cls: "rss-dashboard-mark-all-row",
    });
    markAllRow.createSpan({
      text: "Mark all:",
      cls: "rss-dashboard-mark-all-label",
    });
    const markAllBtns = markAllRow.createDiv({
      cls: "rss-dashboard-mark-all-buttons-row",
    });

    const readBtn = markAllBtns.createEl("button", {
      cls: "rss-dashboard-mark-all-button rss-dashboard-mark-read",
    });
    setIcon(readBtn.createDiv(), "check-circle");
    readBtn.createSpan({ text: "Read", cls: "rss-dashboard-mark-all-text" });
    readBtn.onclick = () => this.callbacks.onMarkAllAsRead();

    const unreadBtn = markAllBtns.createEl("button", {
      cls: "rss-dashboard-mark-all-button",
    });
    setIcon(unreadBtn.createDiv(), "circle");
    unreadBtn.createSpan({
      text: "Unread",
      cls: "rss-dashboard-mark-all-text",
    });
    unreadBtn.onclick = () => this.callbacks.onMarkAllAsUnread();
  }

  /**
   * Focuses the article search. The desktop input is used when it accepts
   * focus (it refuses while its controls are not displayed); otherwise the
   * hamburger menu opens and focuses its own input. Resolves false when no
   * search input could be focused.
   */
  public focusSearch(): Promise<boolean> {
    const desktopInput = this.articleSearchDesktopInput;
    if (desktopInput) {
      desktopInput.focus();
      if (desktopInput.ownerDocument.activeElement === desktopInput) {
        desktopInput.select();
        return Promise.resolve(true);
      }
    }
    return this.headerMenu?.focusSearch() ?? Promise.resolve(false);
  }

  private syncSearch(val: string) {
    this.articleSearchQuery = val;
    if (this.articleSearchDesktopInput)
      this.articleSearchDesktopInput.value = val;
    const headerMenu: ArticleHeaderMenuController | null = this.headerMenu;
    if (headerMenu) {
      (
        headerMenu as { setSearchQuery: (query: string) => void }
      ).setSearchQuery(val);
    }
  }

  private createRefreshButton(parent: HTMLElement, cls: string) {
    const btn = parent.createEl("button", {
      cls: "rss-dashboard-refresh-button " + cls,
    });
    setIcon(btn.createDiv({ cls: "rss-dashboard-refresh-icon" }), "refresh-cw");
    btn.onclick = () => this.callbacks.onRefreshFeeds();
  }

  public updateFilterBadge(btn?: HTMLElement): void {
    const targets = btn
      ? [btn]
      : Array.from(
          this.container.querySelectorAll(".rss-dashboard-filter-trigger"),
        );

    targets.forEach((target) => {
      target
        .querySelectorAll(".rss-dashboard-filter-badge")
        .forEach((el) => el.remove());
      const count = this.statusFilters.size + this.tagFilters.size;
      if (count > 0) {
        target.addClass("has-active-filters");
        target.createDiv({
          cls: "rss-dashboard-filter-badge",
          text: String(count),
        });
      } else {
        target.removeClass("has-active-filters");
      }
    });
  }

  private showFiltersMenu(btn: HTMLElement) {
    const menu = new ArticleFilterMenu(
      this.settings,
      this.statusFilters,
      this.tagFilters,
      this.filterLogic,
      {
        onFilterChange: (f) => this.callbacks.onFilterChange(f),
      },
    );
    menu.show(btn);
  }

  private getAgeOptions() {
    return {
      All: "0",
      "1 hour": "3600000",
      "2 hours": "7200000",
      "4 hours": "14400000",
      "8 hours": "28800000",
      "24 hours": "86400000",
      "48 hours": "172800000",
      "3 days": "259200000",
      "1 week": "604800000",
      "2 weeks": "1209600000",
      "1 month": "2592000000",
      "6 months": "15552000000",
      "1 year": "31536000000",
    };
  }

  private getCurrentAgeFilterValue(): string {
    if (this.settings.articleFilter.type !== "age") {
      return "0";
    }

    const currentValue = this.settings.articleFilter.value;
    if (typeof currentValue !== "number" || currentValue <= 0) {
      return "0";
    }

    return String(currentValue);
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
}
