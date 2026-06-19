import { RssDashboardSettings, FeedItem } from "../types/types";
import { isRecord } from "./platform-utils";

export function getVaultFilePath(fileOrPath?: unknown): string {
  if (typeof fileOrPath === "string") return fileOrPath;
  if (isRecord(fileOrPath) && typeof fileOrPath.path === "string") {
    return fileOrPath.path;
  }
  return "";
}

export function getAllArticles(settings: RssDashboardSettings): FeedItem[] {
  let allArticles: FeedItem[] = [];
  for (const feed of settings.feeds) {
    allArticles = allArticles.concat(feed.items);
  }
  return allArticles;
}
