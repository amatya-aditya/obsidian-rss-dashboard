import {
  Menu,
  MenuItem,
  Notice,
  App,
  Modal,
  setIcon,
  Setting,
  requestUrl,
} from "obsidian";
import {
  Feed,
  Folder,
  Tag,
  RssDashboardSettings,
  FeedFilterSettings,
} from "../types/types";
import {
  SIDEBAR_ICON_IDS,
  getIconById,
  createToolbarButton,
} from "../utils/sidebar-icon-registry";
import { AddFeedModal, EditFeedModal } from "../modals/feed-manager-modal";
import { showEditTagModal } from "../utils/tag-utils";
import { attachInputClearButton } from "../utils/platform-utils";
import { SidebarSearchService } from "../services/sidebar-search-service";
import { isValidFolderName } from "../utils/validation";
import type RssDashboardPlugin from "../../main";

export interface SidebarOptions {
  currentFolder: string | null;
  currentFeed: Feed | null;
  selectedTags: string[];
  tagsCollapsed: boolean;
  collapsedFolders: string[];
}

export interface SidebarCallbacks {
  onFolderClick: (folder: string | null) => void;
  onFeedClick: (feed: Feed) => void;
  onTagToggle: (tag: string) => void;
  onClearTags: () => void;
  onTagFilterModeChange: (mode: "and" | "or" | "not") => void;
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
    customTemplate?: string,
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
      const validation = isValidFolderName(name);
      if (!validation.valid) {
        showError(validation.error || "Please enter a folder name.");
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
  private searchQuery = "";
  private isTagsExpanded = false;
  private isAddTagExpanded = false;
  private isRefreshing = false;
  private longPressTimer: number | null = null;
  private pendingImportFeedUrls = new Set<string>();
  private processingImportFeedUrls = new Set<string>();
  private faviconAvailabilityCache = new Map<string, boolean>();
  private faviconCheckPromises = new Map<string, Promise<boolean>>();
  private iconBtnEls = new Map<string, HTMLElement>();
  private iconActions = new Map<string, (e?: MouseEvent) => void>();
  private resizeObserver: ResizeObserver | null = null;

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
   * Get favicon URL for a domain using Google's S2 favicon service
   */
  private getFaviconUrl(domain: string): string {
    if (!domain) return "";
    return `https://www.google.com/s2/favicons?sz=32&domain_url=http://${domain}`;
  }

  private async isFaviconUrlAvailable(faviconUrl: string): Promise<boolean> {
    const cached = this.faviconAvailabilityCache.get(faviconUrl);
    if (cached !== undefined) {
      return cached;
    }

    const inFlight = this.faviconCheckPromises.get(faviconUrl);
    if (inFlight) {
      return inFlight;
    }

    const checkPromise = (async () => {
      let available = false;
      try {
        const headResponse = await requestUrl({
          url: faviconUrl,
          method: "HEAD",
        });
        available = headResponse.status >= 200 && headResponse.status < 300;

        if (
          !available &&
          (headResponse.status === 405 || headResponse.status === 501)
        ) {
          const getResponse = await requestUrl({
            url: faviconUrl,
            method: "GET",
          });
          available = getResponse.status >= 200 && getResponse.status < 300;
        }
      } catch {
        try {
          const getResponse = await requestUrl({
            url: faviconUrl,
            method: "GET",
          });
          available = getResponse.status >= 200 && getResponse.status < 300;
        } catch {
          available = false;
        }
      } finally {
        this.faviconCheckPromises.delete(faviconUrl);
      }

      this.faviconAvailabilityCache.set(faviconUrl, available);
      return available;
    })();

    this.faviconCheckPromises.set(faviconUrl, checkPromise);
    return checkPromise;
  }

  private renderFallbackFeedIcon(feedIcon: HTMLElement): void {
    feedIcon.empty();
    if (this.settings.display.hideDefaultRssIcon) {
      feedIcon.addClass("rss-icon-hidden");
      return;
    }

    feedIcon.removeClass("rss-icon-hidden");
    setIcon(feedIcon, "rss");
  }

  private async renderDomainFavicon(
    feedIcon: HTMLElement,
    domain: string,
  ): Promise<void> {
    const faviconUrl = this.getFaviconUrl(domain);
    if (!faviconUrl) {
      this.renderFallbackFeedIcon(feedIcon);
      return;
    }

    const available = await this.isFaviconUrlAvailable(faviconUrl);
    if (!available || !feedIcon.isConnected) {
      this.renderFallbackFeedIcon(feedIcon);
      return;
    }

    feedIcon.empty();
    feedIcon.removeClass("rss-icon-hidden");
    const imgEl = feedIcon.createEl("img", {
      attr: {
        src: faviconUrl,
        alt: domain,
      },
      cls: "rss-dashboard-feed-favicon",
    });

    imgEl.onerror = () => {
      this.faviconAvailabilityCache.set(faviconUrl, false);
      this.renderFallbackFeedIcon(feedIcon);
    };
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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
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
    const itemPaddingLeft = this.settings.display.sidebarItemPaddingLeft ?? 2;
    this.container.style.setProperty(
      "--sidebar-item-padding-left",
      `${itemPaddingLeft}px`,
    );
    const itemPaddingRight = this.settings.display.sidebarItemPaddingRight ?? 2;
    this.container.style.setProperty(
      "--sidebar-item-padding-right",
      `${itemPaddingRight}px`,
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
    this.refreshImportStatusLookups();

    const controlsSurface = this.container.createDiv({
      cls: "rss-dashboard-sidebar-controls-surface",
    });

    this.renderHeader(controlsSurface);
    // Legacy toggle-row flow (disabled):
    // this.renderToolbarToggle(controlsSurface);
    // if (!this.isSidebarToolbarCollapsed) {
    //   this.renderSearchDock(controlsSurface);
    // }
    this.renderSearchDock(controlsSurface);
    this.renderFeedFolders();
    this.applySearchFilterFromState();

    // Attach ResizeObserver once; keep it across re-renders
    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateIconRowFades();
      });
      this.resizeObserver.observe(this.container);
    }
    // Update scroll fade indicators after layout settles
    requestAnimationFrame(() => {
      this.updateIconRowFades();
    });

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

