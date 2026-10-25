import type {
  Feed,
  FeedItem,
  FreshRssConnectionStatus,
  MediaSettings,
  RssDashboardSettings,
} from "../types/types";
import type { DeepPartial } from "../types/deep-partial";
import {
  DEFAULT_SETTINGS,
  IMAGE_CACHE_LIMIT_MAX_MIB,
  IMAGE_CACHE_LIMIT_MIN_MIB,
} from "../types/types";
import {
  migrateDisplaySettings,
  migrateDefaultFilterToDashboardMultiFilters,
  migrateKeywordRulesSettings,
  migrateMediaVideoTagSettings,
  migrateMediaDefaultTagArrays,
  removeObsoleteSettingsKeys,
} from "./settings-migration";
import { migrateSaveVersionSetting } from "./save-version";
import { normalizeTagChipRadius, repairTagChipRadius } from "./tag-chip-radius";
import { canonicalizeItemIdentityUrl } from "./url-utils";
import { normalizeRefreshIntervalMinutes } from "./validation";
import {
  getEffectiveDateMs,
  compareGuidOrdinal,
} from "../services/feed-parser/feed-retention";

const DEFAULT_FEED_KEYWORD_RULES = {
  overrideGlobalRules: false,
  includeLogic: "AND" as const,
  rules: [],
};

const PAGE_SIZE_FIELDS: Array<
  | "allArticlesPageSize"
  | "unreadArticlesPageSize"
  | "readArticlesPageSize"
  | "savedArticlesPageSize"
  | "starredArticlesPageSize"
> = [
  "allArticlesPageSize",
  "unreadArticlesPageSize",
  "readArticlesPageSize",
  "savedArticlesPageSize",
  "starredArticlesPageSize",
];

const FRESH_RSS_CONNECTION_STATUSES: readonly FreshRssConnectionStatus[] = [
  "capability-unavailable",
  "storage-migration-required",
  "credentials-unconfigured",
  "test-required",
  "credentials-rejected",
  "server-unavailable",
  "connected",
];

function isFreshRssConnectionStatus(
  value: unknown,
): value is FreshRssConnectionStatus {
  return (
    typeof value === "string" &&
    FRESH_RSS_CONNECTION_STATUSES.some((status) => status === value)
  );
}

function normalizeFreshRssSettings(
  raw: DeepPartial<RssDashboardSettings>["freshRss"],
): RssDashboardSettings["freshRss"] {
  const status = raw?.status;
  return {
    endpoint:
      typeof raw?.endpoint === "string"
        ? raw.endpoint
        : DEFAULT_SETTINGS.freshRss.endpoint,
    credentialReference:
      typeof raw?.credentialReference === "string"
        ? raw.credentialReference
        : DEFAULT_SETTINGS.freshRss.credentialReference,
    status: isFreshRssConnectionStatus(status)
      ? status
      : DEFAULT_SETTINGS.freshRss.status,
    stateSyncMode:
      raw?.stateSyncMode === "receive-only" ? "receive-only" : "two-way",
  };
}

/**
 * Infer the legacy storage mode on an existing install whose persisted data
 * predates the `storageMode` field: feeds or a positive refresh timestamp mean
 * legacy JSON, not the fresh-install default. A stored value always wins.
 * @param {RssDashboardSettings} settings Settings being normalized
 * @param {DeepPartial<RssDashboardSettings> | null} [rawData] Raw persisted data
 */
function applyLegacyStorageMode(
  settings: RssDashboardSettings,
  rawData?: DeepPartial<RssDashboardSettings> | null,
): void {
  if (!rawData?.storageMode) {
    const hasFeeds = Array.isArray(rawData?.feeds) && rawData.feeds.length > 0;
    const hasRefreshHistory =
      typeof rawData?.lastRefreshTimestamp === "number" &&
      rawData.lastRefreshTimestamp > 0;
    if (hasFeeds || hasRefreshHistory) {
      settings.storageMode = "legacy-json";
    }
  }
}

