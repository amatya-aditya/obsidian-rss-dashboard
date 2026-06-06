import { Modal, App, Setting, setIcon, Notice } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { ImportOpmlModal } from "../import-opml-modal";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { AddFeedModal, type AddFeedRequest } from "./add-feed-modal";

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
      " rss-dashboard-modal rss-dashboard-modal-container";
    if (isMobile) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
    }

    contentEl.empty();

    new Setting(contentEl).setName("Manage feeds").setHeading();

    // Single button row for all four actions
    const buttonRow = contentEl.createDiv({
      cls: "feed-manager-button-row",
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
    importOpmlBtn.createSpan({ text: " Import OPML" });
    importOpmlBtn.onclick = () => {
      new ImportOpmlModal(this.app, this.plugin, () => this.close()).open();
    };

    // Export OPML button
    const exportOpmlBtn = buttonRow.createEl("button", {
      cls: "feed-manager-export-button",
    });
    setIcon(exportOpmlBtn, "download");
    exportOpmlBtn.createSpan({ text: " Export OPML" });
    exportOpmlBtn.onclick = () => {
      this.plugin.exportOpml();
    };

    // Delete All button
    const deleteAllBtn = buttonRow.createEl("button", {
      cls: "feed-manager-delete-all-button",
    });
    setIcon(deleteAllBtn, "trash-2");
    deleteAllBtn.createSpan({ text: " Delete all feeds" });
    deleteAllBtn.onclick = () => {
      if (this.plugin.settings.feeds.length === 0) {
        new Notice("There are no feeds to delete");
        return;
      }

      const confirmModal = new Modal(this.app);
      confirmModal.modalEl.addClass("rss-dashboard-confirm-modal");

      const { contentEl } = confirmModal;
      contentEl.empty();

      new Setting(contentEl).setName("Delete all feeds?").setHeading();
      contentEl.createEl("p", {
        text: `This will permanently remove all ${this.plugin.settings.feeds.length} feeds from RSS Dashboard. Your folder structure and plugin settings will remain intact.`,
      });

      const buttonsSetting = new Setting(contentEl);
      buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
      buttonsSetting
        .addButton((btn) =>
          btn.setButtonText("Cancel").onClick(() => {
            confirmModal.close();
          }),
        )
        .addButton((btn) =>
          btn
            .setButtonText("Delete all feeds")
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.feeds = [];
              await this.plugin.saveSettings();
              this.close();
              confirmModal.close();
              new Notice("All feeds deleted");
            }),
        );

      confirmModal.open();
    };
  }

  onClose() {
    this.contentEl?.empty();
  }
}
