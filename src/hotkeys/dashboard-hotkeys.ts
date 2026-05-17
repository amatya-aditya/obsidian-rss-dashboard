import { Scope } from "obsidian";
import type { RssDashboardView } from "../views/dashboard-view";

/**
 * Registers keyboard shortcuts scoped to the RSS Dashboard view.
 * Decouples the hotkey routing logic from the monolithic dashboard view.
 */
export function setupDashboardHotkeys(scope: Scope, view: RssDashboardView): void {
  // Refresh feed ('r')
  scope.register([], "r", (evt) => {
    evt.preventDefault();
    void view.actionRefreshFeeds();
    return true;
  });

  // Card Navigation ('ArrowLeft')
  scope.register([], "ArrowLeft", (evt) => {
    evt.preventDefault();
    view.actionNavigateCard("left");
    return true;
  });

  // Card Navigation ('ArrowRight')
  scope.register([], "ArrowRight", (evt) => {
    evt.preventDefault();
    view.actionNavigateCard("right");
    return true;
  });

  // Card Navigation ('ArrowUp')
  scope.register([], "ArrowUp", (evt) => {
    evt.preventDefault();
    view.actionNavigateCard("up");
    return true;
  });

  // Card Navigation ('ArrowDown')
  scope.register([], "ArrowDown", (evt) => {
    evt.preventDefault();
    view.actionNavigateCard("down");
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
    void view.actionToggleReadStatus();
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
    void view.actionToggleStarStatus();
    return true;
  });

  // Add tags to article ('t')
  scope.register([], "t", (evt) => {
    evt.preventDefault();
    view.actionToggleTagsMenu();
    return true;
  });

  // Save selected article ('s')
  scope.register([], "s", (evt) => {
    evt.preventDefault();
    void view.actionSaveSelectedArticle();
    return true;
  });


  // Filter: All ('Shift + 1')
  scope.register(["Shift"], "1", (evt) => {
    evt.preventDefault();
    view.actionSetStatusFilter("all");
    return true;
  });

  // Filter: Unread ('Shift + 2')
  scope.register(["Shift"], "2", (evt) => {
    evt.preventDefault();
    view.actionSetStatusFilter("unread");
    return true;
  });

  // Filter: Read ('Shift + 3')
  scope.register(["Shift"], "3", (evt) => {
    evt.preventDefault();
    view.actionSetStatusFilter("read");
    return true;
  });

  // View Style: List ('1')
  scope.register([], "1", (evt) => {
    evt.preventDefault();
    view.actionSetViewStyle("list");
    return true;
  });

  // View Style: Card ('2')
  scope.register([], "2", (evt) => {
    evt.preventDefault();
    view.actionSetViewStyle("card");
    return true;
  });

  // View Style: Feed ('3')
  scope.register([], "3", (evt) => {
    evt.preventDefault();
    view.actionSetViewStyle("feed");
    return true;
  });

  // Open Shortcut Help ('Shift + ?')
  scope.register(["Shift"], "?", (evt) => {
    evt.preventDefault();
    view.actionOpenShortcutHelp();
    return true;
  });
}
