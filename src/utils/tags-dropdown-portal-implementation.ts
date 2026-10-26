import { type App, Notice, setIcon } from "obsidian";
import type { Tag } from "../types/types";
import { DEFAULT_TAG_COLOR } from "./tag-colors";
import { showEditTagModal } from "./tag-utils";
import { createIconButton } from "./icon-button";
import { isNarrowViewport, windowInstanceOf } from "./platform-utils";
import { addInputClearButton } from "./input-clear-button";
import type { TagsDropdownPortalOptions } from "./tags-dropdown-portal";

const TAB_STOP_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface PortalContext {
  app: App;
  anchor: HTMLElement;
  settings: TagsDropdownPortalOptions["settings"];
  item: TagsDropdownPortalOptions["item"];
  onTagAssignmentChange: TagsDropdownPortalOptions["onTagAssignmentChange"];
  onPersistSettings: TagsDropdownPortalOptions["onPersistSettings"];
  onAfterSettingsTagsMutated: TagsDropdownPortalOptions["onAfterSettingsTagsMutated"];
  onTagEdited: TagsDropdownPortalOptions["onTagEdited"];
  onOpenTagsSettings: TagsDropdownPortalOptions["onOpenTagsSettings"];
  appContainer: HTMLElement | null | undefined;
  containTab: boolean;
  onOpen: TagsDropdownPortalOptions["onOpen"];
  onClosed: TagsDropdownPortalOptions["onClosed"];
  targetDocument: Document;
  targetBody: HTMLElement;
  targetWindow: Window;
  isMobile: boolean;
  mountEl: HTMLElement;
  sheetBackdrop: HTMLElement | null;
  portalDropdown: HTMLElement;
  anchorIsButton: boolean;
}

interface PortalContentContext extends PortalContext {
  tagsListContainer: HTMLElement;
  tagSeparator: HTMLElement;
}

interface PortalLifecycle {
  closeDropdown(restoreFocus?: boolean): void;
  isClosed(): boolean;
  activate(): void;
  setDesktopListener(disposer: (() => void) | null): void;
  setViewportListener(disposer: (() => void) | null): void;
}

function createPortalContext(
  options: TagsDropdownPortalOptions,
): PortalContext {
  const {
    app,
    anchor,
    settings,
    item,
    onTagAssignmentChange,
    onPersistSettings,
    onAfterSettingsTagsMutated,
    onTagEdited,
    onOpenTagsSettings,
    appContainer,
    containTab = false,
    onOpen,
    onClosed,
  } = options;
  const targetDocument = anchor.ownerDocument;
  const targetBody = targetDocument.body;
  const targetWindow = targetDocument.defaultView || activeWindow;
  const isMobile = isNarrowViewport(targetWindow);
  const mountEl = anchor.closest<HTMLElement>(".modal-container") ?? targetBody;

  targetDocument
    .querySelectorAll(
      ".rss-dashboard-tags-dropdown-content.rss-dashboard-tags-dropdown-content-portal, .rss-dashboard-tags-sheet-backdrop",
    )
    .forEach((el) => {
      (el as HTMLElement).parentNode?.removeChild(el);
    });

  const sheetBackdrop = isMobile
    ? mountEl.createDiv({ cls: "rss-dashboard-tags-sheet-backdrop" })
    : null;
  const portalDropdown = mountEl.createDiv({
    cls: "rss-dashboard-tags-dropdown-content rss-dashboard-tags-dropdown-content-portal",
    attr: { role: "group", "aria-label": "Manage tags", tabindex: "-1" },
  });
  const anchorIsButton = anchor.matches("button");
  return {
    app,
    anchor,
    settings,
    item,
    onTagAssignmentChange,
    onPersistSettings,
    onAfterSettingsTagsMutated,
    onTagEdited,
    onOpenTagsSettings,
    appContainer,
    containTab,
    onOpen,
    onClosed,
    targetDocument,
    targetBody,
    targetWindow,
    isMobile,
    mountEl,
    sheetBackdrop,
    portalDropdown,
    anchorIsButton,
  };
}

function createPortalContentContext(
  context: PortalContext,
): PortalContentContext {
  return {
    ...context,
    tagsListContainer: context.portalDropdown.createDiv({
      cls: "rss-dashboard-tag-list",
    }),
    tagSeparator: context.portalDropdown.createDiv({
      cls: "rss-dashboard-tag-item-separator",
    }),
  };
}

