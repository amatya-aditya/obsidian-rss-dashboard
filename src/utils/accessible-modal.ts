import { Modal } from "obsidian";

/**
 * The one base class for every plugin modal (#826, Slice 4).
 *
 * Obsidian's `Modal` supplies initial focus and Esc, and nothing else: no
 * `role="dialog"`, no `aria-modal`, no accessible name, no Tab containment, and
 * no focus return (checked on 1.14.4). This class adds those five things around
 * `open()` and `close()` and leaves initial focus and Esc to the host, so a
 * subclass changes `extends Modal` to `extends AccessibleModal` and nothing else.
 *
 * - The dialog role, `aria-modal` and the name sit on `containerEl`, which also
 *   holds the portal menus a modal mounts beside `modalEl`.
 * - The name comes from the modal's visible heading through `aria-labelledby`.
 *   A modal with no visible heading overrides `getDialogLabel()`.
 * - Tab and Shift+Tab wrap inside the open modal. The listener sits on the
 *   modal's own container, so a stacked modal only reacts to keys pressed in it.
 * - Closing returns focus to the element focused when the modal opened, if that
 *   element is still in the page and no other modal has taken focus.
 */

const TAB_STOP_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "audio[controls]",
  "video[controls]",
  '[contenteditable]:not([contenteditable="false"])',
  "[tabindex]",
].join(",");

const HEADING_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  '[role="heading"]',
  ".setting-item-heading .setting-item-name",
].join(",");

// Node.compareDocumentPosition flags, spelled out so a node from a popout
// window needs no cross-window `Node` global.
const POSITION_PRECEDING = 2;
const POSITION_FOLLOWING = 4;

let nextHeadingId = 0;

function isRendered(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ visibilityProperty: true });
  }
  const view = el.ownerDocument.defaultView;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.hidden) return false;
    const style = view?.getComputedStyle(node);
    if (style?.display === "none" || style?.visibility === "hidden") {
      return false;
    }
  }
  return true;
}

function hasCheckedPeer(radio: HTMLInputElement): boolean {
  if (!radio.name) return false;
  const root = radio.form ?? radio.ownerDocument;
  return Array.from(
    root.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ).some((peer) => peer.name === radio.name && peer.checked);
}

function isTabStop(el: HTMLElement): boolean {
  if (el.tabIndex < 0 || el.matches(":disabled") || el.closest("[inert]")) {
    return false;
  }
  if (el.matches('input[type="hidden"]')) return false;
  // A radio group is one tab stop: its checked member.
  if (el.matches('input[type="radio"]:not(:checked)')) {
    if (hasCheckedPeer(el as HTMLInputElement)) return false;
  }
  return isRendered(el);
}

function tabStopsIn(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(TAB_STOP_SELECTOR),
  ).filter(isTabStop);
}

/** Where Tab, or Shift+Tab, would leave the modal from `active`; else null. */
function wrapTarget(
  stops: HTMLElement[],
  active: Element | null,
  backwards: boolean,
  containerEl: HTMLElement,
): HTMLElement | null {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return null;
  // Focus on the container itself enters at the edge.
  if (active === containerEl) return backwards ? last : first;
  // Focus outside the container (a popup mounted elsewhere) runs its own keys.
  if (!active || !containerEl.contains(active)) return null;
  if (backwards) {
    const hasStopBefore = stops.some(
      (stop) =>
        stop !== active &&
        (stop.compareDocumentPosition(active) & POSITION_FOLLOWING) !== 0,
    );
    return hasStopBefore ? null : last;
  }
  const hasStopAfter = stops.some(
    (stop) =>
      stop !== active &&
      (stop.compareDocumentPosition(active) & POSITION_PRECEDING) !== 0,
  );
  return hasStopAfter ? null : first;
}

function focusIsOnAnotherModal(doc: Document): boolean {
  return doc.activeElement?.closest(".modal-container") != null;
}

export class AccessibleModal extends Modal {
  private opener: HTMLElement | null = null;
  private nameSource: HTMLElement | null = null;
  private nameObserver: MutationObserver | null = null;

  /**
   * The dialog's name for a modal that shows no heading. A visible heading
   * always wins; this is only the fallback.
   */
  protected getDialogLabel(): string | null {
    return null;
  }

