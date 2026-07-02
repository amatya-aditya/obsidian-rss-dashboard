export interface ParsedFeed {
  title: string;
  description?: string;
  link?: string;
  author?: string;
  image?: { url: string };
  items: ParsedItem[];
  type: "rss" | "atom" | "json";
  feedItunesImage: string;
  feedImageUrl: string;
}

export interface ParsedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  author?: string;
  content?: string;
  category?: string;
  mediaContentType?: string;
  mediaContentMedium?: string;
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
  image?: { url: string };

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

export interface FeedPreviewData {
  title: string;
  description: string;
  link: string;
  image: string;
  latestPubDate: string;
  hasEntries: boolean;
  feedUrl: string;
}

export interface FeedParseOptions {
  allowEmpty?: boolean;
  signal?: AbortSignal;
}

export interface ItunesLookupResponse {
  resultCount: number;
  results: Array<{
    wrapperType?: string;
    artistName?: string;
    trackName?: string;
    feedUrl?: string;
    artworkUrl600?: string;
    genres?: string[];
    trackCount?: number;
  }>;
}

export interface AllOriginsResponse {
  contents: string;
}

export interface Rss2JsonFeedItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
}

export interface Rss2JsonFeed {
  title?: string;
  description?: string;
  link?: string;
  language?: string;
  image?: string;
}

export interface Rss2JsonResponse {
  status: string;
  feed?: Rss2JsonFeed;
  items?: Rss2JsonFeedItem[];
  message?: string;
}

export interface JsonFeedAuthor {
  name?: string;
}

export interface JsonFeedItem {
  url?: string;
  title?: string;
  summary?: string;
  date_published?: string;
  id?: string;
  authors?: JsonFeedAuthor[];
  content_html?: string;
  content_text?: string;
  image?: string;
  category?: string;
  tags?: string[];
}

export interface JsonFeed {
  version?: string;
  title?: string;
  description?: string;
  home_page_url?: string;
  authors?: JsonFeedAuthor[];
  icon?: string;
  items?: JsonFeedItem[];
}
