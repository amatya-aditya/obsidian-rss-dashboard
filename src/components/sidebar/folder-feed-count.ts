import { Feed } from "../../types/types";

/**
 * Calculates the total number of feeds contained within a specific folder
 * and all of its subfolders.
 *
 * @param folderPath The path of the folder to count feeds for (e.g., "Podcasts")
 * @param feeds The array of all available feeds
 * @returns The total number of feeds inside the specified folder and its subfolders
 */
export function getFolderFeedCount(folderPath: string, feeds: Feed[]): number {
  if (!folderPath) {
    return 0;
  }
  
  return feeds.filter((feed) => {
    if (!feed.folder) return false;
    return feed.folder === folderPath || feed.folder.startsWith(folderPath + "/");
  }).length;
}
