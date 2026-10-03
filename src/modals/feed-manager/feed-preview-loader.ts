import { MediaService } from "../../services/media-service";
import { MastodonService } from "../../services/mastodon-service";
import { loadFeedForPreview, resolvePodcastPlatformUrl } from "../../services/feed-parser";
import { detectPodcastPlatform } from "../../utils/podcast-platforms";
import type { FeedEncoding } from "../../types/types";

export type FeedPreviewType = "rss" | "podcast" | "youtube";

export interface FeedPreviewLoaderOptions {
  corsProxyEnabled?: boolean;
  corsProxyUrl?: string;
  feedEncoding?: FeedEncoding;
}

export interface FeedPreviewLoadResult {
  detectedType: FeedPreviewType;
  inputUrl: string;
  finalUrl: string;
  isMastodonConversion: boolean;
  title: string;
  latestPubDate?: string;
  hasEntries: boolean;
}

export interface MediaFolderDefaults {
  defaultMastodonFolder?: string;
  defaultYouTubeFolder?: string;
  defaultPodcastFolder?: string;
  defaultRssFolder?: string;
}

function isYouTubePageUrl(url: string): boolean {
  if (!url) return false;
  if (!MediaService.isYouTubeFeed(url)) return false;
  if (url.includes("youtube.com/feeds/videos.xml")) return false;
  return true;
}

function isYouTubeRssFeedUrl(url: string): boolean {
  if (!url) return false;
  return url.includes("youtube.com/feeds/videos.xml");
}

export function formatLatestEntryLabel(
  latestPubDate?: string,
  now = Date.now(),
): string {
  if (!latestPubDate) return "N/A";
  const date = new Date(latestPubDate);
  if (!Number.isFinite(date.getTime())) return "N/A";
  const daysAgo = Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));
  return daysAgo === 0 ? "Today" : `${daysAgo} days ago`;
}

export function getPreviewConversionNotice(
  preview: Pick<FeedPreviewLoadResult, "isMastodonConversion">,
): string {
  if (preview.isMastodonConversion) {
    return " (Mastodon > RSS auto-discovery)";
  }

  return "";
}

export function shouldAutoAssignFolder(
  currentFolder: string,
  media?: MediaFolderDefaults,
): boolean {
  const normalizedFolder = currentFolder.trim();
  if (!normalizedFolder || normalizedFolder === "Uncategorized") {
    return true;
  }

  const autoAssignedFolders = new Set([
    media?.defaultMastodonFolder || "Mastodon",
    media?.defaultYouTubeFolder || "Videos",
    media?.defaultPodcastFolder || "Podcast",
    media?.defaultRssFolder || "RSS",
    "Mastodon",
    "Videos",
    "Podcast",
    "RSS",
  ]);

  return autoAssignedFolders.has(normalizedFolder);
}

export function getDefaultFolderForResolvedFeed(
  preview: Pick<
    FeedPreviewLoadResult,
    "detectedType" | "inputUrl" | "finalUrl" | "isMastodonConversion"
  >,
  media?: MediaFolderDefaults,
): string {
  if (
    preview.isMastodonConversion ||
    MastodonService.isResolvedFeedUrl(preview.inputUrl)
  ) {
    return media?.defaultMastodonFolder || "Mastodon";
  }

  if (preview.detectedType === "youtube") {
    return media?.defaultYouTubeFolder || "Videos";
  }

  if (preview.detectedType === "podcast") {
    return media?.defaultPodcastFolder || "Podcast";
  }

  return media?.defaultRssFolder || "RSS";
}

export async function resolveAndLoadPreview(
  inputUrl: string,
  options?: FeedPreviewLoaderOptions,
): Promise<FeedPreviewLoadResult> {
  let url = inputUrl;
  let finalUrl = inputUrl;
  let detectedType: FeedPreviewType = "rss";
  let isMastodonConversion = false;

  if (MediaService.isXUrl(url) || MediaService.isNitterUrl(url)) {
    throw new Error(
      "X/Twitter and Nitter RSS feeds are no longer supported. " +
        "On 24 August 2026, X Corp sent cease and desist letters demanding " +
        "permanent takedown of Nitter instances and its repository " +
        "(https://github.com/zedeus/nitter). " +
        "Please use a third-party RSS bridge (e.g. RSSHub) if you need X/Twitter content.",
    );
  }

  if (MediaService.isMastodonUrl(url)) {
    const mastodonFeedUrl = await MediaService.getMastodonRssFeed(url);
    if (!mastodonFeedUrl) {
      throw new Error(
        "Could not resolve Mastodon profile feed. Please check the profile URL.",
      );
    }

    url = mastodonFeedUrl;
    finalUrl = mastodonFeedUrl;
    isMastodonConversion = true;
  }

  if (isYouTubePageUrl(url)) {
    detectedType = "youtube";
    const rssUrl = await MediaService.getYouTubeRssFeed(url);
    if (!rssUrl) {
      throw new Error("Could not resolve YouTube channel. Please check the URL.");
    }
    url = rssUrl;
    finalUrl = rssUrl;
  } else if (MediaService.isYouTubeFeed(url) && isYouTubeRssFeedUrl(url)) {
    detectedType = "youtube";
  } else {
    const platform = detectPodcastPlatform(url);
    if (platform) {
      if (platform.id === "pocketcasts" && !options?.corsProxyEnabled) {
        throw new Error(
          "Pocket Casts resolution requires the CORS Proxy to be enabled in Settings (due to Pocket Casts API limitations). Please enable it, or try another feed source.",
        );
      }

      detectedType = "podcast";
      const resolvedUrl = await resolvePodcastPlatformUrl(
        url,
        options?.corsProxyUrl,
      );
      if (!resolvedUrl) {
        throw new Error("Could not resolve podcast feed URL");
      }
      url = resolvedUrl;
      finalUrl = resolvedUrl;
    }
  }

  const feedData =
    options?.feedEncoding === "windows-1251"
      ? await loadFeedForPreview(finalUrl, options.feedEncoding)
      : await loadFeedForPreview(finalUrl);

  return {
    detectedType,
    inputUrl,
    finalUrl,
    isMastodonConversion,
    title: feedData.title,
    latestPubDate: feedData.latestPubDate,
    hasEntries: feedData.hasEntries,
  };
}
