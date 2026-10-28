/**
 * Represents a single entry from the Kagi Smallweb Atom feed.
 */
export interface SmallwebEntry {
  postTitle: string;
  postUrl: string;
  blogName: string;
  blogUrl: string;
  updatedAt: Date;
  excerpt: string;
  domain: string;
}

export function parseSmallwebAtomFeed(
  xmlText: string,
  onFeedUpdatedAt: (updatedAt: Date | null) => void,
): SmallwebEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  // Extract feed-level updated timestamp
  const feedUpdatedStr = doc.querySelector("feed > updated")?.textContent || "";
  if (feedUpdatedStr) {
    const feedUpdatedAt = new Date(feedUpdatedStr);
    onFeedUpdatedAt(
      Number.isNaN(feedUpdatedAt.getTime()) ? null : feedUpdatedAt,
    );
  }

  const entryElements = Array.from(doc.querySelectorAll("entry"));
  const entries: SmallwebEntry[] = [];

  for (const entry of entryElements) {
    const parsedEntry = parseSmallwebEntry(entry);
    if (parsedEntry) entries.push(parsedEntry);
  }

  return entries;
}

function parseSmallwebEntry(entry: Element): SmallwebEntry | null {
  try {
    const postTitle = entry.querySelector("title")?.textContent || "Untitled";

    const linkEl =
      entry.querySelector("link[rel='alternate']") ||
      entry.querySelector("link");
    const postUrl = linkEl?.getAttribute("href") || "";

    if (!postUrl) return null;

    const blogDetails = getSmallwebBlogDetails(postUrl);
    if (!blogDetails) return null;

    const authorName = entry.querySelector("author > name")?.textContent;
    const blogName = authorName || blogDetails.domain;

    const updatedStr = entry.querySelector("updated")?.textContent || "";
    const parsedUpdatedAt = new Date(updatedStr);
    const updatedAt: Date = Number.isNaN(parsedUpdatedAt.getTime())
      ? new Date()
      : parsedUpdatedAt;

    const summaryEl = entry.querySelector("summary");
    const contentEl = entry.querySelector("content");
    const rawText = summaryEl?.textContent || contentEl?.textContent || "";
    const excerpt = stripHtmlAndTruncate(rawText, 200);

    return {
      postTitle,
      postUrl,
      blogName,
      blogUrl: blogDetails.blogUrl,
      updatedAt,
      excerpt,
      domain: blogDetails.domain,
    };
  } catch {
    return null;
  }
}

function getSmallwebBlogDetails(
  postUrl: string,
): { blogUrl: string; domain: string } | null {
  try {
    const url = new URL(postUrl);
    return { blogUrl: url.origin, domain: url.hostname };
  } catch {
    return null;
  }
}

function stripHtmlAndTruncate(html: string, maxLength: number): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body.textContent || "";
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.substring(0, maxLength - 3) + "...";
}
