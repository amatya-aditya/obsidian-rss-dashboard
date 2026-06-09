import type { Feed, FeedItem, Tag } from "../types/types";

export type FolderExistingArticleAction = "none" | "sync" | "remove_all";

export function getRemovedFolderTagNames(
  previousFolderTags: readonly Tag[],
  newFolderTags: readonly Tag[],
): string[] {
  const newNames = new Set(
    newFolderTags.map((tag) => tag.name.toLowerCase()),
  );
  return previousFolderTags
    .filter((tag) => !newNames.has(tag.name.toLowerCase()))
    .map((tag) => tag.name);
}

export function syncFolderAutoTagsOnItem(
  item: FeedItem,
  previousFolderTags: readonly Tag[],
  newFolderTags: readonly Tag[],
): boolean {
  const removedNames = new Set(
    getRemovedFolderTagNames(previousFolderTags, newFolderTags).map((name) =>
      name.toLowerCase(),
    ),
  );

  let tags = [...(item.tags ?? [])];
  let changed = false;

  if (removedNames.size > 0) {
    const before = tags.length;
    tags = tags.filter((tag) => !removedNames.has(tag.name.toLowerCase()));
    if (tags.length !== before) {
      changed = true;
    }
  }

  const existingNames = new Set(tags.map((tag) => tag.name.toLowerCase()));
  const tagsToAdd = newFolderTags.filter(
    (tag) => !existingNames.has(tag.name.toLowerCase()),
  );
  if (tagsToAdd.length > 0) {
    tags = [...tags, ...tagsToAdd];
    changed = true;
  }

  if (changed) {
    item.tags = tags;
  }

  return changed;
}

export function syncFolderAutoTagsOnFeeds(
  feeds: readonly Feed[],
  folderPaths: readonly string[],
  previousFolderTags: readonly Tag[],
  newFolderTags: readonly Tag[],
): number {
  const pathSet = new Set(folderPaths);
  let articlesUpdated = 0;

  for (const feed of feeds) {
    if (!feed.folder || !pathSet.has(feed.folder)) {
      continue;
    }
    for (const item of feed.items) {
      if (
        syncFolderAutoTagsOnItem(item, previousFolderTags, newFolderTags)
      ) {
        articlesUpdated++;
      }
    }
  }

  return articlesUpdated;
}

export function removeAllTagsFromFeeds(
  feeds: readonly Feed[],
  folderPaths: readonly string[],
): number {
  const pathSet = new Set(folderPaths);
  let articlesUpdated = 0;

  for (const feed of feeds) {
    if (!feed.folder || !pathSet.has(feed.folder)) {
      continue;
    }
    for (const item of feed.items) {
      if (item.tags && item.tags.length > 0) {
        item.tags = [];
        articlesUpdated++;
      }
    }
  }

  return articlesUpdated;
}

export function buildFolderTagConfirmMessage(
  folderPath: string,
  includeSubfolders: boolean,
  action: FolderExistingArticleAction,
  previousFolderTags: readonly Tag[],
  newFolderTags: readonly Tag[],
): string {
  const scope = includeSubfolders
    ? `"${folderPath}" and subfolders`
    : `"${folderPath}"`;

  if (action === "remove_all") {
    return `Remove all tags from existing articles in ${scope}? Manual tags and tags from other auto-tag rules will also be removed.`;
  }

  const removedNames = getRemovedFolderTagNames(
    previousFolderTags,
    newFolderTags,
  );
  if (removedNames.length > 0) {
    return `Update existing articles in ${scope}? Tags removed from this folder rule (${removedNames.join(", ")}) will be stripped from articles. Other tags are left unchanged. Newly selected folder tags will be added where missing.`;
  }

  return `Add folder auto-tags to existing articles in ${scope} that are missing them? Other tags are left unchanged.`;
}
