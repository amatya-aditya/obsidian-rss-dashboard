import { TFile } from "obsidian";


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
    
    mediaType?: 'article' | 'video' | 'podcast';
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
    
    mediaType?: 'article' | 'video' | 'podcast';
    autoDetect?: boolean;
    customTemplate?: string;
    customFolder?: string;
    customTags?: string[];
    
    
    autoDeleteDuration?: number; 
    maxItemsLimit?: number; 
    scanInterval?: number; 
}


export interface FeedMetadata {
    title: string;
    url: string;
    folder: string;
    lastUpdated: number;
    author?: string;
    mediaType?: 'article' | 'video' | 'podcast';
    autoDetect?: boolean;
    customTemplate?: string;
    customFolder?: string;
    customTags?: string[];
    autoDeleteDuration?: number; 
    maxItemsLimit?: number; 
    scanInterval?: number;
    importStatus?: 'pending' | 'processing' | 'completed' | 'failed';
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


export interface MediaSettings {
    defaultYouTubeFolder: string;
    defaultYouTubeTag: string;
    defaultPodcastFolder: string;
    defaultPodcastTag: string;
    autoDetectMediaType: boolean;
    openInSplitView: boolean;
}

export interface ArticleSavingSettings {
    addSavedTag: boolean;
    defaultFolder: string;
    defaultTemplate: string;
    includeFrontmatter: boolean;
    frontmatterTemplate: string;
    saveFullContent: boolean;
    fetchTimeout: number;
}

export interface DisplaySettings {
    showCoverImage: boolean;
    showSummary: boolean;
    filterDisplayStyle: "vertical" | "inline";
    defaultFilter: "all" | "starred" | "unread" | "read" | "saved" | "videos" | "podcasts";
    hiddenFilters: string[];
    useDomainFavicons: boolean;
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
    collapsedFolders: string[];
    tagsCollapsed: boolean;
    articleFilter: {
        type: 'age' | 'read' | 'unread' | 'starred' | 'saved' | 'none';
        value: unknown;
    };
    articleSort: 'newest' | 'oldest';
    articleGroupBy: 'none' | 'feed' | 'date' | 'folder';
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
    
    media: MediaSettings;
    articleSaving: ArticleSavingSettings;
    display: DisplaySettings;
}


export const DEFAULT_SETTINGS: RssDashboardSettings = {
    feeds: [
        
    ],
    folders: [
        { name: "Videos", subfolders: [], createdAt: Date.now(), modifiedAt: Date.now() },
        { name: "Podcasts", subfolders: [], createdAt: Date.now(), modifiedAt: Date.now() }
    ],
    refreshInterval: 60, 
    maxItems: 25,
    viewStyle: "card",
    showFeedArt: true,
    showThumbnails: true,
    sidebarCollapsed: false,
    collapsedFolders: [],
    tagsCollapsed: true,
    articleFilter: { type: 'none', value: null },
    articleSort: 'newest',
    articleGroupBy: 'none',
    allArticlesPageSize: 50,
    unreadArticlesPageSize: 50,
    readArticlesPageSize: 50,
    savedArticlesPageSize: 50,
    starredArticlesPageSize: 50,
    availableTags: [
        { name: "Important", color: "#e74c3c" },
        { name: "Read Later", color: "#3498db" },
        { name: "Favorite", color: "#f1c40f" },
        { name: "YouTube", color: "#ff0000" },
        { name: "Podcast", color: "#8e44ad" }
    ],
    folderSortOrder: { by: "name", ascending: true },
    feedSortOrder: { by: "name", ascending: true },
    folderFeedSortOrders: {},
    viewLocation: "main",
    readerViewLocation: "main",
    useWebViewer: true,
    media: {
        defaultYouTubeFolder: "Videos",
        defaultYouTubeTag: "youtube",
        defaultPodcastFolder: "Podcasts",
        defaultPodcastTag: "podcast",
        autoDetectMediaType: false,
        openInSplitView: true
    },
    articleSaving: {
        addSavedTag: true,
        defaultFolder: "RSS Articles/",
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
        fetchTimeout: 10
    },
    display: {
        showCoverImage: true,
        showSummary: true,
        filterDisplayStyle: "inline",
        defaultFilter: "all",
        hiddenFilters: [],
        useDomainFavicons: true
    }
};
