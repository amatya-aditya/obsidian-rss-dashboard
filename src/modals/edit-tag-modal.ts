import { App, Modal, Notice, Setting } from "obsidian";
import type { RssDashboardSettings, Tag } from "../types/types";
import { updateTagInSettings } from "../utils/tag-settings";

export interface EditTagModalOptions {
  settings: Readonly<RssDashboardSettings>;
  tag: Readonly<Tag>;
  onSave?: (updatedTag: Tag) => Promise<void> | void;
  submitLabel?: string;
}

export class EditTagModal extends Modal {
  private readonly opts: EditTagModalOptions;

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

    const colorInput = formContainer.createEl("input", {
      attr: {
        type: "color",
        value: tag.color || "var(--interactive-accent)",
      },
      cls: "rss-dashboard-tag-modal-color-picker",
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
        const newTagColor = colorInput.value;

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

        const tagUpdate = { name: newTagName, color: newTagColor };
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
    this.contentEl.empty();
  }
}
