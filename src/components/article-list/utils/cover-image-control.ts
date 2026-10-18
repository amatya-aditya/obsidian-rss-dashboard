import type { FeedItem } from "../../../types/types";
import { createIconButton } from "../../../utils/icon-button";
import {
  COVER_IMAGE_FETCH_BUTTON_CLASS,
  type CoverImageAction,
} from "./cover-image-action";
import { withCoverImageBusyState } from "./cover-image-busy";

/**
 * The dashboard hooks the cover-image control needs (#1314): whichever role the
 * article is in runs one of the two callbacks. A structural subset of
 * `ViewDeps`, so a view can pass its deps straight through.
 */
export interface CoverImageActionDeps {
  /** Fetches the page's cover image; resolves true when one was stored. */
  fetchCoverImage?(article: FeedItem): Promise<boolean>;
  /** Puts the feed's own cover back; resolves true when the item changed. */
  restoreCoverImage?(article: FeedItem): Promise<boolean>;
  /** Rebuilds one article's rendered element in place, after its data changed. */
  replaceArticle?(article: FeedItem): void;
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
 * data and has nothing to wait for.
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
  const runFetch = async (): Promise<void> => {
    const fetched = await withCoverImageBusyState(
      articleEl,
      () => deps.fetchCoverImage?.(article) ?? Promise.resolve(false),
    );
    if (fetched) deps.replaceArticle?.(article);
  };

  const runRestore = async (): Promise<void> => {
    const restored = (await deps.restoreCoverImage?.(article)) ?? false;
    if (restored) deps.replaceArticle?.(article);
  };

  const button = createIconButton({
    label: action.label,
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
    // The article element itself opens the article on click.
    event.stopPropagation();
    void (action.role === "restore" ? runRestore() : runFetch());
  });
}
