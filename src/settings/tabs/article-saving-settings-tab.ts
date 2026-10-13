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
import {
  ConfirmActionModal,
  SavedTemplateEditorModal,
} from "../modals/settings-modals";
import { clearTemplateAssignments } from "../../utils/saved-template-utils";
import { settingsUiCompatibility } from "../settings-ui-compat";
import { addActionButtonContent } from "../../utils/action-button-content";
import { renderTemplateVariableHelp } from "../template-variable-help";
import { addInputClearButton } from "../../utils/input-clear-button";

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
    feeds: { url: string; customTemplate?: string }[];
  };
  saveSettings: () => Promise<void>;
}

const MINIMAL_TEMPLATE = "{{content}}";

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
      addInputClearButton(text.inputEl, { label: "Clear folder" });
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

  renderDefaultTemplateSection(containerEl, plugin, onRefresh);

  renderSavedTemplatesList(containerEl, plugin, onRefresh);
}

function renderDefaultTemplateSection(
  containerEl: HTMLElement,
  plugin: ArticleSavingPluginLike,
  onRefresh: () => void,
): void {
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
  const articleSaving = plugin.settings.articleSaving;
  const shippedTemplate = DEFAULT_SETTINGS.articleSaving.defaultTemplate;

  const resolveGlobalDefaultName = (): string | undefined => {
    const id = articleSaving.globalDefaultTemplateId;
    if (!id) return undefined;
    return (articleSaving.savedTemplates ?? []).find(
      (template) => template.id === id,
    )?.name;
  };

  const templateStatusEl = templateContainer.createDiv({
    cls: "rss-dashboard-template-status",
    attr: { role: "status", "aria-live": "polite" },
  });

  const templateBtnRow = containerEl.createDiv({
    cls: "rss-dashboard-template-btn-row",
  });

  const createTemplateButton = (
    iconName: string,
    label: string,
  ): HTMLButtonElement => {
    const button = templateBtnRow.createEl("button", {
      cls: "rss-dashboard-template-btn",
    });
    addActionButtonContent(button, iconName, label);
    return button;
  };

  const useAsDefaultBtn = createTemplateButton(
    "circle-check-big",
    "Use as default",
  );
  const saveAsTemplateBtn = createTemplateButton("save", "Save as template");
  const resetBtn = createTemplateButton("rotate-ccw", "Reset");
  const clearBtn = createTemplateButton("eraser", "Clear");

  const syncTemplateState = (): void => {
    const globalName = resolveGlobalDefaultName();
    templateStatusEl.setText(
      `Default saves use: ${globalName ?? "the template above"}`,
    );
    // Use as default stays focusable and bright while the box is already the
    // default: `aria-disabled` plus the state class, never native `disabled`.
    const boxIsDefault = globalName === undefined;
    useAsDefaultBtn.toggleClass("is-default", boxIsDefault);
    if (boxIsDefault) useAsDefaultBtn.setAttribute("aria-disabled", "true");
    else useAsDefaultBtn.removeAttribute("aria-disabled");
    const nextDisabled = new Map<HTMLButtonElement, boolean>([
      [resetBtn, templateInput.value === shippedTemplate],
      [clearBtn, templateInput.value === MINIMAL_TEMPLATE],
    ]);
    // A focused button that disables itself drops keyboard focus to the page
    // body (Chromium blurs it the moment `disabled` is set), so hand focus to
    // the one button that is never a no-op first. Ask each button's own
    // document: the settings window is another window, so the active document
    // can differ and `instanceof` fails across realms.
    const losesFocus = [...nextDisabled].some(
      ([button, disabled]) =>
        disabled && button.ownerDocument.activeElement === button,
    );
    if (losesFocus) saveAsTemplateBtn.focus();
    nextDisabled.forEach((disabled, button) => {
      button.disabled = disabled;
    });
    templateSetting.setDesc(getArticleTemplateHint(templateInput.value));
  };
  syncTemplateState();

  templateInput.addEventListener("change", () => {
    void (async () => {
      articleSaving.defaultTemplate = templateInput.value;
      syncTemplateState();
      await plugin.saveSettings();
    })();
  });

  useAsDefaultBtn.onclick = () => {
    if (useAsDefaultBtn.getAttribute("aria-disabled") === "true") return;
    void (async () => {
      articleSaving.globalDefaultTemplateId = undefined;
      syncTemplateState();
      await plugin.saveSettings();
    })();
  };

  const confirmThenSetBox = async (
    options: {
      title: string;
      message: string;
      confirmLabel: string;
    },
    nextTemplate: string,
    notice: string,
  ): Promise<void> => {
    const confirm = new ConfirmActionModal(plugin.app, options);
    confirm.open();
    const shouldApply = await confirm.waitForClose();
    if (!shouldApply) return;
    templateInput.value = nextTemplate;
    articleSaving.defaultTemplate = nextTemplate;
    syncTemplateState();
    await plugin.saveSettings();
    new Notice(notice);
  };

  resetBtn.onclick = () => {
    void confirmThenSetBox(
      {
        title: "Reset template?",
        message:
          "This replaces the default article template with the built-in template. Saved templates are not changed.",
        confirmLabel: "Reset",
      },
      shippedTemplate,
      "Template reset to default",
    );
  };

  clearBtn.onclick = () => {
    void confirmThenSetBox(
      {
        title: "Clear template?",
        message:
          "This replaces the default article template with a minimal {{content}} template. Saved templates are not changed.",
        confirmLabel: "Clear",
      },
      MINIMAL_TEMPLATE,
      "Template cleared",
    );
  };

  saveAsTemplateBtn.onclick = () => {
    void saveBoxAsTemplate(plugin, onRefresh);
  };

  const helpText = containerEl.createDiv({
    cls: "setting-item-description rss-dashboard-template-help",
  });

  renderTemplateVariableHelp(helpText);
}

async function saveBoxAsTemplate(
  plugin: ArticleSavingPluginLike,
  onRefresh: () => void,
): Promise<void> {
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
  const savedTemplates = (plugin.settings.articleSaving.savedTemplates ??= []);
  savedTemplates.push(newTemplate);
  if (result.makeGlobalDefault) {
    plugin.settings.articleSaving.globalDefaultTemplateId = newTemplate.id;
  }
  await plugin.saveSettings();
  new Notice(`Template "${newTemplate.name}" saved`);
  onRefresh();
}

function renderSavedTemplatesList(
  containerEl: HTMLElement,
  plugin: ArticleSavingPluginLike,
  onRefresh: () => void,
): void {
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
            .onClick(() => {
              void (async () => {
                const templates = plugin.settings.articleSaving.savedTemplates;
                if (!templates) return;
                const confirm = new ConfirmActionModal(plugin.app, {
                  title: "Delete this template?",
                  message: `"${template.name}" will be removed. Feeds using it fall back to the global default.`,
                  confirmLabel: "Delete",
                });
                confirm.open();
                const shouldDelete = await confirm.waitForClose();
                if (!shouldDelete) return;
                const deleted = templates.splice(index, 1)[0];
                if (
                  deleted?.id ===
                  plugin.settings.articleSaving.globalDefaultTemplateId
                ) {
                  plugin.settings.articleSaving.globalDefaultTemplateId =
                    undefined;
                }
                if (deleted) {
                  clearTemplateAssignments(plugin.settings.feeds, deleted.id);
                }
                await plugin.saveSettings();
                new Notice(`Template "${template.name}" deleted`);
                onRefresh();
              })();
            }),
        );
    });
  }
}
