import { Readability } from "@mozilla/readability";
import { debugLog } from "./debug-logger";
import {
  extractPageImage,
  extractPageMetadata,
  isEmptyRawMetadata,
  type RawArticleMetadata,
} from "./article-metadata";
import {
  robustFetch,
  robustFetchDetailed,
  ensureUtf8Meta,
} from "./platform-utils";
import { resolveProxyPrefixes } from "./proxy-utils";
import { stripAdContainers } from "./ad-containers";

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
 * Wording that signals a paywall or login wall. Real article pages carry these
 * words in script data (for example an `accessPaywall` config key), so they
 * count only in visible text, not inside `<script>` or `<style>`.
 */
const VISIBLE_TEXT_BLOCKED_MARKERS = [
  "paywall",
  "subscription required",
  "subscribe to continue",
  "401 unauthorized",
];

const SCRIPT_OR_STYLE_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

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
   * "timeout": the shared direct-and-proxy deadline expired. "unexpected": the
   * fetch threw, so the failure says nothing about the page (#1110).
   */
  failureReason?: "timeout" | "unexpected";
  /**
   * Raw signals from the fetched page (#247). Unresolved: callers resolve it
   * against their own feed context. Absent when no page was fetched or the
   * page carried no signal.
   */
  pageMetadata?: RawArticleMetadata;
  /**
   * The fetched page's own `og:image`/`twitter:image` as an absolute http(s)
   * URL. Readability drops the featured image that sits outside the article
   * body, so this is the only place the page's hero survives.
   */
  pageImage?: string;
}

export const DEFAULT_FETCH_TIMEOUT_SECONDS = 10;

/** A missing, non-numeric or non-positive timeout falls back to the default. */
export function resolveFetchTimeoutMs(seconds: number | undefined): number {
  const valid =
    typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0;
  return (valid ? seconds : DEFAULT_FETCH_TIMEOUT_SECONDS) * 1000;
}

class FetchTimeoutError extends Error {
  constructor() {
    super("Article fetch deadline expired");
  }
}

/**
 * Every sequential attempt uses the same deadline (#954). Obsidian's
 * `requestUrl` cannot be aborted, so a timed-out request is abandoned.
 * Accept a factory so no request starts after the budget has been exhausted.
 */
function withFetchDeadline<T>(
  request: () => Promise<T>,
  deadline: number,
): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return Promise.reject(new FetchTimeoutError());
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new FetchTimeoutError());
    }, remainingMs);
    void Promise.resolve()
      .then(() => {
        if (Date.now() >= deadline) throw new FetchTimeoutError();
        return request();
      })
      .then(
        (value) => {
          window.clearTimeout(timer);
          if (Date.now() >= deadline) reject(new FetchTimeoutError());
          else resolve(value);
        },
        (error: unknown) => {
          window.clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
  });
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
  if (BLOCKED_MARKERS.some((marker) => lower.includes(marker))) return true;
  const visible = lower.replace(SCRIPT_OR_STYLE_BLOCK, " ");
  return VISIBLE_TEXT_BLOCKED_MARKERS.some((marker) =>
    visible.includes(marker),
  );
}

export function isRestrictedSignal(input: string): boolean {
  if (!input) return false;
  const lower = input.toLowerCase();
  return RESTRICTED_MARKERS.some((marker) => lower.includes(marker));
}

// No User-Agent override: a Chrome UA without its sec-ch-ua client hints trips
// anti-bot filters (403), while Obsidian's own UA passes (#1109).
const DEFAULT_HEADERS: Record<string, string> = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

/** The relative attributes Readability would otherwise resolve against its own base. */
const RELATIVE_URL_ATTRIBUTES: ReadonlyArray<readonly [string, string]> = [
  ["a", "href"],
  ["img", "src"],
  ["source", "src"],
  ["video", "src"],
  ["audio", "src"],
  ["video", "poster"],
];

/** Readability's own srcset pattern, mirrored so its resolution pass becomes a no-op. */
const SRCSET_URL = /(\S+)(\s+[\d.]+[xw])?(\s*(?:,|$))/g;

function resolveDocumentBase(declaredBase: string, pageUrl: string): string {
  try {
    return new URL(declaredBase || pageUrl, pageUrl || undefined).href;
  } catch {
    return "";
  }
}

/**
 * Resolves the fetched page's relative links and media against the page URL
 * before Readability runs. Readability resolves them against the parsed
 * document's base URI, which a DOMParser document inherits from Obsidian's own
 * `app://…` origin, so `/img/x.png` would become an unusable `app://…/img/x.png`
 * (#1195). A fragment-only href is left alone so the Reader keeps its in-page
 * navigation, and a page that declares its own `<base href>` wins.
 */
