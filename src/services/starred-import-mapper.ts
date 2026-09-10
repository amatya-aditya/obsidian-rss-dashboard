import type { Feed, FeedItem } from "../types/types";

/**
 * Shapes for a Google-Reader-API-compatible `starred.json` export
 * (Inoreader "Read later"/starred-items export format).
 *
 * This mapper is intentionally a pure function/class with no network or
 * Obsidian API dependency, so it can be unit tested directly against the
 * exported fixture data. See `test_files/fixtures/starred/starred.json`.
 */
export interface StarredJsonHref {
  href: string;
  type?: string;
}

export interface StarredJsonOrigin {
  streamId?: string;
  title?: string;
  htmlUrl?: string;
}

export interface StarredJsonSummary {
  direction?: string;
  content?: string;
}

export interface StarredJsonItem {
  crawlTimeMsec?: string;
  timestampUsec?: string;
  id: string;
  categories?: string[];
  title?: string;
  published?: number;
  updated?: number;
  starred?: number;
  canonical?: StarredJsonHref[];
  alternate?: StarredJsonHref[];
  summary?: StarredJsonSummary;
  author?: string;
  origin?: StarredJsonOrigin;
}

export interface StarredJsonExport {
  direction?: string;
  id?: string;
  title?: string;
  description?: string;
  updated?: number;
  items: StarredJsonItem[];
}

/**
 * A candidate article to import. `isNewFeed` distinguishes items whose
 * `origin.streamId` matches a feed the user already subscribes to
 * (`isNewFeed: false`) from items whose source feed does not exist locally
 * yet (`isNewFeed: true`, 234-02) — the latter carry `feedSiteUrl` (from
 * `origin.htmlUrl`) so the preview/execute step can create the missing
 * `Feed` record. Surfacing unimportable entries, label-to-tag mapping,
 * re-import dedup, and full-content fetching are all deferred to later
 * 234-* tickets.
 */
export interface StarredImportCandidate {
  feedUrl: string;
  feedTitle: string;
  item: FeedItem;
  isNewFeed?: boolean;
  feedSiteUrl?: string;
}

const READ_CATEGORY_SUFFIX = "/state/com.google/read";

/**
 * Strips the Google-Reader-API `feed/` stream-id prefix, if present, so the
 * remaining value can be compared against a plugin `Feed.url`.
 */
function normalizeStreamIdToFeedUrl(streamId: string): string {
  return streamId.startsWith("feed/") ? streamId.slice("feed/".length) : streamId;
}

function pickLink(item: StarredJsonItem): string {
  const canonicalHref = item.canonical?.[0]?.href;
  if (canonicalHref) return canonicalHref;
  const alternateHref = item.alternate?.[0]?.href;
  if (alternateHref) return alternateHref;
  return "";
}

function isMarkedRead(item: StarredJsonItem): boolean {
  return (item.categories ?? []).some((category) =>
    category.endsWith(READ_CATEGORY_SUFFIX),
  );
}

function toPubDate(item: StarredJsonItem): string {
  if (typeof item.published === "number" && item.published > 0) {
    return new Date(item.published * 1000).toISOString();
  }
  return new Date().toISOString();
}

function toFeedItem(item: StarredJsonItem, feed: Pick<Feed, "url" | "title">): FeedItem {
  const content = item.summary?.content ?? "";

  return {
    title: item.title ?? "",
    link: pickLink(item),
    description: content,
    content,
    pubDate: toPubDate(item),
    guid: item.id,
    author: item.author || undefined,
    starred: true,
    read: isMarkedRead(item),
    feedTitle: feed.title,
    feedUrl: feed.url,
    coverImage: "",
  };
}

/**
 * Maps a parsed `starred.json` export to candidate `FeedItem`s. Items whose
 * `origin.streamId` (feed URL) already matches one of the caller's
 * currently-known feeds are matched to that feed (`isNewFeed: false`).
 * Items whose source feed is not already subscribed to locally are no
 * longer excluded (234-01's behavior) — they instead become `isNewFeed:
 * true` candidates grouped by their normalized `origin.streamId`, using
 * `origin.title` (falling back to the feed URL) as the feed title and
 * `origin.htmlUrl` as the candidate feed's site URL. Only items with no
 * `origin.streamId` at all are excluded. Surfacing why an entry was
 * skipped is deferred to 234-03.
 *
 * Category-based `label/X` entries are read but intentionally ignored here;
 * mapping labels to tags is deferred to 234-04.
 */
export function mapStarredExportToCandidates(
  parsed: StarredJsonExport,
  existingFeeds: Array<Pick<Feed, "url" | "title">>,
): StarredImportCandidate[] {
  const feedByUrl = new Map(existingFeeds.map((feed) => [feed.url, feed]));
  const newFeedMetaByUrl = new Map<
    string,
    { title: string; siteUrl?: string }
  >();
  const candidates: StarredImportCandidate[] = [];

  for (const item of parsed.items ?? []) {
    const streamId = item.origin?.streamId;
    if (!streamId) continue;

    const feedUrl = normalizeStreamIdToFeedUrl(streamId);
    const existingFeed = feedByUrl.get(feedUrl);

    if (existingFeed) {
      candidates.push({
        feedUrl: existingFeed.url,
        feedTitle: existingFeed.title,
        item: toFeedItem(item, existingFeed),
        isNewFeed: false,
      });
      continue;
    }

    if (!newFeedMetaByUrl.has(feedUrl)) {
      newFeedMetaByUrl.set(feedUrl, {
        title: item.origin?.title || feedUrl,
        siteUrl: item.origin?.htmlUrl,
      });
    }
    const newFeedMeta = newFeedMetaByUrl.get(feedUrl);
    if (!newFeedMeta) continue;

    candidates.push({
      feedUrl,
      feedTitle: newFeedMeta.title,
      item: toFeedItem(item, { url: feedUrl, title: newFeedMeta.title }),
      isNewFeed: true,
      feedSiteUrl: newFeedMeta.siteUrl,
    });
  }

  return candidates;
}

/**
 * Builds the candidate `Feed` record for a brand-new source feed selected
 * during import (234-02). Kept separate from `mapStarredExportToCandidates`
 * because the target folder is a user choice made in the preview step, not
 * something the pure mapper can decide.
 */
export function buildNewFeedRecord(args: {
  url: string;
  title: string;
  folder: string;
  siteUrl?: string;
}): Feed {
  const feed: Feed = {
    title: args.title,
    url: args.url,
    folder: args.folder,
    items: [],
    lastUpdated: Date.now(),
  };
  if (args.siteUrl) {
    feed.siteUrl = args.siteUrl;
  }
  return feed;
}
