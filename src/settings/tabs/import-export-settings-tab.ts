/**
 * Import/Export Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderImportExportSettingsTab(containerEl, plugin)
 */
import { App, Modal, Notice, Setting } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { ImportOpmlModal } from "../../modals/import-opml-modal";
import { ImportSuccessModal } from "../../modals/import-success-modal";
import { AutoBackupSettings, RssDashboardSettings } from "../../types/types";

export class FactoryResetConfirmModal extends Modal {
  private confirmed = false;
  private resolvePromise: ((value: boolean) => void) | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    contentEl.createEl("h2", { text: "Factory reset?" });
    contentEl.createEl("p", {
      text: "This restores all plugin settings to their default values and clears your feeds, folders, tags, and plugin-managed local state.",
    });
    contentEl.createEl("p", {
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      text: "Existing backup files and saved article markdown files in your vault will not be deleted.",
    });

    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
    buttonsSetting
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.confirmed = false;
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Factory reset")
          .setWarning()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.resolvePromise?.(this.confirmed);
  }

  waitForClose(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

/**
 * Returns a fresh copy of the default auto-backup settings.
 */
export function buildDefaultAutoBackupSettings(): AutoBackupSettings {
  return {
    backupDataJson: false,
    backupOpml: true,
    backupUserdata: true,
  };
}

/**
 * Appends .backup to the provided filename.
 */
export function getBackupFilename(filename: string): string {
  return `${filename}.backup`;
}

export function renderImportExportSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
): void {
  // ── data.json ─────────────────────────────────────────────────────────────
  const dataSection = containerEl.createDiv();
  new Setting(dataSection)
    .setName("Backup & restore (data.json)")
    .setDesc(
      "Import or export your full dashboard dataset, including preferences, folders, feeds, and stored article retrievals.",
    )
    .setHeading();

  const dataActionsSetting = new Setting(dataSection);
  dataActionsSetting.settingEl.addClass("rss-dashboard-import-export-actions");
  dataActionsSetting
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import data.json")
        .onClick(() => {
          const input = activeDocument.body.createEl("input", {
            attr: { type: "file", accept: ".json,.backup,application/json" },
          });
          input.onchange = () => {
            void (async () => {
              const file = input.files?.[0];
              if (!file) return;
              const text = await file.text();
              try {
                const data = JSON.parse(text) as Partial<RssDashboardSettings>;
                plugin.settings = Object.assign({}, plugin.settings, data);
                await plugin.saveSettings();
                const view = await plugin.getActiveDashboardView();
                if (view) {
                  await plugin.app.workspace.revealLeaf(view.leaf);
                  view.render();
                }
                new ImportSuccessModal(
                  plugin.app,
                  "Data imported successfully! Your dashboard has been updated.",
                ).open();
              } catch {
                new Notice("Import failed: invalid or corrupted data file.");
              }
            })();
          };
          input.click();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("download")
        .setButtonText("Export data.json")
        .onClick(() => {
          void plugin.exportDataJson();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("copy")
        .setTooltip("Copy data.json to clipboard")
        .onClick(() => {
          void plugin.copyDataJsonToClipboard();
        }),
    );

  // ── Shard Data ────────────────────────────────────────────────────────────
  const portableBundleSection = containerEl.createDiv();
  new Setting(portableBundleSection)
    .setName("Shard data")
    .setDesc("Import or export shard data bundles for cross-device migration.")
    .setHeading();

  const portableBundleActions = new Setting(portableBundleSection);
  portableBundleActions.settingEl.addClass(
    "rss-dashboard-import-export-actions",
  );
  portableBundleActions
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import shard data")
        .onClick(() => {
          const input = activeDocument.body.createEl("input", {
            attr: { type: "file", accept: ".json,.backup,application/json" },
          });
          input.onchange = () => {
            void (async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                await plugin.importPortableDataBundleFromFile(file);
                new ImportSuccessModal(
                  plugin.app,
                  "Shard data imported successfully!",
                ).open();
              } catch (e) {
                new Notice(
                  `Shard data import failed: ${e instanceof Error ? e.message : "invalid file"}`,
                );
              }
            })();
          };
          input.click();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("download")
        .setButtonText("Export shard data")
        .onClick(() => {
          void plugin.exportPortableDataBundle();
        }),
    );

  // ── usersettings.json ─────────────────────────────────────────────────────
  const userSettingsSection = containerEl.createDiv();
  new Setting(userSettingsSection)
    .setName("User preferences file")
    .setDesc("Import or export plugin preferences.")
    .setHeading();

  const userSettingsActions = new Setting(userSettingsSection);
  userSettingsActions.settingEl.addClass("rss-dashboard-import-export-actions");
  userSettingsActions
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import usersettings.json")
        .onClick(() => {
          const input = activeDocument.body.createEl("input", {
            attr: { type: "file", accept: ".json,.backup,application/json" },
          });
          input.onchange = () => {
            void (async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                await plugin.importUserSettingsJsonFromFile(file);
                new ImportSuccessModal(
                  plugin.app,
                  "User preferences imported successfully!",
                ).open();
              } catch (e) {
                new Notice(
                  `Import failed: ${e instanceof Error ? e.message : "invalid file"}`,
                );
              }
            })();
          };
          input.click();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("download")
        .setButtonText("Export usersettings.json")
        .onClick(() => {
          void plugin.exportUserSettingsJson();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("copy")
        .setTooltip("Copy usersettings.json to clipboard")
        .onClick(() => {
          void plugin.copyUserSettingsJsonToClipboard();
        }),
    );

  // ── OPML ──────────────────────────────────────────────────────────────────
  const opmlSection = containerEl.createDiv();
  new Setting(opmlSection)
    .setName("OPML")
    .setDesc(
      "Import or export an opml subscription list containing your configured feed addresses.",
    )
    .setHeading();

  const opmlActionsSetting = new Setting(opmlSection);
  opmlActionsSetting.settingEl.addClass("rss-dashboard-import-export-actions");
  opmlActionsSetting
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import opml")
        .onClick(() => {
          new ImportOpmlModal(plugin.app, plugin).open();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("download")
        .setButtonText("Export opml")
        .onClick(() => plugin.exportOpml()),
    )
    .addButton((button) =>
      button
        .setIcon("copy")
        .setTooltip("Copy feeds.opml to clipboard")
        .onClick(() => {
          void plugin.copyOpmlToClipboard();
        }),
    );

  // ── Auto Backups ──────────────────────────────────────────────────────────
  const backupSection = containerEl.createDiv();
  new Setting(backupSection)
    .setName("Auto backups")
    .setDesc(
      "Automatically create backup copies of your data files when the plugin closes.",
    )
    .setHeading();

  new Setting(backupSection)
    .setName("Back up data.json")
    .setDesc("Saves a copy to data.json.backup in the plugin folder.")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.autoBackup.backupDataJson)
        .onChange(async (value) => {
          plugin.settings.autoBackup.backupDataJson = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(backupSection)
    .setName("Back up feeds")
    .setDesc("Saves a copy to feeds.opml.backup in the plugin folder.")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.autoBackup.backupOpml)
        .onChange(async (value) => {
          plugin.settings.autoBackup.backupOpml = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(backupSection)
    .setName("Back up user preferences (userdata.json)")
    .setDesc("Saves a copy to userdata.json.backup in the plugin folder.")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.autoBackup.backupUserdata)
        .onChange(async (value) => {
          plugin.settings.autoBackup.backupUserdata = value;
          await plugin.saveSettings();
        }),
    );

  // ── Factory Reset ─────────────────────────────────────────────────────────
  const factoryResetSection = containerEl.createDiv();
  new Setting(factoryResetSection)
    .setName("Factory reset")
    .setDesc(
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      "Restore all plugin settings to their default values and clear plugin-managed data. Existing backup files and saved article markdown files are left untouched.",
    )
    .setHeading();

  const factoryResetActions = new Setting(factoryResetSection);
  factoryResetActions.settingEl.addClass("rss-dashboard-import-export-actions");
  factoryResetActions.addButton((button) =>
    button
      .setIcon("rotate-ccw")
      .setButtonText("Factory reset")
      .setWarning()
      .onClick(() => {
        void (async () => {
          const confirmModal = new FactoryResetConfirmModal(plugin.app);
          confirmModal.open();
          const shouldReset = await confirmModal.waitForClose();
          if (!shouldReset) {
            return;
          }

          await plugin.performFactoryReset();
        })();
      }),
  );
}
