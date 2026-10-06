// Author normalization (#247 slice 5, ADR 0007, #290/#291). Feed parsers
// collect every author element; each one is cut at its first comma or pipe,
// which resolves the "Name, Title, Institution" and "Name | Dept" pollution
// measured in #290 without a page fetch.

const AUTHOR_SEPARATOR = /[,|]/;

/**
 * Cleans raw author-element text into one entry per author: each element is
 * cut at its first comma or pipe, trimmed, and empty or repeated names
 * (ignoring case) are dropped.
 */
export function splitAuthorElements(elements: readonly string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const element of elements) {
    const name = element.split(AUTHOR_SEPARATOR, 1)[0]?.trim() ?? "";
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** `FeedItem.author`: the cleaned names joined with ", ". */
export function joinAuthors(names: readonly string[]): string {
  return names.join(", ");
}

/** The text of each direct child of `parent` with the given tag name. */
export function childElementTexts(parent: Element, tagName: string): string[] {
  return Array.from(parent.children)
    .filter((child) => child.tagName === tagName)
    .map((child) => child.textContent ?? "");
}

/** Cleaned author names from the first of `tagNames` that yields any. */
export function authorsFromChildren(
  parent: Element,
  tagNames: readonly string[],
): string[] {
  for (const tagName of tagNames) {
    const names = splitAuthorElements(childElementTexts(parent, tagName));
    if (names.length > 0) return names;
  }
  return [];
}
