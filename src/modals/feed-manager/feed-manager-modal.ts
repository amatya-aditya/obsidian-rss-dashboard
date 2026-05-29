import { Modal, App, Setting, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { ImportOpmlModal } from "../import-opml-modal";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { AddFeedModal } from "./add-feed-modal";

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
      // Implement delete all feeds logic here if needed
    };
  }

  onClose() {
    this.contentEl?.empty();
  }
}
