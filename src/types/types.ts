import { DEFAULT_TAG_CHIP_RADIUS } from "../utils/tag-chip-radius";

export interface FeedItem {
  title: string;
  link: string;
  /**
   * The feed-supplied item blurb, rewritten on every refresh: RSS `<description>`,
   * Atom `<summary>`, or JSON Feed `summary`. The body is `content`. See the
   * "Feed description" entry in CONTEXT.md and #666 for why the name stays.
   */
  description: string;
  pubDate: string;
  guid: string;
  read?: boolean;
  starred?: boolean;
  tags?: Tag[];
  feedTitle: string;
  feedUrl: string;
  coverImage: string;
  /**
   * Set while `coverImage` holds an image the manual cover-image fetch took
   * from the article page (#1330); absent means the cover is the feed's own.
   * Every writer that puts a feed image back — the refresh, the YouTube
   * thumbnail step, and the restore action itself — clears it, and a cover the
   * item never fetched carries no marker, so stored items need no migration.
   */
  coverImageFromPage?: boolean;
  fallbackIconUrl?: string;

  mediaType?: "article" | "video" | "podcast";
  mediaContentType?: string;
  mediaContentMedium?: string;
  videoId?: string;
  videoUrl?: string;
  audioUrl?: string;
  duration?: string;
  author?: string;
  /** Author names, one per entry; `author` holds them joined with ", " (#247). */
  authors?: string[];
  summary?: string;
  content?: string;
  /**
   * The description resolved from the article page, or the guarded feed blurb
   * when the page had none (#247, ADR 0007). Stored beside `description`, never
   * over it. Written once, with the other metadata fields below.
   */
  publisherDescription?: string;
  /** BCP-47 language code from the article page or feed; unset when unresolved. */
  language?: string;
  languageSource?: "page" | "feed";
  /** The page's `<link rel="canonical">`. */
  canonicalUrl?: string;
  /**
   * The image the article page declares for itself (`og:image`, else
   * `twitter:image`), stored when the Reader fetches the page (#812). It is the
   * hero of the Fetched content version, ranked above the feed's own cover; the
   * RSS version and the card keep reading `coverImage`/`image`, so neither
   * changes. First-write-wins on its own presence — kept once set — so an item
   * stored before this field existed still gains one, and a refresh keeps it.
   */
  pageImage?: string;
  /** When the metadata fields were written; once set they are never overwritten. */
  metadataFetchedAt?: number;
  saved?: boolean;
  savedFilePath?: string;
  playbackProgress?: {
    position: number;
    duration: number;
    lastUpdated: number;
  };

  explicit?: boolean;
  image?: string;
  category?: string;
  episodeType?: string;
  season?: number;
  episode?: number;
  enclosure?: {
    url: string;
    type: string;
    length: string;
  };
  itunes?: {
    duration?: string;
    explicit?: string;
    image?: { href: string };
    category?: string;
    summary?: string;
    episodeType?: string;
    season?: string;
    episode?: string;
  };

  /**
   * If present, indicates the article was restricted/paywalled and only excerpt is shown.
   * Used to trigger inline banner in the reader.
   */
  restrictedReason?: string;

  /**
   * Set when the reader's full-article fetch failed on a network error or
   * timeout (#1110). While present the reader does not auto-fetch this article
   * on open; it shows a banner with "Try again". Cleared by a retry.
   */
  fullContentFetchFailure?: {
    reason: "timeout" | "network" | "blocked";
    /** Epoch milliseconds of the failed attempt. */
    at: number;
  };

  /**
   * Full-content fetch state for an article imported from a starred.json
   * export (234-09). Set to "unfetched" at import time for every imported
   * article; "failed" once a fetch (either the opt-in import-time fetch from
   * 234-06, or the reader's manual "Fetch now") has been attempted and did
   * not return usable content; absent once a fetch succeeds and the article
   * carries real full content. Only present on starred-imported articles —
   * articles from a normal feed refresh never set this field, so the
   * reader's automatic fetch-on-open is unaffected for them.
   */
  starredImportContentState?: "unfetched" | "failed";

