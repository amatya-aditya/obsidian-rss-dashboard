/**
 * Tags Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderTagsSettingsTab(containerEl, plugin, onRefresh)
 */
import { Notice, Setting } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { addTagMultiSelectControl } from "../../components/tag-multi-select-control";
import {
  DEFAULT_SETTINGS,
  type Folder,
  type RssDashboardSettings,
  type Tag,
} from "../../types/types";
import {
  applyTagAppearance,
  createTagWithAppearanceChanges,
  DEFAULT_TAG_COLOR,
  DEFAULT_TAG_TEXT_COLOR,
} from "../../utils/tag-colors";
import { showEditTagModal } from "../../utils/tag-utils";
import { deleteTagFromSettings } from "../../utils/tag-settings";
import { ConfirmActionModal } from "../modals/settings-modals";
import { renderTagShapeControl } from "./tag-shape-control";
import { addTagColorPaletteControl } from "../../components/tag-color-palette-control";
import { addInputClearButton } from "../../utils/input-clear-button";

interface AutoTagSettingConfig {
  name: string;
  description: string;
  menuTitle: string;
  getSelectedTagNames: () => string[];
  setSelectedTagNames: (selected: string[]) => void;
}

function clearAppearanceOverrides(tags: Tag[]): void {
  for (const tag of tags) {
    delete tag.color;
    delete tag.textColor;
  }
}

function clearFolderTagOverrides(folders: Folder[]): void {
  for (const folder of folders) {
    if (folder.autoTags) clearAppearanceOverrides(folder.autoTags);
    clearFolderTagOverrides(folder.subfolders);
  }
}

function resetAllTagAppearance(settings: RssDashboardSettings): void {
  clearAppearanceOverrides(settings.availableTags);
  for (const feed of settings.feeds) {
    for (const item of feed.items) {
      if (item.tags) clearAppearanceOverrides(item.tags);
    }
  }
  clearFolderTagOverrides(settings.folders);
}

function refreshRenderedTagChips(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
): void {
  for (const chip of containerEl.querySelectorAll<HTMLElement>(
    ".rss-dashboard-settings-tag-chip",
  )) {
    const tag = plugin.settings.availableTags.find(
      (candidate) =>
        candidate.name.toLowerCase() === chip.textContent?.trim().toLowerCase(),
    );
    if (tag) applyTagAppearance(chip, tag, plugin.settings);
  }
}

function updatePristineAddTagColorInputs(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
): void {
  const defaults = [
    {
      selector: ".rss-dashboard-tag-new-background-color",
      value: plugin.settings.defaultTagColor ?? DEFAULT_TAG_COLOR,
    },
    {
      selector: ".rss-dashboard-tag-new-text-color",
      value: plugin.settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR,
    },
  ];

  for (const { selector, value } of defaults) {
    const input = containerEl.querySelector<HTMLInputElement>(selector);
    if (!input) continue;
    const previousDefault = input.dataset.rssDashboardDefaultColor;
    if (
      previousDefault !== undefined &&
      input.value.toLowerCase() === previousDefault.toLowerCase()
    ) {
      input.value = value;
      const ownerWindow = input.ownerDocument.defaultView;
      if (ownerWindow) {
        input.dispatchEvent(new ownerWindow.Event("input", { bubbles: true }));
        input.dispatchEvent(new ownerWindow.Event("change", { bubbles: true }));
      }
    }
    input.dataset.rssDashboardDefaultColor = value;
  }
}

