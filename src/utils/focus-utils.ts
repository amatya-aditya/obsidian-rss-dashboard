/**
 * Moves keyboard focus to `fallback` when `element` or one of its descendants
 * currently holds focus (#1538). Leaves focus alone when activeElement is
 * elsewhere, and does nothing when `fallback` is missing.
 */
export function moveFocusIfRemoved(
  element: HTMLElement | null | undefined,
  fallback: HTMLElement | null | undefined,
): void {
  if (!element || !fallback) return;
  const active = element.ownerDocument?.activeElement;
  if (active && element.contains(active)) {
    if (typeof fallback.focus === "function") {
      fallback.focus();
    }
  }
}
