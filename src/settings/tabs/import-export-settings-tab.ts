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
import { ImportStarredModal } from "../../modals/import-starred-modal";
import { ImportSuccessModal } from "../../modals/import-success-modal";
import { AutoBackupSettings, RssDashboardSettings } from "../../types/types";
import { settingsUiCompatibility } from "../settings-ui-compat";

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
      text: "This restores all plugin settings to their default values and removes your feeds, restores folders and tags to their defaults, and clears plugin-managed local state.",
    });
    contentEl.createEl("p", {
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
      .addButton((btn) => {
        btn.setButtonText("Factory reset");
        settingsUiCompatibility.markDestructive(btn);
        btn.onClick(() => {
          this.confirmed = true;
          this.close();
        });
      });
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
      'Import or export your full dashboard dataset as a single flat JSON file, including preferences, folders, feeds, and stored article retrievals. This is always the full legacy-format file, even when Shard storage is enabled — it will not match the small pointer file named data.json in your vault in that mode. Use "Portable data bundle" below for a bundle that matches shard storage.',
    )
    .setHeading();

  const dataActionsSetting = new Setting(dataSection);
  dataActionsSetting.settingEl.addClass("rss-dashboard-import-export-actions");
  dataActionsSetting
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import legacy data.json")
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
                // The imported file replaces the feed list, so feeds it lacks
                // keep their article state rather than counting as removed
                // (issue #374).
                await plugin.saveSettings({ replacesFeedList: true });
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
        .setButtonText("Export legacy data.json")
        .onClick(() => {
          void plugin.exportDataJson();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("copy")
        .setTooltip("Copy legacy data.json to clipboard")
        .onClick(() => {
          void plugin.copyDataJsonToClipboard();
        }),
    );

  // ── Portable data bundle ────────────────────────────────────────────────────────────
  const portableBundleSection = containerEl.createDiv();
  new Setting(portableBundleSection)
    .setName("Portable data bundle")
    .setDesc(
      "Import or export a portable data bundle (a feed bundle and a settings bundle together) for cross-device migration. Exports as rss-dashboard-portable-bundle.json",
    )
    .setHeading();

  const portableBundleActions = new Setting(portableBundleSection);
  portableBundleActions.settingEl.addClass(
    "rss-dashboard-import-export-actions",
  );
  portableBundleActions
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import portable data bundle")
        .onClick(() => {
          const input = activeDocument.body.createEl("input", {
            attr: { type: "file", accept: ".json,.backup,application/json" },
          });
          input.onchange = () => {
            void (async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                const result =
                  await plugin.importPortableDataBundleFromFile(file);
                if (result !== "committed") return;
                new ImportSuccessModal(
                  plugin.app,
                  "Portable data bundle imported successfully!",
                ).open();
              } catch (e) {
                new Notice(
                  `Portable data bundle import failed: ${e instanceof Error ? e.message : "invalid file"}`,
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
        .setButtonText("Export portable data bundle")
        .onClick(() => {
          void plugin.exportPortableDataBundle();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("copy")
        .setTooltip("Copy portable data bundle to clipboard")
        .onClick(() => {
          void plugin.copyPortableDataBundleToClipboard();
        }),
    );

  // ── Feed bundle ───────────────────────────────────────────────────────────
  const feedBundleSection = containerEl.createDiv();
  new Setting(feedBundleSection)
    .setName("Feed bundle")
    .setDesc(
      "Import or export feeds, folders, tags, articles, and article state — no app settings. Exports as rss-dashboard-feed-bundle.json",
    )
    .setHeading();

  const feedBundleActions = new Setting(feedBundleSection);
  feedBundleActions.settingEl.addClass("rss-dashboard-import-export-actions");
  feedBundleActions
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import feed bundle")
        .onClick(() => {
          const input = activeDocument.body.createEl("input", {
            attr: { type: "file", accept: ".json,.backup,application/json" },
          });
          input.onchange = () => {
            void (async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                const result = await plugin.importFeedBundleFromFile(file);
                if (result !== "committed") return;
                new ImportSuccessModal(
                  plugin.app,
                  "Feed bundle imported successfully!",
                ).open();
              } catch (e) {
                new Notice(
                  `Feed bundle import failed: ${e instanceof Error ? e.message : "invalid file"}`,
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
        .setButtonText("Export feed bundle")
        .onClick(() => {
          void plugin.exportFeedBundle();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("copy")
        .setTooltip("Copy feed bundle to clipboard")
        .onClick(() => {
          void plugin.copyFeedBundleToClipboard();
        }),
    );

  // ── Settings bundle ───────────────────────────────────────────────────────
  const settingsBundleSection = containerEl.createDiv();
  new Setting(settingsBundleSection)
    .setName("Settings bundle")
    .setDesc(
      "Import or export app preferences, including storage settings — no feeds, folders, tags, or articles. Exports as rss-dashboard-settings-bundle.json",
    )
    .setHeading();

  const settingsBundleActions = new Setting(settingsBundleSection);
  settingsBundleActions.settingEl.addClass(
    "rss-dashboard-import-export-actions",
  );
  settingsBundleActions
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import settings bundle")
        .onClick(() => {
          const input = activeDocument.body.createEl("input", {
            attr: { type: "file", accept: ".json,.backup,application/json" },
          });
          input.onchange = () => {
            void (async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                const result = await plugin.importSettingsBundleFromFile(file);
                if (result !== "committed") return;
                new ImportSuccessModal(
                  plugin.app,
                  "Settings bundle imported successfully!",
                ).open();
              } catch (e) {
                new Notice(
                  `Settings bundle import failed: ${e instanceof Error ? e.message : "invalid file"}`,
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
        .setButtonText("Export settings bundle")
        .onClick(() => {
          void plugin.exportSettingsBundle();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("copy")
        .setTooltip("Copy settings bundle to clipboard")
        .onClick(() => {
          void plugin.copySettingsBundleToClipboard();
        }),
    );

  // ── rss-dashboard-user-preferences.json ──────────────────────────────────────────────────
  const userSettingsSection = containerEl.createDiv();
  new Setting(userSettingsSection)
    .setName("User preferences file")
    .setDesc(
      "Import or export plugin preferences. Exports as rss-dashboard-user-preferences.json",
    )
    .setHeading();

  const userSettingsActions = new Setting(userSettingsSection);
  userSettingsActions.settingEl.addClass("rss-dashboard-import-export-actions");
  userSettingsActions
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import user preferences")
        .onClick(() => {
          const input = activeDocument.body.createEl("input", {
            attr: { type: "file", accept: ".json,.backup,application/json" },
          });
          input.onchange = () => {
            void (async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                const result =
                  await plugin.importUserSettingsJsonFromFile(file);
                if (result !== "committed") return;
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
        .setButtonText("Export user preferences")
        .onClick(() => {
          void plugin.exportUserSettingsJson();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("copy")
        .setTooltip("Copy user preferences to clipboard")
        .onClick(() => {
          void plugin.copyUserSettingsJsonToClipboard();
        }),
    );

  // ── OPML ──────────────────────────────────────────────────────────────────
  const opmlSection = containerEl.createDiv();
  new Setting(opmlSection)
    .setName("OPML")
    .setDesc(
      "Import or export an OPML subscription list containing your configured feed addresses. Import offers update, which adds new feeds, and replace, which replaces all feeds and folders with the file's.",
    )
    .setHeading();

  const opmlActionsSetting = new Setting(opmlSection);
  opmlActionsSetting.settingEl.addClass("rss-dashboard-import-export-actions");
  opmlActionsSetting
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import OPML/XML")
        .onClick(() => {
          new ImportOpmlModal(plugin.app, plugin).open();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("download")
        .setButtonText("Export OPML")
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

  // ── Starred imports ──────────────────────────────────────────────────────
  const starredSection = containerEl.createDiv();
  new Setting(starredSection)
    .setName("Starred imports")
    .setDesc(
      "Import starred articles from a Google Reader-compatible starred.json export. Feeds you don't already subscribe to are created in the New-feed folder (default: Starred imports). Import labels as tags is on by default.",
    )
    .setHeading();

  const starredActionsSetting = new Setting(starredSection);
  starredActionsSetting.settingEl.addClass(
    "rss-dashboard-import-export-actions",
  );
  starredActionsSetting.addButton((button) =>
    button
      .setIcon("star")
      .setButtonText("Import starred articles")
      .onClick(() => {
        new ImportStarredModal(plugin.app, plugin).open();
      }),
  );

  // ── Auto Backups ──────────────────────────────────────────────────────────
  const backupSection = containerEl.createDiv();
  new Setting(backupSection)
    .setName("Automatic backups")
    .setDesc(
      "Automatic backup copies of your data files. A backup is written on the first meaningful change in each session, again when the plugin unloads only if later changes made it stale, and before a storage migration to v2.",
    )
    .setHeading();

  new Setting(backupSection)
    .setName("Back up data.json")
    .setDesc(
      "Saves a copy to data.json.backup beside data.json: in the plugin folder, or in the metadata folder when a metadata location is set.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.autoBackup.backupDataJson)
        .onChange(async (value) => {
          plugin.settings.autoBackup.backupDataJson = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(backupSection)
    .setName("Back up feeds (feeds.opml)")
    .setDesc("Saves a copy to feeds.opml.backup in the plugin folder.")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.autoBackup.backupOpml)
        .onChange(async (value) => {
          plugin.settings.autoBackup.backupOpml = value;
          await plugin.saveSettings();
        }),
    );

  const userPrefsBackupSetting = new Setting(backupSection)
    .setName("Back up user preferences")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.autoBackup.backupUserdata)
        .onChange(async (value) => {
          plugin.settings.autoBackup.backupUserdata = value;
          await plugin.saveSettings();
        }),
    );
  // The file name is set on descEl directly: the sentence-case rule would
  // otherwise capitalize the "rss" in it.
  userPrefsBackupSetting.descEl.createSpan({
    text: "Saves a copy to rss-dashboard-user-preferences.json.backup in the plugin folder.",
  });

  // ── Factory Reset ─────────────────────────────────────────────────────────
  const factoryResetSection = containerEl.createDiv();
  new Setting(factoryResetSection)
    .setName("Factory reset")
    .setDesc(
      "Restore all plugin settings to their default values, remove your feeds, reset folders and tags to their defaults, and clear plugin-managed data. Existing backup files and saved article markdown files are left untouched.",
    )
    .setHeading();

  const factoryResetActions = new Setting(factoryResetSection);
  factoryResetActions.settingEl.addClass("rss-dashboard-import-export-actions");
  factoryResetActions.addButton((button) => {
    button.setIcon("rotate-ccw").setButtonText("Factory reset");
    settingsUiCompatibility.markDestructive(button);
    button.onClick(() => {
      void (async () => {
        const confirmModal = new FactoryResetConfirmModal(plugin.app);
        confirmModal.open();
        const shouldReset = await confirmModal.waitForClose();
        if (!shouldReset) {
          return;
        }

        await plugin.performFactoryReset();
      })();
    });
  });
}
