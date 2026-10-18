import {
  Feed,
  Folder,
  MediaSettings,
  DisplaySettings,
  Tag,
} from "../types/types";
import { isKnownVideoUrl } from "../utils/video-detection";
import { MastodonService } from "./mastodon-service";
import { getYouTubeRssFeed as resolveYouTubeRssFeed } from "./youtube-rss-resolver";
import { getInheritedTagsAndCategory as resolveInheritedTagsAndCategory } from "./media-tag-inheritance";
import { resolveArticleTags } from "../utils/tag-utils";
import { resolveTagObjects } from "../utils/tag-resolver";
import {
  findPodcastAudioUrl,
  findPodcastDuration,
} from "../utils/podcast-text-scan";

export class MediaService {
  private static readonly YOUTUBE_PATTERNS = [
    "youtube.com/feeds/videos.xml",
    "youtube.com/channel/",
    "youtube.com/user/",
    "youtube.com/c/",
    "youtube.com/@",
    "youtube.com/playlist?list=",
    "youtube.com/results?search_query=",
    "youtube.com/watch",
    "youtu.be/",
  ];

  static isYouTubeFeed(url: string): boolean {
    if (!url) return false;
    const normalizedUrl = url.toLowerCase();
    return this.YOUTUBE_PATTERNS.some((pattern) =>
      normalizedUrl.includes(pattern),
    );
  }

  static isXUrl(url: string): boolean {
    const host = this.getNormalizedHostname(url);
    if (!host) return false;
    return this.X_HOSTS.has(host);
  }

  static isNitterUrl(url: string): boolean {
    const host = this.getNormalizedHostname(url);
    if (!host) return false;
    return host === "nitter.net" || host.startsWith("nitter.");
  }

  static isMastodonUrl(url: string): boolean {
    return MastodonService.isMastodonProfileUrl(url);
  }

  static shouldShowFeedIcon(
    feed: Feed,
    displaySettings: DisplaySettings,
  ): boolean {
    if (!feed || !feed.iconUrl) return false;

    if (feed.mediaType === "video" || this.isYouTubeFeed(feed.url)) {
      return false;
    }

    if (feed.mediaType === "podcast") {
      return !!displaySettings.useDomainIconsPodcast;
    }

    if (MastodonService.isResolvedFeedUrl(feed.url)) {
      return !!displaySettings.useDomainIconsMastodon;
    }

    return !!displaySettings.useDomainIconsRss;
  }

  static async getMastodonRssFeed(url: string): Promise<string | null> {
    return MastodonService.resolveProfileFeed(url);
  }

  private static readonly X_HOSTS = new Set([
    "x.com",
    "www.x.com",
    "twitter.com",
    "www.twitter.com",
    "t.co",
    "www.t.co",
  ]);

