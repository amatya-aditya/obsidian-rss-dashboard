import type { DisplaySettings } from "../types/types";
import { SIDEBAR_ICON_IDS } from "./sidebar-icon-registry";
import { migrateKeywordRulesSettings as migrateKeywordRulesSettingsImpl } from "./keyword-rules-migration";
import { isRecord } from "./settings-record";

const CANONICAL_ICON_ORDER = [...SIDEBAR_ICON_IDS];

/**
 * Migrates a display settings object in-place, filling in defaults for all
 * new icon-visibility fields introduced in the sidebar icon feature.
 *
 * Operates on a plain Record so it can be tested without Obsidian imports.
 */
export function migrateDisplaySettings(display: Record<string, unknown>): void {
  const booleanDefaults: string[] = [
    "hideIconDiscover",
    "hideIconDivider",
    "hideIconAddFeed",
    "hideIconManageFeeds",
    "hideIconSearch",
    "hideIconTags",
    "hideIconAddFolder",
    "hideIconSort",
    "hideIconCollapseAll",
    "hideIconSettings",
    "hideToolbarEntirely",
    "hideFeedFetchErrorBadges",
    "useDomainIconsRss",
    "useDomainIconsPodcast",
    "useDomainIconsMastodon",
  ];

  for (const field of booleanDefaults) {
    if (display[field] === undefined) {
      display[field] = false;
    }
  }

  if (display.iconOrder === undefined) {
    display.iconOrder = [...CANONICAL_ICON_ORDER];
  } else if (Array.isArray(display.iconOrder)) {
    // Ensure all current canonical icons exist in the order
    for (const id of CANONICAL_ICON_ORDER) {
      if (!display.iconOrder.includes(id)) {
        display.iconOrder.push(id);
      }
    }
  }
}

/**
 * Migrates the legacy `display.defaultFilter` setting into the newer
 * `dashboardMultiFilters` setting, but only when dashboard multi-filters are
 * currently empty.
 *
 * This supports the refactor where the dashboard always opens in All Feeds
 * view (`currentFolder = null`) while multi-filters are applied immediately.
 */
export function migrateDefaultFilterToDashboardMultiFilters(
  display: Record<string, unknown> | DisplaySettings,
  dashboardMultiFilters:
    | Record<string, unknown>
    | {
        statusFilters?: unknown[];
        tagFilters?: unknown[];
        logic?: string;
      },
): void {
  const statusFiltersRaw = (dashboardMultiFilters as Record<string, unknown>)
    .statusFilters;
  const tagFiltersRaw = (dashboardMultiFilters as Record<string, unknown>)
    .tagFilters;

  const statusFilters = Array.isArray(statusFiltersRaw)
    ? statusFiltersRaw.filter((v): v is string => typeof v === "string")
    : [];
  const tagFilters = Array.isArray(tagFiltersRaw)
    ? tagFiltersRaw.filter((v): v is string => typeof v === "string")
    : [];

  const hasAnyFilters = statusFilters.length > 0 || tagFilters.length > 0;
  if (hasAnyFilters) {
    return;
  }

  const defaultFilter = display.defaultFilter;
  if (typeof defaultFilter !== "string") {
    return;
  }

  const eligible = new Set([
    "unread",
    "read",
    "starred",
    "saved",
    "videos",
    "podcasts",
  ]);

  if (!eligible.has(defaultFilter)) {
    return;
  }

  dashboardMultiFilters.statusFilters = [defaultFilter];
  dashboardMultiFilters.tagFilters = [];
  dashboardMultiFilters.logic = "OR";
}

/**
 * Migrates legacy keyword-filter settings keys to the newer keyword-rules keys.
 *
 * - Global: `filters` -> `keywordRules`
 * - Feed: `feed.filters` -> `feed.keywordRules`
 * - Feed override: `overrideGlobalFilters` -> `overrideGlobalRules`
 *
 * Operates on a plain Record so it can be tested without Obsidian imports.
 * Returns true when it made any changes.
 */
export function migrateKeywordRulesSettings(
  settings: Record<string, unknown>,
): boolean {
  return migrateKeywordRulesSettingsImpl(settings);
}

/**
 * Removes settings keys dropped in #919 so an older data.json, or an import
 * bundle that still carries them, does not keep re-writing keys the plugin no
 * longer reads. `media.autoTagVideos` is derived into `defaultVideoTag` before
 * this runs. Returns true when anything was removed.
 */
export function removeObsoleteSettingsKeys(
  settings: Record<string, unknown>,
): boolean {
  let changed = false;
  const media = isRecord(settings.media) ? settings.media : undefined;
  const display = isRecord(settings.display) ? settings.display : undefined;

  if (settings.customProxyUrls !== undefined) {
    delete settings.customProxyUrls;
    changed = true;
  }
  if (media && media.autoTagVideos !== undefined) {
    delete media.autoTagVideos;
    changed = true;
  }
  if (media && media.openInSplitView !== undefined) {
    delete media.openInSplitView;
    changed = true;
  }
  if (display && display.useDomainIconsYouTube !== undefined) {
    delete display.useDomainIconsYouTube;
    changed = true;
  }
  return changed;
}

