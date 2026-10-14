import { robustFetch } from "../../utils/platform-utils.js";
import { hostMatches } from "../../utils/url-host.js";
import { resolveAbsoluteHttpUrl } from "../../utils/url-utils.js";
import type { FeedEncoding } from "../../types/types.js";
import { isValidFeed } from "./feed-validation.js";
import { fetchThroughPublicProxies } from "./feed-fetch-proxies.js";
import { fetchWordPressFallback } from "./feed-fetch-wordpress.js";

async function probeFeedBurner(
  targetUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  if (hostMatches(targetUrl, "feeds.feedburner.com")) {
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
        if (signal?.aborted) throw new Error("Timed out");
        try {
          const fbResponseText = await robustFetch(fbUrl, {
            method: "GET",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept:
                "application/feed+json, application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8",
            },
            encodingOverride,
          });
          if (fbResponseText && isValidFeed(fbResponseText)) {
            return fbResponseText;
          } else {
            throw new Error("Not a valid RSS/Atom feed");
          }
        } catch {
          continue;
        }
      }
    }
  }

  return null;
}

async function followArxivStub(
  responseText: string,
  targetUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  // Handle arXiv stub feeds that point to rss.arxiv.org but contain no items
  const hasItems = /<item\b[\s\S]*?<\/item>/i.test(responseText);
  if (!hasItems) {
    const atomLinkMatch = responseText.match(
      /<atom:link[^>]*href=["']([^"']+)["'][^>]*>/i,
    );
    const channelLinkMatch = responseText.match(
      /<channel[^>]*>[\s\S]*?<link[^>]*>([^<]+)<\/link>/i,
    );
    const candidateUrl = resolveAbsoluteHttpUrl(
      atomLinkMatch?.[1] || channelLinkMatch?.[1],
      targetUrl,
    );
    if (candidateUrl && hostMatches(candidateUrl, "arxiv.org")) {
      if (signal?.aborted) throw new Error("Timed out");
      try {
        const arxivText = await robustFetch(candidateUrl, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
            Accept:
              "application/feed+json, application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          },
          encodingOverride,
        });
        if (arxivText && isValidFeed(arxivText)) {
          return arxivText;
        }
      } catch {
        // ArXiv feed fetch failed, continue
      }
    }
  }

  return null;
}

async function fetchToggledScheme(
  targetUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  // If initial scheme fails, try toggled scheme (http<->https) before other fallbacks
  const toggledUrl = targetUrl.startsWith("http://")
    ? targetUrl.replace(/^http:\/\//i, "https://")
    : targetUrl.startsWith("https://")
      ? targetUrl.replace(/^https:\/\//i, "http://")
      : "";
  if (toggledUrl) {
    if (signal?.aborted) throw new Error("Timed out");
    try {
      const toggledText = await robustFetch(toggledUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
          Accept:
            "application/feed+json, application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        encodingOverride,
      });
      if (toggledText && isValidFeed(toggledText)) {
        return toggledText;
      }
    } catch {
      // Toggled url fetch failed, continue
    }
  }

  return null;
}

async function fetchDirectFeed(
  targetUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string> {
  const secureUrl = targetUrl; // try original URL as-is first (don't force https)
  const responseText = await robustFetch(secureUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
      Accept:
        "application/feed+json, application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    encodingOverride,
  });

  if (!responseText) {
    throw new Error("Empty response from feed");
  }

  if (isValidFeed(responseText)) {
    const arxivText = await followArxivStub(
      responseText,
      targetUrl,
      signal,
      encodingOverride,
    );
    if (arxivText !== null) return arxivText;
    return responseText;
  }

  const toggledText = await fetchToggledScheme(
    targetUrl,
    signal,
    encodingOverride,
  );
  if (toggledText !== null) return toggledText;

  if (
    responseText.includes("<?php") ||
    responseText.includes("WordPress") ||
    responseText.includes("wp-blog-header.php")
  ) {
    return await fetchWordPressFallback(secureUrl, signal, encodingOverride);
  }

  throw new Error("Not a valid RSS/Atom feed");
}

/**
 * One fetch of a feed address: the FeedBurner probe, the direct request and its
 * fallbacks, and, when `useCorsProxies` is set, the public proxy chain after a
 * failed direct request. Throws when nothing yields a feed.
 */
export async function tryFetch(
  targetUrl: string,
  useCorsProxies: boolean,
  signal: AbortSignal | undefined,
  encodingOverride: FeedEncoding | undefined,
  isAndroid: boolean,
): Promise<string> {
  if (signal?.aborted) throw new Error("Timed out");

  const feedBurnerText = await probeFeedBurner(
    targetUrl,
    signal,
    encodingOverride,
  );
  if (feedBurnerText !== null) return feedBurnerText;
  if (signal?.aborted) throw new Error("Timed out");
  try {
    return await fetchDirectFeed(targetUrl, signal, encodingOverride);
  } catch (error) {
    void error;
    if (!useCorsProxies) throw error;
    return await fetchThroughPublicProxies(
      targetUrl,
      signal,
      encodingOverride,
      isAndroid,
    );
  }
}
