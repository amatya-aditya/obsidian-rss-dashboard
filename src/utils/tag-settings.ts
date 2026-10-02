import type { RssDashboardSettings, Tag } from "../types/types";

export function updateTagInSettings(
  settings: Readonly<RssDashboardSettings>,
  oldTag: Readonly<Tag>,
  newTagUpdate: Readonly<Partial<Tag>>,
): Tag[] {
  // Update the tag definition in availableTags
  const updatedTags = settings.availableTags.map((tag) => {
    if (tag.name === oldTag.name) {
      return { ...tag, ...newTagUpdate };
    }
    return tag;
  });

  // Mutable update is needed since the plugin settings object acts as a live reference
  settings.availableTags.length = 0;
  settings.availableTags.push(...updatedTags);

  // Update tag references in all existing articles
  for (const feed of settings.feeds) {
    for (const item of feed.items) {
      if (item.tags?.some((t) => t.name === oldTag.name)) {
        item.tags = item.tags.map((t) => {
          if (t.name === oldTag.name) {
            return { ...t, ...newTagUpdate };
          }
          return t;
        });
      }
    }
  }

  return updatedTags;
}
