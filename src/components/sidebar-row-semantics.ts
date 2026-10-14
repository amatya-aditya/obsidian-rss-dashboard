/**
 * ARIA semantics for the sidebar's navigable rows: the "All feeds" row, folder
 * headers and feed rows (WCAG 2.2 4.1.2 Name, Role, Value; #826 AC-014b).
 *
 * Each row is a script-focusable `div` that opens a feed or a folder, so it is
 * exposed as a link: it keeps working when the row holds a real button (the
 * refresh button in "All feeds"), which a `button` role would hide from
 * assistive technology. The row is named from the elements that carry its
 * visible text, by `aria-labelledby`, never `aria-label`, because Obsidian
 * draws a hover tooltip from `aria-label` and would repeat the row's own text.
 *
 * Only the exact open feed or folder gets `aria-current`. A folder that merely
 * holds the open feed keeps its visual highlight but is not the current item.
 */

/** Elements that hold a row's visible name, per row kind. */
const NAME_SELECTOR = [
  ".rss-dashboard-feed-name",
  ".rss-dashboard-feed-folder-name",
  ".rss-dashboard-all-feeds-label",
].join(", ");

/** Elements that hold a row's unread-count badge, per row kind. */
const UNREAD_SELECTOR = [
  ".rss-dashboard-feed-unread-count",
  ".rss-dashboard-folder-unread-count",
  ".rss-dashboard-all-feeds-unread",
].join(", ");

export interface SidebarRowState {
  /** The row is the open feed, the open folder, or "All feeds" with no filter. */
  current: boolean;
  /**
   * Set for a folder row only. A folder with nothing inside (`expandable`
   * false) cannot expand, so it gets no `aria-expanded`, like a feed or
   * "All feeds".
   */
  folder?: { expandable: boolean; collapsed: boolean };
}

function ensureId(el: HTMLElement): string {
  if (!el.id) {
    el.id = `rss-sidebar-row-${Math.random().toString(36).slice(2)}`;
  }
  return el.id;
}

/**
 * Points the row's `aria-labelledby` at its name and unread badge, so the name
 * reads like the row looks ("Alpha 3") without the icon, chevron, error badge
 * or screen-reader-only text. Call it again after the badge is added or
 * removed in place.
 */
export function syncSidebarRowName(row: HTMLElement): void {
  const parts = [NAME_SELECTOR, UNREAD_SELECTOR]
    .map((selector) => row.querySelector<HTMLElement>(selector))
    .filter((el): el is HTMLElement => el !== null)
    .map(ensureId);
  if (parts.length > 0) {
    row.setAttr("aria-labelledby", parts.join(" "));
  } else {
    row.removeAttribute("aria-labelledby");
  }
}

/**
 * Gives a finished row (its name and badge already inside it) its role, name
 * and state.
 */
export function applySidebarRowSemantics(
  row: HTMLElement,
  state: SidebarRowState,
): void {
  row.setAttr("role", "link");
  syncSidebarRowName(row);
  if (state.current) {
    row.setAttr("aria-current", "true");
  }
  if (state.folder?.expandable) {
    row.setAttr("aria-expanded", String(!state.folder.collapsed));
  }
}

/**
 * Re-reads a folder header's `collapsed` class into `aria-expanded`. Collapsing
 * from a click and the temporary expansion a search makes both flip the class
 * in place, without redrawing the row. A header that never expands (no
 * `aria-expanded`) is left alone.
 */
export function syncFolderExpanded(folderHeader: HTMLElement): void {
  if (!folderHeader.hasAttribute("aria-expanded")) return;
  folderHeader.setAttr(
    "aria-expanded",
    String(!folderHeader.classList.contains("collapsed")),
  );
}
