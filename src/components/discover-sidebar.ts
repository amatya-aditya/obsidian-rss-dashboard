import { App, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../main";
import {
  DiscoverFilters,
  FeedMetadata,
  CategoryPath,
} from "../types/discover-types";

interface DiscoverSidebarCallbacks {
  onFilterChange: () => void;
  onActivateView: () => void;
  onActivateDiscoverView: () => void;
}

// Type for nested category structure - using unknown for leaf values
type CategoryNode = Record<string, unknown>;

export class DiscoverSidebar {
  private container: HTMLElement;
  private app: App;
  private plugin: RssDashboardPlugin;
  private filters: DiscoverFilters;
  private feeds: FeedMetadata[];
  private activeSidebarSection: "types" | "categories" | "tags";
  private callbacks: DiscoverSidebarCallbacks;
  private categoryMap: { categories: CategoryNode } = { categories: {} };

  constructor(
    app: App,
    container: HTMLElement,
    plugin: RssDashboardPlugin,
    filters: DiscoverFilters,
    feeds: FeedMetadata[],
    activeSidebarSection: "types" | "categories" | "tags",
    callbacks: DiscoverSidebarCallbacks,
  ) {
    this.app = app;
    this.container = container;
    this.plugin = plugin;
    this.filters = filters;
    this.feeds = feeds;
    this.activeSidebarSection = activeSidebarSection;
    this.callbacks = callbacks;
    this.categoryMap = this.generateCategoryMap(this.feeds);
  }

  public render(): void {
    this.container.empty();

    this.renderSidebarHeader(this.container);

    const navContainer = this.container.createDiv({
      cls: "rss-discover-sidebar-nav",
    });

    const contentContainer = this.container.createDiv({
      cls: "rss-discover-sidebar-content",
    });

    const renderFilteredContent = () => {
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
        renderFilteredContent();
      });
    });

    updateActiveButton();

    this.renderSearch(this.container);

    this.container.appendChild(contentContainer);
    renderFilteredContent();
  }

  private renderSidebarHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: "rss-discover-header" });
    const navContainer = header.createDiv({
      cls: "rss-dashboard-nav-container",
    });

    const dashboardBtn = navContainer.createDiv({
      cls: "rss-dashboard-nav-button",
    });
    dashboardBtn.appendText("Dashboard");
    dashboardBtn.addEventListener("click", () =>
      this.callbacks.onActivateView(),
    );

    const discoverBtn = navContainer.createDiv({
      cls: "rss-dashboard-nav-button active",
    });
    discoverBtn.appendText("Discover");
    discoverBtn.addEventListener("click", () =>
      this.callbacks.onActivateDiscoverView(),
    );
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
      this.callbacks.onFilterChange();
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
      if (!type) {
        return;
      }
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
        this.callbacks.onFilterChange();
      });
    });
  }

  private renderCategoryTree(container: HTMLElement): void {
    const categorySection = container.createDiv({
      cls: "rss-discover-section",
    });

    const categoryTree = categorySection.createDiv({
      cls: "rss-discover-category-tree",
    });

    const categories = this.categoryMap.categories;
    this.renderCategoryNode(categoryTree, categories, "");
  }

  /**
   * Build a nested category map from feed metadata
   * Uses domain > subdomain > area > topic hierarchy
   */
  private generateCategoryMap(feeds: FeedMetadata[]): {
    categories: CategoryNode;
  } {
    const categories: CategoryNode = {};

    feeds.forEach((feed) => {
      // Build category path from domain, subdomain, area, topic
      const hasDomain = feed.domain && feed.domain.length > 0;

      if (hasDomain) {
        feed.domain.forEach((domain: string) => {
          if (!categories[domain]) {
            categories[domain] = {} as CategoryNode;
          }
          const domainNode = categories[domain] as CategoryNode;

          // Add subdomains
          if (feed.subdomain && feed.subdomain.length > 0) {
            feed.subdomain.forEach((subdomain: string) => {
              if (!domainNode[subdomain]) {
                domainNode[subdomain] = {} as CategoryNode;
              }
              const subdomainNode = domainNode[subdomain] as CategoryNode;

              // Add areas
              if (feed.area && feed.area.length > 0) {
                feed.area.forEach((area: string) => {
                  if (!subdomainNode[area]) {
                    subdomainNode[area] = {} as CategoryNode;
                  }
                  const areaNode = subdomainNode[area] as CategoryNode;

                  // Add topics
                  if (feed.topic && feed.topic.length > 0) {
                    feed.topic.forEach((topic: string) => {
                      if (!areaNode[topic]) {
                        areaNode[topic] = {} as CategoryNode;
                      }
                    });
                  }
                });
              }
            });
          }
        });
      } else {
        // Uncategorized feeds
        if (!categories["Uncategorized"]) {
          categories["Uncategorized"] = {} as CategoryNode;
        }
      }
    });

    return { categories };
  }

  /**
   * Count feeds that match a category path
   */
  private getFeedsInCategoryPath(path: string[]): number {
    return this.feeds.filter((feed) => {
      // Check if feed matches the path hierarchy
      if (path.length === 1 && path[0] === "Uncategorized") {
        return !feed.domain || feed.domain.length === 0;
      }

      // Match against domain > subdomain > area > topic
      const pathStr = path.join("/");
      const feedPaths = this.getFeedCategoryPaths(feed);
      return feedPaths.some((feedPath) => feedPath.startsWith(pathStr));
    }).length;
  }

  /**
   * Get all category paths for a feed
   */
  private getFeedCategoryPaths(feed: FeedMetadata): string[] {
    const paths: string[] = [];

    if (!feed.domain || feed.domain.length === 0) {
      paths.push("Uncategorized");
      return paths;
    }

    feed.domain.forEach((domain: string) => {
      if (feed.subdomain && feed.subdomain.length > 0) {
        feed.subdomain.forEach((subdomain: string) => {
          if (feed.area && feed.area.length > 0) {
            feed.area.forEach((area: string) => {
              if (feed.topic && feed.topic.length > 0) {
                feed.topic.forEach((topic: string) => {
                  paths.push(`${domain}/${subdomain}/${area}/${topic}`);
                });
              } else {
                paths.push(`${domain}/${subdomain}/${area}`);
              }
            });
          } else {
            paths.push(`${domain}/${subdomain}`);
          }
        });
      } else {
        paths.push(domain);
      }
    });

    return paths;
  }

  private renderCategoryNode(
    container: HTMLElement,
    node: CategoryNode,
    parentPath: string,
    depth = 0,
  ): void {
    const keys = Object.keys(node).sort((a, b) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    keys.forEach((key) => {
      const currentPathStr = parentPath ? `${parentPath}/${key}` : key;
      const currentPathArr = currentPathStr.split("/");

      const itemContainer = container.createDiv({
        cls: "rss-discover-category-item",
      });
      itemContainer.style.setProperty("--depth", depth.toString());

      const contentRow = itemContainer.createDiv({
        cls: "rss-discover-category-row",
      });

      const expandIcon = contentRow.createDiv({
        cls: "rss-discover-category-expand",
      });
      const childNode = node[key] as CategoryNode;
      const hasChildren = childNode && Object.keys(childNode).length > 0;

      if (hasChildren) {
        setIcon(expandIcon, "chevron-down");
      } else {
        expandIcon.addClass("rss-discover-category-expand-hidden");
      }

      const checkbox = contentRow.createEl("input", { type: "checkbox" });
      const isSelected = this.filters.selectedPaths.some(
        (p: CategoryPath) => this.categoryPathToString(p) === currentPathStr,
      );
      checkbox.checked = isSelected;

      const label = contentRow.createEl("label");
      label.textContent = key;

      const count = contentRow.createDiv({
        cls: "rss-discover-category-count",
      });
      count.textContent =
        this.getFeedsInCategoryPath(currentPathArr).toString();

      checkbox.addEventListener("change", () => {
        const pathStr = currentPathStr;
        if (checkbox.checked) {
          if (
            !this.filters.selectedPaths.some(
              (p: CategoryPath) => this.categoryPathToString(p) === pathStr,
            )
          ) {
            this.filters.selectedPaths.push(this.stringToCategoryPath(pathStr));
          }
        } else {
          this.filters.selectedPaths = this.filters.selectedPaths.filter(
            (p: CategoryPath) => this.categoryPathToString(p) !== pathStr,
          );
        }
        this.callbacks.onFilterChange();
      });

      if (hasChildren) {
        const childrenContainer = itemContainer.createDiv({
          cls: "rss-discover-category-children",
        });
        this.renderCategoryNode(
          childrenContainer,
          childNode,
          currentPathStr,
          depth + 1,
        );

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
    });
  }

  /**
   * Convert CategoryPath to string for comparison
   */
  private categoryPathToString(path: CategoryPath): string {
    const parts = [path.domain];
    if (path.subdomain) parts.push(path.subdomain);
    if (path.area) parts.push(path.area);
    if (path.topic) parts.push(path.topic);
    return parts.join("/");
  }

  /**
   * Convert string path to CategoryPath
   */
  private stringToCategoryPath(pathStr: string): CategoryPath {
    const parts = pathStr.split("/");
    const result: CategoryPath = { domain: parts[0] || "" };
    if (parts[1]) result.subdomain = parts[1];
    if (parts[2]) result.area = parts[2];
    if (parts[3]) result.topic = parts[3];
    return result;
  }

  private renderTagFilter(container: HTMLElement): void {
    const tagSection = container.createDiv({
      cls: "rss-discover-section",
    });

    const tagList = tagSection.createDiv({
      cls: "rss-discover-tag-list",
    });

    const allTags = Array.from(
      new Set(this.feeds.flatMap((f) => f.tags || [])),
    ).sort();

    allTags.forEach((tag) => {
      const tagItem = tagList.createDiv({
        cls: "rss-discover-tag-item",
      });

      const checkbox = tagItem.createEl("input", { type: "checkbox" });
      checkbox.checked = this.filters.selectedTags.includes(tag);

      const label = tagItem.createEl("label");
      label.textContent = tag;

      const count = tagItem.createDiv({
        cls: "rss-discover-tag-count",
      });
      count.textContent = this.feeds
        .filter((f) => f.tags && f.tags.includes(tag))
        .length.toString();

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.filters.selectedTags.push(tag);
        } else {
          this.filters.selectedTags = this.filters.selectedTags.filter(
            (t: string) => t !== tag,
          );
        }
        this.callbacks.onFilterChange();
      });
    });
  }
}
