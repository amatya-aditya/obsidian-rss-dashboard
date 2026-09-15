import type { ArticleGroupByOption, Feed, FeedItem } from "../../../types/types";

export function getArticleDateGroupKey(pubDate: string): string {
  const target = new Date(pubDate);
  if (isNaN(target.getTime())) return "Unknown date";

  const now = new Date();
  if (now.toDateString() === target.toDateString()) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === target.toDateString()) return "Yesterday";

  return target.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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
          key = getArticleDateGroupKey(article.pubDate);
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
      const group = acc[key];
      if (group) group.push(article);
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
