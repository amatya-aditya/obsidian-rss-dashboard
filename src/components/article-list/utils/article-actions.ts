import { Notice, setIcon } from "obsidian";
import type { ArticleSavingSettings, DisplaySettings, FeedItem } from "../../../types/types";

function toggleClickableIcon(
  el: HTMLElement,
  handler: (e: MouseEvent | KeyboardEvent) => void,
): void {
  el.addEventListener("click", handler);
  el.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler(e);
    }
  });
}

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
      title: arg.article.read ? "Mark as unread" : "Mark as read",
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

  toggleClickableIcon(readToggle, toggleRead);
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
      title: arg.article.saved
        ? "Click to open saved article"
        : arg.settings.articleSaving?.saveFullContent
          ? "Save full article content to notes"
          : "Save article summary to notes",
      role: "button",
      tabindex: "0",
      "aria-label": "Save article",
    },
  });
  setIcon(saveButton, "save");
  if (!saveButton.querySelector("svg")) {
    saveButton.textContent = "S";
  }

  const toggleSave = async (e: Event) => {
    e.stopPropagation();
    e.preventDefault();

    if (arg.article.saved) {
      if (arg.callbacks.onOpenSavedArticle) {
        await arg.callbacks.onOpenSavedArticle(arg.article);
      } else {
        new Notice("Article already saved. Look in your notes.");
      }
    } else if (arg.callbacks.onArticleSave) {
      if (saveButton.classList.contains("saving")) {
        return;
      }

      saveButton.classList.add("saving");
      saveButton.setAttribute("title", "Saving article...");

      try {
        await arg.callbacks.onArticleSave(arg.article);
        arg.article.saved = true;
        saveButton.classList.add("saved");
        setIcon(saveButton, "save");
        if (!saveButton.querySelector("svg")) {
          saveButton.textContent = "S";
        }
        saveButton.setAttribute("title", "Click to open saved article");
      } catch (error) {
        console.error("Failed to save article via card button:", error);
        new Notice("Failed to save article.");
      } finally {
        saveButton.classList.remove("saving");
      }
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
      title: arg.article.starred
        ? "Remove from starred items"
        : "Add to starred items",
      role: "button",
      tabindex: "0",
      "aria-label": "Toggle star",
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

  toggleClickableIcon(starToggle, toggleStar);
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
      title: "Manage tags",
      role: "button",
      tabindex: "0",
      "aria-label": "Manage tags",
    },
  });
  setIcon(tagsToggle, "tag");
  const handleOpen = (e: Event) => {
    e.stopPropagation();
    arg.deps.showTagsDropdown(tagsToggle, arg.article);
  };
  toggleClickableIcon(tagsToggle, handleOpen);
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
