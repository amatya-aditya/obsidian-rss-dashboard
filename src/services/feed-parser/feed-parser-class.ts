import {
  Feed,
  FeedItem,
  Folder,
  DisplaySettings,
  MediaSettings,
  Tag,
} from "../../types/types.js";
import { MediaService } from "../media-service.js";
import { MastodonService } from "../mastodon-service.js";
import {
  canonicalizeItemIdentityUrl,
  resolveAbsoluteHttpUrl,
} from "../../utils/url-utils.js";
import { htmlToReadableText } from "../../utils/html-text.js";
import { fetchFeedXml } from "./feed-fetch.js";
import { parseFetchErrorMessage } from "./feed-errors.js";
import { CustomXMLParser } from "./xml-parser/custom-xml-parser.js";
import { assertParsedFeedHasEntries } from "./parsed-feed-assert.js";
import { FEED_REQUEST_TIMEOUT_MS, FEED_SOFT_TIMEOUT_MS } from "../feed-timeout.js";
import { globalFetchSemaphore } from "./fetch-semaphore.js";
import {
  applyFeedRetentionLimits,
  mergeFeedHistoryItems,
  getPubDateMs,
  isProtectedItem,
} from "./feed-retention.js";
import type { FeedParseOptions, ParsedFeed, ParsedItem } from "./types.js";
import { decodeHtmlEntities } from "./xml-parser/xml-html-utils.js";
import { optimizeImageUrl, sanitizeImageUrl } from "../../utils/image-url-utils.js";

const TRACKING_PIXEL_PATTERNS = [
  "tracking/",
  "pixel.gif",
  "beacon.",
  "1x1",
  "/track/",
  "rss-pixel",
];

function isTrackingPixel(url: string): boolean {
  return TRACKING_PIXEL_PATTERNS.some((p) => url.includes(p));
}

export type { FeedParseOptions } from "./types.js";
export class FeedParser {
  private displaySettings: DisplaySettings;
  private mediaSettings: MediaSettings;
  private availableTags: Tag[];
  private parser: CustomXMLParser;
  private getFolders: () => Folder[];
  private getCorsProxyEnabled: () => boolean;

  constructor(
    displaySettings: DisplaySettings,
    availableTags: Tag[],
    mediaSettings?: MediaSettings,
    getFolders: () => Folder[] = () => [],
    getCorsProxyEnabled: () => boolean = () => true,
  ) {
    this.displaySettings = displaySettings;
    this.availableTags = availableTags;
    this.parser = new CustomXMLParser();
    this.getFolders = getFolders;
    this.getCorsProxyEnabled = getCorsProxyEnabled;
    this.mediaSettings = mediaSettings ?? {
      autoTagVideos: true,
      defaultVideoTag: "Video",
      defaultVideoTags: ["Video"],
      rememberPlaybackProgress: true,
      defaultTwitterFolder: "Twitter",
      defaultMastodonFolder: "Mastodon",
      defaultYouTubeFolder: "Videos",
      defaultYouTubeTag: "Video",
      defaultYouTubeTags: ["Video"],
      defaultPodcastFolder: "Podcast",
      defaultPodcastTags: ["Podcast"],
      defaultRssFolder: "RSS",
      defaultRssTag: "",
      defaultRssTags: [],
      defaultSmallwebFolder: "Smallweb",
      defaultSmallwebTag: "",
      defaultSmallwebTags: [],
      defaultTwitterTag: "",
      defaultTwitterTags: [],
      defaultMastodonTag: "",
      defaultMastodonTags: [],
      openInSplitView: true,
      podcastTheme: "obsidian",
      enableApplePodcastsOpen: false,
      defaultPlaySpeed: 1,
    };
  }