function renderTagAppearanceDefaults(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
): void {
  new Setting(containerEl).setName("Tag appearance defaults").setHeading();
  const preview = containerEl.createSpan({
    cls: "rss-dashboard-tag-badge rss-dashboard-tag-default-preview",
    text: "Preview",
  });
  const updatePreview = () => {
    applyTagAppearance(
      preview,
      { name: "Preview" },
      {
        availableTags: [],
        defaultTagColor: plugin.settings.defaultTagColor ?? DEFAULT_TAG_COLOR,
        defaultTagTextColor:
          plugin.settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR,
      },
    );
  };
  updatePreview();
  refreshRenderedTagChips(containerEl, plugin);

  const backgroundSetting = new Setting(containerEl).setName("Background");
  backgroundSetting.settingEl.addClass(
    "rss-dashboard-tag-default-color-setting",
  );
  backgroundSetting.addColorPicker((colorPicker) => {
    colorPicker.setValue(plugin.settings.defaultTagColor ?? DEFAULT_TAG_COLOR);
    colorPicker.onChange(async (color) => {
      plugin.settings.defaultTagColor = color;
      updatePreview();
      refreshRenderedTagChips(containerEl, plugin);
      updatePristineAddTagColorInputs(containerEl, plugin);
      await plugin.saveSettings();
      await plugin.refreshOpenTagColorViews();
    });
  });
  backgroundSetting.controlEl
    .querySelector("input")
    ?.addClass("rss-dashboard-tag-default-background");
  const backgroundInput =
    backgroundSetting.controlEl.querySelector<HTMLInputElement>(
      'input[type="color"]',
    );
  if (backgroundInput) {
    addTagColorPaletteControl({
      container: backgroundSetting.controlEl,
      input: backgroundInput,
      fieldName: "Background",
    });
  }

  const textSetting = new Setting(containerEl).setName("Text");
  textSetting.settingEl.addClass("rss-dashboard-tag-default-color-setting");
  textSetting.addColorPicker((colorPicker) => {
    colorPicker.setValue(
      plugin.settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR,
    );
    colorPicker.onChange(async (color) => {
      plugin.settings.defaultTagTextColor = color;
      updatePreview();
      refreshRenderedTagChips(containerEl, plugin);
      updatePristineAddTagColorInputs(containerEl, plugin);
      await plugin.saveSettings();
      await plugin.refreshOpenTagColorViews();
    });
  });
  textSetting.controlEl
    .querySelector("input")
    ?.addClass("rss-dashboard-tag-default-text");
  const textInput = textSetting.controlEl.querySelector<HTMLInputElement>(
    'input[type="color"]',
  );
  if (textInput) {
    addTagColorPaletteControl({
      container: textSetting.controlEl,
      input: textInput,
      fieldName: "Text",
    });
  }

  new Setting(containerEl)
    .setName("Reset all tags to defaults")
    .setDesc("Clear every tag's background and text overrides.")
    .addButton((button) =>
      button.setButtonText("Reset all tags to defaults").onClick(() => {
        void (async () => {
          const confirm = new ConfirmActionModal(plugin.app, {
            title: "Reset all tags to defaults?",
            message: "All tag background and text overrides will be cleared.",
            confirmLabel: "Reset",
          });
          confirm.open();
          if (!(await confirm.waitForClose())) return;

          resetAllTagAppearance(plugin.settings);
          refreshRenderedTagChips(containerEl, plugin);
          await plugin.saveSettings();
          await plugin.refreshOpenTagColorViews();
          plugin.app.workspace.trigger("rss-dashboard:tags-mutated");
          new Notice("All tags now use the global appearance defaults.");
        })();
      }),
    );
}

/**
 * After the tab re-renders, returns focus to the edited row's pencil. The
 * refresh replaces the button that opened the dialog, so the modal's usual
 * focus restoration cannot reach it and a keyboard user would restart tabbing
 * from the top of the settings page.
 */
function focusTagRowEditor(ownerDocument: Document, tagName: string): void {
  const chip = Array.from(
    ownerDocument.querySelectorAll<HTMLElement>(
      ".rss-dashboard-settings-tag-chip",
    ),
  ).find((element) => element.textContent?.trim() === tagName);
  chip
    ?.closest(".setting-item")
    ?.querySelector<HTMLButtonElement>("button")
    ?.focus();
}

/**
 * One row of the Tags list: the tag shown as a chip in its own color, a pencil
 * that opens the shared Edit tag dialog, and the delete button.
 */
function renderTagSettingsRow(
  parent: HTMLElement,
  plugin: RssDashboardPlugin,
  tag: Tag,
  onRefresh: () => void,
): void {
  const tagSetting = new Setting(parent);
  const tagChip = tagSetting.nameEl.createSpan({
    cls: "rss-dashboard-tag-badge rss-dashboard-settings-tag-chip",
    text: tag.name,
  });
  applyTagAppearance(tagChip, tag, plugin.settings);

  tagSetting
    .addButton((button) =>
      button
        .setIcon("pencil")
        .setTooltip("Edit tag")
        .onClick(() => {
          showEditTagModal({
            app: plugin.app,
            settings: plugin.settings,
            tag,
            onSave: async (updatedTag) => {
              const ownerDocument = parent.ownerDocument;
              await plugin.saveSettings();
              await plugin.refreshOpenTagColorViews();
              plugin.app.workspace.trigger("rss-dashboard:tags-mutated");
              onRefresh();
              focusTagRowEditor(ownerDocument, updatedTag.name);
            },
          });
        }),
    )
    .addButton((button) =>
      button
        .setIcon("trash")
        .setTooltip("Delete tag")
        .onClick(() => {
          void (async () => {
            const confirm = new ConfirmActionModal(plugin.app, {
              title: "Delete tag?",
              message: `"${tag.name}" will be removed from your tags and from every article using it.`,
              confirmLabel: "Delete",
            });
            confirm.open();
            const shouldDelete = await confirm.waitForClose();
            if (!shouldDelete) return;
            deleteTagFromSettings(plugin.settings, tag.name);
            await plugin.saveSettings();
            await plugin.refreshOpenTagColorViews();
            plugin.app.workspace.trigger("rss-dashboard:tags-mutated");
            onRefresh();
          })();
        }),
    );
}

