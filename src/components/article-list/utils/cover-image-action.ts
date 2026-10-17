import type { FeedItem } from "../../../types/types";

/**
 * The wording of the manual cover-image fetch (#1314), shared by its two entry
 * points so the control and the menu item never disagree. Sentence case, per
 * the UI text rules; "Replace" when the item already shows a cover.
 */
export function coverImageActionLabel(
  article: Pick<FeedItem, "coverImage">,
): string {
  return article.coverImage
    ? "Replace cover image from page"
    : "Fetch cover image from page";
}

/**
 * The icon both entry points use. `download` is carried by Obsidian 1.14.4 (see
 * `test_files/stubs/lucide-icons.ts`); the action pulls the image down from the
 * article page.
 */
export const COVER_IMAGE_FETCH_ICON = "download";
