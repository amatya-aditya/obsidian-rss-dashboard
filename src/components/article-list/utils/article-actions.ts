import { Notice, setIcon, setTooltip } from "obsidian";
import { withBindingHint } from "../../../hotkeys/keymap";
import { createIconButton } from "../../../utils/icon-button";
import {
  resolveSaveVersion,
  SAVED_ARTICLE_TOOLTIP,
  saveVersionTooltip,
} from "../../../utils/save-version";
import { showSaveOptionsMenu, type CustomSaveHooks } from "./save-options-menu";
import type {
  ArticleSavingSettings,
  DisplaySettings,
  FeedItem,
  SavedTemplate,
} from "../../../types/types";

export interface ActionDependencies {
  showTagsDropdown(anchor: HTMLElement, article: FeedItem): void;
}

export type CreateActionButtonArgs = {
  article: FeedItem;
  actionToolbar: HTMLElement;
  mode: "full" | "minimal-read";
  /**
   * The saved template the article's save will use, so the save tooltip can
   * name the version that save writes (#1184).
   */
  savedTemplate?: SavedTemplate;
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
): HTMLButtonElement {
  const readToggle = createIconButton({
    parent: arg.actionToolbar,
    cls: `rss-dashboard-read-toggle clickable-icon ${arg.article.read ? "read" : "unread"}`,
    label: withBindingHint(
      arg.article.read ? "Mark as unread" : "Mark as read",
      "toggle-read",
    ),
    icon: arg.article.read ? "check-circle" : "circle",
  });

  const toggleRead = (e: Event) => {
    e.stopPropagation();
    const newReadState = !arg.article.read;
    arg.article.read = newReadState;
    arg.callbacks.onArticleUpdate?.(arg.article, { read: newReadState }, false);
    readToggle.classList.toggle("read", newReadState);
    readToggle.classList.toggle("unread", !newReadState);
    setIcon(readToggle, newReadState ? "check-circle" : "circle");
  };

  readToggle.addEventListener("click", toggleRead);
  return readToggle;
}

export function createSaveButton(
  arg: Pick<
    CreateActionButtonArgs,
    "article" | "actionToolbar" | "savedTemplate" | "settings" | "callbacks"
  >,
): HTMLButtonElement {
  const saveButton = createIconButton({
    parent: arg.actionToolbar,
    cls: `rss-dashboard-save-toggle clickable-icon ${arg.article.saved ? "saved" : ""}`,
    label: withBindingHint(
      arg.article.saved
        ? SAVED_ARTICLE_TOOLTIP
        : saveVersionTooltip(
            resolveSaveVersion(
              arg.settings.articleSaving ?? {},
              arg.savedTemplate,
            ),
          ),
      "save-article",
    ),
    icon: "save",
  });
  if (!saveButton.querySelector("svg")) {
    saveButton.textContent = "S";
  }

  const setSaving = (saving: boolean) => {
    if (saving) {
      saveButton.classList.add("saving");
      setTooltip(
        saveButton,
        withBindingHint("Saving article...", "save-article"),
      );
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
    setTooltip(
      saveButton,
      withBindingHint(SAVED_ARTICLE_TOOLTIP, "save-article"),
    );
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
  return saveButton;
}

export function createStarToggle(
  arg: Pick<CreateActionButtonArgs, "article" | "actionToolbar" | "callbacks">,
): HTMLButtonElement {
  const starToggle = createIconButton({
    parent: arg.actionToolbar,
    cls: `rss-dashboard-star-toggle clickable-icon ${arg.article.starred ? "starred" : "unstarred"}`,
    label: withBindingHint(
      arg.article.starred
        ? "Remove from starred items"
        : "Add to starred items",
      "toggle-star",
    ),
    icon: arg.article.starred ? "star" : "star-off",
  });
  // The icon lives in its own span so the list's in-place sync can swap it.
  starToggle.empty();
  const starIcon = starToggle.createSpan({
    cls: "rss-dashboard-star-icon",
  });
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

  starToggle.addEventListener("click", toggleStar);
  return starToggle;
}

export function createTagsToggle(
  arg: Pick<CreateActionButtonArgs, "article" | "actionToolbar" | "deps">,
): HTMLButtonElement {
  const tagsDropdown = arg.actionToolbar.createDiv({
    cls: "rss-dashboard-tags-dropdown",
  });
  const tagsToggle = createIconButton({
    parent: tagsDropdown,
    cls: "rss-dashboard-tags-toggle clickable-icon",
    label: withBindingHint("Manage tags", "toggle-tags"),
    icon: "tag",
    hasPopup: true,
    expanded: false,
  });
  const handleOpen = (e: Event) => {
    e.stopPropagation();
    arg.deps.showTagsDropdown(tagsToggle, arg.article);
  };
  tagsToggle.addEventListener("click", handleOpen);
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
