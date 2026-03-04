import {
  Menu,
  MenuItem,
  Notice,
  App,
  Modal,
  setIcon,
  Setting,
} from "obsidian";
import {
  Feed,
  Folder,
  Tag,
  RssDashboardSettings,
  FeedMetadata,
  FeedFilterSettings,
} from "../types/types";
import { AddFeedModal, EditFeedModal } from "../modals/feed-manager-modal";
import type RssDashboardPlugin from "../../main";

export interface SidebarOptions {
  currentFolder: string | null;
  currentFeed: Feed | null;
  currentTag: string | null;
  tagsCollapsed: boolean;
  collapsedFolders: string[];
}

export interface SidebarCallbacks {
  onFolderClick: (folder: string | null) => void;
  onFeedClick: (feed: Feed) => void;
  onTagClick: (tag: string | null) => void;
  onToggleTagsCollapse: () => void;
  onToggleFolderCollapse: (folder: string, shouldRerender?: boolean) => void;
  onBatchToggleFolders?: (
    foldersToCollapse: string[],
    foldersToExpand: string[],
  ) => void;
  onAddFolder: (name: string) => void;
  onAddSubfolder: (parent: string, name: string) => void;
  onAddFeed: (
    title: string,
    url: string,
    folder: string,
    autoDeleteDuration?: number,
    maxItemsLimit?: number,
    scanInterval?: number,
    feedFilters?: FeedFilterSettings,
  ) => Promise<void>;
  onEditFeed: (feed: Feed, title: string, url: string, folder: string) => void;
  onDeleteFeed: (feed: Feed) => void;
  onDeleteFolder: (folder: string) => void;
  onRefreshFeeds: () => Promise<void> | void;
  onUpdateFeed: (feed: Feed) => Promise<void>;
  onImportOpml: () => void;
  onExportOpml: () => void;
  onToggleSidebar: () => void;
  onOpenSettings?: () => void;
  onManageFeeds?: () => void;
  onActivateDashboard?: () => void;
  onActivateDiscover?: () => void;
  onCloseMobileSidebar?: () => void;
}

// FolderNameModal — Uses Obsidian's Modal class to prevent mobile focus bugs.
// ⚠️ DO NOT move the input to a raw document.body div or add event.stopPropagation()
// guards. Previous attempts created race conditions with Obsidian's workspace handler,
// causing text deletion, lag, and dropped keystrokes. See bug docs for history.
class FolderNameModal extends Modal {
  private readonly opts: {
    title: string;
    defaultValue?: string;
    existingNames?: string[];
    onSubmit: (name: string) => void;
  };

  constructor(
    app: App,
    opts: {
      title: string;
      defaultValue?: string;
      existingNames?: string[];
      onSubmit: (name: string) => void;
    },
  ) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Scope CSS to this modal element (used for input iOS sizing rules).
    this.modalEl.addClass("rss-folder-name-modal");

    new Setting(contentEl).setName(this.opts.title).setHeading();

    const inputWrapper = contentEl.createDiv({
      cls: "rss-folder-name-modal-input-wrapper rss-input-margin-bottom",
    });

    const nameInput = inputWrapper.createEl("input", {
      attr: {
        type: "text",
        value: this.opts.defaultValue ?? "",
        placeholder: "Enter folder name",
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        spellcheck: "false",
      },
      cls: "rss-full-width-input rss-folder-name-modal-input",
    });
    nameInput.spellcheck = false;

    const clearInputButton = inputWrapper.createEl("button", {
      cls: "rss-folder-name-modal-input-clear",
      attr: {
        type: "button",
        "aria-label": "Clear folder name",
        title: "Clear",
      },
    });
    setIcon(clearInputButton, "x");

    const updateClearButtonState = () => {
      clearInputButton.classList.toggle(
        "is-hidden",
        nameInput.value.length === 0,
      );
    };

    const errorMsg = contentEl.createDiv({
      cls: "rss-folder-name-modal-error rss-folder-name-modal-error-hidden",
    });

    const showError = (msg: string) => {
      errorMsg.textContent = msg;
      errorMsg.removeClass("rss-folder-name-modal-error-hidden");
      nameInput.classList.add("rss-folder-name-modal-input-error");
    };
    const clearError = () => {
      errorMsg.addClass("rss-folder-name-modal-error-hidden");
      nameInput.classList.remove("rss-folder-name-modal-input-error");
    };

    const submit = () => {
      const name = nameInput.value.trim();
      if (!name) {
        showError("Please enter a folder name.");
        nameInput.focus();
        return;
      }
      if (
        this.opts.existingNames?.includes(name) &&
        name !== this.opts.defaultValue
      ) {
        showError("A folder with this name already exists.");
        nameInput.focus();
        return;
      }
      this.close();
      this.opts.onSubmit(name);
    };

