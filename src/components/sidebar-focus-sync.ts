/**
 * Roving Tab stop for the sidebar's rows, and the bridge from DOM focus to the
 * sidebar's own keyboard state (WCAG 2.2 2.4.3 Focus Order; #826 AC-014g).
 *
 * The rows (the "All feeds" row, folder headers and feed rows) are one Tab
 * stop: one row has `tabindex="0"`, the rest `-1`. Rows stay `role="link"`
 * (#1136); a flat list of links needs no `tree` restructure for this.
 *
 * A row reached with Tab then behaves as if it were reached with Shift+S:
 * the dashboard's arrow keys, Enter, Shift+X and Shift+F10 act on it. A row
 * focused by the mouse or touch does not, so a click keeps handing the arrow
 * keys to the article list as before.
 */
import { isDomNode } from "../utils/dom-node";

/** Rows inside a collapsed folder, or hidden by a sidebar search. */
const HIDDEN_ROW_SELECTOR =
  ".rss-dashboard-folder-feeds.collapsed, .rss-dashboard-search-hidden";

/** Dialogs and menus that borrow focus from a row and hand it back. */
const TRANSIENT_FOCUS_SELECTOR = ".modal-container, .menu";

/** Whether a row can hold the Tab stop: it is displayed, not collapsed away. */
export function isSidebarRowReachable(row: HTMLElement): boolean {
  return row.closest(HIDDEN_ROW_SELECTOR) === null;
}

/** Gives `stop` `tabindex="0"` and every other row `-1`. */
export function setSidebarTabStop(
  rows: readonly HTMLElement[],
  stop: HTMLElement | null,
): void {
  for (const row of rows) {
    const wanted = row === stop ? "0" : "-1";
    if (row.getAttribute("tabindex") !== wanted) {
      row.setAttribute("tabindex", wanted);
    }
  }
}

export interface SidebarFocusSyncHandlers {
  /** Keyboard focus landed on `target`, which may or may not be a row. */
  onKeyboardFocus: (target: HTMLElement) => void;
  /** Focus moved from the sidebar to elsewhere in the dashboard layout. */
  onFocusLeaveSidebar: () => void;
}

/**
 * Listens on the sidebar container (which outlives every render) and returns
 * the function that removes the listeners.
 */
export function attachSidebarFocusSync(
  container: HTMLElement,
  handlers: SidebarFocusSyncHandlers,
): () => void {
  let pointerActive = false;
  let pointerTimer: number | null = null;

  // A press focuses its target in the same task, before this timer runs.
  const onPointerDown = (): void => {
    pointerActive = true;
    if (pointerTimer !== null) window.clearTimeout(pointerTimer);
    pointerTimer = window.setTimeout(() => {
      pointerActive = false;
      pointerTimer = null;
    }, 0);
  };

  const onFocusIn = (event: FocusEvent): void => {
    if (pointerActive) return;
    const target = event.target;
    if (isDomNode(target) && target.instanceOf(HTMLElement)) {
      handlers.onKeyboardFocus(target);
    }
  };

  const onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget;
    if (!isDomNode(next) || container.contains(next)) return;
    // A dialog or menu opened from a row takes focus and gives it back, so the
    // keys stay with the sidebar. Focus anywhere else, the rest of the view or
    // Obsidian's own controls, ends it: it may later reach the article list
    // from there, where the arrow keys must move cards.
    const borrowed =
      next.instanceOf(HTMLElement) &&
      next.closest(TRANSIENT_FOCUS_SELECTOR) !== null;
    if (!borrowed) {
      handlers.onFocusLeaveSidebar();
    }
  };

  container.addEventListener("pointerdown", onPointerDown, true);
  container.addEventListener("focusin", onFocusIn);
  container.addEventListener("focusout", onFocusOut);

  return () => {
    if (pointerTimer !== null) window.clearTimeout(pointerTimer);
    container.removeEventListener("pointerdown", onPointerDown, true);
    container.removeEventListener("focusin", onFocusIn);
    container.removeEventListener("focusout", onFocusOut);
  };
}
