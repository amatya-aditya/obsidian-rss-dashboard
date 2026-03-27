/**
 * Article Saving Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderArticleSavingSettingsTab(containerEl, plugin, onRefresh)
 */
import { Notice, Setting, normalizePath } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS, SavedTemplate } from "../../types/types";
import { VaultFolderSuggest } from "../../components/folder-suggest";
import { TemplateNameModal } from "../modals/settings-modals";

export function renderArticleSavingSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
): void {
  new Setting(containerEl)
    .setName("Save path")
    .setDesc("Default folder to save articles")
    .addText((text) => {
      text
        .setValue(plugin.settings.articleSaving.defaultFolder)
        .onChange(async (value) => {
          plugin.settings.articleSaving.defaultFolder = normalizePath(value);
          await plugin.saveSettings();
        });
      new VaultFolderSuggest(plugin.app, text.inputEl);
    });

  new Setting(containerEl)
    .setName("Add 'saved' tag")
    .setDesc("Automatically add a 'saved' tag to saved articles")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.articleSaving.addSavedTag)
        .onChange(async (value) => {
          plugin.settings.articleSaving.addSavedTag = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Save full content")
    .setDesc(
      "Fetch and save the full article content from the web (instead of just the RSS summary)",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.articleSaving.saveFullContent)
        .onChange(async (value) => {
          plugin.settings.articleSaving.saveFullContent = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Fetch timeout")
    .setDesc(
      "Timeout in seconds for fetching full article content (prevents hanging)",
    )
    .addSlider((slider) => {
      slider
        .setLimits(5, 30, 1)
        .setValue(plugin.settings.articleSaving.fetchTimeout || 10)
        .setDynamicTooltip()
        .onChange(async (value) => {
          plugin.settings.articleSaving.fetchTimeout = value;
          await plugin.saveSettings();
        });
    });

  // ── Default template ──────────────────────────────────────────────────────
  new Setting(containerEl).setName("Default template").setHeading();

  const templateContainer = containerEl.createDiv();

  new Setting(templateContainer)
    .setName("Default article template")
    .setDesc(
      "Template for saved articles. Use variables like {{title}}, {{content}}, {{link}}, etc.",
    );

  const templateInput = templateContainer.createEl("textarea", {
    attr: { rows: "10" },
    cls: "rss-dashboard-template-input",
  });
  templateInput.value = plugin.settings.articleSaving.defaultTemplate;
  templateInput.addEventListener("change", () => {
    void (async () => {
      plugin.settings.articleSaving.defaultTemplate = templateInput.value;
      await plugin.saveSettings();
    })();
  });

  templateContainer.appendChild(templateInput);

  containerEl.createEl("div", {
    cls: "setting-item-description",
    text: "Available variables: {{title}}, {{content}}, {{link}}, {{date}}, {{isoDate}}, {{source}}, {{author}}, {{summary}}, {{tags}}, {{feedTitle}}, {{guid}}",
  });

  const templateBtnRow = containerEl.createDiv({
    cls: "rss-dashboard-template-btn-row",
  });

  const resetBtn = templateBtnRow.createEl("button", {
    text: "Reset to default",
    cls: "rss-dashboard-template-btn",
  });
  resetBtn.onclick = async () => {
    templateInput.value = DEFAULT_SETTINGS.articleSaving.defaultTemplate;
    plugin.settings.articleSaving.defaultTemplate =
      DEFAULT_SETTINGS.articleSaving.defaultTemplate;
    await plugin.saveSettings();
    new Notice("Template reset to default");
  };

  const saveAsTemplateBtn = templateBtnRow.createEl("button", {
    text: "Save as template",
    cls: "rss-dashboard-template-btn",
  });
  saveAsTemplateBtn.onclick = async () => {
    const modal = new TemplateNameModal(plugin.app);
    modal.open();
    const name = await modal.waitForClose();
    if (name) {
      const newTemplate: SavedTemplate = {
        id: `template-${Date.now()}`,
        name,
        template: plugin.settings.articleSaving.defaultTemplate,
      };
      if (!plugin.settings.articleSaving.savedTemplates) {
        plugin.settings.articleSaving.savedTemplates = [];
      }
      plugin.settings.articleSaving.savedTemplates.push(newTemplate);
      await plugin.saveSettings();
      new Notice(`Template "${name}" saved`);
      onRefresh();
    }
  };

  // ── Saved templates ───────────────────────────────────────────────────────
  new Setting(containerEl).setName("Saved templates").setHeading();

  const savedTemplates = plugin.settings.articleSaving.savedTemplates || [];

  if (savedTemplates.length === 0) {
    containerEl.createEl("p", {
      text: "No saved templates yet. Save the current template using the button above.",
      cls: "rss-dashboard-settings-note",
    });
  } else {
    const templatesContainer = containerEl.createDiv({
      cls: "rss-dashboard-saved-templates",
    });

    savedTemplates.forEach((template, index) => {
      new Setting(templatesContainer)
        .setName(template.name)
        .addButton((button) =>
          button
            .setButtonText("Load")
            .setTooltip("Load this template into the editor")
            .onClick(async () => {
              templateInput.value = template.template;
              plugin.settings.articleSaving.defaultTemplate = template.template;
              await plugin.saveSettings();
              new Notice(`Template "${template.name}" loaded`);
            }),
        )
        .addButton((button) =>
          button
            .setButtonText("Update")
            .setTooltip("Update this template with current editor content")
            .onClick(async () => {
              plugin.settings.articleSaving.savedTemplates[index].template =
                plugin.settings.articleSaving.defaultTemplate;
              await plugin.saveSettings();
              new Notice(`Template "${template.name}" updated`);
            }),
        )
        .addButton((button) =>
          button
            .setIcon("trash")
            .setTooltip("Delete this template")
            .onClick(async () => {
              plugin.settings.articleSaving.savedTemplates.splice(index, 1);
              await plugin.saveSettings();
              new Notice(`Template "${template.name}" deleted`);
              onRefresh();
            }),
        );
    });
  }
}
