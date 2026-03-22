import { requestUrl } from "obsidian";
import { normalizeUrlForComparison } from "../utils/url-utils";

interface ItunesSearchResult {
  feedUrl?: string;
  collectionViewUrl?: string;
  trackViewUrl?: string;
  collectionName?: string;
}

interface ItunesSearchResponse {
  resultCount: number;
  results: ItunesSearchResult[];
}

const applePodcastsUrlCache = new Map<string, string | null>();

function getShowUrl(result: ItunesSearchResult): string | null {
  return result.collectionViewUrl || result.trackViewUrl || null;
}

function urlsMatch(a: string, b: string): boolean {
  const normalizedA = normalizeUrlForComparison(a);
  const normalizedB = normalizeUrlForComparison(b);
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;

  // Fallback: ignore query string differences
  const aNoQuery = normalizedA.split("?")[0] || normalizedA;
  const bNoQuery = normalizedB.split("?")[0] || normalizedB;
  return aNoQuery === bNoQuery;
}

export async function resolveApplePodcastsShowUrl(
  feedUrl: string,
  feedTitle: string,
): Promise<string | null> {
  const cached = applePodcastsUrlCache.get(feedUrl);
  if (cached !== undefined) return cached;

  const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
    feedTitle,
  )}&entity=podcast&limit=10`;

  try {
    const response = await requestUrl({
      url: searchUrl,
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const data = JSON.parse(response.text) as ItunesSearchResponse;
    const results = Array.isArray(data.results) ? data.results : [];

    const match = results.find((result) => {
      const candidateFeedUrl = result.feedUrl;
      return candidateFeedUrl ? urlsMatch(candidateFeedUrl, feedUrl) : false;
    });

    const showUrl = match ? getShowUrl(match) : null;
    applePodcastsUrlCache.set(feedUrl, showUrl);
    return showUrl;
  } catch {
    // Network/transient errors: don't cache so user can retry
    return null;
  }
}

