import { Modal, App, Setting, Notice } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import type { Tag } from "../../types/types";
import type { FolderExistingArticleAction } from "../../utils/folder-tag-sync";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { addTagMultiSelectControl } from "../../components/tag-multi-select-control";

export class FolderAutoTagModal extends Modal {
  plugin: RssDashboardPlugin;
  folderPath: string;
  selectedTagNames: string[];
  includeSubfolders: boolean = true;
  existingArticlesAction: FolderExistingArticleAction = "none";
  onSave: (
    tags: Tag[],
    includeSubfolders: boolean,
    existingArticlesAction: FolderExistingArticleAction,
  ) => Promise<void>;

  constructor(
    app: App,
    plugin: RssDashboardPlugin,
    folderPath: string,
    selectedTagNames: string[],
    onSave: (
      tags: Tag[],
      includeSubfolders: boolean,
      existingArticlesAction: FolderExistingArticleAction,
    ) => Promise<void>,
  ) {
    super(app);
    this.plugin = plugin;
    this.folderPath = folderPath;
    this.selectedTagNames = selectedTagNames;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.className +=
      " rss-dashboard-modal rss-dashboard-modal-container";

    if (shouldUseMobileSidebarLayout()) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
      const closeBtn = this.modalEl.querySelector(".modal-close-button");
      if (closeBtn) {
        closeBtn.remove();
      }
    }

    contentEl.empty();
    new Setting(contentEl).setName("Auto tag feeds in folder").setHeading();

    contentEl.createDiv({
      cls: "add-feed-subtitle",
      text: `Configure auto-tags for "${this.folderPath}". Feeds here and in descendant folders inherit these tags on future refreshes.`,
    });

    const autoTagSetting = new Setting(contentEl)
      .setName("Folder auto-tags")
      .setDesc(
        "Stored on this folder only. Child folders and feeds inherit parent tags automatically.",
      );

    addTagMultiSelectControl({
      setting: autoTagSetting,
      availableTags: this.plugin.settings.availableTags,
      selectedTagNames: this.selectedTagNames,
      triggerEmptyLabel: "None",
      menuTitle: "Select folder auto-tags",
      mobileSheetTitle: "Folder auto-tags",
      onChange: (selected) => {
        this.selectedTagNames = selected;
      },
    });

    new Setting(contentEl).setName("Options").setHeading();

    new Setting(contentEl)
      .setName("Include subfolders")
      .setDesc(
        "When updating existing articles, include articles in descendant folders.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.includeSubfolders).onChange((value) => {
          this.includeSubfolders = value;
        }),
      );

    new Setting(contentEl)
      .setName("Existing articles")
      .setDesc(
        "Choose how to update articles already in this folder. Future refreshes always follow the saved folder rule.",
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption("none", "Don't update")
          .addOption("sync", "Sync folder auto-tags")
          .addOption("remove_all", "Remove all tags")
          .setValue(this.existingArticlesAction)
          .onChange((value) => {
            this.existingArticlesAction =
              value as FolderExistingArticleAction;
          });
      });

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
      cls: "rss-dashboard-cancel-button",
    });
    cancelButton.addEventListener("click", () => this.close());

    const saveButton = buttonContainer.createEl("button", {
      text: "Save",
      cls: "rss-dashboard-primary-button",
    });

    saveButton.addEventListener("click", () => {
      const selectedTagObjects = this.plugin.settings.availableTags.filter(
        (tag) => this.selectedTagNames.includes(tag.name),
      );

      void (async () => {
        try {
          await this.onSave(
            selectedTagObjects,
            this.includeSubfolders,
            this.existingArticlesAction,
          );
          this.close();
        } catch (error) {
          console.error("Error applying folder auto-tags:", error);
          new Notice(
            `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      })();
    });
  }
}