  private refreshImportStatusLookups(): void {
    this.pendingImportFeedUrls.clear();
    this.processingImportFeedUrls.clear();

    const queue = this.plugin.backgroundImportQueue;
    if (!queue || queue.length === 0) {
      return;
    }

    for (const queuedFeed of queue) {
      this.pendingImportFeedUrls.add(queuedFeed.url);
      if (queuedFeed.importStatus === "processing") {
        this.processingImportFeedUrls.add(queuedFeed.url);
      }
    }
  }

  private renderFeedFolders(): void {
    const showSidebarScrollbar =
      this.settings.display.showSidebarScrollbar ?? true;
    const feedFoldersSection = this.container.createDiv({
      cls:
        "rss-dashboard-feed-folders-section" +
        (showSidebarScrollbar
          ? ""
          : " rss-dashboard-feed-folders-section--scrollbar-hidden"),
    });
    const folderUnreadCountMap = this.buildFolderUnreadCountMap();

    // Render "All Feeds" button at the top
    this.renderAllFeedsButton(feedFoldersSection);
    this.renderTagsSection(feedFoldersSection);

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

      const filteredRootFeeds = this.settings.display.hideEmptyFeeds
        ? rootFeeds.filter(
            (feed) =>
              feed.items.length > 0 && feed.items.some((item) => !item.read),
          )
        : rootFeeds;

      filteredRootFeeds.forEach((feed) => {
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

  private renderTagsSection(container: HTMLElement): void {
    if (!this.isTagsExpanded) return;

    const tagsSection = container.createDiv({
      cls: "rss-dashboard-sidebar-tags-section",
    });

    // Filter Mode Segmented Control
    const modeGroup = tagsSection.createDiv({
      cls: "rss-dashboard-tag-filter-mode-group",
    });

    const modes: ("and" | "or" | "not")[] = ["and", "or", "not"];
    modes.forEach((m) => {
      const active = this.settings.sidebarTagFilterMode === m;
      const btn = modeGroup.createEl("button", {
        cls: "rss-dashboard-tag-filter-mode-btn" + (active ? " is-active" : ""),
        text: m.toUpperCase(),
      });
      btn.addEventListener("click", () => {
        this.callbacks.onTagFilterModeChange(m);
        this.render();
      });
    });

    // Tag list
    const tagsList = tagsSection.createDiv({
      cls: "rss-dashboard-sidebar-tags-list",
    });

    const tagCountMap = new Map<string, number>();
    this.settings.feeds.forEach((feed) => {
      feed.items.forEach((item) => {
        if (item.tags) {
          item.tags.forEach((t) => {
            tagCountMap.set(t.name, (tagCountMap.get(t.name) || 0) + 1);
          });
        }
      });
    });

    this.settings.availableTags.forEach((tag) => {
      const selected = this.options.selectedTags.includes(tag.name);
      const row = tagsList.createDiv({
        cls: "rss-dashboard-sidebar-tag-row" + (selected ? " is-selected" : ""),
      });

      const tagCheckbox = row.createEl("input", {
        attr: { type: "checkbox" },
        cls: "rss-dashboard-tag-checkbox",
      });
      tagCheckbox.checked = selected;

      const dot = row.createDiv({ cls: "rss-dashboard-tag-color-dot" });
      dot.style.backgroundColor = tag.color;

      row.createSpan({ text: tag.name, cls: "rss-dashboard-sidebar-tag-label" });

      const count = tagCountMap.get(tag.name) || 0;
      row.createSpan({
        text: count.toString(),
        cls: "rss-dashboard-sidebar-tag-count",
      });

      row.addEventListener("click", () => {
        this.callbacks.onTagToggle(tag.name);
        this.render();
      });
    });
    // Inline add-tag row
    if (this.isAddTagExpanded) {
      const addRow = tagsSection.createDiv({
        cls: "rss-dashboard-sidebar-add-tag-row",
      });
      const cp = addRow.createEl("input", {
        attr: { type: "color", value: "#3498db" },
        cls: "rss-dashboard-tag-color-picker",
      });
      const input = addRow.createEl("input", {
        attr: { type: "text", placeholder: "New tag..." },
        cls: "rss-dashboard-sidebar-add-tag-input",
      });
      const addBtn = addRow.createEl("button", {
        cls: "rss-dashboard-sidebar-add-tag-btn",
        text: "Add",
      });
      const cancelBtn = addRow.createDiv({
        cls: "rss-dashboard-sidebar-add-tag-cancel-btn",
      });
      setIcon(cancelBtn, "x");

      cancelBtn.addEventListener("click", () => {
        this.isAddTagExpanded = false;
        this.render();
      });

      const submit = () => {
        const val = input.value.trim();
        if (!val) {
          this.isAddTagExpanded = false;
          this.render();
          return;
        }
        if (
          this.settings.availableTags.some(
            (t) => t.name.toLowerCase() === val.toLowerCase(),
          )
        ) {
          new Notice("Tag already exists");
          return;
        }
        this.settings.availableTags.push({ name: val, color: cp.value });
        void this.plugin.saveSettings();
        this.app.workspace.trigger("rss-dashboard:tags-mutated");
        input.value = "";
        this.isAddTagExpanded = false;
        this.render();
      };

      addBtn.addEventListener("click", submit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          this.isAddTagExpanded = false;
          this.render();
        }
      });

      // Auto-focus the input
      requestAnimationFrame(() => {
        input.focus();
      });
    } else {
      const addToggle = tagsSection.createDiv({
        cls: "rss-dashboard-sidebar-add-tag-toggle",
      });
      setIcon(addToggle, "plus");
      addToggle.createSpan({
        text: "Add new tag...",
        cls: "rss-dashboard-sidebar-add-tag-toggle-label",
      });
      addToggle.addEventListener("click", () => {
        this.isAddTagExpanded = true;
        this.render();
      });
    }
  }

  private renderAllFeedsButton(container: HTMLElement): void {
    const totalFeeds = this.settings.display.hideEmptyFeeds
      ? this.settings.feeds.filter(
          (f) => f.items.length > 0 && f.items.some((i) => !i.read),
        ).length
      : this.settings.feeds.length;

    const totalUnread = this.settings.feeds.reduce(
      (sum, feed) => sum + feed.items.filter((item) => !item.read).length,
      0,
    );

    const isAllActive =
      this.options.currentFolder === null &&
      this.options.currentFeed === null &&
      this.options.selectedTags.length === 0;

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
      attr: {
        "data-folder-path": fullPath,
      },
    });

