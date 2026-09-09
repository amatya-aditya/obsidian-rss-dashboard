import type { Folder, RssDashboardSettings } from "../types/types";

export type FeedInsertPlacement = "before" | "after";
export type FolderDropPlacement = "before" | "after" | "nest" | "rootAppend";

export interface OperationResult {
  ok: boolean;
  error?: string;
}

function normalizeFolderPath(folderPath: string | null | undefined): string {
  return folderPath ? folderPath : "";
}

function ensureFolderFeedSortOrders(settings: RssDashboardSettings): NonNullable<RssDashboardSettings["folderFeedSortOrders"]> {
  if (!settings.folderFeedSortOrders) settings.folderFeedSortOrders = {};
  return settings.folderFeedSortOrders;
}

export function setFolderFeedSortCustom(
  settings: RssDashboardSettings,
  folderPath: string,
): void {
  const map = ensureFolderFeedSortOrders(settings);
  map[normalizeFolderPath(folderPath)] = { by: "custom", ascending: true };
}

export function setFolderSortCustom(settings: RssDashboardSettings): void {
  const prev = settings.folderSortOrder;
  settings.folderSortOrder = { by: "custom", ascending: prev?.ascending ?? true };
}

export function moveFeedsAndInsert(
  settings: RssDashboardSettings,
  opts: {
    draggedUrls: string[];
    targetUrl: string;
    placement: FeedInsertPlacement;
  },
): OperationResult {
  const { draggedUrls, targetUrl, placement } = opts;
  if (!draggedUrls || draggedUrls.length === 0 || !targetUrl) {
    return { ok: false, error: "Missing feed urls." };
  }
  if (draggedUrls.includes(targetUrl)) {
    return { ok: false, error: "No-op drop." };
  }

  const target = settings.feeds.find((f) => f.url === targetUrl);
  if (!target) return { ok: false, error: "Target feed not found." };

  const destinationFolderPath = normalizeFolderPath(target.folder);
  const draggedUrlSet = new Set(draggedUrls);
  const draggedFeeds = settings.feeds.filter((f) => draggedUrlSet.has(f.url));
  if (draggedFeeds.length === 0) {
    return { ok: false, error: "Dragged feeds not found." };
  }

  for (const feed of draggedFeeds) {
    feed.folder = destinationFolderPath;
  }

  const withoutDragged = settings.feeds.filter((f) => !draggedUrlSet.has(f.url));
  const targetIndex = withoutDragged.findIndex((f) => f.url === targetUrl);
  if (targetIndex === -1) {
    return { ok: false, error: "Target feed not found after removal." };
  }

  const insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  const next = [...withoutDragged];
  next.splice(insertIndex, 0, ...draggedFeeds);
  settings.feeds = next;

  setFolderFeedSortCustom(settings, destinationFolderPath);

  return { ok: true };
}

export function moveFeedAndInsert(
  settings: RssDashboardSettings,
  opts: {
    draggedUrl: string;
    targetUrl: string;
    placement: FeedInsertPlacement;
  },
): OperationResult {
  if (!opts.draggedUrl) return { ok: false, error: "Missing feed urls." };
  const dragged = settings.feeds.find((f) => f.url === opts.draggedUrl);
  if (!dragged) return { ok: false, error: "Dragged feed not found." };
  return moveFeedsAndInsert(settings, {
    draggedUrls: [opts.draggedUrl],
    targetUrl: opts.targetUrl,
    placement: opts.placement,
  });
}

