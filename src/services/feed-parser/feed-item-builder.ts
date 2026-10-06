import type {
  Feed,
  FeedItem,
  FeedRetentionProtections,
} from "../../types/types.js";
import { canonicalizeItemIdentityUrl } from "../../utils/url-utils.js";
import {
  isLatexFormulaImage,
  optimizeImageUrl,
  sanitizeImageUrl,
} from "../../utils/image-url-utils.js";
import { getEffectiveDateMs, isProtectedItem } from "./feed-retention.js";
import type { ParsedFeed, ParsedItem } from "./types.js";

/**
 * The `FeedParser` helpers the item pipeline calls. They stay methods of
 * `FeedParser` because they read its XML parser, so the pipeline receives
 * them as callbacks. The two host getters are called at the same points as
 * before (per item), never once up front.
 */
export interface FeedItemContext {
  convertToAbsoluteUrl(relativeUrl: string, baseUrl: string): string;
  convertRelativeUrlsInContent(content: string, baseUrl: string): string;
  extractCoverImage(html: string, baseUrl?: string): string;
  extractSummary(description: string): string;
  resolvePodcastCoverImage(
    item: ParsedItem,
    parsed: ParsedFeed,
    baseUrl: string,
  ): string;
  getRetentionProtections(): FeedRetentionProtections;
  getUseFirstSeenDateFallback(): boolean;
}

export interface RefreshedItemsRequest {
  parsed: ParsedFeed;
  feedUrl: string;
  existingFeed: Feed | null;
  newFeed: Feed;
  existingItems: ReadonlyMap<string, FeedItem>;
  autoDeleteCutoffMs: number;
}

export interface RefreshedItems {
  newItems: FeedItem[];
  updatedItems: FeedItem[];
  seenGuids: Set<string>;
  skippedByRefreshCutoffCount: number;
}

interface ItemAudio {
  isPodcast: boolean | undefined;
  audioUrl: string | undefined;
  enclosure: ParsedItem["enclosure"];
}

interface ItemWork {
  item: ParsedItem;
  itemGuid: string;
  audio: ItemAudio;
  request: RefreshedItemsRequest;
}

function sanitizeArticleImageUrl(raw: unknown): string {
  const sanitized = sanitizeImageUrl(raw);
  return isLatexFormulaImage(sanitized) ? "" : sanitized;
}

function firstSanitizedArticleImageUrl(candidates: unknown[]): string {
  for (const candidate of candidates) {
    const sanitized = sanitizeArticleImageUrl(candidate);
    if (sanitized) return sanitized;
  }
  return "";
}

/** The canonical identity key of an item as the feed would give it. */
function itemIdentityKey(
  item: Pick<FeedItem, "guid" | "link">,
  url: string,
  ctx: FeedItemContext,
): string {
  const rawKey = ctx.convertToAbsoluteUrl(item.guid || item.link || "", url);
  return canonicalizeItemIdentityUrl(rawKey);
}

export function indexExistingItems(
  existingFeed: Feed | null,
  url: string,
  ctx: FeedItemContext,
): Map<string, FeedItem> {
  const existingItems = new Map<string, FeedItem>();
  if (existingFeed) {
    existingFeed.items.forEach((item) => {
      const key = itemIdentityKey(item, url, ctx);
      if (key) {
        existingItems.set(key, item);
      }
    });
  }
  return existingItems;
}

function resolveItemAudio(
  item: ParsedItem,
  url: string,
  ctx: FeedItemContext,
): ItemAudio {
  const isAudioEnclosure = item.enclosure?.type?.startsWith("audio/");
  const isAudioLink = !!(item.link && item.link.includes(".mp3"));
  const isPodcast = isAudioEnclosure || isAudioLink;

  const audioUrl = isAudioEnclosure
    ? ctx.convertToAbsoluteUrl(item.enclosure?.url || "", url)
    : isAudioLink
      ? ctx.convertToAbsoluteUrl(item.link || "", url)
      : undefined;

  const enclosure = item.enclosure
    ? {
        ...item.enclosure,
        url: ctx.convertToAbsoluteUrl(item.enclosure.url, url),
      }
    : isAudioLink
      ? {
          url: ctx.convertToAbsoluteUrl(item.link || "", url),
          type: "audio/mpeg",
          length: "",
        }
      : undefined;

  return { isPodcast, audioUrl, enclosure };
}

