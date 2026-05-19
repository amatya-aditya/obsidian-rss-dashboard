import { SIDEBAR_ICON_IDS } from "./sidebar-icon-registry";

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
  display: Record<string, unknown>,
  dashboardMultiFilters: Record<string, unknown>,
): void {
  const statusFiltersRaw = dashboardMultiFilters.statusFilters;
  const tagFiltersRaw = dashboardMultiFilters.tagFilters;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isDefaultGlobalKeywordRules(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const includeLogic = value.includeLogic;
  const bypassAll = value.bypassAll;
  const rules = value.rules;

  const includeDefault = includeLogic === undefined || includeLogic === "AND";
  const bypassDefault = bypassAll === undefined || bypassAll === false;
  const rulesDefault = !Array.isArray(rules) || rules.length === 0;

  return includeDefault && bypassDefault && rulesDefault;
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
  let changed = false;

  // Global: settings.filters -> settings.keywordRules
  if (settings.filters !== undefined) {
    const shouldOverwriteKeywordRules =
      settings.keywordRules === undefined ||
      !isRecord(settings.keywordRules) ||
      isDefaultGlobalKeywordRules(settings.keywordRules);

    if (shouldOverwriteKeywordRules) {
      settings.keywordRules = settings.filters;
    }
    delete settings.filters;
    changed = true;
  }

  if (!isRecord(settings.keywordRules)) {
    settings.keywordRules = {
      includeLogic: "AND",
      bypassAll: false,
      rules: [],
    };
    changed = true;
  }

  const global = settings.keywordRules as Record<string, unknown>;
  if (global.includeLogic !== "AND" && global.includeLogic !== "OR") {
    global.includeLogic = "AND";
    changed = true;
  }
  if (typeof global.bypassAll !== "boolean") {
    global.bypassAll = false;
    changed = true;
  }
  if (!Array.isArray(global.rules)) {
    global.rules = [];
    changed = true;
  }

  // Feeds: feed.filters -> feed.keywordRules
  const feedsRaw = settings.feeds;
  if (Array.isArray(feedsRaw)) {
    for (const feedRaw of feedsRaw) {
      if (!isRecord(feedRaw)) {
        continue;
      }

      if (feedRaw.filters !== undefined) {
        if (feedRaw.keywordRules === undefined) {
          feedRaw.keywordRules = feedRaw.filters;
        }
        delete feedRaw.filters;
        changed = true;
      }

      if (feedRaw.keywordRules === undefined) {
        continue;
      }

      if (!isRecord(feedRaw.keywordRules)) {
        feedRaw.keywordRules = {
          overrideGlobalRules: false,
          includeLogic: "AND",
          rules: [],
        };
        changed = true;
      }

      const feedRules = feedRaw.keywordRules as Record<string, unknown>;
      if (
        feedRules.overrideGlobalFilters !== undefined &&
        feedRules.overrideGlobalRules === undefined
      ) {
        feedRules.overrideGlobalRules = feedRules.overrideGlobalFilters;
        delete feedRules.overrideGlobalFilters;
        changed = true;
      }

      if (typeof feedRules.overrideGlobalRules !== "boolean") {
        feedRules.overrideGlobalRules = false;
        changed = true;
      }
      if (feedRules.includeLogic !== "AND" && feedRules.includeLogic !== "OR") {
        feedRules.includeLogic = "AND";
        changed = true;
      }
      if (!Array.isArray(feedRules.rules)) {
        feedRules.rules = [];
        changed = true;
      }
    }
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
  if (typeof media.autoTagVideos !== "boolean") {
    media.autoTagVideos = true;
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
