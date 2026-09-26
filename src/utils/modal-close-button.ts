/**
 * Class names of Obsidian's built-in modal close button. Obsidian 1.13.7
 * renders it as `.modal-header-button`, a direct child of `modalEl`. Older
 * releases used `.modal-close-button`; that name is kept for the minimum
 * supported version, where the current class is unverified (#372).
 */
const NATIVE_CLOSE_BUTTON_SELECTOR = ".modal-header-button, .modal-close-button";

/** Removes Obsidian's built-in close button from a modal's `modalEl`. */
export function removeNativeModalCloseButton(modalEl: HTMLElement): void {
  for (const child of Array.from(modalEl.children)) {
    if (child.matches(NATIVE_CLOSE_BUTTON_SELECTOR)) {
      child.remove();
    }
  }
}
