/**
 * Article Saving Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderArticleSavingSettingsTab(containerEl, plugin, onRefresh)
 */
import { Notice, Setting, normalizePath } from "obsidian";
import type { App } from "obsidian";
import { DEFAULT_SETTINGS, type SavedTemplate } from "../../types/types";
import { VaultFolderSuggest } from "../../components/folder-suggest";
import { SavedTemplateEditorModal } from "../modals/settings-modals";
import { settingsUiCompatibility } from "../settings-ui-compat";
import { renderTemplateVariableHelp } from "../template-variable-help";

export interface ArticleSavingPluginLike {
  app: App;
  settings: {
    articleSaving: {
      defaultFolder: string;
      addSavedTag: boolean;
      saveFullContent: boolean;
      fetchTimeout: number | undefined;
      defaultTemplate: string;
      savedTemplates?: SavedTemplate[] | undefined;
      globalDefaultTemplateId?: string;
    };
  };
  saveSettings: () => Promise<void>;
}

const defaultTemplateHint =
  "The built-in template. It is used when neither the feed nor the global default saved template sets one.";
const customTemplateHint =
  "Your custom template. It is used when neither the feed nor the global default saved template sets one. Frontmatter properties can start at the beginning of each line.";

function getArticleTemplateHint(template: string): string {
  return template === DEFAULT_SETTINGS.articleSaving.defaultTemplate
    ? defaultTemplateHint
    : customTemplateHint;
}

