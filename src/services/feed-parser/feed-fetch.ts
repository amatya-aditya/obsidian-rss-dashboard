import { requestUrl, Platform } from "obsidian";
import { PREDEFINED_PROXIES } from "../../utils/proxy-utils.js";
import { robustFetch } from "../../utils/platform-utils.js";
import type { FeedEncoding } from "../../types/types.js";
import { isValidFeed } from "./feed-validation.js";
import type {
  AllOriginsResponse,
  Rss2JsonFeedItem,
  Rss2JsonResponse,
} from "./types.js";

export type FeedFetchProxyConfig = {
  enabled: boolean;
  url: string;
};

export type FeedFetchProxyOption = boolean | FeedFetchProxyConfig;

function normalizeProxyConfig(
  proxyConfig: FeedFetchProxyOption,
): FeedFetchProxyConfig {
  if (typeof proxyConfig === "boolean") {
    return { enabled: proxyConfig, url: "" };
  }
  return proxyConfig;
}

function getProxyUrls(proxyConfig: FeedFetchProxyConfig): string[] {
  if (proxyConfig.url === "auto") {
    return PREDEFINED_PROXIES.map((proxy) => proxy.url);
  }
  return [proxyConfig.url];
}

function rss2JsonToRss(data: Rss2JsonResponse): string {
  if (!data.feed) {
    throw new Error(
      "RSS2JSON returned error: " + (data.message || "Unknown error"),
    );
  }

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
}

