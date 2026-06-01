import type {
  Feed,
  FeedItem,
  Folder,
  RssDashboardSettings,
} from "../types/types";
import { DEFAULT_SETTINGS } from "../types/types";
import {
  migrateDisplaySettings,
  migrateDefaultFilterToDashboardMultiFilters,
  migrateKeywordRulesSettings,
  migrateMediaVideoTagSettings,
} from "./settings-migration";
import { canonicalizeItemIdentityUrl } from "./url-utils";
import { normalizeRefreshIntervalMinutes } from "./validation";

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

export const FACTORY_RESET_LOCAL_STORAGE_KEYS = [
  "rss-discover-filters",
  "rss-podcast-progress",
  "rss-first-launch-coachmark-shown",
] as const;

function cloneFoldersWithFreshTimestamps(
  folders: Folder[],
  timestamp: number,
): Folder[] {
  return folders.map((folder) => ({
    ...folder,
    subfolders: cloneFoldersWithFreshTimestamps(
      folder.subfolders ?? [],
      timestamp,
    ),
    createdAt: timestamp,
    modifiedAt: timestamp,
  }));
}

export function buildFactoryResetSettings(): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  const timestamp = Date.now();

  settings.folders = cloneFoldersWithFreshTimestamps(
    DEFAULT_SETTINGS.folders,
    timestamp,
  );

  return settings;
}

export function loadAndNormalizeSettings(
  rawData?: Partial<RssDashboardSettings> | null,
): RssDashboardSettings {
  const settings = Object.assign({}, DEFAULT_SETTINGS, rawData ?? {});

  const normalizedRefreshInterval = Number(settings.refreshInterval);
  settings.refreshInterval = Number.isFinite(normalizedRefreshInterval)
    ? normalizeRefreshIntervalMinutes(normalizedRefreshInterval)
    : DEFAULT_SETTINGS.refreshInterval;

  if (typeof settings.defaultAutoDeleteDuration !== "number") {
    settings.defaultAutoDeleteDuration =
      DEFAULT_SETTINGS.defaultAutoDeleteDuration;
  }

  if (!settings.readerViewLocation) {
    settings.readerViewLocation = "right-sidebar";
  }

  // Remove external-browser from readerViewLocation (not supported for regular articles)
  if (settings.readerViewLocation === "external-browser") {
    settings.readerViewLocation = "main";
  }

  // Check if savedArticleOpenLocation was provided in raw data (not inherited from defaults)
  const savedArticleLocationProvided = rawData?.savedArticleOpenLocation !== undefined;
  if (!savedArticleLocationProvided) {
    // Inherit from readerViewLocation, but also convert external-browser to main
    settings.savedArticleOpenLocation = settings.readerViewLocation;
  }

  // Migrate: convert external-browser to main for saved articles (external browser no longer supported)
  if (savedArticleLocationProvided && rawData?.savedArticleOpenLocation === "external-browser") {
    settings.savedArticleOpenLocation = "main";
  }

  if (settings.useWebViewer === undefined) {
    settings.useWebViewer = true;
  }

  settings.articleSaving = Object.assign(
    {},
    DEFAULT_SETTINGS.articleSaving,
    settings.articleSaving ?? {},
  );

  settings.media = Object.assign(
    {},
    DEFAULT_SETTINGS.media,
    settings.media ?? {},
  );
  settings.availableTags = Array.isArray(settings.availableTags)
    ? settings.availableTags
    : [...DEFAULT_SETTINGS.availableTags];
  settings.display = Object.assign(
    {},
    DEFAULT_SETTINGS.display,
    settings.display ?? {},
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
  }

  const canonicalPageSizeRaw = settings.allArticlesPageSize;
  const canonicalPageSize =
    Number.isFinite(canonicalPageSizeRaw) && canonicalPageSizeRaw >= 0
      ? canonicalPageSizeRaw
      : DEFAULT_SETTINGS.allArticlesPageSize;

  for (const field of PAGE_SIZE_FIELDS) {
    settings[field] = canonicalPageSize;
  }

  return settings;
}

export function migrateSettings(settings: RssDashboardSettings): boolean {
  let didChange = false;
  const settingsUnknown = settings as unknown as Record<string, unknown>;

  if (migrateKeywordRulesSettings(settingsUnknown)) {
    didChange = true;
  }

  if (migrateMediaVideoTagSettings(settingsUnknown)) {
    didChange = true;
  }

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
    didChange = true;
  }

  settings.display = Object.assign(
    {},
    DEFAULT_SETTINGS.display,
    settings.display ?? {},
  );
  migrateDisplaySettings(
    settings.display as unknown as Record<string, unknown>,
  );

  settings.keywordRules = Object.assign(
    {},
    DEFAULT_SETTINGS.keywordRules,
    settings.keywordRules ?? {},
  );

  settings.dashboardMultiFilters = settings.dashboardMultiFilters
    ? {
        statusFilters: Array.isArray(
          settings.dashboardMultiFilters.statusFilters,
        )
          ? settings.dashboardMultiFilters.statusFilters.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
        tagFilters: Array.isArray(settings.dashboardMultiFilters.tagFilters)
          ? settings.dashboardMultiFilters.tagFilters.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
        logic:
          settings.dashboardMultiFilters.logic === "AND" ||
          settings.dashboardMultiFilters.logic === "OR"
            ? settings.dashboardMultiFilters.logic
            : "OR",
      }
    : { ...DEFAULT_SETTINGS.dashboardMultiFilters };

  migrateDefaultFilterToDashboardMultiFilters(
    settings.display as unknown as Record<string, unknown>,
    settings.dashboardMultiFilters as unknown as Record<string, unknown>,
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

export function dedupeAndNormalizeFeedItems(feeds: Feed[]): boolean {
  let didChange = false;

  const getPubDateMs = (pubDate: string | undefined | null): number => {
    if (!pubDate) return 0;
    const ms = Date.parse(pubDate);
    return Number.isFinite(ms) ? ms : 0;
  };

  const byNewest = (a: FeedItem, b: FeedItem): number => {
    const aMs = getPubDateMs(a.pubDate);
    const bMs = getPubDateMs(b.pubDate);
    if (aMs !== bMs) return bMs - aMs;
    return (a.guid || "").localeCompare(b.guid || "");
  };

  const pickLonger = (a: string, b: string): string => {
    const aTrim = (a ?? "").trim();
    const bTrim = (b ?? "").trim();
    if (!aTrim) return bTrim ? b : a;
    if (!bTrim) return a;
    return bTrim.length > aTrim.length ? b : a;
  };

  const pickLongerOptional = (a?: string, b?: string): string | undefined => {
    const aTrim = (a ?? "").trim();
    const bTrim = (b ?? "").trim();
    if (!aTrim && !bTrim) return a ?? b;
    if (!aTrim) return b;
    if (!bTrim) return a;
    return bTrim.length > aTrim.length ? b : a;
  };

  const mergeTags = (
    a: FeedItem["tags"],
    b: FeedItem["tags"],
  ): FeedItem["tags"] => {
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
  };

  for (const feed of feeds || []) {
    const items = Array.isArray(feed.items) ? feed.items : [];
    if (items.length === 0) {
      continue;
    }

    const mergedByKey = new Map<string, FeedItem>();

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
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
      mergedByKey.set(key, {
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
        image: existing.image || item.image,
      });
    }

    const deduped = Array.from(mergedByKey.values());
    if (deduped.length !== items.length) {
      didChange = true;
    }

    deduped.sort(byNewest);
    feed.items = deduped;
  }

  return didChange;
}
