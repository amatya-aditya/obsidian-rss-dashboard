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
  }
}
