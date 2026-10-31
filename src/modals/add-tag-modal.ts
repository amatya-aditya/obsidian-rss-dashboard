import { App, Notice, Setting } from "obsidian";
import { AccessibleModal } from "../utils/accessible-modal";
import type { RssDashboardSettings, Tag } from "../types/types";
import {
  createTagWithAppearanceChanges,
  DEFAULT_TAG_COLOR,
  DEFAULT_TAG_TEXT_COLOR,
} from "../utils/tag-colors";
import { addInputClearButton } from "../utils/input-clear-button";
import { applyTagAppearance } from "../utils/tag-colors";
import { addTagColorPaletteControl } from "../components/tag-color-palette-control";

export interface AddTagModalOptions {
  settings: Readonly<RssDashboardSettings>;
  /** Runs after the new tag is in `settings.availableTags` (save, re-render). */
  onAdded: () => void;
}

export class AddTagModal extends AccessibleModal {
  private readonly opts: AddTagModalOptions;
  private paletteControlCleanups: Array<() => void> = [];

  constructor(app: App, opts: AddTagModalOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { settings, onAdded } = this.opts;
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-add-tag-modal");

    new Setting(contentEl).setName("Add new tag").setHeading();

    const formContainer = contentEl.createDiv({
      cls: "rss-dashboard-tag-modal-form",
    });

    const defaultTagColor = settings.defaultTagColor ?? DEFAULT_TAG_COLOR;
    const defaultTagTextColor =
      settings.defaultTagTextColor ?? DEFAULT_TAG_TEXT_COLOR;
    const backgroundField = formContainer.createDiv({
      cls: "rss-dashboard-tag-modal-color-field",
    });
    backgroundField.createEl("label", { text: "Background" });
    const colorInput = backgroundField.createEl("input", {
      attr: {
        type: "color",
        value: defaultTagColor,
        "aria-label": "Tag background color",
      },
      cls: "rss-dashboard-tag-modal-color-picker rss-dashboard-add-tag-background-color",
    });
    this.paletteControlCleanups.push(
      addTagColorPaletteControl({
        container: backgroundField,
        input: colorInput,
        fieldName: "Background",
      }),
    );
    const textField = formContainer.createDiv({
      cls: "rss-dashboard-tag-modal-color-field",
    });
    textField.createEl("label", { text: "Text" });
    const textColorInput = textField.createEl("input", {
      attr: {
        type: "color",
        value: defaultTagTextColor,
        "aria-label": "Tag text color",
      },
      cls: "rss-dashboard-add-tag-text-color",
    });
    this.paletteControlCleanups.push(
      addTagColorPaletteControl({
        container: textField,
        input: textColorInput,
        fieldName: "Text",
      }),
    );

    const nameInput = formContainer.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Enter tag name",
        autocomplete: "off",
      },
      cls: "rss-dashboard-tag-modal-name-input",
    });
    nameInput.spellcheck = false;
    addInputClearButton(nameInput, { fill: true });
    const preview = formContainer.createSpan({
      cls: "rss-dashboard-tag-badge rss-dashboard-tag-modal-preview",
      text: "Preview",
    });
    const updatePreview = () => {
      preview.textContent = nameInput.value.trim() || "Preview";
      applyTagAppearance(
        preview,
        {
          name: preview.textContent,
          ...(colorInput.value !== defaultTagColor
            ? { color: colorInput.value }
            : {}),
          ...(textColorInput.value !== defaultTagTextColor
            ? { textColor: textColorInput.value }
            : {}),
        },
        settings,
      );
    };
    nameInput.addEventListener("input", updatePreview);
    colorInput.addEventListener("input", updatePreview);
    colorInput.addEventListener("change", updatePreview);
    textColorInput.addEventListener("input", updatePreview);
    textColorInput.addEventListener("change", updatePreview);
    updatePreview();

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const addButton = buttonContainer.createEl("button", {
      text: "Add tag",
      cls: "rss-dashboard-primary-button",
    });
    addButton.addEventListener("click", () => {
      const tagName = nameInput.value.trim();

      if (tagName) {
        if (
          settings.availableTags.some(
            (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
          )
        ) {
          new Notice("A tag with this name already exists!");
          return;
        }

        const newTag: Tag = createTagWithAppearanceChanges(
          tagName,
          { background: colorInput.value, text: textColorInput.value },
          {
            background: colorInput.value !== defaultTagColor,
            text: textColorInput.value !== defaultTagTextColor,
          },
        );
        settings.availableTags.push(newTag);

        onAdded();

        this.close();

        new Notice(`Tag "${tagName}" added successfully!`);
      } else {
        new Notice("Please enter a tag name!");
      }
    });
    buttonContainer.appendChild(addButton);
    formContainer.appendChild(buttonContainer);

    window.requestAnimationFrame(() => {
      nameInput.focus();
    });
  }

  onClose() {
    this.paletteControlCleanups.forEach((cleanup) => cleanup());
    this.paletteControlCleanups = [];
    this.contentEl.empty();
  }
}
