import type { FeedItem } from "../../../types/types";
import { withBindingHint } from "../../../hotkeys/keymap";
import { createIconButton } from "../../../utils/icon-button";
import {
  COVER_IMAGE_FETCH_BUTTON_CLASS,
  type CoverImageAction,
} from "./cover-image-action";
import {
  runCoverImageAction,
  type CoverImageActionDeps,
} from "./cover-image-run";

/**
 * The article elements whose current press began on the cover-image control
 * (#1529). A tap can start on the control and drift before release; the browser
 * then dispatches its click at the nearest common ancestor — the card or feed
 * item — where the control's own click handler never sees it, so the article's
 * open handler reads this to know where the press started.
 */
const controlPresses = new WeakSet<HTMLElement>();

function isInsideCoverImageControl(target: EventTarget | null): boolean {
  const element = target as Element | null;
  return !!element?.closest?.(`.${COVER_IMAGE_FETCH_BUTTON_CLASS}`);
}

/**
 * Opens the article on a click that did not begin on its cover-image control
 * (#1529). Shared by the card and the feed item, like the control itself, so
 * the two cannot drift apart. The guard clears on every click, so one stray
 * press cannot swallow the next open; a press that starts anywhere else also
 * clears it.
 */
export function attachArticleOpenHandler(
  articleEl: HTMLElement,
  openArticle: () => void,
): void {
  articleEl.addEventListener("pointerdown", (event: PointerEvent) => {
    if (isInsideCoverImageControl(event.target)) {
      controlPresses.add(articleEl);
      return;
    }
    controlPresses.delete(articleEl);
  });
  articleEl.addEventListener("pointercancel", () => {
    controlPresses.delete(articleEl);
  });
  articleEl.addEventListener("click", (event: MouseEvent) => {
    const beganInControl =
      controlPresses.has(articleEl) || isInsideCoverImageControl(event.target);
    controlPresses.delete(articleEl);
    if (beganInControl) return;
    openArticle();
  });
}

export interface CoverImageControlOptions {
  /** The tag region the control is appended to, after the tag container. */
  parent: HTMLElement;
  /** The article element that dims while a fetch runs. */
  articleEl: HTMLElement;
  article: FeedItem;
  deps: CoverImageActionDeps;
  /** The label, icon and role this article's state resolves to. */
  action: CoverImageAction;
  /** The surface this control rendered into, for its test hook. */
  region: string;
}

/**
 * The cover-image control (#1314, #1330): the discoverable path to the same
 * action the context menu offers, shared by the card and the feed item so the
 * two cannot drift apart. It belongs to the article's tag row and sits at its
 * right end, after the tag chips and their `+n` overflow chip; the row reserves
 * its width whether or not the control is revealed. The stylesheet reveals it
 * on hover and on focus within the article (and always on a touch screen), so
 * it stays out of the way but is never hidden from the keyboard or unreachable
 * by touch.
 *
 * The role follows the article's state: a fetch reads the article page and dims
 * the article while it runs, a restore recomputes the feed's cover from stored
 * data and has nothing to wait for. Both run through the one shared path the
 * keyboard shortcut uses (#1466).
 *
 * `parent` is the tag region, not the tag container: the layout pass empties and
 * re-measures that container, so a child of it would be wiped by the next pass
 * and its width would be counted by the `+n` measurement.
 */
export function renderCoverImageControl({
  parent,
  articleEl,
  article,
  deps,
  action,
  region,
}: CoverImageControlOptions): void {
  const button = createIconButton({
    // The tooltip names the key that runs the same action (#1467). Both roles
    // carry it, and it is added here rather than at the card and feed call
    // sites so the two cannot drift apart.
    label: withBindingHint(action.label, "cover-image-action"),
    icon: action.icon,
    parent,
    cls: COVER_IMAGE_FETCH_BUTTON_CLASS,
    action:
      action.role === "restore" ? "restore-cover-image" : "fetch-cover-image",
    region,
  });
  button.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      // Keep dashboard-wide shortcuts from taking over native button activation.
      event.stopPropagation();
    }
  });
  button.addEventListener("click", (event: MouseEvent) => {
    // The control handled this press, so it must not also count as one that
    // began outside it when the article's open handler runs next.
    controlPresses.delete(articleEl);
    // The article element itself opens the article on click.
    event.stopPropagation();
    void runCoverImageAction({ article, articleEl, deps }, action.role);
  });
}
