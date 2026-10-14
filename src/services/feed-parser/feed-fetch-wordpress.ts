import { robustFetch } from "../../utils/platform-utils.js";
import { hostMatches } from "../../utils/url-host.js";
import type { FeedEncoding } from "../../types/types.js";
import { discoverFeedUrl } from "./feed-discovery.js";
import { isValidFeed } from "./feed-validation.js";

async function fetchAlternativeUrls(
  baseUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
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
    if (signal?.aborted) throw new Error("Timed out");
    try {
      const altResponseText = await robustFetch(altUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
          Accept:
            "application/feed+json, application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        encodingOverride,
      });

      if (altResponseText && isValidFeed(altResponseText)) {
        return altResponseText;
      } else {
        throw new Error("Not a valid RSS/Atom feed");
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchDiscoveredFeed(
  baseUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  const discoveredUrl =
    (await discoverFeedUrl(baseUrl, signal, encodingOverride)) ||
    (hostMatches(baseUrl, "arxiv.org")
      ? baseUrl.replace("export.arxiv.org", "rss.arxiv.org")
      : null);
  if (discoveredUrl) {
    if (signal?.aborted) throw new Error("Timed out");
    try {
      const discoveredResponseText = await robustFetch(discoveredUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
          Accept:
            "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        encodingOverride,
      });

      if (discoveredResponseText && isValidFeed(discoveredResponseText)) {
        return discoveredResponseText;
      } else {
        throw new Error("Not a valid RSS/Atom feed");
      }
    } catch {
      // Discovered url fetch failed, continue
    }
  }

  return null;
}

/**
 * The WordPress/PHP fallback of the direct fetch: the page came back as PHP
 * source or a WordPress page, so try the usual feed addresses, then whatever
 * discovery finds, and throw when none of them is a feed.
 */
export async function fetchWordPressFallback(
  secureUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string> {
  // [RSS Dashboard] Received php file instead of RSS feed, trying alternative URLs...

  const baseUrl = secureUrl.replace(/\/feed\/?$/, "");

  const alternativeText = await fetchAlternativeUrls(
    baseUrl,
    signal,
    encodingOverride,
  );
  if (alternativeText !== null) return alternativeText;

  const discoveredText = await fetchDiscoveredFeed(
    baseUrl,
    signal,
    encodingOverride,
  );
  if (discoveredText !== null) return discoveredText;

  throw new Error(
    "All alternative feed URLs failed, received PHP file instead of RSS feed",
  );
}