    nameInput.addEventListener("input", () => {
      clearError();
      updateClearButtonState();
    });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });

    clearInputButton.addEventListener("click", () => {
      nameInput.value = "";
      clearError();
      updateClearButtonState();
      nameInput.focus();
    });

    updateClearButtonState();

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons rss-folder-name-modal-buttons",
    });

    const okButton = buttonContainer.createEl("button");
    okButton.className = "rss-dashboard-primary-button";
    okButton.addClass("rss-folder-name-modal-ok");
    const okIcon = okButton.createSpan();
    setIcon(okIcon, "check");
    okButton.createSpan({ text: "OK" });
    okButton.addEventListener("click", submit);

    const cancelButton = buttonContainer.createEl("button");
    cancelButton.addClass("rss-folder-name-modal-cancel");
    const cancelIcon = cancelButton.createSpan();
    setIcon(cancelIcon, "x");
    cancelButton.createSpan({ text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());

    // Single focus+select; Obsidian's Modal handles focus isolation.
    // ⚠️ Do NOT add rAF re-focus, blur recovery, or stopPropagation.
    setTimeout(() => {
      if (this.contentEl.isConnected) {
        nameInput.focus();
        nameInput.select();
      }
    }, 50);
  }

  onClose() {
    this.contentEl.empty();
  }
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
  private isRefreshing = false;
  private longPressTimer: number | null = null;

  /**
   * Extract main domain from a URL for favicon purposes (without subdomains)
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      // Extract main domain without subdomains
      const parts = hostname.split(".");
      if (parts.length >= 2) {
        // For domains like feeds.feedburner.com -> feedburner.com
        // For domains like arstechnica.com -> arstechnica.com
        // For domains like lowtechmagazine.com -> lowtechmagazine.com
        if (parts.length === 3 && parts[0] === "feeds") {
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
        const parts = hostname.split(".");
        if (parts.length >= 2) {
          if (parts.length === 3 && parts[0] === "feeds") {
            return `${parts[1]}.${parts[2]}`;
          } else if (parts.length >= 3) {
            return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
          } else {
            return hostname;
          }
        }
        return hostname;
      }
      return "";
    }
  }

  /**
   * Get favicon URL for a domain using Google's faviconV2 service
   * This API has better fallback handling than DuckDuckGo
   */
  private getFaviconUrl(domain: string): string {
    if (!domain) return "";
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

  constructor(
    app: App,
    container: HTMLElement,
    plugin: RssDashboardPlugin,
    settings: RssDashboardSettings,
    options: SidebarOptions,
    callbacks: SidebarCallbacks,
  ) {
    this.app = app;
    this.container = container;
    this.plugin = plugin;
    this.settings = settings;
    this.options = options;
    this.callbacks = callbacks;
  }

  public destroy(): void {
    // No-op for now; kept for call-site compatibility.
  }

  public render(): void {
    const scrollPosition = this.container.scrollTop;

    // Also preserve folders section scroll if it exists
    let foldersScroll = 0;
    const oldFoldersSection = this.container.querySelector(
      ".rss-dashboard-feed-folders-section",
    );
    if (oldFoldersSection) {
      foldersScroll = oldFoldersSection.scrollTop;
    }

    this.container.empty();
    this.container.addClass("rss-dashboard-sidebar");

    const spacing = this.settings.display.sidebarRowSpacing ?? 10;
    this.container.style.setProperty("--sidebar-row-spacing", `${spacing}px`);

    const indentation = this.settings.display.sidebarRowIndentation ?? 20;
    this.container.style.setProperty(
      "--sidebar-row-indentation",
      `${indentation}px`,
    );
    this.container.style.setProperty(
      "--rss-unread-badge-all-feeds-color",
      this.settings.display.allFeedsUnreadBadgeColor || "#8e44ad",
    );
    this.container.style.setProperty(
      "--rss-unread-badge-folder-color",
      this.settings.display.folderUnreadBadgeColor || "#d85b9f",
    );
    this.container.style.setProperty(
      "--rss-unread-badge-feed-color",
      this.settings.display.feedUnreadBadgeColor || "#8e44ad",
    );

    this.renderHeader();
    this.renderToolbar(this.container);
    this.renderSearchDock(this.container);
    this.renderFeedFolders();

    requestAnimationFrame(() => {
      this.container.scrollTop = scrollPosition;
      const newFoldersSection = this.container.querySelector(
        ".rss-dashboard-feed-folders-section",
      );
      if (newFoldersSection) {
        newFoldersSection.scrollTop = foldersScroll;
      }
    });
  }

  private renderFeedFolders(): void {
    const feedFoldersSection = this.container.createDiv({
      cls: "rss-dashboard-feed-folders-section",
    });
    const folderUnreadCountMap = this.buildFolderUnreadCountMap();

    // Render "All Feeds" button at the top
    this.renderAllFeedsButton(feedFoldersSection);

    if (this.settings.feeds.length === 0) {
      feedFoldersSection.createDiv({
        cls: "rss-dashboard-empty-state",
        text: "No feeds yet — add one of your own or visit the Discover tab!",
      });
    }

    if (this.settings.folders && this.settings.folders.length > 0) {
      const sortOrder = this.settings.folderSortOrder || {
        by: "name",
        ascending: true,
      };
      const sortedFolders = this.applySortOrder(
        [...this.settings.folders],
        sortOrder,
      );

      sortedFolders.forEach((folderObj: Folder) =>
        this.renderFolder(
          folderObj,
          "",
          0,
          feedFoldersSection,
          folderUnreadCountMap,
        ),
      );
    }

    const allFolderPaths = new Set(this.getCachedFolderPaths());
    const rootFeeds = this.settings.feeds.filter(
      (feed) => !feed.folder || !allFolderPaths.has(feed.folder),
    );

    if (rootFeeds.length > 0) {
      // Wrap root feeds in indentation container
      const rootFeedsContainer = feedFoldersSection.createDiv({
        cls: "rss-dashboard-folder-feeds",
      });
      rootFeeds.forEach((feed) => {
        this.renderFeed(feed, rootFeedsContainer);
      });
    }

    // Add drop handler for root area - only when dropping on the actual root section, not on folders
    feedFoldersSection.addEventListener("dragover", (e) => {
      // Only show drag-over if we're not over a folder header
      // Only show drag-over if we're not over a folder header or folder feed area
      const target = e.target as HTMLElement;
      if (
        !target.closest(".rss-dashboard-feed-folder-header") &&
        !target.closest(".rss-dashboard-folder-feeds")
      ) {
        e.preventDefault();
        feedFoldersSection.classList.add("drag-over");
      }
    });

    feedFoldersSection.addEventListener("dragleave", (e) => {
      // Only remove drag-over if we're actually leaving the root section
      // Only remove drag-over if we're actually leaving the root section
      const target = e.target as HTMLElement;
      if (
        !target.closest(".rss-dashboard-feed-folder-header") &&
        !target.closest(".rss-dashboard-folder-feeds")
      ) {
        feedFoldersSection.classList.remove("drag-over");
      }
    });

    feedFoldersSection.addEventListener("drop", (e) => {
      const target = e.target as HTMLElement;

      // Only process drops on the root section, not on folder headers or folder feed areas
      if (
        target.closest(".rss-dashboard-feed-folder-header") ||
        target.closest(".rss-dashboard-folder-feeds")
      ) {
        return; // Let the folder handle this drop
      }

      e.preventDefault();
      feedFoldersSection.classList.remove("drag-over");
      if (e.dataTransfer) {
        const feedUrl = e.dataTransfer.getData("feed-url");
        if (feedUrl) {
          const feed = this.settings.feeds.find((f) => f.url === feedUrl);
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
      const target = e.target as HTMLElement;
      const isItem =
        target.closest(".rss-dashboard-feed") ||
        target.closest(".rss-dashboard-feed-folder-header") ||
        target.closest(".rss-dashboard-all-feeds-button");

      if (!isItem) {
        e.preventDefault();
        const menu = new Menu();
        menu.addItem((item: MenuItem) => {
          item
            .setTitle("Add folder")
            .setIcon("folder-plus")
            .onClick(() => {
              this.showFolderNameModal({
                title: "Add folder",
                existingNames: this.settings.folders.map((f) => f.name),
                onSubmit: (folderName) => {
                  void this.addTopLevelFolder(folderName).then(() =>
                    this.render(),
                  );
                },
              });
            });
        });
        menu.addItem((item: MenuItem) => {
          item
            .setTitle("Add feed")
            .setIcon("rss")
            .onClick(() => {
              this.showAddFeedModal();
            });
        });
        menu.showAtMouseEvent(e);
      }
    });
  }

  private renderAllFeedsButton(container: HTMLElement): void {
    const totalFeeds = this.settings.feeds.length;
    const totalUnread = this.settings.feeds.reduce(
      (sum, feed) => sum + feed.items.filter((item) => !item.read).length,
      0,
    );

    const isAllActive =
      this.options.currentFolder === null &&
      this.options.currentFeed === null &&
      this.options.currentTag === null;

    const allFeedsButton = container.createDiv({
      cls: "rss-dashboard-all-feeds-button" + (isAllActive ? " active" : ""),
    });

    // Feed icon (refresh button) - clickable
    const feedIcon = allFeedsButton.createDiv({
      cls:
        "rss-dashboard-all-feeds-icon" +
        (this.isRefreshing ? " refreshing" : ""),
      attr: {
        title: "Refresh all feeds",
        "aria-label": "Refresh all feeds",
      },
    });
    setIcon(feedIcon, "refresh-cw");
    feedIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.isRefreshing) return;
      void this.handleRefresh();
    });

    // Label with count
    const labelContainer = allFeedsButton.createDiv({
      cls: "rss-dashboard-all-feeds-label-container",
    });

    labelContainer.createDiv({
      cls: "rss-dashboard-all-feeds-label",
      text: `All Feeds (${totalFeeds})`,
    });

    const rightContainer = allFeedsButton.createDiv({
      cls: "rss-dashboard-all-feeds-right",
    });

    // Unread count badge (purple)
    if (this.settings.display.showAllFeedsUnreadBadges && totalUnread > 0) {
      rightContainer.createDiv({
        cls: "rss-dashboard-all-feeds-unread",
        text: totalUnread.toString(),
      });
    }

    // Purple divider line beneath
    container.createDiv({
      cls: "rss-dashboard-all-feeds-divider",
    });

    // Click handler
    allFeedsButton.addEventListener("click", () => {
      this.callbacks.onFolderClick(null);
    });

    // Context menu for mark all as read
    allFeedsButton.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showAllFeedsContextMenu(e);
    });
  }

  private showAllFeedsContextMenu(event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Mark all as read")
        .setIcon("check-circle")
        .onClick(() => {
          void this.markAllUnreadAsRead();
        });
    });

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Refresh all feeds")
        .setIcon("refresh-cw")
        .onClick(() => {
          void this.callbacks.onRefreshFeeds();
        });
    });

    menu.showAtMouseEvent(event);
  }

  private applySortOrder(
    folders: Folder[],
    sortOrder: { by: "name" | "created" | "modified"; ascending: boolean },
  ): Folder[] {
    const sorter = (a: Folder, b: Folder): number => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      let valA: string | number, valB: string | number;

      switch (sortOrder.by) {
        case "name":
          valA = a.name;
          valB = b.name;
          return (
            valA.localeCompare(valB, undefined, { numeric: true }) *
            (sortOrder.ascending ? 1 : -1)
          );
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

  private renderFolder(
    folderObj: Folder,
    parentPath = "",
    depth = 0,
    container: HTMLElement,
    folderUnreadCountMap: Map<string, number>,
  ): void {
    const folderName = folderObj.name;
    const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
    const isCollapsed = (this.settings.collapsedFolders || []).includes(
      fullPath,
    );
    const hasSubfolders = (folderObj.subfolders?.length || 0) > 0;
    const isActive = this.options.currentFolder === fullPath;

    const folderFeeds = this.settings.feeds.filter(
      (feed) => feed.folder === fullPath,
    );
    const isExpandable = hasSubfolders || folderFeeds.length > 0;
    const hasActiveFeed = folderFeeds.some(
      (feed) => feed === this.options.currentFeed,
    );
    const shouldHighlight = isActive || hasActiveFeed;

    const folderEl = container.createDiv({
      cls: "rss-dashboard-feed-folder",
    });

    const folderHeader = folderEl.createDiv({
      cls:
        "rss-dashboard-feed-folder-header" +
        (isCollapsed ? " collapsed" : "") +
        (shouldHighlight ? " active" : ""),
    });

    const toggleButton = folderHeader.createDiv({
      cls: "rss-dashboard-feed-folder-toggle",
    });
    toggleButton.setAttr(
      "aria-label",
      isCollapsed ? "Expand folder" : "Collapse folder",
    );
    setIcon(
      toggleButton as HTMLElement,
      isCollapsed ? "chevron-right" : "chevron-down",
    );

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

    const folderUnreadCount = folderUnreadCountMap.get(fullPath) ?? 0;
    if (this.settings.display.showFolderUnreadBadges && folderUnreadCount > 0) {
      folderHeader.createDiv({
        cls: "rss-dashboard-folder-unread-count",
        text: folderUnreadCount.toString(),
      });
    }

    folderHeader.addEventListener("click", (e) => {
      if (e.button === 0) {
        if (
          e.target === toggleButton ||
          toggleButton.contains(e.target as Node)
        ) {
          if (!isExpandable) {
            this.callbacks.onFolderClick(fullPath);
            return;
          }

          // Local DOM toggle to avoid scroll-bounce
          const isNowCollapsed = !folderHeader.classList.contains("collapsed");
          folderHeader.classList.toggle("collapsed", isNowCollapsed);
          folderFeedsList.classList.toggle("collapsed", isNowCollapsed);

          setIcon(
            toggleButton as HTMLElement,
            isNowCollapsed ? "chevron-right" : "chevron-down",
          );

          toggleButton.setAttr(
            "aria-label",
            isNowCollapsed ? "Expand folder" : "Collapse folder",
          );

          this.callbacks.onToggleFolderCollapse(fullPath, false);
          this.callbacks.onFolderClick(fullPath);
        } else {
          this.callbacks.onFolderClick(fullPath);
        }
      }
    });

    folderHeader.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const menu = new Menu();
      menu.addItem((item: MenuItem) => {
        item
          .setTitle("Add feed")
          .setIcon("rss")
          .onClick(() => {
            this.showAddFeedModal(fullPath);
          });
      });
      menu.addItem((item: MenuItem) => {
        item
          .setTitle("Add subfolder")
          .setIcon("folder-plus")
          .onClick(() => {
            this.showFolderNameModal({
              title: "Add subfolder",
              existingNames:
                this.findFolderByPath(fullPath)?.subfolders.map(
                  (f) => f.name,
                ) ?? [],
              onSubmit: (subfolderName) => {
                void this.addSubfolderByPath(fullPath, subfolderName).then(() =>
                  this.render(),
                );
              },
            });
          });
      });
      menu.addItem((item: MenuItem) => {
        item
          .setTitle("Rename folder")
          .setIcon("edit")
          .onClick(() => {
            this.showFolderNameModal({
              title: "Rename folder",
              defaultValue: folderName,
              existingNames: (() => {
                const parentPath = fullPath.includes("/")
                  ? fullPath.split("/").slice(0, -1).join("/")
                  : "";
                return parentPath
                  ? (this.findFolderByPath(parentPath)?.subfolders.map(
                      (f) => f.name,
                    ) ?? [])
                  : this.settings.folders.map((f) => f.name);
              })(),
              onSubmit: (newName) => {
                if (newName !== folderName) {
                  void this.renameFolderByPath(fullPath, newName).then(() =>
                    this.render(),
                  );
                }
              },
            });
          });
      });
      menu.addItem((item: MenuItem) => {
        item
          .setTitle("Mark all as read")
          .setIcon("check-circle")
          .onClick(() => {
            const allPaths = this.getAllDescendantFolderPaths(fullPath);
            this.settings.feeds.forEach((feed) => {
              if (feed.folder && allPaths.includes(feed.folder)) {
                feed.items.forEach((item) => {
                  item.read = true;
                });
              }
            });
            void this.plugin.saveSettings().then(() => this.render());
          });
      });
      menu.addItem((item: MenuItem) => {
        item
          .setTitle(`Refresh feeds in folder`)
          .setIcon("refresh-cw")
          .onClick(() => {
            void this.plugin.refreshFeedsInFolder(fullPath);
          });
      });
      menu.addItem((item: MenuItem) => {
        item
          .setTitle("Refresh all feeds")
          .setIcon("refresh-cw")
          .onClick(() => {
            void this.plugin.refreshFeeds();
          });
      });
      menu.addItem((item: MenuItem) => {
        const isPinned = folderObj.pinned;
        item
          .setTitle(isPinned ? "Unpin folder" : "Pin folder")
          .setIcon(isPinned ? "unlock" : "lock")
          .onClick(() => {
            folderObj.pinned = !isPinned;
            folderObj.modifiedAt = Date.now();
            void this.plugin.saveSettings().then(() => this.render());
          });
      });
      menu.addItem((item: MenuItem) => {
        item
          .setTitle("Delete folder")
          .setIcon("trash")
          .onClick(() => {
            this.showConfirmModal(
              `Are you sure you want to delete the folder '${folderName}' and all its subfolders and feeds?`,
              () => {
                const allPaths = this.getAllDescendantFolderPaths(fullPath);
                this.settings.feeds = this.settings.feeds.filter(
                  (feed) => !allPaths.includes(feed.folder),
                );
                this.removeFolderByPath(fullPath);
                this.render();
              },
            );
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
          const feed = this.settings.feeds.find((f) => f.url === feedUrl);
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

    // Create the container for both subfolders and feeds
    const folderFeedsList = folderEl.createDiv({
      cls: "rss-dashboard-folder-feeds" + (isCollapsed ? " collapsed" : ""),
    });

    // Add drag and drop support for the folder's feed list
    folderFeedsList.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      folderFeedsList.classList.add("drag-over");
    });

    folderFeedsList.addEventListener("dragleave", (e) => {
      e.stopPropagation();
      folderFeedsList.classList.remove("drag-over");
    });

    folderFeedsList.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      folderFeedsList.classList.remove("drag-over");
      if (e.dataTransfer) {
        const feedUrl = e.dataTransfer.getData("feed-url");
        if (feedUrl) {
          const feed = this.settings.feeds.find((f) => f.url === feedUrl);
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

    // First, render subfolders inside folderFeedsList
    if (folderObj.subfolders && folderObj.subfolders.length > 0) {
      const sortOrder = this.settings.folderSortOrder || {
        by: "name",
        ascending: true,
      };
      const sortedSubfolders = this.applySortOrder(
        [...folderObj.subfolders],
        sortOrder,
      );

      sortedSubfolders.forEach((subfolder: Folder) => {
        this.renderFolder(
          subfolder,
          fullPath,
          depth + 1,
          folderFeedsList,
          folderUnreadCountMap,
        );
      });
    }

    const folderSortOrder = this.settings.folderFeedSortOrders?.[fullPath];
    const sortedFeedsInFolder = folderSortOrder
      ? this.applyFeedSortOrder([...folderFeeds], folderSortOrder)
      : folderFeeds;

    sortedFeedsInFolder.forEach((feed) => {
      this.renderFeed(feed, folderFeedsList);
    });
  }

  private buildFolderUnreadCountMap(): Map<string, number> {
    const unreadCountByFolderPath = new Map<string, number>();

    for (const feed of this.settings.feeds) {
      if (!feed.folder) continue;

      const unreadCount = feed.items.reduce(
        (count, item) => count + (item.read ? 0 : 1),
        0,
      );
      if (unreadCount === 0) continue;

      const parts = feed.folder.split("/").filter((part) => part.length > 0);
      let path = "";

      for (const part of parts) {
        path = path ? `${path}/${part}` : part;
        unreadCountByFolderPath.set(
          path,
          (unreadCountByFolderPath.get(path) ?? 0) + unreadCount,
        );
      }
    }

    return unreadCountByFolderPath;
  }

  private renderFeed(feed: Feed, container: HTMLElement): void {
    const feedEl = container.createDiv({
      cls:
        "rss-dashboard-feed" +
        (feed === this.options.currentFeed ? " active" : ""),
      attr: {
        draggable: "true",
        "data-feed-url": feed.url,
      },
    });

    const unreadCount = feed.items.filter((item) => !item.read).length;
    const feedNameContainer = feedEl.createDiv({
      cls: "rss-dashboard-feed-name-container",
    });

    const feedIcon = feedNameContainer.createDiv({
      cls: "rss-dashboard-feed-icon",
    });

    const isProcessing =
      feed.items.length === 0 &&
      this.plugin?.backgroundImportQueue?.some(
        (queuedFeed: FeedMetadata) =>
          queuedFeed.url === feed.url &&
          queuedFeed.importStatus === "processing",
      );

    if (isProcessing) {
      // Show loading spinner for processing feeds
      setIcon(feedIcon, "loader-2");
      feedIcon.addClass("processing");
      feedEl.classList.add("processing-feed");
    } else if (feed.mediaType === "video") {
      // Show play icon for video feeds
      feedEl.classList.add("video-feed");
      setIcon(feedIcon, "play");
      feedIcon.addClass("video");
    } else if (feed.mediaType === "podcast") {
      // Show mic icon for podcast feeds
      feedEl.classList.add("podcast-feed");
      setIcon(feedIcon, "mic");
      feedIcon.addClass("podcast");
    } else if (this.settings.display.useDomainFavicons) {
      // Show domain favicon for regular feeds when setting is enabled
      const domain = this.extractDomain(feed.url);
      if (domain) {
        const faviconUrl = this.getFaviconUrl(domain);
        feedIcon.empty();
        const imgEl = feedIcon.createEl("img", {
          attr: {
            src: faviconUrl,
            alt: domain,
          },
          cls: "rss-dashboard-feed-favicon",
        });

        // Fallback to RSS icon if favicon fails to load
        imgEl.onerror = () => {
          feedIcon.empty();
          if (this.settings.display.hideDefaultRssIcon) {
            feedIcon.addClass("rss-icon-hidden");
          } else {
            setIcon(feedIcon, "rss");
          }
        };
      } else if (!this.settings.display.hideDefaultRssIcon) {
        // No domain available, use generic RSS icon
        setIcon(feedIcon, "rss");
      } else {
        feedIcon.addClass("rss-icon-hidden");
      }
    } else if (!this.settings.display.hideDefaultRssIcon) {
      // Show generic RSS icon when favicon setting is disabled
      setIcon(feedIcon, "rss");
    } else {
      feedIcon.addClass("rss-icon-hidden");
    }

    feedNameContainer.createDiv({
      cls: "rss-dashboard-feed-name",
      text: feed.title,
    });

    if (this.settings.display.showFeedUnreadBadges && unreadCount > 0) {
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
      processingIndicator.setAttribute(
        "title",
        "Articles being fetched in background",
      );
    }

    feedEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks.onFeedClick(feed);
    });

    feedEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showFeedContextMenu(e, feed);
    });

    this.attachLongPressContextMenu(feedEl, feed);

    feedEl.addEventListener("dragstart", (e) => {
      if (e.dataTransfer) {
        e.dataTransfer.setData("feed-url", feed.url);
        e.dataTransfer.effectAllowed = "move";
      }
    });
  }

  private attachLongPressContextMenu(feedEl: HTMLElement, feed: Feed): void {
    let longPressTriggered = false;

    const clearTimer = () => {
      if (this.longPressTimer !== null) {
        window.clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    };

    feedEl.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;

      longPressTriggered = false;
      clearTimer();
      this.longPressTimer = window.setTimeout(() => {
        longPressTriggered = true;
        const syntheticEvent = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: event.clientX,
          clientY: event.clientY,
        });
        this.showFeedContextMenu(syntheticEvent, feed);
      }, 500);
    });

    feedEl.addEventListener("pointerup", clearTimer);
    feedEl.addEventListener("pointercancel", clearTimer);
    feedEl.addEventListener("pointermove", clearTimer);

    feedEl.addEventListener("click", (event) => {
      if (longPressTriggered) {
        event.preventDefault();
        event.stopPropagation();
        longPressTriggered = false;
      }
    });
  }

  private findFolderByPath(path: string): Folder | null {
    const parts = path.split("/");
    let current: Folder | undefined = this.settings.folders.find(
      (f) => f.name === parts[0],
    );
    for (let i = 1; i < parts.length && current; i++) {
      current = current.subfolders.find((f) => f.name === parts[i]);
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
          } else if (feed.folder.startsWith(oldPath + "/")) {
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
    if (parent && !parent.subfolders.some((f) => f.name === subfolderName)) {
      parent.subfolders.push({
        name: subfolderName,
        subfolders: [],
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      });
      parent.modifiedAt = Date.now();

      this.settings.folders = [...this.settings.folders];
      await this.plugin.saveSettings();

      if (
        this.options.currentFolder &&
        !this.findFolderByPath(this.options.currentFolder)
      ) {
        this.options.currentFolder = null;
      }
      if (
        this.options.currentFeed &&
        !this.settings.feeds.includes(this.options.currentFeed)
      ) {
        this.options.currentFeed = null;
      }
      this.clearFolderPathCache();
      this.render();
    }
  }

  public async addTopLevelFolder(folderName: string) {
    if (!this.settings.folders.some((f) => f.name === folderName)) {
      this.settings.folders.push({
        name: folderName,
        subfolders: [],
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      });

      this.settings.folders = [...this.settings.folders];
      await this.plugin.saveSettings();

      if (
        this.options.currentFolder &&
        !this.findFolderByPath(this.options.currentFolder)
      ) {
        this.options.currentFolder = null;
      }
      if (
        this.options.currentFeed &&
        !this.settings.feeds.includes(this.options.currentFeed)
      ) {
        this.options.currentFeed = null;
      }
      this.clearFolderPathCache();
      this.render();
    }
  }

  public showFolderNameModal(options: {
    title: string;
    defaultValue?: string;
    existingNames?: string[];
    onSubmit: (name: string) => void;
  }) {
    // Delegate to FolderNameModal (extends Obsidian Modal) for focus stability.
    // See FolderNameModal class comments for context on why Modal is required.
    new FolderNameModal(this.app, options).open();
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
        const subPath = base + "/" + sub.name;
        result.push(subPath);
        collect(sub, subPath);
      }
    }
    if (folder) collect(folder, path);
    return result;
  }

  private showConfirmModal(message: string, onConfirm: () => void): void {
    const confirmModal = new Modal(this.app);
    confirmModal.modalEl.addClass("rss-sidebar-confirm-modal");

    const { contentEl } = confirmModal;
    contentEl.empty();

    new Setting(contentEl).setName("Confirm").setHeading();
    contentEl.createDiv({ cls: "rss-sidebar-confirm-message", text: message });

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons rss-folder-name-modal-buttons",
    });

    const okButton = buttonContainer.createEl("button");
    okButton.addClass("rss-folder-name-modal-ok");
    const okIcon = okButton.createSpan();
    setIcon(okIcon, "check");
    okButton.createSpan({ text: "OK" });
    okButton.onclick = () => {
      confirmModal.close();
      onConfirm();
    };

    const cancelButton = buttonContainer.createEl("button");
    cancelButton.addClass("rss-folder-name-modal-cancel");
    const cancelIcon = cancelButton.createSpan();
    setIcon(cancelIcon, "x");
    cancelButton.createSpan({ text: "Cancel" });
    cancelButton.onclick = () => confirmModal.close();

    confirmModal.open();
    window.setTimeout(() => okButton.focus(), 50);
  }

  public showAddTagModal(): void {
    const modal = document.body.createDiv({
      cls: "rss-dashboard-modal rss-dashboard-modal-container",
    });

    const modalContent = modal.createDiv({
      cls: "rss-dashboard-modal-content",
    });

    new Setting(modalContent).setName("Add new tag").setHeading();

    const formContainer = modalContent.createDiv({
      cls: "rss-dashboard-tag-modal-form",
    });

    const colorInput = formContainer.createEl("input", {
      attr: {
        type: "color",
        value: "#3498db",
      },
      cls: "rss-dashboard-tag-modal-color-picker",
    });

    const nameInput = formContainer.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Enter tag name",
        autocomplete: "off",
      },
      cls: "rss-dashboard-tag-modal-name-input",
    });
    nameInput.spellcheck = false;

    const buttonContainer = modalContent.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    const addButton = buttonContainer.createEl("button", {
      text: "Add tag",
      cls: "rss-dashboard-primary-button",
    });
    addButton.addEventListener("click", () => {
      const tagName = nameInput.value.trim();
      const tagColor = colorInput.value;

      if (tagName) {
        if (
          this.settings.availableTags.some(
            (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
          )
        ) {
          new Notice("A tag with this name already exists!");
          return;
        }

        const newTag: Tag = {
          name: tagName,
          color: tagColor,
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
      item
        .setTitle("Edit tag")
        .setIcon("pencil")
        .onClick(() => {
          this.showEditTagModal(tag);
        });
    });

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Delete tag")
        .setIcon("trash")
        .onClick(() => {
          this.showConfirmModal(
            `Are you sure you want to delete the tag "${tag.name}"? This will remove the tag from all articles.`,
            () => {
              this.deleteTag(tag);
            },
          );
        });
    });

    menu.showAtMouseEvent(event);
  }

  private showEditTagModal(tag: Tag): void {
    const modal = document.body.createDiv({
      cls: "rss-dashboard-modal rss-dashboard-modal-container",
    });

    const modalContent = modal.createDiv({
      cls: "rss-dashboard-modal-content",
    });

    new Setting(modalContent).setName("Edit tag").setHeading();

    const formContainer = modalContent.createDiv({
      cls: "rss-dashboard-tag-modal-form",
    });

    const colorInput = formContainer.createEl("input", {
      attr: {
        type: "color",
        value: tag.color,
      },
      cls: "rss-dashboard-tag-modal-color-picker",
    });

    const nameInput = formContainer.createEl("input", {
      attr: {
        type: "text",
        value: tag.name,
        placeholder: "Enter tag name",
        autocomplete: "off",
      },
      cls: "rss-dashboard-tag-modal-name-input",
    });
    nameInput.spellcheck = false;

    const buttonContainer = modalContent.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    const saveButton = buttonContainer.createEl("button", {
      text: "Save changes",
      cls: "rss-dashboard-primary-button",
    });
    saveButton.addEventListener("click", () => {
      const newTagName = nameInput.value.trim();
      const newTagColor = colorInput.value;

      if (newTagName) {
        if (
          this.settings.availableTags.some(
            (t) =>
              t.name.toLowerCase() === newTagName.toLowerCase() && t !== tag,
          )
        ) {
          new Notice("A tag with this name already exists!");
          return;
        }

        tag.name = newTagName;
        tag.color = newTagColor;

        this.settings.feeds.forEach((feed) => {
          feed.items.forEach((item) => {
            if (item.tags) {
              const itemTag = item.tags.find((t) => t.name === tag.name);
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
    const tagIndex = this.settings.availableTags.findIndex(
      (t) => t.name === tag.name,
    );
    if (tagIndex !== -1) {
      this.settings.availableTags.splice(tagIndex, 1);
    }

    this.settings.feeds.forEach((feed) => {
      feed.items.forEach((item) => {
        if (item.tags) {
          item.tags = item.tags.filter((t) => t.name !== tag.name);
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
      item
        .setTitle("Mark all unread as read")
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
      item
        .setTitle("Mark all read as unread")
        .setIcon("circle")
        .onClick(() => {
          void this.markAllReadAsUnread();
        });
    });

    menu.showAtMouseEvent(event);
  }

  private async markAllUnreadAsRead(): Promise<void> {
    let count = 0;
    this.settings.feeds.forEach((feed) => {
      feed.items.forEach((item) => {
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
    this.settings.feeds.forEach((feed) => {
      feed.items.forEach((item) => {
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
      if (this.callbacks.onActivateDashboard) {
        this.callbacks.onActivateDashboard();
      } else {
        void this.plugin.activateView();
      }
    });

    const discoverBtn = navContainer.createDiv({
      cls: "rss-dashboard-nav-button",
    });

    discoverBtn.appendText(" Discover");
    discoverBtn.addEventListener("click", () => {
      if (this.callbacks.onActivateDiscover) {
        this.callbacks.onActivateDiscover();
      } else {
        void this.plugin.activateDiscoverView();
      }
    });

    // Add Toolbar right behind the nav tabs
    const headerToolbar = header.createDiv({
      cls: "rss-dashboard-header-toolbar",
    });

    const addBtnContainer = headerToolbar.createDiv({
      cls: "rss-dashboard-header-manage-container",
    });

    const addBtn = addBtnContainer.createDiv({
      cls: "rss-dashboard-header-icon-button",
      attr: {
        title: "Add feed",
        "aria-label": "Add feed",
      },
    });
    setIcon(addBtn, "plus");
    addBtn.addEventListener("click", () => {
      this.showAddFeedModal();
      if (!this.app.loadLocalStorage("rss-first-launch-coachmark-shown")) {
        this.app.saveLocalStorage("rss-first-launch-coachmark-shown", "true");
        const coachmark = addBtnContainer.querySelector(
          ".rss-dashboard-coachmark",
        );
        if (coachmark) coachmark.remove();
      }
    });

    const manageBtn = headerToolbar.createDiv({
      cls: "rss-dashboard-header-icon-button",
      attr: {
        title: "Manage feeds",
        "aria-label": "Manage feeds",
      },
    });
    setIcon(manageBtn, "edit");
    manageBtn.addEventListener("click", () => {
      if (this.callbacks.onManageFeeds) {
        this.callbacks.onManageFeeds();
      }
    });

    if (!this.app.loadLocalStorage("rss-first-launch-coachmark-shown")) {
      const coachmark = addBtnContainer.createDiv({
        cls: "rss-dashboard-coachmark",
        text: "Add your first feed here",
      });
      window.setTimeout(() => {
        if (!this.app.loadLocalStorage("rss-first-launch-coachmark-shown")) {
          this.app.saveLocalStorage("rss-first-launch-coachmark-shown", "true");
          if (coachmark.parentNode) coachmark.remove();
        }
      }, 5000);
    }

    //   const collapseBtn = headerToolbar.createDiv({
    //     cls: "rss-dashboard-header-icon-button rss-dashboard-mobile-only",
    //     attr: {
    //       title: "Collapse sidebar",
    //       "aria-label": "Collapse sidebar",
    //     },
    //   });
    //   setIcon(collapseBtn, "panel-left-close");
    //   collapseBtn.addEventListener("click", () => {
    //     if (this.callbacks.onCloseMobileSidebar) {
    //       this.callbacks.onCloseMobileSidebar();
    //     } else if (this.callbacks.onToggleSidebar) {
    //       this.callbacks.onToggleSidebar();
    //     }
    //   });
  }

  public renderFilters(parentEl: HTMLElement): void {
    // Deprecated: the filter actions are now in the header toolbar
  }

  private renderSearchDock(parentEl: HTMLElement): void {
    if (!this.isSearchExpanded) return;

    const searchDock = parentEl.createDiv({
      cls: "rss-dashboard-search-dock",
    });
    const searchContainer = searchDock.createDiv({
      cls: "rss-dashboard-search-container",
    });
    const searchInput = searchContainer.createEl("input", {
      cls: "rss-dashboard-search-input",
      attr: {
        type: "text",
        placeholder: "Search feeds...",
        autocomplete: "off",
        spellcheck: "false",
      },
    });
    const clearButton = searchContainer.createEl("button", {
      cls: "rss-dashboard-search-clear is-hidden",
      attr: {
        type: "button",
        "aria-label": "Clear search",
        title: "Clear search",
      },
    });
    setIcon(clearButton, "x");

    const updateClearButtonVisibility = () => {
      if (searchInput.value.trim()) {
        clearButton.removeClass("is-hidden");
      } else {
        clearButton.addClass("is-hidden");
      }
    };

    searchInput.addEventListener("focus", () => {
      searchInput.select();

      // On mobile, ensure the input is visible above the keyboard
      if (window.innerWidth <= 768) {
        window.setTimeout(() => {
          searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    });

    let searchTimeout: number;
    searchInput.addEventListener("input", (e) => {
      const query = ((e.target as HTMLInputElement)?.value || "")
        .toLowerCase()
        .trim();
      updateClearButtonVisibility();
      if (searchTimeout) {
        window.clearTimeout(searchTimeout);
      }
      searchTimeout = window.setTimeout(() => {
        this.filterFeedsAndFolders(query);
      }, 150);
    });

    clearButton.addEventListener("click", (e) => {
      e.preventDefault();
      searchInput.value = "";
      updateClearButtonVisibility();
      if (searchTimeout) {
        window.clearTimeout(searchTimeout);
      }
      this.filterFeedsAndFolders("");
      searchInput.focus();
    });

    requestAnimationFrame(() => {
      searchInput.focus();
      if (window.innerWidth <= 768) {
        window.setTimeout(() => {
          searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    });
  }

  public renderToolbar(parentEl: HTMLElement): void {
    const sidebarToolbar = parentEl.createDiv({
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
        existingNames: this.settings.folders.map((f) => f.name),
        onSubmit: (folderName) => {
          void this.addTopLevelFolder(folderName).then(() => this.render());
        },
      });
    });

    const sortButton = sidebarToolbar.createDiv({
      cls: "rss-dashboard-toolbar-button",
      attr: {
        title: "Sort folders",
      },
    });
    setIcon(sortButton, "sort-asc");
    sortButton.addEventListener("click", (e) => {
      const menu = new Menu();

      menu.addItem((item) =>
        item.setTitle("Folder name (a to z)").onClick(() => {
          void this.sortFolders("name", true);
        }),
      );
      menu.addItem((item) =>
        item.setTitle("Folder name (z to a)").onClick(() => {
          void this.sortFolders("name", false);
        }),
      );
      menu.addItem((item) =>
        item.setTitle("Modified time (new to old)").onClick(() => {
          void this.sortFolders("modified", false);
        }),
      );
      menu.addItem((item) =>
        item.setTitle("Modified time (old to new)").onClick(() => {
          void this.sortFolders("modified", true);
        }),
      );
      menu.addItem((item) =>
        item.setTitle("Created time (new to old)").onClick(() => {
          void this.sortFolders("created", false);
        }),
      );
      menu.addItem((item) =>
        item.setTitle("Created time (old to new)").onClick(() => {
          void this.sortFolders("created", true);
        }),
      );

      menu.showAtMouseEvent(e);
    });

    const collapseAllButton = sidebarToolbar.createDiv({
      cls: "rss-dashboard-toolbar-button",
      attr: {
        title: "Collapse/Expand all Folders",
      },
    });

    let cachedFolderPaths: string[] | null = null;

    const updateCollapseIcon = () => {
      if (!cachedFolderPaths) {
        cachedFolderPaths = this.getCachedFolderPaths();
      }

      const collapsedFolders = this.settings.collapsedFolders || [];
      const allCollapsed =
        cachedFolderPaths.length > 0 &&
        cachedFolderPaths.every((path) => collapsedFolders.includes(path));
      setIcon(
        collapseAllButton,
        allCollapsed ? "chevrons-down-up" : "chevrons-up-down",
      );
    };

    updateCollapseIcon();

    collapseAllButton.addEventListener("click", () => {
      cachedFolderPaths = null;
      this.toggleAllFolders();

      window.setTimeout(() => updateCollapseIcon(), 0);
    });

    const searchButton = sidebarToolbar.createDiv({
      cls: "rss-dashboard-toolbar-button",
      attr: {
        title: "Search feeds",
        "aria-label": "Search feeds",
        role: "button",
        tabindex: "0",
      },
    });
    searchButton.toggleClass("is-active", this.isSearchExpanded);
    searchButton.setAttr(
      "aria-pressed",
      this.isSearchExpanded ? "true" : "false",
    );
    setIcon(searchButton, "search");
    const toggleSearch = () => {
      this.isSearchExpanded = !this.isSearchExpanded;
      this.render();

      if (this.isSearchExpanded) {
        requestAnimationFrame(() => {
          const searchInput = this.container.querySelector<HTMLInputElement>(
            ".rss-dashboard-search-input",
          );
          if (!searchInput) return;
          searchInput.focus();
          searchInput.select();
          searchInput.scrollIntoView({ block: "nearest" });
        });
      }
    };
    searchButton.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSearch();
    });
    searchButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSearch();
      }
    });
  }

  private showAddFeedModal(defaultFolder = "Uncategorized"): void {
    new AddFeedModal(
      this.app,
      this.settings.folders,
      async (
        title,
        url,
        folder,
        autoDeleteDuration,
        maxItemsLimit,
        scanInterval,
        feedFilters,
      ) =>
        await this.callbacks.onAddFeed(
          title,
          url,
          folder,
          autoDeleteDuration,
          maxItemsLimit,
          scanInterval,
          feedFilters,
        ),
      () => this.render(),
      defaultFolder,
      this.plugin,
    ).open();
  }

  public showEditFeedModal(feed: Feed): void {
    new EditFeedModal(this.app, this.plugin, feed, () => this.render()).open();
  }

  private showFeedContextMenu(event: MouseEvent, feed: Feed): void {
    const menu = new Menu();

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Update feed")
        .setIcon("refresh-cw")
        .onClick(() => {
          void this.callbacks.onUpdateFeed(feed);
        });
    });

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Edit feed")
        .setIcon("edit")
        .onClick(() => {
          this.showEditFeedModal(feed);
        });
    });

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Mark all as read")
        .setIcon("check-circle")
        .onClick(() => {
          feed.items.forEach((item) => {
            item.read = true;
          });
          void this.plugin.saveSettings().then(() => this.render());
        });
    });

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Change media type")
        .setIcon("circle-gauge")
        .onClick((evt) => {
          const typeMenu = new Menu();
          typeMenu.addItem((subItem: MenuItem) => {
            subItem
              .setTitle("Article")
              .setIcon("file-text")
              .onClick(() => {
                feed.mediaType = "article";
                void this.plugin.saveSettings().then(() => this.render());
              });
          });
          typeMenu.addItem((subItem: MenuItem) => {
            subItem
              .setTitle("Podcast")
              .setIcon("headphones")
              .onClick(() => {
                feed.mediaType = "podcast";
                void this.plugin.saveSettings().then(() => this.render());
              });
          });
          typeMenu.addItem((subItem: MenuItem) => {
            subItem
              .setTitle("Video")
              .setIcon("play-circle")
              .onClick(() => {
                feed.mediaType = "video";
                void this.plugin.saveSettings().then(() => this.render());
              });
          });
          if (evt instanceof MouseEvent) {
            typeMenu.showAtMouseEvent(evt);
          }
        });
    });

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Move to folder")
        .setIcon("folder-open")
        .onClick((evt) => {
          if (evt instanceof MouseEvent) {
            this.showMoveToFolderMenu(evt, feed);
          }
        });
    });

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Delete feed")
        .setIcon("trash")
        .onClick(() => {
          this.showConfirmModal(
            `Are you sure you want to delete the feed "${feed.title}"?`,
            () => {
              this.callbacks.onDeleteFeed(feed);
            },
          );
        });
    });

    menu.showAtMouseEvent(event);
  }

  private showMoveToFolderMenu(event: MouseEvent, feed: Feed): void {
    const menu = new Menu();

    // Add option to move to root (no folder)
    menu.addItem((item: MenuItem) => {
      const isInRoot = !feed.folder;
      item
        .setTitle("Root (no folder)")
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

      allFolders.forEach((folderPath) => {
        const isCurrentFolder = feed.folder === folderPath;
        menu.addItem((item: MenuItem) => {
          item
            .setTitle(folderPath)
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
      item
        .setTitle("Create new folder...")
        .setIcon("folder-plus")
        .onClick(() => {
          this.showFolderNameModal({
            title: "Create new folder",
            existingNames: this.settings.folders.map((f) => f.name),
            onSubmit: (folderName) => {
              void (async () => {
                await this.addTopLevelFolder(folderName);
                // Move the feed to the newly created folder
                feed.folder = folderName;
                const newFolder = this.findFolderByPath(folderName);
                if (newFolder) newFolder.modifiedAt = Date.now();
                await this.plugin.saveSettings();
                this.render();
                new Notice(
                  `Created folder "${folderName}" and moved "${feed.title}" to it`,
                );
              })();
            },
          });
        });
    });

    menu.showAtMouseEvent(event);
  }

  private _sortFolders(
    by: "name" | "created" | "modified",
    ascending: boolean,
  ) {
    const sorter = (a: Folder, b: Folder): number => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      let valA: string | number, valB: string | number;

      switch (by) {
        case "name":
          valA = a.name;
          valB = b.name;
          return (
            valA.localeCompare(valB, undefined, { numeric: true }) *
            (ascending ? 1 : -1)
          );
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

  private async sortFolders(
    by: "name" | "created" | "modified",
    ascending: boolean,
  ) {
    this._sortFolders(by, ascending);

    this.settings.folderSortOrder = { by, ascending };
    await this.plugin.saveSettings();
    this.render();
  }

  private showFeedSortMenu(event: MouseEvent, folderPath: string): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle("Feed name (a to z)").onClick(() => {
        void this.sortFeedsInFolder(folderPath, "name", true);
      }),
    );
    menu.addItem((item) =>
      item.setTitle("Feed name (z to a)").onClick(() => {
        void this.sortFeedsInFolder(folderPath, "name", false);
      }),
    );
    menu.addItem((item) =>
      item.setTitle("Created time (new to old)").onClick(() => {
        void this.sortFeedsInFolder(folderPath, "created", false);
      }),
    );
    menu.addItem((item) =>
      item.setTitle("Created time (old to new)").onClick(() => {
        void this.sortFeedsInFolder(folderPath, "created", true);
      }),
    );
    menu.addItem((item) =>
      item.setTitle("Number of items (high to low)").onClick(() => {
        void this.sortFeedsInFolder(folderPath, "itemCount", false);
      }),
    );
    menu.addItem((item) =>
      item.setTitle("Number of items (low to high)").onClick(() => {
        void this.sortFeedsInFolder(folderPath, "itemCount", true);
      }),
    );

    menu.showAtMouseEvent(event);
  }

  private async sortFeedsInFolder(
    folderPath: string,
    by: "name" | "created" | "itemCount",
    ascending: boolean,
  ) {
    let feedsInFolder: Feed[];

    if (folderPath) {
      feedsInFolder = this.settings.feeds.filter(
        (feed) => feed.folder === folderPath,
      );
    } else {
      const allFolderPaths = new Set(this.getCachedFolderPaths());
      feedsInFolder = this.settings.feeds.filter(
        (feed) => !feed.folder || !allFolderPaths.has(feed.folder),
      );
    }

    if (feedsInFolder.length === 0) {
      new Notice("No feeds found in this folder");
      return;
    }

    const sortedFeeds = this.applyFeedSortOrder([...feedsInFolder], {
      by,
      ascending,
    });

    if (folderPath) {
      this.settings.feeds = this.settings.feeds.filter(
        (feed) => feed.folder !== folderPath,
      );
    } else {
      const allFolderPaths = new Set(this.getCachedFolderPaths());
      this.settings.feeds = this.settings.feeds.filter(
        (feed) => feed.folder && allFolderPaths.has(feed.folder),
      );
    }

    this.settings.feeds.push(...sortedFeeds);

    if (!this.settings.folderFeedSortOrders) {
      this.settings.folderFeedSortOrders = {};
    }
    this.settings.folderFeedSortOrders[folderPath] = { by, ascending };

    await this.plugin.saveSettings();

    new Notice(
      `Feeds in "${folderPath || "root"}" sorted by ${by} (${ascending ? "ascending" : "descending"})`,
    );
    this.render();
  }

  private applyFeedSortOrder(
    feeds: Feed[],
    sortOrder: { by: "name" | "created" | "itemCount"; ascending: boolean },
  ): Feed[] {
    const sorter = (a: Feed, b: Feed): number => {
      let valA: string | number, valB: string | number;

      switch (sortOrder.by) {
        case "name":
          valA = a.title;
          valB = b.title;
          return (
            valA.localeCompare(valB, undefined, { numeric: true }) *
            (sortOrder.ascending ? 1 : -1)
          );
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

    // Use settings.collapsedFolders directly to ensure we have the latest state
    // especially in modal views where options might have stale references
    const collapsedFolders = this.settings.collapsedFolders || [];
    const collapsedSet = new Set(collapsedFolders);
    const allCollapsed = allFolderPaths.every((path) => collapsedSet.has(path));

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

    // Trigger immediate re-render for UI update
    this.render();
  }

  private async handleRefresh(): Promise<void> {
    if (this.isRefreshing) return;

    this.isRefreshing = true;
    this.render();

    try {
      await this.plugin.refreshFeeds();
    } finally {
      this.isRefreshing = false;
      this.render();
    }
  }

  /**
   * Filter feeds and folders in the sidebar based on search query
   * Searches feed titles and folder names
   */
  private filterFeedsAndFolders(query: string): void {
    // Get all feed elements
    const feedElements = this.container.querySelectorAll(".rss-dashboard-feed");

    // Get all folder header elements (for folder names)
    const folderHeaderElements = this.container.querySelectorAll(
      ".rss-dashboard-feed-folder-header",
    );

    // Get the "All Feeds" button element
    const allFeedsButton = this.container.querySelector(
      ".rss-dashboard-all-feeds-button",
    );

    // Filter feeds
    feedElements.forEach((el) => {
      const feedNameEl = el.querySelector(".rss-dashboard-feed-name");
      const feedName = feedNameEl?.textContent?.toLowerCase() || "";

      if (query && !feedName.includes(query)) {
        (el as HTMLElement).addClass("rss-dashboard-search-hidden");
      } else {
        (el as HTMLElement).removeClass("rss-dashboard-search-hidden");
      }
    });

    // Filter folders - hide/show folder headers based on whether they have visible feeds
    folderHeaderElements.forEach((el) => {
      const folderNameEl = el.querySelector(".rss-dashboard-feed-folder-name");
      const folderName = folderNameEl?.textContent?.toLowerCase() || "";

      if (query && !folderName.includes(query)) {
        // Check if this folder has any visible feeds
        const folderEl = el.closest(".rss-dashboard-feed-folder");
        const visibleFeeds = folderEl?.querySelectorAll(
          ".rss-dashboard-feed:not(.rss-dashboard-search-hidden)",
        );

        if (!visibleFeeds || visibleFeeds.length === 0) {
          (el as HTMLElement).addClass("rss-dashboard-search-hidden");
        } else {
          (el as HTMLElement).removeClass("rss-dashboard-search-hidden");
        }
      } else {
        (el as HTMLElement).removeClass("rss-dashboard-search-hidden");
      }
    });

    // Handle "All Feeds" button visibility
    if (allFeedsButton) {
      // Show All Feeds button if query is empty, or always show it
      // since it serves as a "clear filter" option
      if (query) {
        // Check if there are any visible feeds
        const visibleFeeds = this.container.querySelectorAll(
          ".rss-dashboard-feed:not(.rss-dashboard-search-hidden)",
        );
        if (visibleFeeds.length === 0) {
          (allFeedsButton as HTMLElement).addClass(
            "rss-dashboard-search-hidden",
          );
        } else {
          (allFeedsButton as HTMLElement).removeClass(
            "rss-dashboard-search-hidden",
          );
        }
      } else {
        (allFeedsButton as HTMLElement).removeClass(
          "rss-dashboard-search-hidden",
        );
      }
    }
  }

  /**
   * Clear the search and show all feeds/folders
   */
  public clearFeedSearch(): void {
    this.isSearchExpanded = false;
    this.render();
  }
}
