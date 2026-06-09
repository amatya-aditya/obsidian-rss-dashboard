export interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  read: boolean;
  starred: boolean;
  tags: Tag[];
  feedTitle: string;
  feedUrl: string;
  coverImage: string;

  mediaType?: "article" | "video" | "podcast";
  mediaContentType?: string;
  mediaContentMedium?: string;
  videoId?: string;
  videoUrl?: string;
  audioUrl?: string;
  duration?: string;
  author?: string;
  summary?: string;
  content?: string;
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

  ieee?: {
    pubYear?: string;
    volume?: string;
    issue?: string;
    startPage?: string;
    endPage?: string;
    fileSize?: string;
    authors?: string;
  };
}

export interface Feed {
  feedId?: string;
  title: string;
  url: string;
  /**
   * Canonical website/homepage URL for the feed (not the RSS URL).
   */
  siteUrl?: string;
  folder: string;
  items: FeedItem[];
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
  iconUrl?: string;
  keywordRules?: FeedKeywordRulesSettings;
  lastRefreshDiagnostics?: FeedRefreshDiagnostics;
}

export type FeedRefreshStatus =
  | "pending"
  | "processing"
  | "timed_out"
  | "failed";

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
  importStatus?:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "timed_out";
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
}

export interface Tag {
  name: string;
  color: string;
}

export interface Folder {
  name: string;
  subfolders: Folder[];
  createdAt?: number;
  modifiedAt?: number;
  pinned?: boolean;
}

export type ViewLocation =
  | "main"
  | "right-sidebar"
  | "left-sidebar"
  | "inline"
  | "external-browser";

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
  defaultVideoTag: string;
  defaultVideoTags?: string[];
  rememberPlaybackProgress: boolean;
  defaultTwitterFolder: string;
  defaultMastodonFolder: string;
  defaultYouTubeFolder: string;
  defaultYouTubeTag: string;
  defaultYouTubeTags?: string[];
  defaultPodcastFolder: string;
  defaultPodcastTag: string;
  defaultPodcastTags?: string[];
  defaultRssFolder: string;
  defaultRssTag: string;
  defaultRssTags?: string[];
  defaultSmallwebFolder: string;
  defaultSmallwebTag: string;
  defaultSmallwebTags?: string[];
  defaultTwitterTag?: string;
  defaultTwitterTags?: string[];
  defaultMastodonTag?: string;
  defaultMastodonTags?: string[];
  openInSplitView: boolean;
  podcastTheme: PodcastTheme;
  enableApplePodcastsOpen?: boolean;
  defaultPlaySpeed?: number;
}

export interface SavedTemplate {
  id: string;
  name: string;
  template: string;
}

export interface ArticleSavingSettings {
  addSavedTag: boolean;
  defaultFolder: string;
  defaultTemplate: string;
  includeFrontmatter: boolean;
  frontmatterTemplate: string;
  saveFullContent: boolean;
  fetchTimeout: number;
  savedTemplates: SavedTemplate[];
}

export interface DisplaySettings {
  showCoverImage: boolean;
  showSummary: boolean;
  showFilterStatusBar: boolean;
  showSidebarScrollbar: boolean;
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
  defaultFilter:
    | "all"
    | "starred"
    | "unread"
    | "read"
    | "saved"
    | "videos"
    | "podcasts";
  hiddenFilters: string[];
  hideDefaultRssIcon: boolean;
  autoMarkReadOnOpen: boolean;
  sidebarRowSpacing: number;
  sidebarRowIndentation: number;
  sidebarItemPaddingLeft: number;
  sidebarItemPaddingRight: number;
  cardColumnsPerRow: number;
  cardSpacing: number;
  hideEmptyFeeds: boolean;

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

