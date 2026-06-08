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

export function createReadToggle(arg: Pick<CreateActionButtonArgs, "article" | "actionToolbar">): HTMLElement {
  const readToggle = arg.actionToolbar.createDiv({
    cls: `rss-dashboard-read-toggle clickable-icon ${arg.article.read ? "read" : "unread"}`,
    attr: {
      title: arg.article.read ? "Mark as unread" : "Mark as read",
      role: "button",
      tabindex: "0",
      "aria-label": arg.article.read ? "Mark as unread" : "Mark as read",
    },
  });
  const handleToggle = () => {};
  toggleClickableIcon(readToggle, handleToggle);
  return readToggle;
}

export function createStarToggle(arg: Pick<CreateActionButtonArgs, "article" | "actionToolbar">): HTMLElement {
  const starToggle = arg.actionToolbar.createDiv({
    cls: `rss-dashboard-star-toggle clickable-icon ${arg.article.starred ? "starred" : "unstarred"}`,
    attr: {
      title: arg.article.starred ? "Remove from starred items" : "Add to starred items",
      role: "button",
      tabindex: "0",
      "aria-label": "Toggle star",
    },
  });
  const handleToggle = () => {};
  toggleClickableIcon(starToggle, handleToggle);
  return starToggle;
}

export function createTagsToggle(arg: Pick<CreateActionButtonArgs, "article" | "actionToolbar" | "deps">): HTMLElement {
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
  const handleOpen = (e: Event) => {
    e.stopPropagation();
    arg.deps.showTagsDropdown(tagsToggle, arg.article);
  };
  toggleClickableIcon(tagsToggle, handleOpen);
  return tagsToggle;
}

export function createActionButtons(arg: CreateActionButtonArgs): void {
  createReadToggle(arg);
  createStarToggle(arg);
  if (arg.mode === "minimal-read") {
    return;
  }
  createTagsToggle(arg);
}