/**
 * Coerce the scalar settings fields the UI depends on back to their defaults
 * when persisted data is malformed. `refreshInterval` is normalized rather
 * than only defaulted, so a stored fractional or negative value is repaired.
 * @param {RssDashboardSettings} settings Settings being normalized
 */
function normalizeScalarFields(settings: RssDashboardSettings): void {
  const normalizedRefreshInterval = Number(settings.refreshInterval);
  settings.refreshInterval = Number.isFinite(normalizedRefreshInterval)
    ? normalizeRefreshIntervalMinutes(normalizedRefreshInterval)
    : DEFAULT_SETTINGS.refreshInterval;

  if (
    !Number.isFinite(settings.lastGlobalRefreshCompletedAt) ||
    settings.lastGlobalRefreshCompletedAt < 0
  ) {
    settings.lastGlobalRefreshCompletedAt =
      DEFAULT_SETTINGS.lastGlobalRefreshCompletedAt;
  }

  if (
    typeof settings.startupRefreshDelaySeconds !== "number" ||
    settings.startupRefreshDelaySeconds < 0
  ) {
    settings.startupRefreshDelaySeconds =
      DEFAULT_SETTINGS.startupRefreshDelaySeconds;
  }

  if (typeof settings.defaultAutoDeleteDuration !== "number") {
    settings.defaultAutoDeleteDuration =
      DEFAULT_SETTINGS.defaultAutoDeleteDuration;
  }

  if (typeof settings.protectStarred !== "boolean") {
    settings.protectStarred = DEFAULT_SETTINGS.protectStarred;
  }
  if (typeof settings.protectSaved !== "boolean") {
    settings.protectSaved = DEFAULT_SETTINGS.protectSaved;
  }
  if (typeof settings.protectTagged !== "boolean") {
    settings.protectTagged = DEFAULT_SETTINGS.protectTagged;
  }
  if (typeof settings.protectUnread !== "boolean") {
    settings.protectUnread = DEFAULT_SETTINGS.protectUnread;
  }
}

/**
 * Default `readerViewLocation`, migrate the removed `external-browser` choice
 * to `main`, and preserve the saved-article location's inherit-vs-override
 * split: an absent `savedArticleOpenLocation` inherits the reader location,
 * while an explicit value is kept as-is (still converting external-browser).
 * @param {RssDashboardSettings} settings Settings being normalized
 * @param {DeepPartial<RssDashboardSettings> | null} [rawData] Raw persisted data
 */
function normalizeReaderLocations(
  settings: RssDashboardSettings,
  rawData?: DeepPartial<RssDashboardSettings> | null,
): void {
  if (!settings.readerViewLocation) {
    settings.readerViewLocation = "right-sidebar";
  }

  // Migrate: external-browser was removed from the location choices; stored
  // values from older versions load as main.
  if ((settings.readerViewLocation as string) === "external-browser") {
    settings.readerViewLocation = "main";
  }

  // Check if savedArticleOpenLocation was provided in raw data (not inherited from defaults)
  const savedArticleLocationProvided =
    rawData?.savedArticleOpenLocation !== undefined;
  if (!savedArticleLocationProvided) {
    // Inherit from readerViewLocation, but also convert external-browser to main
    settings.savedArticleOpenLocation = settings.readerViewLocation;
  }

  // Migrate: convert external-browser to main for saved articles (external browser no longer supported)
  if (
    savedArticleLocationProvided &&
    (rawData?.savedArticleOpenLocation as string | undefined) ===
      "external-browser"
  ) {
    settings.savedArticleOpenLocation = "main";
  }

  if (settings.useWebViewer === undefined) {
    settings.useWebViewer = true;
  }
}

/**
 * Merge the nested setting groups (`articleSaving`, `media`, `display`,
 * `readerFormat`, `keywordRules`, `autoBackup`) with their defaults, and
 * repair the display cache limits and tag-chip radius.
 * @param {RssDashboardSettings} settings Settings being normalized
 */
