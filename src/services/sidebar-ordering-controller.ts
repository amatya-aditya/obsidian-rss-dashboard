import type { RssDashboardSettings } from "../types/types";

export { moveFolder, setFolderSortCustom } from "./sidebar-folder-move";
export type { FolderDropPlacement } from "./sidebar-folder-move";

export type FeedInsertPlacement = "before" | "after";

export interface OperationResult {
  ok: boolean;
  error?: string;
}

function normalizeFolderPath(folderPath: string | null | undefined): string {
  return folderPath ? folderPath : "";
}

function ensureFolderFeedSortOrders(
  settings: RssDashboardSettings,
): NonNullable<RssDashboardSettings["folderFeedSortOrders"]> {
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

  const withoutDragged = settings.feeds.filter(
    (f) => !draggedUrlSet.has(f.url),
  );
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

  const withoutDragged = settings.feeds.filter(
    (f) => !draggedUrlSet.has(f.url),
  );
  let lastIndexInDestination = -1;
  for (let i = 0; i < withoutDragged.length; i++) {
    const feed = withoutDragged[i];
    if (!feed) continue;
    const folderPath = normalizeFolderPath(feed.folder);
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
  if (!opts.draggedUrl)
    return { ok: false, error: "Missing dragged feed url." };
  const dragged = settings.feeds.find((f) => f.url === opts.draggedUrl);
  if (!dragged) return { ok: false, error: "Dragged feed not found." };
  return moveFeedsToFolderAppend(settings, {
    draggedUrls: [opts.draggedUrl],
    destinationFolderPath: opts.destinationFolderPath,
  });
}