export function moveFeedsToFolderAppend(
  settings: RssDashboardSettings,
  opts: {
    draggedUrls: string[];
    destinationFolderPath: string;
  },
): OperationResult {
  const { draggedUrls } = opts;
  if (!draggedUrls || draggedUrls.length === 0) {
    return { ok: false, error: "Dragged feeds not found." };
  }

  const destinationFolderPath = normalizeFolderPath(opts.destinationFolderPath);
  const draggedUrlSet = new Set(draggedUrls);
  const draggedFeeds = settings.feeds.filter((f) => draggedUrlSet.has(f.url));
  if (draggedFeeds.length === 0) {
    return { ok: false, error: "Dragged feeds not found." };
  }

  for (const feed of draggedFeeds) {
    feed.folder = destinationFolderPath;
  }

  const withoutDragged = settings.feeds.filter((f) => !draggedUrlSet.has(f.url));
  let lastIndexInDestination = -1;
  for (let i = 0; i < withoutDragged.length; i++) {
    const folderPath = normalizeFolderPath(withoutDragged[i].folder);
    if (folderPath === destinationFolderPath) lastIndexInDestination = i;
  }

  const insertIndex = lastIndexInDestination + 1;
  const next = [...withoutDragged];
  next.splice(insertIndex, 0, ...draggedFeeds);
  settings.feeds = next;

  setFolderFeedSortCustom(settings, destinationFolderPath);
  return { ok: true };
}

export function moveFeedToFolderAppend(
  settings: RssDashboardSettings,
  opts: {
    draggedUrl: string;
    destinationFolderPath: string;
  },
): OperationResult {
  if (!opts.draggedUrl) return { ok: false, error: "Missing dragged feed url." };
  const dragged = settings.feeds.find((f) => f.url === opts.draggedUrl);
  if (!dragged) return { ok: false, error: "Dragged feed not found." };
  return moveFeedsToFolderAppend(settings, {
    draggedUrls: [opts.draggedUrl],
    destinationFolderPath: opts.destinationFolderPath,
  });
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function joinPath(parts: string[]): string {
  return parts.join("/");
}

function isSameOrDescendant(basePath: string, maybeDescendant: string): boolean {
  return (
    maybeDescendant === basePath ||
    maybeDescendant.startsWith(basePath.endsWith("/") ? basePath : `${basePath}/`)
  );
}

function remapPathPrefix(path: string, fromBase: string, toBase: string): string {
  if (path === fromBase) return toBase;
  if (path.startsWith(`${fromBase}/`)) return `${toBase}${path.substring(fromBase.length)}`;
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

    if (depth === parts.length - 1) {
      return {
        folder,
        parentArray: currentArray,
        index: idx,
        parentPathParts,
      };
    }

    return walk(folder.subfolders ?? [], depth + 1, [...parentPathParts, folder.name]);
  };

  return walk(root, 0, []);
}

function ensureSubfolders(folder: Folder): Folder[] {
  if (!folder.subfolders) folder.subfolders = [];
  return folder.subfolders;
}

function findIndexByRefOrName(arr: Folder[], ref: Folder, name: string): number {
  const byRef = arr.indexOf(ref);
  if (byRef !== -1) return byRef;
  return arr.findIndex((f) => f.name === name);
}

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

  if (placement !== "rootAppend" && isSameOrDescendant(draggedPath, targetPath)) {
    return { ok: false, error: "Cannot move a folder into itself or a descendant." };
  }

  const draggedLoc = findFolderLocation(settings.folders, draggedPath);
  if (!draggedLoc) return { ok: false, error: "Dragged folder not found." };

  const targetLoc =
    placement === "rootAppend" ? null : findFolderLocation(settings.folders, targetPath);
  if (placement !== "rootAppend" && !targetLoc) {
    return { ok: false, error: "Target folder not found." };
  }

  const draggedFolder = draggedLoc.folder;
  const draggedName = draggedFolder.name;

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
    if (targetIndex === -1) return { ok: false, error: "Target folder location drifted." };
    insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  }

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
  if (destinationParentArray === sourceParentArray && sourceIndex < insertIndex) {
    insertIndex -= 1;
  }

  destinationParentArray.splice(insertIndex, 0, draggedFolder);

  const newBasePath = destinationParentPath
    ? `${destinationParentPath}/${draggedName}`
    : draggedName;

  if (newBasePath !== draggedPath) {
    // Remap feed folder paths (in-place to preserve object identity)
    for (const feed of settings.feeds) {
      if (!feed.folder) continue;
      if (feed.folder === draggedPath || feed.folder.startsWith(`${draggedPath}/`)) {
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

  setFolderSortCustom(settings);
  return { ok: true, newPath: newBasePath };
}
