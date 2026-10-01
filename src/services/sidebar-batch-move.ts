import type { Folder, RssDashboardSettings } from "../types/types";
import {
  moveFeedsToFolderAppend,
  moveFolder,
} from "./sidebar-ordering-controller";

export const BATCH_MOVE_SKIPPED_NOTICE =
  "Skipped moving folder into itself or its subfolder.";

export interface BatchMoveResult {
  movedFeeds: number;
  movedFolders: number;
  skippedFolders: number;
  /** The feed mover's error (or a fallback), when it refused the move. */
  feedMoveError: string | null;
}

export interface BatchMoveRequest {
  destinationFolderPath: string;
  feedUrls: string[];
  folderPaths: string[];
  findFolder: (path: string) => Folder | null;
}

function moveFolders(
  settings: RssDashboardSettings,
  destinationFolderPath: string,
  folderPaths: string[],
): { moved: number; skipped: number } {
  let movedFoldersCount = 0;
  let skippedFoldersCount = 0;

  // 1. Move folders first (if any)
  for (const folderPath of folderPaths) {
    if (
      destinationFolderPath === folderPath ||
      destinationFolderPath.startsWith(`${folderPath}/`)
    ) {
      skippedFoldersCount++;
      continue;
    }

    const placement = destinationFolderPath ? "nest" : "rootAppend";
    const result = moveFolder(settings, {
      draggedPath: folderPath,
      targetPath: destinationFolderPath,
      placement,
    });

    if (result.ok) {
      movedFoldersCount++;
    } else {
      skippedFoldersCount++;
    }
  }

  return { moved: movedFoldersCount, skipped: skippedFoldersCount };
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
    skippedFolders: folders.skipped,
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