function resolveRelativeUrlsForReadability(
  doc: Document,
  pageUrl: string,
): void {
  const declaredBase =
    doc.querySelector("base[href]")?.getAttribute("href") ?? "";
  const base = resolveDocumentBase(declaredBase, pageUrl);
  if (!base) return;

  const toAbsolute = (value: string): string => {
    try {
      return new URL(value, base).href;
    } catch {
      return value;
    }
  };

  for (const [tag, attribute] of RELATIVE_URL_ATTRIBUTES) {
    doc.querySelectorAll(`${tag}[${attribute}]`).forEach((el) => {
      const value = el.getAttribute(attribute);
      if (!value) return;
      if (attribute === "href" && value.startsWith("#")) return;
      el.setAttribute(attribute, toAbsolute(value));
    });
  }

  doc.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
    const srcset = el.getAttribute("srcset");
    if (!srcset) return;
    el.setAttribute(
      "srcset",
      srcset.replace(
        SRCSET_URL,
        (_match, url: string, descriptor = "", tail = "") =>
          `${toAbsolute(url)}${descriptor}${tail}`,
      ),
    );
  });
}

/**
 * Parses fetched HTML and prepares it for Readability, resolving its relative
 * URLs against the fetched page (#1195).
 */
function parsePageDocument(html: string, pageUrl: string): Document {
  const doc = new DOMParser().parseFromString(
    ensureUtf8Meta(html),
    "text/html",
  );

  // Readability strips class attributes, so its output no longer carries the
  // classes the ad selectors match. Drop the containers while the raw page
  // still has them (#1195).
  stripAdContainers(doc);
  resolveRelativeUrlsForReadability(doc, pageUrl);

  return doc;
}

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

  const doc = parsePageDocument(html, url);
  const article = new Readability(doc).parse();
  return article?.content ?? "";
}

function parseArticleContent(
  html: string,
  pageUrl: string,
): {
  content: string;
  pageMetadata: RawArticleMetadata;
  pageImage?: string;
} {
  const doc = parsePageDocument(html, pageUrl);
  // Readability.parse() mutates the document (it drops scripts, so JSON-LD
  // would be gone), so the page's metadata is read first.
  const pageMetadata = extractPageMetadata(doc);
  const pageImage = extractPageImage(doc, pageUrl);
  const article = new Readability(doc).parse();
  pageMetadata.readabilityExcerpt = (article?.excerpt ?? "").trim();
  return {
    content: article?.content ?? "",
    pageMetadata,
    ...(pageImage ? { pageImage } : {}),
  };
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
  fetchTimeoutSeconds?: number,
): Promise<FullArticleFetchResult> {
  const deadline = Date.now() + resolveFetchTimeoutMs(fetchTimeoutSeconds);
  let directRestricted = false;
  let directMetadata: RawArticleMetadata | undefined;
  try {
    // 1. Direct fetch
    try {
      const directResponse = await withFetchDeadline(
        () => robustFetchDetailed(url, { headers: DEFAULT_HEADERS }),
        deadline,
      );
      const directHtml = directResponse.text;
      const directBlocked =
        isBlockedResponse(directHtml) ||
        isRestrictedStatus(directResponse.status);

      if (!directBlocked) {
        debugLog(
          `[RSS Dashboard] Direct fetch succeeded for ${url} (${directHtml.length} chars).`,
        );
        return { ...parseArticleContent(directHtml, url), failureType: "none" };
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

    // "auto" expands to several proxies; the first that returns the page wins.
    let lastFailure: FullArticleFetchResult | undefined;
    let lastError: Error | undefined;
    for (const prefix of resolveProxyPrefixes(proxyUrl.trim(), {
      rawBodyOnly: true,
    })) {
      const proxyTarget = prefix.replace(/\/$/, "") + encodeURIComponent(url);
      try {
        const proxyResponse = await withFetchDeadline(
          () => robustFetchDetailed(proxyTarget, { headers: DEFAULT_HEADERS }),
          deadline,
        );
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
          directRestricted ||= proxyRestricted;
          directMetadata =
            extractMetadataOfUnparsedResponse(proxyHtml) ?? directMetadata;
          lastFailure = failureResult(
            directRestricted ? "restricted" : "network",
            directMetadata,
          );
          lastError = undefined;
          continue;
        }

        debugLog(
          `[RSS Dashboard] Proxy fetch succeeded for ${url} (${proxyHtml.length} chars).`,
        );
        return { ...parseArticleContent(proxyHtml, url), failureType: "none" };
      } catch (proxyError: unknown) {
        if (proxyError instanceof FetchTimeoutError) throw proxyError;
        directRestricted ||= describeFetchError(proxyError).restricted;
        lastError =
          proxyError instanceof Error
            ? proxyError
            : new Error(describeFetchError(proxyError).message);
        lastFailure = undefined;
      }
    }

    if (lastError !== undefined) {
      throw lastError;
    }
    return lastFailure ?? failureResult("network", directMetadata);
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
      ...failureResult(
        directRestricted || restricted ? "restricted" : "network",
        directMetadata,
      ),
      ...(e instanceof FetchTimeoutError
        ? { failureReason: "timeout" as const }
        : {}),
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