  /**
   * Epoch-millisecond timestamp of when this article was imported from a
   * starred.json export (234-09). Set alongside `starredImportContentState`
   * at import time; used by the reader's cached-preview banner to show the
   * user when the export was taken.
   */
  starredImportedAt?: number;

  ieee?: {
    pubYear?: string;
    volume?: string;
    issue?: string;
    startPage?: string;
    endPage?: string;
    fileSize?: string;
    authors?: string;
  };

  /**
   * Epoch-millisecond timestamp of when this vault's local storage first
   * recorded this item, stamped once by `mergeFeedHistoryItems` and never
   * regenerated afterward. Used as the effective-date fallback for items
   * with no parseable `pubDate`, when `useFirstSeenDateFallback` is enabled.
   */
  firstSeenMs?: number;
}

export type FeedEncoding = "auto" | "windows-1251";

export interface Feed {
  feedId?: string;
  title: string;
  url: string;
  /**
   * Canonical website/homepage URL for the feed (not the RSS URL).
   */
  siteUrl?: string;
  /**
   * The language the feed declares (`<language>`, `xml:lang`, JSON Feed
   * `language`), as the feed wrote it. It is the fallback for an article's
   * language when the page has none (#246, ADR 0007).
   */
  language?: string;
  folder: string;
  items: FeedItem[];
  lastUpdated: number;
  author?: string;

  mediaType?: "article" | "video" | "podcast";
  autoDetect?: boolean;
  customTemplate?: string;
  customFolder?: string;
  customTags?: string[];
  feedEncoding?: FeedEncoding;

  autoDeleteDuration?: number;
  maxItemsLimit?: number;
  scanInterval?: number;
  excludeFromRefresh?: boolean;
  /**
   * Completion time of the most recent refresh attempt, successful or not.
   * This is intentionally distinct from lastUpdated, which tracks successful parsing.
   */
  lastRefreshAttemptCompletedAt?: number;
  iconUrl?: string;
  keywordRules?: FeedKeywordRulesSettings;
  lastRefreshDiagnostics?: FeedRefreshDiagnostics;
  /**
   * Set to a user-readable error message when the most recent refresh fails.
   * Cleared (set to undefined) on the next successful fetch.
   */
  lastFetchError?: string;
  /**
   * True while a background import placeholder is waiting for its first
   * fetch. Persisted so an import interrupted by an unload resumes on the
   * next load; cleared once the fetch succeeds or fails.
   */
  importPending?: boolean;
  /**
   * Status of this feed's most recent background import. Written to the feed
   * the UI renders so a failed or timed-out import can be surfaced per-feed
   * (the queued import entry is a throwaway copy, see GH #1140).
   */
  importStatus?: FeedImportStatus;
  /**
   * User-readable error message from the most recent failed background
   * import. Preserved for diagnostics and shown in the sidebar; cleared when
   * a later fetch succeeds.
   */
  importError?: string;
}

export type FeedImportStatus =
  "pending" | "processing" | "completed" | "failed" | "timed_out";

export type FeedRefreshStatus =
  "pending" | "processing" | "timed_out" | "failed";

export interface FeedRefreshState {
  status: FeedRefreshStatus;
  startedAt: number;
  error?: string;
}

export interface FeedRefreshDiagnostics {
  fetchedItemCount: number;
  mergedItemCountBeforeRetention: number;
  retainedItemCount: number;
  retentionRemovedCount: number;
  skippedByRefreshCutoffCount: number;
  autoDeleteDurationDays?: number;
}

export interface FeedMetadata {
  title: string;
  url: string;
  folder: string;
  lastUpdated: number;
  author?: string;
  mediaType?: "article" | "video" | "podcast";
  autoDetect?: boolean;
  customTemplate?: string;
  customFolder?: string;
  customTags?: string[];
  autoDeleteDuration?: number;
  maxItemsLimit?: number;
  scanInterval?: number;
  excludeFromRefresh?: boolean;
  lastRefreshAttemptCompletedAt?: number;
  importStatus?: FeedImportStatus;
  importError?: string;
}

