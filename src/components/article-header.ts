import { setIcon, setTooltip } from "obsidian";
import { ArticleGroupByOption, RssDashboardSettings } from "../types/types";
import { TABLET_LAYOUT_MAX_WIDTH } from "../utils/platform-utils";
import {
  ArticleFilterMenu,
  FilterChangeEvent,
  takePendingFilterMenuOpener,
} from "./article-filter-menu";
import { ArticleHeaderMenu } from "./article-header-menu";
import { COVER_IMAGE_FETCH_ICON } from "./article-list/utils/cover-image-action";
import type { FetchAllCoversState } from "./article-list/utils/cover-image-bulk";
import { renderHeaderFeedIcon } from "./article-list/utils/feed-icon";
import { createIconButton } from "../utils/icon-button";

const FETCH_ALL_COVERS_LABELS: Record<FetchAllCoversState, string> = {
  idle: "Fetch cover images for all cards on this page",
  disabled: "No cards on this page need a cover image",
  running: "Cancel fetching cover images",
};

/** The spinner the button shows while a run is active (`loader-2`, as the other in-progress controls use). */
const FETCH_ALL_COVERS_RUNNING_ICON = "loader-2";

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
  onShowShortcuts: () => void;
  /** Starts the fetch-all-covers run, or cancels the one in progress (#1702). */
  onFetchAllCovers?: () => void;
  /** The state the fetch-all-covers button opens in. */
  getFetchAllCoversState?: () => FetchAllCoversState;
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
  private filterMenu: ArticleFilterMenu | null = null;
  private fetchAllCoversBtn: HTMLButtonElement | null = null;

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

  public refreshTagColors(): void {
    this.filterMenu?.refreshTagColors();
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
      attr: {
        type: "button",
        "aria-label": "Filters",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
      },
    });
    setIcon(
      mobileFilterBtn.createDiv({ cls: "rss-dashboard-mobile-filter-icon" }),
      "filter",
    );
    this.updateFilterBadge(mobileFilterBtn);
    // A menu left open across this re-render now belongs to the new button.
    this.filterMenu?.retarget(mobileFilterBtn);
    mobileFilterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showFiltersMenu(
        mobileFilterBtn,
        takePendingFilterMenuOpener(mobileFilterBtn),
      );
    });

    this.renderFetchAllCoversButton(rightSection);

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
          this.setSearchQuery(query);
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
        onShowShortcuts: () => this.callbacks.onShowShortcuts(),
      },
    );
    this.headerMenu.render(rightSection);
  }

  /**
   * Whether this header offers the fetch-all-covers button: the dashboard
   * supplies the action, both Display settings are on, and the view
   * renders cover images at all. The List view does not, so it has nothing for
   * a fetched cover to appear on.
   */
  private offersFetchAllCovers(): boolean {
    const { display, viewStyle } = this.settings;
    return (
      !!this.callbacks.onFetchAllCovers &&
      !!this.callbacks.getFetchAllCoversState &&
      !!display.showCoverImage &&
      !!display.showFetchAllCoversButton &&
      viewStyle !== "list"
    );
  }

  /**
   * Adds the fetch-all-covers button immediately left of the hamburger menu. It
   * carries the same icon as a card's cover control, since it runs
   * that action on every eligible card of the page.
   */
  private renderFetchAllCoversButton(parent: HTMLElement): void {
    this.fetchAllCoversBtn = null;
    if (!this.offersFetchAllCovers()) return;

    const button = createIconButton({
      label: FETCH_ALL_COVERS_LABELS.idle,
      icon: COVER_IMAGE_FETCH_ICON,
      parent,
      cls: "rss-dashboard-fetch-all-covers-button clickable-icon",
      action: "fetch-all-covers",
      region: "article-header",
    });
    button.addEventListener("click", (event: MouseEvent) => {
      event.stopPropagation();
      // Even while the button looks unavailable the press goes through: the look
      // can be stale, and the dashboard re-checks the page and says so when
      // nothing needs a cover.
      this.callbacks.onFetchAllCovers?.();
    });
    this.fetchAllCoversBtn = button;
    this.setFetchAllCoversState(
      this.callbacks.getFetchAllCoversState?.() ?? "idle",
    );
  }

  /** Moves the fetch-all-covers button to `state` in place; a no-op when it is not offered. */
  public setFetchAllCoversState(state: FetchAllCoversState): void {
    const button = this.fetchAllCoversBtn;
    if (!button) return;

    const running = state === "running";
    button.classList.toggle("is-running", running);
    if (running) {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }
    if (state === "disabled") {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }
    setIcon(
      button,
      running ? FETCH_ALL_COVERS_RUNNING_ICON : COVER_IMAGE_FETCH_ICON,
    );
    setTooltip(button, FETCH_ALL_COVERS_LABELS[state]);
  }

  /**
   * Focuses the article search by opening the hamburger menu and focusing its
   * input. Resolves false when no search input could be focused.
   */
  public focusSearch(): Promise<boolean> {
    return this.headerMenu?.focusSearch() ?? Promise.resolve(false);
  }

  /**
   * Sets the search this list is showing and pushes it into the search box.
   * The dashboard rebuilds the list on every render, so it restores the query
   * a previous list held through this method (#1465).
   */
  public setSearchQuery(query: string): void {
    this.articleSearchQuery = query;
    this.headerMenu?.setSearchQuery(query);
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

  private showFiltersMenu(btn: HTMLElement, opener?: HTMLElement) {
    const menu = new ArticleFilterMenu(
      this.settings,
      this.statusFilters,
      this.tagFilters,
      this.filterLogic,
      {
        onFilterChange: (f) => this.callbacks.onFilterChange(f),
      },
    );
    this.filterMenu = menu;
    menu.show(btn, opener);
  }
}
