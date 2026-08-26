import type { ArticleGroupByOption, Feed, FeedItem } from "../../../types/types";
import { formatDateWithRelative } from "../../../utils/platform-utils";

export function groupArticles(
  articles: FeedItem[],
  groupBy: ArticleGroupByOption,
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
        case "date_feed":
          key = formatDateWithRelative(article.pubDate).text;
          break;

        case "folder":
        case "folder_feed":
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