export interface FeedIngestionCandidate {
  title: string;
  url: string;
  folder?: string;
  author?: string;
  mediaType?: "article" | "video" | "podcast";
  autoDetect?: boolean;
  customTemplate?: string;
  customFolder?: string;
  customTags?: string[];
  autoDeleteDuration?: number;
  maxItemsLimit?: number;
  scanInterval?: number;
  excludeFromRefresh?: boolean;
  keywordRules?: FeedKeywordRulesSettings;
}

export interface FeedIngestionOptions {
  mode?: "update" | "overwrite";
  folders?: Folder[];
  onProgress?: (completed: number, total: number) => void;
  globalOperation?: boolean;
}

export interface FeedIngestionResult {
  addedCount: number;
  skippedCount: number;
  queuedFeeds: Feed[];
  refused?: boolean;
}

export interface Tag {
  name: string;
  color?: string;
  textColor?: string;
}

export interface Folder {
  name: string;
  subfolders: Folder[];
  createdAt?: number;
  modifiedAt?: number;
  pinned?: boolean;
  autoTags?: Tag[];
}

export type ViewLocation = "main" | "right-sidebar" | "left-sidebar" | "inline";

export type PodcastTheme =
  | "obsidian"
  | "minimal"
  | "gradient"
  | "spotify"
  | "nord"
  | "dracula"
  | "solarized"
  | "catppuccin"
  | "gruvbox"
  | "tokyonight";

export interface MediaSettings {
  rememberPlaybackProgress: boolean;
  /** Show only the YouTube video: omit the description and related list; stored data is untouched. */
  youtubeFocusMode: boolean;
  defaultMastodonFolder: string;
  defaultYouTubeFolder: string;
  defaultVideoTag: string;
  defaultVideoTags: string[];
  defaultYouTubeTag: string;
  defaultYouTubeTags: string[];
  defaultPodcastFolder: string;
  defaultPodcastTags: string[];
  defaultRssFolder: string;
  defaultRssTag: string;
  defaultRssTags: string[];
  defaultSmallwebFolder: string;
  defaultSmallwebTag: string;
  defaultSmallwebTags: string[];
  defaultMastodonTag: string;
  defaultMastodonTags: string[];
  podcastTheme: PodcastTheme;
  enableApplePodcastsOpen?: boolean;
  defaultPlaySpeed: number;
  /** Show chapter markers parsed from an episode's notes on the seek bar. */
  showPodcastChapterMarkers?: boolean;
  /** Show the sleep timer's projected stop as a band on the seek bar. */
  showPodcastSleepTimerBand?: boolean;
}

export interface SavedTemplate {
  id: string;
  name: string;
  template: string;
  /** Folder used by Reader when this template is selected; absent on older templates. */
  defaultFolder?: string;
  /** Optional filename stem pattern; the `.md` extension is added automatically. */
  filenamePattern?: string;
  /**
   * Which version this template's saves write; absent on older templates and
   * on templates that follow the Default save version setting (#1185).
   */
  saveVersion?: SaveVersion;
}

/**
 * Which version of an article a save writes: the feed item's own content
 * (`rss`) or the fetched article page (`fetched`).
 */
export type SaveVersion = "rss" | "fetched";

export interface ArticleSavingSettings {
  addSavedTag: boolean;
  defaultFolder: string;
  defaultTemplate: string;
  includeFrontmatter: boolean;
  frontmatterTemplate: string;
  /** Default save version; replaces the boolean `saveFullContent` (see `migrateSaveVersionSetting`). */
  saveVersion: SaveVersion;
  fetchTimeout: number;
  savedTemplates: SavedTemplate[];
  /** Saved template used when the feed has no template assignment. */
  globalDefaultTemplateId?: string;
}

export const IMAGE_CACHE_LIMIT_MIN_MIB = 1;
export const IMAGE_CACHE_LIMIT_MAX_MIB = 1_024;

/** Article title size, as a percentage of each view's normal title size. */
export const ARTICLE_TITLE_SCALE_MIN = 50;
export const ARTICLE_TITLE_SCALE_MAX = 200;
export const ARTICLE_TITLE_SCALE_STEP = 5;
export const ARTICLE_TITLE_SCALE_DEFAULT = 100;

