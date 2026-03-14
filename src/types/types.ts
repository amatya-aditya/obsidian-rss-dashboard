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
  videoId?: string;
  videoUrl?: string;
  audioUrl?: string;
  duration?: string;
  author?: string;
  summary?: string;
  content?: string;
  saved?: boolean;
  savedFilePath?: string;

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
  title: string;
  url: string;
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
  iconUrl?: string;
  filters?: FeedFilterSettings;
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
  importStatus?: "pending" | "processing" | "completed" | "failed";
  importError?: string;
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

export type ViewLocation = "main" | "right-sidebar" | "left-sidebar";

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
  defaultYouTubeFolder: string;
  defaultYouTubeTag: string;
  detectYouTubeShorts: boolean;
  defaultPodcastFolder: string;
  defaultPodcastTag: string;
  defaultRssFolder: string;
  defaultRssTag: string;
  defaultSmallwebFolder: string;
  defaultSmallwebTag: string;
  openInSplitView: boolean;
  podcastTheme: PodcastTheme;
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
  useDomainFavicons: boolean;
  hideDefaultRssIcon: boolean;
  autoMarkReadOnOpen: boolean;
  sidebarRowSpacing: number;
  sidebarRowIndentation: number;
  sidebarItemPaddingLeft: number;
  sidebarItemPaddingRight: number;
  cardColumnsPerRow: number;
  cardSpacing: number;
}

export type ReaderTextAlign = "justify" | "left";
export type ReaderFontFamily = "default" | "serif" | "sans" | "mono";
export type ReaderParagraphSpacing = "default" | "tight" | "normal" | "loose";

export interface ReaderFormatSettings {
  textAlign: ReaderTextAlign;
  wordsPerLine: number;
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
  enabled: boolean;
  createdAt: number;
}

export interface GlobalFilterSettings {
  includeLogic: "AND" | "OR";
  bypassAll: boolean;
  rules: KeywordFilterRule[];
}

export interface FeedFilterSettings {
  overrideGlobalFilters: boolean;
  includeLogic: "AND" | "OR";
  rules: KeywordFilterRule[];
}

export interface FreshRSSSettings {
  enabled: boolean;
  serverUrl: string;
  username: string;
  password: string;
  syncInterval: number; // minutes — how often to sync with FreshRSS
  syncReadState: boolean; // push read/unread to server
  syncStarredState: boolean; // push starred to server
  importFeeds: boolean; // import subscriptions from FreshRSS
  lastSyncTime: number;
}

export interface RssDashboardSettings {
  feeds: Feed[];
  folders: Folder[];
  refreshInterval: number;
  maxItems: number;
  viewStyle: "list" | "card";
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
    by: "name" | "created" | "modified";
    ascending: boolean;
  };
  feedSortOrder?: {
    by: "name" | "created" | "itemCount";
    ascending: boolean;
  };
  folderFeedSortOrders?: {
    [folderPath: string]: {
      by: "name" | "created" | "itemCount";
      ascending: boolean;
    };
  };
  viewLocation: ViewLocation;
  readerViewLocation: ViewLocation;
  useWebViewer: boolean;

  readerFormat: ReaderFormatSettings;

  media: MediaSettings;
  articleSaving: ArticleSavingSettings;
  display: DisplaySettings;
  highlights: HighlightSettings;
  filters: GlobalFilterSettings;
  freshRSS: FreshRSSSettings;
}

export type SettingsOnly = Omit<RssDashboardSettings, 'feeds' | 'folders' | 'availableTags'>;

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
  maxItems: 25,
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
    { name: "Read-later", color: "#3498db" },
    { name: "Favorite", color: "#f1c40f" },
    { name: "YouTube", color: "#ff0000" },
    { name: "Podcast", color: "#8e44ad" },
  ],
  folderSortOrder: { by: "name", ascending: true },
  feedSortOrder: { by: "name", ascending: true },
  folderFeedSortOrders: {},
  viewLocation: "main",
  readerViewLocation: "main",
  useWebViewer: true,
  readerFormat: {
    textAlign: "justify",
    wordsPerLine: 0,
    fontScalePct: 100,
    lineHeightPct: 160,
    fontFamily: "default",
    paragraphSpacing: "default",
  },
  media: {
    defaultYouTubeFolder: "Videos",
    defaultYouTubeTag: "youtube",
    detectYouTubeShorts: false,
    defaultPodcastFolder: "Podcast",
    defaultPodcastTag: "podcast",
    defaultRssFolder: "RSS",
    defaultRssTag: "RSS",
    defaultSmallwebFolder: "Smallweb",
    defaultSmallwebTag: "smallweb",
    openInSplitView: true,
    podcastTheme: "obsidian",
  },
  articleSaving: {
    addSavedTag: true,
    defaultFolder: "RSS articles/",
    defaultTemplate: `---
title: "{{title}}"
date: {{date}}
tags: [{{tags}}]
source: "{{source}}"
link: {{link}}
author: "{{author}}"
feedTitle: "{{feedTitle}}"
guid: "{{guid}}"
---

# {{title}}

{{content}}

[Source]({{link}})`,
    includeFrontmatter: true,
    frontmatterTemplate: `---
title: "{{title}}"
date: {{date}}
tags: [{{tags}}]
source: "{{source}}"
link: {{link}}
author: "{{author}}"
feedTitle: "{{feedTitle}}"
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
    useDomainFavicons: true,
    hideDefaultRssIcon: false,
    autoMarkReadOnOpen: false,
    sidebarRowSpacing: 10,
    sidebarRowIndentation: 20,
    sidebarItemPaddingLeft: 2,
    sidebarItemPaddingRight: 2,
    cardColumnsPerRow: 0,
    cardSpacing: 15,
  },
  highlights: {
    enabled: false,
    defaultColor: "#ffd700",
    highlightInContent: true,
    highlightInTitles: true,
    highlightInSummaries: true,
    words: [],
  },
  filters: {
    includeLogic: "AND",
    bypassAll: false,
    rules: [],
  },
  freshRSS: {
    enabled: false,
    serverUrl: "",
    username: "",
    password: "",
    syncInterval: 30,
    syncReadState: true,
    syncStarredState: true,
    importFeeds: true,
    lastSyncTime: 0,
  },
};
