import {
    App,
    Plugin,
    Notice,
    TFile,
    requestUrl,
    WorkspaceLeaf,
    setIcon
} from "obsidian";

import { 
    RssDashboardSettings,
    DEFAULT_SETTINGS,
    Feed,
    FeedItem,
    Folder,
    Tag,
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
import { detectPlatform, logPlatformInfo, getPlatformRecommendations } from "./src/utils/platform-utils";

export default class RssDashboardPlugin extends Plugin {
    settings: RssDashboardSettings;
    view: RssDashboardView;
    discoverView: DiscoverView;
    readerView: ReaderView;
    feedParser: FeedParser;
    articleSaver: ArticleSaver;
    private platformInfo: any;
    private importStatusBarItem: HTMLElement | null = null;
    private backgroundImportQueue: FeedMetadata[] = [];
    private isBackgroundImporting = false;

    async onload() {
        
        
        
        this.platformInfo = detectPlatform();
        logPlatformInfo();
        
        
        const recommendations = getPlatformRecommendations();
        if (recommendations.length > 0) {
            
        }
        
        await this.loadSettings();
        
        if (this.view) {
            await this.view.render();
        }
        
        try {
            
            this.feedParser = new FeedParser(this.settings.media, this.settings.availableTags);
            this.articleSaver = new ArticleSaver(this.app.vault, this.settings.articleSaving);
            
            
            if (this.platformInfo.isMobile) {
                
                this.applyMobileOptimizations();
            }
            
            
            const allArticles = this.getAllArticles();
            await this.articleSaver.fixSavedFilePaths(allArticles);
            
            
            await this.validateSavedArticles();
            
            this.registerView(
                RSS_DASHBOARD_VIEW_TYPE,
                (leaf) => {
                    
                    this.view = new RssDashboardView(leaf, this);
                    return this.view;
                }
            );

            this.registerView(
                RSS_DISCOVER_VIEW_TYPE,
                (leaf) => {
                    this.discoverView = new DiscoverView(leaf, this);
                    return this.discoverView;
                }
            );
            
            this.registerView(
                RSS_READER_VIEW_TYPE,
                (leaf) => {
                    
                    this.readerView = new ReaderView(
                        leaf, 
                        this.settings, 
                        this.articleSaver,
                        this.onArticleSaved.bind(this)
                    );
                    return this.readerView;
                }
            );
    
            
            this.addRibbonIcon("rss", "RSS Dashboard", () => {
                this.activateView();
            });

            this.addRibbonIcon("lucide-compass", "RSS Discover", () => {
                this.activateDiscoverView();
            });
    
            
            this.addSettingTab(new RssDashboardSettingTab(this.app, this));
    
            
            this.addCommand({
                id: "open-rss-dashboard",
                name: "Open RSS Dashboard",
                callback: () => {
                    this.activateView();
                },
            });

            this.addCommand({
                id: "open-rss-discover",
                name: "Open RSS Discover",
                callback: () => {
                    this.activateDiscoverView();
                },
            });
    
            this.addCommand({
                id: "refresh-rss-feeds",
                name: "Refresh RSS Feeds",
                callback: () => {
                    this.refreshFeeds();
                },
            });
    
            this.addCommand({
                id: "import-opml",
                name: "Import OPML",
                callback: () => {
                    this.importOpml();
                },
            });
    
            this.addCommand({
                id: "export-opml",
                name: "Export OPML",
                callback: () => {
                    this.exportOpml();
                },
            });
    
            this.addCommand({
                id: "apply-feed-limits",
                name: "Apply Feed Limits to All Feeds",
                callback: () => {
                    this.applyFeedLimitsToAllFeeds();
                },
            });
    
            this.addCommand({
                id: "toggle-rss-sidebar",
                name: "Toggle RSS Dashboard Sidebar",
                callback: async () => {
                    if (this.view) {
                        this.settings.sidebarCollapsed = !this.settings.sidebarCollapsed;
                        await this.saveSettings();
                        await this.view.render();
                    }
                },
            });
    
            
            this.registerInterval(
                window.setInterval(
                    () => this.refreshFeeds(),
                    this.settings.refreshInterval * 60 * 1000
                )
            );
            
            
        } catch (error) {
            
            new Notice("Error initializing RSS Dashboard plugin. Check console for details.");
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
                workspace.revealLeaf(leaf);
            }
        } catch (error) {
            
            new Notice("Error opening RSS Dashboard view");
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
                workspace.revealLeaf(leaf);
            }
        } catch (error) {
            
            new Notice("Error opening RSS Discover view");
        }
    }
    
    private onArticleSaved(item: FeedItem): void {
        
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
                    
                    this.saveSettings();
                    
                    
                    if (this.view) {
                        this.view.updateArticleSaveButton(item.guid);
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
            console.log(`[RSS Dashboard] Starting refresh of ${feedNoticeText}`);
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
            if (this.view) {
                await this.view.refresh();
                new Notice(`Feeds refreshed: ${feedNoticeText}`);
            }
        } catch (error) {
            console.error(`[RSS Dashboard] Error refreshing feeds:`, error);
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
            if (this.view) {
                await this.view.refresh();
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

        
        if (this.view) {
            await this.view.refresh();
        }
    }

    private showImportProgressModal(totalFeeds: number, onMinimize: () => void, onAbort: () => void): any {
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal rss-dashboard-modal-container rss-dashboard-import-modal";

        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";

        const modalHeader = document.createElement("div");
        modalHeader.className = "rss-dashboard-import-modal-header";

        const title = document.createElement("h2");
        title.textContent = "Importing OPML Feeds";
        title.className = "rss-dashboard-import-modal-title";

        const minimizeButton = document.createElement("button");
        minimizeButton.classList.add("clickable-icon");
        setIcon(minimizeButton, "minus");
        minimizeButton.setAttribute("aria-label", "Minimize");
        minimizeButton.onclick = onMinimize;

        
        const abortButton = document.createElement("button");
        abortButton.textContent = "Abort";
        abortButton.addClass("rss-dashboard-import-abort-button");
        abortButton.onclick = onAbort;

        modalHeader.appendChild(title);
        const buttonGroup = document.createElement("div");
        buttonGroup.className = "import-modal-header-buttons";
        buttonGroup.appendChild(minimizeButton);
        buttonGroup.appendChild(abortButton);
        modalHeader.appendChild(buttonGroup);

        modalContent.appendChild(modalHeader);

        const progressText = document.createElement("div");
        progressText.id = "import-progress-text";
        progressText.textContent = `Preparing to import ${totalFeeds} feeds...`;
        progressText.classList.add("rss-dashboard-center-text", "rss-dashboard-import-progress-text");
        modalContent.appendChild(progressText);

        const progressBar = document.createElement("div");
        progressBar.className = "rss-dashboard-import-progress-bar";
        modalContent.appendChild(progressBar);

        const progressFill = document.createElement("div");
        progressFill.id = "import-progress-fill";
        progressFill.className = "rss-dashboard-import-progress-fill";
        progressFill.style.setProperty('--progress-width', '0%');
        progressBar.appendChild(progressFill);

        const currentFeedText = document.createElement("div");
        currentFeedText.id = "import-current-feed";
        currentFeedText.classList.add("rss-dashboard-center-text", "rss-dashboard-import-current-feed");
        modalContent.appendChild(currentFeedText);

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        return modal;
    }

    async importOpml() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".opml, .xml";
        input.onchange = async () => {
            const file = input.files?.[0];
            if (file) {
                const content = await file.text();
                try {
                    
                    const { feeds: newFeedsMetadata, folders: newFolders } = OpmlManager.parseOpmlMetadata(content);

                    const feedsToAdd = newFeedsMetadata.filter(newFeed => 
                        !this.settings.feeds.some(f => f.url === newFeed.url)
                    );

                    if (feedsToAdd.length === 0) {
                        new Notice("No new feeds found in the OPML file.");
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

                    
                        if (this.view) {
                            await this.view.render();
                        }

                    new Notice(`Imported ${addedFeeds.length} feeds. Articles will be fetched in the background.`);

                    
                    this.startBackgroundImport(addedFeeds);

                } catch (error) {
                    new Notice(error.message);
                }
            }
        };
        input.click();
    }

    private async startBackgroundImport(feeds: Feed[]) {
        
        this.backgroundImportQueue.push(...feeds.map(feed => ({
            ...feed,
            importStatus: 'pending' as const
        })));

        
        if (!this.isBackgroundImporting) {
            this.processBackgroundImportQueue();
        }
    }

    private async processBackgroundImportQueue() {
        if (this.isBackgroundImporting || this.backgroundImportQueue.length === 0) {
            return;
        }

        this.isBackgroundImporting = true;

        
        if (!this.importStatusBarItem) {
            this.importStatusBarItem = this.addStatusBarItem();
            this.importStatusBarItem.innerHTML = '';
            const iconSpan = document.createElement('span');
            iconSpan.className = 'import-statusbar-icon';
            setIcon(iconSpan, 'rss');
            this.importStatusBarItem.appendChild(iconSpan);
            const textSpan = document.createElement('span');
            textSpan.className = 'import-statusbar-text';
            this.importStatusBarItem.appendChild(textSpan);
        }

        const totalFeeds = this.backgroundImportQueue.length;
        let processedCount = 0;

        while (this.backgroundImportQueue.length > 0) {
            const feedMetadata = this.backgroundImportQueue.shift()!;
            
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

            
            if (this.view && processedCount % 3 === 0) {
                await this.view.render();
        }

            
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        
        await this.saveSettings();
        if (this.view) {
            await this.view.render();
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

    async exportOpml() {
        
        const opmlContent = OpmlManager.generateOpml(
            this.settings.feeds,
            this.settings.folders
        );

        
        const blob = new Blob([opmlContent], { type: "text/xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "obsidian-rss-feeds.opml";
        a.click();
        URL.revokeObjectURL(url);
    }

    
    async addFolder(folderName: string) {
        
        const folderExists = this.settings.folders.some(f => f.name === folderName);
        
        if (!folderExists) {
            
            this.settings.folders.push({ name: folderName, subfolders: [] });
            await this.saveSettings();
            
            if (this.view) {
                this.view.refresh();
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

            if (this.view) {
                this.view.refresh();
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
                
                if (this.view) {
                    this.view.refresh();
                    new Notice(`Subfolder "${subfolderName}" created under "${parentFolderName}"`);
                }
            } else {
                new Notice(`Subfolder "${subfolderName}" already exists in "${parentFolderName}"`);
            }
        }
    }

    
    async editFeed(feed: Feed, newTitle: string, newUrl: string, newFolder: string) {
        feed.title = newTitle;
        feed.url = newUrl;
        feed.folder = newFolder;
        
        await this.saveSettings();
        
        if (this.view) {
            this.view.refresh();
            new Notice(`Feed "${newTitle}" updated`);
        }
    }

    async loadSettings() {
        try {
            let data = await this.loadData();
            
            
            this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
            
            
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
        } catch (error) {
            
            new Notice(`Error loading settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
            this.settings = DEFAULT_SETTINGS;
        }
    }
    
    
    private migrateLegacySettings(): void {
        
        if ((this.settings as any).savePath && !this.settings.articleSaving?.defaultFolder) {
            if (!this.settings.articleSaving) {
                this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
            }
            this.settings.articleSaving.defaultFolder = (this.settings as any).savePath;
            delete (this.settings as any).savePath;
        }
        
        
        if ((this.settings as any).template && !this.settings.articleSaving?.defaultTemplate) {
            if (!this.settings.articleSaving) {
                this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
            }
            this.settings.articleSaving.defaultTemplate = (this.settings as any).template;
            delete (this.settings as any).template;
        }
        
        
        if ((this.settings as any).addSavedTag !== undefined && this.settings.articleSaving?.addSavedTag === undefined) {
            if (!this.settings.articleSaving) {
                this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
            }
            this.settings.articleSaving.addSavedTag = (this.settings as any).addSavedTag;
            delete (this.settings as any).addSavedTag;
        }
        
        
        if ((this.settings.articleSaving as any)?.template && !this.settings.articleSaving?.defaultTemplate) {
            this.settings.articleSaving.defaultTemplate = (this.settings.articleSaving as any).template;
            delete (this.settings.articleSaving as any).template;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        
        this.app.workspace.detachLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(RSS_READER_VIEW_TYPE);
    }

    
    private async validateSavedArticles(): Promise<void> {
        
        let updatedCount = 0;
        
        for (const feed of this.settings.feeds) {
            for (const item of feed.items) {
                if (item.saved) {
                    const fileExists = await this.checkSavedFileExists(item);
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
            
            
            if (this.view) {
                await this.view.render();
            }
        }
    }
    
    
    private async checkSavedFileExists(item: FeedItem): Promise<boolean> {
        try {
            
            const folder = this.settings.articleSaving.defaultFolder || "RSS Articles";
            const filename = this.sanitizeFilename(item.title);
            const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;
            
            
            return await this.app.vault.adapter.exists(filePath);
        } catch (error) {
            
            return false;
        }
    }
    
    
    private sanitizeFilename(name: string): string {
        return name
            .replace(/[\/\\:*?"<>|]/g, '_')
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