function addMobileSheetHeader(
  context: PortalContext,
  closeDropdown: PortalLifecycle["closeDropdown"],
): void {
  const { portalDropdown } = context;
  const close = closeDropdown;
  if (!context.isMobile) return;

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
    close();
    openTagsSettings(context);
  });
  const doneBtn = sheetActions.createEl("button", {
    cls: "rss-dashboard-tags-sheet-btn rss-dashboard-tags-sheet-btn-done",
    text: "Done",
  });
  doneBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeDropdown(true);
  });
}

function persistSettings(context: PortalContext): void {
  const result = context.onPersistSettings?.();
  if (result instanceof Promise) {
    void result;
  }
}

function notifySettingsTagsMutated(context: PortalContext): void {
  context.onAfterSettingsTagsMutated?.();
}

function openTagsSettings(context: PortalContext): void {
  const result = context.onOpenTagsSettings?.();
  if (result instanceof Promise) {
    void result;
  }
}

function updateTagSeparatorVisibility(context: PortalContentContext): void {
  const hasTags = context.settings.availableTags.length > 0;
  context.tagSeparator.style.display = hasTags ? "" : "none";
}

function deleteTagFromProfile(context: PortalContentContext, tag: Tag): void {
  const tagIndex = context.settings.availableTags.findIndex(
    (t) => t.name === tag.name,
  );
  if (tagIndex === -1) return;

  context.settings.availableTags.splice(tagIndex, 1);
  context.settings.feeds.forEach((feed) => {
    feed.items.forEach((feedItem) => {
      if (feedItem.tags) {
        feedItem.tags = feedItem.tags.filter((t) => t.name !== tag.name);
      }
    });
  });

  if (context.item.tags?.some((t) => t.name === tag.name)) {
    context.onTagAssignmentChange(tag, false);
  }

  persistSettings(context);
  notifySettingsTagsMutated(context);
  new Notice(`Tag "${tag.name}" deleted successfully!`);
  updateTagSeparatorVisibility(context);
}

function appendTagItem(
  context: PortalContentContext,
  tag: Tag,
  checkedOverride?: boolean,
): void {
  const tagItem = context.tagsListContainer.createDiv({
    cls: "rss-dashboard-tag-item",
  });
  const hasTag =
    checkedOverride ??
    (context.item.tags?.some((t) => t.name === tag.name) || false);
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

  createTagItemButtons(context, tag, tagItem);
  tagCheckbox.addEventListener("change", (e) => {
    e.stopPropagation();
    const isChecked = (e.target as HTMLInputElement).checked;
    tagCheckbox.checked = isChecked;
    tagItem.classList.add("rss-dashboard-tag-item-processing");
    context.onTagAssignmentChange(tag, isChecked);
    window.setTimeout(() => {
      tagItem.classList.remove("rss-dashboard-tag-item-processing");
    }, 200);
  });
  tagItem.addEventListener("click", (e) => {
    if (
      e.target === tagCheckbox ||
      (windowInstanceOf(e.target, Element) &&
        (e.target.closest(".rss-dashboard-tag-edit-button") ||
          e.target.closest(".rss-dashboard-tag-delete-button")))
    ) {
      return;
    }
    const isChecked = !tagCheckbox.checked;
    tagCheckbox.checked = isChecked;
    tagItem.classList.add("rss-dashboard-tag-item-processing");
    context.onTagAssignmentChange(tag, isChecked);
    window.setTimeout(() => {
      tagItem.classList.remove("rss-dashboard-tag-item-processing");
    }, 200);
  });
}

function createTagItemButtons(
  context: PortalContentContext,
  tag: Tag,
  tagItem: HTMLElement,
): void {
  createIconButton({
    parent: tagItem,
    cls: "rss-dashboard-tag-action-button rss-dashboard-tag-edit-button clickable-icon",
    label: "Edit tag",
    icon: "pencil",
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const previousTag = { ...tag };
      showEditTagModal({
        app: context.app,
        settings: context.settings,
        tag,
        onSave: async (updatedTag) => {
          persistSettings(context);
          notifySettingsTagsMutated(context);
          context.onTagEdited?.(previousTag, updatedTag);
          rerenderTagItems(context);
        },
      });
    },
  });
  const deleteButton = createIconButton({
    parent: tagItem,
    cls: "rss-dashboard-tag-action-button rss-dashboard-tag-delete-button clickable-icon",
    label: "Delete tag",
    icon: "trash",
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteTagFromProfile(context, tag);
      tagItem.remove();
    },
  });
  tagItem.appendChild(deleteButton);
}

function rerenderTagItems(context: PortalContentContext): void {
  context.tagsListContainer.empty();
  for (const nextTag of context.settings.availableTags) {
    appendTagItem(context, nextTag);
  }
  updateTagSeparatorVisibility(context);
}

