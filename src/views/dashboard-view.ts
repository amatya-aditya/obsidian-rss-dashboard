import { ItemView, WorkspaceLeaf, Notice, TFile } from "obsidian";
import { Feed, FeedItem, RssDashboardSettings, Folder } from "../types/types";
import type RssDashboardPlugin from "../../main";
import { Sidebar } from "../components/sidebar";
import { ArticleList } from "../components/article-list";
import { ArticleSaver } from "../services/article-saver";
import { ReaderView, RSS_READER_VIEW_TYPE } from "./reader-view";
import { FeedManagerModal } from "../modals/feed-manager-modal";

export const RSS_DASHBOARD_VIEW_TYPE = "rss-dashboard-view";

export class RssDashboardView extends ItemView {
    private settings: RssDashboardSettings;
    private saver: ArticleSaver;
    public currentFolder: string | null = null;
    private currentFeed: Feed | null = null;
    private currentTag: string | null = null;
    private selectedArticle: FeedItem | null = null;
    private tagsCollapsed = true;
    private collapsedFolders: string[] = [];
    private allArticlesPage = 1;
    private unreadArticlesPage = 1;
    private readArticlesPage = 1;
    private savedArticlesPage = 1;
    private starredArticlesPage = 1;
    public sidebar!: Sidebar;
    private articleList!: ArticleList;
    private sidebarContainer: HTMLElement | null = null;
    private verificationTimeout: number | null = null;
    private folderPages: Record<string, number> = {};
    private folderPageSizes: Record<string, number> = {};
    private feedPages: Record<string, number> = {};
    private feedPageSizes: Record<string, number> = {};
    private articleReaderLeafWhilePodcast: WorkspaceLeaf | null = null;
    
    constructor(
        leaf: WorkspaceLeaf, 
        private plugin: RssDashboardPlugin 
    ) {
        super(leaf);
        this.settings = this.plugin.settings;
        this.collapsedFolders = this.settings.collapsedFolders || [];
        this.saver = new ArticleSaver(this.app, this.settings.articleSaving);
        
        // Set default filter based on settings
        const defaultFilter = this.settings.display?.defaultFilter || "all";
        const hiddenFilters = this.settings.display?.hiddenFilters || [];
        
        // Only set the default filter if it's not hidden
        if (defaultFilter !== "all" && !hiddenFilters.includes(defaultFilter)) {
            this.currentFolder = defaultFilter;
        } else {
            this.currentFolder = null; 
        }
    }

    getViewType(): string {
        return RSS_DASHBOARD_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "RSS dashboard";
    }

    getIcon(): string {
        return "rss";
    }

