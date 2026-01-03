import { Menu, MenuItem, Notice, App, setIcon, Setting, requestUrl } from "obsidian";
import { Feed, Folder, Tag, RssDashboardSettings, FeedMetadata } from "../types/types";
import { AddFeedModal, EditFeedModal } from "../modals/feed-manager-modal";
import type RssDashboardPlugin from "../../main";

interface SidebarOptions {
    currentFolder: string | null;
    currentFeed: Feed | null;
    currentTag: string | null;
    tagsCollapsed: boolean;
    collapsedFolders: string[];
}

interface SidebarCallbacks {
    onFolderClick: (folder: string | null) => void;
    onFeedClick: (feed: Feed) => void;
    onTagClick: (tag: string | null) => void;
    onToggleTagsCollapse: () => void;
    onToggleFolderCollapse: (folder: string) => void;
    onBatchToggleFolders?: (foldersToCollapse: string[], foldersToExpand: string[]) => void;
    onAddFolder: (name: string) => void;
    onAddSubfolder: (parent: string, name: string) => void;
    onAddFeed: (title: string, url: string, folder: string, autoDeleteDuration?: number, maxItemsLimit?: number, scanInterval?: number) => Promise<void>;
    onEditFeed: (feed: Feed, title: string, url: string, folder: string) => void;
    onDeleteFeed: (feed: Feed) => void;
    onDeleteFolder: (folder: string) => void;
    onRefreshFeeds: () => void;
    onUpdateFeed: (feed: Feed) => Promise<void>;
    onImportOpml: () => void;
    onExportOpml: () => void;
    onToggleSidebar: () => void;
    onOpenSettings?: () => void;
    onManageFeeds?: () => void;
}

export class Sidebar {
    private container: HTMLElement;
    private settings: RssDashboardSettings;
    private options: SidebarOptions;
    private callbacks: SidebarCallbacks;
    private app: App;
    private plugin: RssDashboardPlugin;
    private cachedFolderPaths: string[] | null = null;
    private isSearchExpanded = false;
    private isTagsExpanded = false;


