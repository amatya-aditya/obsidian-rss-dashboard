import { Readability } from "@mozilla/readability";
import { Notice } from "obsidian";
import { robustFetch, ensureUtf8Meta } from "./platform-utils";

/** Markers that indicate the page is a WAF/bot-challenge block rather than real content. */
const BLOCKED_MARKERS = [
  "just a moment", // Cloudflare "Just a moment..." title
  "cf-browser-verification",
  "cf-challenge",
  "ddos-guard",
  "access denied",
  "403 forbidden",
  "enable javascript and cookies",
];

/**
 * Returns true when the fetched HTML looks like a WAF/bot-challenge block
 * rather than real article content.
 *
 * Also returns true for very short responses that can't contain a real article.
 */
export function isBlockedResponse(html: string): boolean {
  if (!html || html.trim().length < 200) {
    return true;
  }
  const lower = html.toLowerCase();
  return BLOCKED_MARKERS.some((marker) => lower.includes(marker));
}

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

/**
 * Fetch the HTML at `url`, parse it with Mozilla Readability, and return
 * the extracted article HTML.  Returns `""` on any error.
 */
export async function fetchAndParse(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const html = await robustFetch(url, {
    headers: { ...DEFAULT_HEADERS, ...extraHeaders },
  });
  if (!html) return "";

  const withMeta = ensureUtf8Meta(html);
  const doc = new DOMParser().parseFromString(withMeta, "text/html");
  const article = new Readability(doc).parse();
  return article?.content ?? "";
}

/**
 * Orchestrates the full fetch-with-proxy-fallback flow:
 *
 * 1. Direct fetch → parse with Readability.
 * 2. If the response is blocked and a proxy URL is provided, retry via proxy.
 * 3. Returns "" if both attempts fail.
 */
export async function fetchWithProxyFallback(
  url: string,
  proxyUrl?: string,
): Promise<string> {
  try {
    // 1. Direct fetch
    const directHtml = await robustFetch(url, { headers: DEFAULT_HEADERS });
    const blocked = isBlockedResponse(directHtml);

    if (!blocked) {
      console.debug(
        `[RSS Dashboard] Direct fetch succeeded for ${url} (${directHtml.length} chars).`,
      );
      const withMeta = ensureUtf8Meta(directHtml);
      const doc = new DOMParser().parseFromString(withMeta, "text/html");
      const article = new Readability(doc).parse();
      return article?.content ?? "";
    }

    const logMsg = `[RSS Dashboard] Direct fetch returned blocked/empty response for ${url} (${directHtml?.length ?? 0} chars). Attempting proxy...`;
    console.warn(logMsg);
    new Notice(`Fetch blocked (${directHtml?.length ?? 0} chars). Retrying via proxy...`, 5000);

    // 2. Proxy fallback
    if (!proxyUrl || proxyUrl.trim() === "") {
      const msg = "[RSS Dashboard] No CORS proxy configured. Cannot retry blocked fetch.";
      console.warn(msg);
      new Notice("Error: No CORS proxy configured in settings.", 5000);
      return "";
    }

    const proxyTarget = proxyUrl.trim().replace(/\/$/, "") + encodeURIComponent(url);
    new Notice(`Calling proxy: ${proxyTarget.substring(0, 50)}...`, 3000);

    const proxyHtml = await robustFetch(proxyTarget, {
      headers: DEFAULT_HEADERS,
    });

    if (!proxyHtml || isBlockedResponse(proxyHtml)) {
      const msg = `[RSS Dashboard] Proxy fetch also returned blocked/empty response for ${url}.`;
      console.warn(msg);
      new Notice(`Proxy fetch failed or was also blocked (${proxyHtml?.length ?? 0} chars).`, 5000);
      return "";
    }

    console.debug(
      `[RSS Dashboard] Proxy fetch succeeded for ${url} (${proxyHtml.length} chars).`,
    );
    new Notice(`Proxy fetch succeeded! (${proxyHtml.length} chars)`, 3000);

    const withMeta = ensureUtf8Meta(proxyHtml);
    const doc = new DOMParser().parseFromString(withMeta, "text/html");
    const article = new Readability(doc).parse();
    return article?.content ?? "";
  } catch (e: any) {
    const errorMsg = `[RSS Dashboard] fetchWithProxyFallback error: ${e.message || e}`;

    console.error(errorMsg);
    new Notice(`Network Error: ${e.message || "Unknown error"}`, 5000);
    return "";
  }
}

