import { setIcon, setTooltip } from "obsidian";
import { ArticleGroupByOption, RssDashboardSettings } from "../types/types";
import { TABLET_LAYOUT_MAX_WIDTH } from "../utils/platform-utils";
import { ArticleFilterMenu, FilterChangeEvent } from "./article-filter-menu";
import { ArticleHeaderMenu } from "./article-header-menu";
import { renderHeaderFeedIcon } from "./article-list/utils/feed-icon";
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
  private headerMenu: ArticleHeaderMenuController | null = null;

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
  }

  /**
   * Focuses the article search by opening the hamburger menu and focusing its
   * input. Resolves false when no search input could be focused.
   */
  public focusSearch(): Promise<boolean> {
    return this.headerMenu?.focusSearch() ?? Promise.resolve(false);
  }

  private syncSearch(val: string) {
    this.articleSearchQuery = val;
    const headerMenu: ArticleHeaderMenuController | null = this.headerMenu;
    if (headerMenu) {
      (
        headerMenu as { setSearchQuery: (query: string) => void }
      ).setSearchQuery(val);
    }
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
}
