import { requestUrl } from "obsidian";
import { isValidFeed } from "./feed-validation.js";
import type { FeedPreviewData, Rss2JsonResponse } from "./types.js";

export type { FeedPreviewData } from "./types.js";

const BARE_AMPERSAND_REGEX =
  /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g;
export function parseFeedPreviewFromXmlText(
  xmlText: string,
  feedUrl: string,
): FeedPreviewData | null {
  if (!xmlText) return null;

  const sanitizedXmlText = xmlText.replace(BARE_AMPERSAND_REGEX, "&amp;");
  const doc = new DOMParser().parseFromString(sanitizedXmlText, "text/xml");

  if (doc.querySelector("parsererror")) {
    return null;
  }

  return parseFeedDoc(doc, feedUrl);
}

export async function loadFeedForPreview(
  feedUrl: string,
): Promise<FeedPreviewData> {
  // Try direct request first
  try {
    const response = await requestUrl({
      url: feedUrl,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });

    if (response.text && isValidFeed(response.text)) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(response.text, "text/xml");
      return parseFeedDoc(doc, feedUrl);
    }
  } catch {
    // Fall through to rss2json
  }

  // Fallback to rss2json
  const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;

  try {
    const response = await requestUrl({
      url: rss2jsonUrl,
      method: "GET",
    });

    const data = JSON.parse(response.text) as Rss2JsonResponse;

    if (data.status !== "ok" || !data.feed) {
      throw new Error(data.message || "Failed to load feed");
    }
    return {
      title: data.feed.title || "",
      description: data.feed.description || "",
      link: data.feed.link || "",
      image: data.feed.image || "",
      latestPubDate: data.items?.[0]?.pubDate || "",
      hasEntries: (data.items?.length || 0) > 0,
      feedUrl,
    };
  } catch (e) {
    console.error("[RSS Dashboard] rss2json failed:", e);
    throw new Error(
      `Failed to load feed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function parseFeedDoc(doc: Document, feedUrl: string): FeedPreviewData {
  const channel = doc.querySelector("channel") || doc.querySelector("feed");
  const title = channel?.querySelector("title")?.textContent || "";
  const description = channel?.querySelector("description")?.textContent || "";
  const link = channel?.querySelector("link")?.textContent || "";
  const imageEl =
    channel?.querySelector("image > url, itunes\\:image")?.textContent ||
    channel?.querySelector("itunes\\:image")?.getAttribute("href") ||
    "";

  const firstItem = doc.querySelector("item, entry");
  const latestPubDate =
    firstItem?.querySelector("pubDate, published, updated")?.textContent || "";

  return {
    title,
    description,
    link,
    image: imageEl,
    latestPubDate,
    hasEntries: !!firstItem,
    feedUrl,
  };
}