export interface DisplaySettings {
  showCoverImage: boolean;
  /**
   * Shows the header button that fetches cover images for every card on the
   * page (#1702). The button also needs `showCoverImage`, since a fetched
   * cover has nowhere to appear otherwise.
   */
  showFetchAllCoversButton: boolean;
  allowImageCaching: boolean;
  imageCacheLimitMiB: number;
  imageCacheUnlimited: boolean;
  showSummary: boolean;
  showFilterStatusBar: boolean;
  showVersionInStatusBar: boolean;
  paginationPosition: "top" | "bottom";
  showAllFeedsUnreadBadges: boolean;
  showFolderUnreadBadges: boolean;
  showFeedUnreadBadges: boolean;
  allFeedsUnreadBadgeColor: string;
  folderUnreadBadgeColor: string;
  feedUnreadBadgeColor: string;
  allFeedsUnreadBadgeDefaultColor: string;
  folderUnreadBadgeDefaultColor: string;
  feedUnreadBadgeDefaultColor: string;
  filterDisplayStyle: "vertical" | "inline";
  mobileShowCardToolbar: boolean;
  mobileShowListToolbar: boolean;
  mobileListToolbarStyle: "left-grid" | "bottom-row" | "minimal";
  /** Opt-in: horizontal swipes move between sidebar, dashboard, and reader on mobile. */
  swipeBetweenPanels: boolean;
  /** CSS border-radius shared by every plugin-rendered tag chip (#663). */
  tagChipRadius: string;
  defaultFilter:
    "all" | "starred" | "unread" | "read" | "saved" | "videos" | "podcasts";
  hiddenFilters: string[];
  useDomainIconsPodcast: boolean;
  useDomainIconsMastodon: boolean;
  useDomainIconsRss: boolean;
  hideDefaultRssIcon: boolean;
  autoMarkReadOnOpen: boolean;
  sidebarRowSpacing: number;
  sidebarRowIndentation: number;
  sidebarItemPaddingLeft: number;
  sidebarItemPaddingRight: number;
  cardColumnsPerRow: number;
  cardSpacing: number;
  articleTitleScale: number;
  hideEmptyFeeds: boolean;
  hideFeedFetchErrorBadges: boolean;

  // Icon visibility (all default false = visible)
  hideIconDashboard: boolean;
  hideIconDiscover: boolean;
  hideIconAddFeed: boolean;
  hideIconManageFeeds: boolean;
  hideIconSearch: boolean;
  hideIconTags: boolean;
  hideIconAddFolder: boolean;
  hideIconSort: boolean;
  hideIconCollapseAll: boolean;
  hideIconSettings: boolean;
  hideIconDivider: boolean;
  hideToolbarEntirely: boolean;
  iconOrder: string[];
  articleDateStyle: "relative" | "absolute";
}

export interface SidebarIconConfig {
  id: string;
  label: string;
  lucideIcon: string;
  settingKey: keyof DisplaySettings;
  neverCollapses?: boolean;
  isNav?: boolean;
  isDivider?: boolean;
}

export type ReaderTextAlign = "justify" | "left";
export type ReaderFontFamily = "default" | "serif" | "sans" | "mono";
export type ReaderParagraphSpacing = "default" | "tight" | "normal" | "loose";

export interface ReaderFormatSettings {
  textAlign: ReaderTextAlign;
  paragraphWidth: number;
  fontScalePct: number;
  lineHeightPct: number;
  fontFamily: ReaderFontFamily;
  paragraphSpacing: ReaderParagraphSpacing;
}

export interface HighlightWord {
  id: string;
  text: string;
  color?: string;
  enabled: boolean;
  wholeWord?: boolean;
  caseSensitive?: boolean;
  createdAt: number;
}

export interface HighlightSettings {
  enabled: boolean;
  defaultColor: string;
  highlightInContent: boolean;
  highlightInTitles: boolean;
  highlightInSummaries: boolean;
  words: HighlightWord[];
}

export interface KeywordFilterRule {
  id: string;
  type: "include" | "exclude";
  keyword: string;
  matchMode: "exact" | "partial";
  applyToTitle: boolean;
  applyToSummary: boolean;
  applyToContent: boolean;
  applyToURL?: boolean;
  enabled: boolean;
  createdAt: number;
}

