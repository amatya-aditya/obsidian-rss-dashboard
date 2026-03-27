/**
 * Import/Export Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderImportExportSettingsTab(containerEl, plugin)
 */
import { Notice, Setting } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { ImportOpmlModal } from "../../modals/import-opml-modal";
import { RssDashboardSettings } from "../../types/types";

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
          const input = document.body.createEl("input", {
            attr: { type: "file", accept: ".json,application/json" },
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
                new Notice("Data imported successfully!");
              } catch {
                new Notice("Invalid data.json file");
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

  // ── usersettings.json ─────────────────────────────────────────────────────
  const userSettingsSection = containerEl.createDiv();
  new Setting(userSettingsSection)
    .setName("User preferences file")
    .setDesc("Import or export plugin preferences.")
    .setHeading();

  const userSettingsActions = new Setting(userSettingsSection);
  userSettingsActions.settingEl.addClass(
    "rss-dashboard-import-export-actions",
  );
  userSettingsActions
    .addButton((button) =>
      button
        .setIcon("upload")
        .setButtonText("Import usersettings.json")
        .onClick(() => {
          plugin.importUserSettingsJson();
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
}
