import { App, Notice, Setting } from "obsidian";
import { AccessibleModal } from "../utils/accessible-modal";
import {
  applyTagAppearance,
  DEFAULT_TAG_COLOR,
  DEFAULT_TAG_TEXT_COLOR,
} from "../utils/tag-colors";
import type { RssDashboardSettings, Tag } from "../types/types";
import { updateTagInSettings } from "../utils/tag-settings";
import { addInputClearButton } from "../utils/input-clear-button";
import { addTagColorPaletteControl } from "../components/tag-color-palette-control";

export interface EditTagModalOptions {
  settings: Readonly<RssDashboardSettings>;
  tag: Readonly<Tag>;
  onSave?: (updatedTag: Tag) => Promise<void> | void;
  submitLabel?: string;
}

interface TagAppearanceInputConfig {
  property: "color" | "textColor";
  name: string;
  sectionClass: string;
  inputClass: string;
  defaultClass: string;
  fallback: string;
}

interface TagAppearanceInput {
  config: TagAppearanceInputConfig;
  input: HTMLInputElement;
  useDefault: HTMLInputElement;
}

const NAME_INPUT_ID = "rss-dashboard-tag-modal-name";
const VALUE_READOUT_SELECTOR =
  ".rss-dashboard-tag-color-palette-control-value-readout";

/**
 * Builds one color section: a header with its "Use default" toggle, then the
 * shared palette control and a "Custom" row holding the native color picker.
 */
function createAppearanceSection(
  formContainer: HTMLElement,
  config: TagAppearanceInputConfig,
  tag: Readonly<Tag>,
  registerCleanup: (cleanup: () => void) => void,
  onPreviewChange: () => void,
): TagAppearanceInput {
  const section = formContainer.createDiv({
    cls: `rss-dashboard-tag-modal-section ${config.sectionClass}`,
  });
  const header = section.createDiv({
    cls: "rss-dashboard-tag-modal-section-header",
  });
  header.createSpan({
    cls: "rss-dashboard-tag-modal-section-title",
    text: config.name,
  });
  const useDefaultLabel = header.createEl("label", {
    cls: "rss-dashboard-tag-modal-default-label",
  });
  const useDefault = useDefaultLabel.createEl("input", {
    attr: { type: "checkbox" },
    cls: config.defaultClass,
  });
  useDefaultLabel.appendText("Use default");

  const body = section.createDiv({
    cls: "rss-dashboard-tag-modal-section-body",
  });
  const customRow = body.createDiv({
    cls: "rss-dashboard-tag-modal-custom-row",
  });
  customRow.createSpan({
    cls: "rss-dashboard-tag-modal-custom-label",
    text: "Custom",
  });
  const customControl = customRow.createDiv({
    cls: "rss-dashboard-tag-modal-custom-control",
  });
  const input = customControl.createEl("input", {
    attr: { type: "color", "aria-label": `${config.name} custom color` },
    cls: `rss-dashboard-tag-modal-color-picker ${config.inputClass}`,
  });

  // While "Use default" is on, the picker shows the inherited color and stays
  // clickable; changing it switches the override on.
  useDefault.checked = tag[config.property] === undefined;
  let customValue = tag[config.property] ?? config.fallback;
  input.value = useDefault.checked ? config.fallback : customValue;

  registerCleanup(
    addTagColorPaletteControl({
      container: body,
      input,
      fieldName: config.name,
      onValueChange: onPreviewChange,
      onBeforePresetSelect: () => {
        if (!useDefault.checked) return;
        useDefault.checked = false;
        useDefault.dispatchEvent(
          new body.ownerDocument.defaultView!.Event("change", {
            bubbles: true,
          }),
        );
      },
    }),
  );
  // The control adds its Palette and Color rows after the Custom row and
  // leaves its hex readout beside them; put the Custom row last and give it
  // the readout.
  body.appendChild(customRow);
  const readout = body.querySelector<HTMLElement>(VALUE_READOUT_SELECTOR);
  if (readout) customControl.appendChild(readout);

  useDefault.addEventListener("change", () => {
    input.value = useDefault.checked ? config.fallback : customValue;
    // `change` refreshes the palette trigger without touching customValue.
    input.dispatchEvent(
      new body.ownerDocument.defaultView!.Event("change", { bubbles: true }),
    );
    onPreviewChange();
  });
  input.addEventListener("input", () => {
    customValue = input.value;
    // Unchecked directly, not through a `change` event: that would run the
    // restore branch above and overwrite the color just picked.
    useDefault.checked = false;
    onPreviewChange();
  });
  return { config, input, useDefault };
}

function createTagAppearanceInputs(
  formContainer: HTMLElement,
  settings: Readonly<RssDashboardSettings>,
  tag: Readonly<Tag>,
  registerCleanup: (cleanup: () => void) => void,
  onPreviewChange: () => void,
): TagAppearanceInput[] {
  const configs: TagAppearanceInputConfig[] = [
    {
      property: "color",
      name: "Background",
      sectionClass: "rss-dashboard-tag-modal-section-background",
      inputClass: "rss-dashboard-tag-modal-background-input",
      defaultClass: "rss-dashboard-tag-modal-background-default",
      fallback: settings.defaultTagColor ?? DEFAULT_TAG_COLOR,
    },
    {
      property: "textColor",
      name: "Text",
      sectionClass: "rss-dashboard-tag-modal-section-text",
      inputClass: "rss-dashboard-tag-modal-text-input",
      defaultClass: "rss-dashboard-tag-modal-text-default",
      fallback: settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR,
    },
  ];
  return configs.map((config) =>
    createAppearanceSection(
      formContainer,
      config,
      tag,
      registerCleanup,
      onPreviewChange,
    ),
  );
}