    /**
     * Extract main domain from a URL for favicon purposes (without subdomains)
     */
    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            
            // Extract main domain without subdomains
            const parts = hostname.split('.');
            if (parts.length >= 2) {
                // For domains like feeds.feedburner.com -> feedburner.com
                // For domains like arstechnica.com -> arstechnica.com
                // For domains like lowtechmagazine.com -> lowtechmagazine.com
                if (parts.length === 3 && parts[0] === 'feeds') {
                    // Special case for feeds subdomains
                    return `${parts[1]}.${parts[2]}`;
                } else if (parts.length >= 3) {
                    // For other subdomains, take the last two parts
                    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
                } else {
                    // For regular domains, return as is
                    return hostname;
                }
            }
            return hostname;
        } catch {
            // Fallback: try to extract domain manually
            const match = url.match(/https?:\/\/([^/?]+)/);
            if (match) {
                const hostname = match[1];
                const parts = hostname.split('.');
                if (parts.length >= 2) {
                    if (parts.length === 3 && parts[0] === 'feeds') {
                        return `${parts[1]}.${parts[2]}`;
                    } else if (parts.length >= 3) {
                        return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
                    } else {
                        return hostname;
                    }
                }
                return hostname;
            }
            return '';
        }
    }

    /**
     * Get favicon URL for a domain using Google's faviconV2 service
     * This API has better fallback handling than DuckDuckGo
     */
    private getFaviconUrl(domain: string): string {
        if (!domain) return '';
        return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=32`;
    }



    private getCachedFolderPaths(): string[] {
        if (!this.cachedFolderPaths) {
            this.cachedFolderPaths = [];
            const paths = this.cachedFolderPaths;
            const collectPaths = (folders: Folder[], base = "") => {
                for (const f of folders) {
                    const path = base ? `${base}/${f.name}` : f.name;
                    paths.push(path);
                    if (f.subfolders && f.subfolders.length > 0) {
                        collectPaths(f.subfolders, path);
                    }
                }
            };
            collectPaths(this.settings.folders ?? []);
        }
        return this.cachedFolderPaths;
    }

    public clearFolderPathCache(): void {
        this.cachedFolderPaths = null;
    }





    
    constructor(app: App, container: HTMLElement, plugin: RssDashboardPlugin, settings: RssDashboardSettings, options: SidebarOptions, callbacks: SidebarCallbacks) {
        this.app = app;
        this.container = container;
        this.plugin = plugin;
        this.settings = settings;
        this.options = options;
        this.callbacks = callbacks;
    }
    
    public render(): void {
        const scrollPosition = this.container.scrollTop;
        
        
        this.container.empty();
        this.container.addClass("rss-dashboard-sidebar");
        
        
        this.renderHeader();
        this.renderFilters();
        this.renderFeedFolders();
        this.renderToolbar();
        
        
        requestAnimationFrame(() => {
            this.container.scrollTop = scrollPosition;
        });
    }

    private renderFeedFolders(): void {
        const feedFoldersSection = this.container.createDiv({
            cls: "rss-dashboard-feed-folders-section",
        });

        if (this.settings.folders && this.settings.folders.length > 0) {
            const sortOrder = this.settings.folderSortOrder || { by: "name", ascending: true };
            const sortedFolders = this.applySortOrder([...this.settings.folders], sortOrder);
            
            sortedFolders.forEach((folderObj: Folder) => this.renderFolder(folderObj, "", 0, feedFoldersSection));
        }

        
        const allFolderPaths = new Set(this.getCachedFolderPaths());
        const rootFeeds = this.settings.feeds.filter(feed => !feed.folder || !allFolderPaths.has(feed.folder));
        
        if (rootFeeds.length > 0) {
            rootFeeds.forEach((feed) => {
                this.renderFeed(feed, feedFoldersSection);
            });
        }

        // Add drop handler for root area - only when dropping on the actual root section, not on folders
        feedFoldersSection.addEventListener("dragover", (e) => {
            // Only show drag-over if we're not over a folder header
            const target = e.target as HTMLElement;
            if (!target.closest('.rss-dashboard-feed-folder-header')) {
                e.preventDefault();
                feedFoldersSection.classList.add("drag-over");
            }
        });

        feedFoldersSection.addEventListener("dragleave", (e) => {
            // Only remove drag-over if we're actually leaving the root section
            const target = e.target as HTMLElement;
            if (!target.closest('.rss-dashboard-feed-folder-header')) {
                feedFoldersSection.classList.remove("drag-over");
            }
        });

        feedFoldersSection.addEventListener("drop", (e) => {
            const target = e.target as HTMLElement;
            
            // Only process drops on the root section, not on folder headers
            if (target.closest('.rss-dashboard-feed-folder-header')) {
                return; // Let the folder header handle this drop
            }
            
            e.preventDefault();
            feedFoldersSection.classList.remove("drag-over");
            if (e.dataTransfer) {
                const feedUrl = e.dataTransfer.getData("feed-url");
                if (feedUrl) {
                    const feed = this.settings.feeds.find(f => f.url === feedUrl);
                    if (feed && feed.folder) {
                        const oldFolder = this.findFolderByPath(feed.folder);
                        if (oldFolder) oldFolder.modifiedAt = Date.now();
                        feed.folder = "";
                        void this.plugin.saveSettings().then(() => this.render());
                    }
                }
            }
        });

        feedFoldersSection.addEventListener("contextmenu", (e) => {
            if (e.target === feedFoldersSection) {
                e.preventDefault();
                const menu = new Menu();
                menu.addItem((item: MenuItem) => {
                    item.setTitle("Add folder")
                        .setIcon("folder-plus")
                        .onClick(() => {
                            this.showFolderNameModal({
                                title: "Add folder",
                                onSubmit: (folderName) => {
                                    void this.addTopLevelFolder(folderName).then(() => this.render());
                                }
                            });
                        });
                });
                menu.addItem((item: MenuItem) => {
                    item.setTitle("Add feed")
                        .setIcon("rss")
                        .onClick(() => {
                            this.showAddFeedModal();
                        });
                });
                menu.addItem((item: MenuItem) => {
                    item.setTitle("Sort feeds")
                        .setIcon("lucide-sort-asc")
                        .onClick((evt) => {
                            this.showFeedSortMenu(e, "");
                        });
                });
                menu.showAtMouseEvent(e);
            }
        });
    }

    private applySortOrder(folders: Folder[], sortOrder: { by: "name" | "created" | "modified"; ascending: boolean }): Folder[] {
        const sorter = (a: Folder, b: Folder): number => {
            
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            
            
            let valA: string | number, valB: string | number;

            switch (sortOrder.by) {
                case "name":
                    valA = a.name;
                    valB = b.name;
                    return valA.localeCompare(valB, undefined, { numeric: true }) * (sortOrder.ascending ? 1 : -1);
                case "created":
                    valA = a.createdAt || 0;
                    valB = b.createdAt || 0;
                    break;
                case "modified":
                    valA = a.modifiedAt || 0;
                    valB = b.modifiedAt || 0;
                    break;
                default:
                    return 0;
            }

            if (valA < valB) return sortOrder.ascending ? -1 : 1;
            if (valA > valB) return sortOrder.ascending ? 1 : -1;
            return 0;
        };

        const recursiveSort = (folderList: Folder[]): Folder[] => {
            const sortedFolders = [...folderList].sort(sorter);
            
            
            sortedFolders.forEach((f) => {
                if (f.subfolders && f.subfolders.length > 0) {
                    f.subfolders = recursiveSort(f.subfolders);
                }
            });
            
            return sortedFolders;
        };

        return recursiveSort(folders);
    }

    private renderFolder(folderObj: Folder, parentPath = "", depth = 0, container: HTMLElement): void {
        const folderName = folderObj.name;
        const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        const isCollapsed = this.options.collapsedFolders.includes(fullPath);
        const isActive = this.options.currentFolder === fullPath;
        
        
        const folderFeeds = this.settings.feeds.filter(feed => feed.folder === fullPath);
        const hasActiveFeed = folderFeeds.some(feed => feed === this.options.currentFeed);
        const shouldHighlight = isActive || hasActiveFeed;

        const folderEl = container.createDiv({
            cls: "rss-dashboard-feed-folder",
        });
        const depthClass = `rss-dashboard-folder-depth-${Math.min(depth, 5)}`;
        folderEl.addClass(depthClass);

        const folderHeader = folderEl.createDiv({
            cls: "rss-dashboard-feed-folder-header" + 
                (isCollapsed ? " collapsed" : "") +
                (shouldHighlight ? " active" : ""),
        });

        const toggleButton = folderHeader.createDiv({
            cls: "rss-dashboard-feed-folder-toggle",
        });
        toggleButton.setAttr("aria-label", isCollapsed ? "Expand folder" : "Collapse folder");
        setIcon(toggleButton as HTMLElement, isCollapsed ? "chevron-right" : "chevron-down");

        
        if (folderObj.pinned) {
            const pinIcon = folderHeader.createDiv({
                cls: "rss-dashboard-folder-pin-icon",
            });
            setIcon(pinIcon, "lock");
        }

        folderHeader.createDiv({
            cls: "rss-dashboard-feed-folder-name",
            text: folderName,
        });

        
        folderHeader.addEventListener("click", (e) => {
            if (e.button === 0) {
                if (e.target === toggleButton || toggleButton.contains(e.target as Node)) {
                    this.callbacks.onToggleFolderCollapse(fullPath);
                } else {
                    this.callbacks.onFolderClick(fullPath);
                }
            }
        });

        folderHeader.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const contextEvent = e;
            const menu = new Menu();
            menu.addItem((item: MenuItem) => {
                item.setTitle("Add feed")
                    .setIcon("rss")
                    .onClick(() => {
                        this.showAddFeedModal(fullPath);
                    });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle("Add subfolder")
                    .setIcon("folder-plus")
                    .onClick(() => {
                                                    this.showFolderNameModal({
                                title: "Add subfolder",
                                onSubmit: (subfolderName) => {
                                    void this.addSubfolderByPath(fullPath, subfolderName).then(() => this.render());
                                }
                            });
                    });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle("Rename folder")
                    .setIcon("edit")
                    .onClick(() => {
                                                    this.showFolderNameModal({
                                title: "Rename folder",
                                defaultValue: folderName,
                                onSubmit: (newName) => {
                                    if (newName !== folderName) {
                                        void this.renameFolderByPath(fullPath, newName).then(() => this.render());
                                    }
                                }
                            });
                    });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle("Mark all as read")
                    .setIcon("check-circle")
                    .onClick(() => {
                        const allPaths = this.getAllDescendantFolderPaths(fullPath);
                        this.settings.feeds.forEach(feed => {
                            if (feed.folder && allPaths.includes(feed.folder)) {
                                feed.items.forEach(item => {
                                    item.read = true;
                                });
                            }
                        });
                        void this.plugin.saveSettings().then(() => this.render());
                    });
            });
            menu.addItem((item: MenuItem) => {
                const isPinned = folderObj.pinned;
                item.setTitle(isPinned ? "Unpin folder" : "Pin folder")
                    .setIcon(isPinned ? "unlock" : "lock")
                    .onClick(() => {
                        folderObj.pinned = !isPinned;
                        folderObj.modifiedAt = Date.now();
                        void this.plugin.saveSettings().then(() => this.render());
                    });
            });
            menu.addItem((item: MenuItem) => {
                                    item.setTitle("Delete folder")
                        .setIcon("trash")
                        .onClick(() => {
                            this.showConfirmModal(`Are you sure you want to delete the folder '${folderName}' and all its subfolders and feeds?`, () => {
                                const allPaths = this.getAllDescendantFolderPaths(fullPath);
                                this.settings.feeds = this.settings.feeds.filter(feed => !allPaths.includes(feed.folder));
                                this.removeFolderByPath(fullPath);
                                this.render();
                            });
                        });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle("Sort feeds")
                    .setIcon("lucide-sort-asc")
                    .onClick(() => {
                        this.showFeedSortMenu(contextEvent, fullPath);
                    });
            });
            menu.showAtMouseEvent(e);
        });

        
        folderHeader.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent event from bubbling up to root section
            folderHeader.classList.add("drag-over");
        });

        folderHeader.addEventListener("dragleave", (e) => {
            e.stopPropagation(); // Prevent event from bubbling up to root section
            folderHeader.classList.remove("drag-over");
        });

        folderHeader.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent event from bubbling up to root section
            folderHeader.classList.remove("drag-over");
            if (e.dataTransfer) {
                const feedUrl = e.dataTransfer.getData("feed-url");
                if (feedUrl) {
                    const feed = this.settings.feeds.find(f => f.url === feedUrl);
                    if (feed && feed.folder !== fullPath) {
                        if (feed.folder) {
                            const oldFolder = this.findFolderByPath(feed.folder);
                            if (oldFolder) oldFolder.modifiedAt = Date.now();
                        }
                        feed.folder = fullPath;
                        const newFolder = this.findFolderByPath(fullPath);
                        if (newFolder) newFolder.modifiedAt = Date.now();
                        
                        void this.plugin.saveSettings().then(() => this.render());
                    }
                }
            }
        });

        
        // First, render subfolders
        if (folderObj.subfolders && folderObj.subfolders.length > 0 && !isCollapsed) {
            
            const sortOrder = this.settings.folderSortOrder || { by: "name", ascending: true };
            const sortedSubfolders = this.applySortOrder([...folderObj.subfolders], sortOrder);
            
            sortedSubfolders.forEach((subfolder: Folder) => {
                this.renderFolder(subfolder, fullPath, depth + 1, folderEl);
            });
        }

        // Then, render feeds in the folder
        const folderFeedsList = folderEl.createDiv({
            cls: "rss-dashboard-folder-feeds" + (isCollapsed ? " collapsed" : ""),
        });

        const feedsInFolder = this.settings.feeds.filter(feed => feed.folder === fullPath);
        
        
        const folderSortOrder = this.settings.folderFeedSortOrders?.[fullPath];
        const sortedFeedsInFolder = folderSortOrder 
            ? this.applyFeedSortOrder([...feedsInFolder], folderSortOrder)
            : feedsInFolder;
            
        sortedFeedsInFolder.forEach((feed) => {
            this.renderFeed(feed, folderFeedsList);
        });
    }

    private renderFeed(feed: Feed, container: HTMLElement): void {
        const feedEl = container.createDiv({
            cls: "rss-dashboard-feed" + (feed === this.options.currentFeed ? " active" : ""),
            attr: {
                draggable: "true",
                "data-feed-url": feed.url,
            },
        });

        const unreadCount = feed.items.filter(item => !item.read).length;
        const feedNameContainer = feedEl.createDiv({
            cls: "rss-dashboard-feed-name-container",
        });

        const feedIcon = feedNameContainer.createDiv({
            cls: "rss-dashboard-feed-icon",
        });
        
        
        const isProcessing = feed.items.length === 0 && this.plugin?.backgroundImportQueue?.some(
            (queuedFeed: FeedMetadata) => queuedFeed.url === feed.url && queuedFeed.importStatus === 'processing'
        );
        
        if (isProcessing) {
            // Show loading spinner for processing feeds
            setIcon(feedIcon, "loader-2");
            feedIcon.addClass("processing");
            feedEl.classList.add('processing-feed');
        } else if (feed.mediaType === 'video') {
            // Show play icon for video feeds
            setIcon(feedIcon, "play");
            feedIcon.addClass("youtube");
            feedEl.classList.add('youtube-feed');
        } else if (feed.mediaType === 'podcast') {
            // Show mic icon for podcast feeds
            setIcon(feedIcon, "mic");
            feedIcon.addClass("podcast");
            feedEl.classList.add('podcast-feed');
        } else if (this.settings.display.useDomainFavicons) {
            // Show domain favicon for regular feeds when setting is enabled
            const domain = this.extractDomain(feed.url);
            if (domain) {
                const faviconUrl = this.getFaviconUrl(domain);
                feedIcon.empty();
                const imgEl = feedIcon.createEl("img", {
                    attr: {
                        src: faviconUrl,
                        alt: domain
                    },
                    cls: "rss-dashboard-feed-favicon"
                });
                
                // Fallback to RSS icon if favicon fails to load
                imgEl.onerror = () => {
                    feedIcon.empty();
                    setIcon(feedIcon, "rss");
                };
            } else {
                // No domain available, use generic RSS icon
                setIcon(feedIcon, "rss");
            }
        } else {
            // Show generic RSS icon when favicon setting is disabled
            setIcon(feedIcon, "rss");
        }

        feedNameContainer.createDiv({
            cls: "rss-dashboard-feed-name",
            text: feed.title,
        });

        if (unreadCount > 0) {
            feedNameContainer.createDiv({
                cls: "rss-dashboard-feed-unread-count",
                text: unreadCount.toString(),
            });
        }

        
        if (feed.items.length === 0 && !isProcessing) {
            const processingIndicator = feedNameContainer.createDiv({
                cls: "rss-dashboard-feed-processing-indicator",
                text: "⏳",
            });
            processingIndicator.setAttribute("title", "Articles being fetched in background");
        }

        feedEl.addEventListener("click", (e) => {
            
            e.stopPropagation();
            this.callbacks.onFeedClick(feed);
        });

        feedEl.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            this.showFeedContextMenu(e, feed);
        });

        feedEl.addEventListener("dragstart", (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData("feed-url", feed.url);
                e.dataTransfer.effectAllowed = "move";
            }
        });
    }

    private showAddYouTubeFeedModal(): void {
        const modal = document.body.createDiv({
            cls: "rss-dashboard-modal rss-dashboard-modal-container"
        });

        const modalContent = modal.createDiv({
            cls: "rss-dashboard-modal-content"
        });

        new Setting(modalContent).setName("Add YouTube channel").setHeading();

        const infoText = modalContent.createDiv({
            cls: "rss-dashboard-modal-info"
        });
        
        infoText.createEl('p', {
            text: 'Enter a YouTube channel URL or ID.'
        });
        
        const list = infoText.createEl('ul');
        
        const items = [
            'Channel url: https://www.youtube.com/channel/UCxxxxxxxx',
            'Channel id: UCxxxxxxxx',
        ];
        
        items.forEach(itemText => {
            list.createEl('li', { text: itemText });
        });

        const channelLabel = modalContent.createEl("label", {
            text: "YouTube channel:"
        });
        const channelInput = modalContent.createEl("input", {
            attr: {
                type: "text",
                placeholder: "Enter channel URL, ID, username or URL"
            }
        });

        const titleLabel = modalContent.createEl("label", {
            text: "Feed title (optional):"
        });
        const titleInput = modalContent.createEl("input", {
            attr: {
                type: "text",
                placeholder: "Leave blank to use channel name"
            }
        });

        const buttonContainer = modalContent.createDiv({
            cls: "rss-dashboard-modal-buttons"
        });

        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel"
        });
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });

        const addButton = buttonContainer.createEl("button", {
            text: "Add channel",
            cls: "rss-dashboard-primary-button"
        });
        addButton.addEventListener("click", () => {
            void (async () => {
            const channel = channelInput.value.trim();
            let feedUrl = "";
            let channelId = "";
            let username = "";
            
            if (!channel) {
                new Notice("Please enter a YouTube channel URL or ID");
                return;
            }
            
            if (/^UC[\w-]{22}$/.test(channel)) {
                channelId = channel;
                feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`;
                const result = await this.extractChannelIdAndNameFromYouTubePage(`https://www.youtube.com/channel/${channel}`);
                if (result.channelName && !titleInput.value) {
                    titleInput.value = result.channelName;
                } else if (!titleInput.value) {
                    titleInput.value = `YouTube: ${channel}`;
                }
            } else {
                let channelName = "";
                let inputUrl = channel;
                if (!inputUrl.startsWith("http")) {
                    if (inputUrl.startsWith("@")) {
                        inputUrl = `https://www.youtube.com/${inputUrl}`;
                    } else {
                        inputUrl = `https://www.youtube.com/user/${inputUrl}`;
                    }
                }
                
                const result = await this.extractChannelIdAndNameFromYouTubePage(inputUrl);
                channelId = result.channelId || "";
                channelName = result.channelName || "";
                if (channelId) {
                    feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
                    
                    if (titleInput && !titleInput.value) {
                        titleInput.value = channelName;
                    }
                } else {
                    if (channel.includes("youtube.com/user/")) {
                        const match = channel.match(/youtube\.com\/user\/([^/?]+)/);
                        username = match ? match[1] : "";
                    } else if (!channel.startsWith("http") && !channel.startsWith("@")) {
                        username = channel;
                    }
                    if (username) {
                        feedUrl = `https://www.youtube.com/feeds/videos.xml?user=${username}`;
                    } else {
                        new Notice("Could not resolve channel ID or username. Please check the URL.");
                        return;
                    }
                }
            }
            
            const title = titleInput.value.trim() || `YouTube: ${channelId || username}`;
                void this.callbacks.onAddFeed(
                title, 
                feedUrl, 
                this.settings.media.defaultYouTubeFolder
                ).catch(() => { /* ignore */ });
            document.body.removeChild(modal);
            })();
        });

        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(addButton);

        modalContent.appendChild(infoText);
        modalContent.appendChild(channelLabel);
        modalContent.appendChild(channelInput);
        modalContent.appendChild(titleLabel);
        modalContent.appendChild(titleInput);
        modalContent.appendChild(buttonContainer);

        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    }

    private async extractChannelIdAndNameFromYouTubePage(url: string): Promise<{channelId: string|null, channelName: string|null}> {
        try {
            const res = await requestUrl(url);
            const html = res.text;
            
            const idMatch = html.match(/channel_id=(UC[a-zA-Z0-9_-]{22})/);
            const channelId = idMatch && idMatch[1] ? idMatch[1] : null;
            
            const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
            const channelName = nameMatch && nameMatch[1] ? nameMatch[1] : null;
            return { channelId, channelName };
        } catch {
            // YouTube page fetch failed
        }
        return { channelId: null, channelName: null };
    }

    private findFolderByPath(path: string): Folder | null {
        const parts = path.split("/");
        let current: Folder | undefined = this.settings.folders.find(f => f.name === parts[0]);
        for (let i = 1; i < parts.length && current; i++) {
            current = current.subfolders.find(f => f.name === parts[i]);
        }
        return current || null;
    }

    private async renameFolderByPath(oldPath: string, newName: string) {
        const parts = oldPath.split("/");
        const parentPath = parts.slice(0, -1).join("/");
        const folder = this.findFolderByPath(oldPath);
        if (folder) {
            folder.name = newName;
            folder.modifiedAt = Date.now();

            if (parentPath) {
                const parent = this.findFolderByPath(parentPath);
                if (parent) parent.modifiedAt = Date.now();
            }
            
            const newPath = parentPath ? `${parentPath}/${newName}` : newName;
            
            
            this.settings.feeds.forEach((feed: Feed) => {
                if (feed.folder) {
                    
                    if (feed.folder === oldPath) {
                        feed.folder = newPath;
                    }
                    
                    else if (feed.folder.startsWith(oldPath + "/")) {
                        
                        feed.folder = feed.folder.replace(oldPath, newPath);
                    }
                }
            });
            
            
            await this.plugin.saveSettings();
            this.clearFolderPathCache();
            this.render();
        }
    }

    private async addSubfolderByPath(parentPath: string, subfolderName: string) {
        const parent = this.findFolderByPath(parentPath);
        if (parent && !parent.subfolders.some(f => f.name === subfolderName)) {
            parent.subfolders.push({ name: subfolderName, subfolders: [], createdAt: Date.now(), modifiedAt: Date.now() });
            parent.modifiedAt = Date.now();
            
            this.settings.folders = [...this.settings.folders];
            await this.plugin.saveSettings();
            
            if (this.options.currentFolder && !this.findFolderByPath(this.options.currentFolder)) {
                this.options.currentFolder = null;
            }
            if (this.options.currentFeed && !this.settings.feeds.includes(this.options.currentFeed)) {
                this.options.currentFeed = null;
            }
            this.clearFolderPathCache();
            this.render();
        }
    }

    public async addTopLevelFolder(folderName: string) {
        if (!this.settings.folders.some(f => f.name === folderName)) {
            this.settings.folders.push({ name: folderName, subfolders: [], createdAt: Date.now(), modifiedAt: Date.now() });
            
            this.settings.folders = [...this.settings.folders];
            await this.plugin.saveSettings();
            
            if (this.options.currentFolder && !this.findFolderByPath(this.options.currentFolder)) {
                this.options.currentFolder = null;
            }
            if (this.options.currentFeed && !this.settings.feeds.includes(this.options.currentFeed)) {
                this.options.currentFeed = null;
            }
            this.clearFolderPathCache();
            this.render();
        }
    }

    public showFolderNameModal(options: {title: string, defaultValue?: string, onSubmit: (name: string) => void}) {
        const modal = document.body.createDiv({
            cls: "rss-dashboard-modal rss-dashboard-modal-container"
        });
        const modalContent = modal.createDiv({
            cls: "rss-dashboard-modal-content"
        });
        new Setting(modalContent).setName(options.title).setHeading();
        const nameInput = modalContent.createEl("input", {
            attr: {
                type: "text",
                value: options.defaultValue || "",
                placeholder: "Enter folder name",
                autocomplete: "off"
            },
            cls: "rss-full-width-input rss-input-margin-bottom"
        });
        nameInput.spellcheck = false;
        nameInput.addEventListener("focus", () => nameInput.select());
        nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                okButton.click();
            } else if (e.key === "Escape") {
                cancelButton.click();
            }
        });
        const buttonContainer = modalContent.createDiv({
            cls: "rss-dashboard-modal-buttons"
        });
        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel"
        });
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });
        const okButton = buttonContainer.createEl("button", {
            text: "OK"
        });
        okButton.className = "rss-dashboard-primary-button";
        okButton.addEventListener("click", submit);
        function submit() {
            const name = nameInput.value.trim();
            if (name) {
                document.body.removeChild(modal);
                options.onSubmit(name);
            }
        }
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(okButton);
        modalContent.appendChild(nameInput);
        modalContent.appendChild(buttonContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            nameInput.focus();
            nameInput.select();
        });
    }

    private removeFolderByPath(path: string) {
        const parts = path.split("/");
        const parentPath = parts.slice(0, -1).join("/");
        function removeRecursive(folders: Folder[], depth: number): Folder[] {
            return folders.filter((folder: Folder) => {
                if (folder.name === parts[depth]) {
                    if (depth === parts.length - 1) {
                        return false;
                    } else {
                        folder.subfolders = removeRecursive(folder.subfolders, depth + 1);
                        return true;
                    }
                } else {
                    return true;
                }
            });
        }
        this.settings.folders = removeRecursive(this.settings.folders, 0);
        if (parentPath) {
            const parent = this.findFolderByPath(parentPath);
            if (parent) parent.modifiedAt = Date.now();
        }
        this.clearFolderPathCache();
        this.render();
    }

    private getAllDescendantFolderPaths(path: string): string[] {
        const result: string[] = [path];
        const folder = this.findFolderByPath(path);
        function collect(f: Folder, base: string) {
            for (const sub of f.subfolders) {
                const subPath = base + '/' + sub.name;
                result.push(subPath);
                collect(sub, subPath);
            }
        }
        if (folder) collect(folder, path);
        return result;
    }

    private showConfirmModal(message: string, onConfirm: () => void): void {
        document.querySelectorAll('.rss-dashboard-modal').forEach(el => el.remove());
        window.setTimeout(() => {
            const modal = document.body.createDiv({
                cls: "rss-dashboard-modal rss-dashboard-modal-container"
            });
            const modalContent = modal.createDiv({
                cls: "rss-dashboard-modal-content"
            });
            new Setting(modalContent).setName("Confirm").setHeading();
            modalContent.createDiv({
                text: message
            });
            const buttonContainer = modalContent.createDiv({
                cls: "rss-dashboard-modal-buttons"
            });
            const cancelButton = buttonContainer.createEl("button", {
                text: "Cancel"
            });
            cancelButton.onclick = () => document.body.removeChild(modal);
            const okButton = buttonContainer.createEl("button", {
                text: "OK",
                cls: "rss-dashboard-primary-button"
            });
            okButton.onclick = () => {
                document.body.removeChild(modal);
                onConfirm();
            };
            window.setTimeout(() => okButton.focus(), 0);
        }, 0);
    }

    public showAddTagModal(): void {
        const modal = document.body.createDiv({
            cls: "rss-dashboard-modal rss-dashboard-modal-container"
        });

        const modalContent = modal.createDiv({
            cls: "rss-dashboard-modal-content"
        });

        new Setting(modalContent).setName("Add new tag").setHeading();

        
        const formContainer = modalContent.createDiv({
            cls: "rss-dashboard-tag-modal-form"
        });

        
        const colorInput = formContainer.createEl("input", {
            attr: {
                type: "color",
                value: "#3498db"
            },
            cls: "rss-dashboard-tag-modal-color-picker"
        });
        
        
        const nameInput = formContainer.createEl("input", {
            attr: {
                type: "text",
                placeholder: "Enter tag name",
                autocomplete: "off"
            },
            cls: "rss-dashboard-tag-modal-name-input"
        });
        nameInput.spellcheck = false;

        
        const buttonContainer = modalContent.createDiv({
            cls: "rss-dashboard-modal-buttons"
        });

        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel"
        });
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });

        const addButton = buttonContainer.createEl("button", {
            text: "Add tag",
            cls: "rss-dashboard-primary-button"
        });
        addButton.addEventListener("click", () => {
            const tagName = nameInput.value.trim();
            const tagColor = colorInput.value;

            if (tagName) {
                
                if (this.settings.availableTags.some(tag => tag.name.toLowerCase() === tagName.toLowerCase())) {
                    new Notice("A tag with this name already exists!");
                    return;
                }

                
                const newTag: Tag = {
                    name: tagName,
                    color: tagColor
                };
                this.settings.availableTags.push(newTag);
                
                
                void this.plugin.saveSettings();
                
                
                this.render();
                
                
                document.body.removeChild(modal);
                
                new Notice(`Tag "${tagName}" added successfully!`);
            } else {
                new Notice("Please enter a tag name!");
            }
        });
        buttonContainer.appendChild(addButton);
        formContainer.appendChild(buttonContainer);

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        
        requestAnimationFrame(() => {
            nameInput.focus();
        });
    }

    public showTagContextMenu(event: MouseEvent, tag: Tag): void {
        const menu = new Menu();
        
        menu.addItem((item: MenuItem) => {
            item.setTitle("Edit tag")
                .setIcon("pencil")
                .onClick(() => {
                    this.showEditTagModal(tag);
                });
        });
        
        menu.addItem((item: MenuItem) => {
            item.setTitle("Delete tag")
                .setIcon("trash")
                .onClick(() => {
                    this.showConfirmModal(`Are you sure you want to delete the tag "${tag.name}"? This will remove the tag from all articles.`, () => {
                        this.deleteTag(tag);
                    });
                });
        });
        
        menu.showAtMouseEvent(event);
    }

    private showEditTagModal(tag: Tag): void {
        const modal = document.body.createDiv({
            cls: "rss-dashboard-modal rss-dashboard-modal-container"
        });

        const modalContent = modal.createDiv({
            cls: "rss-dashboard-modal-content"
        });

        new Setting(modalContent).setName("Edit tag").setHeading();

        
        const formContainer = modalContent.createDiv({
            cls: "rss-dashboard-tag-modal-form"
        });

        
        const colorInput = formContainer.createEl("input", {
            attr: {
                type: "color",
                value: tag.color
            },
            cls: "rss-dashboard-tag-modal-color-picker"
        });

        
        const nameInput = formContainer.createEl("input", {
            attr: {
                type: "text",
                value: tag.name,
                placeholder: "Enter tag name",
                autocomplete: "off"
            },
            cls: "rss-dashboard-tag-modal-name-input"
        });
        nameInput.spellcheck = false;

        
        const buttonContainer = modalContent.createDiv({
            cls: "rss-dashboard-modal-buttons"
        });

        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel"
        });
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });

        const saveButton = buttonContainer.createEl("button", {
            text: "Save changes",
            cls: "rss-dashboard-primary-button"
        });
        saveButton.addEventListener("click", () => {
            const newTagName = nameInput.value.trim();
            const newTagColor = colorInput.value;

            if (newTagName) {
                
                if (this.settings.availableTags.some(t => 
                    t.name.toLowerCase() === newTagName.toLowerCase() && t !== tag
                )) {
                    new Notice("A tag with this name already exists!");
                    return;
                }

                
                tag.name = newTagName;
                tag.color = newTagColor;
                
                
                this.settings.feeds.forEach(feed => {
                    feed.items.forEach(item => {
                        if (item.tags) {
                            const itemTag = item.tags.find(t => t.name === tag.name);
                            if (itemTag) {
                                itemTag.name = newTagName;
                                itemTag.color = newTagColor;
                            }
                        }
                    });
                });
                
                
                void this.plugin.saveSettings();
                
                
                this.render();
                
                
                document.body.removeChild(modal);
                
                new Notice(`Tag "${newTagName}" updated successfully!`);
            } else {
                new Notice("Please enter a tag name!");
            }
        });
        buttonContainer.appendChild(saveButton);
        formContainer.appendChild(buttonContainer);

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        
        requestAnimationFrame(() => {
            nameInput.focus();
            nameInput.select();
        });
    }

    private deleteTag(tag: Tag): void {
        
        const tagIndex = this.settings.availableTags.findIndex(t => t.name === tag.name);
        if (tagIndex !== -1) {
            this.settings.availableTags.splice(tagIndex, 1);
        }

        
        this.settings.feeds.forEach(feed => {
            feed.items.forEach(item => {
                if (item.tags) {
                    item.tags = item.tags.filter(t => t.name !== tag.name);
                }
            });
        });

        
        void this.plugin.saveSettings();
        
        
        this.render();
        
        new Notice(`Tag "${tag.name}" deleted successfully!`);
    }

    private showUnreadItemsContextMenu(event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem((item: MenuItem) => {
            item.setTitle("Mark all unread as read")
                .setIcon("check-circle")
                .onClick(() => {
                    void this.markAllUnreadAsRead();
                });
        });

        menu.showAtMouseEvent(event);
    }

    private showReadItemsContextMenu(event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem((item: MenuItem) => {
            item.setTitle("Mark all read as unread")
                .setIcon("circle")
                .onClick(() => {
                    void this.markAllReadAsUnread();
                });
        });

        menu.showAtMouseEvent(event);
    }

    private async markAllUnreadAsRead(): Promise<void> {
        let count = 0;
        this.settings.feeds.forEach(feed => {
            feed.items.forEach(item => {
                if (!item.read) {
                    item.read = true;
                    count++;
                }
            });
        });

        if (count > 0) {
            await this.plugin.saveSettings();
            this.render();
            new Notice(`Marked ${count} items as read`);
        } else {
            new Notice("No unread items found");
        }
    }

    private async markAllReadAsUnread(): Promise<void> {
        let count = 0;
        this.settings.feeds.forEach(feed => {
            feed.items.forEach(item => {
                if (item.read) {
                    item.read = false;
                    count++;
                }
            });
        });

        if (count > 0) {
            await this.plugin.saveSettings();
            this.render();
            new Notice(`Marked ${count} items as unread`);
        } else {
            new Notice("No read items found");
        }
    }

    public renderHeader(): void {
        const header = this.container.createDiv({
            cls: "rss-dashboard-header",
        });

        
        const navContainer = header.createDiv({
            cls: "rss-dashboard-nav-container",
        });

        
        const dashboardBtn = navContainer.createDiv({
            cls: "rss-dashboard-nav-button active",
        });
        
        dashboardBtn.appendText(" Dashboard");
        dashboardBtn.addEventListener("click", () => {
            
            void this.plugin.activateView();
        });

        
        const discoverBtn = navContainer.createDiv({
            cls: "rss-dashboard-nav-button",
        });
        
        discoverBtn.appendText(" Discover");
        discoverBtn.addEventListener("click", () => {
            
            void this.plugin.activateDiscoverView();
        });

        
        
        
        
    }



    public renderFilters(): void {
        const filtersList = this.container.createDiv({
            cls: "rss-dashboard-filters-section",
        });

        // Add display style class for CSS styling
        const displayStyle = this.settings.display?.filterDisplayStyle || "inline";
        filtersList.addClass(`rss-dashboard-filters-${displayStyle}`);

        // Create filter items row for inline mode
        let filterItemsRow: HTMLElement | null = null;
        if (displayStyle === "inline") {
            filterItemsRow = filtersList.createDiv({
                cls: "rss-dashboard-filter-items-row",
            });
        }

        // Helper function to create filter items
        const createFilterItem = (type: string, icon: string, text: string, isActive: boolean) => {
            const container = displayStyle === "inline" && filterItemsRow ? filterItemsRow : filtersList;
            const filterEl = container.createDiv({
                cls: "rss-dashboard-filter-item" + (isActive ? " active" : ""),
            });

            const filterIcon = filterEl.createDiv({
                cls: "rss-dashboard-filter-icon",
            });
            setIcon(filterIcon, icon);

            // Only show text in vertical mode
            if (displayStyle === "vertical") {
                filterEl.createDiv({
                    cls: "rss-dashboard-filter-name",
                    text: text,
                });
            }

            // Add tooltip for inline mode
            if (displayStyle === "inline") {
                filterEl.setAttribute("title", text);
            }

            filterEl.addEventListener("click", () => {
                this.callbacks.onFolderClick(type === "all" ? null : type);
            });

            // Add context menu for unread items
            if (type === "unread") {
                filterEl.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    this.showUnreadItemsContextMenu(e);
                });
            }

            // Add context menu for read items
            if (type === "read") {
                filterEl.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    this.showReadItemsContextMenu(e);
                });
            }

            return filterEl;
        };

        // Get hidden filters from settings
        const hiddenFilters = this.settings.display?.hiddenFilters || [];

        
        createFilterItem(
            "all",
            "list",
            "All items",
            this.options.currentFolder === null && 
            this.options.currentFeed === null && 
            this.options.currentTag === null
        );

        // Create other filter items only if they're not hidden
        if (!hiddenFilters.includes("starred")) {
            createFilterItem(
                "starred",
                "star",
                "Starred items",
                this.options.currentFolder === "starred"
            );
        }

        if (!hiddenFilters.includes("unread")) {
            createFilterItem(
                "unread",
                "circle",
                "Unread items",
                this.options.currentFolder === "unread"
            );
        }

        if (!hiddenFilters.includes("read")) {
            createFilterItem(
                "read",
                "check-circle",
                "Read items",
                this.options.currentFolder === "read"
            );
        }

        if (!hiddenFilters.includes("saved")) {
            createFilterItem(
                "saved",
                "save",
                "Saved items",
                this.options.currentFolder === "saved"
            );
        }

        if (!hiddenFilters.includes("videos")) {
            createFilterItem(
                "videos",
                "play",
                "Videos",
                this.options.currentFolder === "videos"
            );
        }

        if (!hiddenFilters.includes("podcasts")) {
            createFilterItem(
                "podcasts",
                "mic",
                "Podcasts",
                this.options.currentFolder === "podcasts"
            );
        }

        // Add tags filter item
        const tagsContainer = displayStyle === "inline" && filterItemsRow ? filterItemsRow : filtersList;
        const tagsFilterEl = tagsContainer.createDiv({
            cls: "rss-dashboard-filter-item rss-dashboard-tags-filter" + (this.isTagsExpanded ? " active" : ""),
        });

        const tagsFilterIcon = tagsFilterEl.createDiv({
            cls: "rss-dashboard-filter-icon",
        });
        setIcon(tagsFilterIcon, "tag");

        // Only show text in vertical mode
        if (displayStyle === "vertical") {
            tagsFilterEl.createDiv({
                cls: "rss-dashboard-filter-name",
                text: "Tags",
            });
        }

        // Add tooltip for inline mode
        if (displayStyle === "inline") {
            tagsFilterEl.setAttribute("title", "Tags");
        }

        tagsFilterEl.addEventListener("click", () => {
            this.isTagsExpanded = !this.isTagsExpanded;
            this.render();
        });

        // Add collapsible tags list below filters
        if (this.isTagsExpanded) {
            const tagsContainer = filtersList.createDiv({
                cls: "rss-dashboard-tags-container",
            });

            // Add tag button
            const addTagButton = tagsContainer.createDiv({
                cls: "rss-dashboard-add-tag-button",
            });
            setIcon(addTagButton, "plus");
            addTagButton.appendText(" Add tag");

            addTagButton.addEventListener("click", (e) => {
                e.stopPropagation();
                this.showAddTagModal();
            });

            // Render tags list
            for (const tag of this.settings.availableTags) {
                const tagEl = tagsContainer.createDiv({
                    cls: "rss-dashboard-sidebar-tag" + 
                        (this.options.currentTag === tag.name ? " active" : ""),
                });

                const tagColorDot = tagEl.createDiv({
                    cls: "rss-dashboard-tag-color-dot",
                });
                tagColorDot.style.setProperty('--tag-color', tag.color);

                tagEl.createDiv({
                    cls: "rss-dashboard-tag-name",
                    text: tag.name,
                });

                // Calculate tag count
                let tagCount = 0;
                for (const feed of this.settings.feeds) {
                    tagCount += feed.items.filter(
                        (item) => item.tags && item.tags.some((t) => t.name === tag.name)
                    ).length;
                }

                if (tagCount > 0) {
                    tagEl.createDiv({
                        cls: "rss-dashboard-tag-count",
                        text: tagCount.toString(),
                    });
                }

                tagEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.callbacks.onTagClick(tag.name);
                });
                
                tagEl.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    this.showTagContextMenu(e, tag);
                });
            }
        }

        // Add search filter item
        const searchFilterEl = tagsContainer.createDiv({
            cls: "rss-dashboard-filter-item rss-dashboard-search-filter" + (this.isSearchExpanded ? " active" : ""),
        });

        const searchFilterIcon = searchFilterEl.createDiv({
            cls: "rss-dashboard-filter-icon",
        });
        setIcon(searchFilterIcon, "search");

        // Only show text in vertical mode
        if (displayStyle === "vertical") {
            searchFilterEl.createDiv({
                cls: "rss-dashboard-filter-name",
                text: "Search",
            });
        }

        // Add tooltip for inline mode
        if (displayStyle === "inline") {
            searchFilterEl.setAttribute("title", "Search");
        }

        searchFilterEl.addEventListener("click", () => {
            this.isSearchExpanded = !this.isSearchExpanded;
            this.render();
        });

        // Add collapsible search input below filters
        if (this.isSearchExpanded) {
            const searchContainer = filtersList.createDiv({
                cls: "rss-dashboard-search-container",
            });
            
            const searchInput = searchContainer.createEl("input", {
                cls: "rss-dashboard-search-input",
                attr: {
                    type: "text",
                    placeholder: "Search articles...",
                    autocomplete: "off",
                    spellcheck: "false"
                },
            });

            // Focus and select text when search is expanded
            searchInput.addEventListener("focus", () => {
                searchInput.select();
            });

            // Search functionality
            let searchTimeout: number;
            
            searchInput.addEventListener("input", (e) => {
                const query = ((e.target as HTMLInputElement)?.value || "").toLowerCase().trim();
                
                // Clear previous timeout
                if (searchTimeout) {
                    window.clearTimeout(searchTimeout);
                }

                // Debounce search
                searchTimeout = window.setTimeout(() => {
                    const mainContent = document.querySelector('.rss-dashboard-content');
                    if (mainContent) {
                        const articleElements = mainContent.querySelectorAll(
                            ".rss-dashboard-article-item, .rss-dashboard-article-card"
                        );
                        
                        articleElements.forEach((el) => {
                            const titleEl = el.querySelector(".rss-dashboard-article-title");
                            const title = titleEl?.textContent?.toLowerCase() || "";
                            
                            if (query && !title.includes(query)) {
                                (el as HTMLElement).addClass("rss-dashboard-search-result", "hidden");
                            } else {
                                (el as HTMLElement).addClass("rss-dashboard-search-result", "visible");
                            }
                        });
                    }
                }, 150);
            });

            // Auto-focus the search input when expanded
            requestAnimationFrame(() => {
                searchInput.focus();
            });
        }
    }

    public renderToolbar(): void {
        
        const oldToolbar = this.container.querySelector('.rss-dashboard-sidebar-toolbar');
        if (oldToolbar) oldToolbar.remove();
        const sidebarToolbar = this.container.createDiv({
            cls: "rss-dashboard-sidebar-toolbar",
        });

        
        const addFolderButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Add folder",
            },
        });
        setIcon(addFolderButton, "folder-plus");
        addFolderButton.addEventListener("click", () => {
            this.showFolderNameModal({
                title: "Add folder",
                onSubmit: (folderName) => {
                    void this.addTopLevelFolder(folderName).then(() => this.render());
                }
            });
        });

        const sortButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Sort folders"
            }
        });
        setIcon(sortButton, "lucide-sort-asc");
        sortButton.addEventListener("click", (e) => {
            const menu = new Menu();

            menu.addItem((item) =>
                item
                    .setTitle("Folder name (a to z)")
                    .onClick(() => { void this.sortFolders('name', true); })
            );
            menu.addItem((item) =>
                item
                    .setTitle("Folder name (z to a)")
                    .onClick(() => { void this.sortFolders('name', false); })
            );
            menu.addItem((item) =>
                item
                    .setTitle("Modified time (new to old)")
                    .onClick(() => { void this.sortFolders('modified', false); })
            );
            menu.addItem((item) =>
                item
                    .setTitle("Modified time (old to new)")
                    .onClick(() => { void this.sortFolders('modified', true); })
            );
            menu.addItem((item) =>
                item
                    .setTitle("Created time (new to old)")
                    .onClick(() => { void this.sortFolders('created', false); })
            );
            menu.addItem((item) =>
                item
                    .setTitle("Created time (old to new)")
                    .onClick(() => { void this.sortFolders('created', true); })
            );

            menu.showAtMouseEvent(e);
        });

        const collapseAllButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Collapse/Expand all Folders"
            }
        });
        
        
        let cachedFolderPaths: string[] | null = null;
        
        const updateCollapseIcon = () => {
            
            if (!cachedFolderPaths) {
                cachedFolderPaths = this.getCachedFolderPaths();
            }
            
            const allCollapsed = cachedFolderPaths.length > 0 && cachedFolderPaths.every(path => this.options.collapsedFolders.includes(path));
            setIcon(collapseAllButton, allCollapsed ? "lucide-chevrons-down-up" : "lucide-chevrons-up-down");
        };
        
        updateCollapseIcon();
        
        collapseAllButton.addEventListener("click", () => {
            
            cachedFolderPaths = null;
            this.toggleAllFolders();
            
            
            window.setTimeout(() => updateCollapseIcon(), 0);
        });

        
        const addFeedButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Add feed",
            },
        });
        setIcon(addFeedButton, "plus");
        addFeedButton.addEventListener("click", () => {
            this.showAddFeedModal();
        });

        
        const addYouTubeButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Add youtube channel",
            },
        });
        setIcon(addYouTubeButton, "youtube");
        addYouTubeButton.addEventListener("click", () => {
            this.showAddYouTubeFeedModal();
        });

        
        const importOpmlButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Import opml",
            },
        });
        setIcon(importOpmlButton, "upload");
        importOpmlButton.addEventListener("click", () => {
            this.callbacks.onImportOpml();
        });

        
        const exportOpmlButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Export opml",
            },
        });
        setIcon(exportOpmlButton, "download");
        exportOpmlButton.addEventListener("click", () => {
            this.callbacks.onExportOpml();
        });

        
        const manageFeedsButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Manage feeds",
            },
        });
        setIcon(manageFeedsButton, "list");
        manageFeedsButton.addEventListener("click", () => {
            if (this.callbacks.onManageFeeds) {
                this.callbacks.onManageFeeds();
            }
        });
    }

    private showAddFeedModal(defaultFolder = "Uncategorized"): void {
		new AddFeedModal(
			this.app,
			this.settings.folders,
			async (title, url, folder, autoDeleteDuration, maxItemsLimit, scanInterval) => await this.callbacks.onAddFeed(title, url, folder, autoDeleteDuration, maxItemsLimit, scanInterval),
			() => this.render(),
			defaultFolder,
			this.plugin
		).open();
	}

    public showEditFeedModal(feed: Feed): void {
        new EditFeedModal(this.app, this.plugin, feed, () => this.render()).open();
    }

    private showFeedContextMenu(event: MouseEvent, feed: Feed): void {
        const menu = new Menu();

        menu.addItem((item: MenuItem) => {
            item.setTitle("Update feed")
                .setIcon("refresh-cw")
                .onClick(() => {
                    void this.callbacks.onUpdateFeed(feed);
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Edit feed")
                .setIcon("edit")
                .onClick(() => {
                    this.showEditFeedModal(feed);
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Mark all as read")
                .setIcon("check-circle")
                .onClick(() => {
                    feed.items.forEach(item => {
                        item.read = true;
                    });
                    void this.plugin.saveSettings().then(() => this.render());
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Change media type")
                .setIcon("lucide-circle-gauge")
                .onClick((evt) => {
                    const typeMenu = new Menu();
                    typeMenu.addItem((subItem: MenuItem) => {
                        subItem.setTitle("Article").setIcon("file-text").onClick(() => {
                            feed.mediaType = 'article';
                            void this.plugin.saveSettings().then(() => this.render());
                        });
                    });
                    typeMenu.addItem((subItem: MenuItem) => {
                        subItem.setTitle("Podcast").setIcon("headphones").onClick(() => {
                            feed.mediaType = 'podcast';
                            void this.plugin.saveSettings().then(() => this.render());
                        });
                    });
                    typeMenu.addItem((subItem: MenuItem) => {
                        subItem.setTitle("Video").setIcon("play-circle").onClick(() => {
                            feed.mediaType = 'video';
                            void this.plugin.saveSettings().then(() => this.render());
                        });
                    });
                    if (evt instanceof MouseEvent) {
                        typeMenu.showAtMouseEvent(evt);
                    }
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Move to folder")
                .setIcon("folder-open")
                .onClick((evt) => {
                    if (evt instanceof MouseEvent) {
                        this.showMoveToFolderMenu(evt, feed);
                    }
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Delete feed")
                .setIcon("trash")
                .onClick(() => {
                    this.showConfirmModal(`Are you sure you want to delete the feed "${feed.title}"?`, () => {
                        this.callbacks.onDeleteFeed(feed);
                    });
                });
        });

        menu.showAtMouseEvent(event);
    }

    private showMoveToFolderMenu(event: MouseEvent, feed: Feed): void {
        const menu = new Menu();
        
        // Add option to move to root (no folder)
        menu.addItem((item: MenuItem) => {
            const isInRoot = !feed.folder;
            item.setTitle("Root (no folder)")
                .setIcon(isInRoot ? "check" : "folder")
                .onClick(() => {
                    if (feed.folder) {
                        const oldFolder = this.findFolderByPath(feed.folder);
                        if (oldFolder) oldFolder.modifiedAt = Date.now();
                    }
                    feed.folder = "";
                    void this.plugin.saveSettings().then(() => {
                    this.render();
                    new Notice(`Moved "${feed.title}" to root`);
                    });
                });
        });

        // Add separator
        menu.addSeparator();

        // Add all available folders
        const allFolders = this.getCachedFolderPaths();
        if (allFolders.length > 0) {
            allFolders.sort((a, b) => a.localeCompare(b));
            
            allFolders.forEach(folderPath => {
                const isCurrentFolder = feed.folder === folderPath;
                menu.addItem((item: MenuItem) => {
                    item.setTitle(folderPath)
                        .setIcon(isCurrentFolder ? "check" : "folder")
                        .onClick(() => {
                            if (feed.folder !== folderPath) {
                                if (feed.folder) {
                                    const oldFolder = this.findFolderByPath(feed.folder);
                                    if (oldFolder) oldFolder.modifiedAt = Date.now();
                                }
                                feed.folder = folderPath;
                                const newFolder = this.findFolderByPath(folderPath);
                                if (newFolder) newFolder.modifiedAt = Date.now();
                                
                                void this.plugin.saveSettings().then(() => {
                                this.render();
                                new Notice(`Moved "${feed.title}" to "${folderPath}"`);
                                });
                            }
                        });
                });
            });
        }

        // Add option to create new folder
        menu.addSeparator();
        menu.addItem((item: MenuItem) => {
            item.setTitle("Create new folder...")
                .setIcon("folder-plus")
                .onClick(() => {
                    this.showFolderNameModal({
                        title: "Create new folder",
                        onSubmit: (folderName) => {
                            void (async () => {
                            await this.addTopLevelFolder(folderName);
                            // Move the feed to the newly created folder
                            feed.folder = folderName;
                            const newFolder = this.findFolderByPath(folderName);
                            if (newFolder) newFolder.modifiedAt = Date.now();
                            await this.plugin.saveSettings();
                            this.render();
                            new Notice(`Created folder "${folderName}" and moved "${feed.title}" to it`);
                            })();
                        }
                    });
                });
        });

        menu.showAtMouseEvent(event);
    }

    private _sortFolders(by: "name" | "created" | "modified", ascending: boolean) {
        const sorter = (a: Folder, b: Folder): number => {
			
			if (a.pinned && !b.pinned) return -1;
			if (!a.pinned && b.pinned) return 1;
			
			
			let valA: string | number, valB: string | number;

            switch (by) {
				case "name":
                    valA = a.name;
                    valB = b.name;
                    return valA.localeCompare(valB, undefined, { numeric: true }) * (ascending ? 1 : -1);
				case "created":
                    valA = a.createdAt || 0;
                    valB = b.createdAt || 0;
                    break;
				case "modified":
                    valA = a.modifiedAt || 0;
                    valB = b.modifiedAt || 0;
                    break;
				default:
					return 0;
            }

            if (valA < valB) return ascending ? -1 : 1;
            if (valA > valB) return ascending ? 1 : -1;
            return 0;
        };

        const recursiveSort = (folders: Folder[]): Folder[] => {
			
			const sortedFolders = [...folders].sort(sorter);
			
			
			sortedFolders.forEach((f) => {
                if (f.subfolders && f.subfolders.length > 0) {
                    f.subfolders = recursiveSort(f.subfolders);
                }
            });
			
			return sortedFolders;
        };

		
        this.settings.folders = recursiveSort(this.settings.folders);
	}

	private async sortFolders(by: "name" | "created" | "modified", ascending: boolean) {
		this._sortFolders(by, ascending);
		
		this.settings.folderSortOrder = { by, ascending };
		await this.plugin.saveSettings();
        this.render();
    }

    private showFeedSortMenu(event: MouseEvent, folderPath: string): void {
        const menu = new Menu();

        menu.addItem((item) =>
            item
                .setTitle("Feed name (a to z)")
                .onClick(() => { void this.sortFeedsInFolder(folderPath, 'name', true); })
        );
        menu.addItem((item) =>
            item
                .setTitle("Feed name (z to a)")
                .onClick(() => { void this.sortFeedsInFolder(folderPath, 'name', false); })
        );
        menu.addItem((item) =>
            item
                .setTitle("Created time (new to old)")
                .onClick(() => { void this.sortFeedsInFolder(folderPath, 'created', false); })
        );
        menu.addItem((item) =>
            item
                .setTitle("Created time (old to new)")
                .onClick(() => { void this.sortFeedsInFolder(folderPath, 'created', true); })
        );
        menu.addItem((item) =>
            item
                .setTitle("Number of items (high to low)")
                .onClick(() => { void this.sortFeedsInFolder(folderPath, 'itemCount', false); })
        );
        menu.addItem((item) =>
            item
                .setTitle("Number of items (low to high)")
                .onClick(() => { void this.sortFeedsInFolder(folderPath, 'itemCount', true); })
        );

        menu.showAtMouseEvent(event);
    }

    private async sortFeedsInFolder(folderPath: string, by: "name" | "created" | "itemCount", ascending: boolean) {
        
        let feedsInFolder: Feed[];
        
        if (folderPath) {
            
            feedsInFolder = this.settings.feeds.filter(feed => feed.folder === folderPath);
        } else {
            
            const allFolderPaths = new Set(this.getCachedFolderPaths());
            feedsInFolder = this.settings.feeds.filter(feed => !feed.folder || !allFolderPaths.has(feed.folder));
        }
        
        if (feedsInFolder.length === 0) {
            new Notice("No feeds found in this folder");
            return;
        }

        
        const sortedFeeds = this.applyFeedSortOrder([...feedsInFolder], { by, ascending });
        
        
        if (folderPath) {
            this.settings.feeds = this.settings.feeds.filter(feed => feed.folder !== folderPath);
        } else {
            
            const allFolderPaths = new Set(this.getCachedFolderPaths());
            this.settings.feeds = this.settings.feeds.filter(feed => feed.folder && allFolderPaths.has(feed.folder));
        }
        
        
        this.settings.feeds.push(...sortedFeeds);
        
        
        if (!this.settings.folderFeedSortOrders) {
            this.settings.folderFeedSortOrders = {};
        }
        this.settings.folderFeedSortOrders[folderPath] = { by, ascending };
        
        await this.plugin.saveSettings();
        
        new Notice(`Feeds in "${folderPath || 'root'}" sorted by ${by} (${ascending ? 'ascending' : 'descending'})`);
        this.render();
    }

    private applyFeedSortOrder(feeds: Feed[], sortOrder: { by: "name" | "created" | "itemCount"; ascending: boolean }): Feed[] {
        const sorter = (a: Feed, b: Feed): number => {
            let valA: string | number, valB: string | number;

            switch (sortOrder.by) {
                case "name":
                    valA = a.title;
                    valB = b.title;
                    return valA.localeCompare(valB, undefined, { numeric: true }) * (sortOrder.ascending ? 1 : -1);
                case "created":
                    
                    valA = a.lastUpdated || 0;
                    valB = b.lastUpdated || 0;
                    break;
                case "itemCount":
                    valA = a.items.length;
                    valB = b.items.length;
                    break;
                default:
                    return 0;
            }

            if (valA < valB) return sortOrder.ascending ? -1 : 1;
            if (valA > valB) return sortOrder.ascending ? 1 : -1;
            return 0;
        };

        return [...feeds].sort(sorter);
    }

   
    private toggleAllFolders(): void {
        const allFolderPaths = this.getCachedFolderPaths();

        if (allFolderPaths.length === 0) {
            return;
        }

        const collapsedSet = new Set(this.options.collapsedFolders);
        const allCollapsed = allFolderPaths.every(path => collapsedSet.has(path));

        
        if (allCollapsed) {
            
            const foldersToExpand = allFolderPaths;
            const foldersToCollapse: string[] = [];
            this.callbacks.onBatchToggleFolders?.(foldersToCollapse, foldersToExpand);
            new Notice("All folders expanded");
        } else {
            
            const foldersToExpand: string[] = [];
            const foldersToCollapse = allFolderPaths;
            this.callbacks.onBatchToggleFolders?.(foldersToCollapse, foldersToExpand);
            new Notice("All folders collapsed");
        }
    }
}

