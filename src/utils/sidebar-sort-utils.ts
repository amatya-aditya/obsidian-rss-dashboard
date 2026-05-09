import type { Feed } from "../types/types";

export type FeedSortBy =
  | "name"
  | "created"
  | "itemCount"
  | "unreadCount"
  | "custom";

export interface FeedSortOrder {
  by: FeedSortBy;
  ascending: boolean;
}

/**
 * Pure function to sort feeds based on the given sort order.
 */
export function applyFeedSortOrder(
  feeds: Feed[],
  sortOrder: FeedSortOrder,
): Feed[] {
  if (sortOrder.by === "custom") {
    return [...feeds];
  }

  const sorter = (a: Feed, b: Feed): number => {
    let valA: string | number, valB: string | number;

    switch (sortOrder.by) {
      case "name":
        valA = a.title;
        valB = b.title;
        return (
          valA.localeCompare(valB, undefined, { numeric: true }) *
          (sortOrder.ascending ? 1 : -1)
        );
      case "created":
        valA = a.lastUpdated || 0;
        valB = b.lastUpdated || 0;
        break;
      case "itemCount":
        valA = a.items.length;
        valB = b.items.length;
        break;
      case "unreadCount":
        valA = a.items.filter((item) => !item.read).length;
        valB = b.items.filter((item) => !item.read).length;
        break;
      default:
        return 0;
    }

    if (valA < valB) return sortOrder.ascending ? -1 : 1;
    if (valA > valB) return sortOrder.ascending ? 1 : -1;
    return 0;
  };

  return [...feeds].sort(sorter);
}
