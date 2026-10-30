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
import { promotePictureImageSources } from "./image-url-utils";
import { extractGitHubIssueContent } from "./github-issue-page";

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
 * words in script data (an `accessPaywall` config key, say) or in markup
 * attributes (a `pmc-paywall` class), so they count only in reader-visible
 * text, never inside `<script>`/`<style>` or a tag's attributes (#1345).
 */
const VISIBLE_TEXT_BLOCKED_MARKERS = [
  "paywall",
  "subscription required",
  "subscribe to continue",
  "401 unauthorized",
];

const SCRIPT_OR_STYLE_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Every remaining tag, attributes included, so only element text is left. */
const MARKUP_TAG = /<[^>]*>/g;

const RESTRICTED_MARKERS = [
  "401",
  "unauthorized",
  "paywall",
  "subscription required",
  "subscribe to continue",
];

/**
 * Markers that name a WAF/bot challenge. Deliberately narrower than
 * `BLOCKED_MARKERS`: the generic phrases there ("403 forbidden",
 * "access denied") also appear on a real content gate printed beside paywall
 * wording, and only a named challenge page or Cloudflare's own header outranks
 * a 401/403 (#1347).
 */
const CHALLENGE_MARKERS = [
  "just a moment", // Cloudflare "Just a moment..." title
  "cf-challenge",
  "cf-browser-verification",
  "challenge-platform",
  "ddos-guard",
  "enable javascript and cookies",
];

/** Cloudflare's own signal for a managed challenge, on the refused response. */
const CHALLENGE_HEADER = "cf-mitigated";
const CHALLENGE_HEADER_VALUE = "challenge";

export type FullArticleFetchFailureType = "none" | "restricted" | "network";

export interface FullArticleFetchResult {
  content: string;
  failureType: FullArticleFetchFailureType;
  /**
   * "timeout": the shared direct-and-proxy deadline expired. "unexpected": the
   * fetch threw, so the failure says nothing about the page (#1110).
   * "blocked": the site answered with a bot challenge, not a paywall (#1347).
   */
  failureReason?: "timeout" | "unexpected" | "blocked";
  /**
   * Raw signals from the fetched page (#247). Unresolved: callers resolve it
   * against their own feed context. Absent when no page was fetched or the
   * page carried no signal.
   */
  pageMetadata?: RawArticleMetadata;
  /**
   * The fetched page's own declared image (`og:image`, else `twitter:image`,
   * else a JSON-LD `image`) as an absolute http(s) URL. Readability drops the
   * featured image that sits outside the article body, so this is the only
   * place the page's hero survives.
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
  // Paywall wording counts only in reader-visible text: drop script/style
  // bodies, then every tag, so a marker inside an attribute value such as
  // `class="pmc-paywall"` no longer matches (#1345).
  const visibleText = lower
    .replace(SCRIPT_OR_STYLE_BLOCK, " ")
    .replace(MARKUP_TAG, " ");
  return VISIBLE_TEXT_BLOCKED_MARKERS.some((marker) =>
    visibleText.includes(marker),
  );
}

export function isRestrictedSignal(input: string): boolean {
  if (!input) return false;
  const lower = input.toLowerCase();
  return RESTRICTED_MARKERS.some((marker) => lower.includes(marker));
}

export type FetchRefusal = "blocked" | "restricted" | "network";

export interface FetchRefusalInput {
  /** HTTP status, absent when the refusal arrived as a thrown error alone. */
  status?: number;
  /** Response headers, when the refusal came back as a thrown error. */
  headers?: Record<string, string>;
  /** Response body, when one was received. */
  body?: string;
  /** The thrown error's message. */
  message?: string;
}

function hasChallengeHeader(
  headers: Record<string, string> | undefined,
): boolean {
  if (!headers) return false;
  return Object.entries(headers).some(
    ([name, value]) =>
      name.toLowerCase() === CHALLENGE_HEADER &&
      value.toLowerCase().includes(CHALLENGE_HEADER_VALUE),
  );
}