  private resolveFeedIconUrl(
    feedLogoCandidates: string[],
    url: string,
    mediaType?: "article" | "video" | "podcast",
  ): string {
    const feedLogoUrl =
      feedLogoCandidates.length > 0 ? feedLogoCandidates[0] : "";

    if (!feedLogoUrl) {
      return "";
    }

    if (mediaType === "video" || MediaService.isYouTubeFeed(url)) {
      // YouTube feeds don't use profile images - always return empty
      return "";
    }

    let resolvedUrl = "";

    if (mediaType === "podcast") {
      resolvedUrl = this.displaySettings.useDomainIconsPodcast
        ? this.convertToAbsoluteUrl(feedLogoUrl, url)
        : "";
    } else if (MastodonService.isResolvedFeedUrl(url)) {
      resolvedUrl = this.displaySettings.useDomainIconsMastodon
        ? this.convertToAbsoluteUrl(feedLogoUrl, url)
        : "";
    } else if (MediaService.isTwitterOrNitterFeed(url)) {
      resolvedUrl = this.displaySettings.useDomainIconsTwitter
        ? this.convertToAbsoluteUrl(feedLogoUrl, url)
        : "";
    } else {
      resolvedUrl = this.displaySettings.useDomainIconsRss
        ? this.convertToAbsoluteUrl(feedLogoUrl, url)
        : "";
    }

    return resolvedUrl.replace(/\.(png|jpe?g|gif|webp|svg|ico)\/+$/i, ".$1");
  }

  private convertToAbsoluteUrl(relativeUrl: string, baseUrl: string): string {
    if (!relativeUrl || !baseUrl) return relativeUrl;

    // Normalize double-encoded URLs before processing
    relativeUrl = this.parser.normalizeUrlEncoding(relativeUrl);

    if (relativeUrl.startsWith("app://")) {
      return relativeUrl.replace("app://", "https://");
    }

    if (relativeUrl.startsWith("//")) {
      return "https:" + relativeUrl;
    }

    if (
      relativeUrl.startsWith("http://") ||
      relativeUrl.startsWith("https://")
    ) {
      return relativeUrl;
    }

    try {
      const base = new URL(baseUrl);

      if (relativeUrl.startsWith("/")) {
        return `${base.protocol}//${base.host}${relativeUrl}`;
      }

      return new URL(relativeUrl, base).href;
    } catch {
      return relativeUrl;
    }
  }

