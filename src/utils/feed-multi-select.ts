import type { Feed } from "../types/types";
import { findSelectedAncestorFolder } from "./folder-paths";

export interface FeedMultiSelectState {
  currentFolder: string | null;
  currentFeed: Feed | null;
  selectedFolders: string[];
  selectedFeeds: string[];
}

export interface FeedMultiSelectContext {
  feeds: Feed[];
  isRealFolder: (path: string) => boolean;
  getDescendantFolders: (path: string) => string[];
}

/**
 * Applies a Ctrl/Cmd+click on a feed to the selection: toggles the feed, and
 * first seeds the selection from whatever a plain click opened (a real folder
 * or a feed) so the click adds to it instead of replacing it.
 */
export function toggleFeedInMultiSelection(
  state: FeedMultiSelectState,
  feed: Feed,
  ctx: FeedMultiSelectContext,
): FeedMultiSelectState {
  let { currentFeed, selectedFolders, selectedFeeds } = state;
  const isEmpty = () =>
    selectedFolders.length === 0 && selectedFeeds.length === 0;

  if (
    state.currentFolder &&
    ctx.isRealFolder(state.currentFolder) &&
    isEmpty()
  ) {
    selectedFolders = [state.currentFolder];
  }
  // Clearing currentFeed lets the multi-selection drive the article list.
  if (currentFeed && isEmpty()) {
    selectedFeeds = [currentFeed.url];
    currentFeed = null;
  }

  const isExplicitlySelected = selectedFeeds.includes(feed.url);
  const parentFolder = findSelectedAncestorFolder(feed.folder, selectedFolders);

  if (isExplicitlySelected || parentFolder !== null) {
    if (parentFolder !== null) {
      selectedFolders = selectedFolders.filter((f) => f !== parentFolder);
      const descendants = [
        ...ctx.getDescendantFolders(parentFolder),
        parentFolder,
      ];
      for (const f of ctx.feeds) {
        if (
          f.folder &&
          descendants.includes(f.folder) &&
          f.url !== feed.url &&
          !selectedFeeds.includes(f.url)
        ) {
          selectedFeeds = [...selectedFeeds, f.url];
        }
      }
    }
    if (isExplicitlySelected) {
      selectedFeeds = selectedFeeds.filter((url) => url !== feed.url);
    }
  } else {
    selectedFeeds = [...selectedFeeds, feed.url];
  }

  return {
    currentFolder: state.currentFolder,
    currentFeed,
    selectedFolders,
    selectedFeeds,
  };
}