export interface GlobalKeywordRulesSettings {
  includeLogic: "AND" | "OR";
  bypassAll: boolean;
  rules: KeywordFilterRule[];
}

export interface FeedKeywordRulesSettings {
  overrideGlobalRules: boolean;
  includeLogic: "AND" | "OR";
  rules: KeywordFilterRule[];
}

export interface AutoBackupSettings {
  backupDataJson: boolean; // copies data.json → data.json.backup
  backupOpml: boolean; // copies feeds.opml → feeds.opml.backup
  backupUserdata: boolean; // copies userdata.json → userdata.json.backup
}

export type FeedStorageMode =
  "legacy-json" | "vault-shards" | "vault-shards-v2";

export interface ArticleUserState {
  read?: boolean;
  starred?: boolean;
  tags?: Tag[];
  saved?: boolean;
  savedFilePath?: string;
  playbackProgress?: {
    position: number;
    duration: number;
    lastUpdated: number;
  };
}

export interface UserStateFile {
  version: number;
  states: Record<string, ArticleUserState>;
  /**
   * Highest device-local journal sequence already folded into this snapshot,
   * written as the max across devices for readers that only understand the
   * legacy single counter (#1386). Prefer {@link checkpointByDevice}: replay
   * skips a record only when its own device's checkpoint covers it. Absent on
   * older snapshots and treated as 0.
   */
  checkpointSequence?: number;
  /**
   * Per-device folded sequence floor (#1380). A journal record is skipped on
   * replay only when `record.seq <= checkpointByDevice[record.deviceId]`, so
   * one device's checkpoint never suppresses another device's pending records.
   * Absent on v3/v4 snapshots, which are read best-effort by treating
   * `checkpointSequence` as this device's own checkpoint.
   */
  checkpointByDevice?: Record<string, number>;
  /**
   * Bare-GUID state from a pre-#278 `user-state.json` that has not yet been
   * attributed to a `feedId:guid` key in `states` because its owning feed
   * had not hydrated when the migration ran. Re-attempted on every hydrate
   * and save until that feed's items become available, then folded into
   * `states` and removed from here.
   */
  unattributedLegacyStates?: Record<string, ArticleUserState>;
  /**
   * First observation timestamps for feed-qualified state absent from a
   * successfully hydrated shard.
   */
  missingSinceByStateKey?: Record<string, number>;
  /**
   * First observation timestamps for legacy bare-GUID state that has not yet
   * been attributed by a successfully hydrated shard.
   */
  unattributedFirstObservedAtByGuid?: Record<string, number>;
  /**
   * First observation timestamps, by feed ID, for state whose feed was not in
   * the saving device's feed list and was not removed by that device.
   */
  unrecognizedFeedSinceByFeedId?: Record<string, number>;
  _syncNonce?: string;
  _syncPad?: string;
}

export interface FeedItemsShard {
  version: number;
  feedId: string;
  feedUrl: string;
  updatedAt: number;
  items: FeedItem[];
}

export type FeedShardHealth = "missing" | "corrupt" | "rebuilt";

export type PersistedFeedConfig = Omit<Feed, "items"> & {
  feedId: string;
};

export type ArticleGroupByOption =
  "none" | "feed" | "date" | "folder" | "date_feed" | "folder_feed";

export interface FeedRetentionProtections {
  protectStarred?: boolean;
  protectSaved?: boolean;
  protectTagged?: boolean;
  protectUnread?: boolean;
}

