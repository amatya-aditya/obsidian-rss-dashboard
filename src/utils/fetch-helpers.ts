import { Readability } from "@mozilla/readability";
import {
  robustFetch,
  robustFetchDetailed,
  ensureUtf8Meta,
} from "./platform-utils";

/** Markers that indicate the page is a WAF/bot-challenge block rather than real content. */
const BLOCKED_MARKERS = [
  "just a moment", // Cloudflare "Just a moment..." title
  "cf-browser-verification",
  "cf-challenge",
  "ddos-guard",
  "access denied",
  "403 forbidden",
  "enable javascript and cookies",
  "paywall",
  "subscription required",
  "subscribe to continue",
  "401 unauthorized",
];

const RESTRICTED_MARKERS = [
  "401",
  "403",
  "forbidden",
  "access denied",
  "paywall",
  "subscription required",
  "subscribe to continue",
  "unauthorized",
];

export type FullArticleFetchFailureType = "none" | "restricted" | "network";

export interface FullArticleFetchResult {
  content: string;
  failureType: FullArticleFetchFailureType;
}

function isRestrictedStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

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

export function isRestrictedSignal(input: string): boolean {
  if (!input) return false;
  const lower = input.toLowerCase();
  return RESTRICTED_MARKERS.some((marker) => lower.includes(marker));
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

function parseArticleContent(html: string): string {
  const withMeta = ensureUtf8Meta(html);
  const doc = new DOMParser().parseFromString(withMeta, "text/html");
  const article = new Readability(doc).parse();
  return article?.content ?? "";
}

/**
 * Fetches article content with a direct request and optional proxy fallback.
 * Returns a structured result so callers can distinguish restricted pages
 * from generic network/system failures.
 */
export async function fetchWithProxyFallbackDetailed(
  url: string,
  proxyUrl?: string,
): Promise<FullArticleFetchResult> {
  try {
    // 1. Direct fetch
    const directResponse = await robustFetchDetailed(url, {
      headers: DEFAULT_HEADERS,
    });
    const directHtml = directResponse.text;
    const directBlocked =
      isBlockedResponse(directHtml) || isRestrictedStatus(directResponse.status);

    if (!directBlocked) {
      console.debug(
        `[RSS Dashboard] Direct fetch succeeded for ${url} (${directHtml.length} chars).`,
      );
      return { content: parseArticleContent(directHtml), failureType: "none" };
    }

    const directRestricted =
      isRestrictedStatus(directResponse.status) ||
      isRestrictedSignal(directHtml);
    console.warn(
      `[RSS Dashboard] Direct fetch returned blocked/empty response for ${url} (${directHtml?.length ?? 0} chars). Attempting proxy...`,
    );

    // 2. Proxy fallback (silent, logs only)
    if (!proxyUrl || proxyUrl.trim() === "") {
      console.warn(
        "[RSS Dashboard] No CORS proxy configured. Cannot retry blocked fetch.",
      );
      return {
        content: "",
        failureType: directRestricted ? "restricted" : "network",
      };
    }

    const proxyTarget =
      proxyUrl.trim().replace(/\/$/, "") + encodeURIComponent(url);

    const proxyResponse = await robustFetchDetailed(proxyTarget, {
      headers: DEFAULT_HEADERS,
    });
    const proxyHtml = proxyResponse.text;

    if (
      !proxyHtml ||
      isBlockedResponse(proxyHtml) ||
      isRestrictedStatus(proxyResponse.status)
    ) {
      const proxyRestricted =
        isRestrictedStatus(proxyResponse.status) ||
        isRestrictedSignal(proxyHtml || "");
      console.warn(
        `[RSS Dashboard] Proxy fetch also returned blocked/empty response for ${url}.`,
      );
      return {
        content: "",
        failureType:
          directRestricted || proxyRestricted ? "restricted" : "network",
      };
    }

    console.debug(
      `[RSS Dashboard] Proxy fetch succeeded for ${url} (${proxyHtml.length} chars).`,
    );
    return { content: parseArticleContent(proxyHtml), failureType: "none" };
  } catch (e: unknown) {
    const error = e as {
      message?: string;
      status?: number;
      statusCode?: number;
      response?: { status?: number };
    };
    const msg = e instanceof Error ? e.message : String(e);
    const status =
      error?.status ?? error?.statusCode ?? error?.response?.status ?? 0;
    const restricted = isRestrictedStatus(status) || isRestrictedSignal(msg);
    const logMessage = restricted
      ? `[RSS Dashboard] Restricted article fetch blocked (${status || "no-status"}): ${msg}`
      : `[RSS Dashboard] fetchWithProxyFallback error: ${msg}`;

    if (restricted) {
      console.warn(logMessage);
    } else {
      console.error(logMessage);
    }
    return {
      content: "",
      failureType: restricted ? "restricted" : "network",
    };
  }
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
  const result = await fetchWithProxyFallbackDetailed(url, proxyUrl);
  return result.content;
}
