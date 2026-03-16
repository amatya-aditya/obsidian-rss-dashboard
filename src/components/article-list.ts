import { App, Notice, Menu, MenuItem, setIcon, Setting } from "obsidian";
import { FeedItem, RssDashboardSettings, StatusFilters, Tag } from "../types/types";
import { formatDateWithRelative, ensureUtf8Meta, setCssProps } from "../utils/platform-utils";


const MAX_VISIBLE_TAGS = 6;

/** Strip HTML tags and collapse whitespace to produce a plain-text snippet. */
function stripHtmlToText(html: string, maxLength = 220): string {
    if (!html) return "";
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        let text = doc.body.textContent || "";
        text = text.replace(/\s+/g, " ").trim();
        if (text.length > maxLength) text = text.substring(0, maxLength) + "...";
        return text;
    } catch {
        return "";
    }
}

function formatCompactNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toString();
}

interface ArticleListCallbacks {
    onArticleClick: (article: FeedItem) => void;
    onToggleViewStyle: (style: "list" | "card") => void;
    onRefreshFeeds: () => void;
    onArticleUpdate: (article: FeedItem, updates: Partial<FeedItem>, shouldRerender?: boolean) => void;
    onArticleSave: (article: FeedItem) => void;
    onOpenSavedArticle?: (article: FeedItem) => void;
    onOpenInReaderView?: (article: FeedItem) => void;
    onToggleSidebar: () => void;
    onSortChange: (value: 'newest' | 'oldest') => void;
    onGroupChange: (value: 'none' | 'feed' | 'date' | 'folder') => void;
    onFilterChange: (value: { type: 'age' | 'read' | 'unread' | 'starred' | 'saved' | 'none'; value: unknown; }) => void;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onSearchChange?: (query: string) => void;
    onStatusFiltersChange?: (filters: StatusFilters, logic: 'AND' | 'OR') => void;
    onShowFilterStatusBarChange?: (show: boolean) => void;
    onBypassAllFiltersChange?: (bypass: boolean) => void;
    onHighlightsChange?: (enabled: boolean) => void;
    onCardColumnsChange?: (columns: number) => void;
    onCardSpacingChange?: (spacing: number) => void;
    onMarkAllRead?: () => void;
    onMarkAllUnread?: () => void;
}

export class ArticleList {
    private app: App;
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
    private filterPortal: HTMLElement | null = null;
    private filterTriggerButton: HTMLElement | null = null;
    private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
    private dropdownMenu: HTMLElement | null = null;
    private hamburgerButton: HTMLElement | null = null;

    constructor(
        app: App,
        container: HTMLElement,
        settings: RssDashboardSettings,
        title: string,
        articles: FeedItem[],
        selectedArticle: FeedItem | null,
        callbacks: ArticleListCallbacks,
        currentPage: number,
        totalPages: number,
        pageSize: number,
        totalArticles: number
    ) {
        this.app = app;
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
    }
    
    public destroy(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        this.closeFilterPortal();
        this.closeDropdownMenu();
        if (this.outsideClickHandler) {
            document.removeEventListener("mousedown", this.outsideClickHandler);
            this.outsideClickHandler = null;
        }
    }
    