function itunesImageUrl(
  item: ParsedItem,
  url: string,
  ctx: FeedItemContext,
): string {
  return optimizeImageUrl(
    ctx.convertToAbsoluteUrl(item.itunes?.image?.href || "", url),
  );
}

function itemImageUrl(
  item: ParsedItem,
  url: string,
  ctx: FeedItemContext,
): string {
  return optimizeImageUrl(ctx.convertToAbsoluteUrl(item.image?.url || "", url));
}

function enclosureImageUrl(
  item: ParsedItem,
  url: string,
  ctx: FeedItemContext,
): string {
  return item.enclosure?.type?.startsWith("image/")
    ? optimizeImageUrl(ctx.convertToAbsoluteUrl(item.enclosure.url, url))
    : "";
}

/** Article cover: the image in the content comes first. */
function buildArticleCover(
  item: ParsedItem,
  url: string,
  ctx: FeedItemContext,
): string {
  return firstSanitizedArticleImageUrl([
    ctx.extractCoverImage(item.content || item.description || "", url),
    itunesImageUrl(item, url, ctx),
    itemImageUrl(item, url, ctx),
    enclosureImageUrl(item, url, ctx),
  ]);
}

/** Article card image: the content image comes third. */
function buildArticleImage(
  item: ParsedItem,
  url: string,
  ctx: FeedItemContext,
): string {
  return firstSanitizedArticleImageUrl([
    itunesImageUrl(item, url, ctx),
    itemImageUrl(item, url, ctx),
    ctx.extractCoverImage(item.content || item.description || "", url),
    enclosureImageUrl(item, url, ctx),
  ]);
}

function shouldSkipExistingItem(
  item: ParsedItem,
  existingItem: FeedItem,
  autoDeleteCutoffMs: number,
  ctx: FeedItemContext,
): boolean {
  return (
    autoDeleteCutoffMs > 0 &&
    !isProtectedItem(existingItem, ctx.getRetentionProtections()) &&
    getEffectiveDateMs(
      {
        pubDate: item.pubDate || existingItem.pubDate,
        firstSeenMs: existingItem.firstSeenMs,
      },
      ctx.getUseFirstSeenDateFallback(),
    ) <= autoDeleteCutoffMs
  );
}

// Skip items older than the auto-delete cutoff during refresh.
// These were likely auto-deleted previously and should not reappear as unread.
// If unread items are protected, do not skip them.
function shouldSkipNewItem(
  item: ParsedItem,
  existingFeed: Feed | null,
  autoDeleteCutoffMs: number,
  ctx: FeedItemContext,
): boolean {
  return (
    !!existingFeed &&
    autoDeleteCutoffMs > 0 &&
    !isProtectedItem(
      { read: false } as FeedItem,
      ctx.getRetentionProtections(),
    ) &&
    getEffectiveDateMs(
      { pubDate: item.pubDate, firstSeenMs: Date.now() },
      ctx.getUseFirstSeenDateFallback(),
    ) <= autoDeleteCutoffMs
  );
}

function resolveExistingCoverImage(
  work: ItemWork,
  existingItem: FeedItem,
  ctx: FeedItemContext,
): string {
  const { item, audio, request } = work;
  const url = request.feedUrl;
  if (audio.isPodcast) {
    return (
      ctx.resolvePodcastCoverImage(item, request.parsed, url) ||
      existingItem.coverImage
    );
  }
  return (
    buildArticleCover(item, url, ctx) ||
    sanitizeArticleImageUrl(existingItem.coverImage)
  );
}

type UpdatedItemCore = Pick<
  FeedItem,
  | "guid"
  | "link"
  | "title"
  | "description"
  | "content"
  | "pubDate"
  | "author"
  | "authors"
  | "read"
  | "starred"
  | "saved"
  | "savedFilePath"
  | "feedTitle"
  | "coverImage"
  | "summary"
  | "image"
>;

/**
 * Feed authors replace the stored ones on refresh, except once article metadata
 * was fetched: then `authors` is first-write-wins (#247 slice 5, ADR 0007).
 */
function refreshedAuthors(
  item: ParsedItem,
  existingItem: FeedItem,
): string[] | undefined {
  if (existingItem.metadataFetchedAt) return existingItem.authors;
  return item.authors?.length ? item.authors : existingItem.authors;
}