  private convertRelativeUrlsInContent(
    content: string,
    baseUrl: string,
  ): string {
    if (!content || !baseUrl) return content;

    try {
      content = content.replace(/app:\/\//g, "https://");

      content = content.replace(
        /<img([^>]+)src=["']([^"']+)["']/gi,
        (match: string, attributes: string, src: string) => {
          const decodedSrc = this.parser.decodeHtmlEntities(src);
          const absoluteSrc = this.convertToAbsoluteUrl(decodedSrc, baseUrl);
          return `<img${attributes}src="${absoluteSrc}"`;
        },
      );

      content = content.replace(
        /<source([^>]+)srcset=["']([^"']+)["']/gi,
        (match: string, attributes: string, srcset: string) => {
          const processedSrcset = srcset
            .split(",")
            .map((part: string) => {
              const trimmedPart = part.trim();

              const urlMatch = trimmedPart.match(/^([^\s]+)(\s+\d+w)?$/);
              if (urlMatch) {
                const url = urlMatch[1];
                const sizeDescriptor = urlMatch[2] || "";

                const decodedUrl = this.parser.decodeHtmlEntities(url);
                const absoluteUrl = this.convertToAbsoluteUrl(
                  decodedUrl,
                  baseUrl,
                );
                return absoluteUrl + sizeDescriptor;
              }
              return trimmedPart;
            })
            .join(", ");
          return `<source${attributes}srcset="${processedSrcset}"`;
        },
      );

      content = content.replace(
        /<a([^>]+)href=["']([^"']+)["']/gi,
        (match: string, attributes: string, href: string) => {
          const decodedHref = decodeHtmlEntities(href);
          const absoluteHref = this.convertToAbsoluteUrl(decodedHref, baseUrl);
          return `<a${attributes}href="${absoluteHref}"`;
        },
      );

      return content;
    } catch {
      return content;
    }
  }

  private extractCoverImage(html: string, baseUrl = ""): string {
    if (!html) return "";

    /** Reject known junk/placeholder src values before any URL resolution. */
    const isJunkSrc = (src: string | null): boolean => {
      if (!src) return true;
      const t = src.trim();
      return (
        !t ||
        t === "undefined" ||
        t === "null" ||
        t === "#" ||
        t === "about:blank"
      );
    };

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const ogImage = doc.querySelector('meta[property="og:image"]');
      if (ogImage?.getAttribute("content")) {
        const content = ogImage.getAttribute("content");
        // Debug: log og:image URL for troubleshooting double-encoding
        if (content && content.includes("%25")) {
          console.debug(
            `[RSS Dashboard] extractCoverImage: og:image contains double-encoded: ${content}`,
          );
        }
        if (content && content.startsWith("http")) {
          return optimizeImageUrl(content);
        } else if (content && baseUrl) {
          return optimizeImageUrl(this.convertToAbsoluteUrl(content, baseUrl));
        }
      }

      const twitterImage = doc.querySelector('meta[name="twitter:image"]');
      if (twitterImage?.getAttribute("content")) {
        const content = twitterImage.getAttribute("content");
        // Debug: log twitter:image URL for troubleshooting double-encoding
        if (content && content.includes("%25")) {
          console.debug(
            `[RSS Dashboard] extractCoverImage: twitter:image contains double-encoded: ${content}`,
          );
        }
        if (content && content.startsWith("http")) {
          return optimizeImageUrl(content);
        } else if (content && baseUrl) {
          return optimizeImageUrl(this.convertToAbsoluteUrl(content, baseUrl));
        }
      }

      const firstImg = doc.querySelector("img");
      if (firstImg) {
        const src = firstImg.getAttribute("src");
        // Debug: log first img src for troubleshooting double-encoding
        if (src && src.includes("%25")) {
          console.debug(
            `[RSS Dashboard] extractCoverImage: first img src contains double-encoded: ${src}`,
          );
        }
        if (!isJunkSrc(src)) {
          if (src && src.startsWith("http") && !isTrackingPixel(src)) {
            return optimizeImageUrl(src);
          } else if (src && baseUrl && !isTrackingPixel(src)) {
            return optimizeImageUrl(this.convertToAbsoluteUrl(src, baseUrl));
          }
        }
      }

      const imgTags = doc.querySelectorAll("img");
      for (const img of Array.from(imgTags)) {
        const src = img.getAttribute("src");
        // Debug: log each img src for troubleshooting double-encoding
        if (src && src.includes("%25")) {
          console.debug(
            `[RSS Dashboard] extractCoverImage: img src contains double-encoded: ${src}`,
          );
        }
        if (isJunkSrc(src)) continue;
        if (
          src &&
          src.startsWith("http") &&
          (src.endsWith(".jpg") ||
            src.endsWith(".jpeg") ||
            src.endsWith(".png") ||
            src.endsWith(".gif") ||
            src.endsWith(".webp") ||
            src.includes("image")) &&
          !isTrackingPixel(src)
        ) {
          return optimizeImageUrl(src);
        } else if (
          src &&
          baseUrl &&
          (src.endsWith(".jpg") ||
            src.endsWith(".jpeg") ||
            src.endsWith(".png") ||
            src.endsWith(".gif") ||
            src.endsWith(".webp") ||
            src.includes("image")) &&
          !isTrackingPixel(src)
        ) {
          return optimizeImageUrl(this.convertToAbsoluteUrl(src, baseUrl));
        }
      }
    } catch {
      // Image extraction failed
    }

    return "";
  }


  private extractPodcastCoverImage(
    item: ParsedItem,
    feedImage: { url: string } | string | undefined,
    baseUrl: string,
  ): string {
    if (item.itunes?.image?.href) {
      const itunesImage = optimizeImageUrl(
        this.convertToAbsoluteUrl(item.itunes.image.href, baseUrl),
      );
      if (itunesImage) {
        return itunesImage;
      }
    }

    if (item.image?.url) {
      const itemImage = optimizeImageUrl(
        this.convertToAbsoluteUrl(item.image.url, baseUrl),
      );
      if (itemImage) {
        return itemImage;
      }
    }

    if (feedImage) {
      let feedImageUrl = "";
      if (typeof feedImage === "string") {
        feedImageUrl = feedImage;
      } else if (feedImage.url) {
        feedImageUrl = feedImage.url;
      }

      if (feedImageUrl) {
        const convertedUrl = optimizeImageUrl(
          this.convertToAbsoluteUrl(feedImageUrl, baseUrl),
        );
        if (convertedUrl) {
          return convertedUrl;
        }
      }
    }

    const contentImage = this.extractCoverImage(
      item.content || item.description || "",
      baseUrl,
    );
    if (contentImage) {
      return contentImage;
    }

    return "";
  }

