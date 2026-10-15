/**
 * ARIA landmarks for the reading path (WCAG 2.2 1.3.1 Info and Relationships,
 * 2.4.1 Bypass Blocks; #826 AC-014g).
 *
 * A landmark is named from visible text with `aria-labelledby`, never
 * `aria-label`: Obsidian draws a hover tooltip from `aria-label`, and a
 * landmark is a large area that would show it on every hover.
 */

export type NamedLandmarkRole = "navigation" | "region";

let landmarkIdCounter = 0;

/** Gives `el` an id (keeping one it has) so another element can reference it. */
function ensureId(el: HTMLElement): string {
  if (!el.id) {
    landmarkIdCounter += 1;
    el.id = `rss-landmark-label-${landmarkIdCounter}`;
  }
  return el.id;
}

/**
 * Marks `el` as the page's `main` landmark. A view has one; it needs no name.
 */
export function markMainLandmark(el: HTMLElement): void {
  el.setAttr("role", "main");
}

/**
 * Marks `el` as a landmark of `role` named by the text of `label`, which must
 * be an element in the same document (visible or visually hidden).
 */
export function markNamedLandmark(
  el: HTMLElement,
  role: NamedLandmarkRole,
  label: HTMLElement,
): void {
  el.setAttr("role", role);
  el.setAttr("aria-labelledby", ensureId(label));
}
