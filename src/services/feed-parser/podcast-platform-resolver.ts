import { requestUrl } from "obsidian";
import {
  detectPodcastPlatform,
  APPLE_PODCASTS,
  POCKET_CASTS,
} from "../../utils/podcast-platforms.js";
import type { ItunesLookupResponse } from "./types.js";
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