  private resolvePodcastCoverImage(
    item: ParsedItem,
    parsed: ParsedFeed,
    baseUrl: string,
  ): string {
    const resolvedImage = this.extractPodcastCoverImage(
      item,
      parsed.image,
      baseUrl,
    );
    if (resolvedImage) {
      return resolvedImage;
    }

    if (parsed.feedItunesImage) {
      return optimizeImageUrl(this.convertToAbsoluteUrl(parsed.feedItunesImage, baseUrl));
    }

    if (parsed.feedImageUrl) {
      return optimizeImageUrl(this.convertToAbsoluteUrl(parsed.feedImageUrl, baseUrl));
    }

    return "";
  }

  private extractSummary(description: string, maxLength = 220): string {
    if (!description) return "";

    try {
      let text = htmlToReadableText(description);
      text = decodeHtmlEntities(text);
      text = text.replace(/\s+/g, " ").trim();

      if (text.length > maxLength) {
        text = text.substring(0, maxLength) + "...";
      }

      return text;
    } catch {
      return "";
    }
  }

  async parseFeed(
    url: string,
    existingFeed: Feed | null = null,
    options?: FeedParseOptions,
  ): Promise<Feed> {
    if (!url) {
      throw new Error("Feed url is required");
    }

    const responseText = await fetchFeedXml(url, this.getCorsProxyEnabled(), options?.signal);
    const parsed = this.parser.parseString(responseText);

    assertParsedFeedHasEntries(parsed, options);

    const feedTitle = existingFeed?.title || parsed.title || "Unnamed feed";

    const newFeed: Feed = existingFeed || {
      title: feedTitle,
      url: url,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
    };

    const resolvedSiteUrl = resolveAbsoluteHttpUrl(parsed.link, url);
    if (resolvedSiteUrl) {
      newFeed.siteUrl = resolvedSiteUrl;
    }

    const existingItems = new Map<string, FeedItem>();
    if (existingFeed) {
      existingFeed.items.forEach((item) => {
        const rawKey = this.convertToAbsoluteUrl(
          item.guid || item.link || "",
          url,
        );
        const key = canonicalizeItemIdentityUrl(rawKey);
        if (key) {
          existingItems.set(key, item);
        }
      });
    }

    const newItems: FeedItem[] = [];
    const updatedItems: FeedItem[] = [];
    const seenGuids = new Set<string>();
    let skippedByRefreshCutoffCount = 0;

    // Compute auto-delete cutoff so we can skip "new" items that are actually
    // old entries re-appearing in the feed after being auto-deleted.
    const autoDeleteDays =
      typeof newFeed.autoDeleteDuration === "number"
        ? newFeed.autoDeleteDuration
        : 0;
    const autoDeleteCutoffMs =
      autoDeleteDays > 0
        ? Date.now() - autoDeleteDays * 24 * 60 * 60 * 1000
        : 0;

    for (const item of parsed.items) {
      const isAudioEnclosure = item.enclosure?.type?.startsWith("audio/");
      const isAudioLink = !!(item.link && item.link.includes(".mp3"));
      const isPodcast = isAudioEnclosure || isAudioLink;

      const audioUrl = isAudioEnclosure
        ? this.convertToAbsoluteUrl(item.enclosure?.url || "", url)
        : isAudioLink
          ? this.convertToAbsoluteUrl(item.link || "", url)
          : undefined;

      const enclosure =
        item.enclosure ||
        (isAudioLink
          ? {
              url: this.convertToAbsoluteUrl(item.link || "", url),
              type: "audio/mpeg",
              length: "",
            }
          : undefined);

      const rawItemGuid = this.convertToAbsoluteUrl(
        item.guid || item.link || "",
        url,
      );
      const itemGuid = canonicalizeItemIdentityUrl(rawItemGuid);
      if (!itemGuid) continue;
      if (seenGuids.has(itemGuid)) continue;
      seenGuids.add(itemGuid);

      const existingItem = existingItems.get(itemGuid);

      if (existingItem) {
        if (
          autoDeleteCutoffMs > 0 &&
          !isProtectedItem(existingItem) &&
          getPubDateMs(item.pubDate || existingItem.pubDate) <=
            autoDeleteCutoffMs
        ) {
          skippedByRefreshCutoffCount++;
          continue;
        }

        let coverImage = existingItem.coverImage;
        if (isPodcast) {
          coverImage =
            this.resolvePodcastCoverImage(item, parsed, url) ||
            existingItem.coverImage;
        } else {
          coverImage = sanitizeImageUrl(
            this.extractCoverImage(
              item.content || item.description || "",
              url,
            ) ||
            optimizeImageUrl(
              this.convertToAbsoluteUrl(
                item.itunes?.image?.href || item.image?.url || "",
                url,
              )
            ) ||
            (item.enclosure?.type?.startsWith("image/")
              ? optimizeImageUrl(this.convertToAbsoluteUrl(item.enclosure.url, url))
              : "")
          ) || existingItem.coverImage;
        }
        const updatedItem: FeedItem = {
          ...existingItem,
          guid: itemGuid,
          link:
            this.convertToAbsoluteUrl(item.link || "", url) ||
            existingItem.link,
          title: item.title || existingItem.title,
          description: this.convertRelativeUrlsInContent(
            item.description || "",
            url,
          ),
          content: this.convertRelativeUrlsInContent(item.content || "", url),
          pubDate: item.pubDate || existingItem.pubDate,
          author: item.author || parsed.author || existingItem.author,
          read: existingItem.read,
          starred: existingItem.starred,
          saved: existingItem.saved,
          savedFilePath: existingItem.savedFilePath,
          feedTitle: newFeed.title, // Update feedTitle to match the new feed title
          coverImage,
          summary:
            this.extractSummary(item.content || item.description || "") ||
            existingItem.summary,
          image: sanitizeImageUrl(
            optimizeImageUrl(
              this.convertToAbsoluteUrl(
                item.itunes?.image?.href || item.image?.url || "",
                url,
              )
            ) ||
            (item.enclosure?.type?.startsWith("image/")
              ? optimizeImageUrl(this.convertToAbsoluteUrl(item.enclosure.url, url))
              : "")
          ) || existingItem.image,
          duration: item.itunes?.duration || existingItem.duration,
          explicit: item.itunes?.explicit === "yes" || existingItem.explicit,
          category: item.itunes?.category || existingItem.category,
          episodeType: item.itunes?.episodeType || existingItem.episodeType,
          season: item.itunes?.season
            ? Number(item.itunes.season)
            : existingItem.season,
          episode: item.itunes?.episode
            ? Number(item.itunes.episode)
            : existingItem.episode,
          enclosure: enclosure ? enclosure : existingItem.enclosure,
          ieee: item.ieee || existingItem.ieee,
          audioUrl: audioUrl ? audioUrl : existingItem.audioUrl,
          mediaContentType:
            item.mediaContentType || existingItem.mediaContentType,
          mediaContentMedium:
            item.mediaContentMedium || existingItem.mediaContentMedium,
          mediaType: isPodcast
            ? "podcast"
            : existingItem.mediaType || "article",
        };
        updatedItems.push(updatedItem);
      } else {
        // Skip items older than the auto-delete cutoff during refresh.
        // These were likely auto-deleted previously and should not reappear as unread.
        if (
          existingFeed &&
          autoDeleteCutoffMs > 0 &&
          getPubDateMs(item.pubDate) <= autoDeleteCutoffMs
        ) {
          skippedByRefreshCutoffCount++;
          continue;
        }

        let coverImage = "";
        if (isPodcast) {
          coverImage = this.resolvePodcastCoverImage(item, parsed, url);
        } else {
          coverImage = sanitizeImageUrl(
            this.extractCoverImage(
              item.content || item.description || "",
              url,
            ) ||
            optimizeImageUrl(
              this.convertToAbsoluteUrl(
                item.itunes?.image?.href || item.image?.url || "",
                url,
              )
            ) ||
            (item.enclosure?.type?.startsWith("image/")
              ? optimizeImageUrl(this.convertToAbsoluteUrl(item.enclosure.url, url))
              : "")
          );
        }
        let image = sanitizeImageUrl(optimizeImageUrl(
          this.convertToAbsoluteUrl(
            item.itunes?.image?.href || item.image?.url || "",
            url,
          )
        ));
        if (!image) {
          image = sanitizeImageUrl(this.extractCoverImage(
            item.content || item.description || "",
            url,
          ));
        }
        if (!image && item.enclosure?.type?.startsWith("image/")) {
          image = sanitizeImageUrl(optimizeImageUrl(this.convertToAbsoluteUrl(item.enclosure.url, url)));
        }
        const summary = this.extractSummary(
          item.content || item.description || "",
        );
        const newItem: FeedItem = {
          title: item.title || "No title",
          link: this.convertToAbsoluteUrl(item.link || "", url),
          description: this.convertRelativeUrlsInContent(
            item.description || "",
            url,
          ),
          content: this.convertRelativeUrlsInContent(item.content || "", url),
          pubDate: item.pubDate || new Date().toISOString(),
          guid: itemGuid,
          read: false,
          starred: false,
          tags: [],
          feedTitle: newFeed.title,
          feedUrl: newFeed.url,
          coverImage,
          summary,
          author: item.author || parsed.author,
          saved: false,
          mediaType: isPodcast ? "podcast" : "article",
          duration: item.itunes?.duration,
          explicit: item.itunes?.explicit === "yes",
          image: image,
          category: item.itunes?.category,
          episodeType: item.itunes?.episodeType,
          season: item.itunes?.season ? Number(item.itunes.season) : undefined,
          episode: item.itunes?.episode
            ? Number(item.itunes.episode)
            : undefined,
          enclosure: enclosure,
          ieee: item.ieee,
          audioUrl: audioUrl,
          mediaContentType: item.mediaContentType,
          mediaContentMedium: item.mediaContentMedium,
        };
        newItems.push(newItem);
      }
    }

    const refreshedItems = [...updatedItems, ...newItems];
    const carriedForward: FeedItem[] = [];
    if (existingFeed) {
      for (const item of existingFeed.items) {
        const rawKey = this.convertToAbsoluteUrl(
          item.guid || item.link || "",
          url,
        );
        const key = canonicalizeItemIdentityUrl(rawKey);
        if (
          key &&
          !seenGuids.has(key) &&
          !(
            autoDeleteCutoffMs > 0 &&
            !isProtectedItem(item) &&
            getPubDateMs(item.pubDate) <= autoDeleteCutoffMs
          )
        ) {
          carriedForward.push(item);
        }
      }
    }

    newFeed.items = mergeFeedHistoryItems(carriedForward, refreshedItems);
    newFeed.lastUpdated = Date.now();

    const mergedItemCountBeforeRetention = newFeed.items.length;

    this.applyFeedLimits(newFeed);

    newFeed.lastRefreshDiagnostics = {
      fetchedItemCount: parsed.items.length,
      mergedItemCountBeforeRetention,
      retainedItemCount: newFeed.items.length,
      retentionRemovedCount: Math.max(
        0,
        mergedItemCountBeforeRetention - newFeed.items.length,
      ),
      skippedByRefreshCutoffCount,
      autoDeleteDurationDays: autoDeleteDays > 0 ? autoDeleteDays : undefined,
    };

    const feedLogoCandidates = [
      parsed.feedItunesImage,
      parsed.feedImageUrl,
      parsed.image && typeof parsed.image === "object" ? parsed.image.url : "",
      typeof parsed.image === "string" ? parsed.image : "",
    ].filter(Boolean);
    const feedLogoUrl =
      feedLogoCandidates.length > 0 ? String(feedLogoCandidates[0]) : "";
    const coverImageCounts: Record<string, number> = {};
    newFeed.items.forEach((item) => {
      if (item.coverImage) {
        coverImageCounts[item.coverImage] =
          (coverImageCounts[item.coverImage] || 0) + 1;
      }
    });
    const totalItems = newFeed.items.length;
    Object.entries(coverImageCounts).forEach(([imgUrl, count]) => {
      if (
        imgUrl &&
        (imgUrl === feedLogoUrl || feedLogoCandidates.includes(imgUrl)) &&
        count >= Math.max(2, Math.floor(totalItems * 0.8))
      ) {
        newFeed.items.forEach((item) => {
          if (item.coverImage === imgUrl && item.mediaType !== "podcast") {
            item.coverImage = "";
          }
        });
      }
    });

    const processedFeed = MediaService.detectAndProcessFeed(newFeed);
    if (processedFeed.mediaType === "video" && !existingFeed?.folder) {
      processedFeed.folder = this.mediaSettings.defaultYouTubeFolder;
    } else if (processedFeed.mediaType === "podcast" && !existingFeed?.folder) {
      processedFeed.folder = this.mediaSettings.defaultPodcastFolder;
    }

    // Store the feed icon URL for display in sidebar
    processedFeed.iconUrl = this.resolveFeedIconUrl(
      feedLogoCandidates.map((candidate) => String(candidate)),
      url,
      processedFeed.mediaType,
    );

    const absoluteFeedLogoUrl = feedLogoUrl
      ? this.convertToAbsoluteUrl(feedLogoUrl, url).replace(/\.(png|jpe?g|gif|webp|svg|ico)\/+$/i, ".$1")
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

    return MediaService.applyMediaTags(
      processedFeed,
      this.availableTags,
      this.mediaSettings,
      this.getFolders(),
    );
  }