/** True when the text names a WAF/bot-challenge vendor. */
function namesChallenge(text: string | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Classifies a refused article fetch (#1347). A bot challenge is a *blocked*
 * fetch, not a paywall: the same page opens in a browser. Order matters, so a
 * named challenge page and Cloudflare's own header outrank a bare 401/403 and
 * any paywall wording.
 */
export function classifyFetchRefusal(input: FetchRefusalInput): FetchRefusal {
  if (hasChallengeHeader(input.headers) || namesChallenge(input.body)) {
    return "blocked";
  }
  if (isRestrictedStatus(input.status)) return "restricted";
  if (
    isRestrictedSignal(input.body ?? "") ||
    isRestrictedSignal(input.message ?? "")
  ) {
    return "restricted";
  }
  return "network";
}

/** The refusal a classification names, or undefined for a plain failure. */
function refusalOf(
  classification: FetchRefusal,
): "blocked" | "restricted" | undefined {
  return classification === "network" ? undefined : classification;
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

  // Readability drops a <picture> whose <img> has no src, which is how some
  // server-rendered pages ship their body images (#1361). Fill the src from the
  // sources' srcset first, while the picture is still in the document.
  promotePictureImageSources(doc);

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

interface ParsedPage {
  content: string;
  pageMetadata: RawArticleMetadata;
  pageImage?: string;
}

/** How a served page is read: the whole article, or only what its head declares. */
type PageParser = (html: string, pageUrl: string) => ParsedPage;

export interface PageFetchOptions {
  /**
   * Read only the metadata the page's head declares, and return no content.
   * The cover-image fetch needs nothing else, and the full article parse costs
   * about two seconds of main-thread time on a large page (#1702).
   */
  metadataOnly?: boolean;
}

/**
 * The longest start of a page a metadata-only read will parse. Heads run long
 * with inline CSS and state, so this is generous; a declaration past it is not
 * seen. A literal `</head>` inside a head script would end the read early.
 */
const METADATA_HEAD_LIMIT = 256 * 1024;

/**
 * Reads a page's declared metadata from its head alone. The head ends at
 * `</head>`; a page that never closes it, or an unusually long one, is read up
 * to {@link METADATA_HEAD_LIMIT}. No Readability, no ad stripping, no URL
 * rewriting: those only serve the article body.
 */
function parsePageMetadataOnly(html: string, pageUrl: string): ParsedPage {
  const start = html.slice(0, METADATA_HEAD_LIMIT);
  const close = /<\/head\s*>/i.exec(start);
  const head = close ? start.slice(0, close.index + close[0].length) : start;
  const doc = new DOMParser().parseFromString(
    ensureUtf8Meta(head),
    "text/html",
  );
  const pageMetadata = extractPageMetadata(doc);
  const pageImage = extractPageImage(doc, pageUrl);
  return { content: "", pageMetadata, ...(pageImage ? { pageImage } : {}) };
}

function parseArticleContent(html: string, pageUrl: string): ParsedPage {
  const doc = parsePageDocument(html, pageUrl);
  // Readability.parse() mutates the document (it drops scripts, so JSON-LD
  // would be gone), so the page's metadata is read first.
  const pageMetadata = extractPageMetadata(doc);
  const pageImage = extractPageImage(doc, pageUrl);
  // Readability still runs for an issue page so its excerpt keeps feeding the
  // page metadata; only the content is replaced (#1394).
  const issueContent = extractGitHubIssueContent(html, pageUrl);
  const article = new Readability(doc).parse();
  pageMetadata.readabilityExcerpt = (article?.excerpt ?? "").trim();
  return {
    content: issueContent ?? article?.content ?? "",
    pageMetadata,
    ...(pageImage ? { pageImage } : {}),
  };
}

/**
 * Reads the head of a response that is not parsed for content (blocked,
 * restricted or paywalled). A paywalled page often has a real `<head>`; a
 * bot-challenge page's comes back empty on its own. The existing `< 200`
 * character guard is the only skip condition. The declared page image is read
 * too, so a restricted head still names the article's own hero (#1342).
 */
function extractMetadataOfUnparsedResponse(
  html: string | undefined,
  pageUrl: string,
): {
  pageMetadata?: RawArticleMetadata;
  pageImage?: string;
} {
  if (!html || html.trim().length < 200) return {};
  const doc = new DOMParser().parseFromString(
    ensureUtf8Meta(html),
    "text/html",
  );
  const metadata = extractPageMetadata(doc);
  const pageImage = extractPageImage(doc, pageUrl);
  return {
    ...(isEmptyRawMetadata(metadata) ? {} : { pageMetadata: metadata }),
    ...(pageImage ? { pageImage } : {}),
  };
}

function failureResult(
  failureType: FullArticleFetchFailureType,
  pageMetadata: RawArticleMetadata | undefined,
  pageImage?: string,
): FullArticleFetchResult {
  return {
    content: "",
    failureType,
    ...(pageMetadata ? { pageMetadata } : {}),
    ...(pageImage ? { pageImage } : {}),
  };
}

/**
 * The result for a fetch that produced no content. A refused page keeps its
 * refusal - "restricted" for a real gate, "blocked" (a network failure with its
 * own reason) for a bot challenge - and anything else is a plain failure
 * (#1347).
 */
function refusalResult(
  refusal: "blocked" | "restricted" | undefined,
  pageMetadata: RawArticleMetadata | undefined,
  pageImage?: string,
): FullArticleFetchResult {
  if (refusal === "restricted") {
    return failureResult("restricted", pageMetadata, pageImage);
  }
  if (refusal === "blocked") {
    return {
      ...failureResult("network", pageMetadata, pageImage),
      failureReason: "blocked",
    };
  }
  return failureResult("network", pageMetadata, pageImage);
}

interface FetchErrorDetails {
  message: string;
  status: number;
  classification: FetchRefusal;
}

/**
 * Reads the status, headers and message from a thrown fetch error. Obsidian's
 * `requestUrl` throws for any status of 400 or above, with the status and the
 * response headers on the error - the body is not available, so a challenge is
 * recognised from `cf-mitigated` or the message (#1347).
 */
function describeFetchError(e: unknown): FetchErrorDetails {
  const error = e as {
    status?: number;
    statusCode?: number;
    response?: { status?: number; headers?: Record<string, string> };
    headers?: Record<string, string>;
  };
  const message = e instanceof Error ? e.message : String(e);
  const status =
    error?.status ?? error?.statusCode ?? error?.response?.status ?? 0;
  const headers = error?.headers ?? error?.response?.headers;
  return {
    message,
    status,
    classification: classifyFetchRefusal({ status, headers, message }),
  };
}

/** What the attempts so far say about the page, and how the last one ended. */
interface FetchAttempts {
  refusal: "blocked" | "restricted" | undefined;
  metadata: RawArticleMetadata | undefined;
  pageImage: string | undefined;
  lastFailure: FullArticleFetchResult | undefined;
  lastError: Error | undefined;
  /** How a page a proxy serves is read. */
  parse: PageParser;
}

/**
 * The direct request. A resolved response that is not blocked is the page; a
 * refusal keeps whatever the response said about it. A thrown error that names
 * no refusal says nothing about the page, so it propagates to the caller's
 * outer handler (#1347).
 */
async function attemptDirectFetch(
  url: string,
  deadline: number,
  attempts: FetchAttempts,
): Promise<
  | { kind: "page"; result: FullArticleFetchResult }
  | {
      kind: "refused";
      refusal: "blocked" | "restricted" | undefined;
      metadata: RawArticleMetadata | undefined;
      pageImage: string | undefined;
    }
> {
  try {
    const response = await withFetchDeadline(
      () => robustFetchDetailed(url, { headers: DEFAULT_HEADERS }),
      deadline,
    );
    const html = response.text;
    if (!isBlockedResponse(html) && !isRestrictedStatus(response.status)) {
      debugLog(
        `[RSS Dashboard] Direct fetch succeeded for ${url} (${html.length} chars).`,
      );
      return {
        kind: "page",
        result: { ...attempts.parse(html, url), failureType: "none" },
      };
    }
    console.warn(
      `[RSS Dashboard] Direct fetch returned blocked/empty response for ${url} (${html?.length ?? 0} chars). Attempting proxy...`,
    );
    const signals = extractMetadataOfUnparsedResponse(html, url);
    return {
      kind: "refused",
      refusal: refusalOf(
        classifyFetchRefusal({ status: response.status, body: html }),
      ),
      metadata: signals.pageMetadata,
      pageImage: signals.pageImage,
    };
  } catch (directError: unknown) {
    // requestUrl throws on 4xx/5xx instead of returning the response, so a
    // refusal arrives here carrying its status and headers only. Other
    // failures say nothing about the page, so they skip the proxy.
    const failure = describeFetchError(directError);
    const refusal = refusalOf(failure.classification);
    if (!refusal) {
      throw directError;
    }
    console.warn(
      `[RSS Dashboard] Direct fetch was ${failure.classification} for ${url} (${failure.status || "no-status"}): ${failure.message}. Attempting proxy...`,
    );
    return {
      kind: "refused",
      refusal,
      metadata: undefined,
      pageImage: undefined,
    };
  }
}

/**
 * One proxied attempt: returns the parsed page when the proxy served it, and
 * otherwise records on `attempts` what the attempt said about the page (#1347).
 */
async function attemptProxyFetch(
  url: string,
  proxyTarget: string,
  deadline: number,
  attempts: FetchAttempts,
): Promise<FullArticleFetchResult | undefined> {
  try {
    const response = await withFetchDeadline(
      () => robustFetchDetailed(proxyTarget, { headers: DEFAULT_HEADERS }),
      deadline,
    );
    const html = response.text;
    if (!isBlockedResponse(html) && !isRestrictedStatus(response.status)) {
      debugLog(
        `[RSS Dashboard] Proxy fetch succeeded for ${url} (${html.length} chars).`,
      );
      return { ...attempts.parse(html, url), failureType: "none" };
    }

    console.warn(
      `[RSS Dashboard] Proxy fetch also returned blocked/empty response for ${url}.`,
    );
    // The direct answer is about the page itself; a proxy's refusal can be the
    // proxy's own, so it only fills in a verdict we lack (#1347).
    attempts.refusal ??= refusalOf(
      classifyFetchRefusal({ status: response.status, body: html }),
    );
    const signals = extractMetadataOfUnparsedResponse(html, url);
    attempts.metadata = signals.pageMetadata ?? attempts.metadata;
    attempts.pageImage = signals.pageImage ?? attempts.pageImage;
    attempts.lastFailure = refusalResult(
      attempts.refusal,
      attempts.metadata,
      attempts.pageImage,
    );
    attempts.lastError = undefined;
    return undefined;
  } catch (proxyError: unknown) {
    if (proxyError instanceof FetchTimeoutError) throw proxyError;
    const failure = describeFetchError(proxyError);
    attempts.refusal ??= refusalOf(failure.classification);
    attempts.lastError =
      proxyError instanceof Error ? proxyError : new Error(failure.message);
    attempts.lastFailure = undefined;
    return undefined;
  }
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
  options: PageFetchOptions = {},
): Promise<FullArticleFetchResult> {
  const deadline = Date.now() + resolveFetchTimeoutMs(fetchTimeoutSeconds);
  const parse = options.metadataOnly
    ? parsePageMetadataOnly
    : parseArticleContent;
  const attempts: FetchAttempts = {
    refusal: undefined,
    metadata: undefined,
    pageImage: undefined,
    lastFailure: undefined,
    lastError: undefined,
    parse,
  };
  try {
    // 1. Direct fetch
    const direct = await attemptDirectFetch(url, deadline, attempts);
    if (direct.kind === "page") return direct.result;
    attempts.refusal = direct.refusal;
    attempts.metadata = direct.metadata;
    attempts.pageImage = direct.pageImage;

    // 2. Proxy fallback (silent, logs only)
    if (!proxyUrl || proxyUrl.trim() === "") {
      console.warn(
        "[RSS Dashboard] No CORS proxy configured. Cannot retry blocked fetch.",
      );
      return refusalResult(
        attempts.refusal,
        attempts.metadata,
        attempts.pageImage,
      );
    }

    // "auto" expands to several proxies; the first that returns the page wins.
    for (const prefix of resolveProxyPrefixes(proxyUrl.trim(), {
      rawBodyOnly: true,
    })) {
      const proxyTarget = prefix.replace(/\/$/, "") + encodeURIComponent(url);
      const page = await attemptProxyFetch(
        url,
        proxyTarget,
        deadline,
        attempts,
      );
      if (page) return page;
    }

    if (attempts.lastError !== undefined) {
      throw attempts.lastError;
    }
    return (
      attempts.lastFailure ??
      failureResult("network", attempts.metadata, attempts.pageImage)
    );
  } catch (e: unknown) {
    const { message: msg, status, classification } = describeFetchError(e);
    const logMessage =
      classification === "network"
        ? `[RSS Dashboard] fetchWithProxyFallback error: ${msg}`
        : `[RSS Dashboard] Article fetch was ${classification} (${status || "no-status"}): ${msg}`;

    if (classification === "network") {
      console.error(logMessage);
    } else {
      console.warn(logMessage);
    }

    const refusal = attempts.refusal ?? refusalOf(classification);
    // A block is the page's own answer; a deadline only ended a retry, so it
    // must not overwrite the refusal with a timeout (#1347).
    if (refusal === "blocked") {
      return refusalResult("blocked", attempts.metadata, attempts.pageImage);
    }
    return {
      ...refusalResult(refusal, attempts.metadata, attempts.pageImage),
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