function normalizeSettingGroups(settings: RssDashboardSettings): void {
  // Copy first so the raw data is not changed, and migrate before the merge:
  // the default `saveVersion` would otherwise hide an old `saveFullContent: false`.
  const rawArticleSaving: Record<string, unknown> = {
    ...settings.articleSaving,
  };
  migrateSaveVersionSetting(rawArticleSaving);
  settings.articleSaving = Object.assign(
    {},
    DEFAULT_SETTINGS.articleSaving,
    rawArticleSaving,
  );

  settings.media = Object.assign(
    {},
    DEFAULT_SETTINGS.media,
    withLegacyYouTubeFocusMode(settings.media),
  );
  if (typeof settings.media.showPodcastChapterMarkers !== "boolean") {
    settings.media.showPodcastChapterMarkers =
      DEFAULT_SETTINGS.media.showPodcastChapterMarkers;
  }
  if (typeof settings.media.showPodcastSleepTimerBand !== "boolean") {
    settings.media.showPodcastSleepTimerBand =
      DEFAULT_SETTINGS.media.showPodcastSleepTimerBand;
  }
  settings.availableTags = Array.isArray(settings.availableTags)
    ? settings.availableTags
    : [...DEFAULT_SETTINGS.availableTags];
  settings.display = Object.assign(
    {},
    DEFAULT_SETTINGS.display,
    settings.display ?? {},
  );
  if (
    !Number.isInteger(settings.display.imageCacheLimitMiB) ||
    settings.display.imageCacheLimitMiB < IMAGE_CACHE_LIMIT_MIN_MIB
  ) {
    settings.display.imageCacheLimitMiB =
      DEFAULT_SETTINGS.display.imageCacheLimitMiB;
  }
  if (settings.display.imageCacheLimitMiB > IMAGE_CACHE_LIMIT_MAX_MIB) {
    settings.display.imageCacheLimitMiB = IMAGE_CACHE_LIMIT_MAX_MIB;
  }
  if (typeof settings.display.imageCacheUnlimited !== "boolean") {
    settings.display.imageCacheUnlimited =
      DEFAULT_SETTINGS.display.imageCacheUnlimited;
  }
  settings.display.tagChipRadius = normalizeTagChipRadius(
    settings.display.tagChipRadius,
  );
  settings.readerFormat = Object.assign(
    {},
    DEFAULT_SETTINGS.readerFormat,
    settings.readerFormat ?? {},
  );
  settings.keywordRules = Object.assign(
    {},
    DEFAULT_SETTINGS.keywordRules,
    settings.keywordRules ?? {},
  );
  settings.autoBackup = Object.assign(
    {},
    DEFAULT_SETTINGS.autoBackup,
    settings.autoBackup ?? {},
  );
}

/**
 * Normalize each feed's `items`/`keywordRules`/limits, and seed a missing
 * refresh-attempt timestamp from the last successful parse.
 * @param {RssDashboardSettings} settings Settings being normalized
 */
function normalizeFeedEntries(settings: RssDashboardSettings): void {
  settings.feeds = Array.isArray(settings.feeds) ? settings.feeds : [];

  for (const feed of settings.feeds) {
    feed.items = Array.isArray(feed.items) ? feed.items : [];

    feed.keywordRules = Object.assign(
      {},
      DEFAULT_FEED_KEYWORD_RULES,
      feed.keywordRules ?? {},
    );

    if (typeof feed.autoDeleteDuration !== "number") {
      feed.autoDeleteDuration = settings.defaultAutoDeleteDuration;
    }

    if (typeof feed.maxItemsLimit !== "number") {
      feed.maxItemsLimit = settings.maxItems;
    }

    if (!Number.isFinite(feed.lastRefreshAttemptCompletedAt)) {
      feed.lastRefreshAttemptCompletedAt =
        Number.isFinite(feed.lastUpdated) && feed.lastUpdated > 0
          ? feed.lastUpdated
          : 0;
    }
  }
}

