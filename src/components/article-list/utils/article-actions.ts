import { Notice, setIcon, setTooltip } from "obsidian";
import { onActivate } from "../../../utils/keyboard-activation";
import { syncTagsToggleState } from "../../../utils/tags-dropdown-portal";
import { showSaveOptionsMenu, type CustomSaveHooks } from "./save-options-menu";
import type {
  ArticleSavingSettings,
  DisplaySettings,
  FeedItem,
} from "../../../types/types";

export interface ActionDependencies {
  showTagsDropdown(anchor: HTMLElement, article: FeedItem): void;
}

export type CreateActionButtonArgs = {
  article: FeedItem;
  actionToolbar: HTMLElement;
  mode: "full" | "minimal-read";
  settings: {
    articleSaving?: Partial<ArticleSavingSettings>;
    display?: Partial<DisplaySettings>;
  };
  callbacks: {
    onArticleUpdate?: (
      article: FeedItem,
      updates: Partial<FeedItem>,
      shouldRerender?: boolean,
    ) => void;
    onArticleSave?: (article: FeedItem) => Promise<void> | void;
    onArticleCustomSave?: (
      article: FeedItem,
      hooks: CustomSaveHooks,
    ) => Promise<void> | void;
    onOpenSavedArticle?: (article: FeedItem) => Promise<void> | void;
    onOpenInReaderView?: (article: FeedItem) => void;
    onArticleClick?: (article: FeedItem) => void;
    onOpenInBrowser?: (article: FeedItem) => void;
    onMarkPageAsRead?: () => void;
    onMarkAllAsRead?: () => void;
    onMarkAllAsUnread?: () => void;
    onPersistSettings?: () => Promise<void> | void;
  };
  deps: ActionDependencies;
};

export function createReadToggle(
  arg: Pick<CreateActionButtonArgs, "article" | "actionToolbar" | "callbacks">,
): HTMLElement {
  const readToggle = arg.actionToolbar.createDiv({
    cls: `rss-dashboard-read-toggle clickable-icon ${arg.article.read ? "read" : "unread"}`,
    attr: {
      role: "button",
      tabindex: "0",
      "aria-label": arg.article.read ? "Mark as unread" : "Mark as read",
    },
  });
  setIcon(readToggle, arg.article.read ? "check-circle" : "circle");

  const toggleRead = (e: Event) => {
    e.stopPropagation();
    const newReadState = !arg.article.read;
    arg.article.read = newReadState;
    arg.callbacks.onArticleUpdate?.(arg.article, { read: newReadState }, false);
    readToggle.classList.toggle("read", newReadState);
    readToggle.classList.toggle("unread", !newReadState);
    setIcon(readToggle, newReadState ? "check-circle" : "circle");
  };

  onActivate(readToggle, toggleRead);
  return readToggle;
}

export function createSaveButton(
  arg: Pick<
    CreateActionButtonArgs,
    "article" | "actionToolbar" | "settings" | "callbacks"
  >,
): HTMLElement {
  const saveButton = arg.actionToolbar.createDiv({
    cls: `rss-dashboard-save-toggle clickable-icon ${arg.article.saved ? "saved" : ""}`,
    attr: {
      role: "button",
      tabindex: "0",
      "aria-label": arg.article.saved
        ? "Click to open saved article"
        : arg.settings.articleSaving?.saveFullContent
          ? "Save full article content to notes"
          : "Save article summary to notes",
    },
  });
  setIcon(saveButton, "save");
  if (!saveButton.querySelector("svg")) {
    saveButton.textContent = "S";
  }

  const setSaving = (saving: boolean) => {
    if (saving) {
      saveButton.classList.add("saving");
      setTooltip(saveButton, "Saving article...");
    } else {
      saveButton.classList.remove("saving");
    }
  };

  const markSaved = () => {
    arg.article.saved = true;
    saveButton.classList.add("saved");
    setIcon(saveButton, "save");
    if (!saveButton.querySelector("svg")) {
      saveButton.textContent = "S";
    }
    setTooltip(saveButton, "Click to open saved article");
  };

  const defaultSave = async () => {
    if (!arg.callbacks.onArticleSave) return;
    if (saveButton.classList.contains("saving")) {
      return;
    }

    setSaving(true);

    try {
      await arg.callbacks.onArticleSave(arg.article);
      // A save that wrote nothing (or was blocked) leaves the article unsaved.
      if (arg.article.saved) markSaved();
    } catch (error) {
      console.error("Failed to save article via card button:", error);
      new Notice("Failed to save article.");
    } finally {
      setSaving(false);
    }
  };

  const customSave = async () => {
    if (!arg.callbacks.onArticleCustomSave) return;
    if (saveButton.classList.contains("saving")) {
      return;
    }
    try {
      // The dialog marks the article saved itself; cancelling changes nothing.
      await arg.callbacks.onArticleCustomSave(arg.article, {
        onSavingChange: setSaving,
      });
    } catch (error) {
      console.error("Failed to save article via save dialog:", error);
      new Notice("Failed to save article.");
      setSaving(false);
    }
  };

  const toggleSave = async (e: UIEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (arg.article.saved) {
      if (arg.callbacks.onOpenSavedArticle) {
        await arg.callbacks.onOpenSavedArticle(arg.article);
      } else {
        new Notice("Article already saved. Look in your notes.");
      }
    } else if (arg.callbacks.onArticleCustomSave) {
      if (saveButton.classList.contains("saving")) {
        return;
      }
      showSaveOptionsMenu(e, saveButton, {
        onDefaultSave: () => void defaultSave(),
        onCustomSave: () => void customSave(),
      });
    } else {
      await defaultSave();
    }
  };

  saveButton.addEventListener("click", (e) => {
    void toggleSave(e);
  });
  saveButton.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void toggleSave(e);
    }
  });
  return saveButton;
}

