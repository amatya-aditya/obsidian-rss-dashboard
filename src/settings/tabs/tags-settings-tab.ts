/**
 * Tags Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderTagsSettingsTab(containerEl, plugin, onRefresh)
 */
import { type ButtonComponent, Notice, Setting, setIcon } from "obsidian";
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
import {
  ApplyTagDefaultsModal,
  ConfirmActionModal,
} from "../modals/settings-modals";
import {
  refreshTagShapeSampleColors,
  renderTagShapeControl,
} from "./tag-shape-control";
import { addTagColorPaletteControl } from "../../components/tag-color-palette-control";
import { addInputClearButton } from "../../utils/input-clear-button";

interface AutoTagSettingConfig {
  name: string;
  description: string;
  menuTitle: string;
  getSelectedTagNames: () => string[];
  setSelectedTagNames: (selected: string[]) => void;
}

function forEachFolderTag(folders: Folder[], visit: (tag: Tag) => void): void {
  for (const folder of folders) {
    folder.autoTags?.forEach(visit);
    forEachFolderTag(folder.subfolders, visit);
  }
}

/** Visits every stored copy of a tag: the palette, article tags and folder auto-tags. */
function forEachStoredTag(
  settings: RssDashboardSettings,
  visit: (tag: Tag) => void,
): void {
  settings.availableTags.forEach(visit);
  for (const feed of settings.feeds) {
    for (const item of feed.items) {
      item.tags?.forEach(visit);
    }
  }
  forEachFolderTag(settings.folders, visit);
}

function resetAllTagAppearance(settings: RssDashboardSettings): void {
  forEachStoredTag(settings, (tag) => {
    delete tag.color;
    delete tag.textColor;
  });
}

/**
 * Gives every tag that still inherits a default its own copy of the value it
 * shows today, so changing the default afterwards leaves it looking the same.
 */
function pinInheritedDefaults(
  settings: RssDashboardSettings,
  pins: { color?: string; textColor?: string },
): void {
  forEachStoredTag(settings, (tag) => {
    if (pins.color !== undefined && tag.color === undefined) {
      tag.color = pins.color;
    }
    if (pins.textColor !== undefined && tag.textColor === undefined) {
      tag.textColor = pins.textColor;
    }
  });
}

interface TagDefaults {
  background: string;
  text: string;
}

function savedTagDefaults(settings: RssDashboardSettings): TagDefaults {
  return {
    background: settings.defaultTagColor ?? DEFAULT_TAG_COLOR,
    text: settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR,
  };
}

function sameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function styleAsDefaultTag(chip: HTMLElement, defaults: TagDefaults): void {
  applyTagAppearance(
    chip,
    { name: chip.textContent ?? "" },
    {
      availableTags: [],
      defaultTagColor: defaults.background,
      defaultTagTextColor: defaults.text,
    },
  );
}

