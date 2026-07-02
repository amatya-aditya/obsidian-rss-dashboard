import { requestUrl, Notice } from "obsidian";
import {
  Feed,
  Folder,
  MediaSettings,
  DisplaySettings,
  Tag,
} from "../types/types";
import { isKnownVideoUrl } from "../utils/video-detection";
import { MastodonService } from "./mastodon-service";
import { resolveArticleTags } from "../utils/tag-utils";
import { resolveTagObjects } from "../utils/tag-resolver";

export interface YouTubeEmbedConfig {
  videoId: string;
  embedUrl: string;
  watchUrl: string;
  referrerPolicy: "strict-origin-when-cross-origin";
  allow: string;
}

export class MediaService {
  private static resolveConfiguredTagNames(
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

  private static getConfiguredTagNames(
    availableTags: Tag[],
    arrayTags: string[] | undefined,
    legacyTag: string | undefined,
    legacyAliasNames: string[] = [],
    fallbackNamesWhenUnset: string[] = [],
  ): Tag[] {
    if (!Array.isArray(availableTags) || availableTags.length === 0) {
      return [];
    }

    const normalizedArrayTags = Array.isArray(arrayTags)
      ? arrayTags
          .map((name) => name.trim())
          .filter(
            (name, index, names) =>
              name.length > 0 && names.indexOf(name) === index,
          )
      : [];

    if (normalizedArrayTags.length > 0) {
      return this.resolveConfiguredTagNames(availableTags, normalizedArrayTags);
    }

    const normalizedLegacyTag = legacyTag?.trim();
    if (normalizedLegacyTag) {
      return this.resolveConfiguredTagNames(availableTags, [
        normalizedLegacyTag,
        ...legacyAliasNames,
      ]);
    }

    return this.resolveConfiguredTagNames(
      availableTags,
      fallbackNamesWhenUnset,
    );
  }

  static readonly YOUTUBE_EMBED_REFERRER_POLICY =
    "strict-origin-when-cross-origin";
  static readonly YOUTUBE_EMBED_ALLOW =
    "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
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

  static isMastodonUrl(url: string): boolean {
    return MastodonService.isMastodonProfileUrl(url);
  }

  static isTwitterOrNitterFeed(url: string): boolean {
    if (!url) return false;
    if (this.isXUrl(url)) return true;
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname === "nitter.net" || hostname.endsWith(".nitter.net");
    } catch {
      return false;
    }
  }

  static shouldShowFeedIcon(feed: Feed, displaySettings: DisplaySettings): boolean {
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

    if (this.isTwitterOrNitterFeed(feed.url)) {
      return !!displaySettings.useDomainIconsTwitter;
    }

    return !!displaySettings.useDomainIconsRss;
  }

  static async getMastodonRssFeed(url: string): Promise<string | null> {
    return MastodonService.resolveProfileFeed(url);
  }

  static getNitterRssFeed(url: string): string | null {
    const host = this.getNormalizedHostname(url);
    if (!host || !this.X_PROFILE_HOSTS.has(host)) return null;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    const username = parsed.pathname.split("/").filter(Boolean)[0];
    if (!username) return null;

    // Skip if it's a common page like 'home', 'notifications', etc.
    const commonPages = [
      "home",
      "notifications",
      "messages",
      "explore",
      "search",
      "i",
      "settings",
    ];
    if (commonPages.includes(username.toLowerCase())) return null;

    return `https://nitter.net/${username}/rss`;
  }

  private static readonly X_HOSTS = new Set([
    "x.com",
    "www.x.com",
    "twitter.com",
    "www.twitter.com",
    "t.co",
    "www.t.co",
  ]);

  private static readonly X_PROFILE_HOSTS = new Set([
    "x.com",
    "www.x.com",
    "twitter.com",
    "www.twitter.com",
  ]);