function buildUpdatedItemCore(
  work: ItemWork,
  existingItem: FeedItem,
  coverImage: string,
  ctx: FeedItemContext,
): UpdatedItemCore {
  const { item, itemGuid, request } = work;
  const url = request.feedUrl;
  return {
    guid: itemGuid,
    link: ctx.convertToAbsoluteUrl(item.link || "", url) || existingItem.link,
    title: item.title || existingItem.title,
    description: ctx.convertRelativeUrlsInContent(item.description || "", url),
    content: ctx.convertRelativeUrlsInContent(item.content || "", url),
    pubDate: item.pubDate || existingItem.pubDate,
    author: item.author || request.parsed.author || existingItem.author,
    authors: refreshedAuthors(item, existingItem),
    read: existingItem.read,
    starred: existingItem.starred,
    saved: existingItem.saved,
    savedFilePath: existingItem.savedFilePath,
    feedTitle: request.newFeed.title, // Update feedTitle to match the new feed title
    coverImage,
    summary:
      ctx.extractSummary(item.content || item.description || "") ||
      existingItem.summary,
    image:
      buildArticleImage(item, url, ctx) ||
      sanitizeArticleImageUrl(existingItem.image),
  };
}

type UpdatedItemItunes = Pick<
  FeedItem,
  "duration" | "explicit" | "category" | "episodeType" | "season" | "episode"
>;

function buildUpdatedItemItunes(
  item: ParsedItem,
  existingItem: FeedItem,
): UpdatedItemItunes {
  return {
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
  };
}

type UpdatedItemMedia = Pick<
  FeedItem,
  | "enclosure"
  | "ieee"
  | "audioUrl"
  | "mediaContentType"
  | "mediaContentMedium"
  | "mediaType"
>;

function buildUpdatedItemMedia(
  item: ParsedItem,
  existingItem: FeedItem,
  audio: ItemAudio,
): UpdatedItemMedia {
  const { isPodcast, audioUrl, enclosure } = audio;
  return {
    enclosure: enclosure ? enclosure : existingItem.enclosure,
    ieee: item.ieee || existingItem.ieee,
    audioUrl: audioUrl ? audioUrl : existingItem.audioUrl,
    mediaContentType: item.mediaContentType || existingItem.mediaContentType,
    mediaContentMedium:
      item.mediaContentMedium || existingItem.mediaContentMedium,
    mediaType: isPodcast ? "podcast" : existingItem.mediaType || "article",
  };
}

function processExistingItem(
  work: ItemWork,
  existingItem: FeedItem,
  acc: RefreshedItems,
  ctx: FeedItemContext,
): void {
  const { item, audio, request } = work;
  if (
    shouldSkipExistingItem(item, existingItem, request.autoDeleteCutoffMs, ctx)
  ) {
    acc.skippedByRefreshCutoffCount++;
    return;
  }

  const coverImage = resolveExistingCoverImage(work, existingItem, ctx);
  const updatedItem: FeedItem = {
    ...existingItem,
    ...buildUpdatedItemCore(work, existingItem, coverImage, ctx),
    ...buildUpdatedItemItunes(item, existingItem),
    ...buildUpdatedItemMedia(item, existingItem, audio),
  };
  acc.updatedItems.push(updatedItem);
}

type NewItemCore = Pick<
  FeedItem,
  | "title"
  | "link"
  | "description"
  | "content"
  | "pubDate"
  | "guid"
  | "read"
  | "starred"
  | "tags"
  | "feedTitle"
  | "feedUrl"
  | "coverImage"
  | "summary"
  | "author"
  | "authors"
  | "saved"
  | "mediaType"
>;

function buildNewItemCore(work: ItemWork, ctx: FeedItemContext): NewItemCore {
  const { item, itemGuid, audio, request } = work;
  const url = request.feedUrl;
  const coverImage = audio.isPodcast
    ? ctx.resolvePodcastCoverImage(item, request.parsed, url)
    : buildArticleCover(item, url, ctx);
  const summary = ctx.extractSummary(item.content || item.description || "");
  return {
    title: item.title || "No title",
    link: ctx.convertToAbsoluteUrl(item.link || "", url),
    description: ctx.convertRelativeUrlsInContent(item.description || "", url),
    content: ctx.convertRelativeUrlsInContent(item.content || "", url),
    pubDate: item.pubDate || "",
    guid: itemGuid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: request.newFeed.title,
    feedUrl: request.newFeed.url,
    coverImage,
    summary,
    author: item.author || request.parsed.author,
    authors: item.authors?.length ? item.authors : undefined,
    saved: false,
    mediaType: audio.isPodcast ? "podcast" : "article",
  };
}

