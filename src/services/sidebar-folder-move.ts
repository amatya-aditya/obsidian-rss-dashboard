import type { Folder, RssDashboardSettings } from "../types/types";
import type { OperationResult } from "./sidebar-ordering-controller";

export type FolderDropPlacement = "before" | "after" | "nest" | "rootAppend";

/**
 * Switches the folder sort order to custom, preserving the current direction.
 * Extracted verbatim from `sidebar-ordering-controller.ts` (#1163); `Sidebar`
 * keeps calling it through the controller's re-export.
 */
export function setFolderSortCustom(settings: RssDashboardSettings): void {
  const prev = settings.folderSortOrder;
  settings.folderSortOrder = {
    by: "custom",
    ascending: prev?.ascending ?? true,
  };
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function joinPath(parts: string[]): string {
  return parts.join("/");
}

function isSameOrDescendant(
  basePath: string,
  maybeDescendant: string,
): boolean {
  return (
    maybeDescendant === basePath ||
    maybeDescendant.startsWith(
      basePath.endsWith("/") ? basePath : `${basePath}/`,
    )
  );
}

function remapPathPrefix(
  path: string,
  fromBase: string,
  toBase: string,
): string {
  if (path === fromBase) return toBase;
  if (path.startsWith(`${fromBase}/`))
    return `${toBase}${path.substring(fromBase.length)}`;
  return path;
}

interface FolderLocation {
  folder: Folder;
  parentArray: Folder[];
  index: number;
  parentPathParts: string[];
}

function findFolderLocation(
  root: Folder[],
  folderPath: string,
): FolderLocation | null {
  const parts = splitPath(folderPath);
  if (parts.length === 0) return null;

  const walk = (
    currentArray: Folder[],
    depth: number,
    parentPathParts: string[],
  ): FolderLocation | null => {
    const name = parts[depth];
    const idx = currentArray.findIndex((f) => f.name === name);
    if (idx === -1) return null;
    const folder = currentArray[idx];
    if (!folder) return null;

    if (depth === parts.length - 1) {
      return {
        folder,
        parentArray: currentArray,
        index: idx,
        parentPathParts,
      };
    }

    return walk(folder.subfolders ?? [], depth + 1, [
      ...parentPathParts,
      folder.name,
    ]);
  };

  return walk(root, 0, []);
}

function ensureSubfolders(folder: Folder): Folder[] {
  if (!folder.subfolders) folder.subfolders = [];
  return folder.subfolders;
}

function findIndexByRefOrName(
  arr: Folder[],
  ref: Folder,
  name: string,
): number {
  const byRef = arr.indexOf(ref);
  if (byRef !== -1) return byRef;
  return arr.findIndex((f) => f.name === name);
}

/**
 * Resolves where the dragged folder lands: the destination parent array, its
 * path, and the insertion index. Extracted from `moveFolder` (#1163), moved
 * verbatim along the original `rootAppend` / `nest` / before-after blocks.
 * Returns `{ ok: false }` when the target folder can no longer be located.
 */
type FolderDestinationResolution =
  | {
      ok: true;
      parentArray: Folder[];
      parentPath: string;
      insertIndex: number;
    }
  | { ok: false; error: string };

function resolveFolderDestination(
  settings: RssDashboardSettings,
  placement: FolderDropPlacement,
  targetPath: string,
  targetLoc: FolderLocation | null,
): FolderDestinationResolution {
  let destinationParentArray: Folder[];
  let destinationParentPath = "";
  let insertIndex = 0;

  if (placement === "rootAppend") {
    destinationParentArray = settings.folders;
    destinationParentPath = "";
    insertIndex = destinationParentArray.length;
  } else if (placement === "nest") {
    const targetFolder = targetLoc!.folder;
    destinationParentArray = ensureSubfolders(targetFolder);
    destinationParentPath = targetPath;
    insertIndex = destinationParentArray.length;
  } else {
    destinationParentArray = targetLoc!.parentArray;
    destinationParentPath = joinPath(targetLoc!.parentPathParts);
    const targetIndex = findIndexByRefOrName(
      destinationParentArray,
      targetLoc!.folder,
      targetLoc!.folder.name,
    );
    if (targetIndex === -1)
      return { ok: false, error: "Target folder location drifted." };
    insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  }

  return {
    ok: true,
    parentArray: destinationParentArray,
    parentPath: destinationParentPath,
    insertIndex,
  };
}

/**
 * Remaps the paths that follow a moved folder: feed `folder` values (in place,
 * to preserve object identity), `collapsedFolders`, and the
 * `folderFeedSortOrders` keys. Extracted from `moveFolder` (#1163); the
 * original `newBasePath !== draggedPath` guard became the early return.
 */
function remapMovedFolderPaths(
  settings: RssDashboardSettings,
  draggedPath: string,
  newBasePath: string,
): void {
  if (newBasePath === draggedPath) return;

  // Remap feed folder paths (in-place to preserve object identity)
  for (const feed of settings.feeds) {
    if (!feed.folder) continue;
    if (
      feed.folder === draggedPath ||
      feed.folder.startsWith(`${draggedPath}/`)
    ) {
      feed.folder = remapPathPrefix(feed.folder, draggedPath, newBasePath);
    }
  }

  // Remap collapsed folders
  settings.collapsedFolders = (settings.collapsedFolders ?? []).map((p) =>
    remapPathPrefix(p, draggedPath, newBasePath),
  );

  // Remap folder feed sort-order keys
  if (settings.folderFeedSortOrders) {
    const next: NonNullable<RssDashboardSettings["folderFeedSortOrders"]> = {};
    for (const [key, value] of Object.entries(settings.folderFeedSortOrders)) {
      const mappedKey = remapPathPrefix(key, draggedPath, newBasePath);
      next[mappedKey] = value;
    }
    settings.folderFeedSortOrders = next;
  }
}

/**
 * Moves a folder in the sidebar tree, remapping the feed folders, collapsed
 * folders, and per-folder sort-order keys beneath it. Extracted verbatim from
 * `sidebar-ordering-controller.ts` (#1163); the destination resolution and the
 * path remap split into `resolveFolderDestination` and `remapMovedFolderPaths`.
 */
export function moveFolder(
  settings: RssDashboardSettings,
  opts: {
    draggedPath: string;
    targetPath: string;
    placement: FolderDropPlacement;
  },
): OperationResult & { newPath?: string } {
  const draggedPath = opts.draggedPath;
  const targetPath = opts.targetPath;
  const placement = opts.placement;

  if (!draggedPath) return { ok: false, error: "Missing dragged folder path." };
  if (placement !== "rootAppend" && !targetPath) {
    return { ok: false, error: "Missing target folder path." };
  }

  if (
    placement !== "rootAppend" &&
    isSameOrDescendant(draggedPath, targetPath)
  ) {
    return {
      ok: false,
      error: "Cannot move a folder into itself or a descendant.",
    };
  }

  const draggedLoc = findFolderLocation(settings.folders, draggedPath);
  if (!draggedLoc) return { ok: false, error: "Dragged folder not found." };

  const targetLoc =
    placement === "rootAppend"
      ? null
      : findFolderLocation(settings.folders, targetPath);
  if (placement !== "rootAppend" && !targetLoc) {
    return { ok: false, error: "Target folder not found." };
  }

  const draggedFolder = draggedLoc.folder;
  const draggedName = draggedFolder.name;

  const destination = resolveFolderDestination(
    settings,
    placement,
    targetPath,
    targetLoc,
  );
  if (!destination.ok) {
    return { ok: false, error: destination.error };
  }

  const destinationParentArray = destination.parentArray;
  const destinationParentPath = destination.parentPath;
  let insertIndex = destination.insertIndex;

  // Duplicate sibling name validation (post-removal).
  if (
    destinationParentArray.some(
      (f) => f.name === draggedName && f !== draggedFolder,
    )
  ) {
    return {
      ok: false,
      error: `A folder named "${draggedName}" already exists at the destination level.`,
    };
  }

  const sourceParentArray = draggedLoc.parentArray;
  const sourceIndex = draggedLoc.index;

  // Remove dragged from its current parent
  sourceParentArray.splice(sourceIndex, 1);

  // If moving within the same array and the removal occurred before the insertion point,
  // the insertion index should shift back by 1.
  if (
    destinationParentArray === sourceParentArray &&
    sourceIndex < insertIndex
  ) {
    insertIndex -= 1;
  }

  destinationParentArray.splice(insertIndex, 0, draggedFolder);

  const newBasePath = destinationParentPath
    ? `${destinationParentPath}/${draggedName}`
    : draggedName;

  remapMovedFolderPaths(settings, draggedPath, newBasePath);

  setFolderSortCustom(settings);
  return { ok: true, newPath: newBasePath };
}
