import { Modal, App, Setting, Notice } from "obsidian";
import type RssDashboardPlugin from "../../main";
import {
  DEPRECATION_TRIGGER_RELEASE,
  canDeferByVersion,
  describeStorageMode,
  nextMinorVersion,
} from "../utils/storage-deprecation-prompt";

/**
 * Shown on load while the vault is still on a deprecated feed storage mode.
 *
 * "Skip this version" is withdrawn once the deferral cap is reached, so the
 * prompt can always be postponed to the next load but can never be silenced
 * for good ahead of a cutoff the user would otherwise meet as breakage.
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

    new Setting(contentEl).setName("Storage mode is being retired").setHeading();

    const modeLabel = describeStorageMode(this.plugin.settings.storageMode);

    contentEl.createEl("p", {
      text: `Your feed history is stored using ${modeLabel}, which is being retired. When ${DEPRECATION_TRIGGER_RELEASE} ships, this storage mode will stop saving changes: feeds will no longer refresh, and read state, stars, tags, and saved articles will no longer be recorded.`,
      cls: "rss-dashboard-modal-message",
    });

    contentEl.createEl("p", {
      text: "Upgrading to shard storage v2 keeps everything you already have, and a backup is taken first. You can still upgrade after the cutoff, but the plugin will be read-only until you do.",
      cls: "rss-dashboard-modal-message",
    });

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const deferrals = this.plugin.settings.storageMigrationDeferralCount ?? 0;
    let skipButton: HTMLButtonElement | null = null;

    if (canDeferByVersion(deferrals)) {
      skipButton = buttonContainer.createEl("button", {
        text: "Skip this version",
      });
      skipButton.onclick = async () => {
        this.plugin.settings.storageMigrationDismissedUntil = nextMinorVersion(
          this.plugin.manifest.version,
        );
        this.plugin.settings.storageMigrationDeferralCount = deferrals + 1;
        await this.plugin.saveSettings();
        this.close();
      };
    }

    const laterButton = buttonContainer.createEl("button", {
      text: "Remind me later",
    });
    laterButton.onclick = () => {
      this.close();
    };

    const upgradeButton = buttonContainer.createEl("button", {
      text: "Upgrade now (recommended)",
      cls: "mod-cta",
    });
    upgradeButton.onclick = async () => {
      upgradeButton.disabled = true;
      laterButton.disabled = true;
      if (skipButton) {
        skipButton.disabled = true;
      }
      upgradeButton.textContent = "Upgrading...";

      try {
        await this.plugin.backupAndMigrateStorageToV2();
        new Notice("Successfully migrated to shard storage v2.");
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
