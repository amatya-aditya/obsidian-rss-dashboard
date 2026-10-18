import type { FeedItem } from "../../../types/types";
import { createIconButton } from "../../../utils/icon-button";
import {
  COVER_IMAGE_FETCH_BUTTON_CLASS,
  COVER_IMAGE_FETCH_ICON,
  coverImageActionLabel,
} from "./cover-image-action";
import { withCoverImageBusyState } from "./cover-image-busy";

/**
 * The dashboard hooks this control needs to run the fetch (#1314). A structural
 * subset of `ViewDeps`, so a view can pass its deps straight through.
 */
export interface CoverImageFetchDeps {
  /** Fetches the page's cover image; resolves true when one was stored. */
  fetchCoverImage?(article: FeedItem): Promise<boolean>;
  /** Rebuilds one article's rendered element in place, after its data changed. */
  replaceArticle?(article: FeedItem): void;
}

export interface CoverImageFetchControlOptions {
  /** The tag region the control is appended to, after the tag container. */
  parent: HTMLElement;
  /** The article element that dims while the request runs. */
  articleEl: HTMLElement;
  article: FeedItem;
  deps: CoverImageFetchDeps;
  /** The surface this control rendered into, for its test hook. */
  region: string;
}

/**
 * The manual cover-image fetch control (#1314): the discoverable path to the
 * same action the context menu offers, shared by the card and the feed item so
 * the two cannot drift apart. It belongs to the article's tag row and sits at
 * its right end, after the tag chips and their `+n` overflow chip; the row
 * reserves its width whether or not the control is revealed. The stylesheet
 * reveals it on hover and on focus within the article (and always on a touch
 * screen), so it stays out of the way but is never hidden from the keyboard or
 * unreachable by touch.
 *
 * `parent` is the tag region, not the tag container: the layout pass empties and
 * re-measures that container, so a child of it would be wiped by the next pass
 * and its width would be counted by the `+n` measurement.
 */
export function renderCoverImageFetchControl({
  parent,
  articleEl,
  article,
  deps,
  region,
}: CoverImageFetchControlOptions): void {
  const runFetch = async (): Promise<void> => {
    const fetched = await withCoverImageBusyState(
      articleEl,
      () => deps.fetchCoverImage?.(article) ?? Promise.resolve(false),
    );
    if (fetched) deps.replaceArticle?.(article);
  };

  const button = createIconButton({
    label: coverImageActionLabel(article),
    icon: COVER_IMAGE_FETCH_ICON,
    parent,
    cls: COVER_IMAGE_FETCH_BUTTON_CLASS,
    action: "fetch-cover-image",
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
    void runFetch();
  });
}
