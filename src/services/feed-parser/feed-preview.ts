import { requestUrl } from "obsidian";
import { robustFetch } from "../../utils/platform-utils.js";
import { feedRequestHeaders } from "../../utils/request-headers.js";
import type { FeedEncoding } from "../../types/types.js";
import { isValidFeed } from "./feed-validation.js";
import {
  discoverFeedUrls,
  fetchFirstValidFeedWithUrl,
} from "./feed-discovery.js";
import { CustomXMLParser } from "./xml-parser/custom-xml-parser.js";
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

export interface FeedPreviewLoadOptions {
  /** False when **Enable CORS proxy** is off: never relay through RSS2JSON. */
  allowRss2JsonFallback?: boolean;
}

/**
 * Run the same page discovery the save path uses and return the feed it finds,
 * or null. The discovered address becomes the preview's `feedUrl` so callers
 * can rewrite the URL field to the feed Save would add.
 */
async function discoverFeedPreview(
  pageUrl: string,
  encodingOverride?: FeedEncoding,
): Promise<FeedPreviewData | null> {
  const candidates = await discoverFeedUrls(
    pageUrl,
    undefined,
    encodingOverride,
  );
  const discovered = await fetchFirstValidFeedWithUrl(
    candidates,
    undefined,
    encodingOverride,
  );
  if (!discovered) return null;
  return parseFeedPreviewResponse(discovered.text, discovered.feedUrl);
}

export async function loadFeedForPreview(
  feedUrl: string,
  feedEncoding?: FeedEncoding,
  options: FeedPreviewLoadOptions = {},
): Promise<FeedPreviewData> {
  const encodingOverride =
    feedEncoding === "windows-1251" ? feedEncoding : undefined;

  // Try direct request first. A body that is not a feed is not a failure: the
  // address may be a page that advertises one, as the save path allows.
  let isPageNotFeed = false;
  try {
    const responseText = await robustFetch(feedUrl, {
      method: "GET",
      headers: feedRequestHeaders(),
      encodingOverride,
    });

    const preview = parseFeedPreviewResponse(responseText, feedUrl);
    if (preview) return preview;

    isPageNotFeed = true;
  } catch {
    // The request failed outright; discovery cannot succeed either.
  }

  if (isPageNotFeed) {
    const discovered = await discoverFeedPreview(feedUrl, encodingOverride);
    if (discovered) return discovered;
  }

  if (options.allowRss2JsonFallback === false) {
    throw new Error(
      isPageNotFeed
        ? "Failed to load feed: the address is a page with no feed we could find and the CORS proxy is disabled."
        : "Failed to load feed: the direct request failed and the CORS proxy is disabled.",
    );
  }

  return loadFeedPreviewFromRss2Json(feedUrl);
}

function parseFeedPreviewResponse(
  responseText: string,
  feedUrl: string,
): FeedPreviewData | null {
  if (!responseText || !isValidFeed(responseText)) return null;

  if (responseText.trimStart().startsWith("{")) {
    const parsed = new CustomXMLParser().parseString(responseText);
    return {
      title: parsed.title,
      description: parsed.description || "",
      link: parsed.link || "",
      image: parsed.image?.url || "",
      latestPubDate: parsed.items[0]?.pubDate || "",
      hasEntries: parsed.items.length > 0,
      feedUrl,
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(responseText, "text/xml");
  return parseFeedDoc(doc, feedUrl);
}

async function loadFeedPreviewFromRss2Json(
  feedUrl: string,
): Promise<FeedPreviewData> {
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
