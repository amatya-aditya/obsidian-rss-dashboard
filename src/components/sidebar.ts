import { Menu, MenuItem, Notice, App, setIcon, Setting } from "obsidian";
import { Feed, Folder, Tag, RssDashboardSettings } from "../types/types";
import { MediaService } from "../services/media-service";
import { AddFeedModal, EditFeedModal } from "../modals/feed-manager-modal";

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
    private plugin: any;
    private cachedFolderPaths: string[] | null = null;

    private getCachedFolderPaths(): string[] {
        if (!this.cachedFolderPaths) {
            this.cachedFolderPaths = [];
            function collectPaths(folders: Folder[], base = "") {
                for (const f of folders) {
                    const path = base ? `${base}/${f.name}` : f.name;
                    this.cachedFolderPaths.push(path);
                    if (f.subfolders && f.subfolders.length > 0) {
                        collectPaths(f.subfolders, path);
                    }
                }
            }
            collectPaths.call(this, this.settings.folders);
        }
        return this.cachedFolderPaths;
    }

    private clearFolderPathCache(): void {
        this.cachedFolderPaths = null;
    }

    private renderTags(container: HTMLElement): void {
        const tagsSection = container.createDiv({
            cls: "rss-dashboard-tags-section",
        });

        const tagsSectionHeader = tagsSection.createDiv({
            cls: "rss-dashboard-section-header",
        });

        const tagsSectionIcon = tagsSectionHeader.createDiv({
            cls: "rss-dashboard-folder-icon",
        });
        setIcon(tagsSectionIcon, "tag");

        tagsSectionHeader.createDiv({
            cls: "rss-dashboard-section-title",
            text: "Tags",
        });

        const tagsToggle = tagsSectionHeader.createDiv({
            cls: "rss-dashboard-section-toggle",
        });
        const sidebarToggleIcon = this.options.tagsCollapsed ? "chevron-right" : "chevron-down";
        setIcon(tagsToggle, sidebarToggleIcon);

        tagsSectionHeader.addEventListener("click", () => {
            this.callbacks.onToggleTagsCollapse();
        });

        
        if (!this.options.tagsCollapsed) {
            const tagsList = tagsSection.createDiv({
                cls: "rss-dashboard-tags-list",
            });

            
            const addTagButton = tagsList.createDiv({
                cls: "rss-dashboard-add-tag-button",
            });
            setIcon(addTagButton, "plus");
            addTagButton.appendChild(document.createTextNode(" Add Tag"));

            addTagButton.addEventListener("click", (e) => {
                e.stopPropagation();
                this.showAddTagModal();
            });

            
            for (const tag of this.settings.availableTags) {
                const tagEl = tagsList.createDiv({
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
    }
    
    constructor(app: App, container: HTMLElement, plugin: any, settings: RssDashboardSettings, options: SidebarOptions, callbacks: SidebarCallbacks) {
        this.app = app;
        this.container = container;
        this.plugin = plugin;
        this.settings = settings;
        this.options = options;
        this.callbacks = callbacks;

        this.renderTags(this.container);
    }
    
    public render(): void {
        
        this.clearFolderPathCache();
        
        const scrollPosition = this.container.scrollTop;
        
        
        this.container.empty();
        this.container.addClass("rss-dashboard-sidebar");
        
        
        this.renderHeader();
        this.renderSearch();
        this.renderFilters();
        this.renderTags(this.container);
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

        feedFoldersSection.addEventListener("contextmenu", (e) => {
            if (e.target === feedFoldersSection) {
                e.preventDefault();
                const menu = new Menu();
                menu.addItem((item: MenuItem) => {
                    item.setTitle("Add Folder")
                        .setIcon("folder-plus")
                        .onClick(() => {
                            this.showFolderNameModal({
                                title: "Add Folder",
                                onSubmit: (folderName) => {
                                    this.addTopLevelFolder(folderName);
                                    this.render();
                                }
                            });
                        });
                });
                menu.addItem((item: MenuItem) => {
                    item.setTitle("Add Feed")
                        .setIcon("rss")
                        .onClick(() => {
                            this.showAddFeedModal();
                        });
                });
                menu.addItem((item: MenuItem) => {
                    item.setTitle("Sort Feeds")
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
            
            
            let valA: any, valB: any;

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
                item.setTitle("Add Feed")
                    .setIcon("rss")
                    .onClick(() => {
                        this.showAddFeedModal(fullPath);
                    });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle("Add Subfolder")
                    .setIcon("folder-plus")
                    .onClick(() => {
                        this.showFolderNameModal({
                            title: "Add Subfolder",
                            onSubmit: async (subfolderName) => {
                                await this.addSubfolderByPath(fullPath, subfolderName);
                                this.render();
                            }
                        });
                    });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle("Rename Folder")
                    .setIcon("edit")
                    .onClick(() => {
                        this.showFolderNameModal({
                            title: "Rename Folder",
                            defaultValue: folderName,
                            onSubmit: async (newName) => {
                                if (newName !== folderName) {
                                    await this.renameFolderByPath(fullPath, newName);
                                    this.render();
                                }
                            }
                        });
                    });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle("Mark all as read")
                    .setIcon("check-circle")
                    .onClick(async () => {
                        const allPaths = this.getAllDescendantFolderPaths(fullPath);
                        this.settings.feeds.forEach(feed => {
                            if (feed.folder && allPaths.includes(feed.folder)) {
                                feed.items.forEach(item => {
                                    item.read = true;
                                });
                            }
                        });
                        await this.plugin.saveSettings();
                        this.render();
                    });
            });
            menu.addItem((item: MenuItem) => {
                const isPinned = folderObj.pinned;
                item.setTitle(isPinned ? "Unpin Folder" : "Pin Folder")
                    .setIcon(isPinned ? "unlock" : "lock")
                    .onClick(async () => {
                        folderObj.pinned = !isPinned;
                        folderObj.modifiedAt = Date.now();
                        await this.plugin.saveSettings();
                        this.render();
                    });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle("Delete Folder")
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
                item.setTitle("Sort Feeds")
                    .setIcon("lucide-sort-asc")
                    .onClick(() => {
                        this.showFeedSortMenu(contextEvent, fullPath);
                    });
            });
            menu.showAtMouseEvent(e);
        });

        
        folderHeader.addEventListener("dragover", (e) => {
            e.preventDefault();
            folderHeader.classList.add("drag-over");
        });

        folderHeader.addEventListener("dragleave", () => {
            folderHeader.classList.remove("drag-over");
        });

        folderHeader.addEventListener("drop", async (e) => {
            e.preventDefault();
            folderHeader.classList.remove("drag-over");
            const dragEvent = e as DragEvent;
            if (dragEvent.dataTransfer) {
                const feedUrl = dragEvent.dataTransfer.getData("feed-url");
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
                        
                        await this.plugin.saveSettings();
                        
                        this.render();
                    }
                }
            }
        });

        
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

        
        if (folderObj.subfolders && folderObj.subfolders.length > 0 && !isCollapsed) {
            
            const sortOrder = this.settings.folderSortOrder || { by: "name", ascending: true };
            const sortedSubfolders = this.applySortOrder([...folderObj.subfolders], sortOrder);
            
            sortedSubfolders.forEach((subfolder: Folder) => {
                this.renderFolder(subfolder, fullPath, depth + 1, container);
            });
        }
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
            (queuedFeed: any) => queuedFeed.url === feed.url && queuedFeed.importStatus === 'processing'
        );
        
        if (isProcessing) {
            
            setIcon(feedIcon, "loader-2");
            feedIcon.addClass("processing");
            feedEl.classList.add('processing-feed');
        } else if (feed.mediaType === 'video') {
            setIcon(feedIcon, "play");
            feedIcon.addClass("youtube");
            feedEl.classList.add('youtube-feed');
        } else if (feed.mediaType === 'podcast') {
            setIcon(feedIcon, "mic");
            feedIcon.addClass("podcast");
            feedEl.classList.add('podcast-feed');
        } else {
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
            const dragEvent = e as DragEvent;
            if (dragEvent.dataTransfer) {
                dragEvent.dataTransfer.setData("feed-url", feed.url);
                dragEvent.dataTransfer.effectAllowed = "move";
            }
        });
    }

    private showAddYouTubeFeedModal(): void {
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal rss-dashboard-modal-container";

        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";

        const modalTitle = document.createElement("h2");
        modalTitle.textContent = "Add YouTube Channel";
        modalContent.appendChild(modalTitle);

        const infoText = document.createElement('div');
        infoText.className = "rss-dashboard-modal-info";
        
        const paragraph = document.createElement('p');
        paragraph.textContent = 'Enter a YouTube Channel URL or ID. You can use:';
        
        const list = document.createElement('ul');
        
        const items = [
            'Channel URL: https://www.youtube.com/channel/UCxxxxxxxx',
            'Channel ID: UCxxxxxxxx',
            'User URL: https://www.youtube.com/user/username',
            'User name: username'
        ];
        
        items.forEach(itemText => {
            const listItem = document.createElement('li');
            listItem.textContent = itemText;
            list.appendChild(listItem);
        });
        
        infoText.appendChild(paragraph);
        infoText.appendChild(list);

        const channelLabel = document.createElement("label");
        channelLabel.textContent = "YouTube Channel:";
        const channelInput = document.createElement("input");
        channelInput.type = "text";
        channelInput.placeholder = "Enter channel URL, ID, username or URL";

        const titleLabel = document.createElement("label");
        titleLabel.textContent = "Feed Title (Optional):";
        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.placeholder = "Leave blank to use channel name";

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "rss-dashboard-modal-buttons";

        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });

        const addButton = document.createElement("button");
        addButton.textContent = "Add Channel";
        addButton.className = "rss-dashboard-primary-button";
        addButton.addEventListener("click", async () => {
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
                        const match = channel.match(/youtube\.com\/user\/([^\/\?]+)/);
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
            this.callbacks.onAddFeed(
                title, 
                feedUrl, 
                this.settings.media.defaultYouTubeFolder
            );
            document.body.removeChild(modal);
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
            const res = await (window as any).requestUrl({ url });
            const html = res.text;
            
            const idMatch = html.match(/channel_id=(UC[a-zA-Z0-9_-]{22})/);
            let channelId = idMatch && idMatch[1] ? idMatch[1] : null;
            
            const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
            let channelName = nameMatch && nameMatch[1] ? nameMatch[1] : null;
            return { channelId, channelName };
        } catch (e) {
            
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
        const oldName = parts[parts.length - 1];
        const folder = this.findFolderByPath(oldPath);
        if (folder) {
            folder.name = newName;
            folder.modifiedAt = Date.now();

            if (parentPath) {
                const parent = this.findFolderByPath(parentPath);
                if (parent) parent.modifiedAt = Date.now();
            }
            
            
            const allDescendantPaths = this.getAllDescendantFolderPaths(oldPath);
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
        }
    }

    private async addSubfolderByPath(parentPath: string, subfolderName: string) {
        const parent = this.findFolderByPath(parentPath);
        if (parent && !parent.subfolders.some(f => f.name === subfolderName)) {
            parent.subfolders.push({ name: subfolderName, subfolders: [], createdAt: Date.now(), modifiedAt: Date.now() });
            parent.modifiedAt = Date.now();
            await this.plugin.saveSettings();
        }
    }

    private async addTopLevelFolder(folderName: string) {
        if (!this.settings.folders.some(f => f.name === folderName)) {
            this.settings.folders.push({ name: folderName, subfolders: [], createdAt: Date.now(), modifiedAt: Date.now() });
            await this.plugin.saveSettings();
        }
    }

    private showFolderNameModal(options: {title: string, defaultValue?: string, onSubmit: (name: string) => void}) {
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal rss-dashboard-modal-container";
        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";
        const modalTitle = document.createElement("h2");
        modalTitle.textContent = options.title;
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = options.defaultValue || "";
        nameInput.placeholder = "Enter folder name";
        nameInput.classList.add("full-width-input", "input-margin-bottom");
        nameInput.autocomplete = "off";
        nameInput.spellcheck = false;
        nameInput.addEventListener("focus", () => nameInput.select());
        nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                okButton.click();
            } else if (e.key === "Escape") {
                cancelButton.click();
            }
        });
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "rss-dashboard-modal-buttons";
        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });
        const okButton = document.createElement("button");
        okButton.textContent = "OK";
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
        modalContent.appendChild(modalTitle);
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
        setTimeout(() => {
            const modal = document.createElement("div");
            modal.className = "rss-dashboard-modal rss-dashboard-modal-container";
            const modalContent = document.createElement("div");
            modalContent.className = "rss-dashboard-modal-content";
            const modalTitle = document.createElement("h2");
            modalTitle.textContent = "Confirm";
            const msg = document.createElement("div");
            msg.textContent = message;
            const buttonContainer = document.createElement("div");
            buttonContainer.className = "rss-dashboard-modal-buttons";
            const cancelButton = document.createElement("button");
            cancelButton.textContent = "Cancel";
            cancelButton.onclick = () => document.body.removeChild(modal);
            const okButton = document.createElement("button");
            okButton.textContent = "OK";
            okButton.className = "rss-dashboard-primary-button";
            okButton.onclick = () => {
                document.body.removeChild(modal);
                onConfirm();
            };
            buttonContainer.appendChild(cancelButton);
            buttonContainer.appendChild(okButton);
            modalContent.appendChild(modalTitle);
            modalContent.appendChild(msg);
            modalContent.appendChild(buttonContainer);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
            setTimeout(() => okButton.focus(), 0);
        }, 0);
    }

    private showAddTagModal(): void {
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal rss-dashboard-modal-container";

        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";

        const modalTitle = document.createElement("h2");
        modalTitle.textContent = "Add New Tag";
        modalContent.appendChild(modalTitle);

        
        const formContainer = document.createElement("div");
        formContainer.className = "rss-dashboard-tag-modal-form";
        modalContent.appendChild(formContainer);

        
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = "#3498db"; 
        colorInput.className = "rss-dashboard-tag-modal-color-picker";
        formContainer.appendChild(colorInput);
        
        
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.placeholder = "Enter tag name";
        nameInput.className = "rss-dashboard-tag-modal-name-input";
        nameInput.autocomplete = "off";
        nameInput.spellcheck = false;
        formContainer.appendChild(nameInput);

        
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "rss-dashboard-modal-buttons";

        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });
        buttonContainer.appendChild(cancelButton);

        const addButton = document.createElement("button");
        addButton.textContent = "Add Tag";
        addButton.className = "rss-dashboard-primary-button";
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
                
                
                this.plugin.saveSettings();
                
                
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

    private showTagContextMenu(event: MouseEvent, tag: Tag): void {
        const menu = new Menu();
        
        menu.addItem((item: MenuItem) => {
            item.setTitle("Edit Tag")
                .setIcon("pencil")
                .onClick(() => {
                    this.showEditTagModal(tag);
                });
        });
        
        menu.addItem((item: MenuItem) => {
            item.setTitle("Delete Tag")
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
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal rss-dashboard-modal-container";

        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";

        const modalTitle = document.createElement("h2");
        modalTitle.textContent = "Edit Tag";
        modalContent.appendChild(modalTitle);

        
        const formContainer = document.createElement("div");
        formContainer.className = "rss-dashboard-tag-modal-form";
        modalContent.appendChild(formContainer);

        
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = tag.color;
        colorInput.className = "rss-dashboard-tag-modal-color-picker";
        formContainer.appendChild(colorInput);

        
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = tag.name;
        nameInput.placeholder = "Enter tag name";
        nameInput.className = "rss-dashboard-tag-modal-name-input";
        nameInput.autocomplete = "off";
        nameInput.spellcheck = false;
        formContainer.appendChild(nameInput);

        
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "rss-dashboard-modal-buttons";

        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });
        buttonContainer.appendChild(cancelButton);

        const saveButton = document.createElement("button");
        saveButton.textContent = "Save Changes";
        saveButton.className = "rss-dashboard-primary-button";
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
                
                
                this.plugin.saveSettings();
                
                
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

        
        this.plugin.saveSettings();
        
        
        this.render();
        
        new Notice(`Tag "${tag.name}" deleted successfully!`);
    }

    private showUnreadItemsContextMenu(event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem((item: MenuItem) => {
            item.setTitle("Mark All Unread as Read")
                .setIcon("check-circle")
                .onClick(async () => {
                    await this.markAllUnreadAsRead();
                });
        });

        menu.showAtMouseEvent(event);
    }

    private showReadItemsContextMenu(event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem((item: MenuItem) => {
            item.setTitle("Mark All Read as Unread")
                .setIcon("circle")
                .onClick(async () => {
                    await this.markAllReadAsUnread();
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

    private renderHeader(): void {
        const header = this.container.createDiv({
            cls: "rss-dashboard-header",
        });

        
        const navContainer = header.createDiv({
            cls: "rss-dashboard-nav-container",
        });

        
        const dashboardBtn = navContainer.createDiv({
            cls: "rss-dashboard-nav-button active",
        });
        
        dashboardBtn.appendChild(document.createTextNode(" Dashboard"));
        dashboardBtn.addEventListener("click", () => {
            
            this.plugin.activateView();
        });

        
        const discoverBtn = navContainer.createDiv({
            cls: "rss-dashboard-nav-button",
        });
        
        discoverBtn.appendChild(document.createTextNode(" Discover"));
        discoverBtn.addEventListener("click", () => {
            
            this.plugin.activateDiscoverView();
        });

        
        
        
        
    }

    private renderSearch(): void {
        const searchContainer = this.container.createDiv({
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

        
        searchInput.addEventListener("focus", () => {
            searchInput.select();
        });

        
        let searchTimeout: NodeJS.Timeout;
        
        searchInput.addEventListener("input", (e) => {
            const query = ((e.target as HTMLInputElement)?.value || "").toLowerCase().trim();
            
            
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }

            
            searchTimeout = setTimeout(() => {
                
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
    }

    private renderFilters(): void {
        const filtersList = this.container.createDiv({
            cls: "rss-dashboard-filters-section",
        });

        
        const allItemsEl = filtersList.createDiv({
            cls: "rss-dashboard-folder" + 
                (this.options.currentFolder === null && 
                this.options.currentFeed === null && 
                this.options.currentTag === null ? " active" : ""),
        });

        const allItemsIcon = allItemsEl.createDiv({
            cls: "rss-dashboard-folder-icon",
        });
        setIcon(allItemsIcon, "list");

        allItemsEl.createDiv({
            cls: "rss-dashboard-folder-name",
            text: "All Items",
        });
        allItemsEl.addEventListener("click", () => {
            this.callbacks.onFolderClick(null);
        });

        
        const starredItemsEl = filtersList.createDiv({
            cls: "rss-dashboard-folder" + 
                (this.options.currentFolder === "starred" ? " active" : ""),
        });

        const starredItemsIcon = starredItemsEl.createDiv({
            cls: "rss-dashboard-folder-icon",
        });
        setIcon(starredItemsIcon, "star");

        starredItemsEl.createDiv({
            cls: "rss-dashboard-folder-name",
            text: "Starred Items",
        });
        starredItemsEl.addEventListener("click", () => {
            this.callbacks.onFolderClick("starred");
        });

        
        const unreadItemsEl = filtersList.createDiv({
            cls: "rss-dashboard-folder" + 
                (this.options.currentFolder === "unread" ? " active" : ""),
        });

        const unreadItemsIcon = unreadItemsEl.createDiv({
            cls: "rss-dashboard-folder-icon",
        });
        setIcon(unreadItemsIcon, "circle");

        unreadItemsEl.createDiv({
            cls: "rss-dashboard-folder-name",
            text: "Unread Items",
        });
        unreadItemsEl.addEventListener("click", () => {
            this.callbacks.onFolderClick("unread");
        });

        unreadItemsEl.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            this.showUnreadItemsContextMenu(e);
        });

        
        const readItemsEl = filtersList.createDiv({
            cls: "rss-dashboard-folder" + 
                (this.options.currentFolder === "read" ? " active" : ""),
        });

        const readItemsIcon = readItemsEl.createDiv({
            cls: "rss-dashboard-folder-icon",
        });
        setIcon(readItemsIcon, "check-circle");

        readItemsEl.createDiv({
            cls: "rss-dashboard-folder-name",
            text: "Read Items",
        });
        readItemsEl.addEventListener("click", () => {
            this.callbacks.onFolderClick("read");
        });

        readItemsEl.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            this.showReadItemsContextMenu(e);
        });

        
        const savedItemsEl = filtersList.createDiv({
            cls: "rss-dashboard-folder" + 
                (this.options.currentFolder === "saved" ? " active" : ""),
        });

        const savedItemsIcon = savedItemsEl.createDiv({
            cls: "rss-dashboard-folder-icon",
        });
        setIcon(savedItemsIcon, "save");

        savedItemsEl.createDiv({
            cls: "rss-dashboard-folder-name",
            text: "Saved Items",
        });
        savedItemsEl.addEventListener("click", () => {
            this.callbacks.onFolderClick("saved");
        });

        
        const videoItemsEl = filtersList.createDiv({
            cls: "rss-dashboard-folder" + 
                (this.options.currentFolder === "videos" ? " active" : ""),
        });

        const videoItemsIcon = videoItemsEl.createDiv({
            cls: "rss-dashboard-folder-icon youtube",
        });
        setIcon(videoItemsIcon, "play");

        videoItemsEl.createDiv({
            cls: "rss-dashboard-folder-name",
            text: "Videos",
        });
        videoItemsEl.addEventListener("click", () => {
            this.callbacks.onFolderClick("videos");
        });

        
        const podcastItemsEl = filtersList.createDiv({
            cls: "rss-dashboard-folder" + 
                (this.options.currentFolder === "podcasts" ? " active" : ""),
        });

        const podcastItemsIcon = podcastItemsEl.createDiv({
            cls: "rss-dashboard-folder-icon podcast",
        });
        setIcon(podcastItemsIcon, "mic");

        podcastItemsEl.createDiv({
            cls: "rss-dashboard-folder-name",
            text: "Podcasts",
        });
        podcastItemsEl.addEventListener("click", () => {
            this.callbacks.onFolderClick("podcasts");
        });
    }

    private renderToolbar(): void {
        const sidebarToolbar = this.container.createDiv({
            cls: "rss-dashboard-sidebar-toolbar",
        });

        
        const addFolderButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Add Folder",
            },
        });
        setIcon(addFolderButton, "folder-plus");
        addFolderButton.addEventListener("click", () => {
            this.showFolderNameModal({
                title: "Add Folder",
                onSubmit: async (folderName) => {
                    await this.addTopLevelFolder(folderName);
                    this.render();
                }
            });
        });

        const sortButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Sort Folders"
            }
        });
        setIcon(sortButton, "lucide-sort-asc");
        sortButton.addEventListener("click", (e) => {
            const menu = new Menu();

            menu.addItem((item) =>
                item
                    .setTitle("Folder name (A to Z)")
                    .onClick(async () => await this.sortFolders('name', true))
            );
            menu.addItem((item) =>
                item
                    .setTitle("Folder name (Z to A)")
                    .onClick(async () => await this.sortFolders('name', false))
            );
            menu.addItem((item) =>
                item
                    .setTitle("Modified time (new to old)")
                    .onClick(async () => await this.sortFolders('modified', false))
            );
            menu.addItem((item) =>
                item
                    .setTitle("Modified time (old to new)")
                    .onClick(async () => await this.sortFolders('modified', true))
            );
            menu.addItem((item) =>
                item
                    .setTitle("Created time (new to old)")
                    .onClick(async () => await this.sortFolders('created', false))
            );
            menu.addItem((item) =>
                item
                    .setTitle("Created time (old to new)")
                    .onClick(async () => await this.sortFolders('created', true))
            );

            menu.showAtMouseEvent(e);
        });

        const collapseAllButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Collapse/Expand All Folders"
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
            
            this.clearFolderPathCache();
            cachedFolderPaths = null;
            this.toggleAllFolders();
            
            
            setTimeout(() => updateCollapseIcon(), 0);
        });

        
        const addFeedButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Add Feed",
            },
        });
        setIcon(addFeedButton, "plus");
        addFeedButton.addEventListener("click", () => {
            this.showAddFeedModal();
        });

        
        const addYouTubeButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Add YouTube Channel",
            },
        });
        setIcon(addYouTubeButton, "youtube");
        addYouTubeButton.addEventListener("click", () => {
            this.showAddYouTubeFeedModal();
        });

        
        const importOpmlButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Import OPML",
            },
        });
        setIcon(importOpmlButton, "upload");
        importOpmlButton.addEventListener("click", () => {
            this.callbacks.onImportOpml();
        });

        
        const exportOpmlButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Export OPML",
            },
        });
        setIcon(exportOpmlButton, "download");
        exportOpmlButton.addEventListener("click", () => {
            this.callbacks.onExportOpml();
        });

        
        const manageFeedsButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Manage Feeds",
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
            item.setTitle("Update Feed")
                .setIcon("refresh-cw")
                .onClick(async () => {
                    await this.callbacks.onUpdateFeed(feed);
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Edit Feed")
                .setIcon("edit")
                .onClick(() => {
                    this.showEditFeedModal(feed);
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Mark All as Read")
                .setIcon("check-circle")
                .onClick(async () => {
                    feed.items.forEach(item => {
                        item.read = true;
                    });
                    await this.plugin.saveSettings();
                    this.render();
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Change Media Type")
                .setIcon("lucide-circle-gauge")
                .onClick((evt) => {
                    const typeMenu = new Menu();
                    typeMenu.addItem((subItem: MenuItem) => {
                        subItem.setTitle("Article").setIcon("file-text").onClick(async () => {
                            feed.mediaType = 'article';
                            await this.plugin.saveSettings();
                            this.render();
                        });
                    });
                    typeMenu.addItem((subItem: MenuItem) => {
                        subItem.setTitle("Podcast").setIcon("headphones").onClick(async () => {
                            feed.mediaType = 'podcast';
                            await this.plugin.saveSettings();
                            this.render();
                        });
                    });
                    typeMenu.addItem((subItem: MenuItem) => {
                        subItem.setTitle("Video").setIcon("play-circle").onClick(async () => {
                            feed.mediaType = 'video';
                            await this.plugin.saveSettings();
                            this.render();
                        });
                    });
                    typeMenu.showAtMouseEvent(evt as MouseEvent);
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Delete Feed")
                .setIcon("trash")
                .onClick(() => {
                    this.showConfirmModal(`Are you sure you want to delete the feed "${feed.title}"?`, () => {
                        this.callbacks.onDeleteFeed(feed);
                    });
                });
        });

        menu.showAtMouseEvent(event);
    }

    private _sortFolders(by: "name" | "created" | "modified", ascending: boolean) {
        const sorter = (a: Folder, b: Folder): number => {
			
			if (a.pinned && !b.pinned) return -1;
			if (!a.pinned && b.pinned) return 1;
			
			
			let valA: any, valB: any;

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
                .setTitle("Feed name (A to Z)")
                .onClick(async () => await this.sortFeedsInFolder(folderPath, 'name', true))
        );
        menu.addItem((item) =>
            item
                .setTitle("Feed name (Z to A)")
                .onClick(async () => await this.sortFeedsInFolder(folderPath, 'name', false))
        );
        menu.addItem((item) =>
            item
                .setTitle("Created time (new to old)")
                .onClick(async () => await this.sortFeedsInFolder(folderPath, 'created', false))
        );
        menu.addItem((item) =>
            item
                .setTitle("Created time (old to new)")
                .onClick(async () => await this.sortFeedsInFolder(folderPath, 'created', true))
        );
        menu.addItem((item) =>
            item
                .setTitle("Number of items (high to low)")
                .onClick(async () => await this.sortFeedsInFolder(folderPath, 'itemCount', false))
        );
        menu.addItem((item) =>
            item
                .setTitle("Number of items (low to high)")
                .onClick(async () => await this.sortFeedsInFolder(folderPath, 'itemCount', true))
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
            let valA: any, valB: any;

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

    /**
     * Optimized toggle all folders functionality.
     * 
     * Performance optimizations implemented:
     * 1. Cached folder paths to avoid repeated recursive calculations
     * 2. Batch state updates instead of individual folder toggles
     * 3. Single render call instead of multiple renders
     * 4. Efficient Set operations for collapsed state management
     * 5. Performance monitoring for optimization tracking
     * 
     * This method is significantly faster than the previous implementation
     * which called individual toggle callbacks for each folder.
     */
    private toggleAllFolders(): void {
        const startTime = performance.now();
        
        
        const allFolderPaths = this.getCachedFolderPaths();

        if (allFolderPaths.length === 0) {
            return;
        }

        const collapsedSet = new Set(this.options.collapsedFolders);
        const allCollapsed = allFolderPaths.every(path => collapsedSet.has(path));

        
        if (allCollapsed) {
            
            this.options.collapsedFolders = this.options.collapsedFolders.filter(
                path => !allFolderPaths.includes(path)
            );
            new Notice("All folders expanded");
        } else {
            
            const newCollapsedFolders = new Set(this.options.collapsedFolders);
            allFolderPaths.forEach(path => {
                if (!newCollapsedFolders.has(path)) {
                    newCollapsedFolders.add(path);
                }
            });
            this.options.collapsedFolders = Array.from(newCollapsedFolders);
            new Notice("All folders collapsed");
        }

        
        this.settings.collapsedFolders = this.options.collapsedFolders;
        this.plugin.saveSettings();
        this.render();
        
        const endTime = performance.now();
        
    }
}

function collectAllFolders(folders: any[], base = ""): string[] {
    let paths: string[] = [];
    for (const f of folders) {
        const path = base ? `${base}/${f.name}` : f.name;
        paths.push(path);
        if (f.subfolders && f.subfolders.length > 0) {
            paths = paths.concat(collectAllFolders(f.subfolders, path));
        }
    }
    return paths;
}
