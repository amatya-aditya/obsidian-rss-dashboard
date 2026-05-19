import { MediaService } from "../../services/media-service";
import { loadFeedForPreview, resolvePodcastPlatformUrl } from "../../services/feed-parser";
import { detectPodcastPlatform } from "../../utils/podcast-platforms";

export type FeedPreviewType = "rss" | "podcast" | "youtube";

export interface FeedPreviewLoaderOptions {
  corsProxyEnabled?: boolean;
  corsProxyUrl?: string;
}

export interface FeedPreviewLoadResult {
  detectedType: FeedPreviewType;
  inputUrl: string;
  finalUrl: string;
  isXConversion: boolean;
  isMastodonConversion: boolean;
  title: string;
  latestPubDate?: string;
  hasEntries: boolean;
}

export interface MediaFolderDefaults {
  defaultTwitterFolder?: string;
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
  preview: Pick<FeedPreviewLoadResult, "isXConversion" | "isMastodonConversion">,
): string {
  if (preview.isXConversion) {
    return " (X > nitter conversion)";
  }

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
    media?.defaultTwitterFolder || "Twitter",
    media?.defaultMastodonFolder || "Mastodon",
    media?.defaultYouTubeFolder || "Videos",
    media?.defaultPodcastFolder || "Podcast",
    media?.defaultRssFolder || "RSS",
    "Twitter",
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
    "detectedType" | "finalUrl" | "isXConversion" | "isMastodonConversion"
  >,
  media?: MediaFolderDefaults,
): string {
  const isNitterFeed = !!MediaService.normalizeNitterUrlToRss(preview.finalUrl);
  if (preview.isXConversion || isNitterFeed) {
    return media?.defaultTwitterFolder || "Twitter";
  }

  if (preview.isMastodonConversion) {
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
  let isXConversion = false;
  let isMastodonConversion = false;

  const normalizedNitterUrl = MediaService.normalizeNitterUrlToRss(url);
  if (normalizedNitterUrl) {
    url = normalizedNitterUrl;
    finalUrl = normalizedNitterUrl;
  }

  if (MediaService.isXUrl(url)) {
    const nitterUrl = MediaService.getNitterRssFeed(url);
    if (nitterUrl) {
      url = nitterUrl;
      finalUrl = nitterUrl;
      isXConversion = true;
    }
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

  const feedData = await loadFeedForPreview(finalUrl);

  return {
    detectedType,
    inputUrl,
    finalUrl,
    isXConversion,
    isMastodonConversion,
    title: feedData.title,
    latestPubDate: feedData.latestPubDate,
    hasEntries: feedData.hasEntries,
  };
}
