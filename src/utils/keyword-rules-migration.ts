import { isRecord } from "./settings-record";

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

function normalizeGlobalKeywordRules(
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

  return changed;
}

function migrateFeedKeywordRules(feedRaw: Record<string, unknown>): boolean {
  let changed = false;

  if (feedRaw.filters !== undefined) {
    if (feedRaw.keywordRules === undefined) {
      feedRaw.keywordRules = feedRaw.filters;
    }
    delete feedRaw.filters;
    changed = true;
  }

  if (feedRaw.keywordRules === undefined) {
    return changed;
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

  return changed;
}

function normalizeFeedKeywordRules(settings: Record<string, unknown>): boolean {
  const feedsRaw = settings.feeds;
  if (!Array.isArray(feedsRaw)) {
    return false;
  }

  let changed = false;
  for (const feedRaw of feedsRaw) {
    if (!isRecord(feedRaw)) {
      continue;
    }
    if (migrateFeedKeywordRules(feedRaw)) {
      changed = true;
    }
  }
  return changed;
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
  const globalChanged = normalizeGlobalKeywordRules(settings);
  const feedsChanged = normalizeFeedKeywordRules(settings);
  return globalChanged || feedsChanged;
}
