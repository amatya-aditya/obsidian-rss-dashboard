import { requestUrl, Platform } from "obsidian";
import { Feed, FeedItem, MediaSettings, Tag } from "../types/types.js";
import { MediaService } from "./media-service";
import {
  detectPodcastPlatform,
  APPLE_PODCASTS,
  POCKET_CASTS,
} from "../utils/podcast-platforms.js";
import {
  canonicalizeItemIdentityUrl,
  resolveAbsoluteHttpUrl,
} from "../utils/url-utils.js";

interface ItunesLookupResponse {
  resultCount: number;
  results: Array<{
    wrapperType?: string;
    artistName?: string;
    trackName?: string;
    feedUrl?: string;
    artworkUrl600?: string;
    genres?: string[];
    trackCount?: number;
  }>;
}

export async function resolvePodcastPlatformUrl(
  url: string,
  corsProxyUrl?: string,
): Promise<string | null> {
  const platform = detectPodcastPlatform(url);
  if (!platform) return null;

  if (platform.id === APPLE_PODCASTS.id) {
    return resolveApplePodcastUrl(url);
  }

  if (platform.id === POCKET_CASTS.id) {
    return resolvePocketCastsUrl(url, corsProxyUrl);
  }

  return null;
}

async function resolvePocketCastsUrl(
  url: string,
  corsProxyUrl?: string,
): Promise<string | null> {
  const proxyUrls: string[] = [];

  // 1. User's proxy if available
  if (corsProxyUrl) {
    const isEncoded =
      corsProxyUrl.includes("allorigins") || corsProxyUrl.includes("codetabs");
    const targetUrl = isEncoded ? encodeURIComponent(url) : url;
    proxyUrls.push(`${corsProxyUrl}${targetUrl}`);
  }

  // 2. Default AllOrigins proxy
  proxyUrls.push(
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  );

  // 3. Fallback CodeTabs proxy
  proxyUrls.push(
    `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
  );

  let lastError: Error | null = null;

  for (const proxyUrl of proxyUrls) {
    try {
      console.debug(
        `[RSS Dashboard] Attempting to resolve Pocket Casts URL using proxy: ${proxyUrl}`,
      );
      const response = await requestUrl({ url: proxyUrl, method: "GET" });

      let contents = "";
      if (proxyUrl.includes("allorigins.win/get")) {
        const data = JSON.parse(response.text) as { contents: string };
        if (!data.contents)
          throw new Error("AllOrigins returned empty contents");
        contents = data.contents;
      } else {
        contents = response.text;
      }

      const match =
        contents.match(
          /<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["']/i,
        ) ||
        contents.match(
          /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/rss\+xml["']/i,
        );

      if (match?.[1]) {
        console.debug(
          `[RSS Dashboard] Successfully resolved Pocket Casts URL via meta tag: ${match[1]}`,
        );
        return match[1];
      }

      // FALLBACK STRATEGY: Semantic Discovery via iTunes Search
      // Pocket Casts often hides the direct RSS link in their web player.
      // We extract the podcast title and use the public iTunes Search API to find the feed.

      // Flexible regex: Handles attributes in any order (e.g., meta data-rh="true" property="og:title" content="...")
      let titleMatch =
        contents.match(
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
        ) ||
        contents.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
        ) ||
        contents.match(
          /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
        ) ||
        contents.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["']/i,
        );

      if (!titleMatch) {
        // Fallback to <title> tag, but be careful of generic site titles
        const docTitle = contents.match(/<title>([^<]+)<\/title>/i);
        if (docTitle?.[1] && !docTitle[1].includes("Pocket Casts")) {
          titleMatch = docTitle;
        }
      }

      if (titleMatch?.[1]) {
        const rawTitle = titleMatch[1];
        const decodedTitle = rawTitle
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        console.debug(
          `[RSS Dashboard] Extracted title for iTunes search: "${decodedTitle}"`,
        );

        if (decodedTitle.toLowerCase() === "pocket casts plus") {
          // Generic title found, search would be too ambiguous
          // [RSS Dashboard] Extracted generic title "Pocket Casts Plus", skipping search to avoid incorrect resolution.
        } else {
          try {
            // iTunes Search API is public, free, and returns canonical RSS feedUrls
            const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(decodedTitle)}&entity=podcast&limit=3`;
            const itunesResponse = await requestUrl({
              url: searchUrl,
              method: "GET",
            });
            const itunesData = JSON.parse(itunesResponse.text) as {
              results?: Array<{ feedUrl?: string; collectionName?: string }>;
            };
            if (
              itunesData.results &&
              itunesData.results.length > 0 &&
              itunesData.results[0].feedUrl
            ) {
              const feedUrl = itunesData.results[0].feedUrl;
              console.debug(
                `[RSS Dashboard] Successfully resolved Pocket Casts URL via iTunes API: ${feedUrl} (matched "${itunesData.results[0].collectionName}")`,
              );
              return feedUrl;
            }
            console.debug(
              `[RSS Dashboard] iTunes API returned no feedUrl for title: ${decodedTitle}`,
            );
          } catch (itunesErr) {
            void itunesErr;
            // [RSS Dashboard] iTunes Search API fallback failed (expected during proxy fallback chain)
          }
        }
      }

      throw new Error(
        `Could not find RSS feed link or valid title in HTML from Pocket Casts layout`,
      );
    } catch (e) {
      // [RSS Dashboard] Proxy ${proxyUrl} failed to resolve Pocket Casts URL (expected - trying next proxy)
      lastError = e instanceof Error ? e : new Error(String(e));
      // Continue to next proxy
    }
  }

  throw new Error(
    `Failed to resolve Pocket Casts URL after trying multiple proxies. Last error: ${lastError?.message}`,
  );
}

async function resolveApplePodcastUrl(
  applePodcastsUrl: string,
): Promise<string | null> {
  const podcastId = APPLE_PODCASTS.extractId(applePodcastsUrl);
  if (!podcastId) {
    throw new Error("Invalid Apple Podcasts URL: could not extract podcast ID");
  }

  const lookupUrl = `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast`;

  try {
    const response = await requestUrl({
      url: lookupUrl,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    const data = JSON.parse(response.text) as ItunesLookupResponse;

    if (data.resultCount === 0 || !data.results[0]?.feedUrl) {
      throw new Error("Podcast not found in Apple Podcasts directory");
    }
    return data.results[0].feedUrl;
  } catch (e) {
    console.error("[RSS Dashboard] iTunes API error:", e);
    throw new Error(
      `Failed to lookup podcast: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export interface FeedPreviewData {
  title: string;
  description: string;
  link: string;
  image: string;
  latestPubDate: string;
  hasEntries: boolean;
  feedUrl: string;
}

export interface FeedParseOptions {
  allowEmpty?: boolean;
}

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

// Type definitions for external API responses
interface AllOriginsResponse {
  contents: string;
}

interface Rss2JsonFeedItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
}

interface Rss2JsonFeed {
  title?: string;
  description?: string;
  link?: string;
  language?: string;
  image?: string;
}

interface Rss2JsonResponse {
  status: string;
  feed?: Rss2JsonFeed;
  items?: Rss2JsonFeedItem[];
  message?: string;
}

interface JsonFeedAuthor {
  name?: string;
}

interface JsonFeedItem {
  url?: string;
  title?: string;
  summary?: string;
  date_published?: string;
  id?: string;
  authors?: JsonFeedAuthor[];
  content_html?: string;
  content_text?: string;
  image?: string;
  category?: string;
  tags?: string[];
}

interface JsonFeed {
  version?: string;
  title?: string;
  description?: string;
  home_page_url?: string;
  authors?: JsonFeedAuthor[];
  icon?: string;
  items?: JsonFeedItem[];
}

export const EMPTY_FEED_ERROR_MESSAGE =
  "Feed is valid, but it currently has no items or entries to import.";

export class EmptyFeedError extends Error {
  constructor(message = EMPTY_FEED_ERROR_MESSAGE) {
    super(message);
    this.name = "EmptyFeedError";
  }
}

export function isEmptyFeedError(error: unknown): error is EmptyFeedError {
  return (
    error instanceof EmptyFeedError ||
    (error instanceof Error && error.name === "EmptyFeedError")
  );
}

export function getFeedErrorMessage(error: unknown): string {
  if (isEmptyFeedError(error)) {
    return EMPTY_FEED_ERROR_MESSAGE;
  }

  return error instanceof Error ? error.message : "Unknown error";
}

export function formatFeedParseNoticeMessage(
  error: unknown,
  prefix = "Error parsing feed",
): string {
  if (isEmptyFeedError(error)) {
    return EMPTY_FEED_ERROR_MESSAGE;
  }

  return `${prefix}: ${getFeedErrorMessage(error)}`;
}

export function isValidFeed(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 2048).toLowerCase();
  return (
    sample.includes("<rss") ||
    sample.includes("<feed") ||
    sample.includes("<rdf:rdf") ||
    sample.includes("<rdf") ||
    sample.includes('xmlns="http://purl.org/rss/1.0/"') ||
    sample.includes("xmlns:rdf=")
  );
}

async function discoverFeedUrl(baseUrl: string): Promise<string | null> {
  try {
    const response = await requestUrl({
      url: baseUrl,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.text) return null;

    if (baseUrl.includes("feeds.feedburner.com")) {
      const feedNameMatch = baseUrl.match(/feeds\.feedburner\.com\/([^/?]+)/);
      if (feedNameMatch) {
        const feedName = feedNameMatch[1];
        const feedBurnerUrls = [
          `https://feeds.feedburner.com/${feedName}?format=xml`,
          `https://feeds.feedburner.com/${feedName}?fmt=xml`,
          `https://feeds.feedburner.com/${feedName}?type=xml`,
          `https://feeds.feedburner.com/${feedName}/feed`,
          `https://feeds.feedburner.com/${feedName}/rss`,
          `https://feeds.feedburner.com/${feedName}/atom`,
          `https://feeds.feedburner.com/${feedName}.xml`,
          `https://feeds.feedburner.com/${feedName}/feed.xml`,
          `https://feeds.feedburner.com/${feedName}/rss.xml`,
          `https://feeds.feedburner.com/${feedName}/atom.xml`,
        ];

        for (const feedUrl of feedBurnerUrls) {
          try {
            const feedResponse = await requestUrl({
              url: feedUrl,
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                Accept:
                  "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
              },
            });

            if (
              feedResponse.text &&
              (feedResponse.text.includes("<rss") ||
                feedResponse.text.includes("<feed") ||
                feedResponse.text.includes("<channel"))
            ) {
              return feedUrl;
            }
          } catch {
            continue;
          }
        }
      }
    }

    const feedLinkMatches = response.text.match(
      /<link[^>]+(?:type="application\/rss\+xml"|type="application\/atom\+xml"|type="application\/rdf\+xml"|type="application\/xml")[^>]+href="([^"]+)"/gi,
    );

    if (feedLinkMatches) {
      for (const match of feedLinkMatches) {
        const hrefMatch = match.match(/href="([^"]+)"/);
        if (hrefMatch) {
          let feedUrl = hrefMatch[1];

          if (feedUrl.startsWith("/")) {
            const url = new URL(baseUrl);
            feedUrl = `${url.protocol}//${url.host}${feedUrl}`;
          } else if (!feedUrl.startsWith("http")) {
            feedUrl = `${baseUrl}/${feedUrl}`;
          }

          return feedUrl;
        }
      }
    }

    const altFeedPatterns = [
      /<a[^>]+href="([^"]*feed[^"]*)"[^>]*>/gi,
      /<a[^>]+href="([^"]*rss[^"]*)"[^>]*>/gi,
      /<a[^>]+href="([^"]*atom[^"]*)"[^>]*>/gi,
      /<a[^>]+href="([^"]*rdf[^"]*)"[^>]*>/gi,
      /<a[^>]+href="([^"]*xml[^"]*)"[^>]*>/gi,
    ];

    for (const pattern of altFeedPatterns) {
      const matches = response.text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const hrefMatch = match.match(/href="([^"]+)"/);
          if (hrefMatch) {
            let feedUrl = hrefMatch[1];
            if (feedUrl.startsWith("/")) {
              const url = new URL(baseUrl);
              feedUrl = `${url.protocol}//${url.host}${feedUrl}`;
            } else if (!feedUrl.startsWith("http")) {
              feedUrl = `${baseUrl}/${feedUrl}`;
            }
            if (feedUrl === baseUrl) continue;

            return feedUrl;
          }
        }
      }
    }
  } catch {
    // Feed discovery failed, return null
  }
  return null;
}

