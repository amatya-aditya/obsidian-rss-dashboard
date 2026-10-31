/**
 * Class names of Obsidian's built-in modal close button. Obsidian 1.13.7 and
 * 1.14.4 render it as `.modal-header-button`, a direct child of `modalEl`.
 * Obsidian 1.8.7 still renders `.modal-close-button`, confirmed by probe on
 * 1.8.7 (#431); retain both names for compatibility across supported versions.
 */
const NATIVE_CLOSE_BUTTON_SELECTOR =
  ".modal-header-button, .modal-close-button";

/** Removes Obsidian's built-in close button from a modal's `modalEl`. */
export function removeNativeModalCloseButton(modalEl: HTMLElement): void {
  for (const child of Array.from(modalEl.children)) {
    if (child.matches(NATIVE_CLOSE_BUTTON_SELECTOR)) {
      child.remove();
    }
  }
}
