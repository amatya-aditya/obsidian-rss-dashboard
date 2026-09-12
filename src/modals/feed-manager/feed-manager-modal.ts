import { Modal, App, Setting, setIcon, Notice } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import type { Folder } from "../../types/types";
import { ImportOpmlModal } from "../import-opml-modal";
import { ImportStarredModal } from "../import-starred-modal";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { AddFeedModal, type AddFeedRequest } from "./add-feed-modal";
import { settingsUiCompatibility } from "../../settings/settings-ui-compat";

function formatByteSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

function countFoldersRecursively(folders: readonly Folder[]): number {
  return folders.reduce(
    (total, folder) => total + 1 + countFoldersRecursively(folder.subfolders),
    0,
  );
}

export class FeedManagerModal extends Modal {
  plugin: RssDashboardPlugin;

  constructor(app: App, plugin: RssDashboardPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    const isMobile = shouldUseMobileSidebarLayout();

    this.modalEl.className +=
      " rss-dashboard-modal rss-dashboard-modal-container rss-feed-manager-modal";
    if (isMobile) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
    }

    contentEl.empty();

    new Setting(contentEl).setName("Manage feeds").setHeading();

    // Primary actions row (safe, non-destructive)
    const buttonRow = contentEl.createDiv({
      cls: ["feed-manager-button-row", "feed-manager-button-row-primary"],
    });

    // Add feed button
    const addFeedBtn = buttonRow.createEl("button", {
      cls: "feed-manager-add-button",
    });
    addFeedBtn.createSpan({ text: "Add new feed..." });
    addFeedBtn.onclick = () => {
      new AddFeedModal(
        this.app,
        this.plugin.settings.folders,
        async (request: AddFeedRequest) =>
          this.plugin.addFeed(
            request.title,
            request.url,
            request.folder,
            request.autoDeleteDuration,
            request.maxItemsLimit,
            request.scanInterval,
            request.feedKeywordRules,
            request.customTemplate,
            request.excludeFromRefresh,
            request.customTags,
            { feedEncoding: request.feedEncoding },
          ),
        () => this.onOpen(),
        "",
        this.plugin,
      ).open();
    };

    // Import OPML button
    const importOpmlBtn = buttonRow.createEl("button", {
      cls: "feed-manager-import-button",
    });
    setIcon(importOpmlBtn, "upload");
    importOpmlBtn.createSpan({ text: "Import OPML/XML" });
    importOpmlBtn.onclick = () => {
      new ImportOpmlModal(this.app, this.plugin, () => this.close()).open();
    };

    // Export OPML button
    const exportOpmlBtn = buttonRow.createEl("button", {
      cls: "feed-manager-export-button",
    });
    setIcon(exportOpmlBtn, "download");
    exportOpmlBtn.createSpan({ text: "Export OPML" });
    exportOpmlBtn.onclick = () => {
      this.plugin.exportOpml();
    };

    // Import starred articles from Inoreader button
    const importStarredBtn = buttonRow.createEl("button", {
      cls: "feed-manager-import-starred-button",
    });
    setIcon(importStarredBtn, "star");
    importStarredBtn.createSpan({
      text: "Import starred articles from Inoreader",
    });
    importStarredBtn.onclick = () => {
      new ImportStarredModal(this.app, this.plugin, () => this.close()).open();
    };

    // Destructive actions row
    const destructiveButtonRow = contentEl.createDiv({
      cls: ["feed-manager-button-row", "feed-manager-button-row-secondary"],
    });

