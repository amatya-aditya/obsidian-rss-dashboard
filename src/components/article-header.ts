import { setIcon } from "obsidian";
import { RssDashboardSettings } from "../types/types";
import { TABLET_LAYOUT_MAX_WIDTH } from "../utils/platform-utils";
import { ArticleFilterMenu, FilterChangeEvent } from "./article-filter-menu";
import { ArticleHeaderMenu } from "./article-header-menu";
import { extractDomain, getFaviconUrl } from "../utils/favicon-utils";
import { MediaService } from "../services/media-service";

interface ArticleHeaderMenuController {
  destroy(): void;
  render(parent: HTMLElement): void;
  setSearchQuery(query: string): void;
}

export interface ArticleHeaderCallbacks {
  onToggleSidebar: () => void;
  onSearch: (query: string) => void;
  onSortChange: (value: "newest" | "oldest") => void;
  onGroupChange: (value: "none" | "feed" | "date" | "folder") => void;
  onFilterChange: (event: FilterChangeEvent) => void;
  onToggleViewStyle: (style: "list" | "card" | "feed") => void;
  onPersistSettings: () => Promise<void> | void;
  onRefreshFeeds: () => Promise<void>;
  onMarkAllAsRead: () => void;
  onMarkAllAsUnread: () => void;
}

