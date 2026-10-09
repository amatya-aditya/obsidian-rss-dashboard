import type { App } from "obsidian";
import { EditTagModal } from "../modals/edit-tag-modal";
import type {
  FeedItem,
  RssDashboardSettings,
  Tag,
  Folder,
} from "../types/types";

const AUTO_TAG_DEFINITIONS = {
  saved: { name: "Saved", fallbackColor: "#3498db" },
} as const;

function cloneTags(tags: readonly Tag[] | undefined): Tag[] {
  return (tags ?? []).map((tag) => ({ ...tag }));
}

function ensureCanonicalTag(
  tags: readonly Tag[] | undefined,
  availableTags: readonly Tag[],
  tagKey: keyof typeof AUTO_TAG_DEFINITIONS,
): { changed: boolean; tags: Tag[] } {
  const definition = AUTO_TAG_DEFINITIONS[tagKey];
  const nextTags = cloneTags(tags);
  const matchingTag = availableTags.find(
    (tag) => tag.name.toLowerCase() === definition.name.toLowerCase(),
  );
  const existingIndex = nextTags.findIndex(
    (tag) => tag.name.toLowerCase() === definition.name.toLowerCase(),
  );
  const resolvedColor = matchingTag?.color || definition.fallbackColor;

  if (existingIndex >= 0) {
    const existingTag = nextTags[existingIndex];
    if (!existingTag) {
      return { changed: false, tags: nextTags };
    }
    const nextTag: Tag = {
      ...existingTag,
      name: definition.name,
      color: existingTag.color || resolvedColor,
    };
    const changed =
      nextTag.name !== existingTag.name || nextTag.color !== existingTag.color;
    if (changed) {
      nextTags[existingIndex] = nextTag;
    }
    return { changed, tags: nextTags };
  }

  nextTags.push({
    name: definition.name,
    color: resolvedColor,
  });
  return { changed: true, tags: nextTags };
}

/**
 * Normalizes an article update before it is persisted.
 *
 * Starred state and tags are orthogonal (ADR 0011): a star action changes
 * only `starred`, and this function never derives tags from it. The only
 * automatic tag behavior left is the independently configured Saved-tag
 * convenience, which is opt-in via `articleSaving.addSavedTag`.
 *
 * Side-effect: when a save leaves the canonical Saved tag on the article and
 * it is not yet present in `settings.availableTags`, it is also registered
 * there so the tag appears in the Tags list and can be managed by the user.
 */
export function applyAutomaticArticleTags(
  article: Readonly<FeedItem>,
  updates: Partial<FeedItem>,
  settings: Pick<RssDashboardSettings, "availableTags" | "articleSaving">,
): Partial<FeedItem> {
  let nextTags = cloneTags(updates.tags ?? article.tags);
  let tagsChanged = updates.tags !== undefined;

  if (updates.saved === true && settings.articleSaving.addSavedTag) {
    const result = ensureCanonicalTag(
      nextTags,
      settings.availableTags,
      "saved",
    );
    nextTags = result.tags;
    tagsChanged = tagsChanged || result.changed;

    // Register the tag in the global registry whenever a save leaves it on the
    // article, so it appears in the Tags list and can be edited or deleted.
    // This covers an article that already carried the chip. Existing articles
    // are not scanned: only saves from now on register it.
    const definition = AUTO_TAG_DEFINITIONS.saved;
    const alreadyRegistered = settings.availableTags.some(
      (t) => t.name.toLowerCase() === definition.name.toLowerCase(),
    );
    if (!alreadyRegistered) {
      // Use the resolved color from the article's tag so the registry entry
      // matches what was written to the article.
      const articleTag = nextTags.find(
        (t) => t.name.toLowerCase() === definition.name.toLowerCase(),
      );
      settings.availableTags.push({
        name: definition.name,
        color: articleTag?.color ?? definition.fallbackColor,
      });
    }
  }

  if (!tagsChanged) {
    return updates;
  }

  return {
    ...updates,
    tags: nextTags,
  };
}