/**
 * Unify all five page-size fields to the canonical `allArticlesPageSize`
 * value, defaulting an absent or invalid canonical value first.
 * @param {RssDashboardSettings} settings Settings being normalized
 */
function unifyPageSizes(settings: RssDashboardSettings): void {
  const canonicalPageSizeRaw = settings.allArticlesPageSize;
  const canonicalPageSize =
    Number.isFinite(canonicalPageSizeRaw) && canonicalPageSizeRaw >= 0
      ? canonicalPageSizeRaw
      : DEFAULT_SETTINGS.allArticlesPageSize;

  for (const field of PAGE_SIZE_FIELDS) {
    settings[field] = canonicalPageSize;
  }
}

/**
 * Dev builds stored Focus mode as `hideYouTubeDescriptions`. Carry that value
 * across before default-filling, which would otherwise mask a missing
 * `youtubeFocusMode` with `false`. The old key is dropped by
 * `migrateMediaVideoTagSettings`.
 * @param {MediaSettings | undefined} media The raw media settings group
 * @returns {Partial<MediaSettings>} The group with Focus mode carried over
 */
function withLegacyYouTubeFocusMode(
  media: MediaSettings | undefined,
): Partial<MediaSettings> {
  const raw = (media ?? {}) as Partial<MediaSettings> & {
    hideYouTubeDescriptions?: unknown;
    autoTagVideos?: unknown;
  };
  const migrated: Partial<MediaSettings> = { ...raw };
  if (
    typeof raw.youtubeFocusMode !== "boolean" &&
    raw.hideYouTubeDescriptions === true
  ) {
    migrated.youtubeFocusMode = true;
  }
  if (typeof raw.defaultVideoTag !== "string") {
    // Legacy installs stored `autoTagVideos`. Derive the video tag from it
    // before the key is dropped, so a user who turned video auto-tagging off
    // still loads with an empty `defaultVideoTag` (#919).
    migrated.defaultVideoTag = raw.autoTagVideos === false ? "" : "Video";
  }
  return migrated;
}

/**
 * Merge raw persisted settings data over `DEFAULT_SETTINGS` and normalize the
 * result into a well-formed `RssDashboardSettings` object: infers a legacy
 * storage mode when unset but feed/refresh history is present, coerces
 * malformed numeric/boolean fields back to their defaults, fills in nested
 * setting groups (`articleSaving`, `media`, `display`, `readerFormat`,
 * `keywordRules`, `autoBackup`) with their defaults where missing, normalizes
 * each feed's `items`/`keywordRules`/limits, and unifies all page-size
 * fields to the canonical `allArticlesPageSize` value. Does not run the
 * versioned migrations in {@link migrateSettings} — callers typically invoke
 * both when loading persisted data from disk.
 * @param {DeepPartial<RssDashboardSettings> | null} [rawData] Raw settings as loaded from disk, possibly partial, malformed, or absent
 * @returns {RssDashboardSettings} A complete, normalized settings object
 */
export function loadAndNormalizeSettings(
  rawData?: DeepPartial<RssDashboardSettings> | null,
): RssDashboardSettings {
  const settings = Object.assign({}, DEFAULT_SETTINGS, rawData ?? {});
  settings.freshRss = normalizeFreshRssSettings(rawData?.freshRss);

  applyLegacyStorageMode(settings, rawData);
  normalizeScalarFields(settings);
  normalizeReaderLocations(settings, rawData);
  normalizeSettingGroups(settings);
  normalizeFeedEntries(settings);
  unifyPageSizes(settings);

  return settings;
}

/**
 * Run the versioned keyword-rule, media video-tag, media default-tag-array and
 * obsolete-key migrations, and drop a permanent storage-migration dismissal.
 * @param {Record<string, unknown>} settingsUnknown Settings object as a plain record
 * @returns {boolean} true if any migration changed a field
 */
