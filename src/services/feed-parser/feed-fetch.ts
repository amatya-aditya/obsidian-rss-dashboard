import { requestUrl, Platform } from "obsidian";
import { isValidFeed } from "./feed-validation.js";
import type {
  AllOriginsResponse,
  Rss2JsonFeedItem,
  Rss2JsonResponse,
} from "./types.js";
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

export async function fetchFeedXml(url: string, useCorsProxies: boolean = true): Promise<string> {
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
      if (!useCorsProxies) throw error;
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
    if (!useCorsProxies) throw error;
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
