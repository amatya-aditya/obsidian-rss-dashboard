import type { RssDashboardView } from "../views/dashboard-view";

/**
 * Returns true when the event target is an interactive typing element.
 * Safe to use in bubbling-phase listeners.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  // `instanceof HTMLElement` is false for elements a popout window created,
  // so use Obsidian's cross-window Node.instanceOf.
  if (!isNode(target) || !target.instanceOf(HTMLElement)) return false;

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;

  // Obsidian's CodeMirror editor — not caught by tag checks
  if (target.closest(".cm-editor, .cm-content")) return true;

  return false;
}

/**
 * Returns true while an Obsidian modal is open in the given document, the one
 * hosting the dashboard. Obsidian's keymap gives an open modal's scope first
 * refusal in the capture phase, but that scope only claims Escape, so every
 * other key still bubbles to this listener. Obsidian mounts every modal as a
 * `.modal-container` directly under `<body>`, so a key pressed inside a modal
 * is covered too, without cross-window `instanceof` checks on the target.
 */
export function isModalOpen(doc: Document): boolean {
  return doc.body?.querySelector(":scope > .modal-container") != null;
}

function isNode(target: EventTarget | null): target is Node {
  return typeof (target as Partial<Node> | null)?.instanceOf === "function";
}

/**
 * Registers keyboard shortcuts scoped to the RSS Dashboard view.
 * Decouples the hotkey routing logic from the monolithic dashboard view.
 * Uses a bubbling-phase document listener to avoid Obsidian Scope capture-phase issues.
 *
 * The listener follows the view between windows: each document that has
 * hosted the dashboard gets one listener, and only the document the view
 * currently lives in acts on keys. Returns a function that attaches the
 * listener to the view's current document; call it once the view is in
 * the DOM, since a view restored into a popout is built before it moves.
 */
export function setupDashboardHotkeys(view: RssDashboardView): () => void {
  const listenedDocuments = new WeakSet<Document>();

  const listenOnHostDocument = (): void => {
    const doc = view.containerEl.ownerDocument;
    if (listenedDocuments.has(doc)) return;
    listenedDocuments.add(doc);
    view.registerDomEvent(doc, "keydown", (e: KeyboardEvent) => {
      // Guard 0: keys pressed in a window the dashboard has left
      if (doc !== view.containerEl.ownerDocument) return;
      handleKeydown(view, e, doc);
    });
  };

  listenOnHostDocument();
  view.register(view.containerEl.onWindowMigrated(listenOnHostDocument));
  return listenOnHostDocument;
}

function handleKeydown(
  view: RssDashboardView,
  e: KeyboardEvent,
  doc: Document,
): void {
  if (view.app.workspace.getMostRecentLeaf()?.view !== view) return;

  // Guard 2: user is typing somewhere — let the input own the event
  if (isTypingTarget(e.target)) return;

  // Guard 2b: a modal owns the keyboard until it closes
  if (isModalOpen(doc)) return;

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
}
