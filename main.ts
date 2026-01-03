import {
    Plugin,
    Notice,
    WorkspaceLeaf,
    setIcon,
    Setting,
    Platform,
    requireApiVersion
} from "obsidian";

import { 
    RssDashboardSettings,
    DEFAULT_SETTINGS,
    Feed,
    FeedItem,
    FeedMetadata
} from "./src/types/types";

import { RssDashboardSettingTab } from "./src/settings/settings-tab";
import { RssDashboardView, RSS_DASHBOARD_VIEW_TYPE } from "./src/views/dashboard-view";
import { DiscoverView, RSS_DISCOVER_VIEW_TYPE } from "./src/views/discover-view";
import { ReaderView, RSS_READER_VIEW_TYPE } from "./src/views/reader-view";
import { FeedParser } from "./src/services/feed-parser";
import { ArticleSaver } from "./src/services/article-saver";
import { OpmlManager } from "./src/services/opml-manager";
import { MediaService } from "./src/services/media-service";
import { sleep, setCssProps } from "./src/utils/platform-utils";

export default class RssDashboardPlugin extends Plugin {
    settings!: RssDashboardSettings;
    feedParser!: FeedParser;
    articleSaver!: ArticleSaver;
    private importStatusBarItem: HTMLElement | null = null;
    public backgroundImportQueue: FeedMetadata[] = [];
    private isBackgroundImporting = false;
    
    public async getActiveDashboardView(): Promise<RssDashboardView | null> {
        const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
        for (const leaf of leaves) {
            if (requireApiVersion('1.7.2')) {
                await leaf.loadIfDeferred();
            }
            const view = leaf.view;
            if (view instanceof RssDashboardView) {
                return view;
            }
        }
        return null;
    }
    
    public async getActiveDiscoverView(): Promise<DiscoverView | null> {
        const leaves = this.app.workspace.getLeavesOfType(RSS_DISCOVER_VIEW_TYPE);
        for (const leaf of leaves) {
            if (requireApiVersion('1.7.2')) {
                await leaf.loadIfDeferred();
            }
            const view = leaf.view;
            if (view instanceof DiscoverView) {
                return view;
            }
        }
        return null;
    }
    
    public async getActiveReaderView(): Promise<ReaderView | null> {
        const leaves = this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
        for (const leaf of leaves) {
            if (requireApiVersion('1.7.2')) {
                await leaf.loadIfDeferred();
            }
            const view = leaf.view;
            if (view instanceof ReaderView) {
                return view;
            }
        }
        return null;
    }

