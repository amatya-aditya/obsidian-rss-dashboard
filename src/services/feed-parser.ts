import { requestUrl, Notice } from "obsidian";
import { Feed, FeedItem, MediaSettings, Tag } from "../types.js";
import { MediaService } from "./media-service";
import Parser from "rss-parser";

export async function fetchFeedXml(url: string): Promise<string> {
    try {
        
        const secureUrl = url.replace(/^http:\/\//i, 'https://');
        
        console.log(`Fetching feed from: ${secureUrl}`);
        
        const response = await requestUrl({
            url: secureUrl,
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8"
            }
        });

        console.log(`Feed response status: ${response.status}`);
        console.log(`Feed response headers:`, response.headers);
        
        if (!response.text) {
            throw new Error('Empty response from feed');
        }

        return response.text;
    } catch (error) {
        console.error(`Error fetching feed ${url}:`, error);
        throw error;
    }
}

export class FeedParser {
    private mediaSettings: MediaSettings;
    private availableTags: Tag[];
    private parser: Parser<any, any>;
    
    constructor(mediaSettings: MediaSettings, availableTags: Tag[]) {
        this.mediaSettings = mediaSettings;
        this.availableTags = availableTags;
        this.parser = new Parser();
    }
    
    /**
     * Extract cover image from HTML content
     */
    private extractCoverImage(html: string): string {
        if (!html) return "";
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            
            
            const ogImage = doc.querySelector('meta[property="og:image"]');
            if (ogImage?.getAttribute("content")) {
                const content = ogImage.getAttribute("content");
                if (content && content.startsWith("http")) {
                    return content;
                }
            }
            
            
            const twitterImage = doc.querySelector('meta[name="twitter:image"]');
            if (twitterImage?.getAttribute("content")) {
                const content = twitterImage.getAttribute("content");
                if (content && content.startsWith("http")) {
                    return content;
                }
            }

            
            const firstImg = doc.querySelector("img");
            if (firstImg?.getAttribute("src")) {
                const src = firstImg.getAttribute("src");
                if (src && src.startsWith("http")) {
                    return src;
                }
            }
            
            
            const imgTags = doc.querySelectorAll("img");
            for (const img of Array.from(imgTags)) {
                const src = img.getAttribute("src");
                if (src && src.startsWith("http") && 
                    (src.endsWith(".jpg") || src.endsWith(".jpeg") || 
                     src.endsWith(".png") || src.endsWith(".gif") || 
                     src.includes("image"))) {
                    return src;
                }
            }
        } catch (e) {
            console.error("Error extracting cover image:", e);
        }

        return "";
    }
    
    /**
     * Extract a summary from the description HTML
     */
    private extractSummary(description: string, maxLength = 150): string {
        if (!description) return "";
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(description, "text/html");
            let text = doc.body.textContent || "";
            
            
            text = text.replace(/\s+/g, ' ')
                      .replace(/&nbsp;/g, ' ')
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'")
                      .trim();
            
            
            if (text.length > maxLength) {
                text = text.substring(0, maxLength) + '...';
            }
            
            return text;
        } catch (e) {
            console.error("Error extracting summary:", e);
            return "";
        }
    }
    
    /**
     * Parse a feed URL and retrieve items
     */
    async parseFeed(url: string, existingFeed: Feed | null = null): Promise<Feed> {
        if (!url) {
            throw new Error("Feed URL is required");
        }
        
        try {
            const responseText = await fetchFeedXml(url);
            const parsed = await this.parser.parseString(responseText);

            
            const feedTitle = existingFeed?.title || parsed.title || "Unnamed Feed";
            const feedLink = existingFeed?.url || parsed.link;
            
            const newFeed: Feed = existingFeed || {
                title: feedTitle,
                url: url,
                folder: "Uncategorized",
                items: [],
                lastUpdated: Date.now()
            };

            
            const items: FeedItem[] = parsed.items.map((item: any) => {
                
                const existingItem = newFeed.items.find(fi => fi.guid === item.guid);
                
                
                const coverImage = this.extractCoverImage(item.content || item.description || '');
                const summary = this.extractSummary(item.content || item.description || '');

                
                const isPodcast = parsed.itunes?.author || 
                                item.enclosure?.type?.startsWith('audio/') ||
                                parsed.type === 'podcast';
				const itemLink = item.link && item.link.startsWith('http')
					? item.link
					: feedLink
						? new URL(item.link, feedLink).toString()
						: item.link || '#';
				return {
                    title: item.title || 'No title',
                    link: itemLink,
                    description: item.description || '',
                    pubDate: item.pubDate || new Date().toISOString(),
                    guid: item.guid || item.link || '',
                    read: existingItem ? existingItem.read : false,
                    starred: existingItem ? existingItem.starred : false,
                    tags: existingItem ? existingItem.tags : [],
                    feedTitle: newFeed.title,
                    feedUrl: newFeed.url,
                    coverImage,
                    summary,
                    author: item.author || parsed.author,
                    saved: existingItem ? existingItem.saved : false,
                    mediaType: isPodcast ? 'podcast' : 'article',
                    
                    duration: item.duration,
                    explicit: item.explicit === 'yes',
                    image: item.image?.url || parsed.image?.url,
                    category: item.category,
                    episodeType: item.episodeType,
                    season: item.season,
                    episode: item.episode,
                    enclosure: item.enclosure ? {
                        url: item.enclosure.url,
                        type: item.enclosure.type,
                        length: item.enclosure.length
                    } : undefined
                };
            });

            
            newFeed.items = items;
            newFeed.lastUpdated = Date.now();

            
            if (this.mediaSettings.autoDetectMediaType) {
                const processedFeed = MediaService.detectAndProcessFeed(newFeed);
                
                
                if (processedFeed.mediaType === 'video' && !existingFeed?.folder) {
                    processedFeed.folder = this.mediaSettings.defaultYouTubeFolder;
                } else if (processedFeed.mediaType === 'podcast' && !existingFeed?.folder) {
                    processedFeed.folder = this.mediaSettings.defaultPodcastFolder;
                }
                
                
                return MediaService.applyMediaTags(processedFeed, this.availableTags);
            }

            return newFeed;
        } catch (error) {
            console.error(`Error parsing feed ${url}:`, error);
            throw error;
        }
    }
    
    /**
     * Refresh a single feed
     */
    async refreshFeed(feed: Feed): Promise<Feed> {
        try {
            return await this.parseFeed(feed.url, feed);
        } catch (error) {
            console.error(`Error refreshing feed ${feed.title}:`, error);
            return feed;
        }
    }
    
    /**
     * Refresh all feeds
     */
    async refreshAllFeeds(feeds: Feed[]): Promise<Feed[]> {
        const updatedFeeds: Feed[] = [];
        
        for (const feed of feeds) {
            try {
                const refreshedFeed = await this.refreshFeed(feed);
                updatedFeeds.push(refreshedFeed);
            } catch (error) {
                console.error(`Error refreshing feed ${feed.title}:`, error);
                updatedFeeds.push(feed); 
            }
        }
        
        return updatedFeeds;
    }
}