/**
 * The "Add new tag" heading, name field, color picker, and Add tag button.
 */
function renderAddTagSection(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
): void {
  new Setting(containerEl).setName("Add new tag").setHeading();

  const newTagContainer = containerEl.createDiv();

  const tagNameSetting = new Setting(newTagContainer)
    .setName("Tag name")
    .addText((text) => {
      text.setPlaceholder("Enter tag name");
      addInputClearButton(text.inputEl);
    });

  const defaultTagColor = plugin.settings.defaultTagColor ?? DEFAULT_TAG_COLOR;
  const defaultTagTextColor =
    plugin.settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR;
  const tagColorSetting = new Setting(newTagContainer)
    .setName("Tag color")
    .addColorPicker((colorPicker) => colorPicker.setValue(defaultTagColor));
  const tagTextColorSetting = new Setting(newTagContainer)
    .setName("Tag text color")
    .addColorPicker((colorPicker) => colorPicker.setValue(defaultTagTextColor));
  const tagColorInput =
    tagColorSetting.controlEl.querySelector<HTMLInputElement>(
      'input[type="color"]',
    );
  if (tagColorInput) {
    tagColorInput.classList.add("rss-dashboard-tag-new-background-color");
    tagColorInput.dataset.rssDashboardDefaultColor = defaultTagColor;
    addTagColorPaletteControl({
      container: tagColorSetting.controlEl,
      input: tagColorInput,
      fieldName: "Background",
    });
  }
  const tagTextColorInput =
    tagTextColorSetting.controlEl.querySelector<HTMLInputElement>(
      'input[type="color"]',
    );
  if (tagTextColorInput) {
    tagTextColorInput.classList.add("rss-dashboard-tag-new-text-color");
    tagTextColorInput.dataset.rssDashboardDefaultColor = defaultTagTextColor;
    addTagColorPaletteControl({
      container: tagTextColorSetting.controlEl,
      input: tagTextColorInput,
      fieldName: "Text",
    });
  }

  new Setting(newTagContainer).addButton((button) =>
    button.setButtonText("Add tag").onClick(() => {
      void (async () => {
        const nameInput = tagNameSetting.components[0] as unknown as {
          inputEl: HTMLInputElement;
        };
        const colorPicker = tagColorSetting.components[0] as unknown as {
          getValue: () => string;
        };
        const textColorPicker = tagTextColorSetting
          .components[0] as unknown as {
          getValue: () => string;
        };
        const name = nameInput.inputEl.value.trim();

        if (!name) {
          new Notice("Please enter a tag name!");
          return;
        }
        const duplicate = plugin.settings.availableTags.some(
          (tag) => tag.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
          new Notice("A tag with this name already exists!");
          return;
        }

        plugin.settings.availableTags.push(
          createTagWithAppearanceChanges(
            name,
            {
              background: colorPicker.getValue(),
              text: textColorPicker.getValue(),
            },
            {
              background:
                colorPicker.getValue() !==
                (plugin.settings.defaultTagColor ?? DEFAULT_TAG_COLOR),
              text:
                textColorPicker.getValue() !==
                (plugin.settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR),
            },
          ),
        );
        await plugin.saveSettings();
        onRefresh();
      })();
    }),
  );
}

