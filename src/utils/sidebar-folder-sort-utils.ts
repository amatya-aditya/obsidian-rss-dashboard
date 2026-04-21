import type { Folder } from "../types/types";

export type FolderSortBy = "name" | "created" | "modified" | "custom";

export interface FolderSortOrder {
  by: FolderSortBy;
  ascending: boolean;
}

function partitionPinned(folders: Folder[]): { pinned: Folder[]; unpinned: Folder[] } {
  const pinned: Folder[] = [];
  const unpinned: Folder[] = [];
  for (const folder of folders) {
    if (folder.pinned) pinned.push(folder);
    else unpinned.push(folder);
  }
  return { pinned, unpinned };
}

function sortGroup(
  group: Folder[],
  sortOrder: FolderSortOrder,
): Folder[] {
  if (sortOrder.by === "custom") return [...group];

  const ascendingFactor = sortOrder.ascending ? 1 : -1;
  const sorted = [...group].sort((a, b) => {
    let valA: string | number;
    let valB: string | number;

    switch (sortOrder.by) {
      case "name":
        valA = a.name;
        valB = b.name;
        return (
          valA.localeCompare(valB, undefined, { numeric: true }) *
          ascendingFactor
        );
      case "created":
        valA = a.createdAt || 0;
        valB = b.createdAt || 0;
        break;
      case "modified":
        valA = a.modifiedAt || 0;
        valB = b.modifiedAt || 0;
        break;
      default:
        return 0;
    }

    if (valA < valB) return sortOrder.ascending ? -1 : 1;
    if (valA > valB) return sortOrder.ascending ? 1 : -1;
    return 0;
  });

  return sorted;
}

/**
 * Pure function to order sibling folders based on the given sort order.
 * - Pinned folders always render before unpinned.
 * - When by="custom", sibling order is preserved (stable), with pinned-first grouping.
 */
export function applyFolderSortOrder(
  folders: Folder[],
  sortOrder: FolderSortOrder,
): Folder[] {
  const { pinned, unpinned } = partitionPinned(folders);
  const orderedPinned = sortGroup(pinned, sortOrder);
  const orderedUnpinned = sortGroup(unpinned, sortOrder);
  return [...orderedPinned, ...orderedUnpinned];
}