function runSettingsMigrations(
  settingsUnknown: Record<string, unknown>,
): boolean {
  let didChange = false;

  if (migrateKeywordRulesSettings(settingsUnknown)) {
    didChange = true;
  }

  if (migrateMediaVideoTagSettings(settingsUnknown)) {
    didChange = true;
  }

  if (migrateMediaDefaultTagArrays(settingsUnknown)) {
    didChange = true;
  }

  didChange = removeObsoleteSettingsKeys(settingsUnknown) || didChange;

  if (settingsUnknown.storageMigrationDismissedPermanently !== undefined) {
    // A permanent dismissal was consent to stop advertising an optional
    // upgrade, not consent to a deprecation. Drop it so the prompt returns
    // rather than letting these users reach the cutoff unwarned.
    delete settingsUnknown.storageMigrationDismissedPermanently;
    didChange = true;
  }

  return didChange;
}

/**
 * Relocate the deprecated top-level `savePath`, `template` and `addSavedTag`
 * fields into `articleSaving`.
 * @param {RssDashboardSettings} settings Settings object to migrate in place
 * @param {Record<string, unknown>} settingsUnknown The same object as a plain record
 * @returns {boolean} true if any field was relocated
 */
function migrateLegacyArticleSavingFields(
  settings: RssDashboardSettings,
  settingsUnknown: Record<string, unknown>,
): boolean {
  let didChange = false;

  if (settingsUnknown.savePath !== undefined) {
    settings.articleSaving = Object.assign(
      {},
      DEFAULT_SETTINGS.articleSaving,
      settings.articleSaving ?? {},
    );
    settings.articleSaving.defaultFolder =
      typeof settingsUnknown.savePath === "string"
        ? settingsUnknown.savePath
        : DEFAULT_SETTINGS.articleSaving.defaultFolder;
    delete settingsUnknown.savePath;
    didChange = true;
  }

  if (settingsUnknown.template !== undefined) {
    settings.articleSaving = Object.assign(
      {},
      DEFAULT_SETTINGS.articleSaving,
      settings.articleSaving ?? {},
    );
    settings.articleSaving.defaultTemplate =
      typeof settingsUnknown.template === "string"
        ? settingsUnknown.template
        : DEFAULT_SETTINGS.articleSaving.defaultTemplate;
    delete settingsUnknown.template;
    didChange = true;
  }

  if (settingsUnknown.addSavedTag !== undefined) {
    settings.articleSaving = Object.assign(
      {},
      DEFAULT_SETTINGS.articleSaving,
      settings.articleSaving ?? {},
    );
    settings.articleSaving.addSavedTag = Boolean(settingsUnknown.addSavedTag);
    delete settingsUnknown.addSavedTag;
    didChange = true;
  }

  return didChange;
}

/**
 * Move a nested `articleSaving.template` onto `defaultTemplate` when the
 * latter is still empty, dropping the legacy key.
 * @param {RssDashboardSettings} settings Settings object to migrate in place
 * @returns {boolean} true if the nested template was relocated
 */
function migrateNestedArticleSavingTemplate(
  settings: RssDashboardSettings,
): boolean {
  const articleSavingUnknown = settings.articleSaving as unknown as Record<
    string,
    unknown
  >;
  if (
    articleSavingUnknown.template !== undefined &&
    !settings.articleSaving.defaultTemplate
  ) {
    settings.articleSaving.defaultTemplate =
      typeof articleSavingUnknown.template === "string"
        ? articleSavingUnknown.template
        : DEFAULT_SETTINGS.articleSaving.defaultTemplate;
    delete articleSavingUnknown.template;
    return true;
  }
  return false;
}

/**
 * Merge `display` with its defaults, migrate the legacy `useDomainFavicons`
 * flag to `useDomainIconsRss`, run the display migrations, and repair the
 * cache limits and tag-chip radius an import can leave unusable.
 * @param {RssDashboardSettings} settings Settings object to migrate in place
 * @returns {boolean} true if any display field changed
 */