/** The confirm dialog's sample: a tag that uses the defaults, now and after. */
function renderDefaultsChangePreview(
  previewEl: HTMLElement,
  before: TagDefaults,
  after: TagDefaults,
): void {
  const heading = previewEl.createDiv({
    cls: "rss-dashboard-confirm-preview-heading",
  });
  heading.createSpan({ text: "Now" });
  heading.createSpan({ attr: { "aria-hidden": "true" } });
  heading.createSpan({ text: "After" });
  const row = previewEl.createDiv({ cls: "rss-dashboard-confirm-preview-row" });
  styleAsDefaultTag(
    row.createSpan({ cls: "rss-dashboard-tag-badge", text: "Tag" }),
    before,
  );
  setIcon(
    row.createSpan({
      cls: "rss-dashboard-confirm-preview-arrow",
      attr: { "aria-hidden": "true" },
    }),
    "chevron-right",
  );
  styleAsDefaultTag(
    row.createSpan({ cls: "rss-dashboard-tag-badge", text: "Tag" }),
    after,
  );
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
  refreshTagShapeSampleColors(containerEl, plugin.settings);
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

const RESET_PREVIEW_LIMIT = 8;

function hasAppearanceOverride(tag: Tag): boolean {
  return tag.color !== undefined || tag.textColor !== undefined;
}

/**
 * Shows each tag that has its own colors as it looks now and as it will look
 * once the global defaults apply, so the reset is judged before it happens.
 */
function renderResetPreview(
  previewEl: HTMLElement,
  settings: RssDashboardSettings,
): void {
  const overridden = settings.availableTags.filter(hasAppearanceOverride);
  if (overridden.length === 0) {
    previewEl.createEl("p", {
      cls: "rss-dashboard-confirm-preview-empty",
      text: "No tag has custom colors, so nothing will change.",
    });
    return;
  }
  const defaults = {
    availableTags: [],
    defaultTagColor: settings.defaultTagColor ?? DEFAULT_TAG_COLOR,
    defaultTagTextColor: settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR,
  };
  const heading = previewEl.createDiv({
    cls: "rss-dashboard-confirm-preview-heading",
  });
  heading.createSpan({ text: "Now" });
  heading.createSpan({ attr: { "aria-hidden": "true" } });
  heading.createSpan({ text: "After reset" });
  for (const tag of overridden.slice(0, RESET_PREVIEW_LIMIT)) {
    const row = previewEl.createDiv({
      cls: "rss-dashboard-confirm-preview-row",
    });
    const before = row.createSpan({
      cls: "rss-dashboard-tag-badge",
      text: tag.name,
    });
    applyTagAppearance(before, tag, settings);
    setIcon(
      row.createSpan({
        cls: "rss-dashboard-confirm-preview-arrow",
        attr: { "aria-hidden": "true" },
      }),
      "chevron-right",
    );
    const after = row.createSpan({
      cls: "rss-dashboard-tag-badge",
      text: tag.name,
    });
    applyTagAppearance(after, { name: tag.name }, defaults);
  }
  const hidden = overridden.length - RESET_PREVIEW_LIMIT;
  if (hidden > 0) {
    previewEl.createEl("p", {
      cls: "rss-dashboard-confirm-preview-more",
      text: `and ${hidden} more`,
    });
  }
}

/**
 * Asks how far the draft defaults should reach, then saves them: to every tag
 * that inherits them, or only to tags created from now on (existing inheriting
 * tags are pinned to today's colors first).
 */
async function applyDraftDefaults(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  draft: TagDefaults,
  onApplied: () => void,
): Promise<void> {
  const before = savedTagDefaults(plugin.settings);
  const after = { ...draft };
  const confirm = new ApplyTagDefaultsModal(plugin.app, {
    renderPreview: (previewEl) =>
      renderDefaultsChangePreview(previewEl, before, after),
  });
  confirm.open();
  const choice = await confirm.waitForClose();
  if (choice === "cancel") return;

  if (choice === "future") {
    pinInheritedDefaults(plugin.settings, {
      color: sameColor(before.background, after.background)
        ? undefined
        : before.background,
      textColor: sameColor(before.text, after.text) ? undefined : before.text,
    });
  }
  plugin.settings.defaultTagColor = after.background;
  plugin.settings.defaultTagTextColor = after.text;
  refreshRenderedTagChips(containerEl, plugin);
  updatePristineAddTagColorInputs(containerEl, plugin);
  onApplied();
  await plugin.saveSettings();
  await plugin.refreshOpenTagColorViews();
  plugin.app.workspace.trigger("rss-dashboard:tags-mutated");
  new Notice(
    choice === "all"
      ? "Tag defaults updated for all tags."
      : "New defaults apply to tags created from now on.",
  );
}

function renderTagAppearanceDefaults(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
): void {
  new Setting(containerEl).setName("Tag appearance defaults").setHeading();
  refreshRenderedTagChips(containerEl, plugin);

  // The pickers edit this draft only. Nothing is saved or recolored until the
  // user applies it from the card below.
  const draft = savedTagDefaults(plugin.settings);
  let previewChip: HTMLElement | undefined;
  let applyButton: ButtonComponent | undefined;
  const syncDraft = (): void => {
    if (previewChip) styleAsDefaultTag(previewChip, draft);
    const saved = savedTagDefaults(plugin.settings);
    applyButton?.setDisabled(
      sameColor(draft.background, saved.background) &&
        sameColor(draft.text, saved.text),
    );
  };

  const backgroundSetting = new Setting(containerEl).setName("Background");
  backgroundSetting.settingEl.addClass(
    "rss-dashboard-tag-default-color-setting",
    "rss-dashboard-tag-color-setting",
  );
  backgroundSetting.addColorPicker((colorPicker) => {
    colorPicker.setValue(draft.background);
    colorPicker.onChange((color) => {
      draft.background = color;
      syncDraft();
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
      showFieldLabels: false,
      showValueReadout: false,
    });
  }

  const textSetting = new Setting(containerEl).setName("Text");
  textSetting.settingEl.addClass(
    "rss-dashboard-tag-default-color-setting",
    "rss-dashboard-tag-color-setting",
  );
  textSetting.addColorPicker((colorPicker) => {
    colorPicker.setValue(draft.text);
    colorPicker.onChange((color) => {
      draft.text = color;
      syncDraft();
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
      showFieldLabels: false,
      showValueReadout: false,
    });
  }

  const previewSetting = new Setting(containerEl)
    .setName("Preview")
    .setDesc("Preview the new defaults here. Nothing changes until you apply.");
  previewSetting.settingEl.addClass("rss-dashboard-tag-defaults-preview-card");
  previewChip = previewSetting.controlEl.createSpan({
    cls: "rss-dashboard-tag-badge rss-dashboard-tag-defaults-preview",
    text: "Preview",
  });

  const applySetting = new Setting(containerEl)
    .setName("Apply tag defaults")
    .setDesc("Choose whether existing tags change too, or only new ones.");
  applySetting.settingEl.addClass("rss-dashboard-tag-apply-defaults");
  applySetting.addButton((button) => {
    applyButton = button;
    button
      .setButtonText("Apply")
      .setCta()
      .onClick(() => {
        void applyDraftDefaults(containerEl, plugin, draft, syncDraft);
      });
  });
  syncDraft();

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
            renderPreview: (previewEl) =>
              renderResetPreview(previewEl, plugin.settings),
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

  const defaultTagColor = plugin.settings.defaultTagColor ?? DEFAULT_TAG_COLOR;
  const defaultTagTextColor =
    plugin.settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR;
  const tagColorSetting = new Setting(newTagContainer)
    .setName("Tag color")
    .addColorPicker((colorPicker) => colorPicker.setValue(defaultTagColor));
  const tagTextColorSetting = new Setting(newTagContainer)
    .setName("Tag text color")
    .addColorPicker((colorPicker) => colorPicker.setValue(defaultTagTextColor));
  for (const setting of [tagColorSetting, tagTextColorSetting]) {
    setting.settingEl.addClass("rss-dashboard-tag-color-setting");
  }
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
      showFieldLabels: false,
      showValueReadout: false,
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
      showFieldLabels: false,
      showValueReadout: false,
    });
  }

  // The name, its field, a live preview of the new tag and the Add tag button
  // share the last row.
  let nameInput: { inputEl: HTMLInputElement } | undefined;
  const nameSetting = new Setting(newTagContainer)
    .setName("Tag name")
    .addText((text) => {
      text.setPlaceholder("Enter tag name");
      addInputClearButton(text.inputEl);
      nameInput = text;
    });
  const newTagPreview = nameSetting.controlEl.createSpan({
    cls: "rss-dashboard-tag-badge rss-dashboard-tag-new-preview",
    text: "Preview",
  });
  const updateNewTagPreview = (): void => {
    const name = nameInput?.inputEl.value.trim() || "Preview";
    newTagPreview.textContent = name;
    const defaults = savedTagDefaults(plugin.settings);
    applyTagAppearance(
      newTagPreview,
      {
        name,
        color: tagColorInput?.value,
        textColor: tagTextColorInput?.value,
      },
      {
        availableTags: [],
        defaultTagColor: defaults.background,
        defaultTagTextColor: defaults.text,
      },
    );
  };
  nameInput?.inputEl.addEventListener("input", updateNewTagPreview);
  for (const input of [tagColorInput, tagTextColorInput]) {
    input?.addEventListener("input", updateNewTagPreview);
    input?.addEventListener("change", updateNewTagPreview);
  }
  updateNewTagPreview();
  nameSetting.addButton((button) =>
    button.setButtonText("Add tag").onClick(() => {
      void (async () => {
        if (!nameInput) return;
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
