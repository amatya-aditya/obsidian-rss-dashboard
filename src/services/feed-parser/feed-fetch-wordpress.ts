import { robustFetch } from "../../utils/platform-utils.js";
import { feedRequestHeaders } from "../../utils/request-headers.js";
import { hostMatches } from "../../utils/url-host.js";
import type { FeedEncoding } from "../../types/types.js";
import { discoverFeedUrls, fetchFirstValidFeed } from "./feed-discovery.js";
import { isValidFeed } from "./feed-validation.js";
import { throwIfAborted } from "../feed-timeout.js";

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
    `${baseUrl}/index.rss`,
    `${baseUrl}/index.xml`,

    `${baseUrl}/index.php?feed=rss2`,
    `${baseUrl}/index.php?feed=rss`,
    `${baseUrl}/index.php?feed=atom`,
  ];

  for (const altUrl of alternativeUrls) {
    throwIfAborted(signal);
    try {
      const altResponseText = await robustFetch(altUrl, {
        method: "GET",
        headers: feedRequestHeaders(),
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

  throwIfAborted(signal);
  return null;
}

async function fetchDiscoveredFeed(
  baseUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  const candidates = await discoverFeedUrls(baseUrl, signal, encodingOverride);
  if (candidates.length === 0 && hostMatches(baseUrl, "arxiv.org")) {
    candidates.push(baseUrl.replace("export.arxiv.org", "rss.arxiv.org"));
  }
  if (candidates.length === 0) return null;
  throwIfAborted(signal);
  return fetchFirstValidFeed(candidates, signal, encodingOverride);
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

  throwIfAborted(signal);

  throw new Error(
    "All alternative feed URLs failed, received PHP file instead of RSS feed",
  );
}
