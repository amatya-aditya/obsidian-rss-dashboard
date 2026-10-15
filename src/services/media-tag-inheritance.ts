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
 * `MediaService.getInheritedTagsAndCategory` (#1155): the media-type chain
 * stays here and each branch body moves to the `resolve*Tags` helper below.
 * The caller supplies the YouTube-URL predicate so this module never imports
 * `media-service`.
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

  let tagCategory: MediaTagCategory | undefined;
  let mediaTags: Tag[] = [];

  if (feed.mediaType === "video") {
    tagCategory = "video";
    mediaTags = resolveVideoTags(
      feed,
      availableTags,
      mediaSettings,
      isYouTubeFeed,
    );
  } else if (feed.mediaType === "podcast") {
    tagCategory = "podcast";
    mediaTags = resolvePodcastTags(availableTags, mediaSettings);
  } else if (isMastodon) {
    tagCategory = "mastodon";
    mediaTags = resolveMastodonTags(availableTags, mediaSettings);
  } else if (isSmallweb) {
    tagCategory = "smallweb";
    mediaTags = resolveSmallwebTags(availableTags, mediaSettings);
  } else if (!feed.mediaType || feed.mediaType === "article") {
    tagCategory = "rss";
    mediaTags = resolveRssTags(availableTags, mediaSettings);
  }

  return { tags: mediaTags, category: tagCategory };
}

/** The video branch body: YouTube vs non-YouTube settings. */
function resolveVideoTags(
  feed: Pick<Feed, "url" | "folder" | "mediaType">,
  availableTags: Tag[],
  mediaSettings: MediaTagSettings | undefined,
  isYouTubeFeed: (url: string) => boolean,
): Tag[] {
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
}

function resolvePodcastTags(
  availableTags: Tag[],
  mediaSettings: MediaTagSettings | undefined,
): Tag[] {
  return getConfiguredTagNames(
    availableTags,
    mediaSettings?.defaultPodcastTags,
    undefined,
    ["Podcast", "Podcasts"],
    ["Podcast", "Podcasts"],
  );
}

function resolveMastodonTags(
  availableTags: Tag[],
  mediaSettings: MediaTagSettings | undefined,
): Tag[] {
  return getConfiguredTagNames(
    availableTags,
    mediaSettings?.defaultMastodonTags,
    mediaSettings?.defaultMastodonTag,
  );
}

function resolveSmallwebTags(
  availableTags: Tag[],
  mediaSettings: MediaTagSettings | undefined,
): Tag[] {
  return getConfiguredTagNames(
    availableTags,
    mediaSettings?.defaultSmallwebTags,
    mediaSettings?.defaultSmallwebTag,
  );
}

function resolveRssTags(
  availableTags: Tag[],
  mediaSettings: MediaTagSettings | undefined,
): Tag[] {
  return getConfiguredTagNames(
    availableTags,
    mediaSettings?.defaultRssTags,
    mediaSettings?.defaultRssTag,
  );
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
