import { Feed, MediaSettings, Tag } from "../types/types";
import { MastodonService } from "./mastodon-service";

type MediaTagSettings = Partial<
  Pick<
    MediaSettings,
    | "defaultVideoTag"
    | "defaultVideoTags"
    | "defaultYouTubeTag"
    | "defaultYouTubeTags"
    | "defaultPodcastTags"
    | "defaultMastodonTag"
    | "defaultMastodonTags"
    | "defaultSmallwebFolder"
    | "defaultSmallwebTag"
    | "defaultSmallwebTags"
    | "defaultRssTag"
    | "defaultRssTags"
  >
>;

type MediaTagCategory = "video" | "podcast" | "mastodon" | "smallweb" | "rss";

/**
 * Resolves the auto-tags a feed inherits from the media settings and the feed's
 * media type, plus the category they came from. Extracted verbatim from
 * `MediaService.getInheritedTagsAndCategory` (#1155). The caller supplies the
 * YouTube-URL predicate so this module never imports `media-service`.
 */
export function getInheritedTagsAndCategory(
  feed: Pick<Feed, "url" | "folder" | "mediaType">,
  availableTags: Tag[],
  mediaSettings: MediaTagSettings | undefined,
  isYouTubeFeed: (url: string) => boolean,
): {
  tags: Tag[];
  category?: MediaTagCategory;
} {
  const isMastodon = MastodonService.isResolvedFeedUrl(feed.url);
  const smallwebFolder = mediaSettings?.defaultSmallwebFolder?.trim() || "";
  const isSmallweb = smallwebFolder && feed.folder === smallwebFolder;

  if (!Array.isArray(availableTags) || availableTags.length === 0) {
    return { tags: [] };
  }

  const category = resolveCategory(feed, isMastodon, isSmallweb);
  const mediaTags = resolveMediaTags(
    category,
    feed,
    availableTags,
    mediaSettings,
    isYouTubeFeed,
  );

  return { tags: mediaTags, category };
}

/**
 * The media-type chain of `getInheritedTagsAndCategory`, in its original order:
 * video, podcast, mastodon, smallweb, rss.
 */
function resolveCategory(
  feed: Pick<Feed, "url" | "folder" | "mediaType">,
  isMastodon: boolean,
  isSmallweb: string | boolean,
): MediaTagCategory | undefined {
  if (feed.mediaType === "video") {
    return "video";
  } else if (feed.mediaType === "podcast") {
    return "podcast";
  } else if (isMastodon) {
    return "mastodon";
  } else if (isSmallweb) {
    return "smallweb";
  } else if (!feed.mediaType || feed.mediaType === "article") {
    return "rss";
  }

  return undefined;
}

/**
 * One branch per category, each calling `getConfiguredTagNames` with the same
 * alias and fallback names the original used.
 */
function resolveMediaTags(
  category: MediaTagCategory | undefined,
  feed: Pick<Feed, "url" | "folder" | "mediaType">,
  availableTags: Tag[],
  mediaSettings: MediaTagSettings | undefined,
  isYouTubeFeed: (url: string) => boolean,
): Tag[] {
  if (category === "video") {
    if (isYouTubeFeed(feed.url)) {
      return getConfiguredTagNames(
        availableTags,
        mediaSettings?.defaultYouTubeTags,
        mediaSettings?.defaultYouTubeTag,
        ["Video", "Videos"],
        ["Video", "Videos"],
      );
    } else {
      return getConfiguredTagNames(
        availableTags,
        mediaSettings?.defaultVideoTags,
        mediaSettings?.defaultVideoTag,
        ["Video", "Videos"],
      );
    }
  } else if (category === "podcast") {
    return getConfiguredTagNames(
      availableTags,
      mediaSettings?.defaultPodcastTags,
      undefined,
      ["Podcast", "Podcasts"],
      ["Podcast", "Podcasts"],
    );
  } else if (category === "mastodon") {
    return getConfiguredTagNames(
      availableTags,
      mediaSettings?.defaultMastodonTags,
      mediaSettings?.defaultMastodonTag,
    );
  } else if (category === "smallweb") {
    return getConfiguredTagNames(
      availableTags,
      mediaSettings?.defaultSmallwebTags,
      mediaSettings?.defaultSmallwebTag,
    );
  } else if (category === "rss") {
    return getConfiguredTagNames(
      availableTags,
      mediaSettings?.defaultRssTags,
      mediaSettings?.defaultRssTag,
    );
  }

  return [];
}

function resolveConfiguredTagNames(
  availableTags: Tag[],
  names: Array<string | undefined>,
): Tag[] {
  const seen = new Set<string>();
  const normalizedNames = names
    .map((name) => name?.trim())
    .filter((name): name is string => !!name);

  return availableTags.filter((tag) => {
    if (!normalizedNames.includes(tag.name)) {
      return false;
    }

    if (seen.has(tag.name)) {
      return false;
    }

    seen.add(tag.name);
    return true;
  });
}

function getConfiguredTagNames(
  availableTags: Tag[],
  arrayTags: string[] | undefined,
  legacyTag: string | undefined,
  legacyAliasNames: string[] = [],
  fallbackNamesWhenUnset: string[] = [],
): Tag[] {
  if (!Array.isArray(availableTags) || availableTags.length === 0) {
    return [];
  }

  // A stored array, even an empty one, is the user's choice. An empty array
  // means "no default tag"; only a missing array falls back to the legacy
  // single-tag field or the built-in names.
  if (Array.isArray(arrayTags)) {
    const normalizedArrayTags = arrayTags
      .map((name) => name.trim())
      .filter(
        (name, index, names) =>
          name.length > 0 && names.indexOf(name) === index,
      );
    return resolveConfiguredTagNames(availableTags, normalizedArrayTags);
  }

  const normalizedLegacyTag = legacyTag?.trim();
  if (normalizedLegacyTag) {
    return resolveConfiguredTagNames(availableTags, [
      normalizedLegacyTag,
      ...legacyAliasNames,
    ]);
  }

  return resolveConfiguredTagNames(availableTags, fallbackNamesWhenUnset);
}
