import type { RssDashboardView } from "../views/dashboard-view";

/**
 * Returns true when the event target is an interactive typing element.
 * Safe to use in bubbling-phase listeners.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;

  // Obsidian's CodeMirror editor — not caught by tag checks
  if (target.closest('.cm-editor, .cm-content')) return true;

  return false;
}

/**
 * Registers keyboard shortcuts scoped to the RSS Dashboard view.
 * Decouples the hotkey routing logic from the monolithic dashboard view.
 * Uses a bubbling-phase document listener to avoid Obsidian Scope capture-phase issues.
 */
export function setupDashboardHotkeys(view: RssDashboardView): void {
  view.registerDomEvent(activeDocument, "keydown", (e: KeyboardEvent) => {
    if (view.app.workspace.getMostRecentLeaf()?.view !== view) return;

    // Guard 2: user is typing somewhere — let the input own the event
    if (isTypingTarget(e.target)) return;

    // Guard 3: skip OS modified keys (Ctrl/Cmd/Alt) to preserve native shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key;
    const shift = e.shiftKey;

    let handled = false;

    if (shift) {
      switch (key) {
        case "S":
          view.actionFocusSidebar();
          handled = true;
          break;
        case "R":
          if (view.isSidebarFocused()) {
            view.actionSidebarRenameFocused();
          } else {
            view.actionFocusReader();
          }
          handled = true;
          break;
        case " ": // Shift + Space
          view.actionNavigatePrevious();
          handled = true;
          break;
        case "J":
          view.actionSidebarMovePrevious();
          handled = true;
          break;
        case "L":
          view.actionSidebarMoveNext();
          handled = true;
          break;
        case "O":
          view.actionSidebarOpenFocused();
          handled = true;
          break;
        case "Enter":
          view.actionSidebarOpenFocused();
          handled = true;
          break;
        case "X":
          view.actionSidebarToggleFocusedFolder();
          handled = true;
          break;
        case "D":
          view.actionSidebarDeleteFocused();
          handled = true;
          break;
        case "A":
          view.actionMarkAllAsRead();
          handled = true;
          break;
        case "!": // Shift + 1
          view.actionSetStatusFilter("all");
          handled = true;
          break;
        case "@": // Shift + 2
          view.actionSetStatusFilter("unread");
          handled = true;
          break;
        case "#": // Shift + 3
          view.actionSetStatusFilter("read");
          handled = true;
          break;
        case "?": // Shift + ?
          view.actionOpenShortcutHelp();
          handled = true;
          break;
      }
    } else {
      switch (key) {
        case "r":
          void view.actionRefreshFeeds();
          handled = true;
          break;
        case "j":
          view.actionNavigateNext();
          handled = true;
          break;
        case " ": // Space
          view.actionNavigateNext();
          handled = true;
          break;
        case "k":
          view.actionNavigatePrevious();
          handled = true;
          break;
        case "ArrowLeft":
          if (view.isSidebarFocused()) {
            view.actionSidebarJumpPreviousFolder();
          } else {
            view.actionNavigateCard("left");
          }
          handled = true;
          break;
        case "ArrowRight":
          if (view.isSidebarFocused()) {
            view.actionSidebarJumpNextFolder();
          } else {
            view.actionNavigateCard("right");
          }
          handled = true;
          break;
        case "ArrowUp":
          if (view.isSidebarFocused()) {
            view.actionSidebarMovePrevious();
          } else {
            view.actionNavigateCard("up");
          }
          handled = true;
          break;
        case "ArrowDown":
          if (view.isSidebarFocused()) {
            view.actionSidebarMoveNext();
          } else {
            view.actionNavigateCard("down");
          }
          handled = true;
          break;
        case "o":
          view.actionToggleArticleOpen();
          handled = true;
          break;
        case "Enter":
          if (view.isSidebarFocused()) {
            view.actionSidebarOpenFocused();
          } else {
            view.actionToggleArticleOpen();
          }
          handled = true;
          break;
        case "m":
          void view.actionToggleReadStatus();
          handled = true;
          break;
        case "f":
          void view.actionToggleStarStatus();
          handled = true;
          break;
        case "t":
          view.actionToggleTagsMenu();
          handled = true;
          break;
        case "s":
          void view.actionSaveSelectedArticle();
          handled = true;
          break;
        case "1":
          view.actionSetViewStyle("list");
          handled = true;
          break;
        case "2":
          view.actionSetViewStyle("card");
          handled = true;
          break;
case "3":
           view.actionSetViewStyle("feed");
           handled = true;
           break;
         case ",":
           void view.actionMarkReadAndNext();
           handled = true;
           break;
       }
     }

     if (handled) {
      e.preventDefault();
      // stop propagation to prevent other global events from handling it (since we acted on it)
      e.stopPropagation();
    }
  });
}