export interface RssDashboardSettings {
  feeds: Feed[];
  folders: Folder[];
  refreshInterval: number;
  lastRefreshTimestamp: number;
  /** Completion time for an explicit refresh of the complete eligible feed set. */
  lastGlobalRefreshCompletedAt: number;
  startupRefreshDelaySeconds: number;
  maxItems: number;
  defaultAutoDeleteDuration: number;
  protectStarred: boolean;
  protectSaved: boolean;
  protectTagged: boolean;
  protectUnread: boolean;
  /**
   * When enabled, articles with no declared `pubDate` sort and retain by
   * their `firstSeenMs` timestamp instead of sorting to the bottom and
   * being deleted immediately once auto-delete is enabled. Off by default.
   */
  useFirstSeenDateFallback: boolean;
  viewStyle: "list" | "card" | "feed";
  showFeedArt: boolean;
  showThumbnails: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  collapsedFolders: string[];
  collapsedFeedSections: string[];
  tagsCollapsed: boolean;
  articleFilter: {
    type: "age" | "read" | "unread" | "starred" | "saved" | "none";
    value: unknown;
  };
  articleSort: "newest" | "oldest";
  articleGroupBy: ArticleGroupByOption;
  allArticlesPageSize: number;
  unreadArticlesPageSize: number;
  readArticlesPageSize: number;
  savedArticlesPageSize: number;
  starredArticlesPageSize: number;
  availableTags: Tag[];
  /** Global appearance values used when a tag has no stored override. */
  defaultTagColor?: string;
  defaultTagTextColor?: string;
  folderSortOrder?: {
    by: "name" | "created" | "modified" | "custom";
    ascending: boolean;
  };
  feedSortOrder?: {
    by: "name" | "created" | "itemCount" | "unreadCount" | "custom";
    ascending: boolean;
  };
  folderFeedSortOrders?: {
    [folderPath: string]: {
      by: "name" | "created" | "itemCount" | "unreadCount" | "custom";
      ascending: boolean;
    };
  };
  viewLocation: ViewLocation;
  readerViewLocation: ViewLocation;
  savedArticleOpenLocation: ViewLocation;
  useWebViewer: boolean;

  corsProxyEnabled: boolean;
  corsProxyUrl: string;

  readerFormat: ReaderFormatSettings;

  media: MediaSettings;
  articleSaving: ArticleSavingSettings;
  display: DisplaySettings;
  highlights: HighlightSettings;
  keywordRules: GlobalKeywordRulesSettings;

  /**
   * Dashboard multi-filters state (status/tag filters + AND/OR) that should persist
   * across navigation and restarts.
   */
  dashboardMultiFilters: {
    statusFilters: string[];
    tagFilters: string[];
    logic: "AND" | "OR";
  };

  /**
   * Tag filter mode for the sidebar tags section.
   * or  = articles matching at least one selected tag (default)
   * and = articles matching all selected tags
   * not = articles matching none of the selected tags
   */
  sidebarTagFilterMode: "or" | "and" | "not";

  autoBackup: AutoBackupSettings;
  storageMode: FeedStorageMode;
  /**
   * Version at which the storage deprecation prompt becomes due again. Unset
   * means due now; the prompt is suppressed only while the running version is
   * below it.
   */
  storageMigrationDismissedUntil?: string;
  /**
   * How many times the prompt has been deferred by a whole version. Once this
   * reaches the cap, deferring by version is no longer offered.
   */
  storageMigrationDeferralCount?: number;
  /**
   * Most recent plugin version whose curated What's New note was shown, or
   * whose new release line was evaluated without a note. Unset means an
   * existing user who has never been shown one, which is treated as due.
   */
  lastShownVersion?: string;
  storageFolder: string;
  storageSchemaVersion: number;
  /**
   * Metadata storage mode: "plugin-default" uses .obsidian/plugins/rss-dashboard/data.json,
   * "vault-location" uses a user-configured vault folder.
   */
  metadataStorageMode: "plugin-default" | "vault-location";
  /**
   * User-configured vault folder for metadata (data.json) storage.
   * Default: ".rss-dashboard-data"
   * Only used when metadataStorageMode is "vault-location".
   */
  metadataStorageFolder: string;
  /**
   * Schema version for metadata storage to support future migrations.
   */
  metadataStorageSchemaVersion: number;
}

export type PersistedRssDashboardSettings = Omit<
  RssDashboardSettings,
  "feeds"
> & {
  feeds: PersistedFeedConfig[];
};

export interface PortableDataBundle {
  version: number;
  exportedAt: number;
  storageMode: FeedStorageMode;
  storageFolder?: string;
  metadataStorageMode?: "plugin-default" | "vault-location";
  metadataStorageFolder?: string;
  metadata: PersistedRssDashboardSettings;
  shards: FeedItemsShard[];
  markdownMirrorFallbackPlanned: boolean;
}

export type SettingsOnly = Omit<
  RssDashboardSettings,
  "feeds" | "folders" | "availableTags"