function addInlineTagControls(
  context: PortalContentContext,
  closeDropdown: PortalLifecycle["closeDropdown"],
): void {
  if (context.isMobile) return;
  const inlineAddRow = context.portalDropdown.createDiv({
    cls: "rss-dashboard-tag-inline-add-row",
  });
  const colorInput = inlineAddRow.createEl("input", {
    attr: { type: "color", value: DEFAULT_TAG_COLOR },
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
  addInputClearButton(nameInput, { fill: true });

  const submitInlineTag = () => {
    const tagName = nameInput.value.trim();
    if (!tagName) {
      new Notice("Please enter a tag name!");
      return;
    }
    if (
      context.settings.availableTags.some(
        (existingTag) =>
          existingTag.name.toLowerCase() === tagName.toLowerCase(),
      )
    ) {
      new Notice("A tag with this name already exists!");
      return;
    }
    const newTag: Tag = { name: tagName, color: colorInput.value };
    context.settings.availableTags.push(newTag);
    persistSettings(context);
    notifySettingsTagsMutated(context);
    context.onTagAssignmentChange(newTag, true);
    appendTagItem(context, newTag, true);
    nameInput.value = "";
    window.requestAnimationFrame(() => nameInput.focus());
    new Notice(`Tag "${tagName}" added`);
  };

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      submitInlineTag();
    }
  });
  createIconButton({
    parent: inlineAddRow,
    cls: "rss-dashboard-tag-inline-button clickable-icon",
    label: "Add tag",
    icon: "plus",
    onClick: (e) => {
      e.stopPropagation();
      submitInlineTag();
    },
  });
  createIconButton({
    parent: inlineAddRow,
    cls: "rss-dashboard-tag-inline-settings rss-dashboard-tag-inline-button clickable-icon",
    label: "Open tag settings",
    icon: "settings",
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDropdown();
      openTagsSettings(context);
    },
  });
}

function addPortalContent(
  context: PortalContentContext,
  closeDropdown: PortalLifecycle["closeDropdown"],
): void {
  for (const tag of context.settings.availableTags) {
    appendTagItem(context, tag);
  }
  updateTagSeparatorVisibility(context);
  addInlineTagControls(context, closeDropdown);
}

function createPortalLifecycle(context: PortalContext): PortalLifecycle {
  let removeDesktopListener: (() => void) | null = null;
  let removeViewportListener: (() => void) | null = null;
  let isClosed = false;

  function handleEscape(ev: KeyboardEvent): void {
    if (ev.key !== "Escape") return;
    const focused = context.targetDocument.activeElement;
    const focusIsInMenu =
      !focused ||
      focused === context.targetBody ||
      context.portalDropdown.contains(focused) ||
      context.anchor.contains(focused);
    if (!focusIsInMenu) return;
    ev.preventDefault();
    ev.stopPropagation();
    closeDropdown(true);
  }

  function closeDropdown(restoreFocus = false): void {
    if (isClosed) return;
    isClosed = true;
    context.portalDropdown.remove();
    context.sheetBackdrop?.remove();
    removeDesktopListener?.();
    removeDesktopListener = null;
    removeViewportListener?.();
    removeViewportListener = null;
    context.targetDocument.removeEventListener("keydown", handleEscape, true);
    if (context.anchorIsButton) {
      context.anchor.setAttribute("aria-expanded", "false");
      if (restoreFocus) context.anchor.focus();
    }
    context.onClosed?.();
  }

  return {
    closeDropdown,
    isClosed: () => isClosed,
    activate: () => {
      context.targetDocument.addEventListener("keydown", handleEscape, true);
    },
    setDesktopListener: (disposer) => {
      removeDesktopListener = disposer;
    },
    setViewportListener: (disposer) => {
      removeViewportListener = disposer;
    },
  };
}

function focusMenu(context: PortalContext): void {
  const firstCheckbox = context.portalDropdown.querySelector<HTMLElement>(
    ".rss-dashboard-tag-checkbox",
  );
  (firstCheckbox ?? context.portalDropdown).focus({ preventScroll: true });
}

function notifyOpened(context: PortalContext): void {
  if (context.portalDropdown.isConnected) {
    context.onOpen?.(context.portalDropdown);
  }
}

