import { Scope } from "obsidian";
import type { RssDashboardView } from "../views/dashboard-view";

/**
 * Registers keyboard shortcuts scoped to the RSS Dashboard view.
 * Decouples the hotkey routing logic from the monolithic dashboard view.
 */
export function setupDashboardHotkeys(scope: Scope, view: RssDashboardView): void {
  // Pane focus
  scope.register(["Shift"], "s", (evt) => {
    evt.preventDefault();
    view.actionFocusSidebar();
    return true;
  });

  scope.register(["Shift"], "r", (evt) => {
    evt.preventDefault();
    if (view.isSidebarFocused()) {
      view.actionSidebarRenameFocused();
    } else {
      view.actionFocusReader();
    }
    return true;
  });

  // Refresh feed ('r')
  scope.register([], "r", (evt) => {
    evt.preventDefault();
    void view.actionRefreshFeeds();
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

  // Card Navigation ('ArrowLeft')
  scope.register([], "ArrowLeft", (evt) => {
    evt.preventDefault();
    if (view.isSidebarFocused()) {
      view.actionSidebarJumpPreviousFolder();
    } else {
      view.actionNavigateCard("left");
    }
    return true;
  });

  // Card Navigation ('ArrowRight')
  scope.register([], "ArrowRight", (evt) => {
    evt.preventDefault();
    if (view.isSidebarFocused()) {
      view.actionSidebarJumpNextFolder();
    } else {
      view.actionNavigateCard("right");
    }
    return true;
  });

  // Card Navigation ('ArrowUp')
  scope.register([], "ArrowUp", (evt) => {
    evt.preventDefault();
    if (view.isSidebarFocused()) {
      view.actionSidebarMovePrevious();
    } else {
      view.actionNavigateCard("up");
    }
    return true;
  });

  // Card Navigation ('ArrowDown')
  scope.register([], "ArrowDown", (evt) => {
    evt.preventDefault();
    if (view.isSidebarFocused()) {
      view.actionSidebarMoveNext();
    } else {
      view.actionNavigateCard("down");
    }
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
    if (view.isSidebarFocused()) {
      view.actionSidebarOpenFocused();
    } else {
      view.actionToggleArticleOpen();
    }
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

  scope.register(["Shift"], "j", (evt) => {
    evt.preventDefault();
    view.actionSidebarMovePrevious();
    return true;
  });

  scope.register(["Shift"], "l", (evt) => {
    evt.preventDefault();
    view.actionSidebarMoveNext();
    return true;
  });

  scope.register(["Shift"], "o", (evt) => {
    evt.preventDefault();
    view.actionSidebarOpenFocused();
    return true;
  });

  scope.register(["Shift"], "Enter", (evt) => {
    evt.preventDefault();
    view.actionSidebarOpenFocused();
    return true;
  });

  scope.register(["Shift"], "x", (evt) => {
    evt.preventDefault();
    view.actionSidebarToggleFocusedFolder();
    return true;
  });

  scope.register(["Shift"], "d", (evt) => {
    evt.preventDefault();
    view.actionSidebarDeleteFocused();
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
