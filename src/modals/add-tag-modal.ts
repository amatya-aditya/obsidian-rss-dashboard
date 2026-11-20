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
import { addTagOpacityControl } from "../components/tag-opacity-control";
import { colorRgb } from "../utils/tag-colors";

export interface AddTagModalOptions {
  settings: Readonly<RssDashboardSettings>;
  /** Runs after the new tag is in `settings.availableTags` (save, re-render). */
  onAdded: () => void;
}

function createTagColorField(
  form: HTMLElement,
  label: string,
  value: string,
  className: string,
  onChange: () => void,
  registerCleanup: (cleanup: () => void) => void,
): {
  input: HTMLInputElement;
  opacity: ReturnType<typeof addTagOpacityControl>;
} {
  const field = form.createDiv({ cls: "rss-dashboard-tag-modal-color-field" });
  field.createEl("label", { text: label });
  const input = field.createEl("input", {
    attr: {
      type: "color",
      value: colorRgb(value),
      "aria-label": `Tag ${label.toLowerCase()} color`,
    },
    cls: `rss-dashboard-tag-modal-color-picker ${className}`,
  });
  let opacity: ReturnType<typeof addTagOpacityControl>;
  const syncColor = () => {
    opacity.setColor(input.value);
    onChange();
  };
  const cleanup = addTagColorPaletteControl({
    container: field,
    input,
    fieldName: label,
    onValueChange: syncColor,
  });
  registerCleanup(cleanup);
  opacity = addTagOpacityControl(field, value, "Opacity", onChange);
  input.addEventListener("input", syncColor);
  input.addEventListener("change", syncColor);
  return { input, opacity };
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
    let updatePreview = () => {};
    const background = createTagColorField(
      formContainer,
      "Background",
      defaultTagColor,
      "rss-dashboard-add-tag-background-color",
      () => updatePreview(),
      (cleanup) => this.paletteControlCleanups.push(cleanup),
    );
    const text = createTagColorField(
      formContainer,
      "Text",
      defaultTagTextColor,
      "rss-dashboard-add-tag-text-color",
      () => updatePreview(),
      (cleanup) => this.paletteControlCleanups.push(cleanup),
    );
    const backgroundOpacity = background.opacity;
    const textOpacity = text.opacity;

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
    updatePreview = () => {
      preview.textContent = nameInput.value.trim() || "Preview";
      applyTagAppearance(
        preview,
        {
          name: preview.textContent,
          ...(backgroundOpacity.value() !== defaultTagColor
            ? { color: backgroundOpacity.value() }
            : {}),
          ...(textOpacity.value() !== defaultTagTextColor
            ? { textColor: textOpacity.value() }
            : {}),
        },
        settings,
      );
    };
    nameInput.addEventListener("input", updatePreview);
    updatePreview();

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });
    buttonContainer
      .createEl("button", { text: "Cancel" })
      .addEventListener("click", () => this.close());

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
          {
            background: backgroundOpacity.value(),
            text: textOpacity.value(),
          },
          {
            background: backgroundOpacity.value() !== defaultTagColor,
            text: textOpacity.value() !== defaultTagTextColor,
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
