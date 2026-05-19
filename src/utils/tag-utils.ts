import { Notice, Setting } from "obsidian";
import type { FeedItem, RssDashboardSettings, Tag } from "../types/types";

const AUTO_TAG_DEFINITIONS = {
  saved: { name: "Saved", fallbackColor: "#3498db" },
  favorite: { name: "Favorite", fallbackColor: "#f1c40f" },
} as const;

function cloneTags(tags: readonly Tag[] | undefined): Tag[] {
  return (tags ?? []).map((tag) => ({ ...tag }));
}

function ensureCanonicalTag(
  tags: readonly Tag[] | undefined,
  availableTags: readonly Tag[],
  tagKey: keyof typeof AUTO_TAG_DEFINITIONS,
): { changed: boolean; tags: Tag[] } {
  const definition = AUTO_TAG_DEFINITIONS[tagKey];
  const nextTags = cloneTags(tags);
  const matchingTag = availableTags.find(
    (tag) => tag.name.toLowerCase() === definition.name.toLowerCase(),
  );
  const existingIndex = nextTags.findIndex(
    (tag) => tag.name.toLowerCase() === definition.name.toLowerCase(),
  );
  const resolvedColor = matchingTag?.color || definition.fallbackColor;

  if (existingIndex >= 0) {
    const existingTag = nextTags[existingIndex];
    const nextTag: Tag = {
      ...existingTag,
      name: definition.name,
      color: existingTag.color || resolvedColor,
    };
    const changed =
      nextTag.name !== existingTag.name || nextTag.color !== existingTag.color;
    if (changed) {
      nextTags[existingIndex] = nextTag;
    }
    return { changed, tags: nextTags };
  }

  nextTags.push({
    name: definition.name,
    color: resolvedColor,
  });
  return { changed: true, tags: nextTags };
}

function removeCanonicalTag(
  tags: readonly Tag[] | undefined,
  tagKey: keyof typeof AUTO_TAG_DEFINITIONS,
): { changed: boolean; tags: Tag[] } {
  const definition = AUTO_TAG_DEFINITIONS[tagKey];
  const nextTags = cloneTags(tags);
  const filteredTags = nextTags.filter(
    (tag) => tag.name.toLowerCase() !== definition.name.toLowerCase(),
  );

  return {
    changed: filteredTags.length !== nextTags.length,
    tags: filteredTags,
  };
}

export function applyAutomaticArticleTags(
  article: Readonly<FeedItem>,
  updates: Partial<FeedItem>,
  settings: Pick<RssDashboardSettings, "availableTags" | "articleSaving">,
): Partial<FeedItem> {
  let nextTags = cloneTags(updates.tags ?? article.tags);
  let tagsChanged = updates.tags !== undefined;

  if (updates.saved === true && settings.articleSaving.addSavedTag) {
    const result = ensureCanonicalTag(
      nextTags,
      settings.availableTags,
      "saved",
    );
    nextTags = result.tags;
    tagsChanged = tagsChanged || result.changed;
  }

  if (updates.starred === true) {
    const result = ensureCanonicalTag(
      nextTags,
      settings.availableTags,
      "favorite",
    );
    nextTags = result.tags;
    tagsChanged = tagsChanged || result.changed;
  } else if (updates.starred === false) {
    const result = removeCanonicalTag(nextTags, "favorite");
    nextTags = result.tags;
    tagsChanged = tagsChanged || result.changed;
  }

  if (!tagsChanged) {
    return updates;
  }

  return {
    ...updates,
    tags: nextTags,
  };
}

export function withSavedTagName(tagNames: readonly string[]): string[] {
  const normalizedNames = tagNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const savedIndex = normalizedNames.findIndex(
    (name) => name.toLowerCase() === "saved",
  );

  if (savedIndex >= 0) {
    const nextNames = [...normalizedNames];
    nextNames[savedIndex] = AUTO_TAG_DEFINITIONS.saved.name;
    return nextNames;
  }

  return [...normalizedNames, AUTO_TAG_DEFINITIONS.saved.name];
}

export function updateTagInSettings(
  settings: Readonly<RssDashboardSettings>,
  oldTag: Readonly<Tag>,
  newTagUpdate: Readonly<Partial<Tag>>,
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
  const modal = activeDocument.body.createDiv({
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
      activeDocument.body.removeChild(modal);
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

  activeWindow.requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select();
  });
}
