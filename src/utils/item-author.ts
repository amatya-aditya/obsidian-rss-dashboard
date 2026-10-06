import type { FeedItem } from "../types/types";

/**
 * The author text to show or save: the cleaned `authors` list joined with ", "
 * when the item has one (#247 slice 5), else the stored `author` string.
 */
export function itemAuthorText(
  item: Pick<FeedItem, "author" | "authors">,
): string {
  const names = (item.authors ?? []).filter((name) => name.trim() !== "");
  return names.length > 0 ? names.join(", ") : (item.author ?? "");
}
