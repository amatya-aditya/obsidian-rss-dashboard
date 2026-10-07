/**
 * The readiness flag a view puts on its root element once its first render has
 * finished (#842). A test harness or an assistive tool waits for the attribute
 * instead of a timeout.
 *
 * This is the one place `data-rss-ready` is written, in the same spirit as
 * the icon-button helper for the other `data-rss-*` hooks. The flag is a
 * convenience signal only: it never replaces an accessible path.
 */
const READY_ATTRIBUTE = "data-rss-ready";

/** Marks the view root as rendered. Safe to call again after a re-render. */
export function markViewReady(root: HTMLElement): void {
  root.setAttribute(READY_ATTRIBUTE, "");
}

/** Removes the flag, for a view that is closing. */
export function clearViewReady(root: HTMLElement): void {
  root.removeAttribute(READY_ATTRIBUTE);
}
