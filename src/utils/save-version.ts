import {
  DEFAULT_SETTINGS,
  type ArticleSavingSettings,
  type SavedTemplate,
  type SaveVersion,
} from "../types/types";

/**
 * The version names as they read inside a sentence, which is where a tooltip or
 * a notice uses them. Only the RSS acronym keeps its capitals: Obsidian's
 * sentence-case rule lowercases a word mid-sentence (see
 * `obsidianmd/ui/sentence-case` in `eslint.config.mjs`), so one table serves
 * every save surface (#1184).
 */
const SAVE_VERSION_SENTENCE_NAMES: Record<SaveVersion, string> = {
  rss: "RSS content",
  fetched: "fetched content",
};

/** The version name on its own, as a settings option or a docs row shows it. */
export function saveVersionLabel(version: SaveVersion): string {
  const name = SAVE_VERSION_SENTENCE_NAMES[version];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The choices of the Default save version setting, in display order. */
export const SAVE_VERSION_OPTIONS: readonly {
  value: SaveVersion;
  label: string;
}[] = (["rss", "fetched"] as const).map((value) => ({
  value,
  label: saveVersionLabel(value),
}));

/** The tooltip, and accessible name, of the save control of an already-saved article. */
export const SAVED_ARTICLE_TOOLTIP = "Click to open saved article";

/** The tooltip of a save control, naming the version that article's save will write. */
export function saveVersionTooltip(version: SaveVersion): string {
  return `Save ${SAVE_VERSION_SENTENCE_NAMES[version]} to notes`;
}

/** The post-save notice, naming the version the save wrote. */
export function savedArticleNotice(version: SaveVersion): string {
  return `Article saved with ${SAVE_VERSION_SENTENCE_NAMES[version]}. Click/tap the icon again to open the article in your vault.`;
}

/** Shown while a Fetched content save falls back to RSS content. */
export const FALLBACK_BEFORE_SAVE_NOTICE =
  "Fetched content is unavailable; saving RSS content.";

/** The post-save notice when a Fetched content save wrote RSS content instead. */
export const SAVE_FALLBACK_NOTICE: Record<"fetch" | "save", string> = {
  fetch: "Fetch failed; saved RSS content instead.",
  save: "Save failed; saved RSS content instead.",
};

/**
 * The stored value of a template's Save version that follows the Default save
 * version setting. It is an absent field on the template; the editor maps its
 * dropdown's first option to this value (#1185).
 */
export const TEMPLATE_SAVE_VERSION_INHERIT = "";

/** The choices of a template's Save version dropdown, first option first. */
export function templateSaveVersionOptions(
  defaultVersion: SaveVersion,
): readonly { value: string; label: string }[] {
  return [
    {
      value: TEMPLATE_SAVE_VERSION_INHERIT,
      label: `Use Default save version (${saveVersionLabel(defaultVersion)})`,
    },
    ...SAVE_VERSION_OPTIONS,
  ];
}

export function isSaveVersion(value: unknown): value is SaveVersion {
  return SAVE_VERSION_OPTIONS.some((option) => option.value === value);
}

/**
 * Decides which version of an article a save writes: the template applied to
 * the article when it sets one, otherwise the Default save version. A template
 * that leaves the field unset does not inherit the global default template's
 * version; precedence stops at the one template applied to the article (#1185).
 */
export function resolveSaveVersion(
  settings: Pick<Partial<ArticleSavingSettings>, "saveVersion">,
  savedTemplate?: SavedTemplate,
): SaveVersion {
  if (isSaveVersion(savedTemplate?.saveVersion)) {
    return savedTemplate.saveVersion;
  }
  return isSaveVersion(settings.saveVersion)
    ? settings.saveVersion
    : DEFAULT_SETTINGS.articleSaving.saveVersion;
}

/**
 * Turns only the retired boolean `saveFullContent` into `saveVersion` on a raw
 * `articleSaving` group (a truthy value is Fetched content, a falsy one is RSS
 * content, as the old code tested it) and removes the old key. A valid
 * `saveVersion` already present wins. It fills no default, so a partial
 * imported group does not mask the current value it omits.
 * @param {Record<string, unknown>} articleSaving Raw `articleSaving` group, changed in place
 * @returns {boolean} true if the group changed
 */
export function migrateLegacySaveFullContent(
  articleSaving: Record<string, unknown>,
): boolean {
  if (!("saveFullContent" in articleSaving)) return false;
  const legacy = articleSaving.saveFullContent;
  delete articleSaving.saveFullContent;
  if (legacy !== undefined && !isSaveVersion(articleSaving.saveVersion)) {
    // The old code tested truthiness, so a hand-edited "false" or 0 keeps its meaning.
    articleSaving.saveVersion = legacy ? "fetched" : "rss";
  }
  return true;
}

/**
 * Turns the retired boolean `saveFullContent` into `saveVersion` on a raw
 * `articleSaving` group, removes the old key, and repairs a missing or unknown
 * `saveVersion`. A `saveVersion` already present wins over the old key. Run it
 * on the raw group before defaults are merged in, or the default would hide an
 * old `false`.
 * @param {Record<string, unknown>} articleSaving Raw `articleSaving` group, changed in place
 * @returns {boolean} true if the group changed
 */
export function migrateSaveVersionSetting(
  articleSaving: Record<string, unknown>,
): boolean {
  let didChange = migrateLegacySaveFullContent(articleSaving);
  if (!isSaveVersion(articleSaving.saveVersion)) {
    articleSaving.saveVersion = DEFAULT_SETTINGS.articleSaving.saveVersion;
    didChange = true;
  }
  return didChange;
}