export function withSavedTagName(tagNames: readonly string[]): string[] {
  const normalizedNames = tagNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const savedIndex = normalizedNames.findIndex(
    (name) => name.toLowerCase() === "saved",
  );

  if (savedIndex >= 0) {
    const nextNames = [...normalizedNames];
    nextNames[savedIndex] = AUTO_TAG_DEFINITIONS.saved.name;
    return nextNames;
  }

  return [...normalizedNames, AUTO_TAG_DEFINITIONS.saved.name];
}

export { updateTagInSettings } from "./tag-settings";

export function showEditTagModal({
  app,
  settings,
  tag,
  onSave,
  submitLabel = "Save changes",
}: {
  app: App;
  settings: Readonly<RssDashboardSettings>;
  tag: Readonly<Tag>;
  onSave?: (updatedTag: Tag) => Promise<void> | void;
  submitLabel?: string;
}): void {
  new EditTagModal(app, { settings, tag, onSave, submitLabel }).open();
}

/**
 * Merges multiple tag arrays, deduplicating by name (case-insensitive).
 * Tags from later arrays override earlier ones (for color resolution).
 * Preserves order with base tags first, then new tags.
 */
export function mergeTagArrays(
  ...tagArrays: (readonly Tag[] | undefined)[]
): Tag[] {
  const tagMap = new Map<string, Tag>();

  for (const tags of tagArrays) {
    if (!tags) continue;
    for (const tag of tags) {
      const key = tag.name.toLowerCase();
      tagMap.set(key, tag);
    }
  }

  return Array.from(tagMap.values());
}

/**
 * Recursively finds a folder in the folder tree by path.
 * Path is "/" separated, e.g., "Tech/JavaScript" or "Tech"
 */
function findFolderByPath(
  folders: readonly Folder[] | undefined,
  path: string,
): Folder | undefined {
  if (!folders || path === "" || path === "/") return undefined;

  const parts = path.split("/").filter((p) => p.length > 0);
  let current: Folder | undefined;

  for (const part of parts) {
    if (!current) {
      current = folders.find((f) => f.name === part);
    } else {
      current = current.subfolders.find((f) => f.name === part);
    }
    if (!current) return undefined;
  }

  return current;
}

/**
 * Gets all auto-tags that should apply to a feed in a folder, considering:
 * 1. Folder auto-tags (cascading from parents)
 * 2. The folder's own auto-tags
 * Does not include per-feed custom tags or media-based defaults.
 */
export function getFolderAutoTags(
  folderPath: string,
  folders: readonly Folder[] | undefined,
): Tag[] {
  const allTags: Tag[] = [];

  if (!folders || !folderPath) return allTags;

  // Build path hierarchy: ["Tech", "Tech/JavaScript", "Tech/JavaScript/React"]
  const pathParts = folderPath.split("/").filter((p) => p.length > 0);
  const pathHierarchy: string[] = [];

  for (let i = 0; i < pathParts.length; i++) {
    pathHierarchy.push(pathParts.slice(0, i + 1).join("/"));
  }

  // Collect tags from all ancestors (top-down, so later overrides)
  for (const path of pathHierarchy) {
    const folder = findFolderByPath(folders, path);
    if (folder?.autoTags) {
      allTags.push(...folder.autoTags);
    }
  }

  return mergeTagArrays(allTags);
}

/**
 * Resolves final tags for an article considering the complete hierarchy:
 * 1. Media-based defaults (highest priority - feed defaults)
 * 2. Folder auto-tags (inherited + cascading)
 * 3. Per-feed custom tags
 * 4. Article-specific tags
 *
 * Deduplicates by tag name, with more specific scopes overriding general ones.
 */
export function resolveArticleTags(
  articleTags: readonly Tag[] | undefined,
  perFeedTags: readonly Tag[] | undefined,
  folderPath: string,
  folders: readonly Folder[] | undefined,
  mediaDefaultTags: readonly Tag[] | undefined,
): Tag[] {
  // Order matters: more general to more specific (later overrides)
  return mergeTagArrays(
    mediaDefaultTags, // Feed-level defaults (settings)
    getFolderAutoTags(folderPath, folders), // Folder-level auto-tags
    perFeedTags, // Per-feed custom tags
    articleTags, // Article-specific tags
  );
}