function normalizeAndMigrateDisplayGroup(
  settings: RssDashboardSettings,
): boolean {
  let didChange = false;

  settings.display = Object.assign(
    {},
    DEFAULT_SETTINGS.display,
    settings.display ?? {},
  );
  const displayUnknown = settings.display as unknown as Record<string, unknown>;
  if (displayUnknown && displayUnknown.useDomainFavicons !== undefined) {
    (settings.display as unknown as Record<string, unknown>).useDomainIconsRss =
      Boolean(displayUnknown.useDomainFavicons);
    delete displayUnknown.useDomainFavicons;
    didChange = true;
  }
  const displayForMigration: Record<string, unknown> = {
    ...settings.display,
  };
  migrateDisplaySettings(displayForMigration);
  Object.assign(settings.display, displayForMigration);
  if (
    !Number.isInteger(settings.display.imageCacheLimitMiB) ||
    settings.display.imageCacheLimitMiB < IMAGE_CACHE_LIMIT_MIN_MIB
  ) {
    settings.display.imageCacheLimitMiB =
      DEFAULT_SETTINGS.display.imageCacheLimitMiB;
    didChange = true;
  }
  if (settings.display.imageCacheLimitMiB > IMAGE_CACHE_LIMIT_MAX_MIB) {
    settings.display.imageCacheLimitMiB = IMAGE_CACHE_LIMIT_MAX_MIB;
    didChange = true;
  }
  if (typeof settings.display.imageCacheUnlimited !== "boolean") {
    settings.display.imageCacheUnlimited =
      DEFAULT_SETTINGS.display.imageCacheUnlimited;
    didChange = true;
  }
  // Import replaces `display` shallowly, so repair a missing or unusable radius here.
  if (repairTagChipRadius(settings.display)) {
    didChange = true;
  }

  return didChange;
}

/**
 * Normalize `dashboardMultiFilters` to string-only status/tag filters with a
 * valid logic value, defaulting the whole group when it is absent.
 * @param {RssDashboardSettings["dashboardMultiFilters"]} filters Filters to normalize
 * @returns {RssDashboardSettings["dashboardMultiFilters"]} A normalized group
 */
function normalizeDashboardMultiFilters(
  filters: RssDashboardSettings["dashboardMultiFilters"],
): RssDashboardSettings["dashboardMultiFilters"] {
  return filters
    ? {
        statusFilters: Array.isArray(filters.statusFilters)
          ? filters.statusFilters.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
        tagFilters: Array.isArray(filters.tagFilters)
          ? filters.tagFilters.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
        logic:
          filters.logic === "AND" || filters.logic === "OR"
            ? filters.logic
            : "OR",
      }
    : { ...DEFAULT_SETTINGS.dashboardMultiFilters };
}

/**
 * Apply in-place data migrations to a settings object that was already
 * loaded and normalized by {@link loadAndNormalizeSettings}: renames and
 * relocates deprecated top-level fields (`savePath`, `template`,
 * `addSavedTag`) into `articleSaving`, migrates keyword-rule, media
 * video-tag, and default-tag-array settings, migrates the legacy
 * `useDomainFavicons` display flag, clamps the image cache limit back into
 * range, normalizes `dashboardMultiFilters`, and folds any legacy default
 * filter into it. Mutates `settings` directly; does not throw on malformed
 * input — unrecognized or invalid values are coerced to defaults instead.
 * @param {RssDashboardSettings} settings Settings object to migrate in place
 * @returns {boolean} true if any field was changed by a migration, false if the settings were already up to date
 */
