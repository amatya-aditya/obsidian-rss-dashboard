import type { Feed, Folder } from "../types/types";

export interface SidebarRangeSelectionInput {
  readonly anchorKey: string;
  readonly clickedKey: string;
  readonly visibleKeys: readonly string[];
  readonly feeds: readonly Feed[];
  readonly getAllDescendantFolders: (path: string) => string[];
  readonly findFolderByPath: (path: string) => Folder | null;
}

export interface SidebarRangeSelectionResult {
  readonly selectedFolders: string[];
  readonly selectedFeeds: string[];
}

export function resolveSidebarRangeSelection(
  input: SidebarRangeSelectionInput,
): SidebarRangeSelectionResult | null {
  const startIdx = input.visibleKeys.indexOf(input.anchorKey);
  const endIdx = input.visibleKeys.indexOf(input.clickedKey);

  if (startIdx === -1 || endIdx === -1) {
    return null;
  }

  const [from, to] =
    startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
  const rangeKeys = input.visibleKeys.slice(from, to + 1);
  const selectedFeeds = collectRangeSelectedFeeds(input, rangeKeys);
  const foldersToEvaluate = collectFoldersToEvaluate(
    input.feeds,
    rangeKeys,
    selectedFeeds,
  );
  const finalSelectedFolders = resolveFullySelectedFolders(
    input,
    rangeKeys,
    selectedFeeds,
    foldersToEvaluate,
  );
  const finalSelectedFeeds = resolveUncoveredFeeds(
    input.feeds,
    selectedFeeds,
    finalSelectedFolders,
  );

  return {
    selectedFolders: Array.from(finalSelectedFolders),
    selectedFeeds: Array.from(finalSelectedFeeds),
  };
}

function collectRangeSelectedFeeds(
  input: SidebarRangeSelectionInput,
  rangeKeys: readonly string[],
): Set<string> {
  const selectedFeeds = new Set<string>();

  // First, collect all feeds directly in the visual range
  for (const key of rangeKeys) {
    if (key.startsWith("feed:")) {
      selectedFeeds.add(key.substring("feed:".length));
    } else if (key.startsWith("folder:")) {
      // If a folder header is in the selection range, we force-include all
      // of its descendant feeds into the selection intention, UNLESS the user
      // explicitly stopped mid-way through its expanded children.
      const folderPath = key.substring("folder:".length);
      const descendantFolders = input.getAllDescendantFolders(folderPath);
      descendantFolders.push(folderPath);

      const visibleFeedsInFolder = input.visibleKeys.filter((k) => {
        if (k.startsWith("feed:")) {
          const feedUrl = k.substring("feed:".length);
          const feed = input.feeds.find((f) => f.url === feedUrl);
          return feed && feed.folder && descendantFolders.includes(feed.folder);
        }
        return false;
      });

      const visibleFeedsInRange = visibleFeedsInFolder.filter((k) =>
        rangeKeys.includes(k),
      );
      const isPartiallyCovered =
        visibleFeedsInFolder.length > 0 &&
        visibleFeedsInRange.length > 0 &&
        visibleFeedsInRange.length < visibleFeedsInFolder.length;

      if (!isPartiallyCovered) {
        for (const feed of input.feeds) {
          if (feed.folder && descendantFolders.includes(feed.folder)) {
            selectedFeeds.add(feed.url);
          }
        }
      }
    }
  }

  return selectedFeeds;
}

function collectFoldersToEvaluate(
  feeds: readonly Feed[],
  rangeKeys: readonly string[],
  selectedFeeds: ReadonlySet<string>,
): Set<string> {
  // Determine which folders can be considered "fully selected".
  const foldersToEvaluate = new Set<string>();
  for (const key of rangeKeys) {
    if (key.startsWith("folder:"))
      foldersToEvaluate.add(key.substring("folder:".length));
  }

  // Also include parents of any selected feeds
  for (const feedUrl of selectedFeeds) {
    const feed = feeds.find((f) => f.url === feedUrl);
    if (feed && feed.folder) {
      let current = feed.folder;
      while (current) {
        foldersToEvaluate.add(current);
        if (current.includes("/")) {
          current = current.substring(0, current.lastIndexOf("/"));
        } else {
          break;
        }
      }
    }
  }

  return foldersToEvaluate;
}

function resolveFullySelectedFolders(
  input: SidebarRangeSelectionInput,
  rangeKeys: readonly string[],
  selectedFeeds: ReadonlySet<string>,
  foldersToEvaluate: ReadonlySet<string>,
): Set<string> {
  const finalSelectedFolders = new Set<string>();

  // A folder is fully selected if ALL its descendant feeds are in `selectedFeeds`
  for (const folderPath of foldersToEvaluate) {
    const descendantFolders = input.getAllDescendantFolders(folderPath);
    descendantFolders.push(folderPath);
    let allFeedsSelected = true;
    let feedCount = 0;

    for (const feed of input.feeds) {
      if (feed.folder && descendantFolders.includes(feed.folder)) {
        feedCount++;
        if (!selectedFeeds.has(feed.url)) {
          allFeedsSelected = false;
          break;
        }
      }
    }

    // If all feeds are selected (and there is at least one feed), it's fully
    // selected — but only promote to a folder selection when that folder
    // actually still exists. A feed's `folder` field can point at a folder
    // that was since deleted (it then renders under the root section); such
    // feeds must stay individually selected rather than collapsing into a
    // selection of a folder that isn't there to select or delete.
    if (
      allFeedsSelected &&
      feedCount > 0 &&
      input.findFolderByPath(folderPath)
    ) {
      finalSelectedFolders.add(folderPath);
    } else if (feedCount === 0 && rangeKeys.includes(`folder:${folderPath}`)) {
      // If it's empty but explicitly clicked/in range, select it anyway
      finalSelectedFolders.add(folderPath);
    }
  }

  return finalSelectedFolders;
}

function resolveUncoveredFeeds(
  feeds: readonly Feed[],
  selectedFeeds: ReadonlySet<string>,
  finalSelectedFolders: ReadonlySet<string>,
): Set<string> {
  const finalSelectedFeeds = new Set<string>();

  // Any feed that isn't covered by a fully selected folder goes into finalSelectedFeeds
  for (const feedUrl of selectedFeeds) {
    const feed = feeds.find((f) => f.url === feedUrl);
    let coveredByFolder = false;
    if (feed && feed.folder) {
      const parts = feed.folder.split("/");
      let p = "";
      for (const part of parts) {
        p = p ? `${p}/${part}` : part;
        if (finalSelectedFolders.has(p)) {
          coveredByFolder = true;
          break;
        }
      }
    }
    if (!coveredByFolder) {
      finalSelectedFeeds.add(feedUrl);
    }
  }

  return finalSelectedFeeds;
}
