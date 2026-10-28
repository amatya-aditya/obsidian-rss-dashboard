/**
 * Controls that open the menu through the Filters button, mapped to the one
 * the person used. The Filters button reads and clears its entry while its own
 * click runs, so an entry never outlives `openFilterMenuFrom`.
 */
const pendingOpeners = new WeakMap<HTMLElement, HTMLElement>();

/**
 * Opens the menu by activating `trigger` (the Filters button), on behalf of
 * another control such as the viewing-filters icon. The menu reports its open
 * state on `opener` too, and Esc returns focus to `opener` (WCAG 2.4.3).
 */
export function openFilterMenuFrom(
  trigger: HTMLElement,
  opener: HTMLElement,
): void {
  pendingOpeners.set(trigger, opener);
  try {
    trigger.click();
  } finally {
    pendingOpeners.delete(trigger);
  }
}

/** The control that asked `trigger` to open the menu, if any. */
export function takePendingFilterMenuOpener(
  trigger: HTMLElement,
): HTMLElement | undefined {
  const opener = pendingOpeners.get(trigger);
  pendingOpeners.delete(trigger);
  return opener;
}

export {
  ArticleFilterMenu,
  type ArticleFilterCallbacks,
  type FilterChangeEvent,
} from "./article-filter-menu-view";
