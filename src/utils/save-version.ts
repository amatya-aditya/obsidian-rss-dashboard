import {
  DEFAULT_SETTINGS,
  type ArticleSavingSettings,
  type SavedTemplate,
  type SaveVersion,
} from "../types/types";

/** The choices of the Default save version setting, in display order. */
export const SAVE_VERSION_OPTIONS: readonly {
  value: SaveVersion;
  label: string;
}[] = [
  { value: "rss", label: "RSS content" },
  { value: "fetched", label: "Fetched content" },
];

export function isSaveVersion(value: unknown): value is SaveVersion {
  return SAVE_VERSION_OPTIONS.some((option) => option.value === value);
}

/**
 * Decides which version of an article a save writes. Today that is the
 * Default save version; the saved template is accepted so a per-template
 * override can change this one place (#1185).
 */
export function resolveSaveVersion(
  settings: Pick<Partial<ArticleSavingSettings>, "saveVersion">,
  _savedTemplate?: SavedTemplate,
): SaveVersion {
  return isSaveVersion(settings.saveVersion)
    ? settings.saveVersion
    : DEFAULT_SETTINGS.articleSaving.saveVersion;
}

/**
 * Turns the retired boolean `saveFullContent` into `saveVersion` on a raw
 * `articleSaving` group (a truthy value is Fetched content, a falsy one is RSS content, as the old code tested it),
 * removes the old key, and repairs a missing or unknown `saveVersion`. A
 * `saveVersion` already present wins over the old key. Run it on the raw
 * group before defaults are merged in, or the default would hide an old
 * `false`.
 * @param {Record<string, unknown>} articleSaving Raw `articleSaving` group, changed in place
 * @returns {boolean} true if the group changed
 */
export function migrateSaveVersionSetting(
  articleSaving: Record<string, unknown>,
): boolean {
  let didChange = false;
  const legacy = articleSaving.saveFullContent;
  if ("saveFullContent" in articleSaving) {
    delete articleSaving.saveFullContent;
    didChange = true;
  }
  if (!isSaveVersion(articleSaving.saveVersion)) {
    articleSaving.saveVersion =
      legacy === undefined
        ? DEFAULT_SETTINGS.articleSaving.saveVersion
        : // The old code tested truthiness, so a hand-edited "false" or 0 keeps its meaning.
          legacy
          ? "fetched"
          : "rss";
    didChange = true;
  }
  return didChange;
}
