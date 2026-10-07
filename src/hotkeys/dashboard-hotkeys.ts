import { ItemView } from "obsidian";
import type { RssDashboardView } from "../views/dashboard-view";
import { dashboardCandidates, findDashboardBinding } from "./keymap";

/**
 * Returns true when a text editor or interactive control owns keyboard input.
 * Safe to use in bubbling-phase listeners.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  // `instanceof HTMLElement` is false for elements a popout window created,
  // so use Obsidian's cross-window Node.instanceOf.
  if (!isNode(target) || !target.instanceOf(HTMLElement)) return false;

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;

  // Obsidian's CodeMirror editor — not caught by tag checks
  if (target.closest(".cm-editor, .cm-content")) return true;

  // A bare tabindex is not a control: card titles, feed names, and summaries
  // take tabindex="0" only so keyboard users can reach their text. Every
  // custom control the plugin builds also carries one of these roles.
  return !!target.closest(
    'button, a[href], [role="button"], [role="combobox"], [role="link"], [role="option"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="slider"], [role="switch"], [role="tab"]',
  );
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

/**
 * What each dashboard binding in the keymap does. An action that returns
 * `false` leaves the key unhandled so it is not cancelled; every other
 * return value, `undefined` included, handles it.
 */
type DashboardAction = (view: RssDashboardView) => boolean | void;

export const DASHBOARD_ACTIONS: Readonly<Record<string, DashboardAction>> = {
  "refresh-feeds": (view) => {
    void view.actionRefreshFeeds();
  },
  // j and l move to the previous/next article and open it, matching the
  // Reader keymap; Space and Shift+Space only move the selection.
  "article-previous": (view) => {
    view.actionNavigatePrevious({ open: true });
  },
  "article-next": (view) => {
    view.actionNavigateNext({ open: true });
  },
  "select-next": (view) => {
    view.actionNavigateNext();
  },
  "select-previous": (view) => {
    view.actionNavigatePrevious();
  },
  "close-reader": (view) => {
    view.actionCloseReader();
  },
  // Only card view uses Left and Right; list and feed leave the key alone.
  "card-left": (view) => view.actionNavigateCard("left"),
  "card-right": (view) => view.actionNavigateCard("right"),
  "card-up": (view) => {
    view.actionNavigateCard("up");
  },
  "card-down": (view) => {
    view.actionNavigateCard("down");
  },
  "toggle-article-open": (view) => {
    view.actionToggleArticleOpen();
  },
  "toggle-read": (view) => {
    void view.actionToggleReadStatus();
  },
  "toggle-star": (view) => {
    void view.actionToggleStarStatus();
  },
  "toggle-tags": (view) => {
    view.actionToggleTagsMenu();
  },
  "save-article": (view) => {
    void view.actionSaveSelectedArticle();
  },
  "view-list": (view) => {
    view.actionSetViewStyle("list");
  },
  "view-card": (view) => {
    view.actionSetViewStyle("card");
  },
  "view-feed": (view) => {
    view.actionSetViewStyle("feed");
  },
  "mark-read-next": (view) => {
    void view.actionMarkReadAndNext();
  },
  "focus-sidebar": (view) => {
    view.actionFocusSidebar();
  },
  "focus-reader": (view) => {
    view.actionFocusReader();
  },
  "mark-all-read": (view) => {
    view.actionMarkAllAsRead();
  },
  "filter-all": (view) => {
    view.actionSetStatusFilter("all");
  },
  "filter-unread": (view) => {
    view.actionSetStatusFilter("unread");
  },
  "filter-read": (view) => {
    view.actionSetStatusFilter("read");
  },
  "open-help": (view) => {
    view.actionOpenShortcutHelp();
  },
  "sidebar-open": (view) => {
    view.actionSidebarOpenFocused();
  },
  "sidebar-previous-folder": (view) => {
    view.actionSidebarJumpPreviousFolder();
  },
  "sidebar-next-folder": (view) => {
    view.actionSidebarJumpNextFolder();
  },
  "sidebar-move-previous": (view) => {
    view.actionSidebarMovePrevious();
  },
  "sidebar-move-next": (view) => {
    view.actionSidebarMoveNext();
  },
  "sidebar-toggle-folder": (view) => {
    view.actionSidebarToggleFocusedFolder();
  },
  "sidebar-delete": (view) => {
    view.actionSidebarDeleteFocused();
  },
  "sidebar-rename": (view) => {
    view.actionSidebarRenameFocused();
  },
};

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
  // Guard 1: act only when this dashboard is the focused view, wherever it is
  // docked. getMostRecentLeaf() only searches the root split and popouts, so
  // it never matches a dashboard in a sidebar (#879).
  if (view.app.workspace.getActiveViewOfType(ItemView) !== view) return;

  // Guard 2: let a focused editor or control own its keyboard interactions.
  if (isInteractiveTarget(e.target)) return;

  // Guard 2b: a modal owns the keyboard until it closes
  if (isModalOpen(doc)) return;

  // Guard 3: skip OS modified keys (Ctrl/Cmd/Alt) to preserve native shortcuts
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // Guard 4: a held action key acts once, not on every auto-repeat. The key is
  // still swallowed, so the held press does not leak to another handler.
  if (e.repeat && dashboardCandidates(e).some((binding) => !binding.repeat)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const binding = findDashboardBinding(e, () => view.isSidebarFocused());
  const action = binding ? DASHBOARD_ACTIONS[binding.id] : undefined;
  if (!action) return;

  if (action(view) !== false) {
    e.preventDefault();
    // stop propagation to prevent other global events from handling it (since we acted on it)
    e.stopPropagation();
  }
}