  private static getNormalizedHostname(url: string): string | null {
    if (!url) return null;
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  static async getYouTubeRssFeed(input: string): Promise<string | null> {
    return resolveYouTubeRssFeed(input);
  }

  static isPodcastFeed(feed: Feed): boolean {
    if (!feed?.items?.length) return false;

    try {
      const audioExt = /\.(mp3|m4a|aac|ogg|opus|wav|flac)(?:\?|$)/i;
      const itemsToCheck = feed.items.slice(0, Math.min(10, feed.items.length));

      let audioLikeCount = 0;
      for (const item of itemsToCheck) {
        const hasAudioEnclosure = !!item.enclosure?.type?.startsWith("audio/");
        const hasAudioUrlInEnclosure = !!(
          item.enclosure?.url && audioExt.test(item.enclosure.url)
        );
        const audioInDescription = !!(
          item.description && this.extractPodcastAudio(item.description)
        );
        const audioInLink = !!(item.link && audioExt.test(item.link));

        if (
          hasAudioEnclosure ||
          hasAudioUrlInEnclosure ||
          audioInDescription ||
          audioInLink
        ) {
          audioLikeCount++;
        }
      }

      return audioLikeCount > 0;
    } catch {
      return false;
    }
  }

  static extractYouTubeVideoId(link: string): string | undefined {
    if (!link) return undefined;

    try {
      const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/e\/|youtube\.com\/user\/[^/]+\/u\/\d+\/videos\/|youtube\.com\/user\/[^/]+\/|youtube\.com\/.*[?&]v=|youtube\.com\/.*[?&]v%3D|youtube\.com\/.+\/|youtube\.com\/(?:user|c)\/[^/]+\/#p\/a\/u\/\d+\/|youtube\.com\/playlist\?list=|youtube\.com\/user\/[^/]+\/videos\/|youtube\.com\/user\/[^/]+\/)([^"&?/\s]{11})/i,
        /(?:youtube\.com\/embed\/|youtube\.com\/v\/|youtu\.be\/)([^"&?/\s]{11})/i,
      ];

      for (const pattern of patterns) {
        const match = link.match(pattern);
        if (match?.[1]?.length === 11) {
          return match[1];
        }
      }
    } catch {
      // Regex matching failed, return undefined
    }

    return undefined;
  }

  static extractPodcastAudio(description: string): string | undefined {
    if (typeof description !== "string" || !description) return undefined;
    return findPodcastAudioUrl(description);
  }

  static extractPodcastDuration(description: string): string | undefined {
    if (typeof description !== "string" || !description) return undefined;
    return findPodcastDuration(description);
  }
  static processYouTubeFeed(feed: Feed): Feed {
    feed.mediaType = "video";

    const updatedItems = feed.items.map((item) => {
      const videoId = this.extractYouTubeVideoId(item.link);

      let thumbnail = item.coverImage;
      if (videoId) {
        const thumbnailUrls = [
          `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
          `https://img.youtube.com/vi/${videoId}/default.jpg`,
        ];

        thumbnail = thumbnailUrls[0] || item.coverImage;
      }

      return {
        ...item,
        mediaType: "video" as const,
        videoId: videoId,
        coverImage: thumbnail || item.coverImage,
        // The thumbnail is the feed's own image, so a page cover it replaces
        // is no longer restorable (#1330).
        coverImageFromPage: videoId ? undefined : item.coverImageFromPage,
      };
    });

    return {
      ...feed,
      items: updatedItems,
    };
  }

  static processPodcastFeed(feed: Feed): Feed {
    feed.mediaType = "podcast";

    const updatedItems = feed.items.map((item) => {
      const audioUrl =
        item.audioUrl ||
        item.enclosure?.url ||
        this.extractPodcastAudio(item.description);
      const duration =
        item.duration ||
        item.itunes?.duration ||
        this.extractPodcastDuration(item.description);

      return {
        ...item,
        mediaType: "podcast" as const,
        audioUrl: audioUrl,
        duration: duration,

        enclosure: item.enclosure,
      };
    });

    return {
      ...feed,
      items: updatedItems,
    };
  }

  static detectAndProcessFeed(feed: Feed): Feed {
    if (this.isYouTubeFeed(feed.url)) {
      return this.processYouTubeFeed(feed);
    }

    const isVideoItem = (item: Feed["items"][number]): boolean => {
      if (item.enclosure?.type?.startsWith("video/") === true) {
        return true;
      }

      if (item.mediaContentType?.startsWith("video/") === true) {
        return true;
      }

      if (item.mediaContentMedium === "video") {
        return true;
      }

      if (item.enclosure?.type?.startsWith("audio/") === true) {
        return false;
      }

      if (item.mediaContentType?.startsWith("audio/") === true) {
        return false;
      }

      if (item.mediaContentMedium === "audio") {
        return false;
      }

      if (item.mediaContentType?.startsWith("image/") === true) {
        // Some feeds (e.g. Bloomberg) attach image media:content as thumbnails
        // even for video articles. Keep URL-based video-route detection as a
        // fallback before classifying these as non-video.
        if (!isKnownVideoUrl(item.link)) {
          return false;
        }
      }

      if (item.mediaContentMedium === "image") {
        // Some feeds mark video entries with image medium for thumbnails.
        // Preserve URL-route fallback for known video links.
        if (!isKnownVideoUrl(item.link)) {
          return false;
        }
      }

      return isKnownVideoUrl(item.link);
    };

    const hasVideo = feed.items.some((item) => isVideoItem(item));
    if (hasVideo) {
      return {
        ...feed,
        mediaType: "video",
        items: feed.items.map((item) => {
          if (item.enclosure?.type?.startsWith("video/")) {
            return {
              ...item,
              mediaType: "video",
              videoUrl: item.enclosure.url,
            };
          }

          if (isVideoItem(item)) {
            return {
              ...item,
              mediaType: "video",
            };
          }

          return {
            ...item,
            mediaType: item.mediaType || "article",
          };
        }),
      };
    }

    if (this.isPodcastFeed(feed)) {
      return this.processPodcastFeed(feed);
    }

    return {
      ...feed,
      mediaType: "article" as const,
      items: feed.items.map((item) => ({
        ...item,
        mediaType: "article" as const,
      })),
    };
  }

  static getAudioPlayerHtml(audioUrl: string, title = ""): string {
    return `
            <div class="rss-dashboard-media-player audio-player">
                <div class="audio-player-title">${title}</div>
                <audio controls preload="metadata">
                    <source src="${audioUrl}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>
        `;
  }

  static getInheritedTagsAndCategory(
    feed: Pick<Feed, "url" | "folder" | "mediaType">,
    availableTags: Tag[],
    mediaSettings?: Partial<
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
    >,
  ): {
    tags: Tag[];
    category?: "video" | "podcast" | "mastodon" | "smallweb" | "rss";
  } {
    return resolveInheritedTagsAndCategory(
      feed,
      availableTags,
      mediaSettings,
      (url) => MediaService.isYouTubeFeed(url),
    );
  }

  static applyMediaTags(
    feed: Feed,
    availableTags: Tag[],
    mediaSettings?: Partial<
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
    >,
    folders?: Folder[],
  ): Feed {
    const safeAvailableTags = Array.isArray(availableTags) ? availableTags : [];
    const { tags: mediaTags, category: tagCategory } =
      this.getInheritedTagsAndCategory(feed, safeAvailableTags, mediaSettings);
    const perFeedTags = resolveTagObjects(
      feed.customTags ?? [],
      safeAvailableTags,
    );

    if (mediaTags.length === 0 && perFeedTags.length === 0 && !feed.folder) {
      return feed;
    }

    const updatedItems = feed.items.map((item) => {
      const shouldTagItem =
        tagCategory === "video"
          ? item.mediaType === "video"
          : tagCategory === "podcast"
            ? item.mediaType === "podcast"
            : tagCategory === "mastodon"
              ? true
              : tagCategory === "smallweb"
                ? true
                : tagCategory === "rss"
                  ? true
                  : false;

      return {
        ...item,
        // TODO (fast-follow): Shard Storage 2.0 Rule Retroactivity
        // Editing an auto-tag rule/folder tag shouldn't retroactively bloat user-state.json.
        // We need to ensure that auto-applied tags only persist to user-state.json for *new* items,
        // or ensure that editing a rule doesn't retroactively rewrite old item states.
        tags: resolveArticleTags(
          item.tags,
          perFeedTags,
          feed.folder,
          folders,
          shouldTagItem ? mediaTags : [],
        ),
      };
    });

    return {
      ...feed,
      items: updatedItems,
    };
  }
}