  open(): void {
    // Opening an already-open modal keeps the first opener.
    this.opener ??= this.captureOpener();
    super.open();
    this.applyDialogSemantics();
    this.startFocusTrap();
    this.ensureFocusInside();
  }

  close(): void {
    const opener = this.opener;
    this.opener = null;
    this.stopFocusTrap();
    this.nameObserver?.disconnect();
    this.nameObserver = null;
    this.nameSource = null;
    super.close();
    this.returnFocus(opener);
  }

  private captureOpener(): HTMLElement | null {
    const active = activeDocument.activeElement;
    if (!active || active === activeDocument.body) return null;
    return active === activeDocument.documentElement
      ? null
      : (active as HTMLElement);
  }

  // A modal with no focusable control (the Discover feed preview) leaves focus
  // on <body>, where no key reaches the Tab handler. Park focus on the
  // container instead. A modal that took focus itself is left alone.
  private ensureFocusInside(): void {
    const active = this.containerEl.ownerDocument.activeElement;
    if (active && this.containerEl.contains(active)) return;
    this.containerEl.focus({ preventScroll: true });
  }

  private returnFocus(opener: HTMLElement | null): void {
    if (!opener?.isConnected) return;
    if (focusIsOnAnotherModal(opener.ownerDocument)) return;
    opener.focus();
  }

  private applyDialogSemantics(): void {
    this.containerEl.setAttribute("role", "dialog");
    this.containerEl.setAttribute("aria-modal", "true");
    // A click on non-interactive modal text drops focus to <body>, where Tab
    // would walk into the page behind. With a tabindex, the click focuses the
    // container instead, so the key handler below still sees the Tab. -1 keeps
    // it out of the Tab order.
    this.containerEl.setAttribute("tabindex", "-1");
    this.syncDialogName();
    // A modal that redraws its content swaps the heading element; follow it.
    this.nameObserver?.disconnect();
    this.nameObserver = new MutationObserver(() => this.syncDialogName());
    this.nameObserver.observe(this.containerEl, {
      childList: true,
      subtree: true,
    });
  }

  private syncDialogName(): void {
    const current = this.nameSource;
    if (current?.isConnected && this.containerEl.contains(current)) return;
    const heading = this.findHeading();
    this.nameSource = heading;
    if (heading) {
      if (!heading.id)
        heading.id = `rss-dashboard-modal-heading-${++nextHeadingId}`;
      this.containerEl.setAttribute("aria-labelledby", heading.id);
      this.containerEl.removeAttribute("aria-label");
      return;
    }
    this.containerEl.removeAttribute("aria-labelledby");
    const label = this.getDialogLabel();
    if (label) {
      this.containerEl.setAttribute("aria-label", label);
    } else {
      this.containerEl.removeAttribute("aria-label");
    }
  }

  private findHeading(): HTMLElement | null {
    if (this.titleEl?.textContent?.trim()) return this.titleEl;
    const headings =
      this.contentEl.querySelectorAll<HTMLElement>(HEADING_SELECTOR);
    for (const heading of Array.from(headings)) {
      if (heading.textContent?.trim()) return heading;
    }
    return null;
  }

  private startFocusTrap(): void {
    this.containerEl.addEventListener("keydown", this.handleTrapKeydown);
  }

  private stopFocusTrap(): void {
    this.containerEl.removeEventListener("keydown", this.handleTrapKeydown);
  }

  // Bubble phase on the modal's own container, so a widget inside the modal
  // that handles Tab itself (a suggest list, a menu) has already run and can
  // opt out with preventDefault. Nothing is attached to the document, and a
  // stacked modal only sees keys pressed inside itself.
  private readonly handleTrapKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || event.defaultPrevented) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const stops = tabStopsIn(this.containerEl);
    if (stops.length === 0) {
      // Nothing to tab to: keep focus here rather than let it leave.
      event.preventDefault();
      this.containerEl.focus({ preventScroll: true });
      return;
    }
    const target = wrapTarget(
      stops,
      this.containerEl.ownerDocument.activeElement,
      event.shiftKey,
      this.containerEl,
    );
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
}
