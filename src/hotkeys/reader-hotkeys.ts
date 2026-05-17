import { Scope } from "obsidian";
import type { ReaderView } from "../views/reader-view";

/**
 * Registers keyboard shortcuts scoped to the RSS Reader view.
 * Decouples the hotkey routing logic from the monolithic reader view.
 */
export function setupReaderHotkeys(scope: Scope, view: ReaderView): void {
  // Zoom In ('+')
  const zoomInHandler = (evt: KeyboardEvent) => {
    evt.preventDefault();
    view.actionZoomIn();
    return true;
  };
  scope.register([], "+", zoomInHandler);
  scope.register(["Shift"], "+", zoomInHandler);
  scope.register([], "=", zoomInHandler);
  scope.register(["Shift"], "=", zoomInHandler);

  // Zoom Out ('-')
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

  // Next article ('j')
  scope.register([], "j", (evt) => {
    evt.preventDefault();
    view.actionNavigateNext();
    return true;
  });

  // Next article ('Space')
  scope.register([], " ", (evt) => {
    evt.preventDefault();
    view.actionNavigateNext();
    return true;
  });

  // Previous article ('k')
  scope.register([], "k", (evt) => {
    evt.preventDefault();
    view.actionNavigatePrevious();
    return true;
  });

  // Previous article ('Shift + Space')
  scope.register(["Shift"], " ", (evt) => {
    evt.preventDefault();
    view.actionNavigatePrevious();
    return true;
  });

  // Open/Close article ('o')
  scope.register([], "o", (evt) => {
    evt.preventDefault();
    view.actionToggleArticleOpen();
    return true;
  });

  // Open/Close article ('Enter')
  scope.register([], "Enter", (evt) => {
    evt.preventDefault();
    view.actionToggleArticleOpen();
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
