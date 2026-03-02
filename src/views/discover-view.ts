import { ItemView, WorkspaceLeaf, Notice, setIcon, Platform } from "obsidian";
import {
  FeedMetadata,
  CategoryPath,
  DiscoverFilters,
  FollowStatus,
} from "../types/discover-types";
import { RssDashboardSettings, Feed } from "../types/types";
import { FeedPreviewModal } from "../modals/feed-preview-modal";
import { FolderSelectorPopup } from "../components/folder-selector-popup";
import { MobileDiscoverFiltersModal } from "../modals/mobile-discover-filters-modal";
import type RssDashboardPlugin from "../../main";

import feedsData from "../discover/discover-feeds.json";

export const RSS_DISCOVER_VIEW_TYPE = "rss-discover-view";

export class DiscoverView extends ItemView {
  private settings: RssDashboardSettings;
  private feeds: FeedMetadata[] = [];
  private filteredFeeds: FeedMetadata[] = [];
  private filters: DiscoverFilters = {
    query: "",
    selectedTypes: [],
    selectedPaths: [],
    selectedTags: [],
    followStatus: "all",
  };
  private currentSort = "title-asc";
  private categoryMap: {
    categories: Record<string, Record<string, unknown>>;
  } = { categories: {} };
  private isLoading = true;
  private error: string | null = null;
  private activeSidebarSection: "types" | "categories" | "tags" = "tags";
  private currentPage = 1;
  private pageSize = 20;
  private resizeObserver: ResizeObserver | null = null;
  private sidebarContainer: HTMLElement | null = null;
  private discoverContainer: HTMLElement | null = null;
  private isResizing: boolean = false;
  private resizeHandle: HTMLElement | null = null;
  private hasRegisteredResizeEvents: boolean = false;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: RssDashboardPlugin,
  ) {
    super(leaf);
    this.settings = this.plugin.settings;
  }

  getViewType(): string {
    return RSS_DISCOVER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "RSS discover";
  }

  getIcon(): string {
    return "compass";
  }

  onOpen(): Promise<void> {
    this.loadData();
    this.render();
    return Promise.resolve();
  }

  private loadData(): void {
    try {
      this.isLoading = true;
      this.error = null;

      this.feeds = feedsData as FeedMetadata[];

      this.categoryMap = this.generateCategoryMap(this.feeds);

      const savedState = this.app.loadLocalStorage(
        "rss-discover-filters",
      ) as Partial<DiscoverFilters> | null;
      if (savedState) {
        this.filters = { ...this.filters, ...savedState };
      }

      this.filterFeeds();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "Unknown error occurred";
    } finally {
      this.isLoading = false;
    }
  }

  private generateCategoryMap(feeds: FeedMetadata[]): {
    categories: Record<string, Record<string, unknown>>;
  } {
    const categoryMap: {
      categories: Record<string, Record<string, unknown>>;
    } = { categories: {} };

    feeds.forEach((feed) => {
      feed.domain.forEach((domain) => {
        if (!categoryMap.categories[domain]) {
          categoryMap.categories[domain] = {};
        }

        feed.subdomain.forEach((subdomain) => {
          if (!categoryMap.categories[domain][subdomain]) {
            categoryMap.categories[domain][subdomain] = {};
          }

          feed.area.forEach((area) => {
            const subdomainObj = categoryMap.categories[domain][
              subdomain
            ] as Record<string, unknown>;
            if (!subdomainObj[area]) {
              subdomainObj[area] = [];
            }

            feed.topic.forEach((topic) => {
              const areaArray = subdomainObj[area] as string[];
              if (!areaArray.includes(topic)) {
                areaArray.push(topic);
              }
            });
          });
        });
      });
    });

    return categoryMap;
  }

  private filterFeeds(resetPage = true): void {
    this.filteredFeeds = this.feeds.filter((feed) => this.matchesFilters(feed));
    this.sortFeeds();
    if (resetPage) {
      this.currentPage = 1;
      return;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(this.filteredFeeds.length / this.pageSize),
    );
    this.currentPage = Math.min(this.currentPage, totalPages);
  }

  private refreshViewAfterFollowStateChange(): void {
    if (this.filters.followStatus !== "all") {
      this.filterFeeds(false);
    }
    this.render();
  }

  private isFollowedFeed(feed: FeedMetadata): boolean {
    return this.plugin.settings.feeds.some((f: Feed) => f.url === feed.url);
  }

  private matchesFilters(
    feed: FeedMetadata,
    options?: { skipFollowStatus?: boolean },
  ): boolean {
    if (this.filters.query) {
      const query = this.filters.query.toLowerCase();
      const searchableText = [
        feed.title,
        feed.url,
        ...feed.domain,
        ...feed.subdomain,
        ...feed.area,
        ...feed.topic,
        ...feed.tags,
      ]
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(query)) {
        return false;
      }
    }

    if (this.filters.selectedTypes.length > 0) {
      if (!this.filters.selectedTypes.includes(feed.type)) {
        return false;
      }
    }

    if (this.filters.selectedPaths.length > 0) {
      const hasMatchingPath = this.filters.selectedPaths.some(
        (selectedPath: CategoryPath) => {
          if (
            selectedPath.domain &&
            !feed.domain.includes(selectedPath.domain)
          ) {
            return false;
          }

          if (
            selectedPath.subdomain &&
            !feed.subdomain.includes(selectedPath.subdomain)
          ) {
            return false;
          }

          if (selectedPath.area && !feed.area.includes(selectedPath.area)) {
            return false;
          }

          if (selectedPath.topic && !feed.topic.includes(selectedPath.topic)) {
            return false;
          }

          return true;
        },
      );

      if (!hasMatchingPath) {
        return false;
      }
    }

    if (this.filters.selectedTags.length > 0) {
      const hasMatchingTag = this.filters.selectedTags.some((tag: string) =>
        feed.tags.includes(tag),
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    if (options?.skipFollowStatus) {
      return true;
    }

    // Follow status filter
    if (this.filters.followStatus === "followed") {
      if (!this.isFollowedFeed(feed)) {
        return false;
      }
    } else if (this.filters.followStatus === "unfollowed") {
      if (this.isFollowedFeed(feed)) {
        return false;
      }
    }

    return true;
  }

  private sortFeeds(): void {
    this.filteredFeeds.sort((a, b) => {
      switch (this.currentSort) {
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "created-desc":
          return (
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
          );
        case "created-asc":
          return (
            new Date(a.createdAt || 0).getTime() -
            new Date(b.createdAt || 0).getTime()
          );
        case "tags-desc":
          return b.tags.length - a.tags.length;
        case "tags-asc":
          return a.tags.length - b.tags.length;
        case "category-asc": {
          const categoryA = a.domain[0] || "";
          const categoryB = b.domain[0] || "";
          return categoryA.localeCompare(categoryB);
        }
        case "tag-name-asc": {
          const tagA = a.tags[0] || "";
          const tagB = b.tags[0] || "";
          return tagA.localeCompare(tagB);
        }
        case "type-asc":
          return (a.type || "").localeCompare(b.type || "");
        case "type-desc":
          return (b.type || "").localeCompare(a.type || "");
        default:
          return 0;
      }
    });
  }

  private saveFilterState(): void {
    this.app.saveLocalStorage("rss-discover-filters", this.filters);
  }

  public openMobileSidebar(): void {
    new MobileDiscoverFiltersModal(
      this.app,
      this.plugin,
      this.filters,
      this.feeds,
      this.activeSidebarSection,
      () => {
        this.currentPage = 1;
        this.filterFeeds();
        this.saveFilterState();
        this.render();
      },
    ).open();
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("rss-discover-container");

    if (this.isLoading) {
      this.renderLoading(container);
      return;
    }

    if (this.error) {
      this.renderError(container);
      return;
    }

    this.renderLayout(container);
  }

  private renderLoading(container: HTMLElement): void {
    const loadingEl = container.createDiv({ cls: "rss-discover-loading" });
    setIcon(loadingEl, "loader-2");
    loadingEl.appendText(" Loading discover feeds...");
  }

  private renderError(container: HTMLElement): void {
    const errorEl = container.createDiv({ cls: "rss-discover-error" });
    setIcon(errorEl, "alert-triangle");
    errorEl.appendText(` Error: ${this.error}`);

    const retryBtn = errorEl.createEl("button", { cls: "mod-cta" });
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => {
      this.loadData();
      void this.render();
    });
  }

  private renderLayout(container: HTMLElement): void {
    const layout = container.createDiv({ cls: "rss-discover-layout" });
    this.discoverContainer = layout;

    const sidebar = layout.createDiv({ cls: "rss-discover-sidebar" });
    this.sidebarContainer = sidebar;
    this.renderSidebar(sidebar);

    const content = layout.createDiv({ cls: "rss-discover-content" });
    this.renderContent(content);

    // Setup sidebar resize handle after sidebar content is rendered.
    this.setupSidebarResize();
  }

  private renderSidebar(container: HTMLElement): void {
    container.empty();
    this.renderSidebarHeader(container);
    this.renderSidebarContent(container);
  }

  private renderSidebarContent(container: HTMLElement): void {
    const navContainer = container.createDiv({
      cls: "rss-discover-sidebar-nav",
    });

    const contentContainer = container.createDiv({
      cls: "rss-discover-sidebar-content",
    });

    const renderContent = () => {
      contentContainer.empty();
      switch (this.activeSidebarSection) {
        case "types":
          this.renderTypeFilter(contentContainer);
          break;
        case "categories":
          this.renderCategoryTree(contentContainer);
          break;
        case "tags":
          this.renderTagFilter(contentContainer);
          break;
      }
    };

    const typesBtn = navContainer.createEl("button", { text: "Types" });
    const categoriesBtn = navContainer.createEl("button", {
      text: "Categories",
    });
    const tagsBtn = navContainer.createEl("button", { text: "Tags" });

    const buttons = [
      { el: typesBtn, section: "types" as const },
      { el: categoriesBtn, section: "categories" as const },
      { el: tagsBtn, section: "tags" as const },
    ];

    const updateActiveButton = () => {
      buttons.forEach((btn) => {
        if (btn.section === this.activeSidebarSection) {
          btn.el.addClass("active");
        } else {
          btn.el.removeClass("active");
        }
      });
    };

    buttons.forEach((btn) => {
      btn.el.addEventListener("click", () => {
        this.activeSidebarSection = btn.section;
        updateActiveButton();
        renderContent();
      });
    });

    updateActiveButton();

    this.renderSearch(container);

    // Re-append content container to ensure it's at the bottom
    container.appendChild(contentContainer);
    renderContent();
  }

  private renderSidebarHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: "rss-discover-header" });
    this.renderNavTabs(header);
  }

  private renderNavTabs(container: HTMLElement): void {
    const navContainer = container.createDiv({
      cls: "rss-dashboard-nav-container",
    });

    const dashboardBtn = navContainer.createDiv({
      cls: "rss-dashboard-nav-button",
    });
    dashboardBtn.appendText("Dashboard");
    dashboardBtn.addEventListener(
      "click",
      () => void this.plugin.activateView(),
    );

    const discoverBtn = navContainer.createDiv({
      cls: "rss-dashboard-nav-button active",
    });
    discoverBtn.appendText("Discover");
    discoverBtn.addEventListener(
      "click",
      () => void this.plugin.activateDiscoverView(),
    );
  }

  private renderMobileHeader(container: HTMLElement): void {
    const header = container.createDiv({
      cls: "rss-discover-mobile-header",
    });

    const leftSection = header.createDiv({
      cls: "rss-discover-header-left",
    });

    const sidebarToggleButton = leftSection.createDiv({
      cls: "rss-dashboard-sidebar-toggle",
      attr: { title: "Toggle filters" },
    });
    setIcon(sidebarToggleButton, "panel-left");
    sidebarToggleButton.addEventListener("click", () => {
      this.openMobileSidebar();
    });

    leftSection.createDiv({
      cls: "rss-discover-header-title",
      text: "RSS Discover",
    });
  }

  private renderSearch(container: HTMLElement): void {
    const searchSection = container.createDiv({
      cls: "rss-discover-section",
    });

    const searchInput = searchSection.createEl("input", {
      type: "text",
      placeholder: "Search feeds...",
      value: this.filters.query,
    });
    searchInput.addClass("rss-discover-search-input");

    searchInput.addEventListener("input", (e) => {
      this.filters.query = (e.target as HTMLInputElement).value;
      this.currentPage = 1;
      this.filterFeeds();
      this.saveFilterState();
      const contentEl = this.containerEl.querySelector(
        ".rss-discover-content",
      ) as HTMLElement;
      if (contentEl) {
        this.renderContent(contentEl);
      }
    });
  }

  private renderTypeFilter(container: HTMLElement): void {
    const typeSection = container.createDiv({
      cls: "rss-discover-section",
    });

    const typeList = typeSection.createDiv({
      cls: "rss-discover-type-list",
    });

    const allTypes = Array.from(new Set(this.feeds.map((f) => f.type))).sort();

    allTypes.forEach((type) => {
      const typeItem = typeList.createDiv({
        cls: "rss-discover-type-item",
      });

      const checkbox = typeItem.createEl("input", { type: "checkbox" });
      checkbox.checked = this.filters.selectedTypes.includes(type);

      const label = typeItem.createEl("label");
      label.textContent = type;

      const count = typeItem.createDiv({
        cls: "rss-discover-type-count",
      });
      count.textContent = this.feeds
        .filter((f) => f.type === type)
        .length.toString();

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.filters.selectedTypes.push(type);
        } else {
          this.filters.selectedTypes = this.filters.selectedTypes.filter(
            (t: string) => t !== type,
          );
        }
        this.currentPage = 1;
        this.filterFeeds();
        this.saveFilterState();
        void this.render();
      });
    });
  }

  private renderCategoryTree(container: HTMLElement): void {
    const categorySection = container.createDiv({
      cls: "rss-discover-section",
    });

    // const categoryHeader = categorySection.createDiv({ cls: "rss-discover-section-header" });
    // setIcon(categoryHeader, "folder-tree");
    // categoryHeader.appendChild(document.createTextNode(" Categories"));

    const categoryTree = categorySection.createDiv({
      cls: "rss-discover-category-tree",
    });

    // Sort categories alphabetically
    const sortedEntries = Object.entries(this.categoryMap.categories).sort(
      (a, b) => {
        return a[0].localeCompare(b[0], undefined, {
          numeric: true,
          sensitivity: "base",
        });
      },
    );

    sortedEntries.forEach(
      ([domain, subdomains]: [string, Record<string, unknown>]) => {
        this.renderCategoryNode(categoryTree, domain, subdomains, 0);
      },
    );
  }

  private renderCategoryNode(
    container: HTMLElement,
    name: string,
    children: Record<string, unknown>,
    depth: number,
  ): void {
    const itemContainer = container.createDiv({
      cls: "rss-discover-category-item",
    });
    itemContainer.style.setProperty("--depth", depth.toString());

    let categoryType: "domain" | "subdomain" | "area" | "topic";
    switch (depth) {
      case 0:
        categoryType = "domain";
        break;
      case 1:
        categoryType = "subdomain";
        break;
      case 2:
        categoryType = "area";
        break;
      case 3:
        categoryType = "topic";
        break;
      default:
        categoryType = "domain";
    }

    const hasChildren =
      children &&
      typeof children === "object" &&
      Object.keys(children).length > 0;

    const row = itemContainer.createDiv({
      cls: "rss-discover-category-row",
    });
    const mainContent = row.createDiv({
      cls: "rss-discover-category-main",
    });

    // Create expand/collapse icon
    const expandIcon = mainContent.createDiv({
      cls: "rss-discover-category-expand",
    });
    if (hasChildren) {
      setIcon(expandIcon, "chevron-right");
    } else {
      expandIcon.addClass("rss-discover-category-expand-hidden");
    }

    const checkbox = mainContent.createEl("input", { type: "checkbox" });

    checkbox.checked = this.isCategorySelected(name, categoryType);

    const label = mainContent.createEl("label");
    label.textContent = name;

    const count = row.createDiv({ cls: "rss-discover-category-count" });
    const feedCount = this.getOptionCount(categoryType, name);
    count.textContent = feedCount.toString();

    if (feedCount === 0) {
      itemContainer.addClass("disabled");
      checkbox.disabled = true;
    }

    checkbox.addEventListener("change", () => {
      this.handleCategorySelection(name, checkbox.checked, depth, categoryType);
      this.currentPage = 1;
      this.filterFeeds();
      this.saveFilterState();
      this.render();
    });

    if (hasChildren) {
      const childrenContainer = itemContainer.createDiv({
        cls: "rss-discover-category-children rss-collapsed",
      });

      if (Array.isArray(children)) {
        const sortedChildren = [...children].sort((a: string, b: string) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );
        sortedChildren.forEach((topic: string) => {
          this.renderCategoryNode(childrenContainer, topic, {}, depth + 1);
        });
      } else {
        const sortedEntries = Object.entries(children).sort((a, b) =>
          String(a[0]).localeCompare(String(b[0]), undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );
        sortedEntries.forEach(
          ([childName, childChildren]: [string, unknown]) => {
            if (childChildren && typeof childChildren === "object") {
              this.renderCategoryNode(
                childrenContainer,
                childName,
                childChildren as Record<string, unknown>,
                depth + 1,
              );
            }
          },
        );
      }

      expandIcon.addEventListener("click", () => {
        const isCollapsed = childrenContainer.hasClass("rss-collapsed");
        if (isCollapsed) {
          childrenContainer.removeClass("rss-collapsed");
          setIcon(expandIcon, "chevron-down");
        } else {
          childrenContainer.addClass("rss-collapsed");
          setIcon(expandIcon, "chevron-right");
        }
      });
    }
  }

  private isCategorySelected(
    categoryName: string,
    categoryType: "domain" | "subdomain" | "area" | "topic",
  ): boolean {
    return this.filters.selectedPaths.some((path) => {
      switch (categoryType) {
        case "domain":
          return path.domain === categoryName;
        case "subdomain":
          return path.subdomain === categoryName;
        case "area":
          return path.area === categoryName;
        case "topic":
          return path.topic === categoryName;
        default:
          return false;
      }
    });
  }

  private handleCategorySelection(
    categoryName: string,
    selected: boolean,
    depth: number,
    categoryType: "domain" | "subdomain" | "area" | "topic",
  ): void {
    if (selected) {
      const path: CategoryPath = { domain: "" };
      switch (categoryType) {
        case "domain":
          path.domain = categoryName;
          break;
        case "subdomain":
          path.subdomain = categoryName;
          break;
        case "area":
          path.area = categoryName;
          break;
        case "topic":
          path.topic = categoryName;
          break;
      }

      const pathExists = this.filters.selectedPaths.some((p) => {
        return (
          p.domain === path.domain &&
          p.subdomain === path.subdomain &&
          p.area === path.area &&
          p.topic === path.topic
        );
      });

      if (!pathExists) {
        this.filters.selectedPaths.push(path);
      }
    } else {
      this.filters.selectedPaths = this.filters.selectedPaths.filter((p) => {
        switch (categoryType) {
          case "domain":
            return p.domain !== categoryName;
          case "subdomain":
            return p.subdomain !== categoryName;
          case "area":
            return p.area !== categoryName;
          case "topic":
            return p.topic !== categoryName;
          default:
            return true;
        }
      });
    }
  }

  private renderTagFilter(container: HTMLElement): void {
    const tagSection = container.createDiv({ cls: "rss-discover-section" });

    // const tagHeader = tagSection.createDiv({ cls: "rss-discover-section-header" });
    // setIcon(tagHeader, "tags");
    // tagHeader.appendChild(document.createTextNode(" Tags"));

    const tagList = tagSection.createDiv({ cls: "rss-discover-tag-list" });

    const allTags = Array.from(
      new Set(this.feeds.flatMap((f) => f.tags)),
    ).sort();

    const renderTags = (searchTerm: string) => {
      tagList.empty();
      const filteredTags = allTags.filter((tag) =>
        tag.toLowerCase().includes(searchTerm.toLowerCase()),
      );

      filteredTags.forEach((tag) => {
        const tagItem = tagList.createDiv({
          cls: "rss-discover-tag-item",
        });

        const checkbox = tagItem.createEl("input", {
          type: "checkbox",
        });
        checkbox.checked = this.filters.selectedTags.includes(tag);

        const colorDot = tagItem.createDiv({
          cls: "rss-discover-tag-color-dot",
        });
        colorDot.style.setProperty("--tag-color", this.getTagColor(tag));

        const label = tagItem.createEl("label");
        label.textContent = tag;

        const count = tagItem.createDiv({
          cls: "rss-discover-tag-count",
        });
        count.textContent = this.feeds
          .filter((f) => f.tags.includes(tag))
          .length.toString();

        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            this.filters.selectedTags.push(tag);
          } else {
            this.filters.selectedTags = this.filters.selectedTags.filter(
              (t: string) => t !== tag,
            );
          }
          this.currentPage = 1;
          this.filterFeeds();
          this.saveFilterState();
          this.render();
        });
      });
    };

    renderTags("");
  }

  private getTagColor(tag: string): string {
    let hash = 0;
    if (tag.length === 0) return "hsl(0, 0%, 80%)";
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 75%)`;
  }

  private renderContent(container: HTMLElement): void {
    container.empty();

    const controlsContainer = container.createDiv({
      cls: "rss-discover-controls-container",
    });

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Mobile header with filter toggle and sort
    this.renderMobileHeader(controlsContainer);

    // Set up ResizeObserver
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        // Breakpoint: <= 1200px triggers mobile layout
        if (width <= 1200) {
          controlsContainer.classList.add("is-narrow");
        } else {
          controlsContainer.classList.remove("is-narrow");
        }
      }
    });
    this.resizeObserver.observe(controlsContainer);

    const filterHeader = controlsContainer.createDiv({
      cls: "rss-discover-filter-header",
    });

    const leftSection = filterHeader.createDiv({
      cls: "rss-discover-filter-header-left",
    });

    const resultsCount = leftSection.createDiv({
      cls: "rss-discover-results-count",
    });
    resultsCount.textContent = `${this.filteredFeeds.length} feeds found`;

    this.renderSelectedFilters(leftSection);

    const rightSection = filterHeader.createDiv({
      cls: "rss-discover-filter-header-right",
    });

    // Smallweb navigation button
    const smallwebBtn = rightSection.createDiv({
      cls: "rss-dashboard-nav-button",
    });
    smallwebBtn.appendText("✦ Smallweb");
    smallwebBtn.addEventListener("click", () => {
      void this.plugin.activateSmallwebView();
    });

    const desktopFilterControls = rightSection.createDiv({
      cls: "rss-discover-filter-controls",
    });

    // Follow status + sort controls stay in desktop header.
    this.renderFollowStatusDropdown(desktopFilterControls);
    this.renderSortDropdown(desktopFilterControls);
    if (this.hasActiveFilters()) {
      this.renderClearFiltersButton(desktopFilterControls);
    }

    const mobileFiltersMenu = rightSection.createDiv({
      cls: "rss-discover-mobile-filters-menu",
    });
    const mobileFiltersButton = mobileFiltersMenu.createEl("button", {
      cls: "rss-discover-mobile-filters-button",
      attr: {
        type: "button",
        "aria-label": "Toggle discover filters menu",
      },
    });
    setIcon(mobileFiltersButton, "menu");

    const mobileFiltersDropdown = mobileFiltersMenu.createDiv({
      cls: "rss-discover-mobile-filters-dropdown",
    });
    let pendingFollowStatus: FollowStatus = this.filters.followStatus;
    let pendingSort: string = this.currentSort;
    let pendingClearFilters = false;

    const mobileFollowDropdown = this.renderFollowStatusDropdown(
      mobileFiltersDropdown,
      {
        selectedValue: pendingFollowStatus,
        immediateApply: false,
        onChange: (value: FollowStatus) => {
          pendingFollowStatus = value;
          pendingClearFilters = false;
        },
      },
    );
    const mobileSortDropdown = this.renderSortDropdown(mobileFiltersDropdown, {
      selectedValue: pendingSort,
      immediateApply: false,
      onChange: (value: string) => {
        pendingSort = value;
      },
    });

    const mobileActionRow = mobileFiltersDropdown.createDiv({
      cls: "rss-discover-mobile-filters-actions",
    });
    const okBtn = mobileActionRow.createEl("button", {
      cls: "rss-discover-ok-button",
      text: "OK",
      attr: { type: "button" },
    });
    const clearBtn = mobileActionRow.createEl("button", {
      cls: "rss-clear-filter-button rss-clear-filter-button-danger",
      text: "Clear filters",
      attr: { type: "button" },
    });

    clearBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      pendingClearFilters = true;
      pendingFollowStatus = "all";
      pendingSort = "title-asc";
      mobileFollowDropdown.value = pendingFollowStatus;
      mobileSortDropdown.value = pendingSort;
    });

    okBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (pendingClearFilters) {
        this.filters = {
          query: "",
          selectedTypes: [],
          selectedPaths: [],
          selectedTags: [],
          followStatus: "all",
        };
      } else {
        this.filters.followStatus = pendingFollowStatus;
      }

      this.currentSort = pendingSort;
      this.currentPage = 1;
      this.filterFeeds();
      this.saveFilterState();

      const contentEl = this.containerEl.querySelector(
        ".rss-discover-content",
      ) as HTMLElement;
      if (contentEl) {
        this.renderContent(contentEl);
      }
    });

    mobileFiltersButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      mobileFiltersMenu.classList.toggle("active");
    });

    const grid = container.createDiv({ cls: "rss-discover-grid" });

    if (this.filteredFeeds.length === 0) {
      const emptyState = container.createDiv({
        cls: "rss-discover-empty",
      });
      setIcon(emptyState, "search");
      emptyState.appendText(" No feeds match your filters");
      return;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(this.filteredFeeds.length / this.pageSize),
    );
    const startIdx = (this.currentPage - 1) * this.pageSize;
    const endIdx = Math.min(
      startIdx + this.pageSize,
      this.filteredFeeds.length,
    );
    const feedsForPage = this.filteredFeeds.slice(startIdx, endIdx);

    feedsForPage.forEach((feed) => {
      this.renderFeedCard(grid, feed);
    });

    const paginationWrapper = container.createDiv({
      cls: "rss-dashboard-pagination-wrapper",
    });
    this.renderPagination(
      paginationWrapper,
      this.currentPage,
      totalPages,
      this.pageSize,
      this.filteredFeeds.length,
    );
  }

  private renderSortDropdown(
    container: HTMLElement,
    options?: {
      selectedValue?: string;
      immediateApply?: boolean;
      onChange?: (value: string) => void;
    },
  ): HTMLSelectElement {
    const sortContainer = container.createDiv({
      cls: "rss-discover-sort-container",
    });

    // Add sort icon
    const sortIcon = sortContainer.createDiv({
      cls: "rss-discover-dropdown-icon",
    });
    setIcon(sortIcon, "arrow-up-down");

    const sortDropdown = sortContainer.createEl("select");
    sortDropdown.addClass("rss-discover-sort-dropdown");
    const selectedSort = options?.selectedValue ?? this.currentSort;

    const sortOptions: Record<string, string> = {
      "title-asc": "File name (a to z)",
      "title-desc": "File name (z to a)",
      "type-asc": "Type (a to z)",
      "type-desc": "Type (z to a)",
      "created-desc": "Created time (new to old)",
      "created-asc": "Created time (old to new)",
      "tags-desc": "Tags number (most to least)",
      "tags-asc": "Tags number (least to most)",
      "category-asc": "Category (a to z)",
      "tag-name-asc": "First tag (a to z)",
    };

    for (const [value, text] of Object.entries(sortOptions)) {
      const optionEl = sortDropdown.createEl("option", { value, text });
      if (value === selectedSort) {
        optionEl.selected = true;
      }
    }

    sortDropdown.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value;
      options?.onChange?.(value);
      if (options?.immediateApply !== false) {
        this.currentSort = value;
        this.currentPage = 1;
        this.sortFeeds();
        const contentEl = this.containerEl.querySelector(
          ".rss-discover-content",
        ) as HTMLElement;
        if (contentEl) {
          this.renderContent(contentEl);
        }
      }
    });
    return sortDropdown;
  }

  private renderFollowStatusDropdown(
    container: HTMLElement,
    options?: {
      selectedValue?: FollowStatus;
      immediateApply?: boolean;
      onChange?: (value: FollowStatus) => void;
    },
  ): HTMLSelectElement {
    const dropdownContainer = container.createDiv({
      cls: "rss-discover-sort-container",
    });

    // Add filter icon
    const filterIcon = dropdownContainer.createDiv({
      cls: "rss-discover-dropdown-icon",
    });
    setIcon(filterIcon, "filter");

    const dropdown = dropdownContainer.createEl("select");
    dropdown.addClass("rss-discover-sort-dropdown");
    const selectedFollowStatus =
      options?.selectedValue ?? this.filters.followStatus;

    // Calculate counts within current non-follow filters (query/type/category/tag).
    const feedsInCurrentScope = this.feeds.filter((feed) =>
      this.matchesFilters(feed, { skipFollowStatus: true }),
    );
    const followedCount = feedsInCurrentScope.filter((feed) =>
      this.isFollowedFeed(feed),
    ).length;
    const unfollowedCount = feedsInCurrentScope.length - followedCount;
    const totalCount = feedsInCurrentScope.length;

    const followStatusOptions: { value: FollowStatus; text: string }[] = [
      { value: "all", text: `All feeds (${totalCount})` },
      { value: "followed", text: `Followed (${followedCount})` },
      { value: "unfollowed", text: `Unfollowed (${unfollowedCount})` },
    ];

    followStatusOptions.forEach((opt) => {
      const optionEl = dropdown.createEl("option", {
        value: opt.value,
        text: opt.text,
      });
      if (opt.value === selectedFollowStatus) {
        optionEl.selected = true;
      }
    });

    dropdown.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value as FollowStatus;
      options?.onChange?.(value);
      if (options?.immediateApply !== false) {
        this.filters.followStatus = value;
        this.currentPage = 1;
        this.filterFeeds();
        this.saveFilterState();
        const contentEl = this.containerEl.querySelector(
          ".rss-discover-content",
        ) as HTMLElement;
        if (contentEl) {
          this.renderContent(contentEl);
        }
      }
    });
    return dropdown;
  }

  private renderClearFiltersButton(container: HTMLElement): void {
    const clearBtn = container.createEl("button", {
      cls: "rss-clear-filter-button",
    });
    clearBtn.textContent = "Clear filters";
    clearBtn.addEventListener("click", () => {
      this.clearFilters();
    });
  }

  private clearFilters(): void {
    this.filters = {
      query: "",
      selectedTypes: [],
      selectedPaths: [],
      selectedTags: [],
      followStatus: "all",
    };
    this.currentPage = 1;
    this.filterFeeds();
    this.saveFilterState();
    void this.render();
  }

  private getOptionCount(filterType: string, option: string): number {
    switch (filterType) {
      case "type":
        return this.feeds.filter((f) => f.type === option).length;
      case "tag":
        return this.feeds.filter((f) => f.tags.includes(option)).length;
      case "domain":
        return this.feeds.filter((f) => f.domain.includes(option)).length;
      case "subdomain":
        return this.feeds.filter((f) => f.subdomain.includes(option)).length;
      case "area":
        return this.feeds.filter((f) => f.area.includes(option)).length;
      case "topic":
        return this.feeds.filter((f) => f.topic.includes(option)).length;
      default:
        return 0;
    }
  }

  private getInitials(title: string): string {
    const words = title.split(" ");
    if (words.length > 1) {
      return (words[0][0] + words[1][0]).toUpperCase();
    } else if (words.length === 1 && words[0].length > 1) {
      return (words[0][0] + words[0][1]).toUpperCase();
    } else if (words.length === 1 && words[0].length === 1) {
      return words[0][0].toUpperCase();
    }
    return "NA";
  }

  private renderFeedCard(
    container: HTMLElement | DocumentFragment,
    feed: FeedMetadata,
  ): void {
    const card = container.createDiv({ cls: "rss-discover-card" });

    const header = card.createDiv({ cls: "rss-discover-card-header" });

    const titleGroup = header.createDiv({
      cls: "rss-discover-card-title-group",
    });

    const logoContainer = titleGroup.createDiv({
      cls: "rss-discover-card-logo-container",
    });
    if (feed.imageUrl) {
      const img = logoContainer.createEl("img", {
        cls: "rss-discover-card-logo",
        attr: { src: feed.imageUrl },
      });
      img.onerror = () => {
        img.remove();
        logoContainer.createDiv({
          cls: "rss-discover-card-initials",
          text: this.getInitials(feed.title),
        });
      };
    } else {
      logoContainer.createDiv({
        cls: "rss-discover-card-initials",
        text: this.getInitials(feed.title),
      });
    }

    const titleAndUrl = titleGroup.createDiv();
    titleAndUrl.createDiv({
      cls: "rss-discover-card-title",
      text: feed.title,
    });

    const content = card.createDiv({ cls: "rss-discover-card-content" });

    if (feed.summary) {
      content.createDiv({
        cls: "rss-discover-card-summary",
        text: feed.summary,
      });
    }

    // if (feed.domain.length > 0) {
    // const categories = content.createDiv({ cls: "rss-discover-card-categories" });
    // feed.domain.forEach(category => {
    //         const categoryEl = categories.createDiv({ cls: "rss-discover-card-category", text: category });

    //     });
    //  }

    // content.createDiv({ cls: "rss-discover-card-url", text: feed.url });

    const metaTopContainer = content.createDiv({
      cls: "rss-discover-card-meta-top",
    });
    if (feed.type) {
      const typeEl = metaTopContainer.createDiv({
        cls: "rss-discover-card-type",
      });
      typeEl.textContent = `${feed.type}`;
    }
    if ((feed.type || feed.domain.length > 0) && feed.tags.length > 0) {
      metaTopContainer.createDiv({
        text: "|",
        cls: "rss-discover-card-pipe",
      });
    }

    if (feed.tags.length > 0) {
      const tags = metaTopContainer.createDiv({
        cls: "rss-discover-card-tags",
      });
      feed.tags.forEach((tag) => {
        const tagEl = tags.createDiv({
          cls: "rss-discover-card-tag",
          text: tag,
        });
        tagEl.style.setProperty("--tag-color", this.getTagColor(tag));
      });
    }

    const footer = card.createDiv({ cls: "rss-discover-card-footer" });

    const rightSection = footer.createDiv({
      cls: "rss-discover-card-footer-right",
    });

    const previewBtn = rightSection.createEl("button", {
      cls: "rss-discover-card-preview-btn",
    });
    setIcon(previewBtn, "file-search");
    previewBtn.createSpan({ text: "Preview" });
    previewBtn.addEventListener("click", () => {
      new FeedPreviewModal(this.app, feed).open();
    });

    const isAdded = this.plugin.settings.feeds.some(
      (f: Feed) => f.url === feed.url,
    );

    if (isAdded) {
      const removeBtn = rightSection.createEl("button", {
        text: "Remove",
        cls: "rss-discover-card-remove-btn",
      });
      removeBtn.addEventListener("click", () => {
        void (async () => {
          await this.removeFeed(feed.url);
          // Re-filter when follow status filters are active, then refresh.
          this.refreshViewAfterFollowStateChange();
        })();
      });
    } else {
      // Add to... button - shows folder selector popup
      const addToBtn = rightSection.createEl("button", {
        cls: "rss-discover-card-add-btn rss-discover-card-add-to-btn",
      });
      setIcon(addToBtn, "plus");
      addToBtn.createSpan({ text: "Add to..." });

      // Default folder for discover feeds
      const defaultFolder = "Uncategorized";

      // Single click: Show folder selector popup (list-only mode)
      addToBtn.addEventListener("click", () => {
        new FolderSelectorPopup(this.plugin, {
          anchorEl: addToBtn,
          defaultFolder: defaultFolder,
          listOnly: true,
          onSelect: (folderName) => {
            void this.addFeedToFolder(feed, folderName);
          },
        });
      });
    }
  }

  /**
   * Add feed to a specific folder
   * Creates the folder if it doesn't exist
   */
  private async addFeedToFolder(
    feed: FeedMetadata,
    folderName: string,
  ): Promise<void> {
    try {
      // Ensure the folder exists
      const folderExists = this.plugin.settings.folders.some(
        (f) => f.name.toLowerCase() === folderName.toLowerCase(),
      );

      if (!folderExists) {
        await this.plugin.ensureFolderExists(folderName);
      }

      // Add the feed
      await this.plugin.addFeed(feed.title, feed.url, folderName);
      new Notice(`Feed "${feed.title}" added to "${folderName}"`);

      // Re-filter when follow status filters are active, then refresh.
      this.refreshViewAfterFollowStateChange();
    } catch (error) {
      new Notice(
        `Failed to add feed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Remove a feed from settings by URL
   */
  private async removeFeed(feedUrl: string): Promise<void> {
    try {
      const feedIndex = this.plugin.settings.feeds.findIndex(
        (f: Feed) => f.url === feedUrl,
      );

      if (feedIndex >= 0) {
        const feedTitle = this.plugin.settings.feeds[feedIndex].title;
        this.plugin.settings.feeds.splice(feedIndex, 1);
        await this.plugin.saveSettings();

        // Refresh the dashboard view if it exists
        const dashboardView = await this.plugin.getActiveDashboardView();
        if (dashboardView) {
          dashboardView.refresh();
        }

        new Notice(`Feed "${feedTitle}" removed`);
      }
    } catch (error) {
      new Notice(
        `Failed to remove feed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private previewFeed(feed: FeedMetadata): void {
    window.open(feed.url, "_blank");
  }

  async onClose(): Promise<void> {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.isResizing = false;
    this.resizeHandle = null;
    this.sidebarContainer = null;
    this.discoverContainer = null;
    this.hasRegisteredResizeEvents = false;
    await super.onClose();
  }

  private setupSidebarResize(): void {
    // Don't setup resize on mobile/tablet.
    if (Platform.isMobile || window.innerWidth <= 1200) {
      return;
    }

    // Remove existing resize handle if any.
    if (this.resizeHandle) {
      this.resizeHandle.remove();
      this.resizeHandle = null;
    }

    // Create resize handle.
    if (this.sidebarContainer) {
      this.resizeHandle = this.sidebarContainer.createDiv({
        cls: "rss-dashboard-sidebar-resize-handle",
      });
    }

    this.applySidebarWidth();

    if (this.resizeHandle) {
      this.registerDomEvent(this.resizeHandle, "mousedown", (e) => {
        this.handleResizeStart(e);
      });
    }

    if (!this.hasRegisteredResizeEvents) {
      this.registerDomEvent(document, "mousemove", (e) => {
        this.handleResizeMove(e);
      });
      this.registerDomEvent(document, "mouseup", () => {
        this.handleResizeEnd();
      });
      this.hasRegisteredResizeEvents = true;
    }
  }

  private handleResizeStart(e: MouseEvent): void {
    e.preventDefault();
    this.isResizing = true;
    this.resizeHandle?.addClass("dragging");
    this.discoverContainer?.addClass("resizing");
  }

  private handleResizeMove(e: MouseEvent): void {
    if (!this.isResizing) return;

    const containerRect = this.containerEl.getBoundingClientRect();
    let newWidth = e.clientX - containerRect.left;

    // Match dashboard constraints.
    const minWidth = 200;
    const maxWidth = 500;
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    this.settings.sidebarWidth = newWidth;
    this.applySidebarWidth();
  }

  private handleResizeEnd(): void {
    if (!this.isResizing) return;

    this.isResizing = false;
    this.resizeHandle?.removeClass("dragging");
    this.discoverContainer?.removeClass("resizing");

    // Persist width setting.
    void this.plugin.saveSettings();
  }

  private applySidebarWidth(): void {
    if (!this.sidebarContainer) return;
    const width = this.settings.sidebarWidth || 280;
    this.sidebarContainer.style.width = `${width}px`;
    this.sidebarContainer.style.minWidth = `${width}px`;
  }

  private hasActiveFilters(): boolean {
    return (
      this.filters.query !== "" ||
      this.filters.selectedTypes.length > 0 ||
      this.filters.selectedPaths.length > 0 ||
      this.filters.selectedTags.length > 0 ||
      this.filters.followStatus !== "all"
    );
  }

  private renderSelectedFilters(header: HTMLElement): void {
    if (!this.hasActiveFilters()) return;

    const selectedFiltersContainer = header.createDiv({
      cls: "rss-discover-selected-filters",
    });

    if (this.filters.query) {
      const searchFilter = selectedFiltersContainer.createDiv({
        cls: "rss-discover-selected-filter",
      });
      setIcon(searchFilter, "search");
      searchFilter.appendText(` "${this.filters.query}"`);
    }

    this.filters.selectedTypes.forEach((type) => {
      const typeFilter = selectedFiltersContainer.createDiv({
        cls: "rss-discover-selected-filter",
      });
      setIcon(typeFilter, "tag");
      typeFilter.appendText(` ${type}`);
    });

    this.filters.selectedPaths.forEach((path) => {
      const pathFilter = selectedFiltersContainer.createDiv({
        cls: "rss-discover-selected-filter",
      });
      setIcon(pathFilter, "folder");
      const pathText = [path.domain, path.subdomain, path.area, path.topic]
        .filter(Boolean)
        .join(" > ");
      pathFilter.appendText(` ${pathText}`);
    });

    this.filters.selectedTags.forEach((tag) => {
      const tagFilter = selectedFiltersContainer.createDiv({
        cls: "rss-discover-selected-filter",
      });
      setIcon(tagFilter, "hash");
      tagFilter.appendText(` ${tag}`);
      tagFilter.style.setProperty("--tag-color", this.getTagColor(tag));
    });
  }

  private renderPagination(
    container: HTMLElement,
    currentPage: number,
    totalPages: number,
    pageSize: number,
    totalFeeds: number,
  ): void {
    const paginationContainer = container.createDiv({
      cls: "rss-dashboard-pagination",
    });

    const prevButton = paginationContainer.createEl("button", {
      cls: "rss-dashboard-pagination-btn prev",
      text: "<",
    });
    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => this.handlePageChange(currentPage - 1);

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
    nextButton.onclick = () => this.handlePageChange(currentPage + 1);

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
      this.handlePageSizeChange(size);
    };

    const startIdx = (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(currentPage * pageSize, totalFeeds);
    paginationContainer.createEl("span", {
      cls: "rss-dashboard-pagination-results",
      text: `Results: ${startIdx} - ${endIdx} of ${totalFeeds}`,
    });
  }

  private handlePageChange(page: number): void {
    this.currentPage = page;
    const contentEl = this.containerEl.querySelector(
      ".rss-discover-content",
    ) as HTMLElement;
    if (contentEl) {
      this.renderContent(contentEl);
    }
  }

  private handlePageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.currentPage = 1;
    const contentEl = this.containerEl.querySelector(
      ".rss-discover-content",
    ) as HTMLElement;
    if (contentEl) {
      this.renderContent(contentEl);
    }
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
    btn.onclick = () => this.handlePageChange(page);
  }
}
