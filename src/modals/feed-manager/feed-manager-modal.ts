import { Modal, App, Setting, Notice, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import type { Feed, Folder } from "../../types/types";
import { DEFAULT_SETTINGS } from "../../types/types";
import { ImportOpmlModal } from "../import-opml-modal";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { isValidFolderName } from "../../utils/validation";
import { collectFolderPaths } from "../../utils/folder-paths";
import { removeFolderByPath } from "../../utils/folder-tree";
import { AddFeedModal } from "./add-feed-modal";
import { EditFeedModal } from "./edit-feed-modal";

export class FeedManagerModal extends Modal {
  plugin: RssDashboardPlugin;
  private searchQuery = "";

  constructor(app: App, plugin: RssDashboardPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    const isMobile = shouldUseMobileSidebarLayout();

    this.modalEl.className +=
      " rss-dashboard-modal rss-dashboard-modal-container";
    if (isMobile) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
    }

    contentEl.empty();

    new Setting(contentEl).setName("Manage feeds").setHeading();

    // Search and button container
    const topControls = contentEl.createDiv({
      cls: "feed-manager-top-controls",
    });

    // Search input
    const searchContainer = topControls.createDiv({
      cls: "feed-manager-search-container",
    });
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search feeds...",
      cls: "feed-manager-search-input",
    });
    const searchClearBtn = searchContainer.createDiv({
      cls: "clickable-icon feed-manager-search-clear is-hidden",
      attr: {
        "aria-label": "Clear search",
        role: "button",
        tabindex: "0",
      },
    });
    setIcon(searchClearBtn, "x");

    const updateSearchClearVisibility = () => {
      const hasValue = searchInput.value.trim().length > 0;
      searchClearBtn.toggleClass("is-hidden", !hasValue);
    };

    searchInput.value = this.searchQuery;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderFeeds(contentEl);
      updateSearchClearVisibility();
    });
    const clearSearchAction = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      searchInput.value = "";
      this.searchQuery = "";
      this.renderFeeds(contentEl);
      updateSearchClearVisibility();
      searchInput.focus();
    };

    searchClearBtn.addEventListener("click", clearSearchAction);
    searchClearBtn.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        clearSearchAction(e);
      }
    });
    updateSearchClearVisibility();

    // First button row - Add feed
    const buttonRowPrimary = topControls.createDiv({
      cls: "feed-manager-button-row feed-manager-button-row-primary",
    });

    // Add feed button
    const addFeedBtn = buttonRowPrimary.createEl("button", {
      cls: "rss-dashboard-primary-button feed-manager-add-button",
    });
    addFeedBtn.createSpan({ text: "Add new feed..." });
    addFeedBtn.onclick = () => {
      new AddFeedModal(
        this.app,
        this.plugin.settings.folders,
        (
          title,
          url,
          folder,
          autoDeleteDuration,
          maxItemsLimit,
          scanInterval,
          feedFilters,
          customTemplate,
          excludeFromRefresh,
        ) =>
          this.plugin.addFeed(
            title,
            url,
            folder,
            autoDeleteDuration,
            maxItemsLimit,
            scanInterval,
            feedFilters,
            customTemplate,
            excludeFromRefresh,
          ),
        () => this.onOpen(),
        "",
        this.plugin,
      ).open();
    };

    // Second button row - Import, Export, Delete All
    const buttonRowSecondary = topControls.createDiv({
      cls: "feed-manager-button-row feed-manager-button-row-secondary",
    });

    // Import OPML button
    const importOpmlBtn = buttonRowSecondary.createEl("button", {
      cls: "feed-manager-opml-button feed-manager-import-button",
    });
    setIcon(importOpmlBtn, "upload");
    importOpmlBtn.createSpan({ text: " Import OPML" });
    importOpmlBtn.onclick = () => {
      new ImportOpmlModal(this.app, this.plugin, () => this.close()).open();
    };

    // Export OPML button
    const exportOpmlBtn = buttonRowSecondary.createEl("button", {
      cls: "feed-manager-opml-button feed-manager-export-button",
    });
    setIcon(exportOpmlBtn, "download");
    exportOpmlBtn.createSpan({ text: " Export OPML" });
    exportOpmlBtn.onclick = () => {
      this.plugin.exportOpml();
    };

    // Delete All button
    const deleteAllBtn = buttonRowSecondary.createEl("button", {
      cls: "rss-dashboard-danger-button feed-manager-delete-all-button",
    });
    setIcon(deleteAllBtn, "trash-2");
    deleteAllBtn.createSpan({ text: " Delete all" });
    deleteAllBtn.onclick = () => {
      this.showDeleteConfirmModal({ type: "all" });
    };

    this.renderFeeds(contentEl);
  }

  private renderFeeds(containerEl: HTMLElement) {
    // Remove existing feed list if it exists
    const existingList = containerEl.querySelector(".feed-manager-list");
    if (existingList) {
      existingList.remove();
    }

    const feedsContainer = containerEl.createDiv({
      cls: "feed-manager-list",
    });

    const allFolderPaths = collectFolderPaths(this.plugin.settings.folders, {
      sort: false,
    });

    const feedsByFolder: Record<string, Feed[]> = {};
    for (const path of allFolderPaths) feedsByFolder[path] = [];
    const uncategorized: Feed[] = [];

    // Filter feeds based on search query
    const lowerQuery = this.searchQuery.toLowerCase();
    const filteredFeeds = this.plugin.settings.feeds.filter(
      (feed) =>
        feed.title.toLowerCase().includes(lowerQuery) ||
        feed.folder?.toLowerCase().includes(lowerQuery),
    );

    for (const feed of filteredFeeds) {
      if (feed.folder && allFolderPaths.includes(feed.folder)) {
        feedsByFolder[feed.folder].push(feed);
      } else {
        uncategorized.push(feed);
      }
    }

    // Show message if no results
    if (filteredFeeds.length === 0) {
      feedsContainer.createDiv({
        text: "No feeds found.",
        cls: "feed-manager-empty",
      });
      return;
    }

    for (const folderPath of allFolderPaths) {
      const feeds = feedsByFolder[folderPath];
      if (feeds.length > 0) {
        const folderDiv = feedsContainer.createDiv({
          cls: "feed-manager-folder",
        });

        // Create folder header with delete button on left
        const folderHeader = folderDiv.createDiv({
          cls: "feed-manager-folder-header",
        });

        // Add delete folder button (X icon) on the left
        const deleteFolderBtn = folderHeader.createDiv({
          cls: "clickable-icon feed-manager-delete-folder-button",
          attr: {
            "aria-label": "Delete folder",
            role: "button",
            tabindex: "0",
          },
        });
        setIcon(deleteFolderBtn, "trash-2");
        const deleteFolderAction = () => {
          this.showDeleteConfirmModal({
            type: "folder",
            folderPath,
            feedCount: feeds.length,
          });
        };
        deleteFolderBtn.onclick = deleteFolderAction;
        deleteFolderBtn.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            deleteFolderAction();
          }
        });

        // Add folder name
        const folderName = folderHeader.createDiv({
          cls: "feed-manager-folder-name",
        });
        folderName.setText(folderPath);
        folderName.setAttribute("title", "Click to rename folder");
        folderName.addClass("is-editable");
        folderName.addEventListener("click", (event) => {
          event.stopPropagation();
          this.startInlineFolderRename(folderName, folderPath);
        });

        // Add horizontal divider below header
        folderDiv.createDiv({ cls: "feed-manager-folder-divider" });

        for (const feed of feeds) {
          this.renderFeedRow(folderDiv, feed);
        }
      }
    }

    if (uncategorized.length > 0) {
      const uncategorizedDiv = feedsContainer.createDiv({
        cls: "feed-manager-folder",
      });

      // Create folder header with delete button on left
      const folderHeader = uncategorizedDiv.createDiv({
        cls: "feed-manager-folder-header",
      });

      // Add delete folder button (X icon) on the left
      const deleteFolderBtn = folderHeader.createDiv({
        cls: "clickable-icon feed-manager-delete-folder-button",
        attr: {
          "aria-label": "Delete folder",
          role: "button",
          tabindex: "0",
        },
      });
      setIcon(deleteFolderBtn, "trash-2");
      const deleteUncategorizedAction = () => {
        this.showDeleteConfirmModal({
          type: "folder",
          folderPath: "Uncategorized",
          feedCount: uncategorized.length,
        });
      };
      deleteFolderBtn.onclick = deleteUncategorizedAction;
      deleteFolderBtn.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          deleteUncategorizedAction();
        }
      });

      // Add folder name
      const folderName = folderHeader.createDiv({
        cls: "feed-manager-folder-name",
      });
      folderName.setText("Uncategorized");

      // Add horizontal divider below header
      uncategorizedDiv.createDiv({ cls: "feed-manager-folder-divider" });

      for (const feed of uncategorized) {
        this.renderFeedRow(uncategorizedDiv, feed);
      }
    }
  }

  renderFeedRow(parent: HTMLElement, feed: Feed) {
    const row = parent.createDiv({ cls: "feed-manager-row" });
    row.createDiv({ text: feed.title, cls: "feed-manager-title" });

    const editBtn = row.createEl("button", {
      cls: "rss-dashboard-primary-button",
    });
    setIcon(editBtn, "pencil");
    editBtn.createSpan({ text: " Edit" });
    editBtn.onclick = () => {
      new EditFeedModal(this.app, this.plugin, feed, () =>
        this.onOpen(),
      ).open();
    };

    const delBtn = row.createEl("button", {
      cls: "rss-dashboard-danger-button",
    });
    setIcon(delBtn, "trash-2");
    delBtn.createSpan({ text: " Delete" });
    delBtn.onclick = () => {
      this.showDeleteConfirmModal({ type: "feed", feed });
    };
  }

  /**
   * Unified delete confirmation modal that appears as an overlay
   * Handles Delete All, Delete Folder, and Delete Feed actions
   */
  private showDeleteConfirmModal(options: {
    type: "all" | "folder" | "feed";
    folderPath?: string;
    feedCount?: number;
    feed?: Feed;
  }): void {
    const { type, folderPath, feedCount, feed } = options;
    const parentModalEl = this.modalEl;
    parentModalEl.addClass("rss-dashboard-modal-interactions-disabled");

    // Use a real Obsidian Modal so background interactions are blocked.
    const confirmModal = new Modal(this.app);
    confirmModal.modalEl.addClasses([
      "rss-dashboard-modal",
      "rss-dashboard-modal-container",
      "rss-dashboard-confirm-modal",
    ]);
    confirmModal.contentEl.empty();
    confirmModal.contentEl.addClass("rss-dashboard-modal-content");
    const { contentEl: modalContent } = confirmModal;

    const restoreParentInteractivity = () => {
      parentModalEl.removeClass("rss-dashboard-modal-interactions-disabled");
    };
    const originalOnClose = confirmModal.onClose.bind(confirmModal);
    confirmModal.onClose = () => {
      originalOnClose();
      restoreParentInteractivity();
    };

    // Context-specific header and message
    let title: string;
    let warningMessage: string;
    let confirmButtonText: string;

    switch (type) {
      case "all":
        title = "Delete all feeds?";
        warningMessage =
          "This action is irreversible. All your feeds will be permanently deleted.";
        confirmButtonText = "Delete All";
        break;
      case "folder":
        title = `Delete folder "${folderPath}"?`;
        warningMessage = `This action is irreversible. The folder "${folderPath}" and all ${feedCount} feed(s) within it will be permanently deleted.`;
        confirmButtonText = "Delete Folder";
        break;
      case "feed":
        title = `Delete feed "${feed?.title}"?`;
        warningMessage =
          "This action is irreversible. The feed will be permanently deleted.";
        confirmButtonText = "Delete";
        break;
    }

    new Setting(modalContent).setName(title).setHeading();

    // Warning message
    const warningDiv = modalContent.createDiv({
      cls: "delete-all-warning",
    });
    warningDiv.createEl("p", { text: warningMessage });

    // Backup recommendation (only for folder and all deletions)
    if (type === "all" || type === "folder") {
      const backupDiv = modalContent.createDiv({
        cls: "delete-all-backup-notice",
      });
      backupDiv.createEl("strong", {
        text: "Recommended: export your feeds first",
      });
      backupDiv.createEl("p", {
        // OPML is an acronym - sentence case doesn't apply
        text: "Before deleting, we strongly recommend backing up your feeds by exporting to an OPML file.",
      });

      // Export OPML button
      const exportBtn = backupDiv.createEl("button", {
        // OPML is an acronym - sentence case doesn't apply
        text: "Export OPML",
        cls: "rss-dashboard-primary-button export-opml-btn",
      });
      exportBtn.onclick = () => {
        this.plugin.exportOpml();
      };
    }

    // Button container
    const buttonContainer = modalContent.createDiv({
      cls: "rss-dashboard-modal-buttons rss-folder-name-modal-buttons",
    });

    const confirmButton = buttonContainer.createEl("button", {
      cls: "rss-dashboard-danger-button",
    });
    const deleteIcon = confirmButton.createSpan();
    setIcon(deleteIcon, "trash-2");
    confirmButton.createSpan({ text: confirmButtonText });
    confirmButton.onclick = () => {
      // Execute the appropriate deletion
      switch (type) {
        case "all":
          void this.resetToFactorySettings();
          break;
        case "folder":
          void this.deleteFolder(folderPath!);
          break;
        case "feed":
          void this.deleteFeed(feed!);
          break;
      }
      confirmModal.close();
    };

    const cancelButton = buttonContainer.createEl("button");
    cancelButton.addClass("rss-confirm-modal-cancel");
    const cancelIcon = cancelButton.createSpan();
    setIcon(cancelIcon, "x");
    cancelButton.createSpan({ text: "Cancel" });
    cancelButton.onclick = () => {
      confirmModal.close();
    };

    confirmModal.open();
  }

  /**
   * Reset to factory settings - delete all feeds and restore default folders
   */
  private async resetToFactorySettings(): Promise<void> {
    // Clear all feeds
    this.plugin.settings.feeds = [];

    // Reset folders to default
    this.plugin.settings.folders = DEFAULT_SETTINGS.folders.map((f) => ({
      ...f,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    }));

    // Save settings
    await this.plugin.saveSettings();

    // Refresh the dashboard view if it exists
    const dashboardView = await this.plugin.getActiveDashboardView();
    if (dashboardView) {
      dashboardView.refresh();
    }

    // Show success notice
    new Notice("All feeds deleted. Settings reset to factory defaults.");

    // Re-render the modal
    this.onOpen();
  }

  /**
   * Delete a folder and all feeds within it
   */
  private async deleteFolder(folderPath: string): Promise<void> {
    // Remove all feeds in this folder (including subfolders)
    this.plugin.settings.feeds = this.plugin.settings.feeds.filter((feed) => {
      // Check if feed is in this folder or a subfolder
      return (
        feed.folder !== folderPath && !feed.folder?.startsWith(folderPath + "/")
      );
    });

    // Remove the folder from the folder hierarchy
    this.removeFolderFromHierarchy(folderPath);

    // Save settings
    await this.plugin.saveSettings();

    // Refresh the dashboard view if it exists
    const dashboardView = await this.plugin.getActiveDashboardView();
    if (dashboardView) {
      dashboardView.refresh();
    }

    // Show success notice
    new Notice(`Folder "${folderPath}" and its feeds deleted.`);

    // Re-render the modal
    this.onOpen();
  }

  /**
   * Delete a single feed
   */
  private async deleteFeed(feed: Feed): Promise<void> {
    // Remove the feed from the feeds array
    this.plugin.settings.feeds = this.plugin.settings.feeds.filter(
      (f) => f !== feed,
    );

    // Save settings
    await this.plugin.saveSettings();

    // Refresh the dashboard view if it exists
    const dashboardView = await this.plugin.getActiveDashboardView();
    if (dashboardView) {
      dashboardView.refresh();
    }

    // Show success notice
    new Notice(`Feed "${feed.title}" deleted.`);

    // Re-render the modal
    this.onOpen();
  }

  private startInlineFolderRename(
    nameEl: HTMLElement,
    folderPath: string,
  ): void {
    const oldName = folderPath.split("/").pop() || folderPath;
    const input = activeDocument.createElement("input");
    input.type = "text";
    input.value = oldName;
    input.className = "feed-manager-folder-name-input";
    input.setAttribute("aria-label", "Rename folder");

    const finish = (save: boolean) => {
      if (!input.parentElement) return;

      if (!save) {
        input.replaceWith(nameEl);
        return;
      }

      const nextName = input.value.trim();
      void this.renameFolder(folderPath, nextName);
    };

    input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));

    nameEl.replaceWith(input);
    input.focus();
    input.select();
  }

  private async renameFolder(
    folderPath: string,
    newName: string,
  ): Promise<void> {
    const oldName = folderPath.split("/").pop() || folderPath;
    if (newName === oldName) {
      this.onOpen();
      return;
    }
    const validation = isValidFolderName(newName);
    if (!validation.valid) {
      new Notice(validation.error || "Invalid folder name.");
      this.onOpen();
      return;
    }

    const parentPath = folderPath.includes("/")
      ? folderPath.substring(0, folderPath.lastIndexOf("/"))
      : "";
    const siblings = parentPath
      ? collectFolderPaths(this.plugin.settings.folders, { sort: false })
          .filter(
            (path) =>
              path.startsWith(`${parentPath}/`) &&
              !path.substring(parentPath.length + 1).includes("/"),
          )
          .map((path) => path.substring(path.lastIndexOf("/") + 1))
      : this.plugin.settings.folders.map((folder) => folder.name);

    if (siblings.includes(newName)) {
      new Notice(`Folder "${newName}" already exists at this level.`);
      this.onOpen();
      return;
    }

    const target = this.findFolderByPath(folderPath);
    if (!target) {
      new Notice("Folder not found.");
      this.onOpen();
      return;
    }

    target.name = newName;
    target.modifiedAt = Date.now();

    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    this.plugin.settings.feeds.forEach((feed) => {
      if (!feed.folder) return;
      if (feed.folder === folderPath) {
        feed.folder = newPath;
      } else if (feed.folder.startsWith(`${folderPath}/`)) {
        feed.folder = feed.folder.replace(folderPath, newPath);
      }
    });

    await this.plugin.saveSettings();

    const dashboardView = await this.plugin.getActiveDashboardView();
    if (dashboardView) {
      dashboardView.refresh();
    }

    new Notice(`Folder renamed to "${newName}".`);
    this.onOpen();
  }

  private findFolderByPath(folderPath: string): Folder | undefined {
    const parts = folderPath.split("/").filter(Boolean);
    if (parts.length === 0) return undefined;

    let current = this.plugin.settings.folders.find(
      (folder) => folder.name === parts[0],
    );
    for (let i = 1; i < parts.length && current; i++) {
      current = current.subfolders.find((folder) => folder.name === parts[i]);
    }
    return current;
  }

  /**
   * Remove a folder from the folder hierarchy
   */
  private removeFolderFromHierarchy(folderPath: string): void {
    this.plugin.settings.folders = removeFolderByPath(
      this.plugin.settings.folders,
      folderPath,
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