    const folderHeader = folderEl.createDiv({
      cls:
        "rss-dashboard-feed-folder-header" +
        (isCollapsed ? " collapsed" : "") +
        (shouldHighlight ? " active" : ""),
      attr: {
        "data-folder-name": folderName,
        "data-folder-path": fullPath,
      },
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
    let sortedFeedsInFolder = folderSortOrder
      ? this.applyFeedSortOrder([...folderFeeds], folderSortOrder)
      : folderFeeds;

    if (this.settings.display.hideEmptyFeeds) {
      sortedFeedsInFolder = sortedFeedsInFolder.filter(
        (feed) =>
          feed.items.length > 0 && feed.items.some((item) => !item.read),
      );
    }

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
        "data-feed-title": feed.title,
        "data-feed-folder": feed.folder || "",
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
      feed.items.length === 0 && this.processingImportFeedUrls.has(feed.url);
    const isQueuedForImport =
      feed.items.length === 0 && this.pendingImportFeedUrls.has(feed.url);

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
        this.renderFallbackFeedIcon(feedIcon);
        void this.renderDomainFavicon(feedIcon, domain);
      } else {
        this.renderFallbackFeedIcon(feedIcon);
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

    if (isQueuedForImport && !isProcessing) {
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
    showEditTagModal({
      settings: this.settings,
      tag,
      onSave: async () => {
        await this.plugin.saveSettings();
        this.app.workspace.trigger("rss-dashboard:tags-mutated");
        this.render();
      },
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
    this.app.workspace.trigger("rss-dashboard:tags-mutated");

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

  public renderHeader(parentEl: HTMLElement = this.container): void {
    const header = parentEl.createDiv({ cls: "rss-dashboard-header" });
    this.iconBtnEls.clear();
    this.iconActions.clear();

    if (this.settings.display.hideToolbarEntirely) return;

    const iconRowWrapper = header.createDiv({ cls: "rss-icon-row-wrapper" });
    const iconRow = iconRowWrapper.createDiv({
      cls: "rss-dashboard-header-icon-row",
    });
    const display = this.settings.display;
    const iconOrder: string[] = display.iconOrder?.length
      ? display.iconOrder
      : [...SIDEBAR_ICON_IDS];

    // collapseAll needs a ref to its own button to update the icon dynamically
    let collapseAllBtnRef: HTMLElement | null = null;
    let cachedCollapseAllPaths: string[] | null = null;
    const updateCollapseAllIcon = () => {
      if (!collapseAllBtnRef) return;
      if (!cachedCollapseAllPaths) {
        cachedCollapseAllPaths = this.getCachedFolderPaths();
      }
      const collapsedFolders = this.settings.collapsedFolders || [];
      const allCollapsed =
        cachedCollapseAllPaths.length > 0 &&
        cachedCollapseAllPaths.every((path) => collapsedFolders.includes(path));
      setIcon(
        collapseAllBtnRef,
        allCollapsed ? "chevrons-down-up" : "chevrons-up-down",
      );
    };

    // Track whether we've passed the last nav icon so we can inject a divider
    let seenNavIcon = false;
    let navDividerAdded = false;

    for (const id of iconOrder) {
      const iconConfig = getIconById(id);
      if (!iconConfig) continue;

      const hideKey = iconConfig.settingKey;
      if (display[hideKey]) continue;

      // Inject a visual divider once, between nav icons and action icons
      if (!navDividerAdded && seenNavIcon && !iconConfig.isNav) {
        const divider = iconRow.createDiv({ cls: "rss-nav-divider" });
        iconRow.appendChild(divider);
        navDividerAdded = true;
      }
      if (iconConfig.isNav) seenNavIcon = true;

      let btn: HTMLElement;

      switch (id) {
        case "dashboard": {
          const action = () => {
            if (this.callbacks.onActivateDashboard) {
              this.callbacks.onActivateDashboard();
            } else {
              void this.plugin.activateView();
            }
          };
          this.iconActions.set("dashboard", action);
          btn = createToolbarButton(iconConfig, action);
          btn.addClass(
            "rss-dashboard-nav-button",
            "rss-dashboard-nav-button--icon",
            "active",
          );
          break;
        }

        case "discover": {
          const action = () => {
            if (this.callbacks.onActivateDiscover) {
              this.callbacks.onActivateDiscover();
            } else {
              void this.plugin.activateDiscoverView();
            }
          };
          this.iconActions.set("discover", action);
          btn = createToolbarButton(iconConfig, action);
          btn.addClass(
            "rss-dashboard-nav-button",
            "rss-dashboard-nav-button--icon",
          );
          break;
        }

        case "addFeed": {
          const action = () => {
            this.showAddFeedModal();
            if (
              !this.app.loadLocalStorage("rss-first-launch-coachmark-shown")
            ) {
              this.app.saveLocalStorage(
                "rss-first-launch-coachmark-shown",
                "true",
              );
              const coachmark = this.iconBtnEls
                .get("addFeed")
                ?.querySelector(".rss-dashboard-coachmark");
              if (coachmark) coachmark.remove();
            }
          };
          this.iconActions.set("addFeed", action);
          btn = createToolbarButton(iconConfig, action);
          break;
        }

        case "manageFeeds": {
          const action = () => {
            if (this.callbacks.onManageFeeds) {
              this.callbacks.onManageFeeds();
            }
          };
          this.iconActions.set("manageFeeds", action);
          btn = createToolbarButton(iconConfig, action);
          break;
        }

        case "search": {
          const action = () => {
            this.isSearchExpanded = !this.isSearchExpanded;
            this.render();
            if (this.isSearchExpanded) {
              requestAnimationFrame(() => {
                const searchInput =
                  this.container.querySelector<HTMLInputElement>(
                    ".rss-dashboard-search-input",
                  );
                if (!searchInput) return;
                searchInput.focus();
                searchInput.select();
                searchInput.scrollIntoView({ block: "nearest" });
              });
            }
          };
          this.iconActions.set("search", action);
          btn = createToolbarButton(iconConfig, action);
          btn.toggleClass("is-active", this.isSearchExpanded);
          btn.setAttr("aria-pressed", this.isSearchExpanded ? "true" : "false");
          break;
        }

        case "tags": {
          const action = () => {
            this.isTagsExpanded = !this.isTagsExpanded;
            this.render();
          };
          this.iconActions.set("tags", action);
          btn = createToolbarButton(iconConfig, action);
          btn.toggleClass("is-active", this.isTagsExpanded);
          btn.setAttr("aria-pressed", this.isTagsExpanded ? "true" : "false");
          break;
        }

        case "addFolder": {
          const action = () => {
            this.showFolderNameModal({
              title: "Add folder",
              existingNames: this.settings.folders.map((f) => f.name),
              onSubmit: (folderName) => {
                void this.addTopLevelFolder(folderName).then(() =>
                  this.render(),
                );
              },
            });
          };
          this.iconActions.set("addFolder", action);
          btn = createToolbarButton(iconConfig, action);
          break;
        }

        case "sort":
          // sort requires the MouseEvent for menu positioning; action stored in fireIconAction
          btn = createToolbarButton(iconConfig, () => {
            /* keyboard: no-op */
          });
          btn.addEventListener("click", (e: MouseEvent) =>
            this.fireIconAction("sort", e),
          );
          break;

        case "collapseAll": {
          const action = () => {
            cachedCollapseAllPaths = null;
            this.toggleAllFolders();
            window.setTimeout(updateCollapseAllIcon, 0);
          };
          this.iconActions.set("collapseAll", action);
          btn = createToolbarButton(iconConfig, action);
          collapseAllBtnRef = btn;
          updateCollapseAllIcon();
          break;
        }

        case "settings": {
          const action = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            (this.app as any).setting?.open?.();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            (this.app as any).setting?.openTabById?.(this.plugin.manifest.id);
          };
          this.iconActions.set("settings", action);
          btn = createToolbarButton(iconConfig, action);
          break;
        }

        default:
          continue;
      }

      iconRow.appendChild(btn);
      this.iconBtnEls.set(id, btn);
    }

    // Hamburger button — always last; hidden until responsive collapse needs it
    // Set up scroll-fade indicators on the icon row wrapper
    iconRow.addEventListener("scroll", () => this.updateIconRowFades());

    // First-launch coachmark for the Add Feed button
    const addFeedBtn = this.iconBtnEls.get("addFeed");
    if (
      addFeedBtn &&
      !this.app.loadLocalStorage("rss-first-launch-coachmark-shown")
    ) {
      const coachmark = addFeedBtn.createDiv({
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
  }

  private updateIconRowFades(): void {
    const iconRow = this.container.querySelector<HTMLElement>(
      ".rss-dashboard-header-icon-row",
    );
    const wrapper = this.container.querySelector<HTMLElement>(
      ".rss-icon-row-wrapper",
    );
    if (!iconRow || !wrapper) return;
    wrapper.toggleClass("has-overflow-left", iconRow.scrollLeft > 0);
    wrapper.toggleClass(
      "has-overflow-right",
      iconRow.scrollLeft + iconRow.clientWidth < iconRow.scrollWidth - 1,
    );
  }

  private fireIconAction(id: string, e?: MouseEvent): void {
    if (id === "sort") {
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle("Folder name (a to z)")
          .onClick(() => void this.sortFolders("name", true)),
      );
      menu.addItem((item) =>
        item
          .setTitle("Folder name (z to a)")
          .onClick(() => void this.sortFolders("name", false)),
      );
      menu.addItem((item) =>
        item
          .setTitle("Modified time (new to old)")
          .onClick(() => void this.sortFolders("modified", false)),
      );
      menu.addItem((item) =>
        item
          .setTitle("Modified time (old to new)")
          .onClick(() => void this.sortFolders("modified", true)),
      );
      menu.addItem((item) =>
        item
          .setTitle("Created time (new to old)")
          .onClick(() => void this.sortFolders("created", false)),
      );
      menu.addItem((item) =>
        item
          .setTitle("Created time (old to new)")
          .onClick(() => void this.sortFolders("created", true)),
      );
      if (e) {
        menu.showAtMouseEvent(e);
      } else {
        const sortBtn = this.iconBtnEls.get("sort");
        if (sortBtn) {
          const rect = sortBtn.getBoundingClientRect();
          menu.showAtPosition({ x: rect.left, y: rect.bottom });
        }
      }
      return;
    }
    const action = this.iconActions.get(id);
    if (action) action(e);
  }

  public renderFilters(parentEl: HTMLElement): void {
    // Deprecated: the filter actions are now in the header toolbar
  }

  // Legacy toggle-row renderer (disabled after moving toolbar actions into header).
  // private renderToolbarToggle(parentEl: HTMLElement): void {
  //   const toggleRow = parentEl.createDiv({
  //     cls: "rss-dashboard-toolbar-toggle-row",
  //   });
  //   const toggleButton = toggleRow.createEl("button", {
  //     cls: "rss-dashboard-toolbar-toggle-button",
  //     attr: {
  //       type: "button",
  //       "aria-label": this.isSidebarToolbarCollapsed
  //         ? "Show sidebar toolbar"
  //         : "Hide sidebar toolbar",
  //       "aria-expanded": this.isSidebarToolbarCollapsed ? "false" : "true",
  //       title: this.isSidebarToolbarCollapsed ? "Show toolbar" : "Hide toolbar",
  //     },
  //   });
  //   toggleButton.toggleClass("is-collapsed", this.isSidebarToolbarCollapsed);
  //   setIcon(
  //     toggleButton,
  //     this.isSidebarToolbarCollapsed ? "chevron-down" : "chevron-up",
  //   );
  //   const toolbarToggleSvg = toggleButton.querySelector("svg");
  //   const hasRenderableIcon = !!toolbarToggleSvg?.querySelector(
  //     "path, line, polyline, polygon, circle, rect",
  //   );
  //   if (!hasRenderableIcon) {
  //     toggleButton.setText(this.isSidebarToolbarCollapsed ? "▾" : "▴");
  //   }
  //   toggleButton.addEventListener("click", () => {
  //     this.isSidebarToolbarCollapsed = !this.isSidebarToolbarCollapsed;
  //     if (this.isSidebarToolbarCollapsed) {
  //       this.isSearchExpanded = false;
  //     }
  //     this.render();
  //   });
  // }

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
        placeholder: "Search (feed:, folder:, tag:)",
        autocomplete: "off",
        spellcheck: "false",
        value: this.searchQuery,
      },
    });

    let searchTimeout: number;

    attachInputClearButton(
      searchContainer,
      searchInput,
      () => {
        this.searchQuery = "";
        if (searchTimeout) {
          window.clearTimeout(searchTimeout);
        }
        this.filterFeedsAndFolders("");
        searchInput.focus();
      },
      {
        buttonClass: "rss-dashboard-search-clear",
        hiddenClass: "is-hidden",
        useButtonElement: true,
      },
    );

    searchInput.addEventListener("focus", () => {
      searchInput.select();

      // On mobile, ensure the input is visible above the keyboard
      if (window.innerWidth <= 768) {
        window.setTimeout(() => {
          searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    });

    searchInput.addEventListener("input", (e) => {
      const rawQuery = (e.target as HTMLInputElement)?.value || "";
      this.searchQuery = rawQuery;
      const query = rawQuery.toLowerCase().trim();
      if (searchTimeout) {
        window.clearTimeout(searchTimeout);
      }
      searchTimeout = window.setTimeout(() => {
        this.filterFeedsAndFolders(query);
      }, 150);
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

  public renderToolbar(parentEl: HTMLElement, inline = false): void {
    const sidebarToolbar = parentEl.createDiv({
      cls:
        "rss-dashboard-sidebar-toolbar" +
        (inline ? " rss-dashboard-sidebar-toolbar--inline" : ""),
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
        customTemplate,
      ) =>
        await this.callbacks.onAddFeed(
          title,
          url,
          folder,
          autoDeleteDuration,
          maxItemsLimit,
          scanInterval,
          feedFilters,
          customTemplate,
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

  private collectAncestorFolders(element: HTMLElement): HTMLElement[] {
    const ancestors: HTMLElement[] = [];
    let current = element.parentElement;
    while (current) {
      if (current.classList.contains("rss-dashboard-feed-folder")) {
        ancestors.push(current);
      }
      current = current.parentElement;
    }
    return ancestors;
  }

  private forceExpandFolderForSearch(folderEl: HTMLElement): void {
    const folderHeader = folderEl.querySelector<HTMLElement>(
      ".rss-dashboard-feed-folder-header",
    );
    const folderFeeds = folderEl.querySelector<HTMLElement>(
      ".rss-dashboard-folder-feeds",
    );
    if (!folderHeader || !folderFeeds) return;
    if (folderFeeds.getAttribute("data-search-expanded") === "true") return;

    const wasHeaderCollapsed = folderHeader.classList.contains("collapsed");
    const wasListCollapsed = folderFeeds.classList.contains("collapsed");

    folderHeader.setAttribute("data-search-expanded", "true");
    folderFeeds.setAttribute("data-search-expanded", "true");
    folderHeader.setAttribute(
      "data-search-was-collapsed",
      wasHeaderCollapsed ? "true" : "false",
    );
    folderFeeds.setAttribute(
      "data-search-was-collapsed",
      wasListCollapsed ? "true" : "false",
    );

    folderHeader.removeClass("collapsed");
    folderFeeds.removeClass("collapsed");

    const toggleButton = folderHeader.querySelector<HTMLElement>(
      ".rss-dashboard-feed-folder-toggle",
    );
    if (toggleButton) {
      setIcon(toggleButton, "chevron-down");
    }
  }

  private resetSidebarSearchPresentation(): void {
    this.container
      .querySelectorAll<HTMLElement>(".rss-dashboard-search-hidden")
      .forEach((el) => el.removeClass("rss-dashboard-search-hidden"));

    this.container
      .querySelectorAll<HTMLElement>(
        '.rss-dashboard-feed-folder-header[data-search-expanded="true"]',
      )
      .forEach((header) => {
        const wasCollapsed =
          header.getAttribute("data-search-was-collapsed") === "true";
        if (wasCollapsed) {
          header.addClass("collapsed");
        }
        const toggleButton = header.querySelector<HTMLElement>(
          ".rss-dashboard-feed-folder-toggle",
        );
        if (toggleButton) {
          setIcon(
            toggleButton,
            wasCollapsed ? "chevron-right" : "chevron-down",
          );
        }
        header.removeAttribute("data-search-expanded");
        header.removeAttribute("data-search-was-collapsed");
      });

    this.container
      .querySelectorAll<HTMLElement>(
        '.rss-dashboard-folder-feeds[data-search-expanded="true"]',
      )
      .forEach((feedList) => {
        const wasCollapsed =
          feedList.getAttribute("data-search-was-collapsed") === "true";
        if (wasCollapsed) {
          feedList.addClass("collapsed");
        }
        feedList.removeAttribute("data-search-expanded");
        feedList.removeAttribute("data-search-was-collapsed");
      });
  }

  /**
   * Filter sidebar entities by search query.
   * Supports scoped queries: feed:, folder:/path:, tag:
   */
  private filterFeedsAndFolders(query: string): void {
    this.resetSidebarSearchPresentation();

    const parsedQuery = SidebarSearchService.parseQuery(query);

    const feedElements = Array.from(
      this.container.querySelectorAll<HTMLElement>(".rss-dashboard-feed"),
    );
    const folderElements = Array.from(
      this.container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-feed-folder",
      ),
    );
    const allFeedsButton = this.container.querySelector<HTMLElement>(
      ".rss-dashboard-all-feeds-button",
    );

    if (!parsedQuery.term) {
      allFeedsButton?.removeClass("rss-dashboard-search-hidden");
      return;
    }

    const folderDirectMatches = new Map<HTMLElement, boolean>();
    folderElements.forEach((folderEl) => {
      const header = folderEl.querySelector<HTMLElement>(
        ".rss-dashboard-feed-folder-header",
      );
      const folderPath =
        folderEl.dataset.folderPath || header?.dataset.folderPath || "";
      const folderName =
        header?.dataset.folderName ||
        header
          ?.querySelector(".rss-dashboard-feed-folder-name")
          ?.textContent?.trim() ||
        "";

      folderDirectMatches.set(
        folderEl,
        SidebarSearchService.matchesFolder(parsedQuery, folderName, folderPath),
      );
    });

    feedElements.forEach((feedEl) => {
      const feedTitle =
        feedEl.dataset.feedTitle ||
        feedEl.querySelector(".rss-dashboard-feed-name")?.textContent?.trim() ||
        "";
      const feedFolderPath = feedEl.dataset.feedFolder || "";

      const feedMatch = SidebarSearchService.matchesFeed(
        parsedQuery,
        feedTitle,
        feedFolderPath,
      );

      const hasMatchedFolderAncestor = this.collectAncestorFolders(feedEl).some(
        (folderEl) => folderDirectMatches.get(folderEl) === true,
      );

      if (feedMatch || hasMatchedFolderAncestor) {
        feedEl.removeClass("rss-dashboard-search-hidden");
      } else {
        feedEl.addClass("rss-dashboard-search-hidden");
      }
    });

    const folderVisible = new Map<HTMLElement, boolean>();
    [...folderElements].reverse().forEach((folderEl) => {
      const directMatch = folderDirectMatches.get(folderEl) === true;
      const hasVisibleFeeds =
        folderEl.querySelectorAll(
          ".rss-dashboard-feed:not(.rss-dashboard-search-hidden)",
        ).length > 0;

      const folderFeedContainer = folderEl.querySelector<HTMLElement>(
        ".rss-dashboard-folder-feeds",
      );
      const hasVisibleSubfolder = Array.from(
        folderFeedContainer?.children ?? [],
      ).some(
        (child) =>
          child instanceof HTMLElement &&
          child.classList.contains("rss-dashboard-feed-folder") &&
          folderVisible.get(child) === true,
      );

      const shouldShow = directMatch || hasVisibleFeeds || hasVisibleSubfolder;
      folderVisible.set(folderEl, shouldShow);

      const header = folderEl.querySelector<HTMLElement>(
        ".rss-dashboard-feed-folder-header",
      );
      if (shouldShow) {
        folderEl.removeClass("rss-dashboard-search-hidden");
        header?.removeClass("rss-dashboard-search-hidden");
        this.forceExpandFolderForSearch(folderEl);
      } else {
        folderEl.addClass("rss-dashboard-search-hidden");
        header?.addClass("rss-dashboard-search-hidden");
      }
    });

    const visibleFeeds = this.container.querySelectorAll(
      ".rss-dashboard-feed:not(.rss-dashboard-search-hidden)",
    ).length;
    if (visibleFeeds === 0) {
      allFeedsButton?.addClass("rss-dashboard-search-hidden");
    } else {
      allFeedsButton?.removeClass("rss-dashboard-search-hidden");
    }
  }

  private applySearchFilterFromState(): void {
    const query = this.isSearchExpanded
      ? this.searchQuery.toLowerCase().trim()
      : "";
    this.filterFeedsAndFolders(query);
  }

  /**
   * Clear the search and show all feeds/folders
   */
  public clearFeedSearch(): void {
    this.isSearchExpanded = false;
    this.render();
  }
}