    render(): void {
        
        const articlesList = this.container.querySelector('.rss-dashboard-articles-list');
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
    
    private renderHeader(): void {
        const articlesHeader = this.container.createDiv({
            cls: "rss-dashboard-articles-header",
        });

        // Left section: sidebar toggle + title
        const leftSection = articlesHeader.createDiv({
            cls: "rss-dashboard-header-left",
        });

        const sidebarToggleButton = leftSection.createDiv({
            cls: "rss-dashboard-sidebar-toggle",
            attr: { title: "Toggle sidebar" },
        });
        setIcon(sidebarToggleButton, this.settings.sidebarCollapsed ? "panel-left-open" : "panel-left-close");
        sidebarToggleButton.addEventListener("click", (e) => {
            e.stopPropagation();
            this.callbacks.onToggleSidebar();
        });

        leftSection.createDiv({
            cls: "rss-dashboard-articles-title",
            text: this.title,
        });

        // Right section: filter trigger + hamburger menu
        const rightSection = articlesHeader.createDiv({
            cls: "rss-dashboard-header-right",
        });

        // Filter trigger button
        const filterTrigger = rightSection.createDiv({
            cls: "rss-dashboard-filter-trigger",
            attr: { title: "Filters" },
        });
        setIcon(filterTrigger, "filter");
        this.filterTriggerButton = filterTrigger;

        // Active filter badge
        const activeFilterCount = this.getActiveFilterCount();
        if (activeFilterCount > 0) {
            filterTrigger.createDiv({
                cls: "rss-dashboard-filter-badge",
                text: String(activeFilterCount),
            });
        }

        filterTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.filterPortal) {
                this.closeFilterPortal();
            } else {
                this.openFilterPortal();
            }
        });

        // Hamburger menu container
        const hamburgerMenu = rightSection.createDiv({
            cls: "rss-dashboard-hamburger-menu",
        });

        const hamburgerBtn = hamburgerMenu.createDiv({
            cls: "rss-dashboard-hamburger-button",
            attr: { title: "Menu" },
        });
        setIcon(hamburgerBtn, "menu");
        this.hamburgerButton = hamburgerBtn;

        const dropdownMenu = hamburgerMenu.createDiv({
            cls: "rss-dashboard-dropdown-menu",
        });
        this.dropdownMenu = dropdownMenu;

        const dropdownControls = dropdownMenu.createDiv({
            cls: "rss-dashboard-dropdown-controls",
        });

        this.createControlsDropdown(dropdownControls);

        hamburgerBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.closeFilterPortal();
            dropdownMenu.classList.toggle("active");
            hamburgerBtn.classList.toggle("active");
        });

        // Shared outside click handler
        if (this.outsideClickHandler) {
            document.removeEventListener("mousedown", this.outsideClickHandler);
        }
        this.outsideClickHandler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!hamburgerMenu.contains(target)) {
                dropdownMenu.classList.remove("active");
                hamburgerBtn.classList.remove("active");
            }
            if (this.filterPortal && !this.filterPortal.contains(target) && !filterTrigger.contains(target)) {
                this.closeFilterPortal();
            }
        };
        document.addEventListener("mousedown", this.outsideClickHandler);
    }

    private getActiveFilterCount(): number {
        let count = 0;
        const sf = this.settings.statusFilters;
        if (sf) {
            if (sf.unread) count++;
            if (sf.read) count++;
            if (sf.saved) count++;
            if (sf.starred) count++;
            if (sf.podcast) count++;
            if (sf.video) count++;
            if (sf.tagged) count++;
        }
        if (this.settings.bypassAllFilters) count++;
        if (this.settings.highlights?.enabled) count++;
        if (!this.settings.showFilterStatusBar) count++;
        return count;
    }

    private closeFilterPortal(): void {
        if (this.filterPortal) {
            this.filterPortal.remove();
            this.filterPortal = null;
        }
    }

    private closeDropdownMenu(): void {
        if (this.dropdownMenu) {
            this.dropdownMenu.classList.remove("active");
        }
        if (this.hamburgerButton) {
            this.hamburgerButton.classList.remove("active");
        }
    }

    private openFilterPortal(): void {
        this.closeFilterPortal();
        this.closeDropdownMenu();

        const portal = document.body.createDiv({
            cls: "rss-dashboard-filter-menu-portal",
        });
        this.filterPortal = portal;

        // Position below the filter trigger button using CSS custom properties
        if (this.filterTriggerButton) {
            const rect = this.filterTriggerButton.getBoundingClientRect();
            setCssProps(portal, {
                '--filter-portal-top': `${rect.bottom + 8}px`,
                '--filter-portal-right': `${window.innerWidth - rect.right}px`,
            });
        }

        // Local state for pending changes (applied on Apply)
        const pendingFilters: StatusFilters = {
            unread: this.settings.statusFilters?.unread ?? false,
            read: this.settings.statusFilters?.read ?? false,
            saved: this.settings.statusFilters?.saved ?? false,
            starred: this.settings.statusFilters?.starred ?? false,
            podcast: this.settings.statusFilters?.podcast ?? false,
            video: this.settings.statusFilters?.video ?? false,
            tagged: this.settings.statusFilters?.tagged ?? false,
        };
        let pendingLogic: 'AND' | 'OR' = this.settings.filterLogic ?? 'OR';
        let pendingShowStatusBar = this.settings.showFilterStatusBar ?? true;
        let pendingBypass = this.settings.bypassAllFilters ?? false;
        let pendingHighlights = this.settings.highlights?.enabled ?? false;

        // --- AND/OR logic toggle ---
        const logicRow = portal.createDiv({ cls: "rss-filter-portal-row rss-filter-logic-row" });
        const andBtn = logicRow.createEl("button", {
            cls: "rss-filter-logic-btn" + (pendingLogic === 'AND' ? " active" : ""),
            text: "AND",
        });
        const orBtn = logicRow.createEl("button", {
            cls: "rss-filter-logic-btn" + (pendingLogic === 'OR' ? " active" : ""),
            text: "OR",
        });
        andBtn.addEventListener("click", () => {
            pendingLogic = 'AND';
            andBtn.classList.add("active");
            orBtn.classList.remove("active");
        });
        orBtn.addEventListener("click", () => {
            pendingLogic = 'OR';
            orBtn.classList.add("active");
            andBtn.classList.remove("active");
        });

        portal.createDiv({ cls: "rss-filter-portal-separator" });

        // --- Status filter checkboxes ---
        const filterItems: { key: keyof StatusFilters; label: string; icon: string }[] = [
            { key: "unread", label: "Unread", icon: "circle" },
            { key: "read", label: "Read", icon: "check-circle" },
            { key: "saved", label: "Saved", icon: "save" },
            { key: "starred", label: "Starred", icon: "star" },
            { key: "podcast", label: "Podcast", icon: "mic" },
            { key: "video", label: "Videos", icon: "play" },
            { key: "tagged", label: "Tagged", icon: "tag" },
        ];

        for (const item of filterItems) {
            const row = portal.createDiv({ cls: "rss-filter-portal-row rss-filter-checkbox-row" });
            const iconEl = row.createDiv({ cls: "rss-filter-icon" });
            setIcon(iconEl, item.icon);
            const checkbox = row.createEl("input", {
                attr: { type: "checkbox" },
                cls: "rss-filter-checkbox",
            });
            checkbox.checked = pendingFilters[item.key];
            row.createDiv({ cls: "rss-filter-label", text: item.label });
            checkbox.addEventListener("change", () => {
                pendingFilters[item.key] = checkbox.checked;
            });
            row.addEventListener("click", (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    pendingFilters[item.key] = checkbox.checked;
                }
            });
        }

        portal.createDiv({ cls: "rss-filter-portal-separator" });

        // --- Show Status Bar toggle ---
        const statusBarRow = portal.createDiv({ cls: "rss-filter-portal-row rss-filter-checkbox-row" });
        const statusBarIcon = statusBarRow.createDiv({ cls: "rss-filter-icon" });
        setIcon(statusBarIcon, "info");
        const statusBarCb = statusBarRow.createEl("input", {
            attr: { type: "checkbox" },
            cls: "rss-filter-checkbox",
        });
        statusBarCb.checked = pendingShowStatusBar;
        statusBarRow.createDiv({ cls: "rss-filter-label", text: "Show Status Bar" });
        statusBarCb.addEventListener("change", () => { pendingShowStatusBar = statusBarCb.checked; });
        statusBarRow.addEventListener("click", (e) => {
            if (e.target !== statusBarCb) {
                statusBarCb.checked = !statusBarCb.checked;
                pendingShowStatusBar = statusBarCb.checked;
            }
        });

        portal.createDiv({ cls: "rss-filter-portal-separator" });

        // --- Bypass All Filters toggle ---
        const bypassRow = portal.createDiv({ cls: "rss-filter-portal-row rss-filter-checkbox-row" });
        const bypassIcon = bypassRow.createDiv({ cls: "rss-filter-icon" });
        setIcon(bypassIcon, "power");
        const bypassCb = bypassRow.createEl("input", {
            attr: { type: "checkbox" },
            cls: "rss-filter-checkbox",
        });
        bypassCb.checked = pendingBypass;
        bypassRow.createDiv({ cls: "rss-filter-label", text: "Bypass All Filters" });
        bypassCb.addEventListener("change", () => { pendingBypass = bypassCb.checked; });
        bypassRow.addEventListener("click", (e) => {
            if (e.target !== bypassCb) {
                bypassCb.checked = !bypassCb.checked;
                pendingBypass = bypassCb.checked;
            }
        });

        portal.createDiv({ cls: "rss-filter-portal-separator" });

        // --- Show Highlights toggle ---
        const highlightsRow = portal.createDiv({ cls: "rss-filter-portal-row rss-filter-checkbox-row" });
        const highlightsIcon = highlightsRow.createDiv({ cls: "rss-filter-icon" });
        setIcon(highlightsIcon, "highlighter");
        const highlightsCb = highlightsRow.createEl("input", {
            attr: { type: "checkbox" },
            cls: "rss-filter-checkbox",
        });
        highlightsCb.checked = pendingHighlights;
        highlightsRow.createDiv({ cls: "rss-filter-label", text: "Show Highlights" });
        highlightsCb.addEventListener("change", () => { pendingHighlights = highlightsCb.checked; });
        highlightsRow.addEventListener("click", (e) => {
            if (e.target !== highlightsCb) {
                highlightsCb.checked = !highlightsCb.checked;
                pendingHighlights = highlightsCb.checked;
            }
        });

        portal.createDiv({ cls: "rss-filter-portal-separator" });

        // --- Apply button ---
        const applyRow = portal.createDiv({ cls: "rss-filter-portal-row rss-filter-apply-row" });
        const applyBtn = applyRow.createEl("button", {
            cls: "rss-filter-apply-btn",
            text: "Apply",
        });
        applyBtn.addEventListener("click", () => {
            if (this.callbacks.onStatusFiltersChange) {
                this.callbacks.onStatusFiltersChange(pendingFilters, pendingLogic);
            }
            if (this.callbacks.onShowFilterStatusBarChange) {
                this.callbacks.onShowFilterStatusBarChange(pendingShowStatusBar);
            }
            if (this.callbacks.onBypassAllFiltersChange) {
                this.callbacks.onBypassAllFiltersChange(pendingBypass);
            }
            if (this.callbacks.onHighlightsChange) {
                this.callbacks.onHighlightsChange(pendingHighlights);
            }
            this.closeFilterPortal();
        });
    }

    private createControlsDropdown(container: HTMLElement): void {
        const controls = container.createDiv({
            cls: "rss-dashboard-article-controls",
        });

        // --- Search input ---
        const searchWrapper = controls.createDiv({ cls: "rss-dropdown-search-wrapper" });
        const searchIconEl = searchWrapper.createDiv({ cls: "rss-dropdown-search-icon" });
        setIcon(searchIconEl, "search");
        const searchInput = searchWrapper.createEl("input", {
            cls: "rss-dropdown-search-input",
            attr: { type: "text", placeholder: "Search articles..." },
        });
        const clearBtn = searchWrapper.createDiv({ cls: "rss-dropdown-search-clear is-hidden" });
        setIcon(clearBtn, "x");
        searchInput.addEventListener("input", () => {
            clearBtn.classList.toggle("is-hidden", !searchInput.value);
            if (this.callbacks.onSearchChange) {
                this.callbacks.onSearchChange(searchInput.value);
            }
        });
        clearBtn.addEventListener("click", () => {
            searchInput.value = "";
            clearBtn.classList.add("is-hidden");
            if (this.callbacks.onSearchChange) {
                this.callbacks.onSearchChange("");
            }
        });

        // --- Age select ---
        const ageRow = controls.createDiv({ cls: "rss-dropdown-control-row" });
        const ageIcon = ageRow.createDiv({ cls: "rss-dropdown-control-icon" });
        setIcon(ageIcon, "history");
        const ageSelect = ageRow.createEl("select", { cls: "rss-dropdown-select" });
        const ageOptions: [string, number][] = [
            ["All", 0],
            ["1 hour", 3600000],
            ["2 hours", 7200000],
            ["4 hours", 14400000],
            ["8 hours", 28800000],
            ["24 hours", 86400000],
            ["48 hours", 172800000],
            ["3 days", 259200000],
            ["1 week", 604800000],
            ["2 weeks", 1209600000],
            ["1 month", 2592000000],
            ["2 months", 5184000000],
            ["6 months", 15552000000],
            ["1 year", 31536000000],
        ];
        for (const [text, value] of ageOptions) {
            ageSelect.createEl("option", { text, value: String(value) });
        }
        const filterValue = typeof this.settings.articleFilter.value === 'number' ? this.settings.articleFilter.value : 0;
        ageSelect.value = String(filterValue);
        ageSelect.addEventListener("change", () => {
            const value = Number(ageSelect.value);
            this.callbacks.onFilterChange({
                type: value === 0 ? 'none' : 'age',
                value: value,
            });
        });

        // --- Sort select ---
        const sortRow = controls.createDiv({ cls: "rss-dropdown-control-row" });
        const sortIcon = sortRow.createDiv({ cls: "rss-dropdown-control-icon" });
        setIcon(sortIcon, "arrow-up-down");
        const sortSelect = sortRow.createEl("select", { cls: "rss-dropdown-select" });
        sortSelect.createEl("option", { text: "Newest", value: "newest" });
        sortSelect.createEl("option", { text: "Oldest", value: "oldest" });
        sortSelect.value = this.settings.articleSort;
        sortSelect.addEventListener("change", () => {
            this.callbacks.onSortChange(sortSelect.value as 'newest' | 'oldest');
        });

        // --- Grouping select ---
        const groupRow = controls.createDiv({ cls: "rss-dropdown-control-row" });
        const groupIcon = groupRow.createDiv({ cls: "rss-dropdown-control-icon" });
        setIcon(groupIcon, "folders");
        const groupSelect = groupRow.createEl("select", { cls: "rss-dropdown-select" });
        groupSelect.createEl("option", { text: "None", value: "none" });
        groupSelect.createEl("option", { text: "Feed", value: "feed" });
        groupSelect.createEl("option", { text: "Date", value: "date" });
        groupSelect.createEl("option", { text: "Folder", value: "folder" });
        groupSelect.value = this.settings.articleGroupBy;
        groupSelect.addEventListener("change", () => {
            this.callbacks.onGroupChange(groupSelect.value as 'none' | 'feed' | 'date' | 'folder');
        });

        // --- View toggle (List / Card) ---
        const viewToggle = controls.createDiv({ cls: "rss-dashboard-view-toggle" });
        const listBtn = viewToggle.createEl("button", {
            cls: "rss-dropdown-view-btn" + (this.settings.viewStyle === "list" ? " active" : ""),
        });
        const listBtnIcon = listBtn.createSpan({ cls: "rss-dropdown-view-btn-icon" });
        setIcon(listBtnIcon, "list");
        listBtn.createSpan({ text: "List" });
        listBtn.addEventListener("click", () => this.callbacks.onToggleViewStyle("list"));

        const cardBtn = viewToggle.createEl("button", {
            cls: "rss-dropdown-view-btn" + (this.settings.viewStyle === "card" ? " active" : ""),
        });
        const cardBtnIcon = cardBtn.createSpan({ cls: "rss-dropdown-view-btn-icon" });
        setIcon(cardBtnIcon, "layout-grid");
        cardBtn.createSpan({ text: "Card" });
        cardBtn.addEventListener("click", () => this.callbacks.onToggleViewStyle("card"));

        // --- Refresh button ---
        const refreshBtn = controls.createEl("button", {
            cls: "rss-dashboard-refresh-button rss-dropdown-refresh-btn",
        });
        const refreshIcon = refreshBtn.createSpan({ cls: "rss-dropdown-view-btn-icon" });
        setIcon(refreshIcon, "refresh-cw");
        refreshBtn.createSpan({ text: "Refresh" });
        this.refreshButton = refreshBtn;
        refreshBtn.addEventListener("click", () => this.callbacks.onRefreshFeeds());

        // --- Cards per row (only in card view) ---
        if (this.settings.viewStyle === "card") {
            const colsRow = controls.createDiv({ cls: "rss-dropdown-control-row" });
            colsRow.createDiv({ cls: "rss-dropdown-control-label", text: "Cards/row" });
            const colsBtnGroup = colsRow.createDiv({ cls: "rss-dropdown-cols-group" });
            const colOptions = [0, 1, 2, 3, 4, 5, 6];
            const colLabels = ["Auto", "1", "2", "3", "4", "5", "6"];
            const currentCols = this.settings.display?.cardColumnsPerRow ?? 0;
            for (let i = 0; i < colOptions.length; i++) {
                const btn = colsBtnGroup.createEl("button", {
                    cls: "rss-dropdown-col-btn" + (colOptions[i] === currentCols ? " active" : ""),
                    text: colLabels[i],
                });
                btn.addEventListener("click", () => {
                    colsBtnGroup.querySelectorAll(".rss-dropdown-col-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    if (this.callbacks.onCardColumnsChange) {
                        this.callbacks.onCardColumnsChange(colOptions[i]);
                    }
                });
            }

            // --- Card spacing slider ---
            const spacingRow = controls.createDiv({ cls: "rss-dropdown-control-row rss-dropdown-spacing-row" });
            spacingRow.createDiv({ cls: "rss-dropdown-control-label", text: "Card spacing" });
            const spacingValue = spacingRow.createDiv({
                cls: "rss-dropdown-spacing-value",
                text: `${this.settings.display?.cardSpacing ?? 16}px`,
            });
            const spacingSlider = spacingRow.createEl("input", {
                cls: "rss-dropdown-spacing-slider",
                attr: {
                    type: "range",
                    min: "0",
                    max: "40",
                    value: String(this.settings.display?.cardSpacing ?? 16),
                },
            });
            spacingSlider.addEventListener("input", () => {
                spacingValue.textContent = `${spacingSlider.value}px`;
                if (this.callbacks.onCardSpacingChange) {
                    this.callbacks.onCardSpacingChange(Number(spacingSlider.value));
                }
            });
        }

        // --- Mark all section ---
        const markRow = controls.createDiv({ cls: "rss-dropdown-mark-row" });
        markRow.createDiv({ cls: "rss-dropdown-control-label", text: "Mark all:" });
        const markBtns = markRow.createDiv({ cls: "rss-dropdown-mark-btns" });

        const markReadBtn = markBtns.createEl("button", { cls: "rss-dropdown-mark-btn" });
        const markReadIcon = markReadBtn.createSpan({ cls: "rss-dropdown-view-btn-icon" });
        setIcon(markReadIcon, "check-circle");
        markReadBtn.createSpan({ text: "Read" });
        markReadBtn.addEventListener("click", () => {
            if (this.callbacks.onMarkAllRead) this.callbacks.onMarkAllRead();
        });

        const markUnreadBtn = markBtns.createEl("button", { cls: "rss-dropdown-mark-btn" });
        const markUnreadIcon = markUnreadBtn.createSpan({ cls: "rss-dropdown-view-btn-icon" });
        setIcon(markUnreadIcon, "circle");
        markUnreadBtn.createSpan({ text: "Unread" });
        markUnreadBtn.addEventListener("click", () => {
            if (this.callbacks.onMarkAllUnread) this.callbacks.onMarkAllUnread();
        });
    }
    
    /* old createControls removed - replaced by createControlsDropdown + openFilterPortal */
    
    private renderArticles(): void {
        const articlesList = this.container.createDiv({
            cls: `rss-dashboard-articles-list rss-dashboard-${this.settings.viewStyle}-view`,
        });

        // Apply card view settings as inline styles
        if (this.settings.viewStyle === "card") {
            const spacing = this.settings.display?.cardSpacing ?? 16;
            articlesList.style.gap = `${spacing}px`;
            const cols = this.settings.display?.cardColumnsPerRow ?? 0;
            if (cols > 0) {
                articlesList.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            }
        }



        if (this.articles.length === 0) {
            const emptyState = articlesList.createDiv({
                cls: "rss-dashboard-empty-state",
            });
            const iconDiv = emptyState.createDiv();
            setIcon(iconDiv, "rss");
            iconDiv.addClass("rss-dashboard-empty-state-icon");
            new Setting(emptyState).setName("No articles found").setHeading();
            emptyState.createEl("p", { text: "Try refreshing your feeds or adding new ones." });
            return;
        }

  
        const prevScroll = this.container.scrollTop;

        if (this.settings.articleGroupBy === 'none') {
            if (this.settings.viewStyle === "list") {
                this.renderListView(articlesList, this.articles);
            } else {
                this.renderCardView(articlesList, this.articles);
            }
        } else {
            const groupedArticles = this.groupArticles(this.articles, this.settings.articleGroupBy);
            for (const groupName in groupedArticles) {
                const groupContainer = articlesList.createDiv({ cls: 'rss-dashboard-article-group' });
                new Setting(groupContainer).setName(groupName).setHeading();
                const groupArticles = groupedArticles[groupName];
                if (this.settings.viewStyle === "list") {
                    this.renderListView(groupContainer, groupArticles);
                } else {
                    this.renderCardView(groupContainer, groupArticles);
                }
            }
        }

        
        const paginationWrapper = this.container.createDiv({ cls: 'rss-dashboard-pagination-wrapper' });
        this.renderPagination(paginationWrapper, this.currentPage, this.totalPages, this.pageSize, this.totalArticles);

    
        if (this.container) this.container.scrollTop = prevScroll;
    }

    private groupArticles(articles: FeedItem[], groupBy: 'feed' | 'date' | 'folder' | 'none'): Record<string, FeedItem[]> {
        if (groupBy === 'none') return { 'All articles': articles };

        return articles.reduce((acc, article) => {
            let key: string;
            switch (groupBy) {
                case 'feed':
                    key = article.feedTitle || 'Uncategorized';
                    break;
                case 'date':
                    key = formatDateWithRelative(article.pubDate).text;
                    break;

                case 'folder':
                    key = this.getFeedFolder(article.feedUrl) || 'Uncategorized';
                    break;
                default:
                    key = 'All articles';
            }

            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(article);
            return acc;
        }, {} as Record<string, FeedItem[]>);
    }
    
    private getFeedFolder(feedUrl: string): string | undefined {
        const feed = this.settings.feeds.find(f => f.url === feedUrl);
        return feed?.folder;
    }

    private renderListView(container: HTMLElement, articles: FeedItem[]): void {
        for (const article of articles) {
            const articleEl = container.createDiv({
                cls: "rss-dashboard-article-item" +
                    (article.read ? " read" : " unread") +
                    (article.starred ? " starred" : " unstarred") +
                    (article.saved ? " saved" : "") +
                    (article.mediaType === 'video' ? " video" : "") +
                    (article.mediaType === 'podcast' ? " podcast" : ""),
                attr: { id: `article-${article.guid}` }
            });

            const contentEl = articleEl.createDiv('rss-dashboard-article-content');

            
            const firstRow = contentEl.createDiv('rss-dashboard-list-row-1');

            
            firstRow.createDiv({
                cls: "rss-dashboard-article-title rss-dashboard-list-title",
                text: article.title
            });

            
            const metaEl = firstRow.createDiv('rss-dashboard-article-meta');
            metaEl.createSpan({ text: '|' });
            metaEl.createSpan('rss-dashboard-article-source').setText(article.feedTitle);
            metaEl.createSpan({ text: '|' });
            const dateInfo = formatDateWithRelative(article.pubDate);
            const dateEl = metaEl.createSpan('rss-dashboard-article-date');
            dateEl.textContent = dateInfo.text;
            dateEl.setAttribute('title', dateInfo.title);

            
            const secondRow = contentEl.createDiv('rss-dashboard-list-row-2');

            
            const actionToolbar = secondRow.createDiv('rss-dashboard-action-toolbar rss-dashboard-list-toolbar');

            
            const saveButton = actionToolbar.createDiv({
                cls: `rss-dashboard-save-toggle ${article.saved ? "saved" : ""}`,
                attr: { 
                    title: article.saved 
                        ? "Click to open saved article" 
                        : this.settings.articleSaving.saveFullContent 
                            ? "Save full article content to notes" 
                            : "Save article summary to notes"
                }
            });
            setIcon(saveButton, "save");
            if (!saveButton.querySelector('svg')) {
                saveButton.textContent = '💾';
            }
            saveButton.addEventListener("click", (e) => {
                e.stopPropagation();
                if (article.saved) {
                    if (this.callbacks.onOpenSavedArticle) {
                        this.callbacks.onOpenSavedArticle(article);
                    } else {
                        new Notice("Article already saved. Look in your notes.");
                    }
                } else {
                    if (this.callbacks.onArticleSave) {
                        if (saveButton.classList.contains('saving')) {
                            return;
                        }
                        
                        saveButton.classList.add('saving');
                        saveButton.setAttribute('title', 'Saving article...');
                        
                        this.callbacks.onArticleSave(article);
                        saveButton.classList.add("saved");
                        setIcon(saveButton, "save");
                        if (!saveButton.querySelector('svg')) {
                            saveButton.textContent = '💾';
                        }
                        saveButton.classList.remove('saving');
                        saveButton.setAttribute('title', 'Click to open saved article');
                    }
                }
            });

            
            const readToggle = actionToolbar.createDiv({
                cls: `rss-dashboard-read-toggle ${article.read ? "read" : "unread"}`,
            });
            setIcon(readToggle, article.read ? "check-circle" : "circle");
            readToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.callbacks.onArticleUpdate(article, { read: !article.read }, false);
                readToggle.classList.toggle("read", !readToggle.classList.contains("read"));
                readToggle.classList.toggle("unread", !readToggle.classList.contains("unread"));
                setIcon(readToggle, article.read ? "check-circle" : "circle");
            });

            
            const starToggle = actionToolbar.createDiv({
                cls: `rss-dashboard-star-toggle ${article.starred ? "starred" : "unstarred"}`,
            });
            const starIcon = starToggle.createSpan({
                cls: 'rss-dashboard-star-icon'
            });
            starToggle.appendChild(starIcon);
            setIcon(starIcon, article.starred ? "star" : "star-off");
            if (!starIcon.querySelector('svg')) {
                starIcon.textContent = article.starred ? '★' : '☆';
            }
            starToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.callbacks.onArticleUpdate(article, { starred: !article.starred }, false);
                starToggle.classList.toggle("starred", !starToggle.classList.contains("starred"));
                starToggle.classList.toggle("unstarred", !starToggle.classList.contains("unstarred"));
                const iconEl = starToggle.querySelector('.rss-dashboard-star-icon');
                if (iconEl) {
                    setIcon(iconEl as HTMLElement, article.starred ? "star" : "star-off");
                    if (!iconEl.querySelector('svg')) {
                        iconEl.textContent = article.starred ? '★' : '☆';
                    }
                }
            });

            
            const tagsDropdown = actionToolbar.createDiv({
                cls: "rss-dashboard-tags-dropdown",
            });
            const tagsToggle = tagsDropdown.createDiv({
                cls: "rss-dashboard-tags-toggle",
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
                    
                    
                    const index = this.articles.findIndex(a => a.guid === article.guid);
                    if (index !== -1) {
                        this.articles[index] = { ...article };
                    }
                    
                    
                    
                    let articleEl = this.container.querySelector(`[id="article-${article.guid}"]`) as HTMLElement;
                    
                    
                    if (!articleEl) {
                        articleEl = this.container.closest('.rss-dashboard-container')?.querySelector(`[id="article-${article.guid}"]`) as HTMLElement;
                    }
                    
                    
                    if (!articleEl) {
                        articleEl = document.getElementById(`article-${article.guid}`) as HTMLElement;
                    }
                    
                    if (articleEl) {
                        
                        articleEl.classList.add('rss-dashboard-tag-change-feedback');
                        
                        window.setTimeout(() => {
                            articleEl.classList.remove('rss-dashboard-tag-change-feedback');
                        }, 200);
                        
                        let tagsContainer = articleEl.querySelector('.rss-dashboard-article-tags');
                        if (!tagsContainer) {
                            const cardContent = articleEl.querySelector('.rss-dashboard-card-content') || articleEl;
                            const actionToolbar = cardContent.querySelector('.rss-dashboard-action-toolbar');
                            if (actionToolbar) {
                                tagsContainer = (cardContent as HTMLElement).createDiv({
                                    cls: 'rss-dashboard-article-tags'
                                });
                                cardContent.insertBefore(tagsContainer, actionToolbar);
                            }
                        } else {
                            
                            while (tagsContainer.firstChild) {
                                tagsContainer.removeChild(tagsContainer.firstChild);
                            }
                        }
                        
                        if (tagsContainer && article.tags && article.tags.length > 0) {
                            const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
                            tagsToShow.forEach(tag => {
                                if (tagsContainer) {
                                    const tagEl = (tagsContainer as HTMLElement).createDiv({
                                        cls: 'rss-dashboard-article-tag',
                                        text: tag.name
                                    });
                                    tagEl.style.setProperty('--tag-color', tag.color || 'var(--interactive-accent)');
                                }
                            });
                            
                            if (article.tags.length > MAX_VISIBLE_TAGS && tagsContainer) {
                                (tagsContainer as HTMLElement).createDiv({
                                    cls: 'rss-dashboard-tag-overflow',
                                    text: `+${article.tags.length - MAX_VISIBLE_TAGS}`,
                                    attr: {
                                        title: article.tags.slice(MAX_VISIBLE_TAGS).map(t => t.name).join(', ')
                                    }
                                });
                            }
                        } else if (tagsContainer) {
                            
                            while (tagsContainer.firstChild) {
                                tagsContainer.removeChild(tagsContainer.firstChild);
                            }
                        }
                        
                        // Force reflow
                        void articleEl.offsetHeight;
                    } else {
                        
                        
                        const tempIndicator = document.body.createDiv({
                            cls: 'rss-dashboard-tag-change-notification',
                            text: `Tag "${tag.name}" ${checked ? 'added' : 'removed'}`
                        });
                        
                        window.setTimeout(() => {
                            if (tempIndicator.parentNode) {
                                tempIndicator.parentNode.removeChild(tempIndicator);
                            }
                        }, 1500);
                    }
                });
            });

            
            let tagsEl: HTMLElement | null = null;
            
            tagsEl = secondRow.createDiv('rss-dashboard-article-tags');
            if (article.tags && article.tags.length > 0) {
                article.tags.forEach(tag => {
                    if (tagsEl) {
                        const tagEl = tagsEl.createDiv({
                            cls: 'rss-dashboard-article-tag',
                            text: tag.name,
                        });
                        tagEl.style.setProperty('--tag-color', tag.color);
                    }
                });
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
                cls: "rss-dashboard-article-card" +
                    (article === this.selectedArticle ? " active" : "") +
                    (article.read ? " read" : " unread") +
                    (article.saved ? " saved" : "") +
                    (article.mediaType === 'video' ? " rss-dashboard-youtube-article" : "") +
                    (article.mediaType === 'podcast' ? " rss-dashboard-podcast-article" : ""),
                attr: { id: `article-${article.guid}` }
            });

            const cardContent = card.createDiv({
                cls: "rss-dashboard-card-content",
            });

            
            cardContent.createDiv({
                cls: "rss-dashboard-article-title",
                text: article.title,
            });

            
            const articleMeta = cardContent.createDiv({
                cls: "rss-dashboard-article-meta",
            });
            
            const feedContainer = articleMeta.createDiv({
                cls: "rss-dashboard-article-feed-container",
            });
            
            if (article.mediaType === 'video') {
                setIcon(feedContainer, "video");
            } else if (article.mediaType === 'podcast') {
                setIcon(feedContainer, "podcast");
            }
            feedContainer.createDiv({
                cls: "rss-dashboard-article-feed",
                text: article.feedTitle,
            });

            if (article.mediaType === 'video' && (article.viewCount || article.likeCount)) {
                const statsContainer = articleMeta.createDiv({
                    cls: "rss-dashboard-video-stats",
                });
                if (article.viewCount) {
                    const viewEl = statsContainer.createSpan({ cls: "rss-dashboard-video-stat" });
                    setIcon(viewEl, "eye");
                    viewEl.createSpan({ text: formatCompactNumber(article.viewCount) });
                }
                if (article.likeCount) {
                    const likeEl = statsContainer.createSpan({ cls: "rss-dashboard-video-stat" });
                    setIcon(likeEl, "thumbs-up");
                    likeEl.createSpan({ text: formatCompactNumber(article.likeCount) });
                }
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
            // Fallback: per-feed default cover image, then global fallback
            if (!coverImgSrc) {
                const feed = this.settings.feeds.find(f => f.url === article.feedUrl);
                let vaultPath = "";
                if (feed?.defaultCoverImage) {
                    vaultPath = feed.defaultCoverImage;
                } else if (this.settings.display?.globalFallbackCoverImage) {
                    vaultPath = this.settings.display.globalFallbackCoverImage;
                }
                if (vaultPath) {
                    coverImgSrc = this.app.vault.adapter.getResourcePath(vaultPath);
                    console.debug('[RSS] Default cover image fallback:', { vaultPath, coverImgSrc, feedUrl: article.feedUrl, defaultCoverImage: feed?.defaultCoverImage });
                }
            }

            if (coverImgSrc) {
                
                const coverContainer = cardContent.createDiv({
                    cls: "rss-dashboard-cover-container" + (article.summary ? " has-summary" : ""),
                });
                const coverImg = coverContainer.createEl("img", {
                    cls: "rss-dashboard-cover-image",
                    attr: {
                        src: coverImgSrc,
                        alt: article.title,
                        loading: "lazy",
                        decoding: "async",
                        sizes: "(max-width: 600px) 100vw, 400px",
                    },
                });
                coverImg.onerror = () => {
                    // For YouTube thumbnails, try fallback quality levels before giving up
                    const ytMatch = coverImgSrc?.match(/img\.youtube\.com\/vi\/([^/]+)\/([^.]+)\.jpg/);
                    if (ytMatch) {
                        const videoId = ytMatch[1];
                        const current = ytMatch[2];
                        const fallbacks = ['hqdefault', 'mqdefault', 'sddefault', 'default'];
                        const nextIdx = fallbacks.indexOf(current) + 1;
                        if (nextIdx > 0 && nextIdx < fallbacks.length) {
                            coverImg.src = `https://img.youtube.com/vi/${videoId}/${fallbacks[nextIdx]}.jpg`;
                            return;
                        }
                    }
                    // Replace failed image with summary text if available
                    const errSummary = article.summary || stripHtmlToText(article.description || article.content || "");
                    if (errSummary) {
                        coverContainer.empty();
                        coverContainer.removeClass("rss-dashboard-cover-container");
                        coverContainer.addClass("rss-dashboard-cover-summary-only");
                        coverContainer.textContent = errSummary;
                    } else {
                        coverContainer.remove();
                    }
                };

                const overlaySummary = article.summary || stripHtmlToText(article.description || article.content || "");
                if (overlaySummary) {
                    const summaryOverlay = coverContainer.createDiv({
                        cls: "rss-dashboard-summary-overlay",
                    });
                    summaryOverlay.textContent = overlaySummary;
                }
            } else {
                const fallbackSummary = article.summary || stripHtmlToText(article.description || article.content || "");
                if (fallbackSummary) {
                    const summaryOnlyContainer = cardContent.createDiv({
                        cls: "rss-dashboard-cover-summary-only",
                    });
                    summaryOnlyContainer.textContent = fallbackSummary;
                }
            }

            
            if (article.tags && article.tags.length > 0) {
                const tagsContainer = cardContent.createDiv({
                    cls: "rss-dashboard-article-tags",
                });
                const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
                tagsToShow.forEach(tag => {
                    const tagEl = tagsContainer.createDiv({
                        cls: "rss-dashboard-article-tag",
                        text: tag.name,
                    });
                    tagEl.style.setProperty('--tag-color', tag.color);
                });
                if (article.tags.length > MAX_VISIBLE_TAGS) {
                    const overflowTag = tagsContainer.createDiv({
                        cls: "rss-dashboard-tag-overflow",
                        text: `+${article.tags.length - MAX_VISIBLE_TAGS}`,
                    });
                    overflowTag.title = article.tags.slice(MAX_VISIBLE_TAGS).map(t => t.name).join(", ");
                }
            }

            
            const actionToolbar = cardContent.createDiv({
                cls: "rss-dashboard-action-toolbar",
            });
            
            const saveButton = actionToolbar.createDiv({
                cls: `rss-dashboard-save-toggle ${article.saved ? "saved" : ""}`,
                attr: { 
                    title: article.saved 
                        ? "Click to open saved article" 
                        : this.settings.articleSaving.saveFullContent 
                            ? "Save full article content to notes" 
                            : "Save article summary to notes"
                }
            });
            setIcon(saveButton, "save");
            if (!saveButton.querySelector('svg')) {
                saveButton.textContent = '💾';
            }
            saveButton.addEventListener("click", (e) => {
                e.stopPropagation();
                if (article.saved) {
                    if (this.callbacks.onOpenSavedArticle) {
                        this.callbacks.onOpenSavedArticle(article);
                    } else {
                        new Notice("Article already saved. Look in your notes.");
                    }
                } else {
                    if (this.callbacks.onArticleSave) {
                        if (saveButton.classList.contains('saving')) {
                            return;
                        }
                        
                        saveButton.classList.add('saving');
                        saveButton.setAttribute('title', 'Saving article...');
                        
                        this.callbacks.onArticleSave(article);
                        saveButton.classList.add("saved");
                        setIcon(saveButton, "save");
                        if (!saveButton.querySelector('svg')) {
                            saveButton.textContent = '💾';
                        }
                        saveButton.classList.remove('saving');
                        saveButton.setAttribute('title', 'Click to open saved article');
                    }
                }
            });
            
            const readToggle = actionToolbar.createDiv({
                cls: `rss-dashboard-read-toggle ${article.read ? "read" : "unread"}`,
            });
            setIcon(readToggle, article.read ? "check-circle" : "circle");
            readToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.callbacks.onArticleUpdate(article, { read: !article.read }, false);
                readToggle.classList.toggle("read", !readToggle.classList.contains("read"));
                readToggle.classList.toggle("unread", !readToggle.classList.contains("unread"));
                setIcon(readToggle, article.read ? "check-circle" : "circle");
            });
            
            const starToggle = actionToolbar.createDiv({
                cls: `rss-dashboard-star-toggle ${article.starred ? "starred" : "unstarred"}`,
            });
            const starIcon = starToggle.createSpan({
                cls: 'rss-dashboard-star-icon'
            });
            starToggle.appendChild(starIcon);
            setIcon(starIcon, article.starred ? "star" : "star-off");
            if (!starIcon.querySelector('svg')) {
                starIcon.textContent = article.starred ? '★' : '☆';
            }
            starToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.callbacks.onArticleUpdate(article, { starred: !article.starred }, false);
                starToggle.classList.toggle("starred", !starToggle.classList.contains("starred"));
                starToggle.classList.toggle("unstarred", !starToggle.classList.contains("unstarred"));
                const iconEl = starToggle.querySelector('.rss-dashboard-star-icon');
                if (iconEl) {
                    setIcon(iconEl as HTMLElement, article.starred ? "star" : "star-off");
                    if (!iconEl.querySelector('svg')) {
                        iconEl.textContent = article.starred ? '★' : '☆';
                    }
                }
            });
            
            const tagsDropdown = actionToolbar.createDiv({
                cls: "rss-dashboard-tags-dropdown",
            });
            const tagsToggle = tagsDropdown.createDiv({
                cls: "rss-dashboard-tags-toggle",
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

                    const index = this.articles.findIndex(a => a.guid === article.guid);
                    if (index !== -1) {
                        this.articles[index] = { ...article };
                    }

                    if (this.callbacks.onArticleUpdate) {
                        this.callbacks.onArticleUpdate(article, { tags: [...article.tags] }, false);
                    }

                    let articleEl = this.container.querySelector(`[id="article-${article.guid}"]`) as HTMLElement;
                    if (!articleEl) {
                        articleEl = this.container.closest('.rss-dashboard-container')?.querySelector(`[id="article-${article.guid}"]`) as HTMLElement;
                    }
                    if (!articleEl) {
                        articleEl = document.getElementById(`article-${article.guid}`) as HTMLElement;
                    }
                    if (articleEl) {
                        articleEl.classList.add('rss-dashboard-tag-change-feedback');
                        window.setTimeout(() => {
                            articleEl.classList.remove('rss-dashboard-tag-change-feedback');
                        }, 200);
                        let tagsContainer = articleEl.querySelector('.rss-dashboard-article-tags');
                        if (!tagsContainer) {
                            const cardContent = articleEl.querySelector('.rss-dashboard-card-content') || articleEl;
                            const actionToolbar = cardContent.querySelector('.rss-dashboard-action-toolbar');
                            if (actionToolbar) {
                                tagsContainer = (cardContent as HTMLElement).createDiv({
                                    cls: 'rss-dashboard-article-tags'
                                });
                                cardContent.insertBefore(tagsContainer, actionToolbar);
                            }
                        } else {
                            while (tagsContainer.firstChild) {
                                tagsContainer.removeChild(tagsContainer.firstChild);
                            }
                        }
                        if (tagsContainer && article.tags && article.tags.length > 0) {
                            const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
                            tagsToShow.forEach(tag => {
                                if (tagsContainer) {
                                    const tagEl = (tagsContainer as HTMLElement).createDiv({
                                        cls: 'rss-dashboard-article-tag',
                                        text: tag.name
                                    });
                                    tagEl.style.setProperty('--tag-color', tag.color || 'var(--interactive-accent)');
                                }
                            });
                            if (article.tags.length > MAX_VISIBLE_TAGS && tagsContainer) {
                                (tagsContainer as HTMLElement).createDiv({
                                    cls: 'rss-dashboard-tag-overflow',
                                    text: `+${article.tags.length - MAX_VISIBLE_TAGS}`,
                                    attr: {
                                        title: article.tags.slice(MAX_VISIBLE_TAGS).map(t => t.name).join(', ')
                                    }
                                });
                            }
                        } else if (tagsContainer) {
                            while (tagsContainer.firstChild) {
                                tagsContainer.removeChild(tagsContainer.firstChild);
                            }
                        }
                        void articleEl.offsetHeight;
                    } else {
                        const tempIndicator = document.body.createDiv({
                            cls: 'rss-dashboard-tag-change-notification',
                            text: `Tag "${tag.name}" ${checked ? 'added' : 'removed'}`
                        });
                        window.setTimeout(() => {
                            if (tempIndicator.parentNode) {
                                tempIndicator.parentNode.removeChild(tempIndicator);
                            }
                        }, 1500);
                    }
                });
            });

            
            const dateEl = actionToolbar.createDiv({
                cls: "rss-dashboard-article-date",
            });
            const dateInfo = formatDateWithRelative(article.pubDate);
            dateEl.textContent = dateInfo.text;
            dateEl.setAttribute('title', dateInfo.title);

            card.addEventListener("click", () => {
                this.callbacks.onArticleClick(article);
            });
            
            card.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                this.showArticleContextMenu(e, article);
            });
        }
    }
    
    private renderPagination(container: HTMLElement, currentPage: number, totalPages: number, pageSize: number, totalArticles: number): void {
        const paginationContainer = container.createDiv({
            cls: "rss-dashboard-pagination",
        });

        
        const prevButton = paginationContainer.createEl('button', {
            cls: "rss-dashboard-pagination-btn prev",
            text: "<"
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
        nextButton.onclick = () => this.callbacks.onPageChange(currentPage + 1);

        
        const pageSizeDropdown = paginationContainer.createEl('select', { cls: 'rss-dashboard-page-size-dropdown' });
        const pageSizeOptions = [10, 20, 40, 50, 60, 80, 100];
        for (const size of pageSizeOptions) {
            const opt = pageSizeDropdown.createEl('option', { text: String(size), value: String(size) });
            if (size === pageSize) opt.selected = true;
        }
        pageSizeDropdown.onchange = (e) => {
            const size = Number((e.target as HTMLSelectElement).value);
            this.callbacks.onPageSizeChange(size);
        };

        
        const startIdx = (currentPage - 1) * pageSize + 1;
        const endIdx = Math.min(currentPage * pageSize, totalArticles);
        paginationContainer.createEl('span', {
            cls: 'rss-dashboard-pagination-results',
            text: `Results: ${startIdx} - ${endIdx} of ${totalArticles}`
        });
    }

    private createPageButton(container: HTMLElement, page: number, currentPage: number) {
        const btn = container.createEl('button', {
            cls: 'rss-dashboard-pagination-btn' + (page === currentPage ? ' active' : ''),
            text: String(page)
        });
        btn.disabled = page === currentPage;
        btn.onclick = () => this.callbacks.onPageChange(page);
    }
    
    
    private showArticleContextMenu(event: MouseEvent, article: FeedItem): void {
        const menu = new Menu();
        
        
        if (article.saved) {
            menu.addItem((item: MenuItem) => {
                item.setTitle("Open saved article")
                    .setIcon("file-text")
                    .onClick(() => {
                        if (this.callbacks.onOpenSavedArticle) {
                            this.callbacks.onOpenSavedArticle(article);
                        }
                    });
            });
            
            menu.addItem((item: MenuItem) => {
                item.setTitle("Open in reader view")
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
            item.setTitle("Open in browser")
                .setIcon("globe-2")
                .onClick(() => {
                    window.open(article.link, "_blank");
                });
        });
        
        menu.addItem((item: MenuItem) => {
            item.setTitle("Open in split view")
                .setIcon("panel-left")
                .onClick(() => {
                    this.callbacks.onArticleClick(article);
                });
        });
        
        menu.addSeparator();
        
        menu.addItem((item: MenuItem) => {
            item.setTitle(article.read ? "Mark as unread" : "Mark as read")
                .setIcon(article.read ? "circle" : "check-circle")
                .onClick(() => {
                    this.callbacks.onArticleUpdate(article, { read: !article.read }, false);
                });
        });
        
        menu.addItem((item: MenuItem) => {
            item.setTitle(article.starred ? "Unstar articles" : "Star articles")
                .setIcon("star")
                .onClick(() => {
                    this.callbacks.onArticleUpdate(article, { starred: !article.starred }, false);
                });
        });
        
        
        if (!article.saved) {
            menu.addSeparator();
            menu.addItem((item: MenuItem) => {
                item.setTitle(this.settings.articleSaving.saveFullContent ? "Save full article" : "Save article summary")
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
        onTagChange: (tag: Tag, checked: boolean) => void
    ): void {
        
        const targetDocument = toggleElement.ownerDocument;
        const targetBody = targetDocument.body;
        
        targetDocument.querySelectorAll(".rss-dashboard-tags-dropdown-content-portal").forEach((el) => {
            (el as HTMLElement).parentNode?.removeChild(el);
        });

        
        const portalDropdown = targetBody.createDiv({
            cls: "rss-dashboard-tags-dropdown-content rss-dashboard-tags-dropdown-content-portal"
        });

        
        for (const tag of this.settings.availableTags) {
            const tagItem = portalDropdown.createDiv({
                cls: "rss-dashboard-tag-item"
            });
            const hasTag = article.tags?.some((t) => t.name === tag.name) || false;
            
            const tagCheckbox = tagItem.createEl("input", {
                attr: { type: "checkbox" },
                cls: "rss-dashboard-tag-checkbox"
            });
            tagCheckbox.checked = hasTag;
            
            const tagLabel = tagItem.createDiv({
                cls: "rss-dashboard-tag-label",
                text: tag.name
            });
            tagLabel.style.setProperty('--tag-color', tag.color);

            tagCheckbox.addEventListener("change", (e) => {
                e.stopPropagation();
                const isChecked = (e.target as HTMLInputElement).checked;
                
                
                tagCheckbox.checked = isChecked;
                
                
                tagItem.classList.add('rss-dashboard-tag-item-processing');
                
                onTagChange(tag, isChecked);
                
                
                window.setTimeout(() => {
                    tagItem.classList.remove('rss-dashboard-tag-item-processing');
                }, 200);
                
                
                
            });

            tagItem.appendChild(tagCheckbox);
            tagItem.appendChild(tagLabel);
            portalDropdown.appendChild(tagItem);
        }

        
        
        targetBody.appendChild(portalDropdown);
        portalDropdown.addClass("rss-dashboard-tags-dropdown-content-portal");

        
        const rect = toggleElement.getBoundingClientRect();
        const dropdownRect = portalDropdown.getBoundingClientRect();
        const appContainer = this.container.closest('.workspace-leaf-content') || targetBody;
        const appContainerRect = appContainer.getBoundingClientRect();

        
        let left = rect.right;
        let top = rect.top;

        
        if (left + dropdownRect.width > appContainerRect.right) {
            left = rect.left - dropdownRect.width;
        }

        
        if (left < appContainerRect.left) {
            left = appContainerRect.left;
        }

        
        const targetWindow = targetDocument.defaultView || window;
        if (top + dropdownRect.height > targetWindow.innerHeight) {
            top = targetWindow.innerHeight - dropdownRect.height - 5; 
        }

        
        portalDropdown.style.left = `${left}px`;
        portalDropdown.style.top = `${top}px`;

        targetWindow.setTimeout(() => {
            const handleClickOutside = (ev: MouseEvent) => {
                if (portalDropdown && !portalDropdown.contains(ev.target as Node)) {
                    portalDropdown.remove();
                    targetDocument.removeEventListener("mousedown", handleClickOutside);
                }
            };
            targetDocument.addEventListener("mousedown", handleClickOutside);
        }, 0);
    }

    updateRefreshButtonText(text: string): void {
        if (this.refreshButton) {
            this.refreshButton.setAttribute('title', text);
        }
    }
}

function extractFirstImageSrc(html: string): string | null {
    const htmlWithMeta = ensureUtf8Meta(html);
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlWithMeta, 'text/html');
    const img = doc.querySelector("img");
    return img ? img.getAttribute("src") : null;
}
