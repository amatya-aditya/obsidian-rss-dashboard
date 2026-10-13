import { robustFetch } from "../../utils/platform-utils.js";
import { hostMatches } from "../../utils/url-host.js";
import type { FeedEncoding } from "../../types/types.js";

/**
 * What the FeedBurner candidate probe found. "none" lets discovery go on to the
 * page's own markup; "aborted" ends it, as cancelling a refresh must.
 */
type FeedBurnerProbeResult =
  | { status: "found"; feedUrl: string }
  | { status: "none" }
  | { status: "aborted" };

async function fetchDiscoveryPage(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const responseText = await robustFetch(baseUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (signal?.aborted) return null;

  if (!responseText) return null;

  return responseText;
}

async function probeFeedBurnerCandidates(
  baseUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<FeedBurnerProbeResult> {
  if (hostMatches(baseUrl, "feeds.feedburner.com")) {
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
        if (signal?.aborted) return { status: "aborted" };
        try {
          const feedResponseText = await robustFetch(feedUrl, {
            method: "GET",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              Accept:
                "application/feed+json, application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
            },
            encodingOverride,
          });

          if (
            feedResponseText &&
            (feedResponseText.includes("<rss") ||
              feedResponseText.includes("<feed") ||
              feedResponseText.includes("<channel"))
          ) {
            return { status: "found", feedUrl };
          }
        } catch {
          continue;
        }
      }
    }
  }
  return { status: "none" };
}

function findLinkTagFeedUrl(
  responseText: string,
  baseUrl: string,
): string | null {
  const feedLinkMatches = responseText.match(
    /<link[^>]+(?:type="application\/rss\+xml"|type="application\/atom\+xml"|type="application\/rdf\+xml"|type="application\/xml")[^>]+href="([^"]+)"/gi,
  );

  if (feedLinkMatches) {
    for (const match of feedLinkMatches) {
      const hrefMatch = match.match(/href="([^"]+)"/);
      const href = hrefMatch?.[1];
      if (href) {
        let feedUrl = href;

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
  return null;
}

function findAnchorFeedUrl(
  responseText: string,
  baseUrl: string,
): string | null {
  const altFeedPatterns = [
    /<a[^>]+href="([^"]*feed[^"]*)"[^>]*>/gi,
    /<a[^>]+href="([^"]*rss[^"]*)"[^>]*>/gi,
    /<a[^>]+href="([^"]*atom[^"]*)"[^>]*>/gi,
    /<a[^>]+href="([^"]*rdf[^"]*)"[^>]*>/gi,
    /<a[^>]+href="([^"]*xml[^"]*)"[^>]*>/gi,
  ];

  for (const pattern of altFeedPatterns) {
    const matches = responseText.match(pattern);
    if (matches) {
      for (const match of matches) {
        const hrefMatch = match.match(/href="([^"]+)"/);
        const href = hrefMatch?.[1];
        if (href) {
          let feedUrl = href;
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
  return null;
}

export async function discoverFeedUrl(
  baseUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  if (signal?.aborted) return null;
  try {
    const responseText = await fetchDiscoveryPage(baseUrl, signal);
    if (!responseText) return null;

    const probe = await probeFeedBurnerCandidates(
      baseUrl,
      signal,
      encodingOverride,
    );
    if (probe.status === "found") return probe.feedUrl;
    if (probe.status === "aborted") return null;

    const linkTagFeedUrl = findLinkTagFeedUrl(responseText, baseUrl);
    if (linkTagFeedUrl) return linkTagFeedUrl;

    const anchorFeedUrl = findAnchorFeedUrl(responseText, baseUrl);
    if (anchorFeedUrl) return anchorFeedUrl;
  } catch {
    // Feed discovery failed, return null
  }
  return null;
}
