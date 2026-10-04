import {
  Feed,
  Folder,
  DisplaySettings,
  MediaSettings,
  Tag,
  FeedRetentionProtections,
} from "../../types/types.js";
import { MediaService } from "../media-service.js";
import { MastodonService } from "../mastodon-service.js";
import { resolveAbsoluteHttpUrl } from "../../utils/url-utils.js";
import { htmlToReadableText } from "../../utils/html-text.js";
import { fetchFeedXml } from "./feed-fetch.js";
import { parseFetchErrorMessage } from "./feed-errors.js";
import { CustomXMLParser } from "./xml-parser/custom-xml-parser.js";
import { assertParsedFeedHasEntries } from "./parsed-feed-assert.js";
import {
  FEED_REQUEST_TIMEOUT_MS,
  FEED_SOFT_TIMEOUT_MS,
} from "../feed-timeout.js";
import { globalFetchSemaphore } from "./fetch-semaphore.js";
import {
  applyFeedRetentionLimits,
  mergeFeedHistoryItems,
} from "./feed-retention.js";
import {
  collectCarriedForwardItems,
  collectRefreshedItems,
  indexExistingItems,
  type FeedItemContext,
} from "./feed-item-builder.js";
import {
  applyFallbackIcons,
  applyMediaDefaultFolder,
  buildRefreshDiagnostics,
  clearSharedLogoCoverImages,
  collectFeedLogoCandidates,
  firstFeedLogoUrl,
} from "./feed-finalize.js";
import type { FeedParseOptions, ParsedFeed, ParsedItem } from "./types.js";
import { decodeHtmlEntities } from "./xml-parser/xml-html-utils.js";
import { optimizeImageUrl } from "../../utils/image-url-utils.js";
import { extractCoverImage } from "./feed-cover-image.js";

export type { FeedParseOptions } from "./types.js";
export class FeedParser {
  private displaySettings: DisplaySettings;
  private mediaSettings: MediaSettings;
  private availableTags: Tag[];
  private parser: CustomXMLParser;
  private getFolders: () => Folder[];
  private getCorsProxyEnabled: () => boolean;
  private getRetentionProtections: () => FeedRetentionProtections;
  private getUseFirstSeenDateFallback: () => boolean;

  constructor(
    displaySettings: DisplaySettings,
    availableTags: Tag[],
    mediaSettings?: MediaSettings,
    getFolders: () => Folder[] = () => [],
    getCorsProxyEnabled: () => boolean = () => true,
    getRetentionProtections: () => FeedRetentionProtections = () => ({
      protectStarred: true,
      protectSaved: true,
      protectTagged: false,
      protectUnread: false,
    }),
    getUseFirstSeenDateFallback: () => boolean = () => false,
  ) {
    this.displaySettings = displaySettings;
    this.availableTags = availableTags;
    this.parser = new CustomXMLParser();
    this.getFolders = getFolders;
    this.getCorsProxyEnabled = getCorsProxyEnabled;
    this.getRetentionProtections = getRetentionProtections;
    this.getUseFirstSeenDateFallback = getUseFirstSeenDateFallback;
    this.mediaSettings = mediaSettings ?? {
      autoTagVideos: true,
      defaultVideoTag: "Video",
      defaultVideoTags: ["Video"],
      rememberPlaybackProgress: true,
      defaultMastodonFolder: "Mastodon",
      defaultYouTubeFolder: "Videos",
      defaultYouTubeTag: "Video",
      defaultYouTubeTags: ["Video"],
      defaultPodcastFolder: "Podcasts",
      defaultPodcastTags: ["Podcast"],
      defaultRssFolder: "RSS",
      defaultRssTag: "",
      defaultRssTags: [],
      defaultSmallwebFolder: "Smallweb",
      defaultSmallwebTag: "",
      defaultSmallwebTags: [],
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
                const url = urlMatch[1] ?? "";
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
          const absoluteHref = decodedHref.startsWith("#")
            ? decodedHref
            : this.convertToAbsoluteUrl(decodedHref, baseUrl);
          return `<a${attributes}href="${absoluteHref}"`;
        },
      );