interface CustomFeed {
    title?: string;
    items: CustomItem[];
}

interface CustomItem {
    title?: string;
    link?: string;
    description?: string;
    pubDate?: string;
    author?: string;
    content?: string;
    guid?: string;
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
}

export class FeedParserService {
    private static instance: FeedParserService;
    private parser: Parser<CustomFeed, CustomItem>;

    private constructor() {
        this.parser = new Parser({
            customFields: {
                item: [
                    ['itunes:duration', 'itunes.duration'],
                    ['itunes:explicit', 'itunes.explicit'],
                    ['itunes:image', 'itunes.image'],
                    ['itunes:category', 'itunes.category'],
                    ['itunes:summary', 'itunes.summary'],
                    ['itunes:episodeType', 'itunes.episodeType'],
                    ['itunes:season', 'itunes.season'],
                    ['itunes:episode', 'itunes.episode']
                ]
            }
        });
    }

    public static getInstance(): FeedParserService {
        if (!FeedParserService.instance) {
            FeedParserService.instance = new FeedParserService();
        }
        return FeedParserService.instance;
    }

    private async fetchFeedXml(url: string): Promise<string> {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch feed: ${response.statusText}`);
        }

        return await response.text();
    }

    public async parseFeed(url: string, folder: string): Promise<Feed> {
        try {
            const xml = await this.fetchFeedXml(url);
            const parsed = await this.parser.parseString(xml);

            
            const isPodcast = parsed.items.some(item => 
                item.enclosure?.type?.startsWith('audio/') || 
                item.itunes?.duration || 
                item.itunes?.explicit
            );

            const items: FeedItem[] = parsed.items.map((item: any) => ({
                title: item.title || "",
                link: item.link || "",
                description: item.description || "",
                pubDate: item.pubDate || new Date().toISOString(),
                guid: item.guid || item.link || "",
                read: false,
                starred: false,
                tags: [],
                feedTitle: parsed.title || "",
                feedUrl: url,
                coverImage: item.itunes?.image?.href || item.image?.url || "",
                mediaType: isPodcast ? 'podcast' : 'article',
                author: item.author || "",
                content: item.content || "",
                saved: false,
                
                duration: item.itunes?.duration || "",
                explicit: item.itunes?.explicit === "yes",
                image: item.itunes?.image?.href || item.image?.url || "",
                category: item.itunes?.category || "",
                summary: item.itunes?.summary || "",
                episodeType: item.itunes?.episodeType || "",
                season: item.itunes?.season ? Number(item.itunes.season) : undefined,
                episode: item.itunes?.episode ? Number(item.itunes.episode) : undefined,
                enclosure: item.enclosure ? {
                    url: item.enclosure.url,
                    type: item.enclosure.type,
                    length: item.enclosure.length
                } : undefined
            }));

            return {
                title: parsed.title || "",
                url: url,
                items: items,
                folder: folder,
                lastUpdated: Date.now(),
                mediaType: isPodcast ? 'podcast' : 'article'
            };
        } catch (error) {
            console.error("Error parsing feed:", error);
            throw error;
        }
    }
}
