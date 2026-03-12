import { Notice, Setting } from "obsidian";
import type { RssDashboardSettings, Tag } from "../types/types";

export function updateTagInSettings(
  settings: Readonly<RssDashboardSettings>,
  oldTag: Readonly<Tag>,
  newTagUpdate: Readonly<Partial<Tag>>
): Tag[] {
  // Update the tag definition in availableTags
  const updatedTags = settings.availableTags.map((tag) => {
    if (tag.name === oldTag.name) {
      return { ...tag, ...newTagUpdate };
    }
    return tag;
  });
  
  // Mutable update is needed since the plugin settings object acts as a live reference
  settings.availableTags.length = 0;
  settings.availableTags.push(...updatedTags);

  // Update tag references in all existing articles
  for (const feed of settings.feeds) {
    for (const item of feed.items) {
      if (item.tags?.some((t) => t.name === oldTag.name)) {
        item.tags = item.tags.map((t) => {
          if (t.name === oldTag.name) {
            return { ...t, ...newTagUpdate };
          }
          return t;
        });
      }
    }
  }

  return updatedTags;
}

export function showEditTagModal({
  settings,
  tag,
  onSave,
  submitLabel = "Save Changes",
}: {
  settings: Readonly<RssDashboardSettings>;
  tag: Readonly<Tag>;
  onSave?: () => Promise<void> | void;
  submitLabel?: string;
}): void {
  const modal = document.body.createDiv({
    cls: "rss-dashboard-modal rss-dashboard-modal-container",
  });

  const modalContent = modal.createDiv({
    cls: "rss-dashboard-modal-content",
  });

  new Setting(modalContent).setName("Edit tag").setHeading();

  const formContainer = modalContent.createDiv({
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

  const buttonContainer = modalContent.createDiv({
    cls: "rss-dashboard-modal-buttons",
  });

  const closeModal = () => {
    if (modal.parentElement) {
      document.body.removeChild(modal);
    }
  };

  const cancelButton = buttonContainer.createEl("button", {
    text: "Cancel",
  });
  cancelButton.addEventListener("click", closeModal);

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

      updateTagInSettings(settings, tag, {
        name: newTagName,
        color: newTagColor,
      });

      if (onSave) {
        await onSave();
      }
      closeModal();

      new Notice(`Tag "${newTagName}" updated successfully!`);
    })();
  });

  buttonContainer.appendChild(saveButton);
  formContainer.appendChild(buttonContainer);

  requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select();
  });
}