      return content;
    } catch {
      return content;
    }
  }

  private extractCoverImage(html: string, baseUrl = ""): string {
    return extractCoverImage(html, baseUrl, (relativeUrl, base) =>
      this.convertToAbsoluteUrl(relativeUrl, base),
    );
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
      return optimizeImageUrl(
        this.convertToAbsoluteUrl(parsed.feedItunesImage, baseUrl),
      );
    }

    if (parsed.feedImageUrl) {
      return optimizeImageUrl(
        this.convertToAbsoluteUrl(parsed.feedImageUrl, baseUrl),
      );
    }

    return "";
  }

  private extractSummary(description: string, maxLength = 220): string {
    if (!description) return "";

    try {
      // Replace math spans with a placeholder so raw LaTeX doesn't appear in preview text
      const cleaned = description.replace(
        /<span[^>]+class=["'][^"']*\bmath(?:-container)?\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,
        "[math]",
      );
      let text = htmlToReadableText(cleaned);
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

    const responseText = await fetchFeedXml(
      url,
      this.getCorsProxyEnabled(),
      options?.signal,
      existingFeed?.feedEncoding === "windows-1251"
        ? existingFeed.feedEncoding
        : undefined,
    );
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

    const itemContext = this.getItemContext();
    const existingItems = indexExistingItems(existingFeed, url, itemContext);

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

    const {
      newItems,
      updatedItems,
      seenGuids,
      skippedByRefreshCutoffCount,
    } = collectRefreshedItems(
      {
        parsed,
        feedUrl: url,
        existingFeed,
        newFeed,
        existingItems,
        autoDeleteCutoffMs,
      },
      itemContext,
    );

    const refreshedItems = [...updatedItems, ...newItems];
    const carriedForward = collectCarriedForwardItems(
      existingFeed,
      url,
      seenGuids,
      autoDeleteCutoffMs,
      itemContext,
    );

    newFeed.items = mergeFeedHistoryItems(carriedForward, refreshedItems);
    newFeed.lastUpdated = Date.now();

    const mergedItemCountBeforeRetention = newFeed.items.length;

    this.applyFeedLimits(newFeed);

    newFeed.lastRefreshDiagnostics = buildRefreshDiagnostics({
      fetchedItemCount: parsed.items.length,
      mergedItemCountBeforeRetention,
      retainedItemCount: newFeed.items.length,
      skippedByRefreshCutoffCount,
      autoDeleteDays,
    });

    const feedLogoCandidates = collectFeedLogoCandidates(parsed);
    const feedLogoUrl = firstFeedLogoUrl(feedLogoCandidates);
    clearSharedLogoCoverImages(newFeed.items, feedLogoCandidates);

    const processedFeed = MediaService.detectAndProcessFeed(newFeed);
    applyMediaDefaultFolder(processedFeed, existingFeed, this.mediaSettings);

    // Store the feed icon URL for display in sidebar
    processedFeed.iconUrl = this.resolveFeedIconUrl(
      feedLogoCandidates.map((candidate) => String(candidate)),
      url,
      processedFeed.mediaType,
    );

    applyFallbackIcons(processedFeed, feedLogoUrl, url, (relativeUrl, baseUrl) =>
      this.convertToAbsoluteUrl(relativeUrl, baseUrl),
    );

    return MediaService.applyMediaTags(
      processedFeed,
      this.availableTags,
      this.mediaSettings,
      this.getFolders(),
    );
  }

  /** The helpers the item pipeline calls, bound so they keep reading this parser. */
  private getItemContext(): FeedItemContext {
    return {
      convertToAbsoluteUrl: (relativeUrl, baseUrl) =>
        this.convertToAbsoluteUrl(relativeUrl, baseUrl),
      convertRelativeUrlsInContent: (content, baseUrl) =>
        this.convertRelativeUrlsInContent(content, baseUrl),
      extractCoverImage: (html, baseUrl) => this.extractCoverImage(html, baseUrl),
      extractSummary: (description) => this.extractSummary(description),
      resolvePodcastCoverImage: (item, parsed, baseUrl) =>
        this.resolvePodcastCoverImage(item, parsed, baseUrl),
      getRetentionProtections: () => this.getRetentionProtections(),
      getUseFirstSeenDateFallback: () => this.getUseFirstSeenDateFallback(),
    };
  }

  /**
   * Apply maxItemsLimit and autoDeleteDuration to a feed's items
   */
  private applyFeedLimits(feed: Feed): void {
    const updated = applyFeedRetentionLimits(feed, {
      protections: this.getRetentionProtections(),
      useFirstSeenDateFallback: this.getUseFirstSeenDateFallback(),
    });
    feed.items = updated.items;
  }

  async refreshFeed(
    feed: Feed,
    options?: { signal?: AbortSignal },
  ): Promise<Feed> {
    let timeoutId: number | null = null;
    const abortController = new AbortController();
    let externalAbortHandler: (() => void) | null = null;
    if (options?.signal) {
      if (options.signal.aborted) {
        abortController.abort();
      } else {
        externalAbortHandler = () => {
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }
          abortController.abort();
        };
        options.signal.addEventListener("abort", externalAbortHandler);
      }
    }
    try {
      const refreshedFeed = await Promise.race([
        this.parseFeed(feed.url, feed, { signal: abortController.signal }),
        new Promise<Feed>((_, reject) => {
          timeoutId = window.setTimeout(() => {
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
      if (options?.signal?.aborted) {
        throw error;
      }
      // Persist the clean error message so the sidebar can show the badge
      feed.lastFetchError = parseFetchErrorMessage(error);
      return feed;
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (externalAbortHandler && options?.signal) {
        options.signal.removeEventListener("abort", externalAbortHandler);
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
          window.setTimeout(() => resolve(), FEED_SOFT_TIMEOUT_MS);
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