function containTabInPortal(context: PortalContext): void {
  if (!context.containTab) return;
  context.portalDropdown.addEventListener("keydown", (ev) => {
    if (ev.key !== "Tab" || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    if (ev.defaultPrevented) return;
    const focused = context.targetDocument.activeElement;
    if (
      focused !== context.portalDropdown &&
      !context.portalDropdown.contains(focused)
    ) {
      return;
    }
    const stops = Array.from(
      context.portalDropdown.querySelectorAll<HTMLElement>(TAB_STOP_SELECTOR),
    ).filter((el) => el.tabIndex >= 0);
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last) {
      ev.preventDefault();
      context.portalDropdown.focus({ preventScroll: true });
      return;
    }
    const index =
      focused === context.portalDropdown
        ? -1
        : stops.indexOf(focused as HTMLElement);
    if (index === -1) {
      ev.preventDefault();
      (ev.shiftKey ? last : first).focus();
      return;
    }
    if (ev.shiftKey && index === 0) {
      ev.preventDefault();
      last.focus();
      return;
    }
    if (!ev.shiftKey && index === stops.length - 1) {
      ev.preventDefault();
      first.focus();
    }
  });
}

function positionMobilePortal(
  context: PortalContext,
  lifecycle: PortalLifecycle,
): () => void {
  const { portalDropdown, targetWindow } = context;
  portalDropdown.style.removeProperty("left");
  portalDropdown.style.removeProperty("top");
  portalDropdown.style.removeProperty("width");
  portalDropdown.style.removeProperty("min-width");
  portalDropdown.style.removeProperty("max-width");
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
    lifecycle.setViewportListener(() => {
      visualViewport.removeEventListener("resize", syncMobileViewportHeight);
      visualViewport.removeEventListener("scroll", syncMobileViewportHeight);
    });
  } else {
    targetWindow.addEventListener("resize", syncMobileViewportHeight);
    lifecycle.setViewportListener(() => {
      targetWindow.removeEventListener("resize", syncMobileViewportHeight);
    });
  }

  context.sheetBackdrop?.addEventListener("click", () => {
    lifecycle.closeDropdown();
  });
  focusMenu(context);
  notifyOpened(context);
  return () => lifecycle.closeDropdown();
}

function positionDesktopPortal(
  context: PortalContext,
  lifecycle: PortalLifecycle,
): () => void {
  const { portalDropdown, anchor, targetBody, targetWindow, targetDocument } =
    context;
  const rect = anchor.getBoundingClientRect();
  const dropdownRect = portalDropdown.getBoundingClientRect();
  const containerForBounds = context.appContainer ?? anchor;
  const boundsContainer =
    containerForBounds.closest(".workspace-leaf-content") || targetBody;
  const boundsRect = boundsContainer.getBoundingClientRect();
  let left = rect.right;
  let top = rect.top;
  if (left + dropdownRect.width > boundsRect.right) {
    left = rect.left - dropdownRect.width;
  }
  if (left < boundsRect.left) left = boundsRect.left;
  if (top + dropdownRect.height > targetWindow.innerHeight) {
    top = targetWindow.innerHeight - dropdownRect.height - 5;
  }
  portalDropdown.style.left = `${left}px`;
  portalDropdown.style.top = `${top}px`;
  focusMenu(context);
  notifyOpened(context);

  targetWindow.setTimeout(() => {
    if (lifecycle.isClosed()) return;
    const handleClickOutside = (ev: MouseEvent) => {
      if (
        portalDropdown &&
        !portalDropdown.contains(ev.target as Node) &&
        !(anchor && anchor.contains(ev.target as Node))
      ) {
        lifecycle.closeDropdown();
      }
    };
    targetDocument.addEventListener("mousedown", handleClickOutside);
    lifecycle.setDesktopListener(() => {
      targetDocument.removeEventListener("mousedown", handleClickOutside);
    });
  }, 0);
  return () => lifecycle.closeDropdown();
}

export function createTagsDropdownPortalImplementation(
  options: TagsDropdownPortalOptions,
): () => void {
  const context = createPortalContext(options);
  const lifecycle = createPortalLifecycle(context);
  const closeDropdown = (restoreFocus?: boolean) =>
    lifecycle.closeDropdown(restoreFocus);
  addMobileSheetHeader(context, closeDropdown);
  const contentContext = createPortalContentContext(context);
  addPortalContent(contentContext, closeDropdown);
  context.mountEl.appendChild(context.portalDropdown);
  context.portalDropdown.addClass("rss-dashboard-tags-dropdown-content-portal");
  if (context.anchorIsButton) {
    context.anchor.setAttribute("aria-expanded", "true");
  }
  lifecycle.activate();
  containTabInPortal(context);
  return context.isMobile
    ? positionMobilePortal(context, lifecycle)
    : positionDesktopPortal(context, lifecycle);
}