export async function fetchFeedXml(url: string): Promise<string> {
  const isAndroid = Platform.isAndroidApp;

  async function tryFetch(targetUrl: string): Promise<string> {
    if (targetUrl.includes("feeds.feedburner.com")) {
      const httpsUrl = targetUrl.replace(/^http:\/\//i, "https://");
      const feedNameMatch = httpsUrl.match(/feeds\.feedburner\.com\/([^/?]+)/);
      if (feedNameMatch) {
        const feedName = feedNameMatch[1];
        const feedBurnerUrls = [
          `https://feeds.feedburner.com/${feedName}?format=xml`,
          `https://feeds.feedburner.com/${feedName}?fmt=xml`,
          `https://feeds.feedburner.com/${feedName}?type=xml`,
          `https://feeds.feedburner.com/${feedName}`,
        ];
        for (const fbUrl of feedBurnerUrls) {
          try {
            const fbResponse = await requestUrl({
              url: fbUrl,
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept:
                  "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8",
              },
            });
            if (fbResponse.text && isValidFeed(fbResponse.text)) {
              return fbResponse.text;
            } else {
              throw new Error("Not a valid RSS/Atom feed");
            }
          } catch {
            continue;
          }
        }
      }
    }
    try {
      const secureUrl = targetUrl; // try original URL as-is first (don't force https)
      const response = await requestUrl({
        url: secureUrl,
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
          Accept:
            "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      });

      if (!response.text) {
        throw new Error("Empty response from feed");
      }

      if (isValidFeed(response.text)) {
        // Handle arXiv stub feeds that point to rss.arxiv.org but contain no items
        const hasItems = /<item\b[\s\S]*?<\/item>/i.test(response.text);
        if (!hasItems) {
          const atomLinkMatch = response.text.match(
            /<atom:link[^>]*href=["']([^"']+)["'][^>]*>/i,
          );
          const channelLinkMatch = response.text.match(
            /<channel[^>]*>[\s\S]*?<link[^>]*>([^<]+)<\/link>/i,
          );
          const candidateUrl =
            atomLinkMatch?.[1] || channelLinkMatch?.[1] || "";
          if (candidateUrl && /arxiv\.org\//i.test(candidateUrl)) {
            try {
              const arxivResp = await requestUrl({
                url: candidateUrl,
                method: "GET",
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                  Accept:
                    "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
                },
              });
              if (arxivResp.text && isValidFeed(arxivResp.text)) {
                return arxivResp.text;
              }
            } catch {
              // ArXiv feed fetch failed, continue
            }
          }
        }
        return response.text;
      }

      // If initial scheme fails, try toggled scheme (http<->https) before other fallbacks
      const toggledUrl = targetUrl.startsWith("http://")
        ? targetUrl.replace(/^http:\/\//i, "https://")
        : targetUrl.startsWith("https://")
          ? targetUrl.replace(/^https:\/\//i, "http://")
          : "";
      if (toggledUrl) {
        try {
          const toggledResp = await requestUrl({
            url: toggledUrl,
            method: "GET",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
              Accept:
                "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
            },
          });
          if (toggledResp.text && isValidFeed(toggledResp.text)) {
            return toggledResp.text;
          }
        } catch {
          // Toggled url fetch failed, continue
        }
      }

      if (
        response.text.includes("<?php") ||
        response.text.includes("WordPress") ||
        response.text.includes("wp-blog-header.php")
      ) {
        // [RSS Dashboard] Received php file instead of RSS feed, trying alternative URLs...

        const baseUrl = secureUrl.replace(/\/feed\/?$/, "");
        const alternativeUrls = [
          `${baseUrl}/feed/rss/`,
          `${baseUrl}/feed/rss2/`,
          `${baseUrl}/feed/atom/`,
          `${baseUrl}/rss/`,
          `${baseUrl}/rss.xml`,
          `${baseUrl}/feed.xml`,
          `${baseUrl}/index.php/feed/`,
          `${baseUrl}/?feed=rss2`,
          `${baseUrl}/?feed=rss`,
          `${baseUrl}/?feed=atom`,

          `${baseUrl}/wp-feed.php`,
          `${baseUrl}/feed/feed/`,
          `${baseUrl}/feed/rdf/`,

          `${baseUrl}/?feed=rss2&paged=1`,
          `${baseUrl}/?feed=rss&paged=1`,

          `${baseUrl}/feed`,
          `${baseUrl}/rss`,
          `${baseUrl}/rss.xml`,
          `${baseUrl}/index.rss`,
          `${baseUrl}/index.xml`,

          `${baseUrl}/index.php?feed=rss2`,
          `${baseUrl}/index.php?feed=rss`,
          `${baseUrl}/index.php?feed=atom`,
        ];

        for (const altUrl of alternativeUrls) {
          try {
            const altResponse = await requestUrl({
              url: altUrl,
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                Accept:
                  "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
              },
            });

            if (altResponse.text && isValidFeed(altResponse.text)) {
              return altResponse.text;
            } else {
              throw new Error("Not a valid RSS/Atom feed");
            }
          } catch {
            continue;
          }
        }

        const discoveredUrl =
          (await discoverFeedUrl(baseUrl)) ||
          (baseUrl.includes("arxiv.org")
            ? baseUrl.replace("export.arxiv.org", "rss.arxiv.org")
            : null);
        if (discoveredUrl) {
          try {
            const discoveredResponse = await requestUrl({
              url: discoveredUrl,
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                Accept:
                  "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
              },
            });

            if (
              discoveredResponse.text &&
              isValidFeed(discoveredResponse.text)
            ) {
              return discoveredResponse.text;
            } else {
              throw new Error("Not a valid RSS/Atom feed");
            }
          } catch {
            // Discovered url fetch failed, continue
          }
        }

        throw new Error(
          "All alternative feed URLs failed, received PHP file instead of RSS feed",
        );
      }

      throw new Error("Not a valid RSS/Atom feed");
    } catch (error) {
      void error;
      // [RSS Dashboard] direct fetch failed for ${targetUrl}, trying AllOrigins proxy...

      try {
        const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        const proxyResponse = await requestUrl({
          url: allOriginsUrl,
          method: "GET",
        });
        const data = JSON.parse(proxyResponse.text) as AllOriginsResponse;
        if (!data.contents) throw new Error("No contents from AllOrigins");

        if (isValidFeed(data.contents)) {
          return data.contents;
        } else {
          throw new Error("Not a valid RSS/Atom feed");
        }
      } catch (proxyError) {
        console.error(
          `[RSS dashboard] AllOrigins proxy fetch failed for ${targetUrl}:`,
          proxyError,
        );

        // Try allOrigins raw endpoint
        try {
          const rawUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
          const rawResp = await requestUrl({
            url: rawUrl,
            method: "GET",
          });
          if (rawResp.text && isValidFeed(rawResp.text)) {
            return rawResp.text;
          } else {
            throw new Error("AllOrigins raw returned non-feed");
          }
        } catch {
          // Toggled url fetch failed, continue
        }

        if (!isAndroid) {
          try {
            const codetabsUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(targetUrl)}`;
            const codetabsResponse = await requestUrl({
              url: codetabsUrl,
              method: "GET",
            });
            if (codetabsResponse.text && isValidFeed(codetabsResponse.text)) {
              return codetabsResponse.text;
            } else {
              throw new Error("Not a valid RSS/Atom feed");
            }
          } catch (e) {
            void e;
            // [RSS dashboard] codetabs proxy failed (expected - falls through to next proxy)
          }

          // isomorphic-git CORS proxy (raw)
          try {
            const isoUrl = `https://cors.isomorphic-git.org/${targetUrl}`;
            const isoResp = await requestUrl({
              url: isoUrl,
              method: "GET",
            });
            if (isoResp.text && isValidFeed(isoResp.text)) {
              return isoResp.text;
            } else {
              throw new Error("Not a valid RSS/Atom feed");
            }
          } catch (e) {
            void e;
            // [RSS dashboard] isomorphic-git proxy failed (expected - falls through to next proxy)
          }

          try {
            const thingproxyUrl = `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(targetUrl)}`;
            const thingproxyResponse = await requestUrl({
              url: thingproxyUrl,
              method: "GET",
            });
            if (
              thingproxyResponse.text &&
              isValidFeed(thingproxyResponse.text)
            ) {
              return thingproxyResponse.text;
            } else {
              throw new Error("Not a valid RSS/Atom feed");
            }
          } catch (e) {
            void e;
            // [RSS dashboard] thingproxy failed (expected - falls through to next proxy)
          }

          try {
            const discoveredUrl = await discoverFeedUrl(targetUrl);
            if (discoveredUrl && discoveredUrl !== targetUrl) {
              const discoveredResponse = await requestUrl({
                url: discoveredUrl,
                method: "GET",
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                  Accept:
                    "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8",
                },
              });
              if (
                discoveredResponse.text &&
                isValidFeed(discoveredResponse.text)
              ) {
                return discoveredResponse.text;
              } else {
                throw new Error("Not a valid RSS/Atom feed");
              }
            }
          } catch (e) {
            void e;
            // [RSS dashboard] discoverFeedUrl proxy fetch failed (expected - falls through to next proxy)
          }
        }
        throw new Error(
          `Could not fetch a valid RSS/Atom feed from ${targetUrl}`,
        );
      }
    }
  }

  try {
    return await tryFetch(url);
  } catch (error) {
    if (isAndroid) {
      throw error;
    }

    try {
      const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`;
      const proxyResponse = await requestUrl({
        url: proxyUrl,
        method: "GET",
        headers: {
          Accept:
            "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      });

      if (proxyResponse.text && isValidFeed(proxyResponse.text)) {
        return proxyResponse.text;
      } else {
        throw new Error("First proxy blocked by Cloudflare");
      }
    } catch {
      try {
        const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
        const proxyResponse = await requestUrl({
          url: rss2jsonUrl,
          method: "GET",
        });
        const data = JSON.parse(proxyResponse.text) as Rss2JsonResponse;

        if (data.status === "ok" && data.feed) {
          const feed = data.feed;
          const items = data.items || [];

          let rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n    <title>${feed.title || "Unknown feed"}</title>\n    <description>${feed.description || ""}</description>\n    <link>${feed.link || ""}</link>\n    <language>${feed.language || "en"}</language>`;

          if (feed.image) {
            rss += `\n    <image>\n        <url>${feed.image}</url>\n        <title>${feed.title || "Unknown feed"}</title>\n        <link>${feed.link || ""}</link>\n    </image>`;
          }

          items.forEach((item: Rss2JsonFeedItem) => {
            rss += `\n    <item>\n        <title>${item.title || ""}</title>\n        <link>${item.link || ""}</link>\n        <description><![CDATA[${item.description || ""}]]></description>\n        <pubDate>${item.pubDate || new Date().toISOString()}</pubDate>\n        <guid>${item.link || ""}</guid>\n    </item>`;
          });

          rss += `\n</channel>\n</rss>`;

          return rss;
        } else {
          throw new Error(
            "RSS2JSON returned error: " + (data.message || "Unknown error"),
          );
        }
      } catch {
        throw error;
      }
    }
  }
}

interface ParsedFeed {
  title: string;
  description?: string;
  link?: string;
  author?: string;
  image?: { url: string };
  items: ParsedItem[];
  type: "rss" | "atom" | "json";
  feedItunesImage: string;
  feedImageUrl: string;
}

interface ParsedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  author?: string;
  content?: string;
  category?: string;
  mediaContentType?: string;
  mediaContentMedium?: string;
  enclosure?: {
    url: string;
    type: string;
    length: string;
  };
  itunes?: {
    duration?: string;
    explicit?: string;
    image?: { href: string };
    category?: string;
    summary?: string;
    episodeType?: string;
    season?: string;
    episode?: string;
  };
  image?: { url: string };

  ieee?: {
    pubYear?: string;
    volume?: string;
    issue?: string;
    startPage?: string;
    endPage?: string;
    fileSize?: string;
    authors?: string;
  };
}

function assertParsedFeedHasEntries(
  parsed: ParsedFeed,
  options?: FeedParseOptions,
): void {
  if (!options?.allowEmpty && parsed.items.length === 0) {
    throw new EmptyFeedError();
  }
}

export class CustomXMLParser {
  private parseXML(xmlString: string): Document {
    const parser = new DOMParser();
    return parser.parseFromString(xmlString, "text/xml");
  }

  private detectEncoding(xmlString: string): string {
    const match = xmlString.match(/encoding=["']([^"']+)["']/);
    return match ? match[1] : "UTF-8";
  }

  private getTextContent(element: Element | null, tagName: string): string {
    if (!element) return "";
    let el: Element | null = null;

    if (tagName.includes("\\:")) {
      el = element.querySelector(tagName);
    } else if (tagName.includes(":")) {
      const [namespace, localName] = tagName.split(":");

      // 1. Try namespaced selector with backslash
      try {
        el = element.querySelector(`${namespace}\\:${localName}`);
      } catch {
        /* ignore */
      }

      // 2. Try getElementsByTagNameNS if not found
      if (!el) {
        try {
          const elements = element.getElementsByTagNameNS("*", localName);
          if (elements.length > 0) el = elements[0];
        } catch {
          /* ignore */
        }
      }

      // 3. Try local name only if still not found
      if (!el) {
        try {
          el = element.querySelector(localName);
        } catch {
          /* ignore */
        }
      }

      // 4. Try local-name() selector if still not found
      if (!el) {
        try {
          el = element.querySelector(`*[local-name()="${localName}"]`);
        } catch {
          /* ignore */
        }
      }
    } else {
      // Basic tag
      el = element.querySelector(tagName);
      if (!el) {
        try {
          const tagEls = element.getElementsByTagName(tagName);
          if (tagEls.length > 0) el = tagEls[0];
        } catch {
          /* ignore */
        }
      }
    }

    if (!el) return "";
    const textContent = el.textContent?.trim() || "";
    return textContent ? this.sanitizeCDATA(textContent) : "";
  }

  private sanitizeCDATA(text: string): string {
    if (!text) return "";

    let cleaned = text
      .replace(/<!\[CDATA\[/g, "")
      .replace(/\]\]>/g, "")
      .trim();

    cleaned = this.decodeHtmlEntities(cleaned);

    cleaned = cleaned.replace(/\s+/g, " ").trim();

    return cleaned;
  }

