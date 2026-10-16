import { robustFetch } from "../../utils/platform-utils.js";
import {
  feedRequestHeaders,
  pageRequestHeaders,
} from "../../utils/request-headers.js";
import { resolveAbsoluteHttpUrl } from "../../utils/url-utils.js";
import { hostMatches } from "../../utils/url-host.js";
import { isValidFeed } from "./feed-validation.js";
import { decodeHtmlEntities } from "./xml-parser/xml-html-utils.js";
import type { FeedEncoding } from "../../types/types.js";

/**
 * Turn a `href` captured from page markup into an absolute http(s) feed
 * address, or null when it cannot resolve to one. The attribute text is
 * decoded first: browsers decode HTML entities before resolving the address.
 */
function resolveFeedHref(href: string, baseUrl: string): string | null {
  return resolveAbsoluteHttpUrl(decodeHtmlEntities(href), baseUrl);
}

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
    headers: pageRequestHeaders(),
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
            headers: feedRequestHeaders(),
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

/** Most discovered addresses fetched for one page. */
export const MAX_DISCOVERY_CANDIDATES = 5;

function withoutFragment(url: string): string {
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}

/**
 * Keeps a candidate that can be a feed address: http(s), not a fragment-only
 * link, and not the page itself.
 */
function acceptCandidate(
  href: string,
  baseUrl: string,
  candidates: string[],
): void {
  if (href.trim().startsWith("#")) return;
  const feedUrl = resolveFeedHref(href, baseUrl);
  if (!feedUrl) return;
  if (withoutFragment(feedUrl) === withoutFragment(baseUrl)) return;
  if (!candidates.includes(feedUrl)) candidates.push(feedUrl);
}

function collectLinkTagCandidates(
  responseText: string,
  baseUrl: string,
  candidates: string[],
): void {
  const feedLinkMatches = responseText.match(
    /<link[^>]+(?:type="application\/rss\+xml"|type="application\/atom\+xml"|type="application\/rdf\+xml"|type="application\/xml")[^>]+href="([^"]+)"/gi,
  );

  for (const match of feedLinkMatches ?? []) {
    const href = match.match(/href="([^"]+)"/)?.[1];
    if (href) acceptCandidate(href, baseUrl, candidates);
  }
}

function collectAnchorCandidates(
  responseText: string,
  baseUrl: string,
  candidates: string[],
): void {
  const altFeedPatterns = [
    /<a\b[^>]+href="([^"]*feed[^"]*)"[^>]*>/gi,
    /<a\b[^>]+href="([^"]*rss[^"]*)"[^>]*>/gi,
    /<a\b[^>]+href="([^"]*atom[^"]*)"[^>]*>/gi,
    /<a\b[^>]+href="([^"]*rdf[^"]*)"[^>]*>/gi,
    /<a\b[^>]+href="([^"]*xml[^"]*)"[^>]*>/gi,
  ];

  for (const pattern of altFeedPatterns) {
    for (const match of responseText.match(pattern) ?? []) {
      const href = match.match(/href="([^"]+)"/)?.[1];
      if (href) acceptCandidate(href, baseUrl, candidates);
    }
  }
}

/**
 * Feed addresses a page advertises, best first: a FeedBurner probe hit alone,
 * otherwise link tags, then anchors, capped at MAX_DISCOVERY_CANDIDATES. The
 * caller validates each. Empty when nothing is found or the request aborts.
 */
export async function discoverFeedUrls(
  baseUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string[]> {
  if (signal?.aborted) return [];
  try {
    const responseText = await fetchDiscoveryPage(baseUrl, signal);
    if (!responseText) return [];

    const probe = await probeFeedBurnerCandidates(
      baseUrl,
      signal,
      encodingOverride,
    );
    if (probe.status === "found") return [probe.feedUrl];
    if (probe.status === "aborted") return [];

    const candidates: string[] = [];
    collectLinkTagCandidates(responseText, baseUrl, candidates);
    collectAnchorCandidates(responseText, baseUrl, candidates);
    return candidates.slice(0, MAX_DISCOVERY_CANDIDATES);
  } catch {
    // Feed discovery failed, return no candidates
  }
  return [];
}

/**
 * Fetch each candidate in order and return the first body that is a feed, or
 * null when none is. A failed or non-feed candidate moves on to the next.
 */
export async function fetchFirstValidFeed(
  candidates: string[],
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  for (const candidate of candidates) {
    if (signal?.aborted) return null;
    try {
      const text = await robustFetch(candidate, {
        method: "GET",
        headers: feedRequestHeaders(),
        encodingOverride,
      });
      if (text && isValidFeed(text)) return text;
    } catch {
      // Candidate fetch failed; try the next one
    }
  }
  return null;
}