    async onload() {
        
        
        
        
        await this.loadSettings();
        
        const view = await this.getActiveDashboardView();
        if (view) {
            view.render();
        }
        
        try {
            
            this.feedParser = new FeedParser(this.settings.media, this.settings.availableTags);
            this.articleSaver = new ArticleSaver(this.app, this.settings.articleSaving);
            
            
            if (Platform.isMobile) {
                
                this.applyMobileOptimizations();
            }
            
            
            const allArticles = this.getAllArticles();
            await this.articleSaver.fixSavedFilePaths(allArticles);
            
            
            await this.validateSavedArticles();
            
            this.registerView(
                RSS_DASHBOARD_VIEW_TYPE,
                (leaf) => new RssDashboardView(leaf, this)
            );

            this.registerView(
                RSS_DISCOVER_VIEW_TYPE,
                (leaf) => new DiscoverView(leaf, this)
            );
            
            this.registerView(
                RSS_READER_VIEW_TYPE,
                (leaf) => new ReaderView(
                    leaf, 
                    this.settings, 
                    this.articleSaver,
                    (item: FeedItem) => { void this.onArticleSaved(item); }
                )
            );
    
            
            this.addRibbonIcon("rss", "RSS dashboard", () => {
                void this.activateView();
            });

            this.addRibbonIcon("lucide-compass", "RSS discover", () => {
                void this.activateDiscoverView();
            });
    
            
            this.addSettingTab(new RssDashboardSettingTab(this.app, this));
    
            
            this.addCommand({
                id: "open-dashboard",
                name: "Open dashboard",
                callback: () => {
                    void this.activateView();
                },
            });

            this.addCommand({
                id: "open-discover",
                name: "Open discover",
                callback: () => {
                    void this.activateDiscoverView();
                },
            });
    
            this.addCommand({
                id: "refresh-feeds",
                name: "Refresh feeds",
                callback: () => {
                    void this.refreshFeeds();
                },
            });
    
            this.addCommand({
                id: "import-opml",
                name: "Import opml",
                callback: () => {
                    void this.importOpml();
                },
            });
    
            this.addCommand({
                id: "export-opml",
                name: "Export opml",
                callback: () => {
                    void this.exportOpml();
                },
            });
    
            this.addCommand({
                id: "apply-feed-limits",
                name: "Apply feed limits to all feeds",
                callback: () => {
                    void this.applyFeedLimitsToAllFeeds();
                },
            });
    
            this.addCommand({
                id: "toggle-sidebar",
                name: "Toggle sidebar",
                checkCallback: (checking: boolean) => {
                    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
                    if (leaves.length > 0) {
                        if (!checking) {
                            void (async () => {
                                const view = await this.getActiveDashboardView();
                                if (view) {
                                    this.settings.sidebarCollapsed = !this.settings.sidebarCollapsed;
                                    await this.saveSettings();
                                    view.render();
                                }
                            })();
                        }
                        return true;
                    }
                    return false;
                },
            });
    
            
            this.registerInterval(
                window.setInterval(
                    () => { void this.refreshFeeds(); },
                    this.settings.refreshInterval * 60 * 1000
                )
            );
            
            
        } catch {
            
            new Notice("Error initializing RSS dashboard plugin.");
        }
    }

    
    private applyMobileOptimizations(): void {
        
        if (this.settings.refreshInterval < 60) {
            this.settings.refreshInterval = 60; 
            
        }
        
        
        if (this.settings.maxItems > 50) {
            this.settings.maxItems = 50;
            
        }
        
        
        if (this.settings.viewStyle === "list") {
            this.settings.viewStyle = "card";
            
        }
        
        
        if (!this.settings.sidebarCollapsed) {
            this.settings.sidebarCollapsed = true;
            
        }
    }

    async activateView() {
        const { workspace } = this.app;

        try {
            let leaf: WorkspaceLeaf | null = null;
            const leaves = workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    
            if (leaves.length > 0) {
                
                leaf = leaves[0];
            } else {
                
                switch (this.settings.viewLocation) {
                    case "left-sidebar":
                        leaf = workspace.getLeftLeaf(false);
                        break;
                    case "right-sidebar":
                        leaf = workspace.getRightLeaf(false);
                        break;
                    default:
                        leaf = workspace.getLeaf("tab");
                        break;
                }
                }
    
                if (leaf) {
                    await leaf.setViewState({
                        type: RSS_DASHBOARD_VIEW_TYPE,
                        active: true,
                    });
                void workspace.revealLeaf(leaf);
            }
        } catch {
            
            new Notice("Error opening RSS dashboard view");
        }
    }

    async activateDiscoverView() {
        const { workspace } = this.app;

        try {
            let leaf: WorkspaceLeaf | null = null;
            const leaves = workspace.getLeavesOfType(RSS_DISCOVER_VIEW_TYPE);
    
            if (leaves.length > 0) {
                leaf = leaves[0];
            } else {
                switch (this.settings.viewLocation) {
                    case "left-sidebar":
                        leaf = workspace.getLeftLeaf(false);
                        break;
                    case "right-sidebar":
                        leaf = workspace.getRightLeaf(false);
                        break;
                    default:
                        leaf = workspace.getLeaf("tab");
                        break;
                }
            }
    
            if (leaf) {
                await leaf.setViewState({
                    type: RSS_DISCOVER_VIEW_TYPE,
                    active: true,
                });
                void workspace.revealLeaf(leaf);
            }
        } catch {
            
            new Notice("Error opening RSS discover view");
        }
    }
    
