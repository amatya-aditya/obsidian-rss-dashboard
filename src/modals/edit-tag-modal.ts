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
  inputClass: string;
  defaultClass: string;
  fallback: string;
}

interface TagAppearanceInput {
  config: TagAppearanceInputConfig;
  input: HTMLInputElement;
  useDefault: HTMLInputElement;
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
      inputClass: "rss-dashboard-tag-modal-background-input",
      defaultClass: "rss-dashboard-tag-modal-background-default",
      fallback: settings.defaultTagColor ?? DEFAULT_TAG_COLOR,
    },
    {
      property: "textColor",
      name: "Text",
      inputClass: "rss-dashboard-tag-modal-text-input",
      defaultClass: "rss-dashboard-tag-modal-text-default",
      fallback: settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR,
    },
  ];
  return configs.map((config) => {
    const row = new Setting(formContainer).setName(config.name);
    const input = row.controlEl.createEl("input", {
      attr: { type: "color" },
      cls: `rss-dashboard-tag-modal-color-picker ${config.inputClass}`,
    });
    const useDefaultLabel = row.controlEl.createEl("label", {
      cls: "rss-dashboard-tag-modal-default-label",
    });
    const useDefault = useDefaultLabel.createEl("input", {
      attr: { type: "checkbox" },
      cls: config.defaultClass,
    });
    useDefaultLabel.appendText("Use default");
    useDefault.checked = tag[config.property] === undefined;
    input.type = useDefault.checked ? "text" : "color";
    input.value = useDefault.checked
      ? ""
      : (tag[config.property] ?? config.fallback);
    input.disabled = useDefault.checked;
    registerCleanup(
      addTagColorPaletteControl({
        container: row.controlEl,
        input,
        fieldName: config.name,
        onValueChange: onPreviewChange,
        onBeforePresetSelect: () => {
          if (!useDefault.checked) return;
          useDefault.checked = false;
          useDefault.dispatchEvent(
            new row.controlEl.ownerDocument.defaultView!.Event("change", {
              bubbles: true,
            }),
          );
        },
      }),
    );
    const paletteControl = row.controlEl.querySelector<HTMLElement>(
      ".rss-dashboard-tag-color-palette-control",
    );
    if (paletteControl) {
      row.controlEl.insertBefore(paletteControl, useDefaultLabel);
    }
    useDefault.addEventListener("change", () => {
      input.disabled = useDefault.checked;
      input.type = useDefault.checked ? "text" : "color";
      input.value = useDefault.checked ? "" : config.fallback;
      onPreviewChange();
    });
    input.addEventListener("input", onPreviewChange);
    return { config, input, useDefault };
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

    new Setting(contentEl).setName("Edit tag").setHeading();

    const formContainer = contentEl.createDiv({
      cls: "rss-dashboard-tag-modal-form",
    });

    const nameInput = formContainer.createEl("input", {
      attr: {
        type: "text",
        value: tag.name,
        placeholder: "Enter tag name",
        autocomplete: "off",
      },
      cls: "rss-dashboard-tag-modal-name-input",
    });
    nameInput.spellcheck = false;
    addInputClearButton(nameInput, { fill: true });
    let updatePreview: () => void = () => {};

    const controls = createTagAppearanceInputs(
      formContainer,
      settings,
      tag,
      (cleanup) => this.paletteControlCleanups.push(cleanup),
      () => updatePreview(),
    );

    const preview = formContainer.createSpan({
      cls: "rss-dashboard-tag-badge rss-dashboard-tag-modal-preview",
      text: tag.name,
    });
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

    const buttonContainer = contentEl.createDiv({
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

    buttonContainer.appendChild(saveButton);
    formContainer.appendChild(buttonContainer);

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
