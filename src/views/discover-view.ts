import { ItemView, WorkspaceLeaf, Notice, setIcon } from "obsidian";
import { FeedMetadata, FilterState, CategoryPath, DiscoverFilters } from "../types/discover-types";
import { RssDashboardSettings, Feed } from "../types/types";
import { FeedPreviewModal } from "../modals/feed-preview-modal";


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
        selectedTags: []
    };
    private currentSort = 'rating-desc';
    private categoryMap: any = {};
    private isLoading = true;
    private error: string | null = null;
    private activeSidebarSection: 'types' | 'categories' | 'tags' = 'categories';
    private currentPage = 1;
    private pageSize = 20;
    private resizeObserver: ResizeObserver | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private plugin: any
    ) {
        super(leaf);
        this.settings = this.plugin.settings;
    }

    getViewType(): string {
        return RSS_DISCOVER_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "RSS Discover";
    }

    getIcon(): string {
        return "lucide-library-big";
    }

    async onOpen(): Promise<void> {
        await this.loadData();
        await this.render();
    }

    private async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.error = null;

            
            this.feeds = feedsData as FeedMetadata[];

            
            this.categoryMap = this.generateCategoryMap(this.feeds);

            
            const savedState = localStorage.getItem('rss-discover-filters');
            if (savedState) {
                this.filters = { ...this.filters, ...JSON.parse(savedState) };
            }

            this.filterFeeds();
        } catch (error) {
            console.error('Error loading discover data:', error);
            this.error = error instanceof Error ? error.message : 'Unknown error occurred';
        } finally {
            this.isLoading = false;
        }
    }

    private generateCategoryMap(feeds: FeedMetadata[]): any {
        const categoryMap: any = { categories: {} };

        feeds.forEach(feed => {
            feed.domain.forEach(domain => {
                if (!categoryMap.categories[domain]) {
                    categoryMap.categories[domain] = {};
                }
                
                feed.subdomain.forEach(subdomain => {
                    if (!categoryMap.categories[domain][subdomain]) {
                        categoryMap.categories[domain][subdomain] = {};
                    }

                    feed.area.forEach(area => {
                        if (!categoryMap.categories[domain][subdomain][area]) {
                            categoryMap.categories[domain][subdomain][area] = [];
                        }

                        feed.topic.forEach(topic => {
                            if (!categoryMap.categories[domain][subdomain][area].includes(topic)) {
                                categoryMap.categories[domain][subdomain][area].push(topic);
                            }
                        });
                    });
                });
            });
        });

        return categoryMap;
    }

    private filterFeeds(): void {
        this.filteredFeeds = this.feeds.filter(feed => {
            
            if (this.filters.query) {
                const query = this.filters.query.toLowerCase();
                const searchableText = [
                    feed.title,
                    feed.url,
                    ...feed.domain,
                    ...feed.subdomain,
                    ...feed.area,
                    ...feed.topic,
                    ...feed.tags
                ].join(' ').toLowerCase();
                
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
                const hasMatchingPath = this.filters.selectedPaths.some((selectedPath: CategoryPath) => {
                    
                    
                    if (selectedPath.domain && !feed.domain.includes(selectedPath.domain)) {
                        return false;
                    }
                    
                    
                    if (selectedPath.subdomain && !feed.subdomain.includes(selectedPath.subdomain)) {
                        return false;
                    }
                    
                    
                    if (selectedPath.area && !feed.area.includes(selectedPath.area)) {
                        return false;
                    }
                    
                    
                    if (selectedPath.topic && !feed.topic.includes(selectedPath.topic)) {
                        return false;
                    }
                    
                    return true;
                });
                
                if (!hasMatchingPath) {
                    return false;
                }
            }

            
            if (this.filters.selectedTags.length > 0) {
                const hasMatchingTag = this.filters.selectedTags.some((tag: string) => 
                    feed.tags.includes(tag)
                );
                if (!hasMatchingTag) {
                    return false;
                }
            }

            return true;
        });
        this.sortFeeds();
        this.currentPage = 1;
    }

    private sortFeeds(): void {
        this.filteredFeeds.sort((a, b) => {
            switch (this.currentSort) {
                case 'title-asc':
                    return a.title.localeCompare(b.title);
                case 'title-desc':
                    return b.title.localeCompare(a.title);
                case 'created-desc':
                    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
                case 'created-asc':
                    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
                case 'tags-desc':
                    return b.tags.length - a.tags.length;
                case 'tags-asc':
                    return a.tags.length - b.tags.length;
                case 'category-asc':
                    const categoryA = a.domain[0] || '';
                    const categoryB = b.domain[0] || '';
                    return categoryA.localeCompare(categoryB);
                case 'tag-name-asc':
                    const tagA = a.tags[0] || '';
                    const tagB = b.tags[0] || '';
                    return tagA.localeCompare(tagB);
                case 'type-asc':
                    return (a.type || '').localeCompare(b.type || '');
                case 'type-desc':
                    return (b.type || '').localeCompare(a.type || '');
                case 'rating-desc':
                    return (b.rating || 0) - (a.rating || 0);
                case 'rating-asc':
                    return (a.rating || 0) - (b.rating || 0);
                default:
                    return 0;
            }
        });
    }

    private saveFilterState(): void {
        localStorage.setItem('rss-discover-filters', JSON.stringify(this.filters));
    }

    async render(): Promise<void> {
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
        loadingEl.appendChild(document.createTextNode(" Loading discover feeds..."));
    }

    private renderError(container: HTMLElement): void {
        const errorEl = container.createDiv({ cls: "rss-discover-error" });
        setIcon(errorEl, "alert-triangle");
        errorEl.appendChild(document.createTextNode(` Error: ${this.error}`));
        
        const retryBtn = errorEl.createEl("button", { cls: "mod-cta" });
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => this.loadData().then(() => this.render()));
    }

    private renderLayout(container: HTMLElement): void {
        const layout = container.createDiv({ cls: "rss-discover-layout" });
        
        const sidebar = layout.createDiv({ cls: "rss-discover-sidebar" });
        this.renderSidebar(sidebar);
        
        const content = layout.createDiv({ cls: "rss-discover-content" });
        this.renderContent(content);
    }

    private renderSidebar(container: HTMLElement): void {
        container.empty();
        this.renderSidebarHeader(container);
        this.renderSearch(container);

        
        const contentContainer = container.createDiv({ cls: "rss-discover-sidebar-content" });
        const navContainer = container.createDiv({ cls: "rss-discover-sidebar-nav" });

        const renderContent = () => {
            contentContainer.empty();
            switch (this.activeSidebarSection) {
                case 'types':
                    this.renderTypeFilter(contentContainer);
                    break;
                case 'categories':
                    this.renderCategoryTree(contentContainer);
                    break;
                case 'tags':
                    this.renderTagFilter(contentContainer);
                    break;
            }
        };

        const typesBtn = navContainer.createEl('button', { text: 'Types' });
        const categoriesBtn = navContainer.createEl('button', { text: 'Categories' });
        const tagsBtn = navContainer.createEl('button', { text: 'Tags' });

        const buttons = [
            { el: typesBtn, section: 'types' as const },
            { el: categoriesBtn, section: 'categories' as const },
            { el: tagsBtn, section: 'tags' as const }
        ];

        const updateActiveButton = () => {
            buttons.forEach(btn => {
                if (btn.section === this.activeSidebarSection) {
                    btn.el.addClass('active');
                } else {
                    btn.el.removeClass('active');
                }
            });
        };

        buttons.forEach(btn => {
            btn.el.addEventListener('click', () => {
                this.activeSidebarSection = btn.section;
                updateActiveButton();
                renderContent();
            });
        });

        updateActiveButton();
        renderContent();
    }

    private renderSidebarHeader(container: HTMLElement): void {
        const header = container.createDiv({ cls: "rss-discover-header" });
        const navContainer = header.createDiv({ cls: "rss-dashboard-nav-container" });

        const dashboardBtn = navContainer.createDiv({ cls: "rss-dashboard-nav-button" });
        dashboardBtn.appendChild(document.createTextNode("Dashboard"));
        dashboardBtn.addEventListener("click", () => this.plugin.activateView());

        const discoverBtn = navContainer.createDiv({ cls: "rss-dashboard-nav-button active" });
        discoverBtn.appendChild(document.createTextNode("Discover"));
        discoverBtn.addEventListener("click", () => this.plugin.activateDiscoverView());
    }

    private renderSearch(container: HTMLElement): void {
        const searchSection = container.createDiv({ cls: "rss-discover-section" });
        
        const searchInput = searchSection.createEl("input", {
            type: "text",
            placeholder: "Search feeds...",
            value: this.filters.query
        });
        searchInput.addClass("rss-discover-search-input");
        
        searchInput.addEventListener("input", (e) => {
            this.filters.query = (e.target as HTMLInputElement).value;
            this.currentPage = 1;
            this.filterFeeds();
            this.saveFilterState();
            const contentEl = this.containerEl.querySelector('.rss-discover-content') as HTMLElement;
            if (contentEl) {
                this.renderContent(contentEl);
            }
        });
    }

    private renderTypeFilter(container: HTMLElement): void {
        const typeSection = container.createDiv({ cls: "rss-discover-section" });
        
        // const typeHeader = typeSection.createDiv({ cls: "rss-discover-section-header" });
        // setIcon(typeHeader, "tag");
        // typeHeader.appendChild(document.createTextNode(" Feed Types"));
        
        const typeList = typeSection.createDiv({ cls: "rss-discover-type-list" });
        
        const allTypes = Array.from(new Set(this.feeds.map(f => f.type))).sort();
        
        allTypes.forEach(type => {
            const typeItem = typeList.createDiv({ cls: "rss-discover-type-item" });
            
            const checkbox = typeItem.createEl("input", { type: "checkbox" }) as HTMLInputElement;
            checkbox.checked = this.filters.selectedTypes.includes(type);
            
            const label = typeItem.createEl("label");
            label.textContent = type;
            
            const count = typeItem.createDiv({ cls: "rss-discover-type-count" });
            count.textContent = this.feeds.filter(f => f.type === type).length.toString();
            
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    this.filters.selectedTypes.push(type);
                } else {
                    this.filters.selectedTypes = this.filters.selectedTypes.filter((t: string) => t !== type);
                }
                this.currentPage = 1;
                this.filterFeeds();
                this.saveFilterState();
                this.render();
            });
        });
    }

    private renderCategoryTree(container: HTMLElement): void {
        const categorySection = container.createDiv({ cls: "rss-discover-section" });
        
        // const categoryHeader = categorySection.createDiv({ cls: "rss-discover-section-header" });
        // setIcon(categoryHeader, "folder-tree");
        // categoryHeader.appendChild(document.createTextNode(" Categories"));
        
        const categoryTree = categorySection.createDiv({ cls: "rss-discover-category-tree" });
        
        Object.entries(this.categoryMap.categories).forEach(([domain, subdomains]: [string, any]) => {
            this.renderCategoryNode(categoryTree, domain, subdomains, 0);
        });
    }

    private renderCategoryNode(container: HTMLElement, name: string, children: any, depth: number): void {
        const node = container.createDiv({ cls: "rss-discover-category-node" });
        const depthClass = `rss-discover-category-node-depth-${Math.min(depth, 5)}`;
        node.addClass(depthClass);
        
        
        let categoryType: 'domain' | 'subdomain' | 'area' | 'topic';
        switch (depth) {
            case 0: categoryType = 'domain'; break;
            case 1: categoryType = 'subdomain'; break;
            case 2: categoryType = 'area'; break;
            case 3: categoryType = 'topic'; break;
            default: categoryType = 'domain';
        }
        
        const checkbox = node.createEl("input", { type: "checkbox" }) as HTMLInputElement;
        
        
        checkbox.checked = this.isCategorySelected(name, categoryType);

        const label = node.createEl("label");
        label.textContent = name;
        
        const count = node.createDiv({ cls: "rss-discover-category-count" });
        const feedCount = this.getOptionCount(categoryType, name);
        count.textContent = feedCount.toString();
        
        if (feedCount === 0) {
            node.addClass("disabled");
            checkbox.disabled = true;
        }
        
        checkbox.addEventListener("change", () => {
            this.handleCategorySelection(name, checkbox.checked, depth, categoryType);
            this.currentPage = 1;
            this.filterFeeds();
            this.saveFilterState();
            this.render();
        });
        
        if (children && typeof children === 'object') {
            if (Array.isArray(children)) {
                
                children.forEach((topic: string) => {
                    this.renderCategoryNode(container, topic, null, depth + 1);
                });
            } else {
                
                Object.entries(children).forEach(([childName, childChildren]: [string, any]) => {
                    this.renderCategoryNode(container, childName, childChildren, depth + 1);
                });
            }
        }
    }

    private isCategorySelected(categoryName: string, categoryType: 'domain' | 'subdomain' | 'area' | 'topic'): boolean {
        return this.filters.selectedPaths.some(path => {
            switch (categoryType) {
                case 'domain': return path.domain === categoryName;
                case 'subdomain': return path.subdomain === categoryName;
                case 'area': return path.area === categoryName;
                case 'topic': return path.topic === categoryName;
                default: return false;
            }
        });
    }

    private handleCategorySelection(categoryName: string, selected: boolean, depth: number, categoryType: 'domain' | 'subdomain' | 'area' | 'topic'): void {
        if (selected) {
            
            const path: CategoryPath = { domain: "" };
            switch (categoryType) {
                case 'domain': path.domain = categoryName; break;
                case 'subdomain': path.subdomain = categoryName; break;
                case 'area': path.area = categoryName; break;
                case 'topic': path.topic = categoryName; break;
            }
            
            
            const pathExists = this.filters.selectedPaths.some(p => {
                return p.domain === path.domain &&
                       p.subdomain === path.subdomain &&
                       p.area === path.area &&
                       p.topic === path.topic;
            });
            
            if (!pathExists) {
                this.filters.selectedPaths.push(path);
            }
        } else {
            
            this.filters.selectedPaths = this.filters.selectedPaths.filter(p => {
                switch (categoryType) {
                    case 'domain': return p.domain !== categoryName;
                    case 'subdomain': return p.subdomain !== categoryName;
                    case 'area': return p.area !== categoryName;
                    case 'topic': return p.topic !== categoryName;
                    default: return true;
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
        
        const allTags = Array.from(new Set(this.feeds.flatMap(f => f.tags))).sort();
        
        const renderTags = (searchTerm: string) => {
            tagList.empty();
            const filteredTags = allTags.filter(tag => 
                tag.toLowerCase().includes(searchTerm.toLowerCase())
            );
            
            filteredTags.forEach(tag => {
                const tagItem = tagList.createDiv({ cls: "rss-discover-tag-item" });
                
                const checkbox = tagItem.createEl("input", { type: "checkbox" }) as HTMLInputElement;
                checkbox.checked = this.filters.selectedTags.includes(tag);

                const colorDot = tagItem.createDiv({ cls: 'rss-discover-tag-color-dot' });
                colorDot.style.setProperty('--tag-color', this.getTagColor(tag));
                
                const label = tagItem.createEl("label");
                label.textContent = tag;
                
                const count = tagItem.createDiv({ cls: "rss-discover-tag-count" });
                count.textContent = this.feeds.filter(f => f.tags.includes(tag)).length.toString();
                
                checkbox.addEventListener("change", () => {
                    if (checkbox.checked) {
                        this.filters.selectedTags.push(tag);
                    } else {
                        this.filters.selectedTags = this.filters.selectedTags.filter((t: string) => t !== tag);
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
        if (tag.length === 0) return 'hsl(0, 0%, 80%)';
        for (let i = 0; i < tag.length; i++) {
            hash = tag.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash;
        }
        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 60%, 75%)`;
    }

    private renderStarRating(container: HTMLElement, rating: number): void {
        const ratingButton = container.createEl('button', {
            cls: 'rss-discover-card-rating-button'
        });
        // ratingButton.disabled = true;

        const starsContainer = ratingButton.createDiv({ cls: 'rss-discover-card-stars' });

        for (let i = 1; i <= 5; i++) {
            const star = starsContainer.createDiv({ cls: 'rss-discover-card-star' });

            if (rating >= i) {
                setIcon(star, 'star');
                star.addClass('filled');
            } else if (rating >= i - 0.5) {
                setIcon(star, 'star-half');
                star.addClass('half-filled');
            } else {
                setIcon(star, 'star');
                star.addClass('empty');
            }
        }

        const ratingText = ratingButton.createSpan({ cls: 'rss-discover-card-rating-text' });
        ratingText.textContent = `(${rating.toFixed(1)}/5)`;
    }

    private renderContent(container: HTMLElement): void {
        container.empty();
        
        const controlsContainer = container.createDiv({ cls: 'rss-discover-controls-container' });

        
        const topSection = controlsContainer.createDiv({ cls: 'rss-discover-top-section' });

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                topSection.classList.toggle('is-narrow', width < 800);
            }
        });
        this.resizeObserver.observe(topSection);

        
        const desktopControls = topSection.createDiv({ cls: 'rss-discover-desktop-filters' });
        this.createTopFilterControls(desktopControls);

        
        const hamburgerMenu = topSection.createDiv({ cls: 'rss-discover-hamburger-menu' });
        const hamburgerButton = hamburgerMenu.createEl('button', { cls: 'rss-discover-hamburger-button' });
        setIcon(hamburgerButton, 'menu');
        
        const dropdownMenu = hamburgerMenu.createDiv({ cls: 'rss-discover-dropdown-menu' });
        this.createTopFilterControls(dropdownMenu);
        
        hamburgerButton.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('active');
        });
        
        document.addEventListener('click', (e) => {
            if (!hamburgerMenu.contains(e.target as Node)) {
                dropdownMenu.classList.remove('active');
            }
        });
        
        
        const filterHeader = controlsContainer.createDiv({ cls: "rss-discover-filter-header" });
        const resultsCount = filterHeader.createDiv({ cls: "rss-discover-results-count" });
        resultsCount.textContent = `${this.filteredFeeds.length} feeds found`;
        
        this.renderSelectedFilters(filterHeader);
        
        if (this.hasActiveFilters()) {
            const clearBtn = filterHeader.createEl("button", { cls: "clear-filter-button mod-cta" });
            clearBtn.textContent = "Clear Filters";
            clearBtn.addEventListener("click", () => {
                this.filters = {
                    query: "",
                    selectedTypes: [],
                    selectedPaths: [],
                    selectedTags: []
                };
                this.currentPage = 1;
                this.filterFeeds();
                this.saveFilterState();
                this.render();
            });
        }
        
        const grid = container.createDiv({ cls: "rss-discover-grid" });
        
        if (this.filteredFeeds.length === 0) {
            const emptyState = container.createDiv({ cls: "rss-discover-empty" });
            setIcon(emptyState, "search");
            emptyState.appendChild(document.createTextNode(" No feeds match your filters"));
            return;
        }

        const totalPages = Math.max(1, Math.ceil(this.filteredFeeds.length / this.pageSize));
        const startIdx = (this.currentPage - 1) * this.pageSize;
        const endIdx = Math.min(startIdx + this.pageSize, this.filteredFeeds.length);
        const feedsForPage = this.filteredFeeds.slice(startIdx, endIdx);

        feedsForPage.forEach(feed => {
            this.renderFeedCard(grid, feed);
        });

        const paginationWrapper = container.createDiv({ cls: 'rss-dashboard-pagination-wrapper' });
        this.renderPagination(paginationWrapper, this.currentPage, totalPages, this.pageSize, this.filteredFeeds.length);
    }

    private createTopFilterControls(container: HTMLElement): void {
        const topFilters = container.createDiv({ cls: "rss-discover-top-filters" });
        
        this.renderFilterDropdown(topFilters, "Domain", "domain", "folder", this.getAllDomains());
        this.renderFilterDropdown(topFilters, "Sub Domain", "subdomain", "folder-open", this.getAllSubdomains());
        this.renderFilterDropdown(topFilters, "Area", "area", "folder-tree", this.getAllAreas());
        this.renderFilterDropdown(topFilters, "Topic", "topic", "file-text", this.getAllTopics());
        this.renderFilterDropdown(topFilters, "Type", "type", "tag", this.getAllTypes());
        this.renderFilterDropdown(topFilters, "Tag", "tag", "hash", this.getAllTags());
        this.renderSortDropdown(topFilters);
    }

    private renderSortDropdown(container: HTMLElement): void {
        const sortContainer = container.createDiv({ cls: 'rss-discover-sort-container' });
        
        const sortDropdown = sortContainer.createEl('select');
        sortDropdown.addClass('rss-discover-sort-dropdown');
        
        const options = {
            'title-asc': 'File name (A to Z)',
            'title-desc': 'File name (Z to A)',
            'type-asc': 'Type (A to Z)',
            'type-desc': 'Type (Z to A)',
            'rating-desc': 'Rating (high to low)',
            'rating-asc': 'Rating (low to high)',
            'created-desc': 'Created time (new to old)',
            'created-asc': 'Created time (old to new)',
            'tags-desc': 'Tags number (most to least)',
            'tags-asc': 'Tags number (least to most)',
            'category-asc': 'Category (A to Z)',
            'tag-name-asc': 'First Tag (A to Z)'
        };
        
        for (const [value, text] of Object.entries(options)) {
            const optionEl = sortDropdown.createEl('option', { value, text });
            if (value === this.currentSort) {
                optionEl.selected = true;
            }
        }
        
        sortDropdown.addEventListener('change', (e) => {
            this.currentSort = (e.target as HTMLSelectElement).value;
            this.currentPage = 1;
            this.sortFeeds();
            const contentEl = this.containerEl.querySelector('.rss-discover-content') as HTMLElement;
            if (contentEl) {
                this.renderContent(contentEl);
            }
        });
    }

    private renderFilterDropdown(container: HTMLElement, label: string, filterType: string, iconName: string, options: string[]): void {
        const filterContainer = container.createDiv({ cls: "rss-discover-filter-container" });
        
        const dropdownContainer = filterContainer.createDiv({ cls: "rss-discover-dropdown-container" });
        
        const input = dropdownContainer.createEl("input", {
            type: "text",
            placeholder: `Search ${label.toLowerCase()}...`
        });
        input.addClass("rss-discover-filter-input");
        
        const dropdown = dropdownContainer.createDiv({ cls: "rss-discover-filter-dropdown" });
        dropdown.addClass("hidden");
        
        this.populateFilterDropdown(dropdown, options, filterType, "");
        
        let searchTimeout: NodeJS.Timeout | undefined;
        input.addEventListener("input", (e) => {
            const query = (e.target as HTMLInputElement).value;
            
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            if (query.trim()) {
                const filteredOptions = options.filter(option => 
                    option.toLowerCase().includes(query.toLowerCase())
                );
                this.populateFilterDropdown(dropdown, filteredOptions, filterType, query);
                dropdown.removeClass("hidden");
                dropdown.addClass("visible");
            } else {
                this.populateFilterDropdown(dropdown, options, filterType, "");
                dropdown.removeClass("hidden");
                dropdown.addClass("visible");
            }
        });
        
        input.addEventListener("focus", () => {
            this.populateFilterDropdown(dropdown, options, filterType, "");
            dropdown.removeClass("hidden");
            dropdown.addClass("visible");
        });
        
        document.addEventListener("click", (e) => {
            if (!dropdownContainer.contains(e.target as Node)) {
                dropdown.removeClass("visible");
                dropdown.addClass("hidden");
            }
        });
    }

    private populateFilterDropdown(dropdown: HTMLElement, options: string[], filterType: string, searchQuery: string): void {
        dropdown.empty();
        
        if (options.length === 0) {
            const noResults = dropdown.createDiv({ cls: "rss-discover-dropdown-no-results" });
            noResults.textContent = "No matches found";
            return;
        }
        
        options.forEach(option => {
            const item = dropdown.createDiv({ cls: "rss-discover-dropdown-item" });
            
            const checkbox = item.createEl("input", { type: "checkbox" }) as HTMLInputElement;
            checkbox.checked = this.isOptionSelected(filterType, option);
            
            const text = item.createDiv({ cls: "rss-discover-dropdown-text" });
            text.textContent = option;
            
            const count = item.createDiv({ cls: "rss-discover-dropdown-count" });
            count.textContent = this.getOptionCount(filterType, option).toString();
            
            checkbox.addEventListener("change", () => {
                this.handleFilterSelection(filterType, option, checkbox.checked);
                this.currentPage = 1;
                this.filterFeeds();
                this.saveFilterState();
                this.render();
            });
            
            item.addEventListener("click", (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    this.handleFilterSelection(filterType, option, checkbox.checked);
                    this.currentPage = 1;
                    this.filterFeeds();
                    this.saveFilterState();
                    this.render();
                }
            });
        });
    }

    private isOptionSelected(filterType: string, option: string): boolean {
        switch (filterType) {
            case "type":
                return this.filters.selectedTypes.includes(option);
            case "tag":
                return this.filters.selectedTags.includes(option);
            case "domain":
            case "subdomain":
            case "area":
            case "topic":
                return this.filters.selectedPaths.some(path => {
                    switch (filterType) {
                        case "domain": return path.domain === option;
                        case "subdomain": return path.subdomain === option;
                        case "area": return path.area === option;
                        case "topic": return path.topic === option;
                        default: return false;
                    }
                });
            default:
                return false;
        }
    }

    private getOptionCount(filterType: string, option: string): number {
        switch (filterType) {
            case "type":
                return this.feeds.filter(f => f.type === option).length;
            case "tag":
                return this.feeds.filter(f => f.tags.includes(option)).length;
            case "domain":
                return this.feeds.filter(f => f.domain.includes(option)).length;
            case "subdomain":
                return this.feeds.filter(f => f.subdomain.includes(option)).length;
            case "area":
                return this.feeds.filter(f => f.area.includes(option)).length;
            case "topic":
                return this.feeds.filter(f => f.topic.includes(option)).length;
            default:
                return 0;
        }
    }

    private handleFilterSelection(filterType: string, option: string, selected: boolean): void {
        switch (filterType) {
            case "type":
                if (selected) {
                    if (!this.filters.selectedTypes.includes(option)) {
                        this.filters.selectedTypes.push(option);
                    }
                } else {
                    this.filters.selectedTypes = this.filters.selectedTypes.filter(t => t !== option);
                }
                break;
            case "tag":
                if (selected) {
                    if (!this.filters.selectedTags.includes(option)) {
                        this.filters.selectedTags.push(option);
                    }
                } else {
                    this.filters.selectedTags = this.filters.selectedTags.filter(t => t !== option);
                }
                break;
            case "domain":
            case "subdomain":
            case "area":
            case "topic":
                if (selected) {
                    const path: CategoryPath = { domain: "" };
                    switch (filterType) {
                        case "domain": path.domain = option; break;
                        case "subdomain": path.subdomain = option; break;
                        case "area": path.area = option; break;
                        case "topic": path.topic = option; break;
                    }
                    
                    
                    const pathExists = this.filters.selectedPaths.some(p => {
                        return p.domain === path.domain &&
                               p.subdomain === path.subdomain &&
                               p.area === path.area &&
                               p.topic === path.topic;
                    });
                    
                    if (!pathExists) {
                        this.filters.selectedPaths.push(path);
                    }
                } else {
                    this.filters.selectedPaths = this.filters.selectedPaths.filter(p => {
                        switch (filterType) {
                            case "domain": return p.domain !== option;
                            case "subdomain": return p.subdomain !== option;
                            case "area": return p.area !== option;
                            case "topic": return p.topic !== option;
                            default: return true;
                        }
                    });
                }
                break;
        }
    }

    private getAllDomains(): string[] {
        const domains = new Set<string>();
        this.feeds.forEach(feed => {
            feed.domain.forEach(domain => domains.add(domain));
        });
        return Array.from(domains).sort();
    }

    private getAllSubdomains(): string[] {
        const subdomains = new Set<string>();
        this.feeds.forEach(feed => {
            feed.subdomain.forEach(subdomain => subdomains.add(subdomain));
        });
        return Array.from(subdomains).sort();
    }

    private getAllAreas(): string[] {
        const areas = new Set<string>();
        this.feeds.forEach(feed => {
            feed.area.forEach(area => areas.add(area));
        });
        return Array.from(areas).sort();
    }

    private getAllTopics(): string[] {
        const topics = new Set<string>();
        this.feeds.forEach(feed => {
            feed.topic.forEach(topic => topics.add(topic));
        });
        return Array.from(topics).sort();
    }

    private getAllTypes(): string[] {
        return Array.from(new Set(this.feeds.map(f => f.type))).sort();
    }

    private getAllTags = () => [...new Set(this.feeds.flatMap(f => f.tags))].sort();

    private getInitials(title: string): string {
        const words = title.split(' ');
        if (words.length > 1) {
            return (words[0][0] + words[1][0]).toUpperCase();
        } else if (words.length === 1 && words[0].length > 1) {
            return (words[0][0] + words[0][1]).toUpperCase();
        } else if (words.length === 1 && words[0].length === 1) {
            return words[0][0].toUpperCase();
        }
        return 'NA';
    }

    private renderFeedCard(container: HTMLElement | DocumentFragment, feed: FeedMetadata): void {
        const card = container.createDiv({ cls: "rss-discover-card" });
        
        const header = card.createDiv({ cls: "rss-discover-card-header" });
        
        const titleGroup = header.createDiv({ cls: 'rss-discover-card-title-group' });

        const logoContainer = titleGroup.createDiv({ cls: 'rss-discover-card-logo-container' });
        if (feed.imageUrl) {
            logoContainer.createEl('img', { cls: 'rss-discover-card-logo', attr: { src: feed.imageUrl } });
        } else {
            logoContainer.createDiv({ cls: 'rss-discover-card-initials', text: this.getInitials(feed.title) });
        }

        const titleAndUrl = titleGroup.createDiv();
        titleAndUrl.createDiv({ cls: "rss-discover-card-title", text: feed.title });

        const content = card.createDiv({ cls: "rss-discover-card-content" });

        if (feed.summary) {
            content.createDiv({ cls: 'rss-discover-card-summary', text: feed.summary });
        }

        // if (feed.domain.length > 0) {
        // const categories = content.createDiv({ cls: "rss-discover-card-categories" });
        // feed.domain.forEach(category => {
        //         const categoryEl = categories.createDiv({ cls: "rss-discover-card-category", text: category });
               
        //     });
        //  }
        

        // content.createDiv({ cls: "rss-discover-card-url", text: feed.url });

        const metaTopContainer = content.createDiv({ cls: 'rss-discover-card-meta-top' });
        if (feed.type) {
            const typeEl = metaTopContainer.createDiv({ cls: "rss-discover-card-type" });
            typeEl.textContent = `${feed.type}`;
        }
        if ((feed.type || feed.domain.length > 0) && feed.tags.length > 0) {
            metaTopContainer.createDiv({ text: '|', cls: 'rss-discover-card-pipe' });
        }

        
    

        if (feed.tags.length > 0) {
            const tags = metaTopContainer.createDiv({ cls: "rss-discover-card-tags" });
            feed.tags.forEach(tag => {
                const tagEl = tags.createDiv({ cls: "rss-discover-card-tag", text: tag });
                tagEl.style.setProperty('--tag-color', this.getTagColor(tag));
            });
        }
        

        
        
        

        const footer = card.createDiv({ cls: 'rss-discover-card-footer' });
        
        
        const leftSection = footer.createDiv({ cls: 'rss-discover-card-footer-left' });
        if (feed.rating !== undefined && feed.rating !== null) {
            this.renderStarRating(leftSection, feed.rating);
        } else {
            const ratingNA = leftSection.createEl('button', {
                cls: 'rss-discover-card-rating-button is-na',
                text: 'Rating N/A'
            });
            
        }

        
        const rightSection = footer.createDiv({ cls: 'rss-discover-card-footer-right' });
        
        
        const previewBtn = rightSection.createEl("button", { 
            text: "Preview", 
            cls: "rss-discover-card-preview-btn" 
        });
        previewBtn.addEventListener("click", () => {
            new FeedPreviewModal(this.app, feed).open();
        });

        const isAdded = this.plugin.settings.feeds.some((f: Feed) => f.url === feed.url);

        if (isAdded) {
            const addedBtn = rightSection.createEl("button", { text: "Added", cls: "" });
            addedBtn.disabled = true;
        } else {
            const addBtn = rightSection.createEl("button", { text: "Add Feed", cls: "" });
            addBtn.addEventListener("click", async () => {
                await this.addFeed(feed);
                addBtn.setText("Added");
                addBtn.disabled = true;
            });
        }
    }

    private async addFeed(feed: FeedMetadata): Promise<void> {
        try {
            await this.plugin.addFeed(feed.title, feed.url, "Uncategorized");
        } catch (error) {
            console.error('Error adding feed:', error);
            new Notice(`Failed to add feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private previewFeed(feed: FeedMetadata): void {
        window.open(feed.url, '_blank');
    }

    async onClose(): Promise<void> {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }

    private hasActiveFilters(): boolean {
        return this.filters.query !== "" ||
               this.filters.selectedTypes.length > 0 ||
               this.filters.selectedPaths.length > 0 ||
               this.filters.selectedTags.length > 0;
    }

    private renderSelectedFilters(header: HTMLElement): void {
        if (!this.hasActiveFilters()) return;
        
        const selectedFiltersContainer = header.createDiv({ cls: "rss-discover-selected-filters" });
        
        if (this.filters.query) {
            const searchFilter = selectedFiltersContainer.createDiv({ cls: "rss-discover-selected-filter" });
            setIcon(searchFilter, "search");
            searchFilter.appendChild(document.createTextNode(` "${this.filters.query}"`));
        }
        
        this.filters.selectedTypes.forEach(type => {
            const typeFilter = selectedFiltersContainer.createDiv({ cls: "rss-discover-selected-filter" });
            setIcon(typeFilter, "tag");
            typeFilter.appendChild(document.createTextNode(` ${type}`));
        });
        
        this.filters.selectedPaths.forEach(path => {
            const pathFilter = selectedFiltersContainer.createDiv({ cls: "rss-discover-selected-filter" });
            setIcon(pathFilter, "folder");
            const pathText = [path.domain, path.subdomain, path.area, path.topic].filter(Boolean).join(" > ");
            pathFilter.appendChild(document.createTextNode(` ${pathText}`));
        });
        
        this.filters.selectedTags.forEach(tag => {
            const tagFilter = selectedFiltersContainer.createDiv({ cls: "rss-discover-selected-filter" });
            setIcon(tagFilter, "hash");
            tagFilter.appendChild(document.createTextNode(` ${tag}`));
            tagFilter.style.setProperty('--tag-color', this.getTagColor(tag));
        });
    }

    private renderPagination(container: HTMLElement, currentPage: number, totalPages: number, pageSize: number, totalFeeds: number): void {
        const paginationContainer = container.createDiv({
            cls: "rss-dashboard-pagination",
        });

        
        const prevButton = paginationContainer.createEl('button', {
            cls: "rss-dashboard-pagination-btn prev",
            text: "<"
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
                paginationContainer.createEl('span', { text: '...', cls: 'rss-dashboard-pagination-ellipsis' });
            }
        }
        for (let i = startPage; i <= endPage; i++) {
            this.createPageButton(paginationContainer, i, currentPage);
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationContainer.createEl('span', { text: '...', cls: 'rss-dashboard-pagination-ellipsis' });
            }
            this.createPageButton(paginationContainer, totalPages, currentPage);
        }

        
        const nextButton = paginationContainer.createEl('button', {
            cls: "rss-dashboard-pagination-btn next",
            text: ">"
        });
        nextButton.disabled = currentPage === totalPages;
        nextButton.onclick = () => this.handlePageChange(currentPage + 1);

        
        const pageSizeDropdown = paginationContainer.createEl('select', { cls: 'rss-dashboard-page-size-dropdown' });
        const pageSizeOptions = [10, 20, 40, 50, 60, 80, 100];
        for (const size of pageSizeOptions) {
            const opt = pageSizeDropdown.createEl('option', { text: String(size), value: String(size) });
            if (size === pageSize) opt.selected = true;
        }
        pageSizeDropdown.onchange = (e) => {
            const size = Number((e.target as HTMLSelectElement).value);
            this.handlePageSizeChange(size);
        };

        
        const startIdx = (currentPage - 1) * pageSize + 1;
        const endIdx = Math.min(currentPage * pageSize, totalFeeds);
        const resultsInfo = paginationContainer.createEl('span', {
            cls: 'rss-dashboard-pagination-results',
            text: `Results: ${startIdx} - ${endIdx} of ${totalFeeds}`
        });
    }

    private handlePageChange(page: number): void {
        this.currentPage = page;
        const contentEl = this.containerEl.querySelector('.rss-discover-content') as HTMLElement;
        if (contentEl) {
            this.renderContent(contentEl);
        }
    }

    private handlePageSizeChange(pageSize: number): void {
        this.pageSize = pageSize;
        this.currentPage = 1;
        const contentEl = this.containerEl.querySelector('.rss-discover-content') as HTMLElement;
        if (contentEl) {
            this.renderContent(contentEl);
        }
    }

    private createPageButton(container: HTMLElement, page: number, currentPage: number) {
        const btn = container.createEl('button', {
            cls: 'rss-dashboard-pagination-btn' + (page === currentPage ? ' active' : ''),
            text: String(page)
        });
        btn.disabled = page === currentPage;
        btn.onclick = () => this.handlePageChange(page);
    }
} 