export function migrateSettings(settings: RssDashboardSettings): boolean {
  let didChange = false;
  const settingsUnknown = settings as unknown as Record<string, unknown>;

  didChange = runSettingsMigrations(settingsUnknown) || didChange;
  // Before the legacy-field step, which merges defaults into the group.
  if (settings.articleSaving) {
    didChange =
      migrateSaveVersionSetting(
        settings.articleSaving as unknown as Record<string, unknown>,
      ) || didChange;
  }
  didChange =
    migrateLegacyArticleSavingFields(settings, settingsUnknown) || didChange;
  didChange = migrateNestedArticleSavingTemplate(settings) || didChange;
  didChange = normalizeAndMigrateDisplayGroup(settings) || didChange;

  settings.keywordRules = Object.assign(
    {},
    DEFAULT_SETTINGS.keywordRules,
    settings.keywordRules ?? {},
  );

  settings.dashboardMultiFilters = normalizeDashboardMultiFilters(
    settings.dashboardMultiFilters,
  );

  migrateDefaultFilterToDashboardMultiFilters(
    settings.display,
    settings.dashboardMultiFilters,
  );

  settings.feeds = Array.isArray(settings.feeds) ? settings.feeds : [];
  settings.feeds.forEach((feed) => {
    feed.keywordRules = Object.assign(
      {},
      DEFAULT_FEED_KEYWORD_RULES,
      feed.keywordRules ?? {},
    );
  });

  settings.autoBackup = Object.assign(
    {},
    DEFAULT_SETTINGS.autoBackup,
    settings.autoBackup ?? {},
  );

  return didChange;
}

/**
 * Newest-first comparator over the item's effective date, falling back to the
 * guid ordinal for tied or missing dates.
 * @param {FeedItem} a First item
 * @param {FeedItem} b Second item
 * @param {boolean} useFirstSeenDateFallback Whether to use `firstSeenMs` when no pubDate parses
 * @returns {number} Negative when `a` sorts before `b`
 */
function byNewest(
  a: FeedItem,
  b: FeedItem,
  useFirstSeenDateFallback: boolean,
): number {
  const aMs = getEffectiveDateMs(a, useFirstSeenDateFallback);
  const bMs = getEffectiveDateMs(b, useFirstSeenDateFallback);
  if (aMs !== bMs) return bMs - aMs;
  return compareGuidOrdinal(a.guid || "", b.guid || "");
}

/**
 * Pick the longer of two strings, preferring `a` (and `b`'s raw value) on a
 * tie or when either side is blank.
 * @param {string} a First candidate
 * @param {string} b Second candidate
 * @returns {string} The chosen value
 */
function pickLonger(a: string, b: string): string {
  const aTrim = (a ?? "").trim();
  const bTrim = (b ?? "").trim();
  if (!aTrim) return bTrim ? b : a;
  if (!bTrim) return a;
  return bTrim.length > aTrim.length ? b : a;
}

/**
 * Pick the longer of two optional strings.
 * @param {string} [a] First candidate
 * @param {string} [b] Second candidate
 * @returns {string | undefined} The chosen value
 */
function pickLongerOptional(a?: string, b?: string): string | undefined {
  const aTrim = (a ?? "").trim();
  const bTrim = (b ?? "").trim();
  if (!aTrim && !bTrim) return a ?? b;
  if (!aTrim) return b;
  if (!bTrim) return a;
  return bTrim.length > aTrim.length ? b : a;
}

/**
 * Union two tag arrays, dropping duplicates by lowercased name and keeping the
 * first tag seen for each name.
 * @param {FeedItem["tags"]} a First tag array
 * @param {FeedItem["tags"]} b Second tag array
 * @returns {FeedItem["tags"]} The merged tags
 */
