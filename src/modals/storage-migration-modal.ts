import { Modal, App, Setting, Notice } from "obsidian";
import type RssDashboardPlugin from "../../main";

/**
 * Shown on every plugin load when the user's storage mode is not vault-shards-v2
 * and they have not permanently dismissed the prompt.
 *
 * Buttons:
 *  - "Upgrade Now" — backs up data, migrates to v2, sets dismissed flag
 *  - "Remind Me Later" — closes with no flag change (shows again next load)
 *  - "Never Show Again" — sets dismissed flag permanently, no migration
 */
export class StorageMigrationModal extends Modal {
  private plugin: RssDashboardPlugin;

  constructor(app: App, plugin: RssDashboardPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    new Setting(contentEl)
      .setName("Storage mode upgrade available")
      .setHeading();

    contentEl.createEl("p", {
      text: `Your RSS Dashboard is using an older storage mode (${this.plugin.settings.storageMode}). Upgrading to Vault Shards V2 offers better performance and more reliable sync across devices.`,
      cls: "rss-dashboard-modal-message",
    });

    contentEl.createEl("p", {
      text: "Upgrading will automatically create a backup of your data first.",
      cls: "rss-dashboard-modal-message",
    });

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    // "Never Show Again" — leftmost, lowest priority
    const neverButton = buttonContainer.createEl("button", {
      text: "Never show again",
    });
    neverButton.onclick = async () => {
      this.plugin.settings.storageMigrationDismissedPermanently = true;
      await this.plugin.saveSettings();
      this.close();
    };

    // "Remind Me Later" — middle, stateless dismiss
    const laterButton = buttonContainer.createEl("button", {
      text: "Remind me later",
    });
    laterButton.onclick = () => {
      // No flag set — modal will appear again next plugin load
      this.close();
    };

    // "Upgrade Now" — rightmost CTA
    const upgradeButton = buttonContainer.createEl("button", {
      text: "Upgrade now (recommended)",
      cls: "mod-cta",
    });
    upgradeButton.onclick = async () => {
      upgradeButton.disabled = true;
      laterButton.disabled = true;
      neverButton.disabled = true;
      upgradeButton.textContent = "Upgrading...";

      try {
        await this.plugin.backupAndMigrateStorageToV2();
        new Notice("Successfully migrated to vault shards v2.");
      } catch (error) {
        console.error("Migration failed:", error);
        new Notice("Migration failed. Check the console for details.");
      } finally {
        this.close();
      }
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
