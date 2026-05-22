import type { Tag } from "../types/types";

/**
 * Resolves an array of custom tag names to their full Tag objects by looking
 * them up in the given pool of available tags. Unknown names are dropped.
 *
 * Preserves the order of `customTagNames`, allowing duplicates to pass through
 * (the caller is responsible for deduplication if needed).
 */
export function resolveTagObjects(
  customTagNames: string[],
  availableTags: Tag[],
): Tag[] {
  const tagMap = new Map<string, Tag>(availableTags.map((t) => [t.name, t]));

  return customTagNames
    .map((name) => tagMap.get(name))
    .filter((tag): tag is Tag => tag !== undefined);
}