export function migrateMediaVideoTagSettings(
  settings: Record<string, unknown>,
): boolean {
  let changed = false;

  // Defensive: ensure settings.media is a record
  if (!isRecord(settings.media)) {
    settings.media = {};
    changed = true;
  }

  const media = settings.media as Record<string, unknown>;
  if (typeof media.defaultVideoTag !== "string") {
    // Legacy installs stored `autoTagVideos`. It is no longer a setting, but
    // keep reading it from raw data so a user who turned video auto-tagging
    // off still loads with an empty `defaultVideoTag` (#919).
    if (media.autoTagVideos === false) {
      media.defaultVideoTag = "";
    } else {
      media.defaultVideoTag = "Video";
    }
    changed = true;
  }

  if (typeof media.rememberPlaybackProgress !== "boolean") {
    media.rememberPlaybackProgress = true;
    changed = true;
  }

  if (typeof media.youtubeFocusMode !== "boolean") {
    media.youtubeFocusMode = false;
    changed = true;
  }
  if ("hideYouTubeDescriptions" in media) {
    delete (media as { hideYouTubeDescriptions?: unknown })
      .hideYouTubeDescriptions;
    changed = true;
  }

  if (typeof media.defaultMastodonFolder !== "string") {
    media.defaultMastodonFolder = "Mastodon";
    changed = true;
  } else if (media.defaultMastodonFolder.trim().length === 0) {
    media.defaultMastodonFolder = "Mastodon";
    changed = true;
  }

  // Ensure configured video tag is present and normalized
  if (typeof media.defaultYouTubeTag !== "string") {
    media.defaultYouTubeTag = "Video";
    changed = true;
  } else if (media.defaultYouTubeTag.trim().length === 0) {
    media.defaultYouTubeTag = "Video";
    changed = true;
  }

  // Defensive: ensure availableTags is always an array
  const hadValidAvailableTags = Array.isArray(settings.availableTags);
  const availableTags: Array<unknown> =
    hadValidAvailableTags && Array.isArray(settings.availableTags)
      ? settings.availableTags
      : [];

  // Remove YouTube tag if present (YouTube videos now use generic Video tag)
  const youtubeTagIndex = availableTags.findIndex((tag) => {
    return (
      isRecord(tag) &&
      typeof tag.name === "string" &&
      tag.name.toLowerCase() === "youtube"
    );
  });

  if (youtubeTagIndex !== -1) {
    availableTags.splice(youtubeTagIndex, 1);
    settings.availableTags = availableTags;
    changed = true;
  }

  const hasVideoTag = availableTags.some((tag) => {
    return (
      isRecord(tag) &&
      typeof tag.name === "string" &&
      tag.name.toLowerCase() === "video"
    );
  });

  if (!hasVideoTag) {
    availableTags.push({ name: "Video", color: "#d04747" });
    settings.availableTags = availableTags;
    changed = true;
  }

  if (!hadValidAvailableTags) {
    settings.availableTags = availableTags;
    changed = true;
  }

  return changed;
}

/**
 * Legacy-to-array tag migration fields and their parallel string[] counterparts.
 *
 * Each legacy `string` field is migrated to its matching `string[]` field:
 *   - non-empty string  →  [trimmedValue]
 *   - empty / whitespace →  []
 *   - absent / undefined →  []
 *   - already an array   →  left as-is, no change
 *
 * Operates in-place on a plain Record so it can be tested without Obsidian imports.
 * Returns true only on first migration (once arrays exist all subsequent calls are no-ops).
 */
const MEDIA_TAG_ARRAY_FIELDS: Array<{
  legacy: string;
  array: string;
}> = [
  { legacy: "defaultVideoTag", array: "defaultVideoTags" },
  { legacy: "defaultYouTubeTag", array: "defaultYouTubeTags" },
  { legacy: "defaultPodcastTag", array: "defaultPodcastTags" },
  { legacy: "defaultRssTag", array: "defaultRssTags" },
  { legacy: "defaultSmallwebTag", array: "defaultSmallwebTags" },
  { legacy: "defaultMastodonTag", array: "defaultMastodonTags" },
];

export function migrateMediaDefaultTagArrays(
  settings: Record<string, unknown>,
): boolean {
  if (!isRecord(settings.media)) {
    return false;
  }

  const media = settings.media;
  let changed = false;

  // Process all fields every call — do not short-circuit on the first change.
  // Each field is dehydrated independently: arrays already present are skipped,
  // absent/empty legacy strings become [], non-empty become [trimmedValue].
  for (const { legacy, array: arrayField } of MEDIA_TAG_ARRAY_FIELDS) {
    if (Array.isArray(media[arrayField])) {
      continue; // already migrated – skip
    }

    const legacyValue = media[legacy];
    const trimmed = typeof legacyValue === "string" ? legacyValue.trim() : "";
    media[arrayField] = trimmed.length > 0 ? [trimmed] : [];
    changed = true;
  }

  return changed;
}
