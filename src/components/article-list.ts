import { Notice, Menu, MenuItem, setIcon } from "obsidian";
import { FeedItem, RssDashboardSettings } from "../types/types";
import { formatDateWithRelative, ensureUtf8Meta } from "../utils/platform-utils";


const MAX_VISIBLE_TAGS = 6;

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
    onFilterChange: (value: { type: 'age' | 'read' | 'unread' | 'starred' | 'saved' | 'none'; value: any; }) => void;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
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
        totalArticles: number
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
    }
    
    public destroy(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
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

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                if (width < 700) {
                    articlesHeader.classList.add('is-narrow');
                } else {
                    articlesHeader.classList.remove('is-narrow');
                }
            }
        });
        this.resizeObserver.observe(articlesHeader);

        
        const leftSection = articlesHeader.createDiv({
            cls: "rss-dashboard-header-left",
        });

        
        const sidebarToggleButton = leftSection.createDiv({
            cls: "rss-dashboard-sidebar-toggle",
            attr: { title: "Toggle Sidebar" },
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

        
        const rightSection = articlesHeader.createDiv({
            cls: "rss-dashboard-header-right",
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

        
        this.createControls(dropdownControls);

        
        const desktopControls = rightSection.createDiv({
            cls: "rss-dashboard-desktop-controls",
        });

        
        this.createControls(desktopControls);

        
        hamburgerButton.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle("active");
            hamburgerButton.classList.toggle("active");
        });

        
        document.addEventListener("click", (e) => {
            if (!hamburgerMenu.contains(e.target as Node)) {
                dropdownMenu.classList.remove("active");
                hamburgerButton.classList.remove("active");
            }
        });
    }
    
    private createControls(container: HTMLElement): void {
        const articleControls = container.createDiv({
            cls: "rss-dashboard-article-controls",
        });

        const filterDropdown = articleControls.createEl('select');
        filterDropdown.addClass('rss-dashboard-filter');
        const ageOptions = {
            "Article max age unlimited": 0,
            "Article max age 1 hour": 3600 * 1000,
            "Article max age 2 hours": 2 * 3600 * 1000,
            "Article max age 4 hours": 4 * 3600 * 1000,
            "Article max age 8 hours": 8 * 3600 * 1000,
            "Article max age 24 hours": 24 * 3600 * 1000,
            "Article max age 48 hours": 48 * 3600 * 1000,
            "Article max age 3 days": 3 * 24 * 3600 * 1000,
            "Article max age 1 week": 7 * 24 * 3600 * 1000,
            "Article max age 2 weeks": 14 * 24 * 3600 * 1000,
            "Article max age 1 month": 30 * 24 * 3600 * 1000,
            "Article max age 2 months": 60 * 24 * 3600 * 1000,
            "Article max age 6 months": 180 * 24 * 3600 * 1000,
            "Article max age 1 year": 365 * 24 * 3600 * 1000
        };

        for (const [text, value] of Object.entries(ageOptions)) {
            filterDropdown.createEl('option', { text: text, value: String(value) });
        }

        filterDropdown.value = String(this.settings.articleFilter.value || 0);

        filterDropdown.addEventListener('change', (e: Event) => {
            const value = Number((e.target as HTMLSelectElement).value);
            this.callbacks.onFilterChange({
                type: value === 0 ? 'none' : 'age',
                value: value
            });
        });

        const sortDropdown = articleControls.createEl('select');
        sortDropdown.addClass('rss-dashboard-sort');
        sortDropdown.createEl('option', { text: 'Sort by newest', value: 'newest' });
        sortDropdown.createEl('option', { text: 'Sort by oldest', value: 'oldest' });
        sortDropdown.value = this.settings.articleSort;
        sortDropdown.addEventListener('change', (e: Event) => {
            this.callbacks.onSortChange((e.target as HTMLSelectElement).value as 'newest' | 'oldest');
        });

        const groupDropdown = articleControls.createEl('select');
        groupDropdown.addClass('rss-dashboard-group');
        groupDropdown.createEl('option', { text: 'No grouping', value: 'none' });
        groupDropdown.createEl('option', { text: 'Group by feed', value: 'feed' });
        groupDropdown.createEl('option', { text: 'Group by date', value: 'date' });
        groupDropdown.createEl('option', { text: 'Group by folder', value: 'folder' });
        groupDropdown.value = this.settings.articleGroupBy;
        groupDropdown.addEventListener('change', (e: Event) => {
            this.callbacks.onGroupChange((e.target as HTMLSelectElement).value as 'none' | 'feed' | 'date' | 'folder');
        });

        const viewStyleToggle = articleControls.createDiv({
            cls: "rss-dashboard-view-toggle",
        });

        const listViewButton = viewStyleToggle.createEl("button", {
            cls: "rss-dashboard-list-view-button" +
                (this.settings.viewStyle === "list" ? " active" : ""),
            text: "List",
        });
        
        listViewButton.addEventListener("click", () => {
            this.callbacks.onToggleViewStyle("list");
        });

        const cardViewButton = viewStyleToggle.createEl("button", {
            cls: "rss-dashboard-card-view-button" +
                (this.settings.viewStyle === "card" ? " active" : ""),
            text: "Card",
        });
        
        cardViewButton.addEventListener("click", () => {
            this.callbacks.onToggleViewStyle("card");
        });

        const dashboardRefreshButton = articleControls.createEl("button", {
            cls: "rss-dashboard-refresh-button",
            text: "Refresh",
            attr: {
                title: "Refresh feeds"
            }
        });
        
        
        if (!container.classList.contains("rss-dashboard-dropdown-controls")) {
            this.refreshButton = dashboardRefreshButton;
        }
        
        dashboardRefreshButton.addEventListener("click", () => {
            this.callbacks.onRefreshFeeds();
        });
    }
    
    private renderArticles(): void {
        const articlesList = this.container.createDiv({
            cls: `rss-dashboard-articles-list rss-dashboard-${this.settings.viewStyle}-view`,
        });

        if (this.settings.viewStyle === "card") {
        }
        
        
        if (this.articles.length === 0) {
            const emptyState = articlesList.createDiv({
                cls: "rss-dashboard-empty-state",
            });
            const iconDiv = emptyState.createDiv();
            setIcon(iconDiv, "rss");
            iconDiv.addClass("rss-dashboard-empty-state-icon");
            emptyState.createEl("h3", { text: "No articles found" });
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
                groupContainer.createEl('h2', { text: groupName, cls: 'rss-dashboard-group-header' });
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
        if (groupBy === 'none') return { 'All Articles': articles };

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
                    key = 'All Articles';
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

            
            const titleDiv = firstRow.createDiv({
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
            setIcon(saveButton, "lucide-save");
            if (!saveButton.querySelector('svg')) {
                saveButton.textContent = '💾';
            }
            saveButton.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (article.saved) {
                    
                    if (this.callbacks.onOpenSavedArticle) {
                        await this.callbacks.onOpenSavedArticle(article);
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
                        
                        try {
                            await this.callbacks.onArticleSave(article);
                            saveButton.classList.add("saved");
                            setIcon(saveButton, "lucide-save");
                            if (!saveButton.querySelector('svg')) {
                                saveButton.textContent = '💾';
                            }
                        } catch (error) {
                            
                            new Notice(`Error saving article: ${error.message}`);
                        } finally {
                            
                            saveButton.classList.remove('saving');
                            saveButton.setAttribute('title', 'Click to open saved article');
                        }
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
            const starIcon = document.createElement('span');
            starIcon.className = 'rss-dashboard-star-icon';
            starToggle.appendChild(starIcon);
            setIcon(starIcon, article.starred ? "lucide-star" : "lucide-star-off");
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
                    setIcon(iconEl as HTMLElement, article.starred ? "lucide-star" : "lucide-star-off");
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
                        
                        setTimeout(() => {
                            articleEl.classList.remove('rss-dashboard-tag-change-feedback');
                        }, 200);
                        
                        let tagsContainer = articleEl.querySelector('.rss-dashboard-article-tags');
                        if (!tagsContainer) {
                            const cardContent = articleEl.querySelector('.rss-dashboard-card-content') || articleEl;
                            const actionToolbar = cardContent.querySelector('.rss-dashboard-action-toolbar');
                            if (actionToolbar) {
                                tagsContainer = document.createElement('div');
                                tagsContainer.className = 'rss-dashboard-article-tags';
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
                                const tagEl = document.createElement('div');
                                tagEl.className = 'rss-dashboard-article-tag';
                                tagEl.textContent = tag.name;
                                tagEl.style.setProperty('--tag-color', tag.color || 'var(--interactive-accent)');
                                if (tagsContainer) {
                                    tagsContainer.appendChild(tagEl);
                                }
                            });
                            
                            if (article.tags.length > MAX_VISIBLE_TAGS && tagsContainer) {
                                const overflowTag = document.createElement('div');
                                overflowTag.className = 'rss-dashboard-tag-overflow';
                                overflowTag.textContent = `+${article.tags.length - MAX_VISIBLE_TAGS}`;
                                overflowTag.title = article.tags.slice(MAX_VISIBLE_TAGS).map(t => t.name).join(', ');
                                tagsContainer.appendChild(overflowTag);
                            }
                        } else if (tagsContainer) {
                            
                            while (tagsContainer.firstChild) {
                                tagsContainer.removeChild(tagsContainer.firstChild);
                            }
                        }
                        
                        
                        articleEl.offsetHeight;
                    } else {
                        
                        
                        const tempIndicator = document.createElement('div');
                        tempIndicator.className = 'rss-dashboard-tag-change-notification';
                        tempIndicator.textContent = `Tag "${tag.name}" ${checked ? 'added' : 'removed'}`;
                        document.body.appendChild(tempIndicator);
                        
                        setTimeout(() => {
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
                    const tagEl = tagsEl!.createDiv({
                        cls: 'rss-dashboard-article-tag',
                        text: tag.name,
                    });
                    tagEl.style.setProperty('--tag-color', tag.color);
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
                    cls: "rss-dashboard-cover-container" + (article.summary ? " has-summary" : ""),
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
                    summaryOverlay.textContent = article.summary;
                }
            } else if (article.summary) {
                
                const summaryOnlyContainer = cardContent.createDiv({
                    cls: "rss-dashboard-cover-summary-only",
                });
                summaryOnlyContainer.textContent = article.summary;
            }

            
            if (article.tags && article.tags.length > 0) {
                const tagsContainer = cardContent.createDiv({
                    cls: "rss-dashboard-article-tags",
                });
                const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
                tagsToShow.forEach(tag => {
                    const tagEl = tagsContainer!.createDiv({
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
            setIcon(saveButton, "lucide-save");
            if (!saveButton.querySelector('svg')) {
                saveButton.textContent = '💾';
            }
            saveButton.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (article.saved) {
                    
                    if (this.callbacks.onOpenSavedArticle) {
                        await this.callbacks.onOpenSavedArticle(article);
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
                        
                        try {
                            await this.callbacks.onArticleSave(article);
                            saveButton.classList.add("saved");
                            setIcon(saveButton, "lucide-save");
                            if (!saveButton.querySelector('svg')) {
                                saveButton.textContent = '💾';
                            }
                        } catch (error) {
                            
                            new Notice(`Error saving article: ${error.message}`);
                        } finally {
                            
                            saveButton.classList.remove('saving');
                            saveButton.setAttribute('title', 'Click to open saved article');
                        }
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
            const starIcon = document.createElement('span');
            starIcon.className = 'rss-dashboard-star-icon';
            starToggle.appendChild(starIcon);
            setIcon(starIcon, article.starred ? "lucide-star" : "lucide-star-off");
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
                    setIcon(iconEl as HTMLElement, article.starred ? "lucide-star" : "lucide-star-off");
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
                        setTimeout(() => {
                            articleEl.classList.remove('rss-dashboard-tag-change-feedback');
                        }, 200);
                        let tagsContainer = articleEl.querySelector('.rss-dashboard-article-tags');
                        if (!tagsContainer) {
                            const cardContent = articleEl.querySelector('.rss-dashboard-card-content') || articleEl;
                            const actionToolbar = cardContent.querySelector('.rss-dashboard-action-toolbar');
                            if (actionToolbar) {
                                tagsContainer = document.createElement('div');
                                tagsContainer.className = 'rss-dashboard-article-tags';
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
                                const tagEl = document.createElement('div');
                                tagEl.className = 'rss-dashboard-article-tag';
                                tagEl.textContent = tag.name;
                                tagEl.style.setProperty('--tag-color', tag.color || 'var(--interactive-accent)');
                                if (tagsContainer) {
                                    tagsContainer.appendChild(tagEl);
                                }
                            });
                            if (article.tags.length > MAX_VISIBLE_TAGS && tagsContainer) {
                                const overflowTag = document.createElement('div');
                                overflowTag.className = 'rss-dashboard-tag-overflow';
                                overflowTag.textContent = `+${article.tags.length - MAX_VISIBLE_TAGS}`;
                                overflowTag.title = article.tags.slice(MAX_VISIBLE_TAGS).map(t => t.name).join(', ');
                                tagsContainer.appendChild(overflowTag);
                            }
                        } else if (tagsContainer) {
                            while (tagsContainer.firstChild) {
                                tagsContainer.removeChild(tagsContainer.firstChild);
                            }
                        }
                        articleEl.offsetHeight;
                    } else {
                        const tempIndicator = document.createElement('div');
                        tempIndicator.className = 'rss-dashboard-tag-change-notification';
                        tempIndicator.textContent = `Tag "${tag.name}" ${checked ? 'added' : 'removed'}`;
                        document.body.appendChild(tempIndicator);
                        setTimeout(() => {
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
        const resultsInfo = paginationContainer.createEl('span', {
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
                item.setTitle("Open Saved Article")
                    .setIcon("file-text")
                    .onClick(() => {
                        if (this.callbacks.onOpenSavedArticle) {
                            this.callbacks.onOpenSavedArticle(article);
                        }
                    });
            });
            
            menu.addItem((item: MenuItem) => {
                item.setTitle("Open in Reader View")
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
            item.setTitle("Open in Browser")
                .setIcon("lucide-globe-2")
                .onClick(() => {
                    window.open(article.link, "_blank");
                });
        });
        
        menu.addItem((item: MenuItem) => {
            item.setTitle("Open in Split View")
                .setIcon("lucide-sidebar")
                .onClick(() => {
                    this.callbacks.onArticleClick(article);
                });
        });
        
        menu.addSeparator();
        
        menu.addItem((item: MenuItem) => {
            item.setTitle(article.read ? "Mark as Unread" : "Mark as Read")
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
                item.setTitle(this.settings.articleSaving.saveFullContent ? "Save Full Article" : "Save Article Summary")
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
        onTagChange: (tag: any, checked: boolean) => void
    ): void {
        
        
        this.container.querySelectorAll(".rss-dashboard-tags-dropdown-content-portal").forEach((el) => {
            (el as HTMLElement).parentNode?.removeChild(el);
        });

        
        const portalDropdown = document.createElement("div");
        portalDropdown.className = "rss-dashboard-tags-dropdown-content rss-dashboard-tags-dropdown-content-portal";

        
        for (const tag of this.settings.availableTags) {
            const tagItem = document.createElement("div");
            tagItem.className = "rss-dashboard-tag-item";
            const hasTag = article.tags?.some((t) => t.name === tag.name) || false;
            
            const tagCheckbox = document.createElement("input");
            tagCheckbox.className = "rss-dashboard-tag-checkbox";
            tagCheckbox.type = "checkbox";
            tagCheckbox.checked = hasTag;
            
            const tagLabel = document.createElement("div");
            tagLabel.className = "rss-dashboard-tag-label";
            tagLabel.textContent = tag.name;
            tagLabel.style.setProperty('--tag-color', tag.color);

            tagCheckbox.addEventListener("change", (e) => {
                e.stopPropagation();
                const isChecked = (e.target as HTMLInputElement).checked;
                
                
                tagCheckbox.checked = isChecked;
                
                
                tagItem.classList.add('rss-dashboard-tag-item-processing');
                
                onTagChange(tag, isChecked);
                
                
                setTimeout(() => {
                    tagItem.classList.remove('rss-dashboard-tag-item-processing');
                }, 200);
                
                
                
            });

            tagItem.appendChild(tagCheckbox);
            tagItem.appendChild(tagLabel);
            portalDropdown.appendChild(tagItem);
        }

        
        
        document.body.appendChild(portalDropdown);
        portalDropdown.addClass("rss-dashboard-tags-dropdown-content-portal");

        
        const rect = toggleElement.getBoundingClientRect();
        const dropdownRect = portalDropdown.getBoundingClientRect();
        const appContainer = this.container.closest('.workspace-leaf-content') || document.body;
        const appContainerRect = appContainer.getBoundingClientRect();

        
        let left = rect.right;
        let top = rect.top;

        
        if (left + dropdownRect.width > appContainerRect.right) {
            left = rect.left - dropdownRect.width;
        }

        
        if (left < appContainerRect.left) {
            left = appContainerRect.left;
        }

        
        if (top + dropdownRect.height > window.innerHeight) {
            top = window.innerHeight - dropdownRect.height - 5; 
        }

        
        portalDropdown.style.left = `${left}px`;
        portalDropdown.style.top = `${top}px`;

        setTimeout(() => {
            const handleClickOutside = (ev: MouseEvent) => {
                if (portalDropdown && !portalDropdown.contains(ev.target as Node)) {
                    portalDropdown.remove();
                    document.removeEventListener("mousedown", handleClickOutside);
                }
            };
            document.addEventListener("mousedown", handleClickOutside);
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