  public decodeHtmlEntities(text: string): string {
    if (!text) return "";

    const decoded = text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/")
      .replace(/&#8230;/g, "...")
      .replace(/&#8217;/g, "\u2019")
      .replace(/&#8216;/g, "\u2018")
      .replace(/&#8220;/g, "\u201C")
      .replace(/&#8221;/g, "\u201D")
      .replace(/&#8211;/g, "\u2013")
      .replace(/&#8212;/g, "\u2014")
      .replace(/&#038;/g, "&")
      .replace(/&#x26;/g, "&")
      .replace(/&#x3c;/g, "<")
      .replace(/&#x3e;/g, ">")
      .replace(/&#x22;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2f;/g, "/")
      .replace(/&apos;/g, "'")
      .replace(/&lsquo;/g, "\u2018")
      .replace(/&rsquo;/g, "\u2019")
      .replace(/&ldquo;/g, "\u201C")
      .replace(/&rdquo;/g, "\u201D")
      .replace(/&ndash;/g, "\u2013")
      .replace(/&mdash;/g, "\u2014")
      .replace(/&hellip;/g, "...")
      .replace(/&copy;/g, "\u00A9")
      .replace(/&reg;/g, "\u00AE")
      .replace(/&trade;/g, "\u2122")
      .replace(/&deg;/g, "\u00B0")
      .replace(/&plusmn;/g, "\u00B1")
      .replace(/&times;/g, "\u00D7")
      .replace(/&divide;/g, "\u00F7")
      .replace(/&frac12;/g, "\u00BD")
      .replace(/&frac14;/g, "\u00BC")
      .replace(/&frac34;/g, "\u00BE")
      .replace(/&sup1;/g, "\u00B9")
      .replace(/&sup2;/g, "\u00B2")
      .replace(/&sup3;/g, "\u00B3")
      .replace(/&micro;/g, "\u00B5")
      .replace(/&para;/g, "\u00B6")
      .replace(/&middot;/g, "\u00B7")
      .replace(/&bull;/g, "\u2022")
      .replace(/&dagger;/g, "\u2020")
      .replace(/&Dagger;/g, "\u2021")
      .replace(/&permil;/g, "\u2030")
      .replace(/&lsaquo;/g, "\u2039")
      .replace(/&rsaquo;/g, "\u203A")
      .replace(/&euro;/g, "\u20AC")
      .replace(/&pound;/g, "\u00A3")
      .replace(/&cent;/g, "\u00A2")
      .replace(/&curren;/g, "\u00A4")
      .replace(/&yen;/g, "\u00A5")
      .replace(/&brvbar;/g, "\u00A6")
      .replace(/&sect;/g, "\u00A7")
      .replace(/&uml;/g, "\u00A8")
      .replace(/&ordf;/g, "\u00AA")
      .replace(/&laquo;/g, "\u00AB")
      .replace(/&not;/g, "\u00AC")
      .replace(/&shy;/g, "\u00AD")
      .replace(/&macr;/g, "\u00AF")
      .replace(/&ordm;/g, "\u00BA")
      .replace(/&raquo;/g, "\u00BB")
      .replace(/&frac14;/g, "\u00BC")
      .replace(/&frac12;/g, "\u00BD")
      .replace(/&frac34;/g, "\u00BE")
      .replace(/&iquest;/g, "\u00BF")
      .replace(/&Agrave;/g, "\u00C0")
      .replace(/&Aacute;/g, "\u00C1")
      .replace(/&Acirc;/g, "\u00C2")
      .replace(/&Atilde;/g, "\u00C3")
      .replace(/&Auml;/g, "\u00C4")
      .replace(/&Aring;/g, "\u00C5")
      .replace(/&AElig;/g, "\u00C6")
      .replace(/&Ccedil;/g, "\u00C7")
      .replace(/&Egrave;/g, "\u00C8")
      .replace(/&Eacute;/g, "\u00C9")
      .replace(/&Ecirc;/g, "\u00CA")
      .replace(/&Euml;/g, "\u00CB")
      .replace(/&Igrave;/g, "\u00CC")
      .replace(/&Iacute;/g, "\u00CD")
      .replace(/&Icirc;/g, "\u00CE")
      .replace(/&Iuml;/g, "\u00CF")
      .replace(/&ETH;/g, "\u00D0")
      .replace(/&Ntilde;/g, "\u00D1")
      .replace(/&Ograve;/g, "\u00D2")
      .replace(/&Oacute;/g, "\u00D3")
      .replace(/&Ocirc;/g, "\u00D4")
      .replace(/&Otilde;/g, "\u00D5")
      .replace(/&Ouml;/g, "\u00D6")
      .replace(/&times;/g, "\u00D7")
      .replace(/&Oslash;/g, "\u00D8")
      .replace(/&Ugrave;/g, "\u00D9")
      .replace(/&Uacute;/g, "\u00DA")
      .replace(/&Ucirc;/g, "\u00DB")
      .replace(/&Uuml;/g, "\u00DC")
      .replace(/&Yacute;/g, "\u00DD")
      .replace(/&THORN;/g, "\u00DE")
      .replace(/&szlig;/g, "\u00DF")
      .replace(/&agrave;/g, "\u00E0")
      .replace(/&aacute;/g, "\u00E1")
      .replace(/&acirc;/g, "\u00E2")
      .replace(/&atilde;/g, "\u00E3")
      .replace(/&auml;/g, "\u00E4")
      .replace(/&aring;/g, "\u00E5")
      .replace(/&aelig;/g, "\u00E6")
      .replace(/&ccedil;/g, "\u00E7")
      .replace(/&egrave;/g, "\u00E8")
      .replace(/&eacute;/g, "\u00E9")
      .replace(/&ecirc;/g, "\u00EA")
      .replace(/&euml;/g, "\u00EB")
      .replace(/&igrave;/g, "\u00EC")
      .replace(/&iacute;/g, "\u00ED")
      .replace(/&icirc;/g, "\u00EE")
      .replace(/&iuml;/g, "\u00EF")
      .replace(/&eth;/g, "\u00F0")
      .replace(/&ntilde;/g, "\u00F1")
      .replace(/&ograve;/g, "\u00F2")
      .replace(/&oacute;/g, "\u00F3")
      .replace(/&ocirc;/g, "\u00F4")
      .replace(/&otilde;/g, "\u00F5")
      .replace(/&ouml;/g, "\u00F6")
      .replace(/&divide;/g, "\u00F7")
      .replace(/&oslash;/g, "\u00F8")
      .replace(/&ugrave;/g, "\u00F9")
      .replace(/&uacute;/g, "\u00FA")
      .replace(/&ucirc;/g, "\u00FB")
      .replace(/&uuml;/g, "\u00FC")
      .replace(/&yacute;/g, "\u00FD")
      .replace(/&thorn;/g, "\u00FE")
      .replace(/&yuml;/g, "\u00FF")
      .replace(/&#(\d+);/g, (match: string, dec: string) => {
        const num = parseInt(dec, 10);
        return num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : match;
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (match: string, hex: string) => {
        const num = parseInt(hex, 16);
        return num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : match;
      });

    return decoded;
  }

  private getAttribute(
    element: Element | null,
    tagName: string,
    attribute: string,
  ): string {
    if (!element) return "";

    let el: Element | null = null;

    if (tagName.includes("\\:")) {
      try {
        el = element.querySelector(tagName);
      } catch {
        /* ignore */
      }
    } else if (tagName.includes(":")) {
      const [namespace, localName] = tagName.split(":");

      try {
        el = element.querySelector(`${namespace}\\:${localName}`);
      } catch {
        /* ignore */
      }

      if (!el) {
        try {
          const elements = element.getElementsByTagNameNS("*", localName);
          if (elements.length > 0) el = elements[0];
        } catch {
          /* ignore */
        }
      }

      if (!el) {
        try {
          el = element.querySelector(localName);
        } catch {
          /* ignore */
        }
      }
    } else {
      try {
        el = element.querySelector(tagName);
      } catch {
        /* ignore */
      }
    }

    return el?.getAttribute(attribute) || "";
  }

  private getMediaImageUrl(item: Element): string {
    const MRSS_NS = "search.yahoo.com/mrss";

    const isMrss = (el: Element): boolean => {
      const ns = (el.namespaceURI || "").toLowerCase();
      if (ns.includes(MRSS_NS)) return true;

      // Fallback for DOM implementations that don't expose namespaceURI reliably.
      const tag = (el.tagName || "").toLowerCase();
      return tag.startsWith("media:") || tag.includes(":media:");
    };

    const score = (el: Element): number => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      const medium = (el.getAttribute("medium") || "").toLowerCase();
      const width = parseInt(el.getAttribute("width") || "0", 10);
      const height = parseInt(el.getAttribute("height") || "0", 10);
      const isImage = type.startsWith("image/") || medium === "image";

      // Base score: 1000 for images, 1 otherwise
      let s = isImage ? 1000 : 1;
      // Add dimensions to prioritize larger images
      s += Math.max(width, height);
      return s;
    };

    const pickBest = (candidates: Element[]): string => {
      const withUrl = candidates
        .map((el) => ({ el, url: (el.getAttribute("url") || "").trim() }))
        .filter((x) => !!x.url);
      if (withUrl.length === 0) return "";
      withUrl.sort((a, b) => score(b.el) - score(a.el));
      return withUrl[0].url;
    };

    // 1) Standard selectors (works in many environments)
    try {
      const url = pickBest(
        Array.from(item.querySelectorAll("media\\:content")),
      );
      if (url) return url;
    } catch {
      /* ignore */
    }

    try {
      const url = pickBest(
        Array.from(item.querySelectorAll("media\\:thumbnail")),
      );
      if (url) return url;
    } catch {
      /* ignore */
    }

    // 2) Namespace-robust fallback using localName + namespaceURI
    try {
      const all = Array.from(item.getElementsByTagNameNS("*", "*"));
      const mediaContent = all.filter(
        (el) => el.localName === "content" && isMrss(el),
      );
      const contentUrl = pickBest(mediaContent);
      if (contentUrl) return contentUrl;

      const mediaThumb = all.filter(
        (el) => el.localName === "thumbnail" && isMrss(el),
      );
      const thumbUrl = pickBest(mediaThumb);
      if (thumbUrl) return thumbUrl;
    } catch {
      /* ignore */
    }

    return "";
  }

  private getMediaContentType(item: Element): string {
    const MRSS_NS = "search.yahoo.com/mrss";

    const isMrss = (el: Element): boolean => {
      const ns = (el.namespaceURI || "").toLowerCase();
      if (ns.includes(MRSS_NS)) return true;

      const tag = (el.tagName || "").toLowerCase();
      return tag.startsWith("media:") || tag.includes(":media:");
    };

    const getPreferredType = (types: string[]): string => {
      const normalized = types
        .map((type) => type.trim().toLowerCase())
        .filter(Boolean);
      const preferred = normalized.find(
        (type) => type.startsWith("video/") || type.startsWith("audio/"),
      );
      return preferred || normalized[0] || "";
    };

    try {
      const mediaContent = Array.from(item.querySelectorAll("media\\:content"));
      const mediaContentType = getPreferredType(
        mediaContent.map((el) =>
          (el.getAttribute("type") || "").trim().toLowerCase(),
        ),
      );
      if (mediaContentType) {
        return mediaContentType;
      }
    } catch {
      /* ignore */
    }

    try {
      const all = Array.from(item.getElementsByTagNameNS("*", "*"));
      const namespacedTypes = all
        .filter((el) => el.localName === "content" && isMrss(el))
        .map((el) => (el.getAttribute("type") || "").trim().toLowerCase())
        .filter(Boolean);
      return getPreferredType(namespacedTypes);
    } catch {
      return "";
    }
  }

  private getMediaContentMedium(item: Element): string {
    const MRSS_NS = "search.yahoo.com/mrss";

    const isMrss = (el: Element): boolean => {
      const ns = (el.namespaceURI || "").toLowerCase();
      if (ns.includes(MRSS_NS)) return true;

      const tag = (el.tagName || "").toLowerCase();
      return tag.startsWith("media:") || tag.includes(":media:");
    };

    const getPreferredMedium = (mediums: string[]): string => {
      const normalized = mediums
        .map((medium) => medium.trim().toLowerCase())
        .filter(Boolean);
      const preferred = normalized.find(
        (medium) => medium === "video" || medium === "audio",
      );
      return preferred || normalized[0] || "";
    };

    const getElementMedium = (el: Element): string => {
      const medium = (el.getAttribute("medium") || "").trim().toLowerCase();
      if (medium) {
        return medium;
      }

      const type = (el.getAttribute("type") || "").trim().toLowerCase();
      if (type.startsWith("video/")) return "video";
      if (type.startsWith("audio/")) return "audio";
      if (type.startsWith("image/")) return "image";

      return "";
    };

    try {
      const mediaContent = Array.from(item.querySelectorAll("media\\:content"));
      const mediaContentMedium = getPreferredMedium(
        mediaContent.map((el) => getElementMedium(el)),
      );
      if (mediaContentMedium) {
        return mediaContentMedium;
      }
    } catch {
      /* ignore */
    }

    try {
      const all = Array.from(item.getElementsByTagNameNS("*", "*"));
      const namespacedMediums = all
        .filter((el) => el.localName === "content" && isMrss(el))
        .map((el) => getElementMedium(el))
        .filter(Boolean);
      return getPreferredMedium(namespacedMediums);
    } catch {
      return "";
    }
  }

  private getTextContentWithMultipleSelectors(
    element: Element | null,
    selectors: string[],
  ): string {
    if (!element) return "";

    for (const selector of selectors) {
      try {
        const el = element.querySelector(selector);
        if (el && el.textContent?.trim()) {
          return this.sanitizeCDATA(el.textContent.trim());
        }
      } catch {
        continue;
      }
    }

    return "";
  }

  private getTextContentWithNamespace(
    element: Element | null,
    namespace: string,
    tagName: string,
  ): string {
    const el = element?.querySelector(`${namespace}\\:${tagName}`);
    return el?.textContent?.trim() || "";
  }

  private validateFeedStructure(doc: Document): boolean {
    const hasRSS = doc.querySelector("rss");
    if (hasRSS) return true;

    const hasAtom = doc.querySelector("feed");
    if (hasAtom) return true;

    const rootElement = doc.documentElement;
    const hasRDF =
      rootElement &&
      (rootElement.getAttribute("xmlns:rdf") ||
        rootElement.getAttribute("xmlns")?.includes("rdf"));
    if (hasRDF) return true;

    const hasChannel = doc.querySelector("channel");
    if (hasChannel) return true;

    const hasItems = doc.querySelector("item");
    if (hasItems) return true;

    return false;
  }

  private sanitizeText(text: string): string {
    if (!text) return "";

    let cleaned = text.replace(/<[^>]*>/g, "");

    cleaned = this.decodeHtmlEntities(cleaned);

    return cleaned.replace(/\s+/g, " ").trim();
  }

  private convertAppUrls(url: string): string {
    if (url && url.startsWith("app://")) {
      return url.replace("app://", "https://");
    }
    return url;
  }

  /**
   * Normalizes URL-encoded strings that may be double-encoded.
   * For example: "ai%2520girlfriend.jpg" -> "ai girlfriend.jpg"
   * Detects double-encoding by checking for %25 (encoded percent)
   */
  public normalizeUrlEncoding(url: string): string {
    if (!url || !url.includes("%25")) {
      return url;
    }
    // URL decode once - this converts %25 to %
    // After this, %20 remains as %20 (single-encoded space), which is correct
    try {
      return decodeURIComponent(url);
    } catch {
      // If decode fails, return original
      return url;
    }
  }

  private extractImageFromContent(content: string): string {
    if (!content) return "";

    try {
      const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      const imageUrl = imgMatch ? imgMatch[1] : "";
      // Debug: log image URL extraction for troubleshooting
      if (imageUrl && imageUrl.includes("%25")) {
        console.debug(
          `[RSS Dashboard] extractImageFromContent: Found double-encoded URL: ${imageUrl}`,
        );
      }
      return this.convertAppUrls(imageUrl);
    } catch {
      return "";
    }
  }

  private transformSageUrl(url: string): string {
    if (url.includes("journals.sagepub.com")) {
      if (url.includes("/doi/abs/")) {
        const transformedUrl = url.replace("/doi/abs/", "/doi/full/");

        return transformedUrl;
      }

      if (url.includes("/doi/") && !url.includes("/doi/full/")) {
        const transformedUrl = url.replace("/doi/", "/doi/full/");

        return transformedUrl;
      }
    }
    return url;
  }

  private parseRSS(doc: Document): ParsedFeed {
    const channel = doc.querySelector("channel");
    if (!channel) throw new Error("Invalid rss feed: no channel element found");

    const title = this.getTextContent(channel, "title");

    const description = this.getTextContent(channel, "description");
    const link = this.getTextContent(channel, "link");

    const author =
      this.getTextContent(channel, "author") ||
      this.getTextContent(channel, "dc:creator");

    const imageElement = channel.querySelector("image");
    const image = imageElement
      ? { url: this.getTextContent(imageElement, "url") }
      : undefined;

    const feedItunesImage =
      this.getAttribute(channel, "itunes:image", "href") ||
      this.getAttribute(channel, "itunes\\:image", "href");
    const itunesImage = feedItunesImage ? { url: feedItunesImage } : undefined;
    const feedImageUrl = imageElement
      ? this.getTextContent(imageElement, "url")
      : "";

    const items: ParsedItem[] = [];
    // Use only direct child <item> nodes to avoid accidentally parsing nested
    // <item> tags that may appear in malformed feeds (e.g., inside description HTML).
    const itemElements = Array.from(channel.children).filter(
      (el) => el.tagName.toLowerCase() === "item",
    );

    itemElements.forEach((item) => {
      const title = this.getTextContent(item, "title");
      let link = this.getTextContent(item, "link");

      link = this.transformSageUrl(link);

      let description = this.getTextContent(item, "description");
      const pubDate = this.getTextContent(item, "pubDate");
      const guid = this.getTextContent(item, "guid") || link;

      if (description === "null" || description === "") {
        description = "";
      }

      const pubYear = this.getTextContent(item, "pubYear");
      const volume = this.getTextContent(item, "volume");
      const issue = this.getTextContent(item, "issue");
      const startPage = this.getTextContent(item, "startPage");
      const endPage = this.getTextContent(item, "endPage");
      const fileSize = this.getTextContent(item, "fileSize");
      const authors = this.getTextContent(item, "authors");

      const ieee =
        pubYear ||
        volume ||
        issue ||
        startPage ||
        endPage ||
        fileSize ||
        authors
          ? {
              pubYear,
              volume,
              issue,
              startPage,
              endPage,
              fileSize,
              authors,
            }
          : undefined;

      const author =
        authors ||
        this.getTextContent(item, "author") ||
        this.getTextContent(item, "dc:creator");

      const content =
        this.getTextContent(item, "content:encoded") ||
        this.getTextContent(item, "encoded") ||
        description;

      const enclosureElement = item.querySelector("enclosure");
      const enclosure = enclosureElement
        ? {
            url: enclosureElement.getAttribute("url") || "",
            type: enclosureElement.getAttribute("type") || "",
            length: enclosureElement.getAttribute("length") || "",
          }
        : undefined;

      const itunes = {
        duration: this.getTextContent(item, "itunes\\:duration"),
        explicit: this.getTextContent(item, "itunes\\:explicit"),
        image: {
          href: this.getAttribute(item, "itunes\\:image", "href"),
        },
        category: this.getTextContent(item, "itunes\\:category"),
        summary: this.getTextContent(item, "itunes\\:summary"),
        episodeType: this.getTextContent(item, "itunes\\:episodeType"),
        season: this.getTextContent(item, "itunes\\:season"),
        episode: this.getTextContent(item, "itunes\\:episode"),
      };

      const itemImageElement = item.querySelector("image");
      const itemImage = itemImageElement
        ? { url: this.getTextContent(itemImageElement, "url") }
        : undefined;

      let mediaImage = "";
      mediaImage = this.getMediaImageUrl(item);
      const mediaContentType = this.getMediaContentType(item) || undefined;
      const mediaContentMedium = this.getMediaContentMedium(item) || undefined;

      let fallbackImage = "";
      if (!itemImage && !mediaImage) {
        fallbackImage = this.extractImageFromContent(
          content || description || "",
        );
      }

      items.push({
        title,
        link,
        description,
        pubDate,
        guid,
        author,
        content,
        enclosure,
        itunes,
        image:
          itemImage ||
          (mediaImage ? { url: mediaImage } : undefined) ||
          (fallbackImage ? { url: fallbackImage } : undefined),
        category: this.getTextContent(item, "category"),
        mediaContentType,
        mediaContentMedium,
        ieee,
      });
    });

    const result: ParsedFeed = {
      title,
      description,
      link,
      author,
      image: itunesImage || image,
      items,
      type: "rss",
      feedItunesImage,
      feedImageUrl,
    };

    return result;
  }

  private parseRSS1(doc: Document): ParsedFeed {
    const channel = doc.querySelector("channel");
    if (!channel)
      throw new Error("Invalid rss 1.0 feed: no channel element found");

    const title = this.getTextContent(channel, "title");
    const description = this.getTextContent(channel, "description");
    const link = this.getTextContent(channel, "link");
    const author =
      this.getTextContent(channel, "dc:creator") ||
      this.getTextContent(channel, "dc:publisher");

    let image: { url: string } | undefined;
    const imageRef = channel.querySelector("image");
    if (imageRef) {
      const imageResource = imageRef.getAttribute("rdf:resource");
      if (imageResource) {
        image = { url: this.convertAppUrls(imageResource) };
      } else {
        const imageUrl = this.getTextContent(imageRef, "url");
        if (imageUrl) {
          image = { url: this.convertAppUrls(imageUrl) };
        }
      }
    }

    const items: ParsedItem[] = [];

    const itemElements = Array.from(doc.getElementsByTagName("item"));

    itemElements.forEach((item, _index) => {
      const guid =
        item.getAttribute("rdf:about") ||
        this.getTextContent(item, "guid") ||
        this.getTextContent(item, "link") ||
        this.getTextContent(item, "prism:url");

      const title =
        this.getTextContent(item, "title") ||
        this.getTextContent(item, "dc:title");
      let link =
        this.getTextContent(item, "link") ||
        this.getTextContent(item, "prism:url");

      link = this.transformSageUrl(link);

      const description =
        this.getTextContent(item, "description") ||
        this.getTextContent(item, "content:encoded");

      const pubDate =
        this.getTextContent(item, "dc:date") ||
        this.getTextContent(item, "pubDate");

      const authorElements = item.querySelectorAll("dc\\:creator");
      let author = "";
      if (authorElements.length > 0) {
        author = Array.from(authorElements)
          .map((el) => el.textContent?.trim())
          .filter((text) => text)
          .join(", ");
      } else {
        author = this.getTextContent(item, "dc:creator") || "";
      }

      const contentValue =
        this.getTextContent(item, "content:encoded") ||
        this.getTextContent(item, "encoded") ||
        description;

      items.push({
        title: title || "Untitled",
        link: link || "#",
        description: description || "",
        pubDate: pubDate || new Date().toISOString(),
        guid: guid || link || `item-${items.length}`,
        author: author || undefined,
        content: contentValue || description || "",
        category: this.getTextContent(item, "category"),
      });
    });

    return {
      title: title || "Unknown feed",
      description: description || "",
      link: link || "",
      author: author || undefined,
      image,
      items,
      type: "rss",
      feedItunesImage: "",
      feedImageUrl: "",
    };
  }

  private parseAtom(doc: Document): ParsedFeed {
    const feed = doc.querySelector("feed");
    if (!feed) {
      throw new Error("Invalid atom feed: no feed element found");
    }

    const title = this.getTextContent(feed, "title");
    const description = this.getTextContent(feed, "subtitle");
    const link =
      this.getAttribute(feed, 'link[rel="alternate"]', "href") ||
      this.getAttribute(feed, "link", "href");
    const author = this.getTextContent(feed, "author > name");

    // Try multiple sources for feed image (YouTube uses media:thumbnail for channel avatar)
    let imageUrl = "";

    // 1. Try media:thumbnail (YouTube channel avatar)
    const mediaThumbnail = feed.querySelector("media\\:thumbnail");
    if (mediaThumbnail) {
      imageUrl = mediaThumbnail.getAttribute("url") || "";
    }

    // 2. Try logo element
    if (!imageUrl) {
      const logoElement = feed.querySelector("logo");
      if (logoElement?.textContent) {
        imageUrl = logoElement.textContent;
      }
    }

    // 3. Try icon element
    if (!imageUrl) {
      const iconElement = feed.querySelector("icon");
      if (iconElement?.textContent) {
        imageUrl = iconElement.textContent;
      }
    }

    // 4. Try to extract from first entry's media:thumbnail as fallback for channel avatar
    if (!imageUrl) {
      const firstEntry = feed.querySelector("entry");
      if (firstEntry) {
        const entryMediaThumbnail =
          firstEntry.querySelector("media\\:thumbnail");
        if (entryMediaThumbnail) {
          imageUrl = entryMediaThumbnail.getAttribute("url") || "";
        }
      }
    }

    const image = imageUrl ? { url: imageUrl } : undefined;

    const items: ParsedItem[] = [];
    const entryElements = Array.from(feed.getElementsByTagName("entry"));

    entryElements.forEach((entry, _idx) => {
      const title = this.getTextContent(entry, "title");
      let link = this.getAtomEntryLink(entry);
      link = this.transformSageUrl(link);
      const description = this.getTextContent(entry, "summary");
      const pubDate =
        this.getTextContent(entry, "published") ||
        this.getTextContent(entry, "updated");
      const guid = this.getTextContent(entry, "id") || link;
      const author = this.getTextContent(entry, "author > name");
      const content = this.getTextContent(entry, "content") || description;

      // Extract duration from media:content or itunes:duration
      let duration = this.getTextContent(entry, "itunes\\:duration");
      if (!duration) {
        const mediaContent = entry.querySelector("media\\:content");
        if (mediaContent) {
          duration = mediaContent.getAttribute("duration") || "";
        }
      }

      items.push({
        title,
        link,
        description,
        pubDate,
        guid,
        author,
        content,
        category: this.getTextContent(entry, "category"),
        itunes: {
          duration: duration || undefined,
        },
      });
    });

    return {
      title,
      description,
      link,
      author,
      image,
      items,
      type: "atom",
      feedItunesImage: "",
      feedImageUrl: imageUrl,
    };
  }

  private parseJSON(jsonString: string): ParsedFeed {
    try {
      const data = JSON.parse(jsonString) as JsonFeed;

      if (data.version && data.version.startsWith("https://jsonfeed.org/")) {
        return {
          title: data.title || "",
          description: data.description,
          link: data.home_page_url,
          author: data.authors?.[0]?.name,
          image: data.icon ? { url: data.icon } : undefined,
          items:
            data.items?.map((item: JsonFeedItem) => {
              let itemUrl = item.url || "";

              itemUrl = this.transformSageUrl(itemUrl);

              return {
                title: item.title || "",
                link: itemUrl,
                description: item.summary || "",
                pubDate: item.date_published || new Date().toISOString(),
                guid: item.id || itemUrl || "",
                author: item.authors?.[0]?.name,
                content: item.content_html || item.content_text || "",
                image: item.image ? { url: item.image } : undefined,
                category: item.category || item.tags?.[0] || "",
              };
            }) || [],
          type: "json",
          feedItunesImage: "",
          feedImageUrl: "",
        };
      }

      throw new Error("Unsupported json feed format");
    } catch (error) {
      throw new Error(
        `Failed to parse json feed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private fallbackParse(xmlString: string): ParsedFeed {
    try {
      let cleanedXml = xmlString;

      cleanedXml = cleanedXml.replace(/<\?php[\s\S]*?\?>/gi, "");
      cleanedXml = cleanedXml.replace(/<\?.*?\?>/gi, "");

      // IMPORTANT: Do not unwrap CDATA globally here.
      // The fallback parser uses regexes to split `<item>...</item>` blocks, and unwrapping CDATA
      // can introduce literal `<item>` / `</item>` sequences from HTML content that cause item
      // boundaries to be detected incorrectly (leading to "two articles merged into one").

      const rssStartMatch = cleanedXml.match(/<rss[^>]*>/i);
      if (rssStartMatch) {
        const rssStartIndex = cleanedXml.indexOf(rssStartMatch[0]);
        cleanedXml = cleanedXml.substring(rssStartIndex);
      }

      const rssEndMatch = cleanedXml.match(/<\/rss>/i);
      if (rssEndMatch) {
        const rssEndIndex =
          cleanedXml.indexOf(rssEndMatch[0]) + rssEndMatch[0].length;
        cleanedXml = cleanedXml.substring(0, rssEndIndex);
      }

      const channelTitleMatch = cleanedXml.match(
        /<channel[^>]*>[\s\S]*?<title[^>]*>([^<]+)<\/title>/i,
      );
      const title = channelTitleMatch
        ? this.sanitizeCDATA(channelTitleMatch[1].trim())
        : "Unknown feed";

      const channelDescMatch = cleanedXml.match(
        /<channel[^>]*>[\s\S]*?<description[^>]*>([\s\S]*?)<\/description>/i,
      );
      const description = channelDescMatch
        ? this.sanitizeCDATA(channelDescMatch[1].trim())
        : "";

      const channelLinkMatch = cleanedXml.match(
        /<channel[^>]*>[\s\S]*?<link[^>]*>([^<]+)<\/link>/i,
      );
      const link = channelLinkMatch ? channelLinkMatch[1].trim() : "";

      const items: ParsedItem[] = [];

      const itemMatches: Array<{ full: string; inner: string }> = [];

      // When splitting items with regex, ignore any `<item>` strings inside CDATA sections by
      // masking `<`/`>` within CDATA with same-length control characters. This keeps indices stable
      // so we can slice from the unmodified `cleanedXml`.
      const xmlForItemSplit = cleanedXml.replace(
        /<!\[CDATA\[[\s\S]*?\]\]>/g,
        (cdata: string) =>
          cdata.replace(/</g, "\u0001").replace(/>/g, "\u0002"),
      );

      const itemRegex = /<item[^>]*>[\s\S]*?<\/item>/gi;
      let itemMatch: RegExpExecArray | null;
      while ((itemMatch = itemRegex.exec(xmlForItemSplit)) !== null) {
        const full = cleanedXml.substring(
          itemMatch.index,
          itemMatch.index + itemMatch[0].length,
        );
        const inner = full
          .replace(/^<item[^>]*>/i, "")
          .replace(/<\/item>\s*$/i, "");
        itemMatches.push({ full, inner });
      }

      if (itemMatches.length === 0) {
        // Replace lookahead with compatible pattern: find items by matching content until next item/channel/rss tag
        const itemStartRegex = /<item[^>]*>/gi;
        while ((itemMatch = itemStartRegex.exec(xmlForItemSplit)) !== null) {
          const itemStartIndex = itemMatch.index;
          const itemStartTag = itemMatch[0];
          const contentStartIndex = itemStartIndex + itemStartTag.length;

          // Find where this item ends by looking for next item, channel close, or rss close
          const remainingText = xmlForItemSplit.substring(contentStartIndex);
          const nextItemMatch = remainingText.match(/<item[^>]*>/i);
          const channelCloseMatch = remainingText.match(/<\/channel>/i);
          const rssCloseMatch = remainingText.match(/<\/rss>/i);

          let endIndex = remainingText.length;
          if (nextItemMatch && nextItemMatch.index !== undefined) {
            endIndex = Math.min(endIndex, nextItemMatch.index);
          }
          if (channelCloseMatch && channelCloseMatch.index !== undefined) {
            endIndex = Math.min(endIndex, channelCloseMatch.index);
          }
          if (rssCloseMatch && rssCloseMatch.index !== undefined) {
            endIndex = Math.min(endIndex, rssCloseMatch.index);
          }

          const full = cleanedXml.substring(
            itemStartIndex,
            contentStartIndex + endIndex,
          );
          const inner = cleanedXml.substring(
            contentStartIndex,
            contentStartIndex + endIndex,
          );
          itemMatches.push({ full, inner });
        }
      }

      if (itemMatches.length === 0) {
        const xmlForAggressiveSplit = xmlString.replace(
          /<!\[CDATA\[[\s\S]*?\]\]>/g,
          (cdata: string) =>
            cdata.replace(/</g, "\u0001").replace(/>/g, "\u0002"),
        );
        const aggressiveItemRegex = /<item[^>]*>[\s\S]*?<\/item>/gi;
        while (
          (itemMatch = aggressiveItemRegex.exec(xmlForAggressiveSplit)) !== null
        ) {
          const full = xmlString.substring(
            itemMatch.index,
            itemMatch.index + itemMatch[0].length,
          );
          const inner = full
            .replace(/^<item[^>]*>/i, "")
            .replace(/<\/item>\s*$/i, "");
          itemMatches.push({ full, inner });
        }
      }

      itemMatches.forEach((match) => {
        const itemXml = match.inner;

        let itemAuthor = "";
        let itemPubDate = "";
        let itemGuid = "";

        const itemTitleMatch = itemXml.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (!itemTitleMatch) {
          return;
        }

        const itemTitle = this.sanitizeCDATA(itemTitleMatch[1].trim());

        const itemLinkMatch = itemXml.match(/<link[^>]*>([^<]+)<\/link>/i);
        let itemLink = itemLinkMatch ? itemLinkMatch[1].trim() : "#";

        itemLink = this.transformSageUrl(itemLink);

        const itemDescMatch = itemXml.match(
          /<description[^>]*>([\s\S]*?)<\/description>/i,
        );
        let itemDescription = itemDescMatch
          ? this.sanitizeCDATA(itemDescMatch[1].trim())
          : "";
        if (itemDescription === "null" || itemDescription === "") {
          itemDescription = "";
        }

        const itemPubDateMatch = itemXml.match(
          /<pubDate[^>]*>([^<]+)<\/pubDate>/i,
        );
        itemPubDate = itemPubDateMatch
          ? itemPubDateMatch[1].trim()
          : new Date().toISOString();

        const itemGuidMatch = itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/i);
        itemGuid = itemGuidMatch ? itemGuidMatch[1].trim() : itemLink;

        const authorMatches = [
          itemXml.match(/<author[^>]*>([^<]+)<\/author>/i),
          itemXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i),
          itemXml.match(/<dc\\:creator[^>]*>([^<]+)<\/dc\\:creator>/i),
          itemXml.match(
            /<dc:creator[^>]*><!\[CDATA\[([^\]]*)\]\]><\/dc:creator>/i,
          ),
          itemXml.match(
            /<dc\\:creator[^>]*><!\[CDATA\[([^\]]*)\]\]><\/dc\\:creator>/i,
          ),
        ];
        for (const match of authorMatches) {
          if (match) {
            itemAuthor = this.sanitizeCDATA(match[1].trim());
            break;
          }
        }

        const itemCategoryMatch = itemXml.match(
          /<category[^>]*>([^<]+)<\/category>/i,
        );
        const itemCategory = itemCategoryMatch
          ? this.sanitizeCDATA(itemCategoryMatch[1].trim())
          : "";

        const mediaUrlMatch =
          itemXml.match(/<media:content[^>]*url=["']([^"']+)["']/i) ||
          itemXml.match(/<media\\:content[^>]*url=["']([^"']+)["']/i) ||
          itemXml.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i) ||
          itemXml.match(/<media\\:thumbnail[^>]*url=["']([^"']+)["']/i);
        const mediaUrl = mediaUrlMatch?.[1]?.trim() || "";
        const mediaContentMatches = [
          ...itemXml.matchAll(/<media:content\b[^>]*>/gi),
          ...itemXml.matchAll(/<media\\:content\b[^>]*>/gi),
        ];
        const mediaContentAttributes = mediaContentMatches.map((match) => {
          const element = match[0];
          const typeMatch = element.match(/type=["']([^"']+)["']/i);
          const mediumMatch = element.match(/medium=["']([^"']+)["']/i);
          const type = typeMatch?.[1]?.trim().toLowerCase() || "";
          const mediumFromType = type.startsWith("video/")
            ? "video"
            : type.startsWith("audio/")
              ? "audio"
              : type.startsWith("image/")
                ? "image"
                : "";
          return {
            type,
            medium: mediumMatch?.[1]?.trim().toLowerCase() || mediumFromType,
          };
        });

        const pickPreferredType = (types: string[]): string => {
          const normalized = types
            .map((type) => type.trim().toLowerCase())
            .filter(Boolean);
          const preferred = normalized.find(
            (type) => type.startsWith("video/") || type.startsWith("audio/"),
          );
          return preferred || normalized[0] || "";
        };

        const pickPreferredMedium = (mediums: string[]): string => {
          const normalized = mediums
            .map((medium) => medium.trim().toLowerCase())
            .filter(Boolean);
          const preferred = normalized.find(
            (medium) => medium === "video" || medium === "audio",
          );
          return preferred || normalized[0] || "";
        };

        const mediaContentType = pickPreferredType(
          mediaContentAttributes.map((entry) => entry.type),
        );
        const mediaContentMedium = pickPreferredMedium(
          mediaContentAttributes.map((entry) => entry.medium),
        );

        const pubYearMatch = itemXml.match(/<pubYear[^>]*>([^<]+)<\/pubYear>/i);
        const pubYear = pubYearMatch
          ? this.sanitizeCDATA(pubYearMatch[1].trim())
          : "";
        const volumeMatch = itemXml.match(/<volume[^>]*>([^<]+)<\/volume>/i);
        const volume = volumeMatch
          ? this.sanitizeCDATA(volumeMatch[1].trim())
          : "";
        const issueMatch = itemXml.match(/<issue[^>]*>([^<]+)<\/issue>/i);
        const issue = issueMatch
          ? this.sanitizeCDATA(issueMatch[1].trim())
          : "";
        const startPageMatch = itemXml.match(
          /<startPage[^>]*>([^<]+)<\/startPage>/i,
        );
        const startPage = startPageMatch
          ? this.sanitizeCDATA(startPageMatch[1].trim())
          : "";
        const endPageMatch = itemXml.match(/<endPage[^>]*>([^<]+)<\/endPage>/i);
        const endPage = endPageMatch
          ? this.sanitizeCDATA(endPageMatch[1].trim())
          : "";
        const fileSizeMatch = itemXml.match(
          /<fileSize[^>]*>([^<]+)<\/fileSize>/i,
        );
        const fileSize = fileSizeMatch
          ? this.sanitizeCDATA(fileSizeMatch[1].trim())
          : "";
        const authorsMatch = itemXml.match(/<authors[^>]*>([^<]+)<\/authors>/i);
        const authors = authorsMatch
          ? this.sanitizeCDATA(authorsMatch[1].trim())
          : "";
        const ieee =
          pubYear ||
          volume ||
          issue ||
          startPage ||
          endPage ||
          fileSize ||
          authors
            ? {
                pubYear,
                volume,
                issue,
                startPage,
                endPage,
                fileSize,
                authors,
              }
            : undefined;
        if (authors && !itemAuthor) {
          itemAuthor = authors;
        }
        items.push({
          title: itemTitle,
          link: itemLink,
          description: itemDescription,
          pubDate: itemPubDate,
          guid: itemGuid,
          author: itemAuthor || undefined,
          content: itemDescription,
          image: mediaUrl ? { url: this.convertAppUrls(mediaUrl) } : undefined,
          category: itemCategory,
          mediaContentType: mediaContentType || undefined,
          mediaContentMedium: mediaContentMedium || undefined,
          ieee,
        });
      });

      return {
        title,
        description,
        link,
        author: undefined,
        image: undefined,
        items,
        type: "rss",
        feedItunesImage: "",
        feedImageUrl: "",
      };
    } catch (error) {
      throw new Error(
        `Fallback parsing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private extractRssContent(xmlString: string): string {
    let rssContent = "";

    const rssMatch = xmlString.match(/<rss[^>]*>[\s\S]*?<\/rss>/i);
    if (rssMatch) {
      rssContent = rssMatch[0];
    } else {
      const channelMatch = xmlString.match(
        /<channel[^>]*>[\s\S]*?<\/channel>/i,
      );
      if (channelMatch) {
        rssContent = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0">${channelMatch[0]}</rss>`;
      } else {
        const itemMatches = xmlString.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
        if (itemMatches && itemMatches.length > 0) {
          const titleMatch = xmlString.match(/<title[^>]*>([^<]+)<\/title>/i);
          const descMatch = xmlString.match(
            /<description[^>]*>([\s\S]*?)<\/description>/i,
          );
          const linkMatch = xmlString.match(/<link[^>]*>([^<]+)<\/link>/i);

          const title = titleMatch ? titleMatch[1].trim() : "Unknown feed";
          const description = descMatch ? descMatch[1].trim() : "";
          const link = linkMatch ? linkMatch[1].trim() : "";

          rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
    <title>${title}</title>
    <description>${description}</description>
    <link>${link}</link>
    ${itemMatches.join("\n    ")}
</channel>
</rss>`;
        }
      }
    }

    if (rssContent) {
      return rssContent;
    }

    return xmlString;
  }

  private preprocessXmlContent(xmlString: string): string {
    let processed = xmlString;

    processed = processed.replace(/^\uFEFF/, "");

    const xmlDeclMatch = processed.match(/<\?xml[^>]*\?>/);
    let xmlDecl = "";
    if (xmlDeclMatch) {
      xmlDecl = xmlDeclMatch[0];
    }

    processed = processed.replace(/<\?.*?\?>/g, "");

    if (xmlDecl) {
      processed = xmlDecl + processed;
    }

    processed = processed.trim();

    if (!xmlDecl) {
      const rssStartMatch = processed.match(/<rss[^>]*>/i);
      if (rssStartMatch) {
        const rssStartIndex = processed.indexOf(rssStartMatch[0]);
        processed = processed.substring(rssStartIndex);
      }
    }

    const rssCloseMatch = processed.match(/<\/rss>/i);
    if (rssCloseMatch) {
      const rssCloseIndex =
        processed.indexOf(rssCloseMatch[0]) + rssCloseMatch[0].length;
      processed = processed.substring(0, rssCloseIndex);
    }

    // Only escape bare ampersands that are not already part of an entity and not inside CDATA
    processed = processed.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m: string) =>
      m.replace(/&/g, "__AMP__"),
    );
    // Replace lookahead with compatible pattern: match & and check if it's followed by valid entity pattern
    processed = processed.replace(
      /&/g,
      (match: string, offset: number, string: string) => {
        const remaining = string.substring(offset + 1);
        // Check if this ampersand is part of a valid entity
        if (remaining.match(/^(amp|lt|gt|quot|apos);/)) {
          return match; // Already valid entity
        }
        if (remaining.match(/^#\d+;/)) {
          return match; // Already valid numeric entity
        }
        if (remaining.match(/^#x[0-9a-fA-F]+;/i)) {
          return match; // Already valid hex entity
        }
        return "&amp;"; // Escape bare ampersand
      },
    );
    processed = processed.replace(/__AMP__/g, "&");

    if (!processed.startsWith("<?xml")) {
      processed = '<?xml version="1.0" encoding="UTF-8"?>' + processed;
    }

    // Auto-declare undeclared namespace prefixes to prevent XML parse errors
    const rootTagMatch = processed.match(/<(rss|feed|rdf:rdf)([^>]*)>/i);
    if (rootTagMatch) {
      const rootAttrs = rootTagMatch[2];
      const declaredPrefixes = new Set<string>();
      const nsRegex = /xmlns:(\w+)\s*=/g;
      let nsMatch;
      while ((nsMatch = nsRegex.exec(rootAttrs)) !== null) {
        declaredPrefixes.add(nsMatch[1].toLowerCase());
      }
      // Always consider these as declared (built-in XML prefixes)
      declaredPrefixes.add("xml");
      declaredPrefixes.add("xmlns");

      const usedPrefixes = new Set<string>();
      const prefixRegex = /<(\w+):\w+[\s>/]/g;
      let pfxMatch;
      while ((pfxMatch = prefixRegex.exec(processed)) !== null) {
        const prefix = pfxMatch[1].toLowerCase();
        if (!declaredPrefixes.has(prefix)) {
          usedPrefixes.add(pfxMatch[1]); // preserve original case
        }
      }

      if (usedPrefixes.size > 0) {
        const newAttrs = [...usedPrefixes]
          .map((p) => `xmlns:${p}="urn:x-${p}:unknown"`)
          .join(" ");
        const rootTag = rootTagMatch[1];
        processed = processed.replace(
          new RegExp(`<${rootTag}([^>]*)>`, "i"),
          `<${rootTag}$1 ${newAttrs}>`,
        );
      }
    }

    return processed;
  }

  parseString(xmlString: string): ParsedFeed {
    try {
      if (xmlString.trim().startsWith("{")) {
        return this.parseJSON(xmlString);
      }

      const cleanedXml = this.preprocessXmlContent(xmlString.trim());

      const doc = this.parseXML(cleanedXml);

      const parserError = doc.querySelector("parsererror");
      if (parserError) {
        const extractedXml = this.extractRssContent(xmlString);
        if (extractedXml !== xmlString) {
          try {
            const extractedDoc = this.parseXML(extractedXml);
            const extractedParserError =
              extractedDoc.querySelector("parsererror");
            if (
              !extractedParserError &&
              this.validateFeedStructure(extractedDoc)
            ) {
              const rootElement = extractedDoc.documentElement;
              const isRDF =
                rootElement && rootElement.tagName.toLowerCase() === "rdf:rdf";
              if (isRDF) {
                return this.parseRSS1(extractedDoc);
              } else if (extractedDoc.querySelector("rss")) {
                return this.parseRSS(extractedDoc);
              } else if (extractedDoc.querySelector("feed")) {
                return this.parseAtom(extractedDoc);
              }
            }
          } catch (extractError) {
            console.error(
              "[RSS dashboard] parseString: Error in fallback extraction",
              extractError,
            );
          }
        }

        return this.fallbackParse(xmlString);
      }

      if (!this.validateFeedStructure(doc)) {
        return this.fallbackParse(xmlString);
      }

      const rootElement = doc.documentElement;
      const isRDF =
        rootElement &&
        (rootElement.tagName.toLowerCase() === "rdf:rdf" ||
          rootElement.getAttribute("xmlns") === "http://purl.org/rss/1/");

      if (isRDF) {
        return this.parseRSS1(doc);
      } else if (doc.querySelector("rss")) {
        return this.parseRSS(doc);
      } else if (doc.querySelector("feed")) {
        return this.parseAtom(doc);
      } else {
        return this.fallbackParse(xmlString);
      }
    } catch (error) {
      console.error("[RSS dashboard] parseString error:", error);
      try {
        return this.fallbackParse(xmlString);
      } catch (fallbackError) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const fallbackMsg =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);
        throw new Error(
          `All parsing attempts failed: ${errorMsg}. Fallback error: ${fallbackMsg}`,
        );
      }
    }
  }

  private getAtomEntryLink(entry: Element): string {
    let el = entry.querySelector('link[rel="alternate"][type="text/html"]');
    if (el && el.getAttribute("href")) return el.getAttribute("href") || "";

    el = entry.querySelector('link[rel="alternate"]');
    if (el && el.getAttribute("href")) return el.getAttribute("href") || "";

    el = entry.querySelector("link[href]");
    if (el && el.getAttribute("href")) return el.getAttribute("href") || "";
    return "";
  }
}

function getPubDateMs(pubDate: string | undefined | null): number {
  if (!pubDate) return 0;
  const ms = Date.parse(pubDate);
  return Number.isFinite(ms) ? ms : 0;
}

function isProtectedItem(item: FeedItem): boolean {
  return !!item.saved || !!item.starred;
}

/**
 * Merge refreshed items with any previously cached items that fell out of the
 * server's latest-N window, keyed by item guid.
 *
 * Assumes `guid` values are stable identifiers (as produced by our parser).
 */
export function mergeFeedHistoryItems(
  existingItems: FeedItem[] | null | undefined,
  refreshedItems: FeedItem[],
): FeedItem[] {
  const seen = new Set<string>();
  const uniqueRefreshed: FeedItem[] = [];

  for (const item of refreshedItems) {
    const key = canonicalizeItemIdentityUrl(item.guid || item.link || "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRefreshed.push(item);
  }

  const carriedForward: FeedItem[] = [];
  for (const item of existingItems || []) {
    const key = canonicalizeItemIdentityUrl(item.guid || item.link || "");
    if (!key) continue;
    if (!seen.has(key)) {
      carriedForward.push(item);
      seen.add(key);
    }
  }

  return [...carriedForward, ...uniqueRefreshed];
}

export function applyFeedRetentionLimits(
  feed: Feed,
  options?: { nowMs?: number },
): Feed {
  const nowMs = options?.nowMs ?? Date.now();
  const maxItemsLimit =
    typeof feed.maxItemsLimit === "number" ? feed.maxItemsLimit : undefined;
  const autoDeleteDuration =
    typeof feed.autoDeleteDuration === "number"
      ? feed.autoDeleteDuration
      : undefined;

  const byNewest = (a: FeedItem, b: FeedItem): number => {
    const aMs = getPubDateMs(a.pubDate);
    const bMs = getPubDateMs(b.pubDate);
    if (aMs !== bMs) return bMs - aMs;
    return (a.guid || "").localeCompare(b.guid || "");
  };

  let items = [...(feed.items || [])];

  // Auto-delete: remove read-only items older than cutoff (never remove protected).
  if (autoDeleteDuration && autoDeleteDuration > 0) {
    const cutoffMs = nowMs - autoDeleteDuration * 24 * 60 * 60 * 1000;
    items = items.filter((item) => {
      if (isProtectedItem(item)) return true;
      if (!item.read) return true;
      return getPubDateMs(item.pubDate) > cutoffMs;
    });
  }

  // Max-items: keep newest non-protected items up to the limit; protected items don't count.
  if (maxItemsLimit && maxItemsLimit > 0) {
    const protectedItems = items.filter(isProtectedItem);
    const nonProtected = items.filter((item) => !isProtectedItem(item));
    nonProtected.sort(byNewest);
    const limitedNonProtected = nonProtected.slice(0, maxItemsLimit);
    items = [...protectedItems, ...limitedNonProtected];
  }

  // Always sort newest-first for predictable slicing in views and for stable persistence.
  items.sort(byNewest);

  return {
    ...feed,
    items,
  };
}

export class FeedParser {
  private mediaSettings: MediaSettings;
  private availableTags: Tag[];
  private parser: CustomXMLParser;

  constructor(mediaSettings: MediaSettings, availableTags: Tag[]) {
    this.mediaSettings = mediaSettings;
    this.availableTags = availableTags;
    this.parser = new CustomXMLParser();
  }

  private convertToAbsoluteUrl(relativeUrl: string, baseUrl: string): string {
    if (!relativeUrl || !baseUrl) return relativeUrl;

    // Normalize double-encoded URLs before processing
    relativeUrl = this.parser.normalizeUrlEncoding(relativeUrl);

    if (relativeUrl.startsWith("app://")) {
      return relativeUrl.replace("app://", "https://");
    }

    if (relativeUrl.startsWith("//")) {
      return "https:" + relativeUrl;
    }

    if (
      relativeUrl.startsWith("http://") ||
      relativeUrl.startsWith("https://")
    ) {
      return relativeUrl;
    }

    try {
      const base = new URL(baseUrl);

      if (relativeUrl.startsWith("/")) {
        return `${base.protocol}//${base.host}${relativeUrl}`;
      }

      return new URL(relativeUrl, base).href;
    } catch {
      return relativeUrl;
    }
  }

  private decodeHtmlEntities(text: string): string {
    if (!text) return "";

    const decoded = text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/")
      .replace(/&#8230;/g, "...")
      .replace(/&#8217;/g, "\u2019")
      .replace(/&#8216;/g, "\u2018")
      .replace(/&#8220;/g, "\u201C")
      .replace(/&#8221;/g, "\u201D")
      .replace(/&#8211;/g, "\u2013")
      .replace(/&#8212;/g, "\u2014")
      .replace(/&#038;/g, "&")
      .replace(/&#x26;/g, "&")
      .replace(/&#x3c;/g, "<")
      .replace(/&#x3e;/g, ">")
      .replace(/&#x22;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2f;/g, "/")
      .replace(/&apos;/g, "'")
      .replace(/&lsquo;/g, "\u2018")
      .replace(/&rsquo;/g, "\u2019")
      .replace(/&ldquo;/g, "\u201C")
      .replace(/&rdquo;/g, "\u201D")
      .replace(/&ndash;/g, "\u2013")
      .replace(/&mdash;/g, "\u2014")
      .replace(/&hellip;/g, "...")
      .replace(/&copy;/g, "\u00A9")
      .replace(/&reg;/g, "\u00AE")
      .replace(/&trade;/g, "\u2122")
      .replace(/&deg;/g, "\u00B0")
      .replace(/&plusmn;/g, "\u00B1")
      .replace(/&times;/g, "\u00D7")
      .replace(/&divide;/g, "\u00F7")
      .replace(/&frac12;/g, "\u00BD")
      .replace(/&frac14;/g, "\u00BC")
      .replace(/&frac34;/g, "\u00BE")
      .replace(/&sup1;/g, "\u00B9")
      .replace(/&sup2;/g, "\u00B2")
      .replace(/&sup3;/g, "\u00B3")
      .replace(/&micro;/g, "\u00B5")
      .replace(/&para;/g, "\u00B6")
      .replace(/&middot;/g, "\u00B7")
      .replace(/&bull;/g, "\u2022")
      .replace(/&dagger;/g, "\u2020")
      .replace(/&Dagger;/g, "\u2021")
      .replace(/&permil;/g, "\u2030")
      .replace(/&lsaquo;/g, "\u2039")
      .replace(/&rsaquo;/g, "\u203A")
      .replace(/&euro;/g, "\u20AC")
      .replace(/&pound;/g, "\u00A3")
      .replace(/&cent;/g, "\u00A2")
      .replace(/&curren;/g, "\u00A4")
      .replace(/&yen;/g, "\u00A5")
      .replace(/&brvbar;/g, "\u00A6")
      .replace(/&sect;/g, "\u00A7")
      .replace(/&uml;/g, "\u00A8")
      .replace(/&ordf;/g, "\u00AA")
      .replace(/&laquo;/g, "\u00AB")
      .replace(/&not;/g, "\u00AC")
      .replace(/&shy;/g, "\u00AD")
      .replace(/&macr;/g, "\u00AF")
      .replace(/&ordm;/g, "\u00BA")
      .replace(/&raquo;/g, "\u00BB")
      .replace(/&frac14;/g, "\u00BC")
      .replace(/&frac12;/g, "\u00BD")
      .replace(/&frac34;/g, "\u00BE")
      .replace(/&iquest;/g, "\u00BF")
      .replace(/&Agrave;/g, "\u00C0")
      .replace(/&Aacute;/g, "\u00C1")
      .replace(/&Acirc;/g, "\u00C2")
      .replace(/&Atilde;/g, "\u00C3")
      .replace(/&Auml;/g, "\u00C4")
      .replace(/&Aring;/g, "\u00C5")
      .replace(/&AElig;/g, "\u00C6")
      .replace(/&Ccedil;/g, "\u00C7")
      .replace(/&Egrave;/g, "\u00C8")
      .replace(/&Eacute;/g, "\u00C9")
      .replace(/&Ecirc;/g, "\u00CA")
      .replace(/&Euml;/g, "\u00CB")
      .replace(/&Igrave;/g, "\u00CC")
      .replace(/&Iacute;/g, "\u00CD")
      .replace(/&Icirc;/g, "\u00CE")
      .replace(/&Iuml;/g, "\u00CF")
      .replace(/&ETH;/g, "\u00D0")
      .replace(/&Ntilde;/g, "\u00D1")
      .replace(/&Ograve;/g, "\u00D2")
      .replace(/&Oacute;/g, "\u00D3")
      .replace(/&Ocirc;/g, "\u00D4")
      .replace(/&Otilde;/g, "\u00D5")
      .replace(/&Ouml;/g, "\u00D6")
      .replace(/&times;/g, "\u00D7")
      .replace(/&Oslash;/g, "\u00D8")
      .replace(/&Ugrave;/g, "\u00D9")
      .replace(/&Uacute;/g, "\u00DA")
      .replace(/&Ucirc;/g, "\u00DB")
      .replace(/&Uuml;/g, "\u00DC")
      .replace(/&Yacute;/g, "\u00DD")
      .replace(/&THORN;/g, "\u00DE")
      .replace(/&szlig;/g, "\u00DF")
      .replace(/&agrave;/g, "\u00E0")
      .replace(/&aacute;/g, "\u00E1")
      .replace(/&acirc;/g, "\u00E2")
      .replace(/&atilde;/g, "\u00E3")
      .replace(/&auml;/g, "\u00E4")
      .replace(/&aring;/g, "\u00E5")
      .replace(/&aelig;/g, "\u00E6")
      .replace(/&ccedil;/g, "\u00E7")
      .replace(/&egrave;/g, "\u00E8")
      .replace(/&eacute;/g, "\u00E9")
      .replace(/&ecirc;/g, "\u00EA")
      .replace(/&euml;/g, "\u00EB")
      .replace(/&igrave;/g, "\u00EC")
      .replace(/&iacute;/g, "\u00ED")
      .replace(/&icirc;/g, "\u00EE")
      .replace(/&iuml;/g, "\u00EF")
      .replace(/&eth;/g, "\u00F0")
      .replace(/&ntilde;/g, "\u00F1")
      .replace(/&ograve;/g, "\u00F2")
      .replace(/&oacute;/g, "\u00F3")
      .replace(/&ocirc;/g, "\u00F4")
      .replace(/&otilde;/g, "\u00F5")
      .replace(/&ouml;/g, "\u00F6")
      .replace(/&divide;/g, "\u00F7")
      .replace(/&oslash;/g, "\u00F8")
      .replace(/&ugrave;/g, "\u00F9")
      .replace(/&uacute;/g, "\u00FA")
      .replace(/&ucirc;/g, "\u00FB")
      .replace(/&uuml;/g, "\u00FC")
      .replace(/&yacute;/g, "\u00FD")
      .replace(/&thorn;/g, "\u00FE")
      .replace(/&yuml;/g, "\u00FF")
      .replace(/&#(\d+);/g, (match: string, dec: string) => {
        const num = parseInt(dec, 10);
        return num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : match;
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (match: string, hex: string) => {
        const num = parseInt(hex, 16);
        return num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : match;
      });

    return decoded;
  }

  /**
   * Normalizes URL-encoded strings that may be double-encoded.
   * For example: "ai%2520girlfriend.jpg" -> "ai girlfriend.jpg"
   * Detects double-encoding by checking for %25 (encoded percent)
   */
  private normalizeUrlEncoding(url: string): string {
    if (!url || !url.includes("%25")) {
      return url;
    }
    // URL decode once - this converts %25 to %
    // After this, %20 remains as %20 (single-encoded space), which is correct
    try {
      return decodeURIComponent(url);
    } catch {
      // If decode fails, return original
      return url;
    }
  }

  private convertRelativeUrlsInContent(
    content: string,
    baseUrl: string,
  ): string {
    if (!content || !baseUrl) return content;

    try {
      content = content.replace(/app:\/\//g, "https://");

      content = content.replace(
        /<img([^>]+)src=["']([^"']+)["']/gi,
        (match: string, attributes: string, src: string) => {
          const decodedSrc = this.parser.decodeHtmlEntities(src);
          const absoluteSrc = this.convertToAbsoluteUrl(decodedSrc, baseUrl);
          return `<img${attributes}src="${absoluteSrc}"`;
        },
      );

      content = content.replace(
        /<source([^>]+)srcset=["']([^"']+)["']/gi,
        (match: string, attributes: string, srcset: string) => {
          const processedSrcset = srcset
            .split(",")
            .map((part: string) => {
              const trimmedPart = part.trim();

              const urlMatch = trimmedPart.match(/^([^\s]+)(\s+\d+w)?$/);
              if (urlMatch) {
                const url = urlMatch[1];
                const sizeDescriptor = urlMatch[2] || "";

                const decodedUrl = this.parser.decodeHtmlEntities(url);
                const absoluteUrl = this.convertToAbsoluteUrl(
                  decodedUrl,
                  baseUrl,
                );
                return absoluteUrl + sizeDescriptor;
              }
              return trimmedPart;
            })
            .join(", ");
          return `<source${attributes}srcset="${processedSrcset}"`;
        },
      );

      content = content.replace(
        /<a([^>]+)href=["']([^"']+)["']/gi,
        (match: string, attributes: string, href: string) => {
          const decodedHref = this.decodeHtmlEntities(href);
          const absoluteHref = this.convertToAbsoluteUrl(decodedHref, baseUrl);
          return `<a${attributes}href="${absoluteHref}"`;
        },
      );

      return content;
    } catch {
      return content;
    }
  }

  private extractCoverImage(html: string, baseUrl = ""): string {
    if (!html) return "";

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const ogImage = doc.querySelector('meta[property="og:image"]');
      if (ogImage?.getAttribute("content")) {
        const content = ogImage.getAttribute("content");
        // Debug: log og:image URL for troubleshooting double-encoding
        if (content && content.includes("%25")) {
          console.debug(
            `[RSS Dashboard] extractCoverImage: og:image contains double-encoded: ${content}`,
          );
        }
        if (content && content.startsWith("http")) {
          return content;
        } else if (content && baseUrl) {
          return this.convertToAbsoluteUrl(content, baseUrl);
        }
      }

      const twitterImage = doc.querySelector('meta[name="twitter:image"]');
      if (twitterImage?.getAttribute("content")) {
        const content = twitterImage.getAttribute("content");
        // Debug: log twitter:image URL for troubleshooting double-encoding
        if (content && content.includes("%25")) {
          console.debug(
            `[RSS Dashboard] extractCoverImage: twitter:image contains double-encoded: ${content}`,
          );
        }
        if (content && content.startsWith("http")) {
          return content;
        } else if (content && baseUrl) {
          return this.convertToAbsoluteUrl(content, baseUrl);
        }
      }

      const firstImg = doc.querySelector("img");
      if (firstImg?.getAttribute("src")) {
        const src = firstImg.getAttribute("src");
        // Debug: log first img src for troubleshooting double-encoding
        if (src && src.includes("%25")) {
          console.debug(
            `[RSS Dashboard] extractCoverImage: first img src contains double-encoded: ${src}`,
          );
        }
        if (src && src.startsWith("http")) {
          return src;
        } else if (src && baseUrl) {
          return this.convertToAbsoluteUrl(src, baseUrl);
        }
      }

      const imgTags = doc.querySelectorAll("img");
      for (const img of Array.from(imgTags)) {
        const src = img.getAttribute("src");
        // Debug: log each img src for troubleshooting double-encoding
        if (src && src.includes("%25")) {
          console.debug(
            `[RSS Dashboard] extractCoverImage: img src contains double-encoded: ${src}`,
          );
        }
        if (
          src &&
          src.startsWith("http") &&
          (src.endsWith(".jpg") ||
            src.endsWith(".jpeg") ||
            src.endsWith(".png") ||
            src.endsWith(".gif") ||
            src.endsWith(".webp") ||
            src.includes("image"))
        ) {
          return src;
        } else if (
          src &&
          baseUrl &&
          (src.endsWith(".jpg") ||
            src.endsWith(".jpeg") ||
            src.endsWith(".png") ||
            src.endsWith(".gif") ||
            src.endsWith(".webp") ||
            src.includes("image"))
        ) {
          return this.convertToAbsoluteUrl(src, baseUrl);
        }
      }
    } catch {
      // Image extraction failed
    }

    return "";
  }

  private extractPodcastCoverImage(
    item: ParsedItem,
    feedImage: { url: string } | string | undefined,
    baseUrl: string,
  ): string {
    if (item.itunes?.image?.href) {
      const itunesImage = this.convertToAbsoluteUrl(
        item.itunes.image.href,
        baseUrl,
      );
      if (itunesImage) {
        return itunesImage;
      }
    }

    if (item.image?.url) {
      const itemImage = this.convertToAbsoluteUrl(item.image.url, baseUrl);
      if (itemImage) {
        return itemImage;
      }
    }

    if (feedImage) {
      let feedImageUrl = "";
      if (typeof feedImage === "string") {
        feedImageUrl = feedImage;
      } else if (feedImage.url) {
        feedImageUrl = feedImage.url;
      }

      if (feedImageUrl) {
        const convertedUrl = this.convertToAbsoluteUrl(feedImageUrl, baseUrl);
        if (convertedUrl) {
          return convertedUrl;
        }
      }
    }

    const contentImage = this.extractCoverImage(
      item.content || item.description || "",
      baseUrl,
    );
    if (contentImage) {
      return contentImage;
    }

    return "";
  }

  private resolvePodcastCoverImage(
    item: ParsedItem,
    parsed: ParsedFeed,
    baseUrl: string,
  ): string {
    const resolvedImage = this.extractPodcastCoverImage(
      item,
      parsed.image,
      baseUrl,
    );
    if (resolvedImage) {
      return resolvedImage;
    }

    if (parsed.feedItunesImage) {
      return this.convertToAbsoluteUrl(parsed.feedItunesImage, baseUrl);
    }

    if (parsed.feedImageUrl) {
      return this.convertToAbsoluteUrl(parsed.feedImageUrl, baseUrl);
    }

    return "";
  }

  private extractSummary(description: string, maxLength = 220): string {
    if (!description) return "";

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(description, "text/html");
      let text = doc.body.textContent || "";

      text = this.decodeHtmlEntities(text);

      text = text.replace(/\s+/g, " ").trim();

      if (text.length > maxLength) {
        text = text.substring(0, maxLength) + "...";
      }

      return text;
    } catch {
      return "";
    }
  }

  async parseFeed(
    url: string,
    existingFeed: Feed | null = null,
    options?: FeedParseOptions,
  ): Promise<Feed> {
    if (!url) {
      throw new Error("Feed url is required");
    }

    const responseText = await fetchFeedXml(url);
    const parsed = this.parser.parseString(responseText);

    assertParsedFeedHasEntries(parsed, options);

    const feedTitle = existingFeed?.title || parsed.title || "Unnamed feed";

    const newFeed: Feed = existingFeed || {
      title: feedTitle,
      url: url,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
    };

    const resolvedSiteUrl = resolveAbsoluteHttpUrl(parsed.link, url);
    if (resolvedSiteUrl) {
      newFeed.siteUrl = resolvedSiteUrl;
    }

    const existingItems = new Map<string, FeedItem>();
    if (existingFeed) {
      existingFeed.items.forEach((item) => {
        const rawKey = this.convertToAbsoluteUrl(
          item.guid || item.link || "",
          url,
        );
        const key = canonicalizeItemIdentityUrl(rawKey);
        if (key) {
          existingItems.set(key, item);
        }
      });
    }

    const newItems: FeedItem[] = [];
    const updatedItems: FeedItem[] = [];
    const seenGuids = new Set<string>();
    let skippedByRefreshCutoffCount = 0;

    // Compute auto-delete cutoff so we can skip "new" items that are actually
    // old entries re-appearing in the feed after being auto-deleted.
    const autoDeleteDays =
      typeof newFeed.autoDeleteDuration === "number"
        ? newFeed.autoDeleteDuration
        : 0;
    const autoDeleteCutoffMs =
      autoDeleteDays > 0
        ? Date.now() - autoDeleteDays * 24 * 60 * 60 * 1000
        : 0;

    for (const item of parsed.items) {
      const isAudioEnclosure = item.enclosure?.type?.startsWith("audio/");
      const isAudioLink = !!(item.link && item.link.includes(".mp3"));
      const isPodcast = isAudioEnclosure || isAudioLink;

      const audioUrl = isAudioEnclosure
        ? this.convertToAbsoluteUrl(item.enclosure?.url || "", url)
        : isAudioLink
          ? this.convertToAbsoluteUrl(item.link || "", url)
          : undefined;

      const enclosure =
        item.enclosure ||
        (isAudioLink
          ? {
              url: this.convertToAbsoluteUrl(item.link || "", url),
              type: "audio/mpeg",
              length: "",
            }
          : undefined);

      const rawItemGuid = this.convertToAbsoluteUrl(
        item.guid || item.link || "",
        url,
      );
      const itemGuid = canonicalizeItemIdentityUrl(rawItemGuid);
      if (!itemGuid) continue;
      if (seenGuids.has(itemGuid)) continue;
      seenGuids.add(itemGuid);

      const existingItem = existingItems.get(itemGuid);

      if (existingItem) {
        if (
          autoDeleteCutoffMs > 0 &&
          !isProtectedItem(existingItem) &&
          getPubDateMs(item.pubDate || existingItem.pubDate) <=
            autoDeleteCutoffMs
        ) {
          skippedByRefreshCutoffCount++;
          continue;
        }

        let coverImage = existingItem.coverImage;
        if (isPodcast) {
          coverImage =
            this.resolvePodcastCoverImage(item, parsed, url) ||
            existingItem.coverImage;
        } else {
          coverImage =
            this.extractCoverImage(
              item.content || item.description || "",
              url,
            ) ||
            this.convertToAbsoluteUrl(
              item.itunes?.image?.href || item.image?.url || "",
              url,
            ) ||
            (item.enclosure?.type?.startsWith("image/")
              ? this.convertToAbsoluteUrl(item.enclosure.url, url)
              : "") ||
            existingItem.coverImage;
        }
        const updatedItem: FeedItem = {
          ...existingItem,
          guid: itemGuid,
          link:
            this.convertToAbsoluteUrl(item.link || "", url) ||
            existingItem.link,
          title: item.title || existingItem.title,
          description: this.convertRelativeUrlsInContent(
            item.description || "",
            url,
          ),
          content: this.convertRelativeUrlsInContent(item.content || "", url),
          pubDate: item.pubDate || existingItem.pubDate,
          author: item.author || parsed.author || existingItem.author,
          read: existingItem.read,
          starred: existingItem.starred,
          saved: existingItem.saved,
          savedFilePath: existingItem.savedFilePath,
          feedTitle: newFeed.title, // Update feedTitle to match the new feed title
          coverImage,
          summary:
            this.extractSummary(item.content || item.description || "") ||
            existingItem.summary,
          image:
            this.convertToAbsoluteUrl(
              item.itunes?.image?.href || item.image?.url || "",
              url,
            ) ||
            (item.enclosure?.type?.startsWith("image/")
              ? this.convertToAbsoluteUrl(item.enclosure.url, url)
              : "") ||
            existingItem.image,
          duration: item.itunes?.duration || existingItem.duration,
          explicit: item.itunes?.explicit === "yes" || existingItem.explicit,
          category: item.itunes?.category || existingItem.category,
          episodeType: item.itunes?.episodeType || existingItem.episodeType,
          season: item.itunes?.season
            ? Number(item.itunes.season)
            : existingItem.season,
          episode: item.itunes?.episode
            ? Number(item.itunes.episode)
            : existingItem.episode,
          enclosure: enclosure ? enclosure : existingItem.enclosure,
          ieee: item.ieee || existingItem.ieee,
          audioUrl: audioUrl ? audioUrl : existingItem.audioUrl,
          mediaContentType:
            item.mediaContentType || existingItem.mediaContentType,
          mediaContentMedium:
            item.mediaContentMedium || existingItem.mediaContentMedium,
          mediaType: isPodcast
            ? "podcast"
            : existingItem.mediaType || "article",
        };
        updatedItems.push(updatedItem);
      } else {
        // Skip items older than the auto-delete cutoff during refresh.
        // These were likely auto-deleted previously and should not reappear as unread.
        if (
          existingFeed &&
          autoDeleteCutoffMs > 0 &&
          getPubDateMs(item.pubDate) <= autoDeleteCutoffMs
        ) {
          skippedByRefreshCutoffCount++;
          continue;
        }

        let coverImage = "";
        if (isPodcast) {
          coverImage = this.resolvePodcastCoverImage(item, parsed, url);
        } else {
          coverImage =
            this.extractCoverImage(
              item.content || item.description || "",
              url,
            ) ||
            this.convertToAbsoluteUrl(
              item.itunes?.image?.href || item.image?.url || "",
              url,
            ) ||
            (item.enclosure?.type?.startsWith("image/")
              ? this.convertToAbsoluteUrl(item.enclosure.url, url)
              : "");
        }
        let image = this.convertToAbsoluteUrl(
          item.itunes?.image?.href || item.image?.url || "",
          url,
        );
        if (!image) {
          image = this.extractCoverImage(
            item.content || item.description || "",
            url,
          );
        }
        if (!image && item.enclosure?.type?.startsWith("image/")) {
          image = this.convertToAbsoluteUrl(item.enclosure.url, url);
        }
        const summary = this.extractSummary(
          item.content || item.description || "",
        );
        const newItem: FeedItem = {
          title: item.title || "No title",
          link: this.convertToAbsoluteUrl(item.link || "", url),
          description: this.convertRelativeUrlsInContent(
            item.description || "",
            url,
          ),
          content: this.convertRelativeUrlsInContent(item.content || "", url),
          pubDate: item.pubDate || new Date().toISOString(),
          guid: itemGuid,
          read: false,
          starred: false,
          tags: [],
          feedTitle: newFeed.title,
          feedUrl: newFeed.url,
          coverImage,
          summary,
          author: item.author || parsed.author,
          saved: false,
          mediaType: isPodcast ? "podcast" : "article",
          duration: item.itunes?.duration,
          explicit: item.itunes?.explicit === "yes",
          image: image,
          category: item.itunes?.category,
          episodeType: item.itunes?.episodeType,
          season: item.itunes?.season ? Number(item.itunes.season) : undefined,
          episode: item.itunes?.episode
            ? Number(item.itunes.episode)
            : undefined,
          enclosure: enclosure,
          ieee: item.ieee,
          audioUrl: audioUrl,
          mediaContentType: item.mediaContentType,
          mediaContentMedium: item.mediaContentMedium,
        };
        newItems.push(newItem);
      }
    }

    const refreshedItems = [...updatedItems, ...newItems];
    const carriedForward: FeedItem[] = [];
    if (existingFeed) {
      for (const item of existingFeed.items) {
        const rawKey = this.convertToAbsoluteUrl(
          item.guid || item.link || "",
          url,
        );
        const key = canonicalizeItemIdentityUrl(rawKey);
        if (
          key &&
          !seenGuids.has(key) &&
          !(
            autoDeleteCutoffMs > 0 &&
            !isProtectedItem(item) &&
            getPubDateMs(item.pubDate) <= autoDeleteCutoffMs
          )
        ) {
          carriedForward.push(item);
        }
      }
    }

    newFeed.items = mergeFeedHistoryItems(carriedForward, refreshedItems);
    newFeed.lastUpdated = Date.now();

    const mergedItemCountBeforeRetention = newFeed.items.length;

    this.applyFeedLimits(newFeed);

    newFeed.lastRefreshDiagnostics = {
      fetchedItemCount: parsed.items.length,
      mergedItemCountBeforeRetention,
      retainedItemCount: newFeed.items.length,
      retentionRemovedCount: Math.max(
        0,
        mergedItemCountBeforeRetention - newFeed.items.length,
      ),
      skippedByRefreshCutoffCount,
      autoDeleteDurationDays: autoDeleteDays > 0 ? autoDeleteDays : undefined,
    };

    const feedLogoCandidates = [
      parsed.feedItunesImage,
      parsed.feedImageUrl,
      parsed.image && typeof parsed.image === "object" ? parsed.image.url : "",
      typeof parsed.image === "string" ? parsed.image : "",
    ].filter(Boolean);
    const feedLogoUrl =
      feedLogoCandidates.length > 0 ? feedLogoCandidates[0] : "";
    const coverImageCounts: Record<string, number> = {};
    newFeed.items.forEach((item) => {
      if (item.coverImage) {
        coverImageCounts[item.coverImage] =
          (coverImageCounts[item.coverImage] || 0) + 1;
      }
    });
    const totalItems = newFeed.items.length;
    Object.entries(coverImageCounts).forEach(([imgUrl, count]) => {
      if (
        imgUrl &&
        (imgUrl === feedLogoUrl || feedLogoCandidates.includes(imgUrl)) &&
        count >= Math.max(2, Math.floor(totalItems * 0.8))
      ) {
        newFeed.items.forEach((item) => {
          if (item.coverImage === imgUrl && item.mediaType !== "podcast") {
            item.coverImage = "";
          }
        });
      }
    });

    // Store the feed icon URL for display in sidebar
    newFeed.iconUrl = feedLogoUrl
      ? this.convertToAbsoluteUrl(feedLogoUrl, url)
      : "";

    const processedFeed = MediaService.detectAndProcessFeed(newFeed);
    if (processedFeed.mediaType === "video" && !existingFeed?.folder) {
      processedFeed.folder = this.mediaSettings.defaultYouTubeFolder;
    } else if (processedFeed.mediaType === "podcast" && !existingFeed?.folder) {
      processedFeed.folder = this.mediaSettings.defaultPodcastFolder;
    }
    return MediaService.applyMediaTags(
      processedFeed,
      this.availableTags,
      this.mediaSettings,
    );
  }

  /**
   * Apply maxItemsLimit and autoDeleteDuration to a feed's items
   */
  private applyFeedLimits(feed: Feed): void {
    const updated = applyFeedRetentionLimits(feed);
    feed.items = updated.items;
  }

  async refreshFeed(feed: Feed): Promise<Feed> {
    try {
      const refreshedFeed = await this.parseFeed(feed.url, feed);

      return refreshedFeed;
    } catch (error) {
      console.error(
        `[RSS dashboard] Error parsing feed ${feed.title} (${feed.url}):`,
        error,
      );
      return feed;
    }
  }

  async refreshAllFeeds(feeds: Feed[]): Promise<Feed[]> {
    const updatedFeeds: Feed[] = [];

    for (const feed of feeds) {
      try {
        const refreshedFeed = await this.refreshFeed(feed);
        updatedFeeds.push(refreshedFeed);
      } catch (error) {
        console.error(
          `[RSS dashboard] Error refreshing feed ${feed.title}:`,
          error,
        );
        updatedFeeds.push(feed);
      }
    }

    return updatedFeeds;
  }
}

export class FeedParserService {
  private static instance: FeedParserService;
  private parser: CustomXMLParser;

  private constructor() {
    this.parser = new CustomXMLParser();
  }

  public static getInstance(): FeedParserService {
    if (!FeedParserService.instance) {
      FeedParserService.instance = new FeedParserService();
    }
    return FeedParserService.instance;
  }

  private async fetchFeedXml(url: string): Promise<string> {
    const response = await requestUrl({
      url: url,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
        Accept:
          "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });

    if (!response.text) {
      throw new Error(`Failed to fetch feed: Empty response`);
    }

    return response.text;
  }

  public async parseFeed(url: string, folder: string): Promise<Feed> {
    const xml = await this.fetchFeedXml(url);
    const parsed = this.parser.parseString(xml);

    assertParsedFeedHasEntries(parsed);

    const isPodcast = parsed.items.some(
      (item) =>
        item.enclosure?.type?.startsWith("audio/") ||
        item.itunes?.duration ||
        item.itunes?.explicit,
    );

    const podcastFeedImage =
      parsed.feedItunesImage ||
      parsed.feedImageUrl ||
      (parsed.image && typeof parsed.image === "object"
        ? parsed.image.url
        : "") ||
      (typeof parsed.image === "string" ? parsed.image : "");

    const items: FeedItem[] = parsed.items.map((item: ParsedItem) => ({
      title: item.title || "",
      link: item.link || "",
      description: item.description || "",
      pubDate: item.pubDate || new Date().toISOString(),
      guid: canonicalizeItemIdentityUrl(item.guid || item.link || ""),
      read: false,
      starred: false,
      tags: [],
      feedTitle: parsed.title || "",
      feedUrl: url,
      coverImage: isPodcast
        ? item.itunes?.image?.href || item.image?.url || podcastFeedImage || ""
        : item.itunes?.image?.href || item.image?.url || "",
      mediaContentType: item.mediaContentType,
      mediaType: isPodcast ? "podcast" : "article",
      author: item.author || "",
      content: item.content || "",
      saved: false,

      duration: item.itunes?.duration || "",
      explicit: item.itunes?.explicit === "yes",
      image: item.itunes?.image?.href || item.image?.url || "",
      category: item.itunes?.category || "",
      summary: item.itunes?.summary || "",
      episodeType: item.itunes?.episodeType || "",
      season: item.itunes?.season ? Number(item.itunes.season) : undefined,
      episode: item.itunes?.episode ? Number(item.itunes.episode) : undefined,
      enclosure: item.enclosure
        ? {
            url: item.enclosure.url,
            type: item.enclosure.type,
            length: item.enclosure.length,
          }
        : undefined,
      ieee: item.ieee,
    }));

    const tempFeed: Feed = {
      title: parsed.title || "",
      url: url,
      siteUrl: resolveAbsoluteHttpUrl(parsed.link, url) || undefined,
      items: items,
      folder: folder,
      lastUpdated: Date.now(),
      mediaType: isPodcast ? "podcast" : "article",
      iconUrl:
        parsed.feedItunesImage ||
        parsed.feedImageUrl ||
        (parsed.image && typeof parsed.image === "object"
          ? parsed.image.url
          : "") ||
        (typeof parsed.image === "string" ? parsed.image : ""),
    };

    // Correctly detect and process media types (YouTube, etc.)
    const processedFeed = MediaService.detectAndProcessFeed(tempFeed);

    return processedFeed;
  }
}
