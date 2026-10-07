/** A polite, visually hidden status region and the function that writes to it. */
export interface LiveRegion {
  /** The region element. It stays in the DOM for the life of its owner. */
  readonly el: HTMLElement;
  /**
   * Announces one message. Each call replaces the region's content with a
   * fresh node, so a message identical to the previous one is still announced
   * (a polite region says nothing when its text is unchanged).
   */
  announce(message: string): void;
}

/**
 * Appends a `role="status"`, `aria-live="polite"` region to `parent` (WCAG 2.2
 * 4.1.3 Status Messages). The caller supplies a class whose CSS hides it
 * visually; the region is never `display: none`, which would hide it from
 * assistive technology too.
 */
export function createLiveRegion(parent: HTMLElement, cls: string): LiveRegion {
  const el = parent.createDiv({
    cls,
    attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
  });
  return {
    el,
    announce(message: string): void {
      el.empty();
      el.createDiv({ text: message });
    },
  };
}
