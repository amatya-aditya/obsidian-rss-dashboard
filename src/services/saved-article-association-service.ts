import { normalizePath } from "obsidian";
import type { Feed, FeedItem } from "../types/types";

export interface SavedArticleAssociationUpdate {
  feedUrl: string;
  guid: string;
  saved: false;
  savedFilePath: undefined;
  tags: NonNullable<FeedItem["tags"]>;
}

/**
 * Applies confirmed vault events to the plugin's loaded saved-note
 * associations. This service only examines recorded paths; it never walks the
 * vault or tries to recover a note by filename.
 */
export class SavedArticleAssociationService {
  public clearDeletedPath(
    feeds: Feed[],
    deletedPath: string,
    isFolder = false,
  ): SavedArticleAssociationUpdate[] {
    const normalizedDeletedPath = normalizePath(deletedPath);
    const updates: SavedArticleAssociationUpdate[] = [];

    for (const feed of feeds) {
      for (const item of feed.items) {
        if (!this.matchesDeletedPath(item, normalizedDeletedPath, isFolder)) {
          continue;
        }

        item.saved = false;
        delete item.savedFilePath;
        item.tags = (item.tags ?? []).filter(
          (tag) => tag.name.toLowerCase() !== "saved",
        );

        updates.push({
          feedUrl: feed.url,
          guid: item.guid,
          saved: false,
          savedFilePath: undefined,
          tags: item.tags,
        });
      }
    }

    return updates;
  }

  private matchesDeletedPath(
    item: FeedItem,
    deletedPath: string,
    isFolder: boolean,
  ): boolean {
    if (!item.saved || !item.savedFilePath) return false;

    const savedPath = normalizePath(item.savedFilePath);
    return (
      savedPath === deletedPath ||
      (isFolder && savedPath.startsWith(`${deletedPath}/`))
    );
  }
}
