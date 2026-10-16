import type { RssDashboardSettings } from "../types/types";
import { migrateLegacySaveFullContent } from "./save-version";

/**
 * The nested settings groups a settings import merges one level deep (ADR
 * 0027). A group an import omits keeps its current value whole; a group it
 * carries is laid over the current group key by key.
 */
export const MERGED_SETTINGS_GROUPS = [
  "articleSaving",
  "media",
  "readerFormat",
  "highlights",
  "articleFilter",
] as const;

type MergedSettingsGroup = (typeof MERGED_SETTINGS_GROUPS)[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Translates the legacy keys of one imported group, and fills no defaults, so
 * the current group's value is never masked by a default the file did not carry.
 * @param {MergedSettingsGroup} group Which group `raw` is
 * @param {Record<string, unknown>} raw The imported group, changed in place
 */
function migrateImportedGroup(
  group: MergedSettingsGroup,
  raw: Record<string, unknown>,
): void {
  if (group === "articleSaving") {
    migrateLegacySaveFullContent(raw);
    return;
  }
  if (group !== "media") return;

  if ("autoTagVideos" in raw) {
    if (
      raw.autoTagVideos === false &&
      typeof raw.defaultVideoTag !== "string"
    ) {
      raw.defaultVideoTag = "";
    }
    delete raw.autoTagVideos;
  }
  if ("hideYouTubeDescriptions" in raw) {
    if (
      typeof raw.youtubeFocusMode !== "boolean" &&
      raw.hideYouTubeDescriptions === true
    ) {
      raw.youtubeFocusMode = true;
    }
    delete raw.hideYouTubeDescriptions;
  }
}

/**
 * Merges the nested groups of imported settings over the current settings, one
 * level deep, and returns the imported settings with those groups replaced by
 * the merged result. An array the import carries replaces the current array.
 * Each group's legacy migration runs on the imported group first. Neither
 * argument is changed.
 * @param {RssDashboardSettings} current The live settings
 * @param {Partial<RssDashboardSettings>} imported The settings the file carries
 * @returns {Partial<RssDashboardSettings>} The imported settings with merged groups
 */
export function mergeImportedSettingsGroups<
  T extends Partial<RssDashboardSettings>,
>(current: RssDashboardSettings, imported: T): T {
  const result: Record<string, unknown> = { ...imported };
  for (const group of MERGED_SETTINGS_GROUPS) {
    const importedGroup = (imported as Record<string, unknown>)[group];
    if (!isPlainObject(importedGroup)) {
      // Omitted, or not a group at all: keep the current group whole.
      delete result[group];
      continue;
    }
    const migrated = { ...importedGroup };
    migrateImportedGroup(group, migrated);
    result[group] = { ...current[group], ...migrated };
  }
  return result as T;
}
