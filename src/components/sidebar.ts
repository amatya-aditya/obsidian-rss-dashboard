import { Menu, MenuItem, Notice } from "obsidian";
import { Feed, Folder, Tag, RssDashboardSettings } from "../types";
import { MediaService } from "../services/media-service";
import { setIcon } from "obsidian";
import { Setting } from "obsidian";

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
    onAddFeed: (title: string, url: string, folder: string) => void;
    onEditFeed: (feed: Feed, title: string, url: string, folder: string) => void;
    onDeleteFeed: (feed: Feed) => void;
    onDeleteFolder: (folder: string) => void;
    onRefreshFeeds: () => void;
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
                tagColorDot.style.backgroundColor = tag.color;

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
    
    constructor(container: HTMLElement, settings: RssDashboardSettings, options: SidebarOptions, callbacks: SidebarCallbacks) {
        this.container = container;
        this.settings = settings;
        this.options = options;
        this.callbacks = callbacks;

        this.renderTags(this.container);
    }
    
    render(): void {
        
        const scrollPosition = this.container.scrollTop;
        
        
        this.container.empty();
        this.container.addClass("rss-dashboard-sidebar");
        
        
        this.renderHeader();
        this.renderFilters();
        this.renderTags(this.container);
        this.renderFeedFolders();
        this.renderToolbar();
        
        
        requestAnimationFrame(() => {
            this.container.scrollTop = scrollPosition;
        });
    }

    private updateHeader(): void {
        const header = this.container.querySelector('.rss-dashboard-header');
        if (header) {
            const title = header.querySelector('.rss-dashboard-title');
            if (title) {
                title.textContent = "RSS Dashboard";
            }
        }
    }

    private updateFilters(): void {
        const filtersList = this.container.querySelector('.rss-dashboard-filters-section');
        if (!filtersList) return;

        
        const allItemsEl = filtersList.querySelector('.rss-dashboard-folder');
        if (allItemsEl) {
            allItemsEl.className = "rss-dashboard-folder" + 
                (this.options.currentFolder === null && 
                this.options.currentFeed === null && 
                this.options.currentTag === null ? " active" : "");
        }

        const starredItemsEl = filtersList.querySelector('.rss-dashboard-folder:nth-child(2)');
        if (starredItemsEl) {
            starredItemsEl.className = "rss-dashboard-folder" + 
                (this.options.currentFolder === "starred" ? " active" : "");
        }

        const unreadItemsEl = filtersList.querySelector('.rss-dashboard-folder:nth-child(3)');
        if (unreadItemsEl) {
            unreadItemsEl.className = "rss-dashboard-folder" + 
                (this.options.currentFolder === "unread" ? " active" : "");
        }

        const readItemsEl = filtersList.querySelector('.rss-dashboard-folder:nth-child(4)');
        if (readItemsEl) {
            readItemsEl.className = "rss-dashboard-folder" + 
                (this.options.currentFolder === "read" ? " active" : "");
        }

        const savedItemsEl = filtersList.querySelector('.rss-dashboard-folder:nth-child(5)');
        if (savedItemsEl) {
            savedItemsEl.className = "rss-dashboard-folder" + 
                (this.options.currentFolder === "saved" ? " active" : "");
        }

        const videoItemsEl = filtersList.querySelector('.rss-dashboard-folder:nth-child(6)');
        if (videoItemsEl) {
            videoItemsEl.className = "rss-dashboard-folder" + 
                (this.options.currentFolder === "videos" ? " active" : "");
        }

        const podcastItemsEl = filtersList.querySelector('.rss-dashboard-folder:nth-child(7)');
        if (podcastItemsEl) {
            podcastItemsEl.className = "rss-dashboard-folder" + 
                (this.options.currentFolder === "podcasts" ? " active" : "");
        }
    }

    private updateTags(tagsList: HTMLElement): void {
        
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
            tagColorDot.style.backgroundColor = tag.color;

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

    private renderFeedFolders(): void {
        const feedFoldersSection = this.container.createDiv({
            cls: "rss-dashboard-feed-folders-section",
        });

        
        const scrollPosition = feedFoldersSection.scrollTop;

        
        if (this.settings.folders && this.settings.folders.length > 0) {
            this.settings.folders.forEach(folderObj => this.renderFolder(folderObj, "", 0, feedFoldersSection));
        }

        
        const allFolderPaths = new Set<string>();
        function collectPaths(folders: Folder[], base = "") {
            for (const f of folders) {
                const path = base ? `${base}/${f.name}` : f.name;
                allFolderPaths.add(path);
                if (f.subfolders && f.subfolders.length > 0) {
                    collectPaths(f.subfolders, path);
                }
            }
        }
        collectPaths(this.settings.folders);
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
                menu.showAtMouseEvent(e);
            }
        });

        
        requestAnimationFrame(() => {
            feedFoldersSection.scrollTop = scrollPosition;
        });
    }

    private renderFolder(folderObj: Folder, parentPath = "", depth = 0, container: HTMLElement): void {
        const folderName = folderObj.name;
        const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        const isCollapsed = this.options.collapsedFolders.includes(fullPath);

        const folderEl = container.createDiv({
            cls: "rss-dashboard-feed-folder",
        });
        folderEl.style.marginLeft = `${depth * 18}px`;

        const folderHeader = folderEl.createDiv({
            cls: "rss-dashboard-feed-folder-header" + (isCollapsed ? " collapsed" : ""),
        });

        const toggleButton = folderHeader.createDiv({
            cls: "rss-dashboard-feed-folder-toggle",
        });
        toggleButton.setAttr("aria-label", isCollapsed ? "Expand folder" : "Collapse folder");
        setIcon(toggleButton as HTMLElement, isCollapsed ? "chevron-right" : "chevron-down");

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
                            onSubmit: (subfolderName) => {
                                this.addSubfolderByPath(fullPath, subfolderName);
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
                            onSubmit: (newName) => {
                                if (newName !== folderName) {
                                    this.renameFolderByPath(fullPath, newName);
                                    this.render();
                                }
                            }
                        });
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
            menu.showAtMouseEvent(e);
        });

        
        folderHeader.addEventListener("dragover", (e) => {
            e.preventDefault();
            folderHeader.classList.add("drag-over");
        });

        folderHeader.addEventListener("dragleave", () => {
            folderHeader.classList.remove("drag-over");
        });

        folderHeader.addEventListener("drop", (e) => {
            e.preventDefault();
            folderHeader.classList.remove("drag-over");
            const dragEvent = e as DragEvent;
            if (dragEvent.dataTransfer) {
                const feedUrl = dragEvent.dataTransfer.getData("feed-url");
                if (feedUrl) {
                    const feed = this.settings.feeds.find(f => f.url === feedUrl);
                    if (feed && feed.folder !== fullPath) {
                        feed.folder = fullPath;
                        this.render();
                    }
                }
            }
        });

        
        const folderFeedsList = folderEl.createDiv({
            cls: "rss-dashboard-folder-feeds" + (isCollapsed ? " collapsed" : ""),
        });

        const feedsInFolder = this.settings.feeds.filter(feed => feed.folder === fullPath);
        feedsInFolder.forEach((feed) => {
            this.renderFeed(feed, folderFeedsList);
        });

        
        if (folderObj.subfolders && folderObj.subfolders.length > 0 && !isCollapsed) {
            folderObj.subfolders.forEach((subfolder: Folder) => {
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
        if (feed.mediaType === 'video') {
            setIcon(feedIcon, "play");
            feedIcon.style.color = "#ff0000";
            feedEl.classList.add('youtube-feed');
        } else if (feed.mediaType === 'podcast') {
            setIcon(feedIcon, "mic");
            feedIcon.style.color = "#8e44ad";
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

        feedEl.addEventListener("click", () => {
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

    private updateToolbar(): void {
        const toolbar = this.container.querySelector('.rss-dashboard-sidebar-toolbar');
        if (!toolbar) return;

        
        const buttons = toolbar.querySelectorAll('.rss-dashboard-toolbar-button');
        buttons.forEach(button => {
            const title = button.getAttribute('title');
            if (title === "Add Folder") {
                (button as HTMLElement).onclick = () => {
                    this.showFolderNameModal({
                        title: "Add Folder",
                        onSubmit: (folderName) => {
                            this.addTopLevelFolder(folderName);
                            this.render();
                        }
                    });
                };
            } else if (title === "Add Feed") {
                (button as HTMLElement).onclick = () => {
                    this.showAddFeedModal();
                };
            } else if (title === "Add YouTube Channel") {
                (button as HTMLElement).onclick = () => {
                    this.showAddYouTubeFeedModal();
                };
            } else if (title === "Refresh All Feeds") {
                (button as HTMLElement).onclick = () => {
                    this.callbacks.onRefreshFeeds();
                };
            } else if (title === "Import OPML") {
                (button as HTMLElement).onclick = () => {
                    this.callbacks.onImportOpml();
                };
            } else if (title === "Export OPML") {
                (button as HTMLElement).onclick = () => {
                    this.callbacks.onExportOpml();
                };
            } else if (title === "Open Settings") {
                (button as HTMLElement).onclick = () => {
                    if (this.callbacks.onOpenSettings) {
                        this.callbacks.onOpenSettings();
                    }
                };
            } else if (title === "Manage Feeds") {
                (button as HTMLElement).onclick = () => {
                    if (this.callbacks.onManageFeeds) {
                        this.callbacks.onManageFeeds();
                    }
                };
            }
        });
    }
    
    private renderHeader(): void {
        const header = this.container.createDiv({
            cls: "rss-dashboard-header",
        });

        header.createDiv({
            cls: "rss-dashboard-title",
            text: "RSS Dashboard",
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
                    this.showDeleteTagConfirm(tag);
                });
        });
        
        menu.showAtMouseEvent(event);
    }
    
    private showDeleteTagConfirm(tag: Tag): void {
        this.showConfirmModal(`Are you sure you want to delete the tag "${tag.name}"? This will remove it from all items.`, () => {
            
            for (const feed of this.settings.feeds) {
                for (const item of feed.items) {
                    if (item.tags) {
                        item.tags = item.tags.filter(t => t.name !== tag.name);
                    }
                }
            }
            
            this.settings.availableTags = this.settings.availableTags.filter(t => t.name !== tag.name);
            
            if (this.options.currentTag === tag.name) {
                this.callbacks.onTagClick(null);
            } else {
                this.render();
            }
            new Notice(`Tag "${tag.name}" deleted`);
        });
    }
    
    private showAddTagModal(): void {
        
        document.querySelectorAll('.rss-dashboard-modal').forEach(el => el.remove());
        setTimeout(() => {
            const modal = document.createElement("div");
            modal.className = "rss-dashboard-modal";

            const modalContent = document.createElement("div");
            modalContent.className = "rss-dashboard-modal-content";

            const modalTitle = document.createElement("h2");
            modalTitle.textContent = "Add New Tag";

            
            const tagInputRow = document.createElement("div");
            tagInputRow.className = "add-tag-modal tag-input-row full-inline-row";

            
            const colorLabel = document.createElement("label");
            colorLabel.className = "color-label";
            colorLabel.title = "Pick tag color";
            const colorInput = document.createElement("input");
            colorInput.type = "color";
            colorInput.value = "#3498db";
            colorInput.className = "color-circle";
            colorLabel.appendChild(colorInput);

            
            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.placeholder = "Enter tag name";
            nameInput.className = "tag-name-input";
            nameInput.autocomplete = "off";
            nameInput.spellcheck = false;

            
            const buttonContainer = document.createElement("div");
            buttonContainer.className = "rss-dashboard-modal-buttons inline-buttons";
            buttonContainer.style.display = "flex";
            buttonContainer.style.gap = "0.5em";
            buttonContainer.style.margin = "0";
            buttonContainer.style.alignItems = "center";

            const cancelButton = document.createElement("button");
            cancelButton.textContent = "Cancel";
            cancelButton.addEventListener("click", () => {
                document.body.removeChild(modal);
            });

            const saveButton = document.createElement("button");
            saveButton.textContent = "Add Tag";
            saveButton.className = "rss-dashboard-primary-button";
            saveButton.addEventListener("click", () => {
                const tagName = nameInput.value.trim();
                if (!tagName) {
                    new Notice("Please enter a tag name");
                    return;
                }

                
                if (this.settings.availableTags.some(t => t.name === tagName)) {
                    new Notice(`Tag "${tagName}" already exists`);
                    return;
                }

                
                this.settings.availableTags.push({
                    name: tagName,
                    color: colorInput.value,
                });

                document.body.removeChild(modal);
                this.render();
                new Notice(`Tag "${tagName}" created`);
            });

            
            nameInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    saveButton.click();
                } else if (e.key === "Escape") {
                    cancelButton.click();
                }
            });

            tagInputRow.appendChild(colorLabel);
            tagInputRow.appendChild(nameInput);
            tagInputRow.appendChild(cancelButton);
            tagInputRow.appendChild(saveButton);

            modalContent.appendChild(modalTitle);
            modalContent.appendChild(tagInputRow);
            modalContent.appendChild(buttonContainer);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);

            setTimeout(() => {
                nameInput.focus();
                nameInput.select();
            }, 0);
        }, 0);
    }
    
    private showEditTagModal(tag: Tag): void {
        
        document.querySelectorAll('.rss-dashboard-modal').forEach(el => el.remove());
        setTimeout(() => {
            const modal = document.createElement("div");
            modal.className = "rss-dashboard-modal";

            const modalContent = document.createElement("div");
            modalContent.className = "rss-dashboard-modal-content";

            const modalTitle = document.createElement("h2");
            modalTitle.textContent = "Edit Tag";

            
            const tagInputRow = document.createElement("div");
            tagInputRow.className = "add-tag-modal tag-input-row full-inline-row";

            
            const colorLabel = document.createElement("label");
            colorLabel.className = "color-label";
            colorLabel.title = "Pick tag color";
            const colorInput = document.createElement("input");
            colorInput.type = "color";
            colorInput.value = tag.color;
            colorInput.className = "color-circle";
            colorLabel.appendChild(colorInput);

            
            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.value = tag.name;
            nameInput.className = "tag-name-input";
            nameInput.placeholder = "Enter tag name";
            nameInput.autocomplete = "off";
            nameInput.spellcheck = false;

            
            const buttonContainer = document.createElement("div");
            buttonContainer.className = "rss-dashboard-modal-buttons inline-buttons";

            const cancelButton = document.createElement("button");
            cancelButton.textContent = "Cancel";
            cancelButton.addEventListener("click", () => {
                document.body.removeChild(modal);
            });

            const saveButton = document.createElement("button");
            saveButton.textContent = "Save";
            saveButton.className = "rss-dashboard-primary-button";
            saveButton.addEventListener("click", () => {
                const newName = nameInput.value.trim();
                if (!newName) {
                    new Notice("Please enter a tag name");
                    return;
                }
                if (newName !== tag.name && this.settings.availableTags.some(t => t.name === newName)) {
                    new Notice(`Tag "${newName}" already exists`);
                    return;
                }
                const oldName = tag.name;
                if (newName !== oldName) {
                    for (const feed of this.settings.feeds) {
                        for (const item of feed.items) {
                            if (item.tags) {
                                const itemTag = item.tags.find(t => t.name === oldName);
                                if (itemTag) {
                                    itemTag.name = newName;
                                    itemTag.color = colorInput.value;
                                }
                            }
                        }
                    }
                }
                tag.name = newName;
                tag.color = colorInput.value;
                document.body.removeChild(modal);
                if (this.options.currentTag === oldName) {
                    this.callbacks.onTagClick(newName);
                } else {
                    this.render();
                }
                new Notice(`Tag updated`);
            });

            
            nameInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    saveButton.click();
                } else if (e.key === "Escape") {
                    cancelButton.click();
                }
            });

            tagInputRow.appendChild(colorLabel);
            tagInputRow.appendChild(nameInput);
            tagInputRow.appendChild(cancelButton);
            tagInputRow.appendChild(saveButton);

            modalContent.appendChild(modalTitle);
            modalContent.appendChild(tagInputRow);
            modalContent.appendChild(buttonContainer);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);

            setTimeout(() => {
                nameInput.focus();
                nameInput.select();
            }, 0);
        }, 0);
    }
    
    private showFolderContextMenu(event: MouseEvent, folder: string): void {
        const menu = new Menu();

        
        menu.addItem((item: MenuItem) => {
            item.setTitle("Add Feed")
                .setIcon("rss")
                .onClick(() => {
                    this.showAddFeedModal(folder);
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Add Subfolder")
                .setIcon("folder-plus")
                .onClick(() => {
                    const folderName = prompt("Enter subfolder name");
                    if (folderName && this.callbacks.onAddSubfolder) {
                        this.callbacks.onAddSubfolder(folder, folderName);
                    }
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Rename Folder")
                .setIcon("edit")
                .onClick(() => {
                    const newName = prompt("Enter new folder name", folder);
                    if (newName && newName !== folder && this.callbacks.onEditFeed) {
                        
                        this.settings.feeds.forEach(feed => {
                            if (feed.folder === folder) {
                                this.callbacks.onEditFeed(feed, feed.title, feed.url, newName);
                            }
                        });
                    }
                });
        });

        menu.addItem((item: MenuItem) => {
            item.setTitle("Delete Folder")
                .setIcon("trash")
                .onClick(() => {
                    this.showConfirmModal(`Are you sure you want to delete the folder "${folder}" and all its feeds?`, () => {
                        this.callbacks.onDeleteFolder(folder);
                    });
                });
        });

        menu.showAtMouseEvent(event);
    }
    
    private showFeedContextMenu(event: MouseEvent, feed: Feed): void {
        const menu = new Menu();

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
                .onClick(() => {
                    feed.items.forEach(item => {
                        item.read = true;
                    });
                    this.render();
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
    
    private showAddFeedModal(defaultFolder: string = "Uncategorized"): void {
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal";

        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";

        const modalTitle = document.createElement("h2");
        modalTitle.textContent = "Add Feed";

        let url = "";
        let title = "";
        let status = "";
        let latestEntry = "";
        let folder = defaultFolder;
        let allFolders = this.settings.folders ? collectAllFolders(this.settings.folders) : [];
        let titleInput: HTMLInputElement;
        let folderInput: HTMLInputElement;
        let folderDropdown: HTMLDivElement | null = null;

        
        const urlSetting = new Setting(modalContent)
            .setName("Feed URL")
            .addText(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.onChange(v => url = v);
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        titleInput?.focus();
                    } else if (e.key === "Escape") {
                        document.body.removeChild(modal);
                    }
                });
            })
            .addButton(btn => {
                btn.setButtonText("Load")
                    .onClick(async () => {
                        status = "Loading...";
                        if (statusDiv) statusDiv.textContent = status;
                        try {
                            const res = await (window as any).requestUrl({ url });
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(res.text, "text/xml");
                            const feedTitle = doc.querySelector("channel > title, feed > title");
                            title = feedTitle?.textContent || "";
                            if (titleInput) titleInput.value = title;
                            const latestItem = doc.querySelector("item > pubDate, entry > updated, entry > published");
                            if (latestItem) {
                                const date = new Date(latestItem.textContent!);
                                const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
                                latestEntry = daysAgo === 0 ? "Today" : `${daysAgo} days`;
                                if (latestEntryDiv) latestEntryDiv.textContent = latestEntry;
                            }
                            status = "OK";
                        } catch (e) {
                            status = "Error loading feed";
                        }
                        if (statusDiv) statusDiv.textContent = status;
                    });
            });

        
        new Setting(modalContent)
            .setName("Title")
            .addText(text => {
                titleInput = text.inputEl;
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.setValue(title).onChange(v => title = v);
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        folderInput?.focus();
                    } else if (e.key === "Escape") {
                        document.body.removeChild(modal);
                    }
                });
            });

        
        const latestEntryDiv = modalContent.createDiv({ text: latestEntry, cls: "add-feed-latest-entry" });
        
        const statusDiv = modalContent.createDiv({ text: status, cls: "add-feed-status" });

        
        new Setting(modalContent)
            .setName("Folder")
            .addText(text => {
                folderInput = text.inputEl;
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.setValue(folder).onChange(v => {
                    folder = v;
                    if (folderDropdown) {
                        
                        const filtered = allFolders.filter(f => f.toLowerCase().includes(v.toLowerCase()));
                        folderDropdown.innerHTML = "";
                        filtered.forEach(f => {
                            const opt = folderDropdown!.createDiv({ text: f, cls: "edit-feed-folder-option" });
                            opt.onclick = () => {
                                folder = f;
                                text.setValue(f);
                                if (folderDropdown) folderDropdown.style.display = "none";
                            };
                        });
                        folderDropdown.style.display = filtered.length ? "block" : "none";
                    }
                });
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        saveBtn.click();
                    } else if (e.key === "Escape") {
                        document.body.removeChild(modal);
                    }
                });
                text.inputEl.onfocus = () => {
                    if (!folderDropdown) {
                        folderDropdown = document.createElement("div");
                        folderDropdown.className = "edit-feed-folder-dropdown";
                        folderDropdown.style.position = "absolute";
                        folderDropdown.style.background = "var(--background-primary)";
                        folderDropdown.style.border = "1px solid var(--background-modifier-border, #ccc)";
                        folderDropdown.style.zIndex = "10000";
                        folderDropdown.style.width = folderInput.offsetWidth + "px";
                        folderDropdown.style.maxHeight = "180px";
                        folderDropdown.style.overflowY = "auto";
                        folderDropdown.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
                        
                        const rect = folderInput.getBoundingClientRect();
                        folderDropdown.style.left = rect.left + window.scrollX + "px";
                        folderDropdown.style.top = (rect.bottom + window.scrollY) + "px";
                        document.body.appendChild(folderDropdown);
                    }
                    
                    folderDropdown.innerHTML = "";
                    allFolders.forEach(f => {
                        const opt = folderDropdown!.createDiv({ text: f, cls: "edit-feed-folder-option" });
                        opt.onclick = () => {
                            folder = f;
                            text.setValue(f);
                            if (folderDropdown) folderDropdown.style.display = "none";
                        };
                    });
                    if (folderDropdown) folderDropdown.style.display = allFolders.length ? "block" : "none";
                };
                text.inputEl.onblur = () => {
                    setTimeout(() => {
                        if (folderDropdown) folderDropdown.style.display = "none";
                    }, 200);
                };
            });

        
        const buttonContainer = modalContent.createDiv("rss-dashboard-modal-buttons");
        const saveBtn = buttonContainer.createEl("button", { text: "Save", cls: "rss-dashboard-primary-button" });
        const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });

        saveBtn.onclick = async () => {
            if (!url) {
                new Notice("Please enter a feed URL");
                return;
            }
            if (!title) {
                new Notice("Please enter a feed title");
                return;
            }
            this.callbacks.onAddFeed(title, url, folder);
            document.body.removeChild(modal);
        };

        cancelBtn.onclick = () => {
            document.body.removeChild(modal);
        };

        modalContent.appendChild(modalTitle);
        modalContent.appendChild(buttonContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        
        requestAnimationFrame(() => {
            const firstInput = modal.querySelector('input[type="text"]') as HTMLInputElement;
            if (firstInput) {
                firstInput.focus();
                firstInput.select();
            }
        });
    }
    
    public showEditFeedModal(feed: Feed): void {
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal";

        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";

        const modalTitle = document.createElement("h2");
        modalTitle.textContent = "Edit Feed";

        const titleLabel = document.createElement("label");
        titleLabel.textContent = "Feed Title:";
        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.value = feed.title;
        titleInput.autocomplete = "off";
        titleInput.spellcheck = false;
        titleInput.addEventListener("focus", () => titleInput.select());
        titleInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                urlInput.focus();
            } else if (e.key === "Escape") {
                document.body.removeChild(modal);
            }
        });

        const urlLabel = document.createElement("label");
        urlLabel.textContent = "Feed URL:";
        const urlInput = document.createElement("input");
        urlInput.type = "text";
        urlInput.value = feed.url;
        urlInput.autocomplete = "off";
        urlInput.spellcheck = false;
        urlInput.addEventListener("focus", () => urlInput.select());
        urlInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                folderSelect.focus();
            } else if (e.key === "Escape") {
                document.body.removeChild(modal);
            }
        });

        const folderLabel = document.createElement("label");
        folderLabel.textContent = "Folder:";
        const folderSelect = document.createElement("select");
        
        const folders = Array.from(
            new Set(this.settings.feeds.map(f => f.folder))
        );
        folders.forEach(folder => {
            const option = document.createElement("option");
            option.value = folder;
            option.textContent = folder;
            if (folder === feed.folder) {
                option.selected = true;
            }
            folderSelect.appendChild(option);
        });
        
        const newFolderOption = document.createElement("option");
        newFolderOption.value = "new";
        newFolderOption.textContent = "+ Create new folder";
        folderSelect.appendChild(newFolderOption);
        folderSelect.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                saveButton.click();
            } else if (e.key === "Escape") {
                document.body.removeChild(modal);
            }
        });

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "rss-dashboard-modal-buttons";

        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });

        const saveButton = document.createElement("button");
        saveButton.textContent = "Save";
        saveButton.className = "rss-dashboard-primary-button";
        saveButton.addEventListener("click", async () => {
            let selectedFolder = folderSelect.value;
            
            if (selectedFolder === "new") {
                const newFolderName = prompt("Enter new folder name:");
                if (newFolderName) {
                    selectedFolder = newFolderName;
                } else {
                    return;
                }
            }
            
            this.callbacks.onEditFeed(
                feed,
                titleInput.value,
                urlInput.value,
                selectedFolder
            );
            document.body.removeChild(modal);
        });

        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(saveButton);

        modalContent.appendChild(modalTitle);
        modalContent.appendChild(titleLabel);
        modalContent.appendChild(titleInput);
        modalContent.appendChild(urlLabel);
        modalContent.appendChild(urlInput);
        modalContent.appendChild(folderLabel);
        modalContent.appendChild(folderSelect);
        modalContent.appendChild(buttonContainer);

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        
        requestAnimationFrame(() => {
            titleInput.focus();
            titleInput.select();
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
                onSubmit: (folderName) => {
                    this.addTopLevelFolder(folderName);
                    this.render();
                }
            });
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

        
        const refreshFeedsButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Refresh All Feeds",
            },
        });
        setIcon(refreshFeedsButton, "refresh-cw");
        refreshFeedsButton.addEventListener("click", () => {
            this.callbacks.onRefreshFeeds();
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

        
        const settingsButton = sidebarToolbar.createDiv({
            cls: "rss-dashboard-toolbar-button",
            attr: {
                title: "Open Settings",
            },
        });
        setIcon(settingsButton, "settings");
        settingsButton.addEventListener("click", () => {
            if (this.callbacks.onOpenSettings) {
                this.callbacks.onOpenSettings();
            }
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
    
    private async resolveYouTubeChannelIdFromHandle(handleUrl: string): Promise<string | null> {
        try {
            const res = await (window as any).requestUrl({ url: handleUrl });
            const html = res.text;
            
            const match = html.match(/<link rel=\"canonical\" href=\"https:\/\/www\\.youtube\\.com\/channel\/([^"]+)\"/);
            if (match && match[1]) {
                return match[1];
            }
        } catch (e) {
            
        }
        return null;
    }
    
    private showAddYouTubeFeedModal(): void {
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal";

        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";

        const modalTitle = document.createElement("h2");
        modalTitle.textContent = "Add YouTube Channel";

        const infoText = document.createElement("div");
        infoText.className = "rss-dashboard-modal-info";
        infoText.innerHTML = `
            <p>Enter a YouTube Channel URL or ID. You can use:</p>
            <ul>
                <li>Channel URL: https://www.youtube.com/channel/UCxxxxxxxx</li>
                <li>Channel ID: UCxxxxxxxx</li>
                <li>User URL: https://www.youtube.com/user/username</li>
                <li>User name: username</li>
            </ul>
        `;

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

        modalContent.appendChild(modalTitle);
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

    
    private renameFolderByPath(oldPath: string, newName: string) {
        const parts = oldPath.split("/");
        const parentPath = parts.slice(0, -1).join("/");
        const oldName = parts[parts.length - 1];
        const folder = this.findFolderByPath(oldPath);
        if (folder) {
            folder.name = newName;
            
            this.settings.feeds.forEach(feed => {
                const feedParts = feed.folder.split("/");
                if (feedParts.length === parts.length && feedParts.every((p, i) => (i === parts.length - 1 ? p === oldName : p === parts[i]))) {
                    feed.folder = parentPath ? `${parentPath}/${newName}` : newName;
                }
            });
        }
    }

    
    private addSubfolderByPath(parentPath: string, subfolderName: string) {
        const parent = this.findFolderByPath(parentPath);
        if (parent && !parent.subfolders.some(f => f.name === subfolderName)) {
            parent.subfolders.push({ name: subfolderName, subfolders: [] });
        }
    }

    
    private addTopLevelFolder(folderName: string) {
        if (!this.settings.folders.some(f => f.name === folderName)) {
            this.settings.folders.push({ name: folderName, subfolders: [] });
        }
    }

    
    private showFolderNameModal(options: {title: string, defaultValue?: string, onSubmit: (name: string) => void}) {
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal";
        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";
        const modalTitle = document.createElement("h2");
        modalTitle.textContent = options.title;
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = options.defaultValue || "";
        nameInput.placeholder = "Enter folder name";
        nameInput.style.marginBottom = "15px";
        nameInput.style.width = "100%";
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
        function removeRecursive(folders: Folder[], depth: number): Folder[] {
            return folders.filter(folder => {
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
            modal.className = "rss-dashboard-modal";
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