export function createStarToggle(
  arg: Pick<CreateActionButtonArgs, "article" | "actionToolbar" | "callbacks">,
): HTMLElement {
  const starToggle = arg.actionToolbar.createDiv({
    cls: `rss-dashboard-star-toggle clickable-icon ${arg.article.starred ? "starred" : "unstarred"}`,
    attr: {
      role: "button",
      tabindex: "0",
      "aria-label": arg.article.starred
        ? "Remove from starred items"
        : "Add to starred items",
    },
  });
  const starIcon = starToggle.createSpan({
    cls: "rss-dashboard-star-icon",
  });
  starToggle.appendChild(starIcon);
  setIcon(starIcon, arg.article.starred ? "star" : "star-off");
  if (!starIcon.querySelector("svg")) {
    starIcon.textContent = arg.article.starred ? "*" : "o";
  }

  const toggleStar = (e: Event) => {
    e.stopPropagation();
    const newStarState = !arg.article.starred;
    arg.article.starred = newStarState;
    arg.callbacks.onArticleUpdate?.(
      arg.article,
      { starred: newStarState },
      false,
    );
    starToggle.classList.toggle("starred", newStarState);
    starToggle.classList.toggle("unstarred", !newStarState);
    const iconEl = starToggle.querySelector(".rss-dashboard-star-icon");
    if (iconEl) {
      setIcon(iconEl as HTMLElement, newStarState ? "star" : "star-off");
      if (!iconEl.querySelector("svg")) {
        iconEl.textContent = newStarState ? "*" : "o";
      }
    }
  };

  onActivate(starToggle, toggleStar);
  return starToggle;
}

export function createTagsToggle(
  arg: Pick<CreateActionButtonArgs, "article" | "actionToolbar" | "deps">,
): HTMLElement {
  const tagsDropdown = arg.actionToolbar.createDiv({
    cls: "rss-dashboard-tags-dropdown",
  });
  const tagsToggle = tagsDropdown.createDiv({
    cls: "rss-dashboard-tags-toggle clickable-icon",
    attr: {
      role: "button",
      tabindex: "0",
      "aria-label": "Manage tags",
      "aria-haspopup": "true",
      "aria-expanded": "false",
    },
  });
  setIcon(tagsToggle, "tag");
  syncTagsToggleState(tagsToggle, arg.article.tags);
  const handleOpen = (e: Event) => {
    e.stopPropagation();
    arg.deps.showTagsDropdown(tagsToggle, arg.article);
  };
  onActivate(tagsToggle, handleOpen);
  return tagsToggle;
}

export function createActionButtons(arg: CreateActionButtonArgs): void {
  createReadToggle(arg);
  if (arg.mode === "minimal-read") {
    return;
  }
  createSaveButton(arg);
  createStarToggle(arg);
  createTagsToggle(arg);
}