  /**
   * Apply maxItemsLimit and autoDeleteDuration to a feed's items
   */
  private applyFeedLimits(feed: Feed): void {
    const updated = applyFeedRetentionLimits(feed);
    feed.items = updated.items;
  }

  async refreshFeed(feed: Feed): Promise<Feed> {
    let timeoutId: number | null = null;
    const abortController = new AbortController();
    try {
      const refreshedFeed = await Promise.race([
        this.parseFeed(feed.url, feed, { signal: abortController.signal }),
        new Promise<Feed>((_, reject) => {
          timeoutId = activeWindow.setTimeout(() => {
            abortController.abort();
            reject(new Error("Timed out"));
          }, FEED_REQUEST_TIMEOUT_MS);
        }),
      ]);
      // Clear any previous error on successful refresh
      refreshedFeed.lastFetchError = undefined;
      return refreshedFeed;
    } catch (error) {
      console.error(
        `[RSS dashboard] Error parsing feed ${feed.title} (${feed.url}):`,
        error,
      );
      // Persist the clean error message so the sidebar can show the badge
      feed.lastFetchError = parseFetchErrorMessage(error);
      return feed;
    } finally {
      if (timeoutId !== null) {
        activeWindow.clearTimeout(timeoutId);
      }
    }
  }

  async refreshAllFeeds(feeds: Feed[]): Promise<Feed[]> {
    const updatedFeeds: Feed[] = [];
    const queueProcessorsCount = 2;
    const queue = [...feeds];
    const backgroundPromises: Promise<void>[] = [];

    const worker = async () => {
      while (queue.length > 0) {
        await globalFetchSemaphore.acquire();

        const feed = queue.shift();
        if (!feed) {
          globalFetchSemaphore.release();
          continue;
        }

        const fetchPromise = this.refreshFeed(feed)
          .then((refreshedFeed) => {
            updatedFeeds.push(refreshedFeed);
          })
          .catch((error) => {
            console.error(
              `[RSS dashboard] Error refreshing feed ${feed.title}:`,
              error,
            );
            updatedFeeds.push(feed);
          })
          .finally(() => {
            globalFetchSemaphore.release();
          });

        const softTimeoutPromise = new Promise<void>((resolve) => {
          activeWindow.setTimeout(() => resolve(), FEED_SOFT_TIMEOUT_MS);
        });

        const winner = await Promise.race([
          fetchPromise.then(() => "fetch"),
          softTimeoutPromise.then(() => "timeout"),
        ]);

        if (winner === "timeout") {
          backgroundPromises.push(fetchPromise);
        }
      }
    };

    const workers = Array(Math.min(queueProcessorsCount, feeds.length))
      .fill(0)
      .map(() => worker());
      
    await Promise.all(workers);
    await Promise.all(backgroundPromises);

    return updatedFeeds;
  }
}