    private async onArticleSaved(item: FeedItem): Promise<void> {
        
        if (item.feedUrl) {
            const feed = this.settings.feeds.find(f => f.url === item.feedUrl);
            if (feed) {
                const originalItem = feed.items.find(i => i.guid === item.guid);
                if (originalItem) {
                    originalItem.saved = true;
                    
                    
                    if (this.settings.articleSaving.addSavedTag) {
                        if (!originalItem.tags) {
                            originalItem.tags = [];
                        }
                        
                        
                        if (!originalItem.tags.some(t => t.name.toLowerCase() === "saved")) {
                            const savedTag = this.settings.availableTags.find(t => t.name.toLowerCase() === "saved");
                            if (savedTag) {
                                originalItem.tags.push({ ...savedTag });
                            } else {
                                originalItem.tags.push({ name: "saved", color: "#3498db" });
                            }
                        }
                    }
                    
                    void this.saveSettings();
                    
                    
                    const view = await this.getActiveDashboardView();
                    if (view) {
                        view.updateArticleSaveButton(item.guid);
                    }
                }
            }
        }
    }

    async refreshFeeds(selectedFeeds?: Feed[]) {
        try {
            const feedsToRefresh = selectedFeeds || this.settings.feeds;
            let feedNoticeText = '';
            if (feedsToRefresh.length === 1) {
                feedNoticeText = feedsToRefresh[0].title;
            } else {
                feedNoticeText = `${feedsToRefresh.length} feeds`;
            }
            
            new Notice(`Refreshing ${feedNoticeText}...`);
            const updatedFeeds = await this.feedParser.refreshAllFeeds(feedsToRefresh);
            
            updatedFeeds.forEach(updatedFeed => {
                const index = this.settings.feeds.findIndex(f => f.url === updatedFeed.url);
                if (index >= 0) {
                    this.settings.feeds[index] = updatedFeed;
                }
            });
            
            await this.validateSavedArticles();
            await this.saveSettings();
            const view = await this.getActiveDashboardView();
            if (view) {
                view.refresh();
                new Notice(`Feeds refreshed: ${feedNoticeText}`);
            }
        } catch (error) {
            console.error(`[RSS dashboard] Error refreshing feeds:`, error);
            new Notice(`Error refreshing  ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Apply feed limits (maxItemsLimit and autoDeleteDuration) to all feeds
     * This is useful when users want to apply their current settings to existing feeds
     */
    async applyFeedLimitsToAllFeeds() {
        try {
            let updatedCount = 0;
            
            for (const feed of this.settings.feeds) {
                const originalCount = feed.items.length;
                
                
                if (feed.maxItemsLimit && feed.maxItemsLimit > 0 && feed.items.length > feed.maxItemsLimit) {
                    
                    const readItems = feed.items.filter(item => item.read);
                    const unreadItems = feed.items.filter(item => !item.read);
                    
                    
                    unreadItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
                    
                    
                    const maxUnreadItems = Math.max(0, feed.maxItemsLimit - readItems.length);
                    const limitedUnreadItems = unreadItems.slice(0, maxUnreadItems);
                    
                    
                    feed.items = [...readItems, ...limitedUnreadItems];
                }

                
                if (feed.autoDeleteDuration && feed.autoDeleteDuration > 0) {
                    const cutoffDate = new Date();
                    cutoffDate.setDate(cutoffDate.getDate() - feed.autoDeleteDuration);
                    
                    
                    const readItems = feed.items.filter(item => item.read);
                    const unreadItems = feed.items.filter(item => !item.read && 
                        new Date(item.pubDate).getTime() > cutoffDate.getTime()
                    );
                    
                    feed.items = [...readItems, ...unreadItems];
                }
                
                if (feed.items.length !== originalCount) {
                    updatedCount++;
                }
            }
            
            await this.saveSettings();
            const view = await this.getActiveDashboardView();
            if (view) {
                view.refresh();
            }
            
            if (updatedCount > 0) {
                new Notice(`Applied limits to ${updatedCount} feeds`);
            } else {
                new Notice("No feeds needed limit adjustments");
            }
        } catch (error) {
            
            new Notice(`Error applying feed limits: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async refreshSelectedFeed(feed: Feed) {
        await this.refreshFeeds([feed]);
    }

    async refreshFeedsInFolder(folderPath: string) {
        const feedsInFolder = this.settings.feeds.filter(feed => {
            if (!feed.folder) return false;
            return feed.folder === folderPath || feed.folder.startsWith(folderPath + '/');
        });
        
        if (feedsInFolder.length > 0) {
            await this.refreshFeeds(feedsInFolder);
        } else {
            new Notice("No feeds found in the selected folder");
        }
    }

    
    async updateArticle(
        articleGuid: string,
        feedUrl: string,
        updates: Partial<FeedItem>
    ) {
        
        const feed = this.settings.feeds.find((f) => f.url === feedUrl);
        if (!feed) return;

        
        const article = feed.items.find((item) => item.guid === articleGuid);
        if (!article) return;

        
        Object.assign(article, updates);

        
        await this.saveSettings();

        
        const view = await this.getActiveDashboardView();
        if (view) {
            view.refresh();
        }
    }

    private showImportProgressModal(totalFeeds: number, onMinimize: () => void, onAbort: () => void): HTMLElement {
        const modal = document.body.createDiv({
            cls: "rss-dashboard-modal rss-dashboard-modal-container rss-dashboard-import-modal"
        });

        const modalContent = modal.createDiv({
            cls: "rss-dashboard-modal-content"
        });

        const modalHeader = modalContent.createDiv({
            cls: "rss-dashboard-import-modal-header"
        });

        new Setting(modalHeader).setName("Importing opml feeds").setHeading();

        const minimizeButton = modalHeader.createEl("button", {
            cls: "clickable-icon",
            attr: { "aria-label": "Minimize" }
        });
        setIcon(minimizeButton, "minus");
        minimizeButton.onclick = onMinimize;

        
        const abortButton = modalHeader.createEl("button", {
            text: "Abort",
            cls: "rss-dashboard-import-abort-button"
        });
        abortButton.onclick = onAbort;

        const buttonGroup = modalHeader.createDiv({
            cls: "import-modal-header-buttons"
        });
        buttonGroup.appendChild(minimizeButton);
        buttonGroup.appendChild(abortButton);

        modalContent.createDiv({
            attr: { id: "import-progress-text" },
            cls: "rss-dashboard-center-text rss-dashboard-import-progress-text",
            text: `Preparing to import ${totalFeeds} feeds...`
        });

        const progressBar = modalContent.createDiv({
            cls: "rss-dashboard-import-progress-bar"
        });

        const progressFill = progressBar.createDiv({
            attr: { id: "import-progress-fill" },
            cls: "rss-dashboard-import-progress-fill"
        });
        setCssProps(progressFill, { '--progress-width': '0%' });

        modalContent.createDiv({
            attr: { id: "import-current-feed" },
            cls: "rss-dashboard-center-text rss-dashboard-import-current-feed"
        });

        return modal;
    }

    importOpml(): void {
        const input = document.body.createEl("input", {
            attr: { type: "file" }
        });
        input.onchange = async () => {
            const file = input.files?.[0];
            if (file && file.name.endsWith('.opml')) {
                const content = await file.text();
                try {
                    
                    const { feeds: newFeedsMetadata, folders: newFolders } = OpmlManager.parseOpmlMetadata(content);

                    const feedsToAdd = newFeedsMetadata.filter(newFeed => 
                        !this.settings.feeds.some(f => f.url === newFeed.url)
                    );

                    if (feedsToAdd.length === 0) {
                        new Notice("No new feeds found in the opml file.");
                        return;
                    }

                    
                    const addedFeeds: Feed[] = [];
                    for (const feedMetadata of feedsToAdd) {
                            const feedToAdd: Feed = {
                            title: feedMetadata.title,
                            url: feedMetadata.url,
                            folder: feedMetadata.folder,
                            items: [], 
                                lastUpdated: Date.now(),
                            mediaType: feedMetadata.mediaType || "article",
                            autoDeleteDuration: feedMetadata.autoDeleteDuration,
                            maxItemsLimit: feedMetadata.maxItemsLimit || 50,
                            scanInterval: feedMetadata.scanInterval
                            };

                        
                        if (feedToAdd.mediaType === 'video' && (!feedToAdd.folder || feedToAdd.folder === 'Uncategorized')) {
                                feedToAdd.folder = this.settings.media.defaultYouTubeFolder;
                        } else if (feedToAdd.mediaType === 'podcast' && (!feedToAdd.folder || feedToAdd.folder === 'Uncategorized')) {
                                feedToAdd.folder = this.settings.media.defaultPodcastFolder;
                            }

                            addedFeeds.push(feedToAdd);
                    }

                    
                        this.settings.feeds.push(...addedFeeds);
                        this.settings.folders = OpmlManager.mergeFolders(this.settings.folders, newFolders);
                        await this.saveSettings();

                    
                    const view = await this.getActiveDashboardView();
                    if (view) {
                        view.render();
                        }

                    new Notice(`Imported ${addedFeeds.length} feeds. Articles will be fetched in the background.`);

                    
                    void this.startBackgroundImport(addedFeeds);

                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    new Notice(message);
                }
            } else {
                new Notice("Please select a valid opml file.");
            }
        };
        input.click();
    }

    private startBackgroundImport(feeds: Feed[]): void {
        
        this.backgroundImportQueue.push(...feeds.map(feed => ({
            ...feed,
            importStatus: 'pending' as const
        })));

        
        if (!this.isBackgroundImporting) {
            void this.processBackgroundImportQueue();
        }
    }

    private async processBackgroundImportQueue() {
        if (this.isBackgroundImporting || this.backgroundImportQueue.length === 0) {
            return;
        }

        this.isBackgroundImporting = true;

        
        if (!this.importStatusBarItem) {
            this.importStatusBarItem = this.addStatusBarItem();
            this.importStatusBarItem.textContent = '';
            const iconSpan = this.importStatusBarItem.createSpan({
                cls: 'import-statusbar-icon'
            });
            setIcon(iconSpan, 'rss');
            this.importStatusBarItem.createSpan({
                cls: 'import-statusbar-text'
            });
        }

        const totalFeeds = this.backgroundImportQueue.length;
        let processedCount = 0;

        while (this.backgroundImportQueue.length > 0) {
            const feedMetadata = this.backgroundImportQueue.shift();
            if (!feedMetadata) break;
            
            try {
                
                feedMetadata.importStatus = 'processing';
                this.updateBackgroundImportProgress(processedCount, totalFeeds, feedMetadata.title);

                
                const parsedFeed = await this.feedParser.parseFeed(feedMetadata.url);
                
                
                const feedIndex = this.settings.feeds.findIndex(f => f.url === feedMetadata.url);
                if (feedIndex >= 0) {
                    this.settings.feeds[feedIndex] = {
                        ...this.settings.feeds[feedIndex],
                        title: parsedFeed.title || feedMetadata.title,
                        items: parsedFeed.items.slice(0, 50),
                        lastUpdated: Date.now(),
                        mediaType: parsedFeed.mediaType
                    };
                }

                feedMetadata.importStatus = 'completed';
                processedCount++;

            } catch (error) {
                
                feedMetadata.importStatus = 'failed';
                feedMetadata.importError = error instanceof Error ? error.message : 'Unknown error';
                processedCount++;
            }

            
            if (processedCount % 5 === 0) {
                await this.saveSettings();
            }

            
            const view = await this.getActiveDashboardView();
            if (view && processedCount % 3 === 0) {
                view.render();
        }

            
            await sleep(100);
        }

        
        await this.saveSettings();
        const view = await this.getActiveDashboardView();
        if (view) {
            view.render();
        }

        
        if (this.importStatusBarItem) {
            this.importStatusBarItem.remove();
            this.importStatusBarItem = null;
        }

        this.isBackgroundImporting = false;
        new Notice(`Background import completed. Processed ${processedCount} feeds.`);
    }

    private updateBackgroundImportProgress(current: number, total: number, currentFeedTitle: string): void {
        if (this.importStatusBarItem) {
            const textSpan = this.importStatusBarItem.querySelector('.import-statusbar-text');
            if (textSpan) {
                textSpan.textContent = `  Fetching articles: ${current}/${total} - ${currentFeedTitle}`;
            }
        }
    }

    exportOpml(): void {
        
        const opmlContent = OpmlManager.generateOpml(
            this.settings.feeds,
            this.settings.folders
        );

        
        const blob = new Blob([opmlContent], { type: "text/xml" });
        const url = URL.createObjectURL(blob);
        const a = document.body.createEl("a", {
            attr: { href: url }
        });
        a.download = "obsidian-rss-feeds.opml";
        a.click();
        URL.revokeObjectURL(url);
    }

    
    async addFolder(folderName: string) {
        
        const folderExists = this.settings.folders.some(f => f.name === folderName);
        
        if (!folderExists) {
            
            this.settings.folders.push({ name: folderName, subfolders: [] });
            await this.saveSettings();
            
            const view = await this.getActiveDashboardView();
            if (view) {
                void view.refresh();
                new Notice(`Folder "${folderName}" created`);
            }
        } else {
            new Notice(`Folder "${folderName}" already exists`);
        }
    }

    
    async addFeed(title: string, url: string, folder: string, autoDeleteDuration?: number, maxItemsLimit?: number, scanInterval?: number) {
        try {
            if (this.settings.feeds.some((f) => f.url === url)) {
                new Notice("This feed URL already exists");
                return;
            }

          
            let mediaType: 'article' | 'video' | 'podcast' = 'article';
            if (folder === this.settings.media.defaultYouTubeFolder) {
                mediaType = 'video';
            } else if (folder === this.settings.media.defaultPodcastFolder) {
                mediaType = 'podcast';
            }

            const newFeed: Feed = {
                title,
                url,
                folder,
                items: [],
                lastUpdated: Date.now(),
                autoDeleteDuration: autoDeleteDuration || 0,
                maxItemsLimit: maxItemsLimit || this.settings.maxItems,
                scanInterval: scanInterval || 0,
                mediaType: mediaType
            };

            this.settings.feeds.push(newFeed);
            await this.saveSettings();

            try {
                const parsedFeed = await this.feedParser.parseFeed(url, newFeed);
                const index = this.settings.feeds.findIndex(f => f.url === url);
                if (index >= 0) {
                    this.settings.feeds[index] = parsedFeed;
                }
                await this.saveSettings();
            } catch (error) {
                
                new Notice(`Error parsing feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            const view = await this.getActiveDashboardView();
            if (view) {
                void view.refresh();
            }
            new Notice(`Feed "${title}" added`);
        } catch (error) {
            
            new Notice(`Error adding feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    
    async addYouTubeFeed(input: string, customTitle?: string) {
        try {
            
            const feedUrl = await MediaService.getYouTubeRssFeed(input);
            
            if (!feedUrl) {
                new Notice("Unable to determine YouTube feed URL from input");
                return;
            }
            
            
            if (this.settings.feeds.some(f => f.url === feedUrl)) {
                new Notice("This YouTube feed already exists");
                return;
            }
            
            
            const title = customTitle || `YouTube: ${input}`;
            await this.addFeed(title, feedUrl, this.settings.media.defaultYouTubeFolder);
            
        } catch (error) {
            
            new Notice(`Error adding YouTube feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    
    async addSubfolder(parentFolderName: string, subfolderName: string) {
        
        const parentFolder = this.settings.folders.find(
            (f) => f.name === parentFolderName
        );
        
        if (parentFolder) {
            
            if (!parentFolder.subfolders.some((sf) => sf.name === subfolderName)) {
                parentFolder.subfolders.push({
                    name: subfolderName,
                    subfolders: [],
                });
                
                await this.saveSettings();
                
                const view = await this.getActiveDashboardView();
                if (view) {
                    void view.refresh();
                    new Notice(`Subfolder "${subfolderName}" created under "${parentFolderName}"`);
                }
            } else {
                new Notice(`Subfolder "${subfolderName}" already exists in "${parentFolderName}"`);
            }
        }
    }

    
    async editFeed(feed: Feed, newTitle: string, newUrl: string, newFolder: string) {
        const oldTitle = feed.title;
        feed.title = newTitle;
        feed.url = newUrl;
        feed.folder = newFolder;
        
        // Update feedTitle for all articles in this feed when the title changes
        if (oldTitle !== newTitle) {
            for (const item of feed.items) {
                item.feedTitle = newTitle;
            }
        }
        
        await this.saveSettings();
        
        const view = await this.getActiveDashboardView();
        if (view) {
            void view.refresh();
            new Notice(`Feed "${newTitle}" updated`);
        }
    }

    async loadSettings() {
        try {
            const data = await this.loadData() as RssDashboardSettings | null;
            
            
            this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
            
            
            this.migrateLegacySettings();
            
            
            if (!this.settings.readerViewLocation) {
                this.settings.readerViewLocation = "right-sidebar";
            }
            
            if (this.settings.useWebViewer === undefined) {
                this.settings.useWebViewer = true;
            }
            
            
            if (!this.settings.articleSaving) {
                this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
            } else {
                
                this.settings.articleSaving = Object.assign({}, DEFAULT_SETTINGS.articleSaving, this.settings.articleSaving);
            }

            // Ensure display settings are properly initialized
            if (!this.settings.display) {
                this.settings.display = DEFAULT_SETTINGS.display;
            } else {
                this.settings.display = Object.assign({}, DEFAULT_SETTINGS.display, this.settings.display);
            }
        } catch (error) {
            
            new Notice(`Error loading settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
            this.settings = DEFAULT_SETTINGS;
        }
    }
    
    
    private migrateLegacySettings(): void {
        
        const settingsUnknown = this.settings as unknown as Record<string, unknown>;
        if (settingsUnknown.savePath && !this.settings.articleSaving?.defaultFolder) {
            if (!this.settings.articleSaving) {
                this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
            }
            this.settings.articleSaving.defaultFolder = settingsUnknown.savePath as string;
            delete settingsUnknown.savePath;
        }
        
        
        if (settingsUnknown.template && !this.settings.articleSaving?.defaultTemplate) {
            if (!this.settings.articleSaving) {
                this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
            }
            this.settings.articleSaving.defaultTemplate = settingsUnknown.template as string;
            delete settingsUnknown.template;
        }
        
        
        if (settingsUnknown.addSavedTag !== undefined && this.settings.articleSaving?.addSavedTag === undefined) {
            if (!this.settings.articleSaving) {
                this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
            }
            this.settings.articleSaving.addSavedTag = settingsUnknown.addSavedTag as boolean;
            delete settingsUnknown.addSavedTag;
        }
        
        
        const articleSavingUnknown = this.settings.articleSaving as unknown as Record<string, unknown>;
        if (articleSavingUnknown.template && !this.settings.articleSaving?.defaultTemplate) {
            this.settings.articleSaving.defaultTemplate = articleSavingUnknown.template as string;
            delete articleSavingUnknown.template;
        }

        // Migrate display settings
        if (!this.settings.display) {
            this.settings.display = DEFAULT_SETTINGS.display;
        } else {
            // Ensure new display properties exist
            if (this.settings.display.filterDisplayStyle === undefined) {
                this.settings.display.filterDisplayStyle = DEFAULT_SETTINGS.display.filterDisplayStyle;
            }
            if (this.settings.display.defaultFilter === undefined) {
                this.settings.display.defaultFilter = DEFAULT_SETTINGS.display.defaultFilter;
            }
            if (this.settings.display.hiddenFilters === undefined) {
                this.settings.display.hiddenFilters = DEFAULT_SETTINGS.display.hiddenFilters;
            }
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        
    }

    
    private async validateSavedArticles(): Promise<void> {
        
        let updatedCount = 0;
        
        for (const feed of this.settings.feeds) {
            for (const item of feed.items) {
                if (item.saved) {
                    const fileExists = this.checkSavedFileExists(item);
                    if (!fileExists) {
                        
                        item.saved = false;
                        
                        
                        if (item.tags) {
                            item.tags = item.tags.filter(tag => tag.name.toLowerCase() !== "saved");
                        }
                        
                        updatedCount++;
                    }
                }
            }
        }
        
        if (updatedCount > 0) {
            
            await this.saveSettings();
            
            
            const view = await this.getActiveDashboardView();
            if (view) {
                view.render();
            }
        }
    }
    
    
    private checkSavedFileExists(item: FeedItem): boolean {
        try {
            
            const folder = this.settings.articleSaving.defaultFolder || "RSS articles";
            const filename = this.sanitizeFilename(item.title);
            const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;
            
            
            return this.app.vault.getAbstractFileByPath(filePath) !== null;
        } catch {
            
            return false;
        }
    }
    
    
    private sanitizeFilename(name: string): string {
        return name
            .replace(/[/\\:*?"<>|]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 100);
    }

    
    private getAllArticles(): FeedItem[] {
        let allArticles: FeedItem[] = [];
        for (const feed of this.settings.feeds) {
            allArticles = allArticles.concat(feed.items);
        }
        return allArticles;
    }
}
