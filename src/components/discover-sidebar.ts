import { App, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../main";
import { DiscoverFilters, FeedMetadata, CategoryPath } from "../types/discover-types";

interface DiscoverSidebarCallbacks {
    onFilterChange: () => void;
    onActivateView: () => void;
    onActivateDiscoverView: () => void;
}

export class DiscoverSidebar {
    private container: HTMLElement;
    private app: App;
    private plugin: RssDashboardPlugin;
    private filters: DiscoverFilters;
    private feeds: FeedMetadata[];
    private activeSidebarSection: "types" | "categories" | "tags";
    private callbacks: DiscoverSidebarCallbacks;
    private categoryMap: {
        categories: Record<string, Record<string, unknown>>;
    } = { categories: {} };

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

        const allTypes = Array.from(
            new Set(this.feeds.map((f) => f.type)),
        ).sort();

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
                    this.filters.selectedTypes =
                        this.filters.selectedTypes.filter(
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

    private generateCategoryMap(feeds: FeedMetadata[]): { categories: Record<string, Record<string, unknown>> } {
        const map = { categories: {} as any };
        feeds.forEach(feed => {
            if (feed.categories && feed.categories.length > 0) {
                feed.categories.forEach(path => {
                    let current = map.categories;
                    for (let i = 0; i < path.length; i++) {
                        const segment = path[i];
                        if (!current[segment]) {
                            current[segment] = {};
                        }
                        current = current[segment];
                    }
                });
            } else {
                if (!map.categories["Uncategorized"]) map.categories["Uncategorized"] = {};
            }
        });
        return map;
    }

    private getFeedsInCategoryPath(path: string[]): number {
        return this.feeds.filter(feed => {
            if (!feed.categories || feed.categories.length === 0) return path.length === 1 && path[0] === "Uncategorized";
            return feed.categories.some(catPath => {
                for (let i = 0; i < path.length; i++) {
                    if (catPath[i] !== path[i]) return false;
                }
                return true;
            });
        }).length;
    }

    private renderCategoryNode(container: HTMLElement, node: any, parentPath: string, depth = 0): void {
        const keys = Object.keys(node).sort();
        keys.forEach(key => {
            const currentPathStr = parentPath ? `${parentPath}/${key}` : key;
            const currentPathArr = currentPathStr.split("/");

            const itemContainer = container.createDiv({ cls: "rss-discover-category-item" });
            itemContainer.style.setProperty("--depth", depth.toString());

            const contentRow = itemContainer.createDiv({ cls: "rss-discover-category-row" });

            const expandIcon = contentRow.createDiv({ cls: "rss-discover-category-expand" });
            const hasChildren = Object.keys(node[key]).length > 0;
            if (hasChildren) {
                setIcon(expandIcon, "chevron-down");
            } else {
                expandIcon.style.visibility = "hidden";
            }

            const checkbox = contentRow.createEl("input", { type: "checkbox" });
            const isSelected = this.filters.selectedCategories.some(p => p.join("/") === currentPathStr);
            checkbox.checked = isSelected;

            const label = contentRow.createEl("label");
            label.textContent = key;

            const count = contentRow.createDiv({ cls: "rss-discover-category-count" });
            count.textContent = this.getFeedsInCategoryPath(currentPathArr).toString();

            checkbox.addEventListener("change", () => {
                const pathStr = currentPathStr;
                if (checkbox.checked) {
                    if (!this.filters.selectedCategories.some(p => p.join("/") === pathStr)) {
                        this.filters.selectedCategories.push(currentPathArr);
                    }
                } else {
                    this.filters.selectedCategories = this.filters.selectedCategories.filter(p => p.join("/") !== pathStr);
                }
                this.callbacks.onFilterChange();
            });

            if (hasChildren) {
                const childrenContainer = itemContainer.createDiv({ cls: "rss-discover-category-children" });
                this.renderCategoryNode(childrenContainer, node[key], currentPathStr, depth + 1);

                expandIcon.addEventListener("click", () => {
                    const isCollapsed = childrenContainer.style.display === "none";
                    if (isCollapsed) {
                        childrenContainer.style.display = "block";
                        setIcon(expandIcon, "chevron-down");
                    } else {
                        childrenContainer.style.display = "none";
                        setIcon(expandIcon, "chevron-right");
                    }
                });
            }
        });
    }

    private renderTagFilter(container: HTMLElement): void {
        const tagSection = container.createDiv({
            cls: "rss-discover-section",
        });

        const tagList = tagSection.createDiv({
            cls: "rss-discover-tag-list",
        });

        const allTags = Array.from(
            new Set(this.feeds.flatMap((f) => f.tags || []))
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
                    this.filters.selectedTags =
                        this.filters.selectedTags.filter((t: string) => t !== tag);
                }
                this.callbacks.onFilterChange();
            });
        });
    }
}
