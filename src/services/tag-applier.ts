import type { FeedItem, Tag } from "../types/types";

/**
 * Applies the given tags to all items in-place. Existing tags are preserved;
 * a tag is only appended when no existing tag in the item shares its name.
 */
export function applyTagsToItems(items: FeedItem[], tagsToApply: Tag[]): void {
  if (tagsToApply.length === 0) return;

  for (const item of items) {
    if (!Array.isArray(item.tags)) {
      item.tags = [];
    }

    const existingNames = new Set(item.tags.map((t) => t.name));

    for (const tag of tagsToApply) {
      if (!existingNames.has(tag.name)) {
        item.tags.push(tag);
        existingNames.add(tag.name);
      }
    }
  }
}

/**
 * Removes tags by name from all items in-place. Only tags whose name appears
 * in `tagNamesToRemove` are removed; all other tags are left untouched.
 */
export function removeTagsFromItemsByName(
  items: FeedItem[],
  tagNamesToRemove: string[],
): void {
  if (tagNamesToRemove.length === 0) return;

  const removeSet = new Set(tagNamesToRemove);

  for (const item of items) {
    if (!Array.isArray(item.tags)) continue;
    item.tags = item.tags.filter((t) => !removeSet.has(t.name));
  }
}
