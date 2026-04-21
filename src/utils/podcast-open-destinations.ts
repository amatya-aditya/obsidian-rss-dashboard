import type { Feed, FeedItem } from "../types/types";
import {
  isOpenableHttpUrl,
  normalizeUrlForComparison,
  resolveAbsoluteHttpUrl,
} from "./url-utils";

export type PodcastOpenDestinationId =
  | "episode"
  | "episode_guid"
  | "show"
  | "notes"
  | "audio"
  | "rss"
  | "apple_podcasts";

export interface PodcastOpenDestination {
  id: PodcastOpenDestinationId;
  title: string;
  url?: string;
}

function extractUrlsFromEpisodeDetails(
  htmlOrText: string,
  baseUrl: string,
  limit: number,
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const addUrl = (rawUrl: string) => {
    const resolved = resolveAbsoluteHttpUrl(rawUrl, baseUrl);
    if (!resolved) return;
    const key = normalizeUrlForComparison(resolved);
    if (!key || seen.has(key)) return;
    seen.add(key);
    urls.push(resolved);
  };

  try {
    const doc = new DOMParser().parseFromString(htmlOrText, "text/html");
    for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
      if (urls.length >= limit) break;
      const href = a.getAttribute("href") || "";
      if (!href) continue;
      addUrl(href);
    }
  } catch {
    // ignore parse failures
  }

  if (urls.length >= limit) return urls;

  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const matches = htmlOrText.match(urlRegex) || [];
  for (const match of matches) {
    if (urls.length >= limit) break;
    const cleaned = match.replace(/[)\].,;:!?]+$/g, "");
    addUrl(cleaned);
  }

  return urls;
}

function hostnameLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "link";
  }
}

export function resolvePodcastOpenDestinations(
  item: FeedItem,
  feed: Pick<Feed, "url" | "siteUrl"> | null,
  options?: { includeApplePodcasts?: boolean },
): PodcastOpenDestination[] {
  const destinations: PodcastOpenDestination[] = [];

  const episodeUrl = item.link?.trim() ?? "";
  if (episodeUrl && episodeUrl !== "#" && isOpenableHttpUrl(episodeUrl)) {
    destinations.push({ id: "episode", title: "Episode page", url: episodeUrl });
  }

  const guidUrl = item.guid?.trim() ?? "";
  if (
    guidUrl &&
    guidUrl !== "#" &&
    guidUrl !== episodeUrl &&
    isOpenableHttpUrl(guidUrl)
  ) {
    destinations.push({
      id: "episode_guid",
      title: "Episode page (GUID)",
      url: guidUrl,
    });
  }

  const showUrl = feed?.siteUrl?.trim() ?? "";
  if (showUrl && showUrl !== "#" && isOpenableHttpUrl(showUrl)) {
    destinations.push({ id: "show", title: "Show website", url: showUrl });
  }

  const baseUrl = showUrl || episodeUrl || (feed?.url ?? "");
  const notesHtml = (item.content || item.description || "").trim();
  if (notesHtml) {
    const noteUrls = extractUrlsFromEpisodeDetails(notesHtml, baseUrl, 5);
    for (const noteUrl of noteUrls) {
      if (!isOpenableHttpUrl(noteUrl)) continue;
      destinations.push({
        id: "notes",
        title: `From show notes: ${hostnameLabel(noteUrl)}`,
        url: noteUrl,
      });
    }
  }

  const audioUrl = (item.audioUrl || item.enclosure?.url || "").trim();
  if (audioUrl && audioUrl !== "#" && isOpenableHttpUrl(audioUrl)) {
    destinations.push({ id: "audio", title: "Audio file", url: audioUrl });
  }

  const rssUrl = (feed?.url || "").trim();
  if (rssUrl && rssUrl !== "#" && isOpenableHttpUrl(rssUrl)) {
    destinations.push({ id: "rss", title: "RSS feed", url: rssUrl });
  }

  if (options?.includeApplePodcasts) {
    destinations.push({ id: "apple_podcasts", title: "Apple Podcasts" });
  }

  return destinations;
}