export function renderTagsSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
): void {
  // Auto Tagging settings
  new Setting(containerEl).setName("Auto tagging").setHeading();

  const autoTagSettings: AutoTagSettingConfig[] = [
    {
      name: "Tag for video articles",
      description:
        "Default tag for RSS articles with detected video content (YouTube feeds use the dedicated tag below)",
      menuTitle: "Select default video tags",
      getSelectedTagNames: () => plugin.settings.media.defaultVideoTags ?? [],
      setSelectedTagNames: (selected) => {
        plugin.settings.media.defaultVideoTags = selected;
      },
    },
    {
      name: "Default Mastodon tag",
      description: "Default tag for Mastodon feeds",
      menuTitle: "Select default Mastodon tags",
      getSelectedTagNames: () =>
        plugin.settings.media.defaultMastodonTags ?? [],
      setSelectedTagNames: (selected) => {
        plugin.settings.media.defaultMastodonTags = selected;
      },
    },
    {
      name: "Default YouTube tag",
      description: "Tag used for auto-tagged YouTube content",
      menuTitle: "Select default YouTube tags",
      getSelectedTagNames: () => plugin.settings.media.defaultYouTubeTags ?? [],
      setSelectedTagNames: (selected) => {
        plugin.settings.media.defaultYouTubeTags = selected;
      },
    },
    {
      name: "Default podcast tag",
      description: "Default tag for podcast episodes",
      menuTitle: "Select default podcast tags",
      getSelectedTagNames: () => plugin.settings.media.defaultPodcastTags ?? [],
      setSelectedTagNames: (selected) => {
        plugin.settings.media.defaultPodcastTags = selected;
      },
    },
    {
      name: "Default RSS tag",
      description: "Default tag for RSS articles",
      menuTitle: "Select default RSS tags",
      getSelectedTagNames: () => plugin.settings.media.defaultRssTags ?? [],
      setSelectedTagNames: (selected) => {
        plugin.settings.media.defaultRssTags = selected;
      },
    },
    {
      name: "Default smallweb tag",
      description: "Default tag for smallweb articles",
      menuTitle: "Select default smallweb tags",
      getSelectedTagNames: () =>
        plugin.settings.media.defaultSmallwebTags ?? [],
      setSelectedTagNames: (selected) => {
        plugin.settings.media.defaultSmallwebTags = selected;
      },
    },
  ];

  for (const autoTagSetting of autoTagSettings) {
    const setting = new Setting(containerEl)
      .setName(autoTagSetting.name)
      .setDesc(autoTagSetting.description);

    addTagMultiSelectControl({
      setting,
      availableTags: plugin.settings.availableTags ?? [],
      tagAppearanceSettings: plugin.settings,
      selectedTagNames: autoTagSetting.getSelectedTagNames(),
      triggerEmptyLabel: "None",
      menuTitle: autoTagSetting.menuTitle,
      onChange: async (selected: string[]) => {
        autoTagSetting.setSelectedTagNames(selected);
        await plugin.saveSettings();
      },
    });
  }

  new Setting(containerEl)
    .setName("Reset tag names")
    .setDesc("Restore all tag names to their out-of-the-box defaults.")
    .addButton((button) => {
      button.setButtonText("Reset tag names").onClick(async () => {
        const d = DEFAULT_SETTINGS.media;
        plugin.settings.media.defaultVideoTag = d.defaultVideoTag;
        plugin.settings.media.defaultVideoTags = d.defaultVideoTags;
        plugin.settings.media.defaultYouTubeTag = d.defaultYouTubeTag;
        plugin.settings.media.defaultYouTubeTags = d.defaultYouTubeTags;
        plugin.settings.media.defaultPodcastTags = d.defaultPodcastTags;
        plugin.settings.media.defaultRssTag = d.defaultRssTag;
        plugin.settings.media.defaultRssTags = d.defaultRssTags;
        plugin.settings.media.defaultSmallwebTag = d.defaultSmallwebTag;
        plugin.settings.media.defaultSmallwebTags = d.defaultSmallwebTags;
        plugin.settings.media.defaultMastodonTag = d.defaultMastodonTag;
        plugin.settings.media.defaultMastodonTags = d.defaultMastodonTags;
        await plugin.saveSettings();
        new Notice("Tag names restored to defaults.");
        onRefresh();
      });
    });

  renderTagShapeControl(containerEl, plugin);

  // Tags settings
  new Setting(containerEl).setName("Tags").setHeading();
  renderTagAppearanceDefaults(containerEl, plugin);

  const tagsContainer = containerEl.createDiv({
    cls: "rss-dashboard-tags-container",
  });

  for (let i = 0; i < plugin.settings.availableTags.length; i++) {
    const tag = plugin.settings.availableTags[i];
    if (!tag) continue;
    renderTagSettingsRow(tagsContainer, plugin, tag, onRefresh);
  }

  renderAddTagSection(containerEl, plugin, onRefresh);
}
