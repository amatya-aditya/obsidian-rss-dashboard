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
    "hideIconDashboard",
    "hideIconDiscover",
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
