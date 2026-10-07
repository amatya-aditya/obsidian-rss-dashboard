import { requestUrl } from "obsidian";

/**
 * YouTube's own feeds (https://www.youtube.com/feeds/videos.xml) intermittently answer
 * 404/500 for valid channels. With a YouTube Data API key, the same videos are read
 * through playlistItems.list (1 quota unit per call) and returned as an Atom document
 * shaped like YouTube's feed, so the normal parser and media handling apply unchanged.
 */

const PLAYLIST_ITEMS_URL =
  "https://www.googleapis.com/youtube/v3/playlistItems";

interface PlaylistItem {
  snippet?: {
    title?: string;
    description?: string;
    videoOwnerChannelTitle?: string;
    videoOwnerChannelId?: string;
    thumbnails?: Record<
      string,
      { url?: string; width?: number; height?: number }
    >;
  };
  contentDetails?: {
    videoId?: string;
    videoPublishedAt?: string;
  };
}

interface PlaylistItemsResponse {
  items?: PlaylistItem[];
}

/**
 * The playlist a YouTube feed URL reads: the channel's uploads playlist (UC… → UU…)
 * for channel feeds, or the playlist itself. Null for anything else.
 */
export function getYouTubeFeedPlaylistId(feedUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(feedUrl);
  } catch {
    return null;
  }
  const isYouTubeFeed =
    /(^|\.)youtube\.com$/i.test(url.hostname) &&
    url.pathname === "/feeds/videos.xml";
  if (!isYouTubeFeed) return null;

  const playlistId = url.searchParams.get("playlist_id");
  if (playlistId) return playlistId;

  const channelId = url.searchParams.get("channel_id");
  if (channelId?.startsWith("UC")) return `UU${channelId.slice(2)}`;

  return null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bestThumbnail(
  item: PlaylistItem,
): { url: string; width: number; height: number } | null {
  const thumbnails = item.snippet?.thumbnails ?? {};
  for (const size of ["high", "medium", "default"]) {
    const thumbnail = thumbnails[size];
    if (thumbnail?.url) {
      return {
        url: thumbnail.url,
        width: thumbnail.width ?? 480,
        height: thumbnail.height ?? 360,
      };
    }
  }
  return null;
}

function toAtomEntry(item: PlaylistItem): string | null {
  const videoId = item.contentDetails?.videoId;
  const published = item.contentDetails?.videoPublishedAt;
  // Private and deleted videos stay in playlists without a publish date
  if (!videoId || !published) return null;

  const title = escapeXml(item.snippet?.title ?? "");
  const description = escapeXml(item.snippet?.description ?? "");
  const author = escapeXml(item.snippet?.videoOwnerChannelTitle ?? "");
  const channelId = escapeXml(item.snippet?.videoOwnerChannelId ?? "");
  const thumbnail = bestThumbnail(item);
  const thumbnailXml = thumbnail
    ? `<media:thumbnail url="${escapeXml(thumbnail.url)}" width="${thumbnail.width}" height="${thumbnail.height}"/>`
    : "";

  return [
    "<entry>",
    `<id>yt:video:${escapeXml(videoId)}</id>`,
    `<yt:videoId>${escapeXml(videoId)}</yt:videoId>`,
    `<yt:channelId>${channelId}</yt:channelId>`,
    `<title>${title}</title>`,
    `<link rel="alternate" href="https://www.youtube.com/watch?v=${escapeXml(videoId)}"/>`,
    `<author><name>${author}</name><uri>https://www.youtube.com/channel/${channelId}</uri></author>`,
    `<published>${escapeXml(published)}</published>`,
    `<updated>${escapeXml(published)}</updated>`,
    "<media:group>",
    `<media:title>${title}</media:title>`,
    thumbnailXml,
    `<media:description>${description}</media:description>`,
    "</media:group>",
    "</entry>",
  ].join("");
}

/**
 * Reads a YouTube channel or playlist feed through the YouTube Data API and returns
 * it as Atom XML. Throws when the URL isn't a supported YouTube feed or the API fails.
 */
export async function fetchYouTubeFeedXmlFromApi(
  feedUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const playlistId = getYouTubeFeedPlaylistId(feedUrl);
  if (!playlistId) {
    throw new Error("Not a YouTube channel or playlist feed");
  }
  if (signal?.aborted) throw new Error("Timed out");

  const query = new URLSearchParams({
    part: "snippet,contentDetails",
    maxResults: "50",
    playlistId,
  });
  const response = await requestUrl({
    url: `${PLAYLIST_ITEMS_URL}?${query.toString()}`,
    method: "GET",
    // A header rather than a query parameter, so the key never appears in logged URLs
    headers: { "X-Goog-Api-Key": apiKey },
  });
  if (signal?.aborted) throw new Error("Timed out");

  const data = response.json as PlaylistItemsResponse;
  const items = data.items ?? [];
  const entries = items
    .map(toAtomEntry)
    .filter((entry): entry is string => entry !== null);
  const first = items.find((item) => item.snippet?.videoOwnerChannelTitle);
  const feedTitle = escapeXml(
    first?.snippet?.videoOwnerChannelTitle ?? "YouTube",
  );
  const channelId = escapeXml(first?.snippet?.videoOwnerChannelId ?? "");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">',
    `<title>${feedTitle}</title>`,
    `<link rel="alternate" href="https://www.youtube.com/channel/${channelId}"/>`,
    ...entries,
    "</feed>",
  ].join("");
}
