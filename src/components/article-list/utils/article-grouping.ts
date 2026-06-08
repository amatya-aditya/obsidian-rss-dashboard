import type { Feed, FeedItem } from "../../../types/types";
import { formatDateWithRelative } from "../../../utils/platform-utils";

export function groupArticles(
  articles: FeedItem[],
  groupBy: "feed" | "date" | "folder" | "none",
  getFeedFolderFn?: (feedUrl: string) => string | undefined,
): Record<string, FeedItem[]> {
  if (groupBy === "none") return { "All articles": articles };

  return articles.reduce(
    (acc, article) => {
      let key: string;
      switch (groupBy) {
        case "feed":
          key = article.feedTitle || "Uncategorized";
          break;
        case "date":
          key = formatDateWithRelative(article.pubDate).text;
          break;

        case "folder":
          key = getFeedFolderFn?.(article.feedUrl) || "Uncategorized";
          break;
        default:
          key = "All articles";
      }

      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(article);
      return acc;
    },
    {} as Record<string, FeedItem[]>,
  );
}

export function getFeedFolder(
  feedUrl: string,
  settingsFeeds: Feed[],
): string | undefined {
  const feed = settingsFeeds.find((f) => f.url === feedUrl);
  return feed?.folder;
}