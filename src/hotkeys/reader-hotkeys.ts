import { Scope } from "obsidian";
import type { ReaderView } from "../views/reader-view";

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

// Reader shortcuts that act once per press, with or without Shift.
const NO_REPEAT_KEYS = new Set([
  "k",
  "d",
  "s",
  "r",
  "m",
  "a",
  "f",
  "t",
  ",",
  "?",
  "0",
]);

/**
 * Returns whether a keyboard event came from a Reader toolbar button.
 */
function isToolbarTarget(target: EventTarget | null): boolean {
  const ElementConstructor = activeDocument.defaultView?.Element;
  if (!ElementConstructor || !(target instanceof ElementConstructor))
    return false;

  return target.closest(".rss-reader-actions") !== null;
}

/**
 * Registers keyboard shortcuts scoped to the RSS Reader view.
 * Decouples the hotkey routing logic from the monolithic reader view.
 */
export function setupReaderHotkeys(scope: Scope, view: ReaderView): void {
  const register: Scope["register"] = (modifiers, key, handler) =>
    scope.register(modifiers, key, (event, keymapHandler) => {
      // Scope passes through undefined; false would cancel typing in the field.
      if (isEditableTarget(event.target)) return;
      // Obsidian's keymap treats `undefined` as "not handled, try the next
      // scope" and any other return as handled (`false` also calls
      // preventDefault and stopPropagation), so stand aside with `undefined`
      // and let the key reach the toolbar's own keydown handler.
      if (
        key !== null &&
        TOOLBAR_KEYS.has(key) &&
        isToolbarTarget(event.target)
      )
        return undefined;
      // A held action key acts once per press. Scroll, zoom and article
      // navigation keys repeat. Report the held press handled so it does not
      // fall through to another scope.
      if (event.repeat && key !== null && NO_REPEAT_KEYS.has(key)) {
        event.preventDefault();
        return true;
      }
      return handler(event, keymapHandler) !== false;
    });
  // Reader scrolling
  register([], "ArrowUp", (evt) => {
    evt.preventDefault();
    view.actionScrollUp();
    return true;
  });

  register([], "ArrowDown", (evt) => {
    evt.preventDefault();
    view.actionScrollDown();
    return true;
  });

  register([], "ArrowLeft", (evt) => {
    evt.preventDefault();
    view.actionScrollLeft();
    return true;
  });

  register([], "ArrowRight", (evt) => {
    evt.preventDefault();
    view.actionScrollRight();
    return true;
  });

  register([], "PageUp", (evt) => {
    evt.preventDefault();
    view.actionPageUp();
    return true;
  });

  register([], "PageDown", (evt) => {
    evt.preventDefault();
    view.actionPageDown();
    return true;
  });

  register([], "Home", (evt) => {
    evt.preventDefault();
    view.actionScrollToStart();
    return true;
  });

  register([], "End", (evt) => {
    evt.preventDefault();
    view.actionScrollToEnd();
    return true;
  });

  // Zoom In ('=' / '+')
  const zoomInHandler = (evt: KeyboardEvent) => {
    evt.preventDefault();
    view.actionZoomIn();
    return true;
  };
  register([], "=", zoomInHandler);
  register(["Shift"], "=", zoomInHandler);

  // Zoom Out ('-' / '_')
  const zoomOutHandler = (evt: KeyboardEvent) => {
    evt.preventDefault();
    view.actionZoomOut();
    return true;
  };
  register([], "-", zoomOutHandler);
  register(["Shift"], "-", zoomOutHandler);

  // Zoom Reset ('0')
  register([], "0", (evt) => {
    evt.preventDefault();
    view.actionZoomReset();
    return true;
  });

  // Close article ('k')
  register([], "k", (evt) => {
    evt.preventDefault();
    view.actionToggleArticleOpen();
    return true;
  });

  // Focus dashboard ('Shift + d')
  register(["Shift"], "d", (evt) => {
    evt.preventDefault();
    view.actionFocusDashboard();
    return true;
  });

  // Focus sidebar ('Shift + s')
  register(["Shift"], "s", (evt) => {
    evt.preventDefault();
    view.actionFocusSidebar();
    return true;
  });

  // Focus reader ('Shift + r')
  register(["Shift"], "r", (evt) => {
    evt.preventDefault();
    view.actionFocusReader();
    return true;
  });

  // Previous article ('j')
  register([], "j", (evt) => {
    evt.preventDefault();
    view.actionNavigatePrevious();
    return true;
  });

  // Next article ('l')

  register([], "l", (evt) => {
    evt.preventDefault();
    view.actionNavigateNext();
    return true;
  });

  // Mark read/unread ('m')
  register([], "m", (evt) => {
    evt.preventDefault();
    view.actionToggleReadStatus();
    return true;
  });

  // Mark all as read ('Shift + a')
  register(["Shift"], "a", (evt) => {
    evt.preventDefault();
    view.actionMarkAllAsRead();
    return true;
  });

  // Star/unstar article ('f')
  register([], "f", (evt) => {
    evt.preventDefault();
    view.actionToggleStarStatus();
    return true;
  });

  // Add tags to article ('t')
  register([], "t", (evt) => {
    evt.preventDefault();
    view.actionToggleTagsMenu();
    return true;
  });

  // Save current article ('s')
  register([], "s", (evt) => {
    evt.preventDefault();
    void view.actionSaveCurrentArticle();
    return true;
  });

  // Mark read and open next article (',')
  register([], ",", (evt) => {
    evt.preventDefault();
    void view.actionMarkReadAndNext();
    return true;
  });

  // Open Shortcut Help ('Shift + ?')
  register(["Shift"], "?", (evt) => {
    evt.preventDefault();
    view.actionOpenShortcutHelp();
    return true;
  });
}