  private static getNormalizedHostname(url: string): string | null {
    if (!url) return null;
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Normalize a Nitter profile URL to its RSS endpoint.
   *
   * Examples:
   * - https://nitter.net/alliekmiller -> https://nitter.net/alliekmiller/rss
   * - https://nitter.net/alliekmiller/ -> https://nitter.net/alliekmiller/rss
   * - https://nitter.net/alliekmiller/rss -> https://nitter.net/alliekmiller/rss
   */
  static normalizeNitterUrlToRss(inputUrl: string): string | null {
    if (!inputUrl) return null;

    let parsed: URL;
    try {
      parsed = new URL(inputUrl);
    } catch {
      return null;
    }

    if (!/nitter\.net$/i.test(parsed.hostname)) return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;

    const username = parts[0];
    const commonPages = [
      "home",
      "notifications",
      "messages",
      "explore",
      "search",
      "i",
      "settings",
    ];
    if (commonPages.includes(username.toLowerCase())) return null;

    if (parts.length === 1) {
      return `${parsed.origin}/${username}/rss`;
    }

    if (parts.length === 2 && parts[1].toLowerCase() === "rss") {
      return `${parsed.origin}/${username}/rss`;
    }

    return null;
  }

  private static extractChannelIdFromHtml(html: string): string | null {
    if (!html) return null;

    // 1. Try RSS feed link
    const rssMatch = html.match(
      /href="https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=(UC[\w-]{22})"/,
    );
    if (rssMatch?.[1]) return rssMatch[1];

    // 2. Try canonical link
    const canonicalMatch = html.match(
      /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
    );
    if (canonicalMatch?.[1]) return canonicalMatch[1];

    // 3. Try meta itemprop
    const metaMatch = html.match(
      /<meta itemprop="channelId" content="(UC[\w-]{22})"/,
    );
    if (metaMatch?.[1]) return metaMatch[1];

    // 4. Try other common metadata
    const ogMatch = html.match(
      /<meta property="og:url" content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
    );
    if (ogMatch?.[1]) return ogMatch[1];

    const twitterMatch = html.match(
      /<meta name="twitter:app:url:googleplay" content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
    );
    if (twitterMatch?.[1]) return twitterMatch[1];

    // 5. Fallback to existing broad patterns
    const patterns = [
      /channelId"?\s*:\s*"(UC[\w-]{22})"/,
      /"externalId"\s*:\s*"(UC[\w-]{22})"/,
      /"id"\s*:\s*"(UC[\w-]{22})"/,
      /data-channel-external-id="(UC[\w-]{22})"/,
      /"channelId"\s*:\s*"(UC[\w-]{22})"/,
      /channelId=(UC[\w-]{22})/,
      /"ucid"\s*:\s*"(UC[\w-]{22})"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  static async getYouTubeRssFeed(input: string): Promise<string | null> {
    if (!input) {
      return null;
    }

    let channelId = "";
    let username = "";

    try {
      if (/^UC[\w-]{22}$/.test(input)) {
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${input}`;
      } else if (input.includes("youtube.com/channel/")) {
        const match = input.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
        if (match?.[1]) {
          channelId = match[1];
        }
      } else if (input.includes("@")) {
        let handle = "";
        if (input.includes("youtube.com/@")) {
          handle = input.split("youtube.com/@")[1].split(/[?#/]/)[0];
        } else if (input.startsWith("@")) {
          handle = input.substring(1);
        }

        if (handle) {
          try {
            const response = await requestUrl({
              url: `https://www.youtube.com/@${handle}`,
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              },
            });

            if (!response.text) {
              throw new Error("Empty response from YouTube");
            }

            if (!response.text) {
              throw new Error("Empty response from YouTube");
            }

            const extractedId = this.extractChannelIdFromHtml(response.text);
            if (extractedId) {
              channelId = extractedId;
            }
          } catch (error) {
            console.error(`[YouTube] Error fetching channel:`, error);
            new Notice(
              `Error fetching YouTube channel: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }
      } else if (input.includes("youtube.com/user/")) {
        const match = input.match(/youtube\.com\/user\/([^/?#]+)/);
        if (match?.[1]) {
          username = match[1];
        }
      } else if (input.includes("youtube.com/c/")) {
        const match = input.match(/youtube\.com\/c\/([^/?#]+)/);
        if (match?.[1]) {
          try {
            const response = await requestUrl({
              url: `https://www.youtube.com/c/${match[1]}`,
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              },
            });

            if (!response.text) {
              throw new Error("Empty response from YouTube");
            }

            if (!response.text) {
              throw new Error("Empty response from YouTube");
            }

            const extractedId = this.extractChannelIdFromHtml(response.text);
            if (extractedId) {
              channelId = extractedId;
            }
          } catch (error) {
            console.error(`[YouTube] Error fetching channel:`, error);
            new Notice(
              `Error fetching YouTube channel: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }
      } else if (!/\s/.test(input) && !input.includes("/")) {
        if (!/^UC[\w-]{22}$/.test(input)) {
          username = input;
        }
      }

      if (channelId) {
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      } else if (username) {
        return `https://www.youtube.com/feeds/videos.xml?user=${username}`;
      }
    } catch (error) {
      new Notice(
        `Error processing YouTube feed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    return null;
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
        const _dummy = activeDocument.createElement("div");
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
    if (!description) return undefined;

    try {
      const enclosureMatch = description.match(
        /<enclosure[^>]*url=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i,
      );
      if (enclosureMatch?.[1]) {
        return enclosureMatch[1];
      }

      const audioMatch = description.match(
        /<audio[^>]*src=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i,
      );
      if (audioMatch?.[1]) {
        return audioMatch[1];
      }

      const audioLinkMatch = description.match(
        /href=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i,
      );
      if (audioLinkMatch?.[1]) {
        return audioLinkMatch[1];
      }

      const sourceMatch = description.match(
        /<source[^>]*src=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i,
      );
      if (sourceMatch?.[1]) {
        return sourceMatch[1];
      }
    } catch {
      // Regex matching failed, return undefined
    }

    return undefined;
  }

  static extractPodcastDuration(description: string): string | undefined {
    if (!description) return undefined;

    try {
      const durationMatch =
        description.match(/duration[^0-9]*(\d+:\d+(?::\d+)?)/i) ||
        description.match(/length[^0-9]*(\d+:\d+(?::\d+)?)/i) ||
        description.match(/time[^0-9]*(\d+:\d+(?::\d+)?)/i) ||
        description.match(/(\d+:\d+(?::\d+)?)\s*(?:min|minutes|mins)/i);

      if (durationMatch?.[1]) {
        return durationMatch[1];
      }
    } catch {
      // Regex matching failed, return undefined
    }

    return undefined;
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
        item.enclosure?.url || this.extractPodcastAudio(item.description);
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

  static buildYouTubeEmbed(videoId: string): YouTubeEmbedConfig {
    const normalizedVideoId = videoId.trim();
    const embedParams = new URLSearchParams({
      rel: "0",
      enablejsapi: "1",
    });

    if (
      typeof window !== "undefined" &&
      (window.location.protocol === "http:" ||
        window.location.protocol === "https:")
    ) {
      embedParams.set("origin", window.location.origin);
    }

    return {
      videoId: normalizedVideoId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${normalizedVideoId}?${embedParams.toString()}`,
      watchUrl: `https://www.youtube.com/watch?v=${normalizedVideoId}`,
      referrerPolicy: this.YOUTUBE_EMBED_REFERRER_POLICY,
      allow: this.YOUTUBE_EMBED_ALLOW,
    };
  }

