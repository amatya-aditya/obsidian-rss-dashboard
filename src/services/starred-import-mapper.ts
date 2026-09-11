import type { Feed, FeedItem, Tag } from "../types/types";

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
 * A candidate article to import, with any `label/X` categories resolved to
 * `Tag`s on `item.tags`. `isNewFeed` distinguishes items whose
 * `origin.streamId` matches a feed the user already subscribes to
 * (`isNewFeed: false`) from items whose source feed does not exist locally
 * yet (`isNewFeed: true`, 234-02) — the latter carry `feedSiteUrl` (from
 * `origin.htmlUrl`) so the preview/execute step can create the missing
 * `Feed` record. Entries that can never produce a candidate at all (no
 * `origin.streamId`, or no article URL) are captured separately in the
 * `unimportable` list (234-03) rather than as a candidate. Full-content
 * fetching is deferred to a later 234-* ticket. Re-import dedup/merge
 * (234-05) is handled downstream of this mapper, in
 * `src/services/starred-import-merge.ts` — this module stays unaware of any
 * feed's existing items.
 */
export interface StarredImportCandidate {
  feedUrl: string;
  feedTitle: string;
  item: FeedItem;
  isNewFeed?: boolean;
  feedSiteUrl?: string;
  /**
   * Lowercased names of the tags in `item.tags` that came from this item's
   * Inoreader labels, as resolved by this mapper — never from a tag a user
   * later adds by hand via the per-article tag chip (234-12). Kept separate
   * from `FeedItem` itself (it's candidate metadata, not part of the
   * imported article's own shape) so the "Import labels as tags" toggle
   * (234-11) can filter out exactly these tags at read time without ever
   * touching `item.tags` directly — a manually-added tag's name is never in
   * this set, so it always survives the toggle regardless of its state.
   */
  labelDerivedTagNames?: string[];
}

/**
 * Why an entry could not produce a candidate at all — as opposed to being
 * excluded because its (validly identified) source feed isn't subscribed to
 * locally yet, which is 234-02's "auto-create missing source feeds" concern,
 * not a malformed-entry concern.
 */
export type StarredImportUnimportableReason = "no_source_feed" | "no_article_url";

/**
 * A `starred.json` entry that could not produce a candidate under any
 * circumstance — genuinely malformed, not merely missing a local feed match.
 * Carries enough identifying info to show the user why it was skipped
 * instead of silently dropping it.
 */
export interface StarredImportUnimportableEntry {
  id: string;
  title?: string;
  reason: StarredImportUnimportableReason;
}

export interface StarredImportMapResult {
  candidates: StarredImportCandidate[];
  unimportable: StarredImportUnimportableEntry[];
}

const READ_CATEGORY_SUFFIX = "/state/com.google/read";
const LABEL_CATEGORY_MARKER = "/label/";

/**
 * Default color applied to a label-derived tag that does not already exist in
 * `settings.availableTags`. Matches the fixed default color offered to the
 * user when manually creating a tag elsewhere in the plugin (see the color
 * picker defaults in `src/settings/tabs/tags-settings-tab.ts` and
 * `src/components/sidebar.ts`'s "Add new tag" modal). Kept as a local
 * constant, rather than importing a shared helper, because this module must
 * stay free of any Obsidian API dependency.
 */
export const DEFAULT_LABEL_TAG_COLOR = "#3498db";

/**
 * Strips the Google-Reader-API `feed/` stream-id prefix, if present, so the
 * remaining value can be compared against a plugin `Feed.url`.
 */
function normalizeStreamIdToFeedUrl(streamId: string): string {
  return streamId.startsWith("feed/") ? streamId.slice("feed/".length) : streamId;
}

/**
 * Extracts label names from a starred item's `categories[]`. Only
 * `.../label/X` entries are labels; system-state categories
 * (`.../state/com.google/starred`, `read`, `reading-list`) never match this
 * shape and are left for `isMarkedRead`/the `starred` flag (or ignored
 * entirely, for `reading-list`).
 */
function extractLabelNames(item: StarredJsonItem): string[] {
  const names: string[] = [];
  for (const category of item.categories ?? []) {
    const markerIndex = category.indexOf(LABEL_CATEGORY_MARKER);
    if (markerIndex === -1) continue;

    const raw = category.slice(markerIndex + LABEL_CATEGORY_MARKER.length);
    if (!raw) continue;

    let name = raw;
    try {
      name = decodeURIComponent(raw);
    } catch {
      // Not valid percent-encoding; use the raw label text as-is.
    }
    names.push(name);
  }
  return names;
}

/**
 * Resolves an item's label names to `Tag` objects, preferring the color of
 * an already-known tag (case-insensitive name match) and otherwise falling
 * back to `DEFAULT_LABEL_TAG_COLOR`. `newTagsByLowerName` is shared across a
 * single `mapStarredExportToCandidates` call so that two items referencing
 * the same brand-new label within one import batch get the identical `Tag`
 * object (same color) rather than two independently-colored ones.
 */