type MenuOptionEntries = Array<[label: string, value: string]>;

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
  private activePortal: HTMLElement | null = null;
  private activePortalToggleBtn: HTMLElement | null = null;
  private activePortalCleanup: (() => void) | null = null;
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
        this.headerTitleEl.setAttribute("title", tooltip);
      } else {
        this.headerTitleEl.removeAttribute("title");
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
    this.closeActivePortal();
    this.documentListeners.forEach(({ target, type, listener }) =>
      target.removeEventListener(type, listener),
    );
    this.documentListeners = [];
  }

  private closeActivePortal(): void {
    if (this.activePortalCleanup) {
      this.activePortalCleanup();
      this.activePortalCleanup = null;
    }
    if (this.activePortal) {
      this.activePortal.remove();
      this.activePortal = null;
    }
    if (this.activePortalToggleBtn) {
      this.activePortalToggleBtn.removeClass("active");
      this.activePortalToggleBtn = null;
    }
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
    const sidebarToggle = leftSection.createDiv({
      cls: "rss-dashboard-sidebar-toggle clickable-icon",
      attr: { title: "Toggle sidebar", role: "button", tabindex: "0" },
    });
    setIcon(
      sidebarToggle,
      this.settings.sidebarCollapsed ? "panel-left-open" : "panel-left-close",
    );
    sidebarToggle.addEventListener("click", () =>
      this.callbacks.onToggleSidebar(),
    );

    if (this.currentFeedUrl) {
      const feedIcon = leftSection.createDiv({
        cls: "rss-dashboard-header-feed-icon",
      });
      this.renderHeaderFeedIcon(feedIcon, this.currentFeedUrl);
    }

    this.headerTitleEl = leftSection.createDiv({
      cls: "rss-dashboard-articles-title",
      text: this.title,
      attr: this.titleTooltip ? { title: this.titleTooltip } : undefined,
    });

    const rightSection = articlesHeader.createDiv({
      cls: "rss-dashboard-header-right",
    });

    const mobileFilterBtn = rightSection.createEl("button", {
      cls: "rss-dashboard-mobile-filter-button rss-dashboard-filter-trigger clickable-icon",
      attr: { title: "Filters", role: "button", tabindex: "0" },
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

    this.createThemedSelector(
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

    this.createThemedSelector(
      controls,
      "arrow-up-down",
      "Sort:",
      { Newest: "newest", Oldest: "oldest" },
      () => this.settings.articleSort,
      (val) => this.callbacks.onSortChange(val as "newest" | "oldest"),
      "rss-dashboard-sort",
    );

    this.createThemedSelector(
      controls,
      "folders",
      "Grouping:",
      { None: "none", Feed: "feed", Date: "date", Folder: "folder" },
      () => this.settings.articleGroupBy,
      (val) =>
        this.callbacks.onGroupChange(
          val as "none" | "feed" | "date" | "folder",
        ),
      "rss-dashboard-group",
    );

    const viewStyleRow = controls.createDiv({
      cls: "rss-dashboard-view-style-row",
    });
    this.createViewStyleSelector(viewStyleRow);

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
   * Creates a selector that uses a custom portal menu instead of a native <select>.
   * This is critical for Dark Mode support as native menus in portals often
   * lose the CSS variables from the main app body.
   * @param parent The HTMLElement to append the selector to.
   * @param icon The icon name for the selector.
   * @param label The text label for the selector.
   * @param options A map of display labels to values for the selector options.
   * @param getValue A function that returns the currently selected value.
   * @param onChange A callback function triggered when a new value is selected.
   */
  private createThemedSelector(
    parent: HTMLElement,
    icon: string,
    label: string,
    options: Record<string, string>,
    getValue: () => string,
    onChange: (val: string) => void,
    triggerClass: string,
  ) {
    const wrapper = parent.createDiv({
      cls: "rss-dashboard-select-with-icon rss-dashboard-select-with-label",
    });
    wrapper.createSpan({ cls: "rss-dashboard-select-label", text: label });

    const inner = wrapper.createDiv({ cls: "rss-dashboard-select-inner" });
    setIcon(inner.createDiv({ cls: "rss-dashboard-select-icon" }), icon);

    const trigger = inner.createDiv({
      cls: `rss-dashboard-themed-select-trigger ${triggerClass}`,
      attr: { role: "button", tabindex: "0" },
    });
    const currentVal = getValue();
    const currentLabel =
      Object.keys(options).find((k) => options[k] === currentVal) || currentVal;
    trigger.createSpan({ text: currentLabel });
    setIcon(
      trigger.createDiv({ cls: "rss-dashboard-selector-arrow" }),
      "chevron-down",
    );

    trigger.onclick = (e) => {
      e.stopPropagation();
      this.showThemedMenu(trigger, options, getValue(), onChange);
    };
  }

  private showThemedMenu(
    trigger: HTMLElement,
    options: Record<string, string> | MenuOptionEntries,
    currentVal: string,
    onChange: (val: string) => void,
    icons?: Record<string, string>,
  ) {
    this.closeActivePortal();
    const portal = activeDocument.body.createDiv({
      cls: "rss-dashboard-filter-menu rss-dashboard-themed-menu-portal",
    });
    this.activePortal = portal;
    this.activePortalToggleBtn = trigger;
    trigger.addClass("active");

    const entries: MenuOptionEntries = Array.isArray(options)
      ? options
      : Object.keys(options).map((label) => [label, options[label]]);

    entries.forEach(([label, value]) => {
      const item = portal.createDiv({ cls: "rss-dashboard-filter-menu-item" });
      const check = item.createDiv({ cls: "rss-dashboard-filter-menu-check" });
      if (value === currentVal) {
        setIcon(check, "check");
        item.addClass("is-active");
      }
      // Add icon between checkbox and text if provided
      if (icons && icons[value]) {
        const iconDiv = item.createDiv({
          cls: "rss-dashboard-filter-menu-icon",
        });
        setIcon(iconDiv, icons[value]);
      }
      item.createDiv({ text: label, cls: "rss-dashboard-filter-menu-text" });
      item.onclick = () => {
        onChange(value);
        this.closeActivePortal();
        void this.callbacks.onPersistSettings();
      };
    });

    this.positionPortal(trigger, portal);
    activeWindow.setTimeout(() => {
      this.activePortalCleanup = this.addDocumentListener(
        activeDocument,
        "mousedown",
        (e: Event) => {
          const mouseEvent = e as MouseEvent;
          if (
            !portal.contains(mouseEvent.target as Node) &&
            !trigger.contains(mouseEvent.target as Node)
          )
            this.closeActivePortal();
        },
      );
    }, 0);
  }

  private createViewStyleSelector(parent: HTMLElement) {
    const selector = parent.createDiv({
      cls: "rss-dashboard-view-style-selector",
      attr: { role: "button", tabindex: "0" },
    });
    const style = this.settings.viewStyle;
    const icons: Record<string, string> = {
      feed: "newspaper",
      card: "layout-grid",
      list: "list",
    };
    setIcon(
      selector.createDiv({ cls: "rss-dashboard-selector-icon" }),
      icons[style] || "list",
    );
    selector.createSpan({
      cls: "rss-dashboard-selector-text",
      text: style.charAt(0).toUpperCase() + style.slice(1) + " View",
    });
    setIcon(
      selector.createDiv({ cls: "rss-dashboard-selector-arrow" }),
      "chevron-down",
    );

    selector.onclick = (e) => {
      e.stopPropagation();
      const viewIcons: Record<string, string> = {
        feed: "newspaper",
        card: "layout-grid",
        list: "list",
      };
      this.showThemedMenu(
        selector,
        { "List View": "list", "Card View": "card", "Feed View": "feed" },
        this.settings.viewStyle,
        (val) =>
          this.callbacks.onToggleViewStyle(val as "list" | "card" | "feed"),
        viewIcons,
      );
    };
  }

  private positionPortal(trigger: HTMLElement, portal: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    portal.style.top = `${rect.bottom + 5}px`;
    portal.style.left = `${rect.left}px`;
    activeWindow.requestAnimationFrame(() => {
      const pRect = portal.getBoundingClientRect();
      const margin = 8;
      const maxLeft = activeWindow.innerWidth - pRect.width - margin;
      portal.style.left = `${Math.max(margin, Math.min(rect.left, maxLeft))}px`;
    });
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

  private renderHeaderFeedIcon(container: HTMLElement, feedUrl: string): void {
    const feed = this.settings.feeds.find((f) => f.url === feedUrl);
    const mediaType = feed?.mediaType;
    const isYouTubeFeed = MediaService.isYouTubeFeed(feedUrl);

    if (mediaType === "video" && isYouTubeFeed) {
      setIcon(container, "play");
      container.addClass("video");
    } else if (mediaType === "podcast") {
      setIcon(container, "mic");
      container.addClass("podcast");
    } else if (feed?.iconUrl) {
      // Show cached feed logo (e.g. Mastodon profile image) when available
      const imgEl = container.createEl("img", {
        attr: {
          src: feed.iconUrl,
          alt: feed.title || feedUrl,
        },
        cls: "rss-dashboard-header-feed-icon-img",
      });
      imgEl.onerror = () => {
        container.empty();
        if (!this.settings.display.hideDefaultRssIcon) {
          setIcon(container, "rss");
        }
      };
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
