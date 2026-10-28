import type {
  Feed,
  Folder,
  MediaSettings,
  RssDashboardSettings,
  Tag,
} from "../types/types";

const MEDIA_TAG_LIST_KEYS = [
  "defaultVideoTags",
  "defaultYouTubeTags",
  "defaultPodcastTags",
  "defaultRssTags",
  "defaultSmallwebTags",
  "defaultMastodonTags",
] as const satisfies readonly (keyof MediaSettings)[];

const MEDIA_TAG_SINGLE_KEYS = [
  "defaultVideoTag",
  "defaultYouTubeTag",
  "defaultRssTag",
  "defaultSmallwebTag",
  "defaultMastodonTag",
] as const satisfies readonly (keyof MediaSettings)[];

export function mergeTagUpdate(tag: Tag, update: Readonly<Partial<Tag>>): Tag {
  const merged = { ...tag, ...update };
  for (const key of ["color", "textColor"] as const) {
    if (
      Object.prototype.hasOwnProperty.call(update, key) &&
      update[key] === undefined
    ) {
      delete merged[key];
    }
  }
  return merged;
}

/**
 * Applies a tag update to every folder auto-tag rule that uses the tag,
 * including nested subfolders. Folder rules re-apply their auto-tags on every
 * refresh, so a rename that skips them re-creates the old tag name.
 */
function updateFolderAutoTags(
  folders: readonly Folder[],
  oldTagName: string,
  newTagUpdate: Readonly<Partial<Tag>>,
): void {
  for (const folder of folders) {
    if (folder.autoTags?.some((tag) => tag.name === oldTagName)) {
      folder.autoTags = folder.autoTags.map((tag) =>
        tag.name === oldTagName ? mergeTagUpdate(tag, newTagUpdate) : tag,
      );
    }
    if (folder.subfolders?.length) {
      updateFolderAutoTags(folder.subfolders, oldTagName, newTagUpdate);
    }
  }
}

/**
 * Renames the tag in every per-feed custom tag list. Parsing resolves those
 * names against `availableTags` and drops unknown ones, so a rename that skips
 * them silently turns the feed's per-feed tagging off on the next refresh.
 */
function remapFeedCustomTags(
  feeds: readonly Feed[],
  oldTagName: string,
  newTagName: string,
): void {
  for (const feed of feeds) {
    if (feed.customTags?.includes(oldTagName)) {
      feed.customTags = feed.customTags.map((name) =>
        name === oldTagName ? newTagName : name,
      );
    }
  }
}

/**
 * Drops a renamed tag from the saved dashboard filter state. The agreed
 * behavior is that a tag filter clears on rename instead of following the new
 * name; clearing the stored list too keeps a dashboard that is closed during
 * the rename from reopening with a filter that matches nothing.
 */
function clearSavedTagFilter(
  settings: Readonly<RssDashboardSettings>,
  tagName: string,
): void {
  const { tagFilters } = settings.dashboardMultiFilters;
  if (!tagFilters.includes(tagName)) return;
  settings.dashboardMultiFilters.tagFilters = tagFilters.filter(
    (name) => name !== tagName,
  );
}

/**
 * Renames the tag in the Auto tagging default tag lists, both the plural
 * arrays and the legacy single values, so a rename does not orphan the media
 * defaults that reference it.
 */
function remapMediaTagNames(
  media: MediaSettings,
  oldTagName: string,
  newTagName: string,
): void {
  for (const key of MEDIA_TAG_LIST_KEYS) {
    const names = media[key];
    if (!Array.isArray(names)) continue;
    media[key] = names.map((name) => (name === oldTagName ? newTagName : name));
  }
  for (const key of MEDIA_TAG_SINGLE_KEYS) {
    if (media[key] === oldTagName) {
      media[key] = newTagName;
    }
  }
}

export function updateTagInSettings(
  settings: Readonly<RssDashboardSettings>,
  oldTag: Readonly<Tag>,
  newTagUpdate: Readonly<Partial<Tag>>,
): Tag[] {
  const trimmedName = newTagUpdate.name?.trim();
  const tagUpdate: Readonly<Partial<Tag>> =
    trimmedName === undefined
      ? newTagUpdate
      : { ...newTagUpdate, name: trimmedName };

  // Update the tag definition in availableTags
  const updatedTags = settings.availableTags.map((tag) => {
    if (tag.name === oldTag.name) {
      return mergeTagUpdate(tag, tagUpdate);
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
            return mergeTagUpdate(t, tagUpdate);
          }
          return t;
        });
      }
    }
  }

  updateFolderAutoTags(settings.folders, oldTag.name, tagUpdate);

  if (trimmedName && trimmedName !== oldTag.name) {
    remapFeedCustomTags(settings.feeds, oldTag.name, trimmedName);
    remapMediaTagNames(settings.media, oldTag.name, trimmedName);
    clearSavedTagFilter(settings, oldTag.name);
  }

  return updatedTags;
}

/**
 * Removes every assignment of `tagName` from a folder tree's auto-tags,
 * including nested subfolders. Folder rules re-apply their auto-tags on every
 * refresh, so a deleted tag must be stripped here too or it comes straight
 * back.
 */
function stripTagFromFolders(
  folders: readonly Folder[],
  tagName: string,
): void {
  for (const folder of folders) {
    if (folder.autoTags) {
      folder.autoTags = folder.autoTags.filter((tag) => tag.name !== tagName);
    }
    if (folder.subfolders?.length) {
      stripTagFromFolders(folder.subfolders, tagName);
    }
  }
}

/**
 * Deletes a Tag definition and every Tag assignment that uses it. Both
 * tag-management controls (sidebar and Settings) share this so deletion has
 * one meaning; removing a single article's assignment is a separate action.
 */
export function deleteTagFromSettings(
  settings: Pick<RssDashboardSettings, "availableTags" | "feeds" | "folders">,
  tagName: string,
): void {
  const tagIndex = settings.availableTags.findIndex((t) => t.name === tagName);
  if (tagIndex !== -1) {
    settings.availableTags.splice(tagIndex, 1);
  }

  for (const feed of settings.feeds) {
    for (const item of feed.items) {
      if (item.tags) {
        item.tags = item.tags.filter((t) => t.name !== tagName);
      }
    }
  }

  stripTagFromFolders(settings.folders, tagName);
}
