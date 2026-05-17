import { Scope } from "obsidian";
import type { ReaderView } from "../views/reader-view";

/**
 * Registers keyboard shortcuts scoped to the RSS Reader view.
 * Decouples the hotkey routing logic from the monolithic reader view.
 */
export function setupReaderHotkeys(scope: Scope, view: ReaderView): void {
  // Reader scrolling
  scope.register([], "ArrowUp", (evt) => {
    evt.preventDefault();
    view.actionScrollUp();
    return true;
  });

  scope.register([], "ArrowDown", (evt) => {
    evt.preventDefault();
    view.actionScrollDown();
    return true;
  });

  scope.register([], "ArrowLeft", (evt) => {
    evt.preventDefault();
    view.actionScrollLeft();
    return true;
  });

  scope.register([], "ArrowRight", (evt) => {
    evt.preventDefault();
    view.actionScrollRight();
    return true;
  });

  scope.register([], "PageUp", (evt) => {
    evt.preventDefault();
    view.actionPageUp();
    return true;
  });

  scope.register([], "PageDown", (evt) => {
    evt.preventDefault();
    view.actionPageDown();
    return true;
  });

  scope.register([], "Home", (evt) => {
    evt.preventDefault();
    view.actionScrollToStart();
    return true;
  });

  scope.register([], "End", (evt) => {
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
  scope.register([], "=", zoomInHandler);
  scope.register(["Shift"], "=", zoomInHandler);

  // Zoom Out ('-' / '_')
  const zoomOutHandler = (evt: KeyboardEvent) => {
    evt.preventDefault();
    view.actionZoomOut();
    return true;
  };
  scope.register([], "-", zoomOutHandler);
  scope.register(["Shift"], "-", zoomOutHandler);

  // Zoom Reset ('0')
  scope.register([], "0", (evt) => {
    evt.preventDefault();
    view.actionZoomReset();
    return true;
  });

  // Close article ('k')
  scope.register([], "k", (evt) => {
    evt.preventDefault();
    view.actionToggleArticleOpen();
    return true;
  });

  // Focus dashboard ('Shift + d')
  scope.register(["Shift"], "d", (evt) => {
    evt.preventDefault();
    view.actionFocusDashboard();
    return true;
  });

  // Previous article ('j')
  scope.register([], "j", (evt) => {
    evt.preventDefault();
    view.actionNavigatePrevious();
    return true;
  });

  // Next article ('l')

  scope.register([], "l", (evt) => {
    evt.preventDefault();
    view.actionNavigateNext();
    return true;
  });

  // Mark read/unread ('m')
  scope.register([], "m", (evt) => {
    evt.preventDefault();
    view.actionToggleReadStatus();
    return true;
  });

  // Mark all as read ('Shift + a')
  scope.register(["Shift"], "a", (evt) => {
    evt.preventDefault();
    view.actionMarkAllAsRead();
    return true;
  });

  // Star/unstar article ('f')
  scope.register([], "f", (evt) => {
    evt.preventDefault();
    view.actionToggleStarStatus();
    return true;
  });

  // Add tags to article ('t')
  scope.register([], "t", (evt) => {
    evt.preventDefault();
    view.actionToggleTagsMenu();
    return true;
  });

  // Save current article ('s')
  scope.register([], "s", (evt) => {
    evt.preventDefault();
    void view.actionSaveCurrentArticle();
    return true;
  });

  // Open Shortcut Help ('Shift + ?')
  scope.register(["Shift"], "?", (evt) => {
    evt.preventDefault();
    view.actionOpenShortcutHelp();
    return true;
  });
}