    async onOpen(): Promise<void> {
        
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    this.handleFileDeleted(file);
                }
            })
        );
        
        
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) {
                    this.handleFileRenamed(file, oldPath);
                }
            })
        );
        
        
        this.registerEvent(
            this.app.vault.on('modify', () => {
                
                if (this.verificationTimeout) {
                    window.clearTimeout(this.verificationTimeout);
                }
                this.verificationTimeout = window.setTimeout(() => {
                    void this.verifySavedArticles();
                }, 300000); 
            })
        );
        
        const container = this.containerEl.children[1];
        container.addClass("rss-dashboard-container");
        let dashboardContainer = container.querySelector('.rss-dashboard-layout') as HTMLElement;
        if (!dashboardContainer) {
            dashboardContainer = container.createDiv({ cls: "rss-dashboard-layout" });
        }

        if (!this.sidebarContainer) {
            this.sidebarContainer = dashboardContainer.createDiv({
                cls: "rss-dashboard-sidebar-container"
            });
        } else if (this.sidebarContainer.parentElement !== dashboardContainer) {
            dashboardContainer.appendChild(this.sidebarContainer);
        }

        
        if (!this.sidebar) {
            this.sidebar = new Sidebar(
                this.app,
                this.sidebarContainer,
                this.plugin,
                this.settings,
                {
                    currentFolder: this.currentFolder,
                    currentFeed: this.currentFeed,
                    currentTag: this.currentTag,
                    tagsCollapsed: this.tagsCollapsed,
                    collapsedFolders: this.collapsedFolders
                },
                {
                    onFolderClick: this.handleFolderClick.bind(this),
                    onFeedClick: this.handleFeedClick.bind(this),
                    onTagClick: this.handleTagClick.bind(this),
                    onToggleTagsCollapse: this.handleToggleTagsCollapse.bind(this),
                    onToggleFolderCollapse: this.handleToggleFolderCollapse.bind(this),
                    onBatchToggleFolders: this.handleBatchToggleFolders.bind(this),
                    onAddFolder: this.handleAddFolder.bind(this),
                    onAddSubfolder: this.handleAddSubfolder.bind(this),
                    onAddFeed: this.handleAddFeed.bind(this),
                    onEditFeed: this.handleEditFeed.bind(this),
                    onDeleteFeed: this.handleDeleteFeed.bind(this),
                    onDeleteFolder: this.handleDeleteFolder.bind(this),
                    onRefreshFeeds: this.handleRefreshFeeds.bind(this),
                    onUpdateFeed: this.handleUpdateFeed.bind(this),
                    onImportOpml: this.handleImportOpml.bind(this),
                    onExportOpml: this.handleExportOpml.bind(this),
                    onToggleSidebar: this.handleToggleSidebar.bind(this),
                    onManageFeeds: () => {
                        new FeedManagerModal(this.app, this.plugin).open();
                    }
                }
            );
        }
        
        
        this.render();
    }
    
    
    render(): void {
        
        this.verifySavedArticles();
        
        if (this.articleList) {
            this.articleList.destroy();
        }
        
        
        if (this.settings.sidebarCollapsed) {
            this.containerEl.addClass('sidebar-collapsed');
        } else {
            this.containerEl.removeClass('sidebar-collapsed');
        }

        if (this.sidebar) {
            this.sidebar.clearFolderPathCache();
            this.sidebar["options"] = {
                currentFolder: this.currentFolder,
                currentFeed: this.currentFeed,
                currentTag: this.currentTag,
                tagsCollapsed: this.tagsCollapsed,
                collapsedFolders: this.collapsedFolders
            };
            this.sidebar["settings"] = this.settings;
            this.sidebar.render();
        }

        
        const container = this.containerEl.children[1];
        let dashboardContainer = container.querySelector('.rss-dashboard-layout') as HTMLElement;
        if (!dashboardContainer) {
            dashboardContainer = container.createDiv({ cls: "rss-dashboard-layout" });
        }
        let contentContainer = dashboardContainer.querySelector('.rss-dashboard-content') as HTMLElement;
        if (!contentContainer) {
            contentContainer = dashboardContainer.createDiv({ cls: "rss-dashboard-content" });
        } else {
            contentContainer.empty();
        }

        this.renderToolbar(contentContainer);

        const articlesContainer = contentContainer.createDiv({ cls: "rss-dashboard-articles" });
        const allFilteredArticles = this.getAllFilteredArticles();
        const pageSize = this.getCurrentPageSize();
        const currentPage = this.getCurrentPage();
        const totalArticles = allFilteredArticles.length;
        const totalPages = Math.max(1, Math.ceil(totalArticles / pageSize));
        const startIdx = (currentPage - 1) * pageSize;
        const endIdx = startIdx + pageSize;
        const articlesForPage = allFilteredArticles.slice(startIdx, endIdx);

        this.articleList = new ArticleList(
            articlesContainer,
            this.settings,
            this.getArticlesTitle(),
            articlesForPage,
            this.selectedArticle,
            {
                onArticleClick: (article) => { void this.handleArticleClick(article); },
                onToggleViewStyle: this.handleToggleViewStyle.bind(this),
                onRefreshFeeds: this.handleRefreshFeeds.bind(this),
                onArticleUpdate: (article, updates, shouldRerender) => { void this.handleArticleUpdate(article, updates, shouldRerender); },
                onArticleSave: (article) => { void this.handleArticleSave(article); },
                onOpenSavedArticle: (article) => { void this.handleOpenSavedArticle(article); },
                onOpenInReaderView: (article) => { void this.handleOpenInReaderView(article); },
                onToggleSidebar: this.handleToggleSidebar.bind(this),
                onSortChange: this.handleSortChange.bind(this),
                onGroupChange: this.handleGroupChange.bind(this),
                onFilterChange: this.handleFilterChange.bind(this),
                onPageChange: this.handlePageChange.bind(this),
                onPageSizeChange: this.handlePageSizeChange.bind(this)
            },
            currentPage,
            totalPages,
            pageSize,
            totalArticles
        );
        this.articleList.render();
        
        
        this.updateRefreshButtonText();
    }
    
    private renderToolbar(container: HTMLElement): void {
        container.createDiv({ cls: 'rss-dashboard-toolbar' });
    }
    
    
    private getArticlesTitle(): string {
        if (this.currentFeed) {
            return this.currentFeed.title;
        } else if (this.currentFolder === "starred") {
            return "Starred items";
        } else if (this.currentFolder === "unread") {
            return "Unread items";
        } else if (this.currentFolder === "read") {
            return "Read items";
        } else if (this.currentFolder === "saved") {
            return "Saved items";
        } else if (this.currentFolder === "videos") {
            return "Videos";
        } else if (this.currentFolder === "podcasts") {
            return "Podcasts";
        } else if (this.currentTag) {
            return `Tag: ${this.currentTag}`;
        } else if (this.currentFolder) {
            return this.currentFolder;
        } else {
            return "All articles";
        }
    }
    
    
    private getFilteredArticles(): FeedItem[] {
        let articles: FeedItem[] = [];
        
        if (this.currentFeed) {
            const limit = this.currentFeed.maxItemsLimit || this.settings.maxItems;
            articles = this.currentFeed.items.slice(0, limit);
        } else {
            
            if (this.currentFolder === "starred") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.starred)
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url
                            }))
                    );
                }
            }
            
            else if (this.currentFolder === "unread") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => !item.read)
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentFolder === "read") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.read)
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentFolder === "saved") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.saved)
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentFolder === "videos") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.mediaType === "video")
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentFolder === "podcasts") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.mediaType === "podcast")
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentTag) {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.tags && item.tags.some(t => t.name === this.currentTag))
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentFolder) {
                
                const allFolders = this.getAllDescendantFolders(this.currentFolder);
                for (const feed of this.settings.feeds) {
                    if (feed.folder && allFolders.includes(feed.folder)) {
                        articles = articles.concat(
                            feed.items
                                .map((item) => ({
                                    ...item,
                                    feedTitle: feed.title,
                                    feedUrl: feed.url,
                                }))
                        );
                    }
                }
            }
            
            else {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .map((item) => ({
                            ...item,
                            feedTitle: feed.title,
                            feedUrl: feed.url,
                        }))
                    );
                }
            }
        }
        
        if (this.settings.articleFilter.type === 'age' && typeof this.settings.articleFilter.value === 'number' && this.settings.articleFilter.value > 0) {
            const maxAge = Date.now() - this.settings.articleFilter.value;
            articles = articles.filter(a => new Date(a.pubDate).getTime() > maxAge);
        }

        if (this.settings.articleSort === 'oldest') {
            articles.sort((a, b) => new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime());
        } else {
            articles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
        }

        
        if (this.currentFolder === null && this.currentFeed === null && this.currentTag === null) {
            
            const pageSize = this.settings.allArticlesPageSize;
            const start = 0;
            const end = this.allArticlesPage * pageSize;
            return articles.slice(start, end);
        } else if (this.currentFolder === "unread") {
            
            const pageSize = this.settings.unreadArticlesPageSize;
            const start = 0;
            const end = this.unreadArticlesPage * pageSize;
            return articles.slice(start, end);
        } else if (this.currentFolder === "read") {
            
            const pageSize = this.settings.readArticlesPageSize;
            const start = 0;
            const end = this.readArticlesPage * pageSize;
            return articles.slice(start, end);
        } else if (this.currentFolder === "saved") {
            
            const pageSize = this.settings.savedArticlesPageSize;
            const start = 0;
            const end = this.savedArticlesPage * pageSize;
            return articles.slice(start, end);
        } else if (this.currentFolder === "starred") {
            
            const pageSize = this.settings.starredArticlesPageSize;
            const start = 0;
            const end = this.starredArticlesPage * pageSize;
            return articles.slice(start, end);
        }
        
        return articles;
    }
    
    private findFolderByPath(path: string): Folder | null {
        const parts = path.split("/");
        let current: Folder | undefined = this.settings.folders.find(f => f.name === parts[0]);
        for (let i = 1; i < parts.length && current; i++) {
            current = (current.subfolders || []).find(f => f.name === parts[i]);
        }
        return current || null;
    }

    private getAllDescendantFolders(folderPath: string): string[] {
        const result: string[] = [folderPath];
        const folder = this.findFolderByPath(folderPath);

        function collect(f: Folder, base: string) {
            if (f.subfolders) {
                for (const sub of f.subfolders) {
                    const subPath = base + '/' + sub.name;
                    result.push(subPath);
                    collect(sub, subPath);
                }
            }
        }

        if (folder) {
            collect(folder, folderPath);
        }

        return result;
    }

    
    private handleFolderClick(folder: string | null): void {
        let scrollPosition = 0;
        if (this.sidebarContainer) {
            const foldersSection = this.sidebarContainer.querySelector('.rss-dashboard-feed-folders-section');
            if (foldersSection) scrollPosition = (foldersSection as HTMLElement).scrollTop;
        }

        
        this.currentFeed = null;
        this.currentTag = null;

        
        if (this.currentFolder !== folder) {
            if (folder === "unread") {
                this.unreadArticlesPage = 1;
            } else if (folder === "read") {
                this.readArticlesPage = 1;
            } else if (folder === "saved") {
                this.savedArticlesPage = 1;
            } else if (folder === "starred") {
                this.starredArticlesPage = 1;
            } else if (folder === null) {
                this.allArticlesPage = 1;
            } else if (folder) {
                this.folderPages[folder] = 1;
            }
        }

        this.currentFolder = folder;

        
        if (this.sidebarContainer) {
            const foldersSection = this.sidebarContainer.querySelector('.rss-dashboard-feed-folders-section');
            if (foldersSection) (foldersSection as HTMLElement).scrollTop = scrollPosition;
        }

        void this.render();
    }
    
    
    private handleFeedClick(feed: Feed): void {
        let scrollPosition = 0;
        if (this.sidebarContainer) {
            const foldersSection = this.sidebarContainer.querySelector('.rss-dashboard-feed-folders-section');
            if (foldersSection) scrollPosition = (foldersSection as HTMLElement).scrollTop;
        }
        this.currentFeed = feed;
        this.currentFolder = null;
        this.currentTag = null;
        this.selectedArticle = null;
        
        if (feed && feed.url) {
            this.feedPages[feed.url] = 1;
        }
        void this.render();
        if (this.sidebarContainer) {
            window.setTimeout(() => {
                const foldersSection = this.sidebarContainer?.querySelector('.rss-dashboard-feed-folders-section');
                if (foldersSection) (foldersSection as HTMLElement).scrollTop = scrollPosition;
            }, 0);
        }
    }
    
    
    private handleTagClick(tag: string | null): void {
        this.currentTag = tag;
        this.currentFolder = null;
        this.currentFeed = null;
        this.selectedArticle = null;
        void this.render();
    }
    
    
    private handleToggleTagsCollapse(): void {
        this.tagsCollapsed = !this.tagsCollapsed;
        void this.render();
    }
    
    
    private handleToggleFolderCollapse(folder: string, shouldRerender = true): void {
        if (this.collapsedFolders.includes(folder)) {
            this.collapsedFolders = this.collapsedFolders.filter(
                (f) => f !== folder
            );
        } else {
            this.collapsedFolders.push(folder);
        }
        this.settings.collapsedFolders = this.collapsedFolders;
        void this.plugin.saveSettings();
        
        
        if (shouldRerender) {
            void this.render();
        }
    }

    private handleBatchToggleFolders(foldersToCollapse: string[], foldersToExpand: string[]): void {
        
        this.collapsedFolders = this.collapsedFolders.filter(f => !foldersToExpand.includes(f));
        foldersToCollapse.forEach(folder => {
            if (!this.collapsedFolders.includes(folder)) {
                this.collapsedFolders.push(folder);
            }
        });
        
        this.settings.collapsedFolders = this.collapsedFolders;
        void this.plugin.saveSettings();
        void this.render();
    }
    
    
    private handleAddFolder(name: string): void {
        void this.plugin.addFolder(name);
    }
    
    
    private handleAddSubfolder(parent: string, name: string): void {
        void this.plugin.addSubfolder(parent, name);
    }
    
    
    private async handleAddFeed(title: string, url: string, folder: string, autoDeleteDuration?: number, maxItemsLimit?: number, scanInterval?: number): Promise<void> {
        await this.plugin.addFeed(title, url, folder, autoDeleteDuration, maxItemsLimit, scanInterval);
        void this.render();
    }
    
   
    private handleEditFeed(feed: Feed, title: string, url: string, folder: string): void {
        void this.plugin.editFeed(feed, title, url, folder);
        void this.render();
    }
    
 
    private handleDeleteFeed(feed: Feed): void {
        this.plugin.settings.feeds = this.plugin.settings.feeds.filter((f: Feed) => f !== feed);
        void this.plugin.saveSettings();
        
        
        if (this.currentFeed === feed) {
            this.currentFeed = null;
        }
        
        void this.render();
    }
    
    
    private handleDeleteFolder(folder: string): void {
        
        this.plugin.settings.feeds = this.plugin.settings.feeds.filter(
            (feed: Feed) => feed.folder !== folder
        );
        
        
        this.plugin.settings.folders = this.plugin.settings.folders.filter(
            (f: { name: string }) => f.name !== folder
        );
        
        void this.plugin.saveSettings();
        
        
        if (this.currentFolder === folder) {
            this.currentFolder = null;
        }
        
        void this.render();
    }
    
    
    private handleRefreshFeeds(): void {
        
        if (this.currentFeed) {
            void this.plugin.refreshSelectedFeed(this.currentFeed);
        }
        
        else if (this.currentFolder && 
                 !["read", "unread", "starred", "saved", "videos", "podcasts"].includes(this.currentFolder)) {
            void this.plugin.refreshFeedsInFolder(this.currentFolder);
        }
        
        else if (this.currentTag) {
            const feedsWithTag = this.settings.feeds.filter(feed => 
                feed.items.some(item => item.tags && item.tags.some(tag => tag.name === this.currentTag))
            );
            if (feedsWithTag.length > 0) {
                void this.plugin.refreshFeeds(feedsWithTag);
            } else {
                new Notice("No feeds found with the selected tag");
            }
        }
        
        else {
            void this.plugin.refreshFeeds();
        }
    }
    
    
    private handleImportOpml(): void {
        void this.plugin.importOpml();
    }
    
    
    private handleExportOpml(): void {
        void this.plugin.exportOpml();
    }
    
    
    private handleToggleSidebar(): void {
        this.settings.sidebarCollapsed = !this.settings.sidebarCollapsed;
        void this.plugin.saveSettings();
        void this.render();
    }
    

    private async handleArticleClick(article: FeedItem): Promise<void> {
        this.selectedArticle = article;
        
        if (!article.read) {
            await this.updateArticleStatus(article, { read: true }, false);
        }
        
        
        if (article.saved) {
            const loadingNotice = new Notice("Opening saved article...", 0);
            try {
                const savedFile = await this.findSavedArticleFile(article);
                if (savedFile) {
                    await this.openSavedArticleFile(savedFile);
                    loadingNotice.hide();
                    return;
                } else {
                    
                    await this.updateArticleStatus(article, { saved: false }, false);
                    if (article.tags) {
                        article.tags = article.tags.filter(tag => tag.name.toLowerCase() !== "saved");
                    }
                    loadingNotice.hide();
                    new Notice("Saved article file not found. Opening original source instead.");
                }
            } catch (error) {
                loadingNotice.hide();
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`Error opening saved article: ${message}`);
            }
        }
        
        
        const readerLeaves = this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
        const results = await Promise.all(readerLeaves.map(async (leaf) => {
            if (typeof (leaf as WorkspaceLeaf & { loadIfDeferred?: () => Promise<void> }).loadIfDeferred === 'function') {
                await (leaf as WorkspaceLeaf & { loadIfDeferred: () => Promise<void> }).loadIfDeferred();
            }
            if (leaf.view instanceof ReaderView) {
                return leaf.view.isPodcastPlaying();
            }
            return false;
        }));
        const podcastPlaying = results.some(result => result);
        
        if (podcastPlaying) {
            if (this.settings.media.openInSplitView) {
                
                if (
                    this.articleReaderLeafWhilePodcast &&
                    this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE).includes(this.articleReaderLeafWhilePodcast)
                ) {
                    await this.openArticleInSpecificLeaf(article, this.articleReaderLeafWhilePodcast);
                } else {
                    
                    const newLeaf = await this.openArticleInNewTab(article);
                    this.articleReaderLeafWhilePodcast = newLeaf;
                }
            } else {
                window.open(article.link, "_blank");
            }
        } else {
            
            this.articleReaderLeafWhilePodcast = null;
            if (this.settings.media.openInSplitView) {
                
                if (readerLeaves.length > 0) {
                    await this.openArticleInSpecificLeaf(article, readerLeaves[0]);
                } else {
                    await this.openArticleInNewTab(article);
                }
            } else {
                window.open(article.link, "_blank");
            }
        }
    }
    
    
    private async openArticleInNewTab(article: FeedItem): Promise<WorkspaceLeaf> {
        const { workspace } = this.app;
        const leaf = workspace.getLeaf("split");
        if (leaf) {
            await leaf.setViewState({
                type: RSS_READER_VIEW_TYPE,
                active: true,
            });
            void workspace.revealLeaf(leaf);
            if (typeof (leaf as WorkspaceLeaf & { loadIfDeferred?: () => Promise<void> }).loadIfDeferred === 'function') {
                await (leaf as WorkspaceLeaf & { loadIfDeferred: () => Promise<void> }).loadIfDeferred();
            }
            if (leaf.view instanceof ReaderView) {
                const view = leaf.view;
                const relatedItems = this.getRelatedItems(article);
                await view.displayItem(article, relatedItems);
            }
        }
        return leaf;
    }

    
    private async openArticleInSpecificLeaf(article: FeedItem, leaf: WorkspaceLeaf): Promise<void> {
        if (leaf) {
            await leaf.setViewState({
                type: RSS_READER_VIEW_TYPE,
                active: true,
            });
            await this.app.workspace.revealLeaf(leaf);
            if (typeof (leaf as WorkspaceLeaf & { loadIfDeferred?: () => Promise<void> }).loadIfDeferred === 'function') {
                await (leaf as WorkspaceLeaf & { loadIfDeferred: () => Promise<void> }).loadIfDeferred();
            }
            if (leaf.view instanceof ReaderView) {
                const view = leaf.view;
                const relatedItems = this.getRelatedItems(article);
                await view.displayItem(article, relatedItems);
            }
        }
    }
    
    
    private getRelatedItems(article: FeedItem): FeedItem[] {
        if (!article.feedUrl) return [];
        
        
        const feed = this.settings.feeds.find((f: Feed) => f.url === article.feedUrl);
        if (!feed) return [];
        
        
        return feed.items
            .filter(item => item.guid !== article.guid)
            .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
            .slice(0, 5);
    }
    
    
    private handleToggleViewStyle(style: "list" | "card"): void {
        this.settings.viewStyle = style;
        void this.plugin.saveSettings();
        void this.render();
    }
    
    
    private async handleArticleUpdate(article: FeedItem, updates: Partial<FeedItem>, shouldRerender = true): Promise<void> {
        await this.updateArticleStatus(article, updates, shouldRerender);
    }
    
    
    private async handleArticleSave(article: FeedItem): Promise<void> {
        
        const file = this.settings.articleSaving.saveFullContent 
            ? await this.saver.saveArticleWithFullContent(article)
            : await this.saver.saveArticle(article);
        
        if (file) {
            
            await this.updateArticleStatus(article, { saved: true }, false);
            
            
            this.updateArticleSaveButton(article.guid);
            
            
            
        }
    }
    
    
    private async updateArticleStatus(article: FeedItem, updates: Partial<FeedItem>, shouldRerender = true): Promise<void> {
        
        const feed = this.settings.feeds.find((f: Feed) => f.url === article.feedUrl);
        
        if (!feed) return;

        
        const originalArticle = feed.items.find(
            (item: FeedItem) => item.guid === article.guid
        );
        
        if (!originalArticle) return;

        
        Object.assign(originalArticle, updates);
        Object.assign(article, updates);

        
        if (updates.tags) {
            originalArticle.tags = updates.tags;
            article.tags = updates.tags;
        }

        
        await this.plugin.saveSettings();

        
        if (shouldRerender) {
            void this.render();
        }
    }
    
    
    public updateArticleSaveButton(articleGuid: string): void {
        const articleEl = document.getElementById(`article-${articleGuid}`);
        if (articleEl) {
            const saveButton = articleEl.querySelector('.rss-dashboard-save-toggle');
            if (saveButton) {
                saveButton.classList.add('saved');
            }
        }
    }
    
    
    showEditFeedModal(feed: Feed): void {
        this.sidebar.showEditFeedModal(feed);
    }
    
    
    refresh(): void {
        this.render();
    }

    onClose(): Promise<void> {
        if (this.verificationTimeout) {
            window.clearTimeout(this.verificationTimeout);
        }
        if (this.articleList) {
            this.articleList.destroy();
        }
        return Promise.resolve();
    }

    
    private async handleUpdateFeed(feed: Feed): Promise<void> {
        try {
            
            new Notice(`Updating feed "${feed.title}"...`);
            
            
            const updatedFeed = await this.plugin.feedParser.parseFeed(feed.url, feed);
            
            
            if (updatedFeed) {
                const feedIndex = this.settings.feeds.findIndex(f => f.url === feed.url);
                if (feedIndex >= 0) {
                    this.settings.feeds[feedIndex] = updatedFeed;
                    await this.plugin.saveSettings();
                }
            }
            
            
            void this.render();
            new Notice(`Feed "${feed.title}" updated successfully`);
            
        } catch (error) {
            
            new Notice(`Error updating feed "${feed.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private updateRefreshButtonText(): void {
        if (!this.articleList) return;
        
        let refreshText = "Refresh all feeds";
        
        
        if (this.currentFeed) {
            refreshText = `Refresh feed: "${this.currentFeed.title}"`;
        }
        
        else if (this.currentFolder && 
                 !["read", "unread", "starred", "saved", "videos", "podcasts"].includes(this.currentFolder)) {
            const feedsInFolder = this.settings.feeds.filter(feed => {
                if (!feed.folder) return false;
                return feed.folder === this.currentFolder || feed.folder.startsWith(this.currentFolder + '/');
            });
            refreshText = `Refresh ${feedsInFolder.length} feed${feedsInFolder.length !== 1 ? 's' : ''} in folder: "${this.currentFolder}"`;
        }
        
        else if (this.currentTag) {
            const feedsWithTag = this.settings.feeds.filter(feed => 
                feed.items.some(item => item.tags && item.tags.some(tag => tag.name === this.currentTag))
            );
            refreshText = `Refresh ${feedsWithTag.length} feed${feedsWithTag.length !== 1 ? 's' : ''} with tag: "${this.currentTag}"`;
        }
        
        else {
            refreshText = `Refresh all ${this.settings.feeds.length} feeds`;
        }
        
        this.articleList.updateRefreshButtonText(refreshText);
    }

    private handleSortChange(value: 'newest' | 'oldest'): void {
        this.settings.articleSort = value;
        void this.plugin.saveSettings();
        void this.render();
    }

    private handleFilterChange(value: { type: 'age' | 'read' | 'unread' | 'starred' | 'saved' | 'none'; value: unknown; }): void {
        this.settings.articleFilter = value;
        void this.plugin.saveSettings();
        void this.render();
    }

    private handleGroupChange(value: 'none' | 'feed' | 'date' | 'folder'): void {
        this.settings.articleGroupBy = value;
        void this.plugin.saveSettings();
        void this.render();
    }

    
    private getTotalArticlesCountForCurrentView(): number {
        let articles: FeedItem[] = [];
        
        if (this.currentFeed) {
            return this.currentFeed.items.length;
        }
        
        if (this.currentFolder === "starred") {
            for (const feed of this.settings.feeds) {
                articles = articles.concat(
                    feed.items.filter((item) => item.starred)
                );
            }
        } else if (this.currentFolder === "unread") {
            for (const feed of this.settings.feeds) {
                articles = articles.concat(
                    feed.items.filter((item) => !item.read)
                );
            }
        } else if (this.currentFolder === "read") {
            for (const feed of this.settings.feeds) {
                articles = articles.concat(
                    feed.items.filter((item) => item.read)
                );
            }
        } else if (this.currentFolder === "saved") {
            for (const feed of this.settings.feeds) {
                articles = articles.concat(
                    feed.items.filter((item) => item.saved)
                );
            }
        } else if (this.currentFolder === "videos") {
            for (const feed of this.settings.feeds) {
                articles = articles.concat(
                    feed.items.filter((item) => item.mediaType === "video")
                );
            }
        } else if (this.currentFolder === "podcasts") {
            for (const feed of this.settings.feeds) {
                articles = articles.concat(
                    feed.items.filter((item) => item.mediaType === "podcast")
                );
            }
        } else if (this.currentTag) {
            for (const feed of this.settings.feeds) {
                articles = articles.concat(
                    feed.items.filter((item) => item.tags && item.tags.some(t => t.name === this.currentTag))
                );
            }
        } else if (this.currentFolder) {
            const allFolders = this.getAllDescendantFolders(this.currentFolder);
            for (const feed of this.settings.feeds) {
                if (feed.folder && allFolders.includes(feed.folder)) {
                    articles = articles.concat(feed.items);
                }
            }
        } else {
            
            for (const feed of this.settings.feeds) {
                articles = articles.concat(feed.items);
            }
        }
        
        
        if (this.settings.articleFilter.type === 'age' && typeof this.settings.articleFilter.value === 'number' && this.settings.articleFilter.value > 0) {
            const maxAge = Date.now() - this.settings.articleFilter.value;
            articles = articles.filter(a => new Date(a.pubDate).getTime() > maxAge);
        }
        
        return articles.length;
    }

    
    private getCurrentPage(): number {
        if (this.currentFeed && this.currentFeed.url) {
            return this.feedPages[this.currentFeed.url] || 1;
        } else if (this.currentFolder && !["unread", "read", "saved", "starred", "videos", "podcasts"].includes(this.currentFolder)) {
            return this.folderPages[this.currentFolder] || 1;
        } else if (this.currentFolder === null && this.currentFeed === null && this.currentTag === null) {
            return this.allArticlesPage;
        } else if (this.currentFolder === "unread") {
            return this.unreadArticlesPage;
        } else if (this.currentFolder === "read") {
            return this.readArticlesPage;
        } else if (this.currentFolder === "saved") {
            return this.savedArticlesPage;
        } else if (this.currentFolder === "starred") {
            return this.starredArticlesPage;
        } else {
            return this.allArticlesPage;
        }
    }

    
    private async findSavedArticleFile(article: FeedItem): Promise<TFile | null> {
        if (!article.saved) {
            return null;
        }
        
        
        if (article.savedFilePath) {
            try {
                const file = this.app.vault.getAbstractFileByPath(article.savedFilePath);
                if (file !== null) {
                    if (file instanceof TFile) {
                        return file;
                    }
                } else {
                    
                    await this.updateArticleStatus(article, { saved: false, savedFilePath: undefined }, false);
                    return null;
                }
            } catch {
                // File path check failed, continue with filename search
            }
        }
        
        
        const filename = this.sanitizeFilename(article.title);
        const folder = this.settings.articleSaving.defaultFolder || '';
        const expectedPath = folder && folder.trim() !== '' ? `${folder}/${filename}.md` : `${filename}.md`;
        
        try {
            const file = this.app.vault.getAbstractFileByPath(expectedPath);
            if (file !== null) {
                if (file instanceof TFile) {
                    
                    await this.updateArticleStatus(article, { savedFilePath: expectedPath }, false);
                    return file;
                }
            }
        } catch {
            // File lookup failed
        }
        
        return null;
    }
    
    
    private async openSavedArticleFile(file: TFile): Promise<void> {
        try {
            
            const leaf = this.app.workspace.getLeaf("split");
            await leaf.openFile(file);
            void this.app.workspace.revealLeaf(leaf);
            
            new Notice(`Opened saved article: ${file.basename}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Error opening saved article: ${message}`);
        }
    }
    
    
    private sanitizeFilename(name: string): string {
        
        const sanitized = name
            .replace(/[/\\:*?"<>|]/g, '') 
            .replace(/\s+/g, ' ') 
            .trim(); 

        
        const words = sanitized.split(' ');
        const shortened = words.slice(0, 5).join(' ');
        return shortened.substring(0, 50);
    }

    
    private async handleOpenSavedArticle(article: FeedItem): Promise<void> {
        if (!article.saved) {
            new Notice("Article is not saved locally");
            return;
        }
        
        
        const loadingNotice = new Notice("Opening saved article...", 0);
        
        try {
            const savedFile = await this.findSavedArticleFile(article);
            if (savedFile) {
                await this.openSavedArticleFile(savedFile);
                loadingNotice.hide();
            } else {
                
                
                await this.updateArticleStatus(article, { saved: false }, false);
                
                
                if (article.tags) {
                    article.tags = article.tags.filter(tag => tag.name.toLowerCase() !== "saved");
                }
                
                loadingNotice.hide();
                new Notice("Saved article file not found. Article status updated.");
            }
        } catch (error) {
            loadingNotice.hide();
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Error opening saved article: ${message}`);
        }
    }

    
    private async handleOpenInReaderView(article: FeedItem): Promise<void> {
        this.selectedArticle = article;
        
        if (!article.read) {
            await this.updateArticleStatus(article, { read: true }, false);
        }
        
        const readerLeaves = this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
        const results = await Promise.all(readerLeaves.map(async (leaf) => {
            if (typeof (leaf as WorkspaceLeaf & { loadIfDeferred?: () => Promise<void> }).loadIfDeferred === 'function') {
                await (leaf as WorkspaceLeaf & { loadIfDeferred: () => Promise<void> }).loadIfDeferred();
            }
            if (leaf.view instanceof ReaderView) {
                return leaf.view.isPodcastPlaying();
            }
            return false;
        }));
        const podcastPlaying = results.some(result => result);
        
        if (podcastPlaying) {
            if (this.settings.media.openInSplitView) {
                
                if (
                    this.articleReaderLeafWhilePodcast &&
                    this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE).includes(this.articleReaderLeafWhilePodcast)
                ) {
                    await this.openArticleInSpecificLeaf(article, this.articleReaderLeafWhilePodcast);
                } else {
                    
                    const newLeaf = await this.openArticleInNewTab(article);
                    this.articleReaderLeafWhilePodcast = newLeaf;
                }
            } else {
                window.open(article.link, "_blank");
            }
        } else {
            
            this.articleReaderLeafWhilePodcast = null;
            if (this.settings.media.openInSplitView) {
                
                if (readerLeaves.length > 0) {
                    await this.openArticleInSpecificLeaf(article, readerLeaves[0]);
                } else {
                    await this.openArticleInNewTab(article);
                }
            } else {
                window.open(article.link, "_blank");
            }
        }
    }

    
    private verifySavedArticles(): void {
        const allArticles = this.getFilteredArticles();
        this.saver.verifyAllSavedArticles(allArticles);
    }

    
    private handleFileDeleted(file: TFile): void {
        
        const allArticles = this.getAllArticles();
        const affectedArticles = allArticles.filter(article => 
            article.saved && article.savedFilePath === file.path
        );
        
        
        affectedArticles.forEach(article => {
            article.saved = false;
            article.savedFilePath = undefined;
            
            
            if (article.tags) {
                article.tags = article.tags.filter(tag => tag.name.toLowerCase() !== "saved");
            }
        });
        
        
        if (affectedArticles.length > 0) {
            void this.render();
        }
    }

    
    private handleFileRenamed(file: TFile, oldPath: string): void {
        
        const allArticles = this.getAllArticles();
        const affectedArticles = allArticles.filter(article => 
            article.saved && article.savedFilePath === oldPath
        );
        
        
        affectedArticles.forEach(article => {
            article.saved = false;
            article.savedFilePath = file.path;
            
            
            if (article.tags) {
                article.tags = article.tags.filter(tag => tag.name.toLowerCase() !== "saved");
            }
        });
        
        
        if (affectedArticles.length > 0) {
            void this.render();
        }
    }

    
    private getAllArticles(): FeedItem[] {
        let allArticles: FeedItem[] = [];
        for (const feed of this.settings.feeds) {
            allArticles = allArticles.concat(feed.items);
        }
        return allArticles;
    }

    private handlePageChange(page: number): void {
        if (this.currentFeed && this.currentFeed.url) {
            this.feedPages[this.currentFeed.url] = page;
        } else if (this.currentFolder && !["unread", "read", "saved", "starred", "videos", "podcasts"].includes(this.currentFolder)) {
            this.folderPages[this.currentFolder] = page;
        } else if (this.currentFolder === null && this.currentFeed === null && this.currentTag === null) {
            this.allArticlesPage = page;
        } else if (this.currentFolder === "unread") {
            this.unreadArticlesPage = page;
        } else if (this.currentFolder === "read") {
            this.readArticlesPage = page;
        } else if (this.currentFolder === "saved") {
            this.savedArticlesPage = page;
        } else if (this.currentFolder === "starred") {
            this.starredArticlesPage = page;
        }
        void this.render();
    }

    private handlePageSizeChange(pageSize: number): void {
        if (this.currentFeed && this.currentFeed.url) {
            this.feedPageSizes[this.currentFeed.url] = pageSize;
        } else if (this.currentFolder && !["unread", "read", "saved", "starred", "videos", "podcasts"].includes(this.currentFolder)) {
            this.folderPageSizes[this.currentFolder] = pageSize;
        } else if (this.currentFolder === null && this.currentFeed === null && this.currentTag === null) {
            this.settings.allArticlesPageSize = pageSize;
        } else if (this.currentFolder === "unread") {
            this.settings.unreadArticlesPageSize = pageSize;
        } else if (this.currentFolder === "read") {
            this.settings.readArticlesPageSize = pageSize;
        } else if (this.currentFolder === "saved") {
            this.settings.savedArticlesPageSize = pageSize;
        } else if (this.currentFolder === "starred") {
            this.settings.starredArticlesPageSize = pageSize;
        }
        void this.render();
    }

    private getAllFilteredArticles(): FeedItem[] {
        
        let articles: FeedItem[] = [];
        
        if (this.currentFeed) {
            const limit = this.currentFeed.maxItemsLimit || this.settings.maxItems;
            articles = this.currentFeed.items.slice(0, limit);
        } else {
            
            if (this.currentFolder === "starred") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.starred)
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url
                            }))
                    );
                }
            }
            
            else if (this.currentFolder === "unread") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => !item.read)
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentFolder === "read") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.read)
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentFolder === "saved") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.saved)
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentFolder === "videos") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.mediaType === "video")
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentFolder === "podcasts") {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.mediaType === "podcast")
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentTag) {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .filter((item) => item.tags && item.tags.some(t => t.name === this.currentTag))
                            .map((item) => ({
                                ...item,
                                feedTitle: feed.title,
                                feedUrl: feed.url,
                            }))
                    );
                }
            }
            
            else if (this.currentFolder) {
                
                const allFolders = this.getAllDescendantFolders(this.currentFolder);
                for (const feed of this.settings.feeds) {
                    if (feed.folder && allFolders.includes(feed.folder)) {
                        articles = articles.concat(
                            feed.items
                                .map((item) => ({
                                    ...item,
                                    feedTitle: feed.title,
                                    feedUrl: feed.url,
                                }))
                        );
                    }
                }
            }
            
            else {
                for (const feed of this.settings.feeds) {
                    articles = articles.concat(
                        feed.items
                            .map((item) => ({
                            ...item,
                            feedTitle: feed.title,
                            feedUrl: feed.url,
                        }))
                    );
                }
            }
        }
        
        if (this.settings.articleFilter.type === 'age' && typeof this.settings.articleFilter.value === 'number' && this.settings.articleFilter.value > 0) {
            const maxAge = Date.now() - this.settings.articleFilter.value;
            articles = articles.filter(a => new Date(a.pubDate).getTime() > maxAge);
        }

        if (this.settings.articleSort === 'oldest') {
            articles.sort((a, b) => new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime());
        } else {
            articles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
        }

        return articles;
    }

    private getCurrentPageSize(): number {
        if (this.currentFeed && this.currentFeed.url) {
            return this.feedPageSizes[this.currentFeed.url] || this.settings.allArticlesPageSize;
        } else if (this.currentFolder && !["unread", "read", "saved", "starred", "videos", "podcasts"].includes(this.currentFolder)) {
            return this.folderPageSizes[this.currentFolder] || this.settings.allArticlesPageSize;
        } else if (this.currentFolder === null && this.currentFeed === null && this.currentTag === null) {
            return this.settings.allArticlesPageSize;
        } else if (this.currentFolder === "unread") {
            return this.settings.unreadArticlesPageSize;
        } else if (this.currentFolder === "read") {
            return this.settings.readArticlesPageSize;
        } else if (this.currentFolder === "saved") {
            return this.settings.savedArticlesPageSize;
        } else if (this.currentFolder === "starred") {
            return this.settings.starredArticlesPageSize;
        }
        return this.settings.allArticlesPageSize;
    }
}
