import { requestUrl } from "obsidian";
import {
  detectPodcastPlatform,
  APPLE_PODCASTS,
  POCKET_CASTS,
  POCKET_CASTS_SHORT,
} from "../../utils/podcast-platforms.js";
import type { ItunesLookupResponse } from "./types.js";
import { decodeHtmlEntities } from "./xml-parser/xml-html-utils.js";
import { resolveProxyPrefixes } from "../../utils/proxy-utils.js";
export interface ResolvePodcastPlatformOptions {
  /**
   * Whether Pocket Casts may fall back to scraping the page through
   * third-party CORS proxies. Defaults to true; the Add/Edit feed flow passes
   * the user's CORS proxy opt-in so no URL leaves the app without consent.
   */
  allowProxyFallback?: boolean;
}

export async function resolvePodcastPlatformUrl(
  url: string,
  corsProxyUrl?: string,
  options: ResolvePodcastPlatformOptions = {},
): Promise<string | null> {
  const platform = detectPodcastPlatform(url);
  if (!platform) return null;

  if (platform.id === APPLE_PODCASTS.id) {
    return resolveApplePodcastUrl(url);
  }

  if (platform.id === POCKET_CASTS.id) {
    return resolvePocketCastsUrl(
      url,
      corsProxyUrl,
      options.allowProxyFallback ?? true,
    );
  }

  if (platform.id === POCKET_CASTS_SHORT.id) {
    return resolvePocketCastsShortUrl(url);
  }

  return null;
}

/**
 * Extracts the human-readable slug from a pocketcasts.com podcast URL.
 *
 * For `https://pocketcasts.com/podcast/darknet-diaries/<uuid>` the slug is
 * `darknet-diaries`. Returns `null` when the URL does not match the expected
 * pattern.
 */
function extractPocketCastsSlug(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    // pathname: /podcast/<slug>/<uuid>
    const parts = pathname.split("/").filter(Boolean);
    // parts[0] = "podcast", parts[1] = slug, parts[2] = uuid
    if (parts[0] === "podcast" && parts[1] && parts.length >= 3) {
      return parts[1];
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * True when an iTunes show name plausibly belongs to a Pocket Casts slug.
 *
 * iTunes always returns its best guess, so an opaque short code would
 * otherwise resolve to an unrelated show. Accept the hit only when the slug
 * and name contain each other once reduced to letters and digits.
 */
function slugMatchesName(slug: string, name: string): boolean {
  const squash = (text: string): string =>
    text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const slugSquashed = squash(slug);
  const nameSquashed = squash(name);
  if (!slugSquashed || !nameSquashed) return false;
  return (
    nameSquashed.includes(slugSquashed) || slugSquashed.includes(nameSquashed)
  );
}

/**
 * Searches the iTunes Search API by podcast slug and returns the first feedUrl
 * found, or `null` when no results are returned.
 *
 * The slug (e.g. `darknet-diaries`) is used as the search term. Hyphens are
 * replaced with spaces so iTunes gets a more natural query.
 */
async function searchItunesBySlug(slug: string): Promise<string | null> {
  // Convert hyphenated slug to space-separated terms for a better iTunes match
  const term = slug.replace(/-/g, " ");
  const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=podcast&limit=3`;
  const response = await requestUrl({ url: searchUrl, method: "GET" });
  const data = JSON.parse(response.text) as {
    results?: Array<{ feedUrl?: string; collectionName?: string }>;
  };
  const match = data.results?.find(
    (result) =>
      result.feedUrl && slugMatchesName(slug, result.collectionName ?? ""),
  );
  if (match?.feedUrl) {
    console.debug(
      `[RSS Dashboard] Resolved Pocket Casts slug "${slug}" via iTunes: ${match.feedUrl} (matched "${match.collectionName ?? ""}")`,
    );
    return match.feedUrl;
  }
  return null;
}

/**
 * Resolves a `pca.st/<slug>` short link to an RSS feed URL.
 *
 * Strategy: use the slug directly as the iTunes search term, bypassing the
 * need to fetch the Pocket Casts web page (which blocks automated requests).
 */
async function resolvePocketCastsShortUrl(url: string): Promise<string | null> {
  const slug = POCKET_CASTS_SHORT.extractId(url);
  if (!slug) {
    throw new Error(
      `Could not extract slug from Pocket Casts short link: ${url}`,
    );
  }

  console.debug(
    `[RSS Dashboard] Resolving Pocket Casts short link via iTunes search: slug="${slug}"`,
  );

  const feedUrl = await searchItunesBySlug(slug);
  if (feedUrl) return feedUrl;

  throw new Error(
    `Could not find an RSS feed for Pocket Casts short link "${url}". ` +
      `iTunes search returned no results for slug "${slug}".`,
  );
}

async function resolvePocketCastsViaTitleSearch(
  contents: string,
): Promise<string | null> {
  // Flexible regex: Handles attributes in any order (e.g., meta data-rh="true" property="og:title" content="...")
  let titleMatch =
    contents.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    ) ||
    contents.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    ) ||
    contents.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
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
    const decodedTitle = decodeHtmlEntities(rawTitle);
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
        const firstResult = itunesData.results?.[0];
        if (firstResult?.feedUrl) {
          const feedUrl = firstResult.feedUrl;
          console.debug(
            `[RSS Dashboard] Successfully resolved Pocket Casts URL via iTunes API: ${feedUrl} (matched "${firstResult.collectionName ?? ""}")`,
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
  return null;
}
async function resolvePocketCastsUrl(
  url: string,
  corsProxyUrl: string | undefined,
  allowProxyFallback: boolean,
): Promise<string | null> {
  // STRATEGY 1: Slug-first iTunes search.
  // The pocketcasts.com URL path contains a human-readable slug
  // (e.g. "darknet-diaries") that is usually searchable via the iTunes API.
  // This avoids fetching the Pocket Casts web page, which blocks automated
  // requests with a 403.
  const slug = extractPocketCastsSlug(url);
  if (slug) {
    try {
      const feedUrl = await searchItunesBySlug(slug);
      if (feedUrl) return feedUrl;
      console.debug(
        `[RSS Dashboard] iTunes slug search returned no results for "${slug}", falling back to proxy scraping`,
      );
    } catch (slugErr) {
      console.debug(
        `[RSS Dashboard] iTunes slug search failed for "${slug}":`,
        slugErr,
      );
    }
  }

  if (!allowProxyFallback) {
    throw new Error(
      "Could not find this Pocket Casts show through iTunes search. Enable the CORS Proxy in Settings to try resolving it from the Pocket Casts page, or use another feed source.",
    );
  }

  const proxyUrls: string[] = [];

  // 1. User's proxy if available ("auto" expands to the built-in list)
  if (corsProxyUrl) {
    for (const prefix of resolveProxyPrefixes(corsProxyUrl, {
      rawBodyOnly: true,
    })) {
      const isEncoded =
        prefix.includes("allorigins") || prefix.includes("codetabs");
      const targetUrl = isEncoded ? encodeURIComponent(url) : url;
      proxyUrls.push(`${prefix}${targetUrl}`);
    }
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

  for (const proxyUrl of new Set(proxyUrls)) {
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
      const feedUrl = await resolvePocketCastsViaTitleSearch(contents);
      if (feedUrl) return feedUrl;

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
