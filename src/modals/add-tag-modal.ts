import { App, Modal, Notice, Setting } from "obsidian";
import type { RssDashboardSettings, Tag } from "../types/types";
import { DEFAULT_TAG_COLOR } from "../utils/tag-colors";

export interface AddTagModalOptions {
  settings: Readonly<RssDashboardSettings>;
  /** Runs after the new tag is in `settings.availableTags` (save, re-render). */
  onAdded: () => void;
}

export class AddTagModal extends Modal {
  private readonly opts: AddTagModalOptions;

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

    const colorInput = formContainer.createEl("input", {
      attr: {
        type: "color",
        value: DEFAULT_TAG_COLOR,
      },
      cls: "rss-dashboard-tag-modal-color-picker",
    });

    const nameInput = formContainer.createEl("input", {
      attr: {
        type: "text",
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
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const addButton = buttonContainer.createEl("button", {
      text: "Add tag",
      cls: "rss-dashboard-primary-button",
    });
    addButton.addEventListener("click", () => {
      const tagName = nameInput.value.trim();
      const tagColor = colorInput.value;

      if (tagName) {
        if (
          settings.availableTags.some(
            (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
          )
        ) {
          new Notice("A tag with this name already exists!");
          return;
        }

        const newTag: Tag = {
          name: tagName,
          color: tagColor,
        };
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
    this.contentEl.empty();
  }
}
