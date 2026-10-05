/**
 * Pure decisions behind the sidebar's feed and folder rows: which rows count
 * as selected, what a Ctrl/Meta click selects, where a drag would land, and
 * where an open folder goes when its tree moves. No DOM or Obsidian imports.
 */

/** The part of a row's bounding box that drop placement reads. */
export interface RowDropRect {
  top: number;
  height: number;
}

export type FolderRowDropPlacement = "before" | "after" | "nest";
export type FeedRowDropPlacement = "before" | "after";

/**
 * Whether a feed sits under a selected folder: the feed's own folder or any
 * ancestor of it is in `selectedFolders`. A feed in no folder never does.
 */
export function isFeedInSelectedFolder(
  feedFolder: string | undefined,
  selectedFolders: readonly string[] | undefined,
): boolean {
  if (!feedFolder) return false;
  const selected = selectedFolders || [];
  let currentPath = "";
  for (const part of feedFolder.split("/")) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    if (selected.includes(currentPath)) return true;
  }
  return false;
}

/**
 * The folder selection after a Ctrl/Meta click on `path`. The baseline is the
 * selected folders; when there are none, the open folder, so the click
 * augments a single-folder selection. The result is a new array, in
 * insertion order, with `path` toggled.
 */
export function toggleFolderInSelection(
  selectedFolders: readonly string[] | undefined,
  currentFolder: string | null,
  path: string,
): string[] {
  const baseline =
    selectedFolders && selectedFolders.length > 0
      ? selectedFolders
      : currentFolder
        ? [currentFolder]
        : [];
  const currentSet = new Set<string>(baseline);
  if (currentSet.has(path)) {
    currentSet.delete(path);
  } else {
    currentSet.add(path);
  }
  return Array.from(currentSet);
}

/**
 * Where a folder or feed dragged over a folder header would land: the top
 * quarter is before, the bottom quarter after, the middle nests. A header
 * with no height counts as the middle.
 */
export function getFolderDropPlacement(
  clientY: number,
  rect: RowDropRect,
): FolderRowDropPlacement {
  const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "nest";
}

/** Where a feed dropped on a feed row lands: the upper half is before. */
export function getFeedDropPlacement(
  clientY: number,
  rect: RowDropRect,
): FeedRowDropPlacement {
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/** Rewrites `path` when it is `fromBase` or inside it, so it sits under `toBase`. */
export function remapPathPrefix(
  path: string,
  fromBase: string,
  toBase: string,
): string {
  if (path === fromBase) return toBase;
  if (path.startsWith(`${fromBase}/`)) {
    return `${toBase}${path.substring(fromBase.length)}`;
  }
  return path;
}

/**
 * The folder to open after `draggedPath` moved to `newPath`: the open folder
 * under its new path when it is the moved folder or inside it, or null when
 * the open folder is unaffected or its path did not change.
 */
export function resolveMovedCurrentFolder(
  currentFolder: string | null,
  draggedPath: string,
  newPath: string,
): string | null {
  if (
    currentFolder &&
    (currentFolder === draggedPath || currentFolder.startsWith(`${draggedPath}/`))
  ) {
    const remappedFolder = remapPathPrefix(currentFolder, draggedPath, newPath);
    return remappedFolder === currentFolder ? null : remappedFolder;
  }
  return null;
}