    // Delete All button
    const deleteAllBtn = destructiveButtonRow.createEl("button", {
      cls: "feed-manager-delete-all-button",
    });
    setIcon(deleteAllBtn, "trash-2");
    deleteAllBtn.createSpan({ text: "Delete all feeds" });
    deleteAllBtn.onclick = () => {
      if (this.plugin.settings.feeds.length === 0) {
        new Notice("There are no feeds to delete");
        return;
      }

      const confirmModal = new Modal(this.app);
      confirmModal.modalEl.addClass("rss-dashboard-confirm-modal");

      const { contentEl } = confirmModal;
      contentEl.empty();
      const imageCacheSizeBytes = this.plugin.getImageCacheSizeBytes();

      new Setting(contentEl).setName("Delete all feeds?").setHeading();
      contentEl.createEl("p", {
        text: `This will permanently remove all ${this.plugin.settings.feeds.length} feeds from RSS Dashboard. Your folder structure and plugin settings will remain intact.`,
      });
      if (imageCacheSizeBytes > 0) {
        contentEl.createEl("p", {
          text: `Cached preview images (${formatByteSize(imageCacheSizeBytes)}) will also be cleared.`,
        });
      }

      const buttonsSetting = new Setting(contentEl);
      buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
      buttonsSetting
        .addButton((btn) =>
          btn.setButtonText("Cancel").onClick(() => {
            confirmModal.close();
          }),
        )
        .addButton((btn) => {
          btn.setButtonText("Delete all feeds");
          settingsUiCompatibility.markDestructive(btn);
          btn.onClick(async () => {
              this.plugin.settings.feeds = [];
              await this.plugin.saveSettings();
              const cacheClearResult = await this.plugin.clearImageCache();
              
              const dashboardView = await this.plugin.getActiveDashboardView();
              if (dashboardView) {
                dashboardView.refresh();
              }

              this.close();
              confirmModal.close();
              if (cacheClearResult.failed > 0) {
                const failedLabel =
                  cacheClearResult.failed === 1
                    ? "1 cached image could not be removed."
                    : `${cacheClearResult.failed} cached images could not be removed.`;
                new Notice(`All feeds deleted, but ${failedLabel}`);
              } else if (imageCacheSizeBytes > 0) {
                new Notice("All feeds and cached preview images deleted.");
              } else {
                new Notice("All feeds deleted");
              }
          });
        });

      confirmModal.open();
    };

    // Delete feeds + folders button
    const deleteFeedsAndFoldersBtn = destructiveButtonRow.createEl("button", {
      cls: "feed-manager-delete-feeds-folders-button",
    });
    setIcon(deleteFeedsAndFoldersBtn, "trash-2");
    deleteFeedsAndFoldersBtn.createSpan({ text: "Delete feeds + folders" });
    deleteFeedsAndFoldersBtn.onclick = () => {
      const folderCount = countFoldersRecursively(this.plugin.settings.folders);
      if (this.plugin.settings.feeds.length === 0 && folderCount === 0) {
        new Notice("There are no feeds or folders to delete");
        return;
      }

      const confirmModal = new Modal(this.app);
      confirmModal.modalEl.addClass("rss-dashboard-confirm-modal");

      const { contentEl } = confirmModal;
      contentEl.empty();
      const imageCacheSizeBytes = this.plugin.getImageCacheSizeBytes();

      new Setting(contentEl).setName("Delete all feeds and folders?").setHeading();
      contentEl.createEl("p", {
        text: `This will permanently remove all ${this.plugin.settings.feeds.length} feeds and ${folderCount} folders from RSS Dashboard, resetting your sidebar to empty. Your other plugin settings will remain intact.`,
      });
      if (imageCacheSizeBytes > 0) {
        contentEl.createEl("p", {
          text: `Cached preview images (${formatByteSize(imageCacheSizeBytes)}) will also be cleared.`,
        });
      }

      const buttonsSetting = new Setting(contentEl);
      buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
      buttonsSetting
        .addButton((btn) =>
          btn.setButtonText("Cancel").onClick(() => {
            confirmModal.close();
          }),
        )
        .addButton((btn) => {
          btn.setButtonText("Delete feeds + folders");
          settingsUiCompatibility.markDestructive(btn);
          btn.onClick(async () => {
              this.plugin.settings.feeds = [];
              this.plugin.settings.folders = [];
              await this.plugin.saveSettings();
              const cacheClearResult = await this.plugin.clearImageCache();

              const dashboardView = await this.plugin.getActiveDashboardView();
              if (dashboardView) {
                dashboardView.refresh();
              }

              this.close();
              confirmModal.close();
              if (cacheClearResult.failed > 0) {
                const failedLabel =
                  cacheClearResult.failed === 1
                    ? "1 cached image could not be removed."
                    : `${cacheClearResult.failed} cached images could not be removed.`;
                new Notice(`All feeds and folders deleted, but ${failedLabel}`);
              } else if (imageCacheSizeBytes > 0) {
                new Notice("All feeds, folders, and cached preview images deleted.");
              } else {
                new Notice("All feeds and folders deleted");
              }
          });
        });

      confirmModal.open();
    };
  }

  onClose() {
    this.contentEl?.empty();
  }
}
