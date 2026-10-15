import { requestUrl } from "obsidian";
import { robustFetch } from "../../utils/platform-utils.js";
import { escapeCdata, escapeXml } from "../../utils/xml-escape.js";
import type { FeedEncoding } from "../../types/types.js";
import { discoverFeedUrl } from "./feed-discovery.js";
import { isValidFeed } from "./feed-validation.js";
import type {
  AllOriginsResponse,
  Rss2JsonFeedItem,
  Rss2JsonResponse,
} from "./types.js";

function rss2JsonToRss(data: Rss2JsonResponse): string {
  if (!data.feed) {
    throw new Error(
      "RSS2JSON returned error: " + (data.message || "Unknown error"),
    );
  }

  const feed = data.feed;
  const items = data.items || [];

  // Every value below originates from a third-party feed relayed by the proxy,
  // so it is escaped before interpolation. Unescaped markup would otherwise let
  // a feed publisher close an element early and inject elements of their own.
  const channelTitle = escapeXml(feed.title || "Unknown feed");
  const channelLink = escapeXml(feed.link || "");

  let rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n    <title>${channelTitle}</title>\n    <description>${escapeXml(feed.description || "")}</description>\n    <link>${channelLink}</link>`;

  if (feed.language) {
    rss += `\n    <language>${escapeXml(feed.language)}</language>`;
  }

  if (feed.image) {
    rss += `\n    <image>\n        <url>${escapeXml(feed.image)}</url>\n        <title>${channelTitle}</title>\n        <link>${channelLink}</link>\n    </image>`;
  }

  items.forEach((item: Rss2JsonFeedItem, index: number) => {
    const itemLink = escapeXml(item.link || "");
    const itemGuid = escapeXml(item.guid || item.link || `item-${index}`);
    rss += `\n    <item>\n        <title>${escapeXml(item.title || "")}</title>\n        <link>${itemLink}</link>\n        <description><![CDATA[${escapeCdata(item.description || "")}]]></description>`;

    if (item.pubDate) {
      rss += `\n        <pubDate>${escapeXml(item.pubDate)}</pubDate>`;
    }

    rss += `\n        <guid>${itemGuid}</guid>\n    </item>`;
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
    headers: {
      Accept:
        "application/feed+json, application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
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

/**
 * The proxies the user configured, tried in order. Returns the first feed one
 * of them serves, or `null` when none does.
 */
export async function fetchThroughConfiguredProxies(
  url: string,
  proxyUrls: string[],
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  for (const proxyUrl of proxyUrls) {
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

  if (signal?.aborted) throw new Error("Timed out");
  return null;
}

/**
 * The codetabs and rss2json tail, tried once the direct attempt and the public
 * proxy chain have both failed. Returns a feed, or `null` when neither serves
 * one.
 */
export async function fetchThroughFallbackProxies(
  url: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  if (signal?.aborted) throw new Error("Timed out");
  try {
    const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`;
    const proxyResponseText = await robustFetch(proxyUrl, {
      method: "GET",
      headers: {
        Accept:
          "application/feed+json, application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
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
      if (signal?.aborted) throw new Error("Timed out");
      return null;
    }
  }
}

async function fetchAllOriginsGet(targetUrl: string): Promise<string | null> {
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
    return null;
  }
}

async function fetchAllOriginsRaw(
  targetUrl: string,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
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

  return null;
}

async function fetchCodetabs(
  targetUrl: string,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
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

  return null;
}

async function fetchIsomorphicGit(
  targetUrl: string,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
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

  return null;
}

async function fetchThingProxy(
  targetUrl: string,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  try {
    const thingproxyUrl = `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(targetUrl)}`;
    const thingproxyText = await robustFetch(thingproxyUrl, {
      method: "GET",
      encodingOverride,
    });
    if (thingproxyText && isValidFeed(thingproxyText)) {
      return thingproxyText;
    } else {
      throw new Error("Not a valid RSS/Atom feed");
    }
  } catch (e) {
    void e;
    // [RSS dashboard] thingproxy failed (expected - falls through to next proxy)
  }

  return null;
}

async function fetchDiscoveredViaProxy(
  targetUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
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
            "application/feed+json, application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8",
        },
        encodingOverride,
      });
      if (discoveredResponseText && isValidFeed(discoveredResponseText)) {
        return discoveredResponseText;
      } else {
        throw new Error("Not a valid RSS/Atom feed");
      }
    }
  } catch (e) {
    void e;
    // [RSS dashboard] discoverFeedUrl proxy fetch failed (expected - falls through to next proxy)
  }

  return null;
}

async function fetchThroughDesktopProxies(
  targetUrl: string,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string | null> {
  if (signal?.aborted) throw new Error("Timed out");
  const codetabsText = await fetchCodetabs(targetUrl, encodingOverride);
  if (codetabsText !== null) return codetabsText;

  // isomorphic-git CORS proxy (raw)
  if (signal?.aborted) throw new Error("Timed out");
  const isoText = await fetchIsomorphicGit(targetUrl, encodingOverride);
  if (isoText !== null) return isoText;

  if (signal?.aborted) throw new Error("Timed out");
  const thingproxyText = await fetchThingProxy(targetUrl, encodingOverride);
  if (thingproxyText !== null) return thingproxyText;

  if (signal?.aborted) throw new Error("Timed out");
  return await fetchDiscoveredViaProxy(targetUrl, signal, encodingOverride);
}

/**
 * The public proxy chain, tried when the direct attempt failed: AllOrigins get
 * and raw, then (off Android) codetabs, isomorphic-git, thingproxy and
 * discovery. Returns the first feed one of them serves; throws when none does.
 */
export async function fetchThroughPublicProxies(
  targetUrl: string,
  signal: AbortSignal | undefined,
  encodingOverride: FeedEncoding | undefined,
  isAndroid: boolean,
): Promise<string> {
  // [RSS Dashboard] direct fetch failed for ${targetUrl}, trying AllOrigins proxy...

  if (signal?.aborted) throw new Error("Timed out");
  const allOriginsText = await fetchAllOriginsGet(targetUrl);
  if (allOriginsText !== null) return allOriginsText;

  // Try allOrigins raw endpoint
  if (signal?.aborted) throw new Error("Timed out");
  const rawText = await fetchAllOriginsRaw(targetUrl, encodingOverride);
  if (rawText !== null) return rawText;
  if (signal?.aborted) throw new Error("Timed out");

  if (!isAndroid) {
    const desktopText = await fetchThroughDesktopProxies(
      targetUrl,
      signal,
      encodingOverride,
    );
    if (desktopText !== null) return desktopText;
  }
  throw new Error(`Could not fetch a valid RSS/Atom feed from ${targetUrl}`);
}
