import { Scope } from "obsidian";
import type { ReaderView } from "../views/reader-view";
import { readerBindings, type KeyBinding } from "./keymap";

/**
 * Returns whether a keyboard event came from an editable element.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  const ElementConstructor = activeDocument.defaultView?.Element;
  if (!ElementConstructor || !(target instanceof ElementConstructor))
    return false;

  return (
    target.matches("input, textarea, select") ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

// The Reader toolbar is a roving-tabindex toolbar: while one of its buttons has
// focus it owns these keys to move between the buttons.
const TOOLBAR_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/**
 * Returns whether a keyboard event came from a Reader toolbar button.
 */
function isToolbarTarget(target: EventTarget | null): boolean {
  const ElementConstructor = activeDocument.defaultView?.Element;
  if (!ElementConstructor || !(target instanceof ElementConstructor))
    return false;

  return target.closest(".rss-reader-actions") !== null;
}

type ReaderAction = (view: ReaderView) => void;

/** What each Reader binding in the keymap does. */
export const READER_ACTIONS: Readonly<Record<string, ReaderAction>> = {
  "scroll-up": (view) => view.actionScrollUp(),
  "scroll-down": (view) => view.actionScrollDown(),
  "scroll-left": (view) => view.actionScrollLeft(),
  "scroll-right": (view) => view.actionScrollRight(),
  "page-up": (view) => view.actionPageUp(),
  "page-down": (view) => view.actionPageDown(),
  "scroll-start": (view) => view.actionScrollToStart(),
  "scroll-end": (view) => view.actionScrollToEnd(),
  "zoom-in": (view) => view.actionZoomIn(),
  "zoom-out": (view) => view.actionZoomOut(),
  "zoom-reset": (view) => view.actionZoomReset(),
  "close-reader": (view) => view.actionToggleArticleOpen(),
  "focus-dashboard": (view) => view.actionFocusDashboard(),
  "focus-sidebar": (view) => view.actionFocusSidebar(),
  "focus-reader": (view) => view.actionFocusReader(),
  "article-previous": (view) => view.actionNavigatePrevious(),
  "article-next": (view) => view.actionNavigateNext(),
  "toggle-read": (view) => view.actionToggleReadStatus(),
  "mark-all-read": (view) => view.actionMarkAllAsRead(),
  "toggle-star": (view) => view.actionToggleStarStatus(),
  "toggle-tags": (view) => view.actionToggleTagsMenu(),
  "save-article": (view) => {
    void view.actionSaveCurrentArticle();
  },
  "mark-read-next": (view) => {
    void view.actionMarkReadAndNext();
  },
  "open-help": (view) => view.actionOpenShortcutHelp(),
};

/**
 * Registers keyboard shortcuts scoped to the RSS Reader view.
 * Decouples the hotkey routing logic from the monolithic reader view.
 */
export function setupReaderHotkeys(scope: Scope, view: ReaderView): void {
  const register = (
    binding: KeyBinding,
    handler: (event: KeyboardEvent) => boolean,
  ): void => {
    const { key } = binding;
    scope.register(binding.shift ? ["Shift"] : [], key, (event) => {
      // Scope passes through undefined; false would cancel typing in the field.
      if (isEditableTarget(event.target)) return;
      // Obsidian's keymap treats `undefined` as "not handled, try the next
      // scope" and any other return as handled (`false` also calls
      // preventDefault and stopPropagation), so stand aside with `undefined`
      // and let the key reach the toolbar's own keydown handler.
      if (TOOLBAR_KEYS.has(key) && isToolbarTarget(event.target))
        return undefined;
      // A held action key acts once per press. Scroll, zoom and article
      // navigation keys repeat. Report the held press handled so it does not
      // fall through to another scope.
      if (event.repeat && !binding.repeat) {
        event.preventDefault();
        return true;
      }
      return handler(event) !== false;
    });
  };

  for (const binding of readerBindings()) {
    const action = READER_ACTIONS[binding.id];
    if (!action) continue;
    register(binding, (evt) => {
      evt.preventDefault();
      action(view);
      return true;
    });
  }
}
