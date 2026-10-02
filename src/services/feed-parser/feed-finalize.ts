import type {
  Feed,
  FeedItem,
  FeedRefreshDiagnostics,
  MediaSettings,
} from "../../types/types.js";
import type { ParsedFeed } from "./types.js";

export interface RefreshDiagnosticsInput {
  fetchedItemCount: number;
  mergedItemCountBeforeRetention: number;
  retainedItemCount: number;
  skippedByRefreshCutoffCount: number;
  autoDeleteDays: number;
}

export function buildRefreshDiagnostics(
  input: RefreshDiagnosticsInput,
): FeedRefreshDiagnostics {
  const {
    fetchedItemCount,
    mergedItemCountBeforeRetention,
    retainedItemCount,
    skippedByRefreshCutoffCount,
    autoDeleteDays,
  } = input;
  return {
    fetchedItemCount,
    mergedItemCountBeforeRetention,
    retainedItemCount,
    retentionRemovedCount: Math.max(
      0,
      mergedItemCountBeforeRetention - retainedItemCount,
    ),
    skippedByRefreshCutoffCount,
    autoDeleteDurationDays: autoDeleteDays > 0 ? autoDeleteDays : undefined,
  };
}

/** The feed's logo urls, best first: itunes image, image url, image object, image string. */
export function collectFeedLogoCandidates(parsed: ParsedFeed): string[] {
  return [
    parsed.feedItunesImage,
    parsed.feedImageUrl,
    parsed.image && typeof parsed.image === "object" ? parsed.image.url : "",
    typeof parsed.image === "string" ? parsed.image : "",
  ].filter(Boolean);
}

/** The best logo url, or "" when the feed has none. */
export function firstFeedLogoUrl(feedLogoCandidates: string[]): string {
  return feedLogoCandidates.length > 0 ? String(feedLogoCandidates[0]) : "";
}

/**
 * Clears a cover image that is the feed's logo when most items share it
 * (at least two, and 80% of the items). Podcast episodes keep theirs.
 */
export function clearSharedLogoCoverImages(
  items: FeedItem[],
  feedLogoCandidates: string[],
): void {
  const feedLogoUrl = firstFeedLogoUrl(feedLogoCandidates);
  const coverImageCounts: Record<string, number> = {};
  items.forEach((item) => {
    if (item.coverImage) {
      coverImageCounts[item.coverImage] =
        (coverImageCounts[item.coverImage] || 0) + 1;
    }
  });
  const totalItems = items.length;
  Object.entries(coverImageCounts).forEach(([imgUrl, count]) => {
    if (
      imgUrl &&
      (imgUrl === feedLogoUrl || feedLogoCandidates.includes(imgUrl)) &&
      count >= Math.max(2, Math.floor(totalItems * 0.8))
    ) {
      items.forEach((item) => {
        if (item.coverImage === imgUrl && item.mediaType !== "podcast") {
          item.coverImage = "";
        }
      });
    }
  });
}

/**
 * Files a video or podcast feed under the media-type default folder, but only
 * when the caller never chose one.
 */
export function applyMediaDefaultFolder(
  processedFeed: Feed,
  existingFeed: Feed | null,
  mediaSettings: Pick<
    MediaSettings,
    "defaultYouTubeFolder" | "defaultPodcastFolder"
  >,
): void {
  // "Uncategorized" (or no folder field at all) means the caller never
  // specified a folder, so it's fair game for the media-type default.
  // An explicit "" is different: it means the user picked Root on purpose
  // (via the folder popup's "Root (no folder)" action) and must be left
  // alone, not silently redirected to Videos/Podcast.
  const noFolderSpecified =
    existingFeed?.folder === undefined ||
    existingFeed?.folder === "Uncategorized";
  if (processedFeed.mediaType === "video" && noFolderSpecified) {
    processedFeed.folder = mediaSettings.defaultYouTubeFolder;
  } else if (processedFeed.mediaType === "podcast" && noFolderSpecified) {
    processedFeed.folder = mediaSettings.defaultPodcastFolder;
  }
}

/** Gives every item the feed logo (or, failing that, the feed icon) as its fallback icon. */
export function applyFallbackIcons(
  processedFeed: Feed,
  feedLogoUrl: string,
  feedUrl: string,
  convertToAbsoluteUrl: (relativeUrl: string, baseUrl: string) => string,
): void {
  const absoluteFeedLogoUrl = feedLogoUrl
    ? convertToAbsoluteUrl(feedLogoUrl, feedUrl).replace(
        /\.(png|jpe?g|gif|webp|svg|ico)\/+$/i,
        ".$1",
      )
    : "";

  if (absoluteFeedLogoUrl) {
    processedFeed.items.forEach((item) => {
      item.fallbackIconUrl = absoluteFeedLogoUrl;
    });
  } else if (processedFeed.iconUrl) {
    processedFeed.items.forEach((item) => {
      item.fallbackIconUrl = processedFeed.iconUrl;
    });
  }
}