>;

/**
 * Feeds, folders, tags, articles, and article state — no app settings.
 * See ADR 0005 for the split from the combined PortableDataBundle.
 */
export interface FeedBundle {
  version: number;
  exportedAt: number;
  feeds: PersistedFeedConfig[];
  folders: Folder[];
  availableTags: Tag[];
  shards: FeedItemsShard[];
}

/**
 * App preferences only — no feeds, folders, tags, or articles.
 * See ADR 0005 for the split from the combined PortableDataBundle.
 */
export interface SettingsBundle {
  version: number;
  exportedAt: number;
  metadataStorageMode?: "plugin-default" | "vault-location";
  metadataStorageFolder?: string;
  settings: SettingsOnly;
}

export const DEFAULT_SETTINGS: RssDashboardSettings = {
  feeds: [],
  folders: [
    {
      name: "Uncategorized",
      subfolders: [],
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    },
    {
      name: "Videos",
      subfolders: [],
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    },
    {
      name: "Podcasts",
      subfolders: [],
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    },
    {
      name: "RSS",
      subfolders: [],
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    },
  ],
  refreshInterval: 0,
  lastRefreshTimestamp: 0,
  lastGlobalRefreshCompletedAt: 0,
  startupRefreshDelaySeconds: 5,
  maxItems: 50,
  defaultAutoDeleteDuration: 30,
  protectStarred: true,
  protectSaved: true,
  protectTagged: false,
  protectUnread: false,
  useFirstSeenDateFallback: false,
  viewStyle: "card",
  showFeedArt: true,
  showThumbnails: true,
  sidebarCollapsed: false,
  sidebarWidth: 310,
  collapsedFolders: [],
  collapsedFeedSections: [],
  tagsCollapsed: true,
  articleFilter: { type: "none", value: null },
  articleSort: "newest",
  articleGroupBy: "none",
  allArticlesPageSize: 50,
  unreadArticlesPageSize: 50,
  readArticlesPageSize: 50,
  savedArticlesPageSize: 50,
  starredArticlesPageSize: 50,
  availableTags: [
    { name: "Important", color: "#e74c3c" },
    { name: "Read later", color: "#3498db" },
    { name: "Video", color: "#d04747" },
    { name: "Podcast", color: "#8e44ad" },
  ],
  defaultTagColor: "#8a5cf5",
  defaultTagTextColor: "#ffffff",
  folderSortOrder: { by: "name", ascending: true },
  feedSortOrder: { by: "name", ascending: true },
  folderFeedSortOrders: {},
  viewLocation: "main",
  readerViewLocation: "main",
  savedArticleOpenLocation: "main",
  useWebViewer: true,
  corsProxyEnabled: true,
  corsProxyUrl: "auto",
  readerFormat: {
    textAlign: "justify",
    paragraphWidth: 100,
    fontScalePct: 100,
    lineHeightPct: 160,
    fontFamily: "default",
    paragraphSpacing: "default",
  },
  media: {
    rememberPlaybackProgress: true,
    youtubeFocusMode: false,
    defaultMastodonFolder: "Mastodon",
    defaultYouTubeFolder: "Videos",
    defaultVideoTag: "Video",
    defaultVideoTags: ["Video"],
    defaultYouTubeTag: "Video",
    defaultYouTubeTags: ["Video"],
    defaultPodcastFolder: "Podcasts",
    defaultPodcastTags: ["podcast"],
    defaultRssFolder: "RSS",
    defaultRssTag: "RSS",
    defaultRssTags: ["RSS"],
    defaultSmallwebFolder: "Smallweb",
    defaultSmallwebTag: "smallweb",
    defaultSmallwebTags: ["smallweb"],
    defaultMastodonTag: "",
    defaultMastodonTags: [],
    podcastTheme: "obsidian",
    enableApplePodcastsOpen: false,
    defaultPlaySpeed: 1,
    showPodcastChapterMarkers: true,
    showPodcastSleepTimerBand: true,
  },
  articleSaving: {
    addSavedTag: true,
    defaultFolder: "RSS articles/",
    defaultTemplate: `---
title: "{{title}}"
date: "{{date}}"
tags: [{{tags}}]
source: "{{source}}"
contentSource: "{{contentSource}}"
link: "{{link}}"
author: "{{author}}"
feedTitle: "{{feedTitle}}"
summary: "{{summary}}"
guid: "{{guid}}"
---
# {{title}}

{{content}}

[Source]({{link}})`,
    includeFrontmatter: true,
    frontmatterTemplate: `---
title: "{{title}}"
date: "{{date}}"
tags: [{{tags}}]
source: "{{source}}"
contentSource: "{{contentSource}}"
link: "{{link}}"
author: "{{author}}"
feedTitle: "{{feedTitle}}"
summary: "{{summary}}"
guid: "{{guid}}"
---`,
    saveVersion: "fetched",
    fetchTimeout: 10,
    savedTemplates: [],
    globalDefaultTemplateId: undefined,
  },
  display: {
    showCoverImage: true,
    showFetchAllCoversButton: true,
    allowImageCaching: false,
    imageCacheLimitMiB: 100,
    imageCacheUnlimited: false,
    showSummary: true,
    showFilterStatusBar: true,
    showVersionInStatusBar: false,
    paginationPosition: "bottom",
    showAllFeedsUnreadBadges: true,
    showFolderUnreadBadges: true,
    showFeedUnreadBadges: true,
    allFeedsUnreadBadgeColor: "#8e44ad",
    folderUnreadBadgeColor: "#d85b9f",
    feedUnreadBadgeColor: "#8e44ad",
    allFeedsUnreadBadgeDefaultColor: "#8e44ad",
    folderUnreadBadgeDefaultColor: "#d85b9f",
    feedUnreadBadgeDefaultColor: "#8e44ad",
    filterDisplayStyle: "inline",
    mobileShowCardToolbar: true,
    mobileShowListToolbar: true,
    mobileListToolbarStyle: "minimal",
    swipeBetweenPanels: false,
    defaultFilter: "all",
    hiddenFilters: [],
    useDomainIconsPodcast: false,
    useDomainIconsMastodon: false,
    useDomainIconsRss: false,
    hideDefaultRssIcon: false,
    autoMarkReadOnOpen: false,
    sidebarRowSpacing: 10,
    sidebarRowIndentation: 20,
    sidebarItemPaddingLeft: 2,
    sidebarItemPaddingRight: 2,
    cardColumnsPerRow: 0,
    cardSpacing: 15,
    articleTitleScale: ARTICLE_TITLE_SCALE_DEFAULT,
    hideEmptyFeeds: false,
    hideFeedFetchErrorBadges: false,
    hideIconDashboard: false,
    hideIconDiscover: false,
    hideIconAddFeed: false,
    hideIconManageFeeds: false,
    hideIconSearch: false,
    hideIconTags: false,
    hideIconAddFolder: false,
    hideIconSort: false,
    hideIconCollapseAll: false,
    hideIconSettings: false,
    hideIconDivider: false,
    hideToolbarEntirely: false,
    iconOrder: [
      "discover",
      "divider",
      "addFeed",
      "manageFeeds",
      "search",
      "tags",
      "addFolder",
      "sort",
      "collapseAll",
      "settings",
    ],
    articleDateStyle: "relative",
    tagChipRadius: DEFAULT_TAG_CHIP_RADIUS,
  },
  highlights: {
    enabled: false,
    defaultColor: "#ffd700",
    highlightInContent: true,
    highlightInTitles: true,
    highlightInSummaries: true,
    words: [],
  },
  keywordRules: {
    includeLogic: "AND",
    bypassAll: false,
    rules: [],
  },
  dashboardMultiFilters: {
    statusFilters: [],
    tagFilters: [],
    logic: "OR",
  },
  sidebarTagFilterMode: "or",
  autoBackup: {
    backupDataJson: false,
    backupOpml: true,
    backupUserdata: true,
  },
  storageMode: "vault-shards-v2",
  storageMigrationDeferralCount: 0,
  storageFolder: ".rss-dashboard-data/feeds",
  storageSchemaVersion: 1,
  metadataStorageMode: "plugin-default",
  metadataStorageFolder: ".rss-dashboard-data",
  metadataStorageSchemaVersion: 1,
};