type NewItemItunes = Pick<
  FeedItem,
  | "duration"
  | "explicit"
  | "image"
  | "category"
  | "episodeType"
  | "season"
  | "episode"
>;

function buildNewItemItunes(
  item: ParsedItem,
  url: string,
  ctx: FeedItemContext,
): NewItemItunes {
  const image = buildArticleImage(item, url, ctx);
  return {
    duration: item.itunes?.duration,
    explicit: item.itunes?.explicit === "yes",
    image: image,
    category: item.itunes?.category,
    episodeType: item.itunes?.episodeType,
    season: item.itunes?.season ? Number(item.itunes.season) : undefined,
    episode: item.itunes?.episode ? Number(item.itunes.episode) : undefined,
  };
}

type NewItemMedia = Pick<
  FeedItem,
  "enclosure" | "ieee" | "audioUrl" | "mediaContentType" | "mediaContentMedium"
>;

function buildNewItemMedia(item: ParsedItem, audio: ItemAudio): NewItemMedia {
  return {
    enclosure: audio.enclosure,
    ieee: item.ieee,
    audioUrl: audio.audioUrl,
    mediaContentType: item.mediaContentType,
    mediaContentMedium: item.mediaContentMedium,
  };
}

function processNewItem(
  work: ItemWork,
  acc: RefreshedItems,
  ctx: FeedItemContext,
): void {
  const { item, audio, request } = work;
  if (
    shouldSkipNewItem(
      item,
      request.existingFeed,
      request.autoDeleteCutoffMs,
      ctx,
    )
  ) {
    acc.skippedByRefreshCutoffCount++;
    return;
  }

  const newItem: FeedItem = {
    ...buildNewItemCore(work, ctx),
    ...buildNewItemItunes(item, request.feedUrl, ctx),
    ...buildNewItemMedia(item, audio),
  };
  acc.newItems.push(newItem);
}

function processParsedItem(
  item: ParsedItem,
  request: RefreshedItemsRequest,
  acc: RefreshedItems,
  ctx: FeedItemContext,
): void {
  const audio = resolveItemAudio(item, request.feedUrl, ctx);

  const rawItemGuid = ctx.convertToAbsoluteUrl(
    item.guid || item.link || "",
    request.feedUrl,
  );
  const itemGuid = canonicalizeItemIdentityUrl(rawItemGuid);
  if (!itemGuid) return;
  if (acc.seenGuids.has(itemGuid)) return;
  acc.seenGuids.add(itemGuid);

  const work: ItemWork = { item, itemGuid, audio, request };
  const existingItem = request.existingItems.get(itemGuid);

  if (existingItem) {
    processExistingItem(work, existingItem, acc, ctx);
  } else {
    processNewItem(work, acc, ctx);
  }
}

/**
 * Turns the parsed items into updated items (already stored) and new items,
 * skipping duplicates and, on a refresh, items past the auto-delete cutoff.
 */
export function collectRefreshedItems(
  request: RefreshedItemsRequest,
  ctx: FeedItemContext,
): RefreshedItems {
  const acc: RefreshedItems = {
    newItems: [],
    updatedItems: [],
    seenGuids: new Set<string>(),
    skippedByRefreshCutoffCount: 0,
  };

  for (const item of request.parsed.items) {
    processParsedItem(item, request, acc, ctx);
  }

  return acc;
}

/** Stored items the feed no longer lists, minus those past the cutoff. */
export function collectCarriedForwardItems(
  existingFeed: Feed | null,
  url: string,
  seenGuids: ReadonlySet<string>,
  autoDeleteCutoffMs: number,
  ctx: FeedItemContext,
): FeedItem[] {
  const carriedForward: FeedItem[] = [];
  if (existingFeed) {
    for (const item of existingFeed.items) {
      const key = itemIdentityKey(item, url, ctx);
      if (
        key &&
        !seenGuids.has(key) &&
        !(
          autoDeleteCutoffMs > 0 &&
          !isProtectedItem(item, ctx.getRetentionProtections()) &&
          getEffectiveDateMs(item, ctx.getUseFirstSeenDateFallback()) <=
            autoDeleteCutoffMs
        )
      ) {
        carriedForward.push(item);
      }
    }
  }
  return carriedForward;
}
