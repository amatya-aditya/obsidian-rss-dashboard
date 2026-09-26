import type { FeedItem, RssDashboardSettings } from "../types/types";
import { getEffectiveDateMs } from "./feed-parser/feed-retention.js";

/**
 * The dashboard's filter selections that decide whether one article is shown.
 */
export interface ArticleFilterState {
  selectedTags: readonly string[];
  currentFolder: string | null;
  activeStatusFilters: ReadonlySet<string>;
  activeTagFilters: ReadonlySet<string>;
  filterLogic: "AND" | "OR";
  settings: Pick<
    RssDashboardSettings,
    "sidebarTagFilterMode" | "articleFilter" | "useFirstSeenDateFallback"
  >;
}

export interface ArticleFilterOptions {
  ignoreDashboardMultiFilters?: boolean;
  ignoreAgeFilter?: boolean;
}

/**
 * Checks if an item matches all active filters (sidebar tag/folder, header multi-filters, age filter).
 */
export function matchesArticleFilters(
  item: FeedItem,
  state: ArticleFilterState,
  options: ArticleFilterOptions = {},
): boolean {
  if (!matchesSelectedTags(item, state)) return false;
  if (!matchesSpecialFolder(item, state)) return false;
  if (!matchesDashboardMultiFilters(item, state, options)) return false;
  if (!matchesAgeFilter(item, state, options)) return false;

  return true;
}

function matchesSelectedTags(
  item: FeedItem,
  state: ArticleFilterState,
): boolean {
  // 1. Check selected tags (if any)
  if (state.selectedTags.length > 0) {
    const mode = state.settings.sidebarTagFilterMode || "or";
    const itemTags = (item.tags ?? []).map((t) => t.name);
    if (mode === "or") {
      if (!state.selectedTags.some((tag) => itemTags.includes(tag)))
        return false;
    } else if (mode === "and") {
      if (!state.selectedTags.every((tag) => itemTags.includes(tag)))
        return false;
    } else if (mode === "not") {
      if (state.selectedTags.some((tag) => itemTags.includes(tag)))
        return false;
    }
  }

  return true;
}

function matchesSpecialFolder(
  item: FeedItem,
  state: ArticleFilterState,
): boolean {
  // 2. Check special folder status (if selected in sidebar)
  const specialFolders = [
    "read",
    "unread",
    "starred",
    "saved",
    "videos",
    "podcasts",
  ];
  if (state.currentFolder && specialFolders.includes(state.currentFolder)) {
    if (state.currentFolder === "starred" && !item.starred) return false;
    if (state.currentFolder === "unread" && item.read) return false;
    if (state.currentFolder === "read" && !item.read) return false;
    if (state.currentFolder === "saved" && !item.saved) return false;
    if (state.currentFolder === "videos" && item.mediaType !== "video")
      return false;
    if (state.currentFolder === "podcasts" && item.mediaType !== "podcast")
      return false;
  }

  return true;
}

function matchesDashboardMultiFilters(
  item: FeedItem,
  state: ArticleFilterState,
  options: ArticleFilterOptions,
): boolean {
  // 3. Check multi-filters (header checkboxes)
  if (
    !options.ignoreDashboardMultiFilters &&
    (state.activeStatusFilters.size > 0 || state.activeTagFilters.size > 0)
  ) {
    if (state.filterLogic === "AND") {
      if (!matchesEveryStatusFilter(item, state)) return false;
      if (!matchesAnyTagFilterStrict(item, state)) return false;
    } else {
      // "Or" (OR) logic: Item matches if it satisfies ANY checked filter.
      let match = matchesAnyStatusFilter(item, state);
      if (!match) match = matchesAnyTagFilter(item, state);
      if (!match) return false;
    }
  }

  return true;
}

function matchesEveryStatusFilter(
  item: FeedItem,
  state: ArticleFilterState,
): boolean {
  const isRead = !!item.read;
  const isSaved = !!item.saved;
  const isStarred = !!item.starred;

  // Strict matching: Item MUST satisfy EVERY checked status filter
  if (state.activeStatusFilters.has("unread") && isRead) return false;
  if (state.activeStatusFilters.has("read") && !isRead) return false;
  if (state.activeStatusFilters.has("saved") && !isSaved) return false;
  if (state.activeStatusFilters.has("starred") && !isStarred) return false;
  if (
    state.activeStatusFilters.has("videos") &&
    item.mediaType !== "video"
  )
    return false;
  if (
    state.activeStatusFilters.has("podcasts") &&
    item.mediaType !== "podcast"
  )
    return false;
  if (
    state.activeStatusFilters.has("tagged") &&
    (!item.tags || item.tags.length === 0)
  )
    return false;
  if (
    state.activeStatusFilters.has("untagged") &&
    item.tags &&
    item.tags.length > 0
  )
    return false;

  return true;
}

function matchesAnyTagFilterStrict(
  item: FeedItem,
  state: ArticleFilterState,
): boolean {
  // Specific tag checks (AND mode: match ANY of the selected tags)
  if (state.activeTagFilters.size > 0) {
    if (!item.tags || item.tags.length === 0) return false;
    const itemTagNames = item.tags.map((t) => t.name);
    const tagMatch = Array.from(state.activeTagFilters).some((tagName) =>
      itemTagNames.includes(tagName),
    );
    if (!tagMatch) return false;
  }

  return true;
}

function matchesAnyStatusFilter(
  item: FeedItem,
  state: ArticleFilterState,
): boolean {
  const isRead = !!item.read;
  const isSaved = !!item.saved;
  const isStarred = !!item.starred;

  let match = false;
  if (state.activeStatusFilters.has("unread") && !isRead) match = true;
  else if (state.activeStatusFilters.has("read") && isRead) match = true;
  else if (state.activeStatusFilters.has("saved") && isSaved) match = true;
  else if (state.activeStatusFilters.has("starred") && isStarred)
    match = true;
  else if (
    state.activeStatusFilters.has("videos") &&
    item.mediaType === "video"
  )
    match = true;
  else if (
    state.activeStatusFilters.has("podcasts") &&
    item.mediaType === "podcast"
  )
    match = true;

  return match;
}

function matchesAnyTagFilter(
  item: FeedItem,
  state: ArticleFilterState,
): boolean {
  let match = false;
  if (
    state.activeStatusFilters.has("tagged") &&
    item.tags &&
    item.tags.length > 0
  )
    match = true;
  else if (
    state.activeStatusFilters.has("untagged") &&
    (!item.tags || item.tags.length === 0)
  )
    match = true;
  else if (
    state.activeTagFilters.size > 0 &&
    item.tags &&
    item.tags.length > 0
  ) {
    const itemTagNames = item.tags.map((t) => t.name);
    if (
      Array.from(state.activeTagFilters).some((tagName) =>
        itemTagNames.includes(tagName),
      )
    ) {
      match = true;
    }
  }

  return match;
}

function matchesAgeFilter(
  item: FeedItem,
  state: ArticleFilterState,
  options: ArticleFilterOptions,
): boolean {
  // 4. Check age filter
  if (
    !options.ignoreAgeFilter &&
    state.settings.articleFilter.type === "age" &&
    typeof state.settings.articleFilter.value === "number" &&
    state.settings.articleFilter.value > 0
  ) {
    const maxAge = Date.now() - state.settings.articleFilter.value;
    if (getEffectiveDateMs(item, state.settings.useFirstSeenDateFallback) <= maxAge) return false;
  }

  return true;
}