export function renderArticleSavingSettingsTab(
  containerEl: HTMLElement,
  plugin: ArticleSavingPluginLike,
  onRefresh: () => void,
): void {
  new Setting(containerEl)
    .setName("Save path")
    .setDesc(
      "Default folder to save articles. Leave it blank to save to the vault root.",
    )
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
    .setName("Add saved tag")
    .setDesc("Automatically add the saved tag to saved articles")
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
      "Choose what {{content}} saves: the fetched article when on, or the feed item's content when off. The feed item's content falls back to the feed description, then the summary. If fetching fails, that feed content is marked as a fallback. {{content}} controls placement in the template; {{summary}} keeps its existing output.",
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
        .onChange(async (value) => {
          plugin.settings.articleSaving.fetchTimeout = value;
          await plugin.saveSettings();
        });
      settingsUiCompatibility.presentSliderValue(
        slider,
        (value) => `${value} seconds`,
      );
    });

  // ── Default template ──────────────────────────────────────────────────────
  new Setting(containerEl).setName("Default template").setHeading();
  containerEl.createEl("p", {
    cls: "rss-dashboard-settings-note",
    text: "Article saves use a feed-assigned template first, then the global default saved template, then the standalone fallback below. Save full content and the saved tag remain global options.",
  });

  const templateContainer = containerEl.createDiv();

  const templateSetting = new Setting(templateContainer)
    .setName("Default article template")
    .setDesc(
      getArticleTemplateHint(plugin.settings.articleSaving.defaultTemplate),
    );

  const templateInput = templateContainer.createEl("textarea", {
    attr: { rows: "10" },
    cls: "rss-dashboard-template-input",
  });
  templateInput.value = plugin.settings.articleSaving.defaultTemplate;
  templateInput.addEventListener("change", () => {
    void (async () => {
      plugin.settings.articleSaving.defaultTemplate = templateInput.value;
      templateSetting.setDesc(getArticleTemplateHint(templateInput.value));
      await plugin.saveSettings();
    })();
  });

  templateContainer.appendChild(templateInput);

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
    templateSetting.setDesc(defaultTemplateHint);
    await plugin.saveSettings();
    new Notice("Template reset to default");
  };

  const saveAsTemplateBtn = templateBtnRow.createEl("button", {
    text: "Save as template",
    cls: "rss-dashboard-template-btn",
  });
  saveAsTemplateBtn.onclick = async () => {
    const modal = new SavedTemplateEditorModal(
      plugin.app,
      {
        name: "",
        template: plugin.settings.articleSaving.defaultTemplate,
        defaultFolder: "",
        filenamePattern: "",
        makeGlobalDefault: false,
      },
      plugin.settings.articleSaving.savedTemplates || [],
    );
    modal.open();
    const result = await modal.waitForClose();
    if (!result) return;
    const newTemplate: SavedTemplate = {
      id: `template-${Date.now()}`,
      name: result.name,
      template: result.template,
      defaultFolder: result.defaultFolder,
      filenamePattern: result.filenamePattern,
    };
    const savedTemplates = (plugin.settings.articleSaving.savedTemplates ??=
      []);
    savedTemplates.push(newTemplate);
    if (result.makeGlobalDefault) {
      plugin.settings.articleSaving.globalDefaultTemplateId = newTemplate.id;
    }
    await plugin.saveSettings();
    new Notice(`Template "${newTemplate.name}" saved`);
    onRefresh();
  };

  const helpText = containerEl.createDiv({
    cls: "setting-item-description rss-dashboard-template-help",
  });

  renderTemplateVariableHelp(helpText);

  // ── Saved templates ───────────────────────────────────────────────────────
  new Setting(containerEl).setName("Saved templates").setHeading();

  const savedTemplates = plugin.settings.articleSaving.savedTemplates || [];

  if (savedTemplates.length === 0) {
    containerEl.createEl("p", {
      text: "No saved templates yet. Save the current template using the button above.",
      cls: "rss-dashboard-settings-note rss-dashboard-no-saved-templates",
    });
  } else {
    const templatesContainer = containerEl.createDiv({
      cls: "rss-dashboard-saved-templates",
    });

    savedTemplates.forEach((template, index) => {
      new Setting(templatesContainer)
        .setName(template.name)
        .setDesc(
          template.id === plugin.settings.articleSaving.globalDefaultTemplateId
            ? "Global default"
            : "",
        )
        .addButton((button) =>
          button.setButtonText("Edit").onClick(async () => {
            const current =
              plugin.settings.articleSaving.savedTemplates?.[index];
            if (!current) return;
            const editor = new SavedTemplateEditorModal(
              plugin.app,
              {
                name: current.name,
                template: current.template,
                defaultFolder: current.defaultFolder || "",
                filenamePattern: current.filenamePattern || "",
                makeGlobalDefault:
                  current.id ===
                  plugin.settings.articleSaving.globalDefaultTemplateId,
              },
              plugin.settings.articleSaving.savedTemplates || [],
              current.id,
            );
            editor.open();
            const result = await editor.waitForClose();
            if (!result) return;
            current.name = result.name;
            current.template = result.template;
            current.defaultFolder = result.defaultFolder;
            current.filenamePattern = result.filenamePattern;
            if (result.makeGlobalDefault) {
              plugin.settings.articleSaving.globalDefaultTemplateId =
                current.id;
            } else if (
              plugin.settings.articleSaving.globalDefaultTemplateId ===
              current.id
            ) {
              plugin.settings.articleSaving.globalDefaultTemplateId = undefined;
            }
            await plugin.saveSettings();
            new Notice(`Template "${current.name}" updated`);
            onRefresh();
          }),
        )
        .addButton((button) =>
          button
            .setIcon("trash")
            .setTooltip("Delete this template")
            .onClick(async () => {
              const templates = plugin.settings.articleSaving.savedTemplates;
              if (!templates) return;
              const deleted = templates.splice(index, 1)[0];
              if (
                deleted?.id ===
                plugin.settings.articleSaving.globalDefaultTemplateId
              ) {
                plugin.settings.articleSaving.globalDefaultTemplateId =
                  undefined;
              }
              await plugin.saveSettings();
              new Notice(`Template "${template.name}" deleted`);
              onRefresh();
            }),
        );
    });
  }
}