   // Domain icon toggles for feed list
   useDomainIconsRss: boolean;
   useDomainIconsPodcast: boolean;
   useDomainIconsTwitter: boolean;
   useDomainIconsMastodon: boolean;
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

export type FeedStorageMode = "legacy-json" | "vault-shards";

export interface FeedItemsShard {
  version: number;
  feedId: string;
  feedUrl: string;
  updatedAt: number;
  items: FeedItem[];
}

export type PersistedFeedConfig = Omit<Feed, "items"> & {
  feedId: string;
};

export interface RssDashboardSettings {
  feeds: Feed[];
  folders: Folder[];
  refreshInterval: number;
  lastRefreshTimestamp: number;
  maxItems: number;
  defaultAutoDeleteDuration: number;
  viewStyle: "list" | "card" | "feed";
  showFeedArt: boolean;
  showThumbnails: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  collapsedFolders: string[];
  tagsCollapsed: boolean;
  articleFilter: {
    type: "age" | "read" | "unread" | "starred" | "saved" | "none";
    value: unknown;
  };
  articleSort: "newest" | "oldest";
  articleGroupBy: "none" | "feed" | "date" | "folder";
  allArticlesPageSize: number;
  unreadArticlesPageSize: number;
  readArticlesPageSize: number;
  savedArticlesPageSize: number;
  starredArticlesPageSize: number;
  availableTags: Tag[];
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
  customProxyUrls: string[];

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
  refreshInterval: 60,
  lastRefreshTimestamp: 0,
  maxItems: 50,
  defaultAutoDeleteDuration: 30,
  viewStyle: "card",
  showFeedArt: true,
  showThumbnails: true,
  sidebarCollapsed: false,
  sidebarWidth: 280,
  collapsedFolders: [],
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
    { name: "Favorite", color: "#f1c40f" },
    { name: "Video", color: "#d04747" },
    { name: "Podcast", color: "#8e44ad" },
  ],
  folderSortOrder: { by: "name", ascending: true },
  feedSortOrder: { by: "name", ascending: true },
  folderFeedSortOrders: {},
  viewLocation: "main",
  readerViewLocation: "main",
  savedArticleOpenLocation: "main",
  useWebViewer: true,
  corsProxyEnabled: false,
  corsProxyUrl: "",
  customProxyUrls: [],
  readerFormat: {
    textAlign: "justify",
    paragraphWidth: 100,
    fontScalePct: 100,
    lineHeightPct: 160,
    fontFamily: "default",
    paragraphSpacing: "default",
  },
  media: {
    defaultVideoTag: "Video",
    defaultVideoTags: ["Video"],
    rememberPlaybackProgress: true,
    defaultTwitterFolder: "Twitter",
    defaultMastodonFolder: "Mastodon",
    defaultYouTubeFolder: "Videos",
    defaultYouTubeTag: "Video",
    defaultYouTubeTags: ["Video"],
    defaultPodcastFolder: "Podcast",
    defaultPodcastTag: "Podcast",
    defaultPodcastTags: ["Podcast"],
    defaultRssFolder: "RSS",
    defaultRssTag: "",
    defaultRssTags: [],
    defaultSmallwebFolder: "Smallweb",
    defaultSmallwebTag: "",
    defaultSmallwebTags: [],
    defaultTwitterTag: "",
    defaultTwitterTags: [],
    defaultMastodonTag: "",
    defaultMastodonTags: [],
    openInSplitView: true,
    podcastTheme: "obsidian",
    enableApplePodcastsOpen: false,
    defaultPlaySpeed: 1,
  },
  articleSaving: {
    addSavedTag: true,
    defaultFolder: "RSS articles/",
    defaultTemplate: `---
 title: "{{title}}"
 date: "{{date}}"
 tags: [{{tags}}]
 source: "{{source}}"
 link: "{{link}}"
 author: "{{author}}"
 feedTitle: "{{feedTitle}}"
 summary: "{{summary}}"
 guid: "{{guid}}"
 image: "{{image}}"
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
 link: "{{link}}"
 author: "{{author}}"
 feedTitle: "{{feedTitle}}"
 summary: "{{summary}}"
 guid: "{{guid}}"
---`,
    saveFullContent: true,
    fetchTimeout: 10,
    savedTemplates: [],
  },
  display: {
    showCoverImage: true,
    showSummary: true,
    showFilterStatusBar: true,
    showSidebarScrollbar: true,
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
    defaultFilter: "all",
    hiddenFilters: [],
    hideDefaultRssIcon: false,
    autoMarkReadOnOpen: false,
    sidebarRowSpacing: 10,
    sidebarRowIndentation: 20,
    sidebarItemPaddingLeft: 2,
    sidebarItemPaddingRight: 2,
    cardColumnsPerRow: 0,
    cardSpacing: 15,
    hideEmptyFeeds: false,
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
     useDomainIconsRss: false,
     useDomainIconsPodcast: false,
     useDomainIconsTwitter: false,
     useDomainIconsMastodon: false,
     articleDateStyle: "relative",
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
  storageMode: "vault-shards",
  storageFolder: ".rss-dashboard-data/feeds",
  storageSchemaVersion: 1,
  metadataStorageMode: "plugin-default",
  metadataStorageFolder: ".rss-dashboard-data",
  metadataStorageSchemaVersion: 1,
};
