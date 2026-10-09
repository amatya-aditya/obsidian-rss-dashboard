import {
  fetchWithProxyFallbackDetailed,
  type FullArticleFetchResult,
} from "./fetch-helpers";
import { hostMatches } from "./url-host";

export const RESTRICTED_ARTICLE_REASON = "paywall or restricted";
export const RESTRICTED_ARTICLE_NOTICE =
  "Full article is restricted. Showing available feed excerpt.";
export const RESTRICTED_ARTICLE_BANNER =
  "Full article text appears to be truncated, restricted or paywalled.";
export const RESTRICTED_ARTICLE_LINK_TEXT = "Click here to double check.";

export async function fetchFullArticleContentWithOutcome(
  url: string,
  proxyUrl?: string,
  fetchTimeoutSeconds?: number,
): Promise<FullArticleFetchResult> {
  const isSagepubFull =
    hostMatches(url, "journals.sagepub.com") && url.includes("/doi/full/");

  const result = await fetchWithProxyFallbackDetailed(
    url,
    proxyUrl,
    fetchTimeoutSeconds,
  );

  if (!result.content && isSagepubFull) {
    const abstractUrl = url.replace("/doi/full/", "/doi/abs/");
    const fallbackResult = await fetchWithProxyFallbackDetailed(
      abstractUrl,
      proxyUrl,
      fetchTimeoutSeconds,
    );

    if (fallbackResult.content) {
      return fallbackResult;
    }

    if (
      result.failureType === "restricted" ||
      fallbackResult.failureType === "restricted"
    ) {
      return { content: "", failureType: "restricted" };
    }

    return { content: "", failureType: "network" };
  }

  return result;
}