function mergeTags(a: FeedItem["tags"], b: FeedItem["tags"]): FeedItem["tags"] {
  const out: FeedItem["tags"] = [];
  const seen = new Set<string>();
  for (const tag of [...(a || []), ...(b || [])]) {
    const key = (tag?.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * Merge a duplicate pair, keeping `existing`'s identity and order while
 * unioning the user state and keeping the longer or first-wins text fields.
 * @param {FeedItem} existing Item already stored under the key
 * @param {FeedItem} item Duplicate item being merged in
 * @param {string} canonicalKey Canonical identity key for the pair
 * @returns {FeedItem} The merged item
 */
function mergeFeedItemPair(
  existing: FeedItem,
  item: FeedItem,
  canonicalKey: string,
): FeedItem {
  return {
    ...existing,
    guid: canonicalKey || existing.guid,
    read: existing.read || item.read,
    starred: existing.starred || item.starred,
    saved: !!existing.saved || !!item.saved,
    tags: mergeTags(existing.tags, item.tags),
    savedFilePath: existing.savedFilePath || item.savedFilePath,
    title: pickLonger(existing.title, item.title),
    link: existing.link || item.link,
    description: pickLonger(existing.description, item.description),
    content: pickLongerOptional(existing.content, item.content),
    summary: pickLongerOptional(existing.summary, item.summary),
    coverImage: existing.coverImage || item.coverImage,
    // The marker follows whichever cover the merge kept (#1330).
    coverImageFromPage: existing.coverImage
      ? existing.coverImageFromPage
      : item.coverImageFromPage,
    image: existing.image || item.image,
  };
}

/**
 * Collapse one feed's items by canonical identity key and re-sort them
 * newest-first.
 * @param {FeedItem[]} items Items to deduplicate
 * @param {boolean} useFirstSeenDateFallback Whether the sort uses `firstSeenMs`
 * @returns {{ items: FeedItem[]; didChange: boolean }} The merged items and whether anything changed
 */
function dedupeFeedItems(
  items: FeedItem[],
  useFirstSeenDateFallback: boolean,
): { items: FeedItem[]; didChange: boolean } {
  let didChange = false;
  const mergedByKey = new Map<string, FeedItem>();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (!item) {
      didChange = true;
      continue;
    }
    const canonicalKey = canonicalizeItemIdentityUrl(
      item.guid || item.link || "",
    );
    const key = canonicalKey || item.guid || item.link || `__item_${idx}`;

    const existing = mergedByKey.get(key);
    if (!existing) {
      if (canonicalKey && canonicalKey !== item.guid) {
        didChange = true;
      }
      mergedByKey.set(key, {
        ...item,
        guid: canonicalKey || item.guid,
      });
      continue;
    }

    didChange = true;
    mergedByKey.set(key, mergeFeedItemPair(existing, item, canonicalKey));
  }

  const deduped = Array.from(mergedByKey.values());
  if (deduped.length !== items.length) {
    didChange = true;
  }

  deduped.sort((a, b) => byNewest(a, b, useFirstSeenDateFallback));
  return { items: deduped, didChange };
}

/**
 * Deduplicate each feed's items in place, keyed by canonicalized identity
 * URL (falling back to guid/link/index when no canonical URL is available).
 * When two items share a key, the merged item keeps the union of read/
 * starred/saved/tag state, prefers the longer of each item's title/
 * description/content/summary, and keeps whichever image/cover/saved-file
 * path is present. Deduplicated items are re-sorted newest-first by
 * publish date (falling back to guid comparison for ties or missing dates).
 * @param {Feed[]} feeds Feeds whose `items` arrays are deduplicated and re-sorted in place
 * @returns {boolean} true if any feed's items were changed (deduped, re-keyed, or had a nullish entry dropped), false if nothing changed
 */
export function dedupeAndNormalizeFeedItems(
  feeds: Feed[],
  options?: { useFirstSeenDateFallback?: boolean },
): boolean {
  let didChange = false;
  const useFirstSeenDateFallback = options?.useFirstSeenDateFallback ?? false;

  for (const feed of feeds || []) {
    const items = Array.isArray(feed.items) ? feed.items : [];
    if (items.length === 0) {
      continue;
    }

    const deduped = dedupeFeedItems(items, useFirstSeenDateFallback);
    if (deduped.didChange) {
      didChange = true;
    }
    feed.items = deduped.items;
  }

  return didChange;
}
