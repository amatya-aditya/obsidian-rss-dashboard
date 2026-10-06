import { Readability } from "@mozilla/readability";
import {
  extractPageMetadata,
  isEmptyRawMetadata,
  type RawArticleMetadata,
} from "./article-metadata";
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
  /**
   * Raw signals from the fetched page (#247). Unresolved: callers resolve it
   * against their own feed context. Absent when no page was fetched or the
   * page carried no signal.
   */
  pageMetadata?: RawArticleMetadata;
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

function parseArticleContent(html: string): {
  content: string;
  pageMetadata: RawArticleMetadata;
} {
  const withMeta = ensureUtf8Meta(html);
  const doc = new DOMParser().parseFromString(withMeta, "text/html");
  // Readability.parse() mutates the document (it drops scripts, so JSON-LD
  // would be gone), so the page's metadata is read first.
  const pageMetadata = extractPageMetadata(doc);
  const article = new Readability(doc).parse();
  pageMetadata.readabilityExcerpt = (article?.excerpt ?? "").trim();
  return { content: article?.content ?? "", pageMetadata };
}

/**
 * Reads the head metadata of a response that is not parsed for content
 * (blocked, restricted or paywalled). A paywalled page often has a real
 * `<head>`; a bot-challenge page's comes back empty on its own. The existing
 * `< 200` character guard is the only skip condition.
 */
function extractMetadataOfUnparsedResponse(
  html: string | undefined,
): RawArticleMetadata | undefined {
  if (!html || html.trim().length < 200) return undefined;
  const doc = new DOMParser().parseFromString(
    ensureUtf8Meta(html),
    "text/html",
  );
  const metadata = extractPageMetadata(doc);
  return isEmptyRawMetadata(metadata) ? undefined : metadata;
}

function failureResult(
  failureType: FullArticleFetchFailureType,
  pageMetadata: RawArticleMetadata | undefined,
): FullArticleFetchResult {
  return pageMetadata
    ? { content: "", failureType, pageMetadata }
    : { content: "", failureType };
}

interface FetchErrorDetails {
  message: string;
  status: number;
  restricted: boolean;
}

/**
 * Reads the status and message from a thrown fetch error. Obsidian's
 * `requestUrl` throws for any status of 400 or above, with the status on
 * `error.status`.
 */
function describeFetchError(e: unknown): FetchErrorDetails {
  const error = e as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };
  const message = e instanceof Error ? e.message : String(e);
  const status =
    error?.status ?? error?.statusCode ?? error?.response?.status ?? 0;
  return {
    message,
    status,
    restricted: isRestrictedStatus(status) || isRestrictedSignal(message),
  };
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
    let directRestricted: boolean;
    let directMetadata: RawArticleMetadata | undefined;
    try {
      const directResponse = await robustFetchDetailed(url, {
        headers: DEFAULT_HEADERS,
      });
      const directHtml = directResponse.text;
      const directBlocked =
        isBlockedResponse(directHtml) ||
        isRestrictedStatus(directResponse.status);

      if (!directBlocked) {
        console.debug(
          `[RSS Dashboard] Direct fetch succeeded for ${url} (${directHtml.length} chars).`,
        );
        return { ...parseArticleContent(directHtml), failureType: "none" };
      }

      directMetadata = extractMetadataOfUnparsedResponse(directHtml);
      directRestricted =
        isRestrictedStatus(directResponse.status) ||
        isRestrictedSignal(directHtml);
      console.warn(
        `[RSS Dashboard] Direct fetch returned blocked/empty response for ${url} (${directHtml?.length ?? 0} chars). Attempting proxy...`,
      );
    } catch (directError: unknown) {
      // requestUrl throws on 401/403 instead of returning the response, so a
      // restricted page arrives here. Other failures skip the proxy.
      const failure = describeFetchError(directError);
      if (!failure.restricted) {
        throw directError;
      }
      directRestricted = true;
      console.warn(
        `[RSS Dashboard] Direct fetch was restricted for ${url} (${failure.status || "no-status"}): ${failure.message}. Attempting proxy...`,
      );
    }

    // 2. Proxy fallback (silent, logs only)
    if (!proxyUrl || proxyUrl.trim() === "") {
      console.warn(
        "[RSS Dashboard] No CORS proxy configured. Cannot retry blocked fetch.",
      );
      return failureResult(
        directRestricted ? "restricted" : "network",
        directMetadata,
      );
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
      return failureResult(
        directRestricted || proxyRestricted ? "restricted" : "network",
        extractMetadataOfUnparsedResponse(proxyHtml) ?? directMetadata,
      );
    }

    console.debug(
      `[RSS Dashboard] Proxy fetch succeeded for ${url} (${proxyHtml.length} chars).`,
    );
    return { ...parseArticleContent(proxyHtml), failureType: "none" };
  } catch (e: unknown) {
    const { message: msg, status, restricted } = describeFetchError(e);
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