function resolveLabelTags(
  item: StarredJsonItem,
  availableTagByLowerName: Map<string, Tag>,
  newTagsByLowerName: Map<string, Tag>,
): Tag[] | undefined {
  const labelNames = extractLabelNames(item);
  if (labelNames.length === 0) return undefined;

  const tags: Tag[] = [];
  const seenLowerNames = new Set<string>();

  for (const name of labelNames) {
    const lowerName = name.toLowerCase();
    if (seenLowerNames.has(lowerName)) continue;
    seenLowerNames.add(lowerName);

    const existingTag = availableTagByLowerName.get(lowerName);
    if (existingTag) {
      tags.push(existingTag);
      continue;
    }

    let newTag = newTagsByLowerName.get(lowerName);
    if (!newTag) {
      newTag = { name, color: DEFAULT_LABEL_TAG_COLOR };
      newTagsByLowerName.set(lowerName, newTag);
    }
    tags.push(newTag);
  }

  return tags;
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

function toFeedItem(
  item: StarredJsonItem,
  feed: Pick<Feed, "url" | "title">,
  tags: Tag[] | undefined,
): FeedItem {
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
    tags,
    feedTitle: feed.title,
    feedUrl: feed.url,
    coverImage: "",
    // Every imported article starts out as an export-only preview (234-09):
    // the reader must show the cached-preview banner and skip its automatic
    // fetch-on-open until the user explicitly requests a fetch, or the
    // opt-in import-time fetch below (234-06) succeeds and clears this.
    starredImportContentState: "unfetched",
    starredImportedAt: Date.now(),
  };
}

/**
 * Maps a parsed `starred.json` export to candidate `FeedItem`s and a
 * parallel list of unimportable entries.
 *
 * Items whose `origin.streamId` (feed URL) already matches one of the
 * caller's currently-known feeds are matched to that feed (`isNewFeed:
 * false`). Items whose source feed is not already subscribed to locally are
 * no longer excluded (234-01's behavior) — they instead become `isNewFeed:
 * true` candidates grouped by their normalized `origin.streamId`, using
 * `origin.title` (falling back to the feed URL) as the feed title and
 * `origin.htmlUrl` as the candidate feed's site URL (234-02).
 *
 * Entries that can never produce a candidate under any circumstance — no
 * `origin.streamId` at all (`no_source_feed`), or neither a `canonical` nor
 * an `alternate` href (`no_article_url`) — are classified into the returned
 * `unimportable` list with a reason, so the caller can surface them instead
 * of silently dropping them (234-03). This is distinct from a well-formed
 * entry whose source feed isn't yet subscribed to: that becomes an
 * `isNewFeed: true` candidate instead, not an unimportable entry.
 *
 * `.../label/X` categories become `Tag` entries on the resulting `FeedItem`
 * (`candidate.item.tags`), reusing the color of a matching entry in
 * `availableTags` (case-insensitive name match) when one exists, or
 * `DEFAULT_LABEL_TAG_COLOR` otherwise. `.../state/com.google/starred` and
 * `.../state/com.google/read` only ever set the `starred`/`read` booleans,
 * and `.../state/com.google/reading-list` is ignored entirely — neither
 * produces a tag.
 *
 * This mapper is pure and has no Obsidian API/plugin-state dependency: it
 * does not mutate `availableTags`. A caller that wants a label not already
 * present in `availableTags` to be added there (so it shows up in the normal
 * tag-filter UI) must do that itself — using the exact `{name, color}` this
 * function already assigned to the candidate's tags — typically in a modal's
 * execute/import step, once the user has confirmed which candidates to
 * import.
 */
export function mapStarredExportToCandidates(
  parsed: StarredJsonExport,
  existingFeeds: Array<Pick<Feed, "url" | "title">>,
  availableTags: readonly Tag[] = [],
): StarredImportMapResult {
  const feedByUrl = new Map(existingFeeds.map((feed) => [feed.url, feed]));
  const newFeedMetaByUrl = new Map<
    string,
    { title: string; siteUrl?: string }
  >();
  const availableTagByLowerName = new Map(
    availableTags.map((tag) => [tag.name.toLowerCase(), tag]),
  );
  const newTagsByLowerName = new Map<string, Tag>();
  const candidates: StarredImportCandidate[] = [];
  const unimportable: StarredImportUnimportableEntry[] = [];

  for (const item of parsed.items ?? []) {
    const streamId = item.origin?.streamId;
    if (!streamId) {
      unimportable.push({
        id: item.id,
        title: item.title,
        reason: "no_source_feed",
      });
      continue;
    }

    if (!pickLink(item)) {
      unimportable.push({
        id: item.id,
        title: item.title,
        reason: "no_article_url",
      });
      continue;
    }

    const tags = resolveLabelTags(
      item,
      availableTagByLowerName,
      newTagsByLowerName,
    );
    const labelDerivedTagNames = tags?.map((tag) => tag.name.toLowerCase());

    const feedUrl = normalizeStreamIdToFeedUrl(streamId);
    const existingFeed = feedByUrl.get(feedUrl);

    if (existingFeed) {
      candidates.push({
        feedUrl: existingFeed.url,
        feedTitle: existingFeed.title,
        item: toFeedItem(item, existingFeed, tags),
        isNewFeed: false,
        labelDerivedTagNames,
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
      item: toFeedItem(
        item,
        { url: feedUrl, title: newFeedMeta.title },
        tags,
      ),
      isNewFeed: true,
      feedSiteUrl: newFeedMeta.siteUrl,
      labelDerivedTagNames,
    });
  }

  return { candidates, unimportable };
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
