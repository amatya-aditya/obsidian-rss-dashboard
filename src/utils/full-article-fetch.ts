import {
  fetchWithProxyFallbackDetailed,
  resolveFetchTimeoutMs,
  type FullArticleFetchResult,
} from "./fetch-helpers";
import { hostMatches } from "./url-host";

export const RESTRICTED_ARTICLE_REASON = "paywall or restricted";
export const RESTRICTED_ARTICLE_NOTICE =
  "Fetched content is restricted. Showing available RSS content.";
export const RESTRICTED_ARTICLE_BANNER =
  "Fetched content appears to be truncated, restricted or paywalled.";
export const RESTRICTED_ARTICLE_LINK_TEXT = "Click here to double check.";

/**
 * Reads only what a page's head declares (#1702): the same request, proxy
 * fallback and refusal handling as the full fetch, with no article parse. For
 * callers that need the page's metadata and nothing else, such as the cover
 * image fetch.
 */
export function fetchPageMetadataWithOutcome(
  url: string,
  proxyUrl?: string,
  fetchTimeoutSeconds?: number,
): Promise<FullArticleFetchResult> {
  return fetchWithProxyFallbackDetailed(url, proxyUrl, fetchTimeoutSeconds, {
    metadataOnly: true,
  });
}

export async function fetchFullArticleContentWithOutcome(
  url: string,
  proxyUrl?: string,
  fetchTimeoutSeconds?: number,
): Promise<FullArticleFetchResult> {
  const deadline = Date.now() + resolveFetchTimeoutMs(fetchTimeoutSeconds);
  const isSagepubFull =
    hostMatches(url, "journals.sagepub.com") && url.includes("/doi/full/");

  const result = await fetchWithProxyFallbackDetailed(
    url,
    proxyUrl,
    fetchTimeoutSeconds,
  );

  // A block needs no abstract fallback: the abstract page is on the same host,
  // so the host's refusal answers for both (#1347).
  if (
    result.content ||
    !isSagepubFull ||
    result.failureReason === "timeout" ||
    result.failureReason === "blocked"
  ) {
    return result;
  }

  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return { ...result, failureReason: "timeout" };

  const abstractUrl = url.replace("/doi/full/", "/doi/abs/");
  const fallbackResult = await fetchWithProxyFallbackDetailed(
    abstractUrl,
    proxyUrl,
    remainingMs / 1000,
  );

  if (fallbackResult.content) return fallbackResult;

  return {
    ...fallbackResult,
    failureType:
      result.failureType === "restricted" ||
      fallbackResult.failureType === "restricted"
        ? "restricted"
        : "network",
    ...(result.pageMetadata ? { pageMetadata: result.pageMetadata } : {}),
  };
}