  static getYouTubePlayerHtml(
    videoId: string,
    width = 560,
    height = 315,
  ): string {
    const embed = this.buildYouTubeEmbed(videoId);

    return `
            <div class="rss-dashboard-media-player youtube-player">
                <iframe 
                    width="${width}" 
                    height="${height}" 
                    src="${embed.embedUrl}" 
                    frameborder="0" 
                    referrerpolicy="${embed.referrerPolicy}"
                    allow="${embed.allow}" 
                    allowfullscreen>
                </iframe>
            </div>
        `;
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
        | "defaultTwitterTag"
        | "defaultTwitterTags"
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
    category?:
      | "video"
      | "podcast"
      | "twitter"
      | "mastodon"
      | "smallweb"
      | "rss";
  } {
    const isTwitter = MediaService.isTwitterOrNitterFeed(feed.url);
    const isMastodon = MastodonService.isResolvedFeedUrl(feed.url);
    const smallwebFolder = mediaSettings?.defaultSmallwebFolder?.trim() || "";
    const isSmallweb = smallwebFolder && feed.folder === smallwebFolder;

    if (!Array.isArray(availableTags) || availableTags.length === 0) {
      return { tags: [] };
    }

    let tagCategory:
      | "video"
      | "podcast"
      | "twitter"
      | "mastodon"
      | "smallweb"
      | "rss"
      | undefined;
    let mediaTags: Tag[] = [];

    if (feed.mediaType === "video") {
      tagCategory = "video";
      if (MediaService.isYouTubeFeed(feed.url)) {
        mediaTags = this.getConfiguredTagNames(
          availableTags,
          mediaSettings?.defaultYouTubeTags,
          mediaSettings?.defaultYouTubeTag,
          ["Video", "Videos"],
          ["Video", "Videos"],
        );
      } else {
        mediaTags = this.getConfiguredTagNames(
          availableTags,
          mediaSettings?.defaultVideoTags,
          mediaSettings?.defaultVideoTag,
          ["Video", "Videos"],
        );
      }
    } else if (feed.mediaType === "podcast") {
      tagCategory = "podcast";
      mediaTags = this.getConfiguredTagNames(
        availableTags,
        mediaSettings?.defaultPodcastTags,
        undefined,
        ["Podcast", "Podcasts"],
        ["Podcast", "Podcasts"],
      );
    } else if (isTwitter) {
      tagCategory = "twitter";
      mediaTags = this.getConfiguredTagNames(
        availableTags,
        mediaSettings?.defaultTwitterTags,
        mediaSettings?.defaultTwitterTag,
      );
    } else if (isMastodon) {
      tagCategory = "mastodon";
      mediaTags = this.getConfiguredTagNames(
        availableTags,
        mediaSettings?.defaultMastodonTags,
        mediaSettings?.defaultMastodonTag,
      );
    } else if (isSmallweb) {
      tagCategory = "smallweb";
      mediaTags = this.getConfiguredTagNames(
        availableTags,
        mediaSettings?.defaultSmallwebTags,
        mediaSettings?.defaultSmallwebTag,
      );
    } else if (!feed.mediaType || feed.mediaType === "article") {
      tagCategory = "rss";
      mediaTags = this.getConfiguredTagNames(
        availableTags,
        mediaSettings?.defaultRssTags,
        mediaSettings?.defaultRssTag,
      );
    }

    return { tags: mediaTags, category: tagCategory };
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
        | "defaultTwitterTag"
        | "defaultTwitterTags"
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

    if (
      mediaTags.length === 0 &&
      perFeedTags.length === 0 &&
      !feed.folder
    ) {
      return feed;
    }

    const updatedItems = feed.items.map((item) => {
      const shouldTagItem =
        tagCategory === "video"
          ? item.mediaType === "video"
          : tagCategory === "podcast"
            ? item.mediaType === "podcast"
            : tagCategory === "twitter"
              ? true
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
