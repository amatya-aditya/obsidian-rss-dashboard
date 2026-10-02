import type { Folder, RssDashboardSettings } from "../types/types";
import {
  remapPathPrefix,
  resolveMovedCurrentFolder,
} from "../utils/sidebar-row-interactions";
import {
  moveFeedsToFolderAppend,
  moveFolder,
} from "./sidebar-ordering-controller";

export const BATCH_MOVE_SKIPPED_NOTICE =
  "Skipped moving folder into itself or its subfolder.";

/** What a batch move did with one dragged folder. */
export interface BatchMoveFolderOutcome {
  /** The folder's path when the batch started. */
  oldPath: string;
  /** Its path after the batch, or null when it stayed where it was. */
  newPath: string | null;
  /**
   * Why it stayed, worded for a notice: the skip notice for a drop on itself
   * or a subfolder, otherwise `moveFolder`'s own error. Null when it moved.
   */
  error: string | null;
}

export interface BatchMoveResult {
  movedFeeds: number;
  movedFolders: number;
  /** One outcome per dragged folder, in the order they were dragged. */
  folders: BatchMoveFolderOutcome[];
  /** The feed mover's error (or a fallback), when it refused the move. */
  feedMoveError: string | null;
}

export interface BatchMoveRequest {
  destinationFolderPath: string;
  feedUrls: string[];
  folderPaths: string[];
  findFolder: (path: string) => Folder | null;
}

function moveOneFolder(
  settings: RssDashboardSettings,
  destinationFolderPath: string,
  folderPath: string,
): BatchMoveFolderOutcome {
  if (
    destinationFolderPath === folderPath ||
    destinationFolderPath.startsWith(`${folderPath}/`)
  ) {
    return { oldPath: folderPath, newPath: null, error: BATCH_MOVE_SKIPPED_NOTICE };
  }

  const placement = destinationFolderPath ? "nest" : "rootAppend";
  const result = moveFolder(settings, {
    draggedPath: folderPath,
    targetPath: destinationFolderPath,
    placement,
  });

  return result.ok
    ? { oldPath: folderPath, newPath: result.newPath ?? null, error: null }
    : {
        oldPath: folderPath,
        newPath: null,
        error: result.error || "Unable to move folder.",
      };
}

function moveFolders(
  settings: RssDashboardSettings,
  destinationFolderPath: string,
  folderPaths: string[],
): { moved: number; outcomes: BatchMoveFolderOutcome[] } {
  let movedFoldersCount = 0;
  const outcomes: BatchMoveFolderOutcome[] = [];

  // 1. Move folders first (if any)
  for (const folderPath of folderPaths) {
    // A subfolder dragged after its parent already went with it.
    const parent = outcomes.find(
      (o) => o.newPath !== null && folderPath.startsWith(`${o.oldPath}/`),
    );
    if (parent?.newPath) {
      const newPath = remapPathPrefix(folderPath, parent.oldPath, parent.newPath);
      outcomes.push({ oldPath: folderPath, newPath, error: null });
      continue;
    }

    const outcome = moveOneFolder(settings, destinationFolderPath, folderPath);
    if (outcome.newPath !== null) movedFoldersCount++;
    outcomes.push(outcome);
  }

  return { moved: movedFoldersCount, outcomes };
}

function moveFeeds(
  settings: RssDashboardSettings,
  destinationFolderPath: string,
  feedUrls: string[],
  findFolder: (path: string) => Folder | null,
): { moved: number; error: string | null } {
  let movedFeedsCount = 0;
  let error: string | null = null;

  // 2. Move feeds
  const feedsToMove = feedUrls.filter((url) => {
    const feed = settings.feeds.find((f) => f.url === url);
    return feed && (feed.folder || "") !== destinationFolderPath;
  });

  if (feedsToMove.length > 0) {
    const oldFolderPaths = new Set<string>();
    for (const url of feedsToMove) {
      const f = settings.feeds.find((item) => item.url === url);
      if (f?.folder) oldFolderPaths.add(f.folder);
    }

    const result = moveFeedsToFolderAppend(settings, {
      draggedUrls: feedsToMove,
      destinationFolderPath,
    });

    if (result.ok) {
      movedFeedsCount = feedsToMove.length;
      for (const oldPath of oldFolderPaths) {
        const oldFolder = findFolder(oldPath);
        if (oldFolder) oldFolder.modifiedAt = Date.now();
      }
    } else {
      error = result.error || "Unable to move feeds.";
    }
  }

  return { moved: movedFeedsCount, error };
}

/**
 * Moves dragged folders, then feeds, into one destination folder (the empty
 * path is the root) and stamps `modifiedAt` on the folders involved. Mutates
 * `settings` in place; showing notices, selection and saving are the caller's.
 */
export function batchMoveFeedsAndFolders(
  settings: RssDashboardSettings,
  request: BatchMoveRequest,
): BatchMoveResult {
  const { destinationFolderPath, feedUrls, folderPaths, findFolder } = request;

  const folders = moveFolders(settings, destinationFolderPath, folderPaths);
  const feeds = moveFeeds(settings, destinationFolderPath, feedUrls, findFolder);

  if (destinationFolderPath) {
    const destFolder = findFolder(destinationFolderPath);
    if (destFolder) destFolder.modifiedAt = Date.now();
  }

  return {
    movedFeeds: feeds.moved,
    movedFolders: folders.moved,
    folders: folders.outcomes,
    feedMoveError: feeds.error,
  };
}

/** The "Moved N feeds and M folders to X" notice, or null when nothing moved. */
export function describeBatchMove(
  result: Pick<BatchMoveResult, "movedFeeds" | "movedFolders">,
  destinationFolderPath: string,
): string | null {
  const { movedFeeds: movedFeedsCount, movedFolders: movedFoldersCount } = result;

  const totalMoved = movedFeedsCount + movedFoldersCount;
  if (totalMoved > 0) {
    const destLabel = destinationFolderPath
      ? `"${destinationFolderPath}"`
      : "root";
    const parts: string[] = [];
    if (movedFeedsCount > 0) {
      parts.push(`${movedFeedsCount} feed${movedFeedsCount === 1 ? "" : "s"}`);
    }
    if (movedFoldersCount > 0) {
      parts.push(
        `${movedFoldersCount} folder${movedFoldersCount === 1 ? "" : "s"}`,
      );
    }
    return `Moved ${parts.join(" and ")} to ${destLabel}`;
  }

  return null;
}

/**
 * The notices for the dragged folders that stayed put: each distinct reason
 * once, in the order the folders were dragged.
 */
export function describeRefusedFolders(
  result: Pick<BatchMoveResult, "folders">,
): string[] {
  const reasons = result.folders.flatMap(({ error }) => (error ? [error] : []));
  return [...new Set(reasons)];
}

/**
 * Where the open folder is after the batch: its new path when it, or a folder
 * it sits in, moved, or null when the batch left it where it was. A folder
 * dropped on its own parent keeps its path, so it counts as not moved.
 */
export function resolveBatchMovedFolder(
  currentFolder: string | null,
  result: Pick<BatchMoveResult, "folders">,
): string | null {
  for (const { oldPath, newPath } of result.folders) {
    if (newPath === null) continue;
    const moved = resolveMovedCurrentFolder(currentFolder, oldPath, newPath);
    if (moved !== null && moved !== currentFolder) return moved;
  }
  return null;
}