async function fetchThroughProxy(
  targetUrl: string,
  proxyUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string> {
  if (signal?.aborted) throw new Error("Timed out");
  const requestUrlParam = `${proxyUrl}${encodeURIComponent(targetUrl)}`;
  const isJsonEnvelope =
    proxyUrl.includes("allorigins.win/get") || proxyUrl.includes("rss2json");
  const responseText = await robustFetch(requestUrlParam, {
    method: "GET",
    encodingOverride: isJsonEnvelope ? undefined : encodingOverride,
  });

  if (signal?.aborted) throw new Error("Timed out");

  if (proxyUrl.includes("allorigins.win/get")) {
    const data = JSON.parse(responseText) as AllOriginsResponse;
    if (!data.contents) throw new Error("No contents from AllOrigins");
    return data.contents;
  }

  if (proxyUrl.includes("rss2json")) {
    const data = JSON.parse(responseText) as Rss2JsonResponse;
    if (data.status !== "ok" || !data.feed) {
      throw new Error(
        "RSS2JSON returned error: " + (data.message || "Unknown error"),
      );
    }
    return rss2JsonToRss(data);
  }

  if (!responseText) {
    throw new Error("Empty response from proxy");
  }

  return responseText;
}

async function discoverFeedUrl(
  baseUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  if (signal?.aborted) return null;
  try {
    const responseText = await robustFetch(baseUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (signal?.aborted) return null;

    if (!responseText) return null;

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
          if (signal?.aborted) return null;
          try {
            const feedResponseText = await robustFetch(feedUrl, {
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                Accept:
                  "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
              },
              encodingOverride,
            });

            if (
              feedResponseText &&
              (feedResponseText.includes("<rss") ||
                feedResponseText.includes("<feed") ||
                feedResponseText.includes("<channel"))
            ) {
              return feedUrl;
            }
          } catch {
            continue;
          }
        }
      }
    }

    const feedLinkMatches = responseText.match(
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
      const matches = responseText.match(pattern);
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

export async function fetchFeedXml(
  url: string,
  proxyConfig: FeedFetchProxyOption = true,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string> {
  const isAndroid = Platform.isAndroidApp;
  const config = normalizeProxyConfig(proxyConfig);
  const useCorsProxies = typeof proxyConfig === "boolean" ? proxyConfig : true;

  if (!config.enabled) {
    return tryFetch(url, false, signal);
  }

  if (typeof proxyConfig === "object") {
    try {
      return await tryFetch(url, false, signal);
    } catch (error) {
      if (isAndroid) {
        throw error;
      }

      for (const proxyUrl of getProxyUrls(config)) {
        if (signal?.aborted) throw new Error("Timed out");
        try {
          const proxyText = await fetchThroughProxy(
            url,
            proxyUrl,
            signal,
            encodingOverride,
          );
          if (isValidFeed(proxyText)) {
            return proxyText;
          }
          throw new Error("Not a valid RSS/Atom feed");
        } catch (proxyError) {
          void proxyError;
        }
      }

      throw error;
    }
  }

  async function tryFetch(
    targetUrl: string,
    useCorsProxies: boolean,
    signal?: AbortSignal,
  ): Promise<string> {
    if (signal?.aborted) throw new Error("Timed out");

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
          if (signal?.aborted) throw new Error("Timed out");
          try {
            const fbResponseText = await robustFetch(fbUrl, {
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept:
                  "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8",
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
    if (signal?.aborted) throw new Error("Timed out");
    try {
      const secureUrl = targetUrl; // try original URL as-is first (don't force https)
      const responseText = await robustFetch(secureUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
          Accept:
            "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        encodingOverride,
      });

      if (!responseText) {
        throw new Error("Empty response from feed");
      }

      if (isValidFeed(responseText)) {
        // Handle arXiv stub feeds that point to rss.arxiv.org but contain no items
        const hasItems = /<item\b[\s\S]*?<\/item>/i.test(responseText);
        if (!hasItems) {
          const atomLinkMatch = responseText.match(
            /<atom:link[^>]*href=["']([^"']+)["'][^>]*>/i,
          );
          const channelLinkMatch = responseText.match(
            /<channel[^>]*>[\s\S]*?<link[^>]*>([^<]+)<\/link>/i,
          );
          const candidateUrl =
            atomLinkMatch?.[1] || channelLinkMatch?.[1] || "";
          if (candidateUrl && /arxiv\.org\//i.test(candidateUrl)) {
            if (signal?.aborted) throw new Error("Timed out");
            try {
              const arxivText = await robustFetch(candidateUrl, {
                method: "GET",
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                  Accept:
                    "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
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
        return responseText;
      }

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
                "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
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

      if (
        responseText.includes("<?php") ||
        responseText.includes("WordPress") ||
        responseText.includes("wp-blog-header.php")
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
          if (signal?.aborted) throw new Error("Timed out");
          try {
            const altResponseText = await robustFetch(altUrl, {
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                Accept:
                  "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
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

        const discoveredUrl =
          (await discoverFeedUrl(baseUrl, signal, encodingOverride)) ||
          (baseUrl.includes("arxiv.org")
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

            if (
              discoveredResponseText &&
              isValidFeed(discoveredResponseText)
            ) {
              return discoveredResponseText;
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
      if (!useCorsProxies) throw error;
      // [RSS Dashboard] direct fetch failed for ${targetUrl}, trying AllOrigins proxy...

      if (signal?.aborted) throw new Error("Timed out");
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
        if (signal?.aborted) throw new Error("Timed out");
        try {
          const rawUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
          const rawText = await robustFetch(rawUrl, {
            method: "GET",
            encodingOverride,
          });
          if (rawText && isValidFeed(rawText)) {
            return rawText;
          } else {
            throw new Error("AllOrigins raw returned non-feed");
          }
        } catch {
          // Toggled url fetch failed, continue
        }

        if (!isAndroid) {
          if (signal?.aborted) throw new Error("Timed out");
          try {
            const codetabsUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(targetUrl)}`;
            const codetabsText = await robustFetch(codetabsUrl, {
              method: "GET",
              encodingOverride,
            });
            if (codetabsText && isValidFeed(codetabsText)) {
              return codetabsText;
            } else {
              throw new Error("Not a valid RSS/Atom feed");
            }
          } catch (e) {
            void e;
            // [RSS dashboard] codetabs proxy failed (expected - falls through to next proxy)
          }

          // isomorphic-git CORS proxy (raw)
          if (signal?.aborted) throw new Error("Timed out");
          try {
            const isoUrl = `https://cors.isomorphic-git.org/${targetUrl}`;
            const isoText = await robustFetch(isoUrl, {
              method: "GET",
              encodingOverride,
            });
            if (isoText && isValidFeed(isoText)) {
              return isoText;
            } else {
              throw new Error("Not a valid RSS/Atom feed");
            }
          } catch (e) {
            void e;
            // [RSS dashboard] isomorphic-git proxy failed (expected - falls through to next proxy)
          }

          if (signal?.aborted) throw new Error("Timed out");
          try {
            const thingproxyUrl = `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(targetUrl)}`;
            const thingproxyText = await robustFetch(thingproxyUrl, {
              method: "GET",
              encodingOverride,
            });
            if (
              thingproxyText &&
              isValidFeed(thingproxyText)
            ) {
              return thingproxyText;
            } else {
              throw new Error("Not a valid RSS/Atom feed");
            }
          } catch (e) {
            void e;
            // [RSS dashboard] thingproxy failed (expected - falls through to next proxy)
          }

          if (signal?.aborted) throw new Error("Timed out");
          try {
            const discoveredUrl = await discoverFeedUrl(
              targetUrl,
              signal,
              encodingOverride,
            );
            if (discoveredUrl && discoveredUrl !== targetUrl) {
              const discoveredResponseText = await robustFetch(discoveredUrl, {
                method: "GET",
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                  Accept:
                    "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8",
                },
                encodingOverride,
              });
              if (
                discoveredResponseText &&
                isValidFeed(discoveredResponseText)
              ) {
                return discoveredResponseText;
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
    return await tryFetch(url, useCorsProxies, signal);
  } catch (error) {
    if (!useCorsProxies) throw error;
    if (isAndroid) {
      throw error;
    }

    if (signal?.aborted) throw new Error("Timed out");
    try {
      const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`;
      const proxyResponseText = await robustFetch(proxyUrl, {
        method: "GET",
        headers: {
          Accept:
            "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        encodingOverride,
      });

      if (proxyResponseText && isValidFeed(proxyResponseText)) {
        return proxyResponseText;
      } else {
        throw new Error("First proxy blocked by Cloudflare");
      }
    } catch {
      if (signal?.aborted) throw new Error("Timed out");
      try {
        const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
        const proxyResponse = await requestUrl({
          url: rss2jsonUrl,
          method: "GET",
        });
        const data = JSON.parse(proxyResponse.text) as Rss2JsonResponse;

        if (data.status === "ok" && data.feed) {
          return rss2JsonToRss(data);
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