function createNameField(
  formContainer: HTMLElement,
  tag: Readonly<Tag>,
): HTMLInputElement {
  const nameSection = formContainer.createDiv({
    cls: "rss-dashboard-tag-modal-name-section",
  });
  nameSection.createEl("label", {
    cls: "rss-dashboard-tag-modal-name-label",
    text: "Tag name",
    attr: { for: NAME_INPUT_ID },
  });
  const nameInput = nameSection.createEl("input", {
    attr: {
      id: NAME_INPUT_ID,
      type: "text",
      value: tag.name,
      placeholder: "Enter tag name",
      autocomplete: "off",
    },
    cls: "rss-dashboard-tag-modal-name-input",
  });
  nameInput.spellcheck = false;
  addInputClearButton(nameInput, { fill: true });
  return nameInput;
}

function createPreviewCard(
  formContainer: HTMLElement,
  tag: Readonly<Tag>,
): HTMLElement {
  const card = formContainer.createDiv({
    cls: "rss-dashboard-tag-modal-preview-card",
  });
  card.createSpan({
    cls: "rss-dashboard-tag-modal-preview-label",
    text: "Live preview",
  });
  return card.createSpan({
    cls: "rss-dashboard-tag-badge rss-dashboard-tag-modal-preview",
    text: tag.name,
  });
}

export class EditTagModal extends AccessibleModal {
  private readonly opts: EditTagModalOptions;
  private paletteControlCleanups: Array<() => void> = [];

  constructor(app: App, opts: EditTagModalOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { settings, tag, onSave, submitLabel = "Save changes" } = this.opts;
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-edit-tag-modal");

    new Setting(contentEl).setName("Add/edit tag").setHeading();

    const formContainer = contentEl.createDiv({
      cls: "rss-dashboard-tag-modal-form",
    });

    const nameInput = createNameField(formContainer, tag);
    let updatePreview: () => void = () => {};

    const controls = createTagAppearanceInputs(
      formContainer,
      settings,
      tag,
      (cleanup) => this.paletteControlCleanups.push(cleanup),
      () => updatePreview(),
    );

    const preview = createPreviewCard(formContainer, tag);
    updatePreview = () => {
      const previewTag: Tag = {
        name: tag.name,
        ...(controls[0]?.useDefault.checked
          ? {}
          : { color: controls[0]?.input.value }),
        ...(controls[1]?.useDefault.checked
          ? {}
          : { textColor: controls[1]?.input.value }),
      };
      const previewSettings = {
        ...settings,
        availableTags: settings.availableTags.map((existingTag) =>
          existingTag.name.toLowerCase() === tag.name.toLowerCase()
            ? previewTag
            : existingTag,
        ),
      };
      preview.textContent = nameInput.value.trim() || tag.name;
      applyTagAppearance(preview, previewTag, previewSettings);
    };

    nameInput.addEventListener("input", updatePreview);
    updatePreview();

    // Sibling callers (import-starred, tags dropdown) look the Save button up
    // inside the form, so the footer stays a child of it.
    const buttonContainer = formContainer.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.addEventListener("click", () => this.close());

    const saveButton = buttonContainer.createEl("button", {
      text: submitLabel,
      cls: "rss-dashboard-primary-button",
    });

    saveButton.addEventListener("click", () => {
      void (async () => {
        const newTagName = nameInput.value.trim();
        if (!newTagName) {
          new Notice("Please enter a tag name!");
          return;
        }

        if (
          settings.availableTags.some(
            (existingTag) =>
              existingTag !== tag &&
              existingTag.name.toLowerCase() === newTagName.toLowerCase(),
          )
        ) {
          new Notice("A tag with this name already exists!");
          return;
        }

        const tagUpdate: Partial<Tag> = { name: newTagName };
        if (controls[0]?.useDefault.checked) {
          tagUpdate.color = undefined;
        } else if (controls[0]) {
          tagUpdate.color = controls[0].input.value;
        }
        if (controls[1]?.useDefault.checked) {
          tagUpdate.textColor = undefined;
        } else if (controls[1]) {
          tagUpdate.textColor = controls[1].input.value;
        }
        updateTagInSettings(settings, tag, tagUpdate);

        if (onSave) {
          await onSave({ ...tag, ...tagUpdate });
        }
        this.close();

        new Notice(`Tag "${newTagName}" updated successfully!`);
      })();
    });

    window.requestAnimationFrame(() => {
      nameInput.focus();
      nameInput.select();
    });
  }

  onClose() {
    this.paletteControlCleanups.forEach((cleanup) => cleanup());
    this.paletteControlCleanups = [];
    this.contentEl.empty();
  }
}
