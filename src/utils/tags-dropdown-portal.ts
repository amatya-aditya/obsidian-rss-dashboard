import { Notice, setIcon } from "obsidian";
import type { FeedItem, RssDashboardSettings, Tag } from "../types/types";
import { showEditTagModal } from "./tag-utils";

export type TagsDropdownPortalOptions = {
  anchor: HTMLElement;
  settings: RssDashboardSettings;
  item: FeedItem;
  onTagAssignmentChange: (tag: Tag, checked: boolean) => void;
  onPersistSettings?: () => Promise<void> | void;
  onAfterSettingsTagsMutated?: () => void;
  onOpenTagsSettings?: () => Promise<void> | void;
  appContainer?: HTMLElement | null;
  onClosed?: () => void;
};

export function createTagsDropdownPortal(
  options: TagsDropdownPortalOptions,
): () => void {
  const {
    anchor,
    settings,
    item,
    onTagAssignmentChange,
    onPersistSettings,
    onAfterSettingsTagsMutated,
    onOpenTagsSettings,
    appContainer,
    onClosed,
  } = options;

  const targetDocument = anchor.ownerDocument;
  const targetBody = targetDocument.body;
  const targetWindow = targetDocument.defaultView || window;
  const isMobile = targetWindow.matchMedia("(max-width: 768px)").matches;

  targetDocument
    .querySelectorAll(
      ".rss-dashboard-tags-dropdown-content.rss-dashboard-tags-dropdown-content-portal, .rss-dashboard-tags-sheet-backdrop",
    )
    .forEach((el) => {
      (el as HTMLElement).parentNode?.removeChild(el);
    });

  const sheetBackdrop = isMobile
    ? targetBody.createDiv({
        cls: "rss-dashboard-tags-sheet-backdrop",
      })
    : null;

  const portalDropdown = targetBody.createDiv({
    cls: "rss-dashboard-tags-dropdown-content rss-dashboard-tags-dropdown-content-portal",
  });

  const persistSettings = () => {
    const result = onPersistSettings?.();
    if (result instanceof Promise) {
      void result;
    }
  };

  const notifySettingsTagsMutated = () => {
    onAfterSettingsTagsMutated?.();
  };

  const openTagsSettings = () => {
    const result = onOpenTagsSettings?.();
    if (result instanceof Promise) {
      void result;
    }
  };

  if (isMobile) {
    portalDropdown.addClass("rss-dashboard-tags-mobile-sheet");
    const sheetHeader = portalDropdown.createDiv({
      cls: "rss-dashboard-tags-sheet-header",
    });
    sheetHeader.createDiv({
      cls: "rss-dashboard-tags-sheet-title",
      text: "Manage tags",
    });
    const sheetActions = sheetHeader.createDiv({
      cls: "rss-dashboard-tags-sheet-actions",
    });
    const addTagBtn = sheetActions.createEl("button", {
      cls: "rss-dashboard-tags-sheet-btn",
      text: "Add tag",
    });
    setIcon(addTagBtn, "plus");
    addTagBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDropdown();
      openTagsSettings();
    });
    const doneBtn = sheetActions.createEl("button", {
      cls: "rss-dashboard-tags-sheet-btn rss-dashboard-tags-sheet-btn-done",
      text: "Done",
    });
    doneBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDropdown();
    });
  }

  const tagsListContainer = portalDropdown.createDiv({
    cls: "rss-dashboard-tag-list",
  });
  const tagSeparator = portalDropdown.createDiv({
    cls: "rss-dashboard-tag-item-separator",
  });

  const updateTagSeparatorVisibility = () => {
    const hasTags = settings.availableTags.length > 0;
    tagSeparator.style.display = hasTags ? "" : "none";
  };

  const deleteTagFromProfile = (tag: Tag) => {
    const tagIndex = settings.availableTags.findIndex((t) => t.name === tag.name);
    if (tagIndex === -1) {
      return;
    }

    settings.availableTags.splice(tagIndex, 1);
    settings.feeds.forEach((feed) => {
      feed.items.forEach((feedItem) => {
        if (feedItem.tags) {
          feedItem.tags = feedItem.tags.filter((t) => t.name !== tag.name);
        }
      });
    });

    if (item.tags?.some((t) => t.name === tag.name)) {
      onTagAssignmentChange(tag, false);
    }

    persistSettings();
    notifySettingsTagsMutated();
    new Notice(`Tag "${tag.name}" deleted successfully!`);
    updateTagSeparatorVisibility();
  };

  const appendTagItem = (tag: Tag, checkedOverride?: boolean) => {
    const tagItem = tagsListContainer.createDiv({
      cls: "rss-dashboard-tag-item",
    });
    const hasTag =
      checkedOverride ?? (item.tags?.some((t) => t.name === tag.name) || false);

    const tagCheckbox = tagItem.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-tag-checkbox",
    });
    tagCheckbox.checked = hasTag;

    const tagLabel = tagItem.createDiv({
      cls: "rss-dashboard-tag-label",
      text: tag.name,
    });
    tagLabel.style.setProperty("--tag-color", tag.color);

    const editButton = tagItem.createDiv({
      cls: "rss-dashboard-tag-action-button rss-dashboard-tag-edit-button clickable-icon",
      attr: {
        title: `Edit "${tag.name}" tag`,
        "aria-label": "Edit tag",
        role: "button",
        tabindex: "0",
      },
    });
    setIcon(editButton, "pencil");

    const deleteButton = tagItem.createDiv({
      cls: "rss-dashboard-tag-action-button rss-dashboard-tag-delete-button clickable-icon",
      attr: {
        title: `Delete "${tag.name}" tag`,
        "aria-label": "Delete tag",
        role: "button",
        tabindex: "0",
      },
    });
    setIcon(deleteButton, "trash");

    tagCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      const isChecked = (e.target as HTMLInputElement).checked;

      tagCheckbox.checked = isChecked;

      tagItem.classList.add("rss-dashboard-tag-item-processing");

      onTagAssignmentChange(tag, isChecked);

      window.setTimeout(() => {
        tagItem.classList.remove("rss-dashboard-tag-item-processing");
      }, 200);
    });

    tagItem.addEventListener("click", (e) => {
      if (
        e.target === tagCheckbox ||
        (e.target instanceof Element &&
          (e.target.closest(".rss-dashboard-tag-edit-button") ||
            e.target.closest(".rss-dashboard-tag-delete-button")))
      ) {
        return;
      }

      const isChecked = !tagCheckbox.checked;
      tagCheckbox.checked = isChecked;

      tagItem.classList.add("rss-dashboard-tag-item-processing");

      onTagAssignmentChange(tag, isChecked);

      window.setTimeout(() => {
        tagItem.classList.remove("rss-dashboard-tag-item-processing");
      }, 200);
    });

    editButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showEditTagModal({
        settings,
        tag,
        onSave: async () => {
          persistSettings();
          notifySettingsTagsMutated();
          rerenderTagItems();
        },
      });
    });

    deleteButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteTagFromProfile(tag);
      tagItem.remove();
    });

    tagItem.appendChild(tagCheckbox);
    tagItem.appendChild(tagLabel);
    tagItem.appendChild(editButton);
    tagItem.appendChild(deleteButton);
  };

  const rerenderTagItems = () => {
    tagsListContainer.empty();
    for (const nextTag of settings.availableTags) {
      appendTagItem(nextTag);
    }
    updateTagSeparatorVisibility();
  };

  for (const tag of settings.availableTags) {
    appendTagItem(tag);
  }
  updateTagSeparatorVisibility();

  if (!isMobile) {
    const inlineAddRow = portalDropdown.createDiv({
      cls: "rss-dashboard-tag-inline-add-row",
    });

    const colorInput = inlineAddRow.createEl("input", {
      attr: {
        type: "color",
        value: "#3498db",
      },
      cls: "rss-dashboard-tag-inline-color",
    });

    const nameInput = inlineAddRow.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Add new tag...",
        autocomplete: "off",
      },
      cls: "rss-dashboard-tag-inline-input",
    });
    nameInput.spellcheck = false;

    const addButton = inlineAddRow.createDiv({
      cls: "rss-dashboard-tag-inline-button clickable-icon",
      attr: { title: "Add tag", role: "button", tabindex: "0" },
    });
    setIcon(addButton, "plus");

    const settingsButton = inlineAddRow.createDiv({
      cls: "rss-dashboard-tag-inline-settings rss-dashboard-tag-inline-button clickable-icon",
      attr: {
        title: "Tag settings",
        "aria-label": "Open tag settings",
        role: "button",
        tabindex: "0",
      },
    });
    setIcon(settingsButton, "settings");

    const submitInlineTag = () => {
      const tagName = nameInput.value.trim();
      const tagColor = colorInput.value;

      if (!tagName) {
        new Notice("Please enter a tag name!");
        return;
      }

      if (
        settings.availableTags.some(
          (existingTag) =>
            existingTag.name.toLowerCase() === tagName.toLowerCase(),
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
      persistSettings();
      notifySettingsTagsMutated();
      onTagAssignmentChange(newTag, true);
      appendTagItem(newTag, true);

      nameInput.value = "";
      requestAnimationFrame(() => nameInput.focus());
      new Notice(`Tag "${tagName}" added`);
    };

    addButton.addEventListener("click", (e) => {
      e.stopPropagation();
      submitInlineTag();
    });

    addButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        submitInlineTag();
      }
    });

    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        submitInlineTag();
      }
    });

    const openTagsSettingsFromInlineRow = (e: Event) => {
      e.stopPropagation();
      closeDropdown();
      openTagsSettings();
    };

    settingsButton.addEventListener("click", (e) => {
      e.preventDefault();
      openTagsSettingsFromInlineRow(e);
    });

    settingsButton.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openTagsSettingsFromInlineRow(e);
      }
    });
  }

  targetBody.appendChild(portalDropdown);
  portalDropdown.addClass("rss-dashboard-tags-dropdown-content-portal");

  let removeDesktopListener: (() => void) | null = null;
  let removeViewportListener: (() => void) | null = null;
  let isClosed = false;

  function closeDropdown(): void {
    if (isClosed) {
      return;
    }
    isClosed = true;
    portalDropdown.remove();
    sheetBackdrop?.remove();
    removeDesktopListener?.();
    removeDesktopListener = null;
    removeViewportListener?.();
    removeViewportListener = null;
    onClosed?.();
  }

  if (isMobile) {
    const syncMobileViewportHeight = () => {
      const vvp = targetWindow.visualViewport;
      const viewportHeight = vvp?.height ?? targetWindow.innerHeight;
      portalDropdown.style.setProperty(
        "max-height",
        `${viewportHeight - 16}px`,
        "important",
      );
    };
    syncMobileViewportHeight();

    const visualViewport = targetWindow.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener("resize", syncMobileViewportHeight);
      visualViewport.addEventListener("scroll", syncMobileViewportHeight);
      removeViewportListener = () => {
        visualViewport.removeEventListener("resize", syncMobileViewportHeight);
        visualViewport.removeEventListener("scroll", syncMobileViewportHeight);
      };
    } else {
      targetWindow.addEventListener("resize", syncMobileViewportHeight);
      removeViewportListener = () => {
        targetWindow.removeEventListener("resize", syncMobileViewportHeight);
      };
    }

    if (sheetBackdrop) {
      sheetBackdrop.addEventListener("click", () => {
        closeDropdown();
      });
    }

    return closeDropdown;
  }

  const rect = anchor.getBoundingClientRect();
  const dropdownRect = portalDropdown.getBoundingClientRect();
  const containerForBounds = appContainer ?? anchor;
  const boundsContainer =
    containerForBounds.closest(".workspace-leaf-content") || targetBody;
  const boundsRect = boundsContainer.getBoundingClientRect();

  let left = rect.right;
  let top = rect.top;

  if (left + dropdownRect.width > boundsRect.right) {
    left = rect.left - dropdownRect.width;
  }

  if (left < boundsRect.left) {
    left = boundsRect.left;
  }

  if (top + dropdownRect.height > targetWindow.innerHeight) {
    top = targetWindow.innerHeight - dropdownRect.height - 5;
  }

  portalDropdown.style.left = `${left}px`;
  portalDropdown.style.top = `${top}px`;

  targetWindow.setTimeout(() => {
    if (isClosed) {
      return;
    }
    const handleClickOutside = (ev: MouseEvent) => {
      if (portalDropdown && !portalDropdown.contains(ev.target as Node)) {
        closeDropdown();
      }
    };
    targetDocument.addEventListener("mousedown", handleClickOutside);
    removeDesktopListener = () => {
      targetDocument.removeEventListener("mousedown", handleClickOutside);
    };
  }, 0);

  return closeDropdown;
}
