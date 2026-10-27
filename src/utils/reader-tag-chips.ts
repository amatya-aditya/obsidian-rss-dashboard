import type { Tag } from "../types/types";
import {
  applyTagAppearance,
  DEFAULT_TAG_APPEARANCE_SETTINGS,
  type TagAppearanceSettings,
} from "./tag-colors";

/**
 * Renders an article's tag chips in a Reader header, in place. Reuses the
 * existing chip container and removes it when no tags remain, so a tag-only
 * change never rebuilds the article body.
 */
export function renderReaderTagChips(
  headerContainer: HTMLElement,
  tags: readonly Tag[] | undefined,
  settings: TagAppearanceSettings = DEFAULT_TAG_APPEARANCE_SETTINGS,
): void {
  const existing = headerContainer.querySelector<HTMLElement>(
    ":scope > .rss-reader-tags",
  );

  if (!tags || tags.length === 0) {
    existing?.remove();
    return;
  }

  const tagsContainer =
    existing ?? headerContainer.createDiv({ cls: "rss-reader-tags" });

  tagsContainer.empty();
  for (const tag of tags) {
    const tagElement = tagsContainer.createDiv({ cls: "rss-reader-tag" });
    tagElement.textContent = tag.name;
    applyTagAppearance(tagElement, tag, settings);
  }
}

/** Re-renders the tag chips in the Reader header inside `container`, if any. */
export function refreshReaderHeaderTags(
  container: HTMLElement,
  tags: readonly Tag[] | undefined,
  settings: TagAppearanceSettings = DEFAULT_TAG_APPEARANCE_SETTINGS,
): void {
  const header = container.querySelector<HTMLElement>(
    ".rss-reader-article-header",
  );
  if (header) renderReaderTagChips(header, tags, settings);
}
