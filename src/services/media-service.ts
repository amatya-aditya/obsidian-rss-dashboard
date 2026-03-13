import { requestUrl, Notice } from "obsidian";
import { Feed, FeedItem, Tag } from "../types/types";

export class MediaService {
    private static readonly YOUTUBE_PATTERNS = [
        'youtube.com/feeds/videos.xml',
        'youtube.com/channel/',
        'youtube.com/user/',
        'youtube.com/c/',
        'youtube.com/@',
        'youtube.com/watch',
        'youtu.be/'
    ];

    
    static isYouTubeFeed(url: string): boolean {
        if (!url) return false;
        return this.YOUTUBE_PATTERNS.some(pattern => url.includes(pattern));
    }
    
    
    static async getYouTubeRssFeed(input: string): Promise<string | null> {
        if (!input) {
            
            return null;
        }

        let channelId = "";
        let username = "";
        
        try {
           
            if (/^UC[\w-]{22}$/.test(input)) {
                return `https://www.youtube.com/feeds/videos.xml?channel_id=${input}`;
            }
            
            else if (input.includes('youtube.com/channel/')) {
                const match = input.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
                if (match?.[1]) {
                    channelId = match[1];
                }
            }
            
            else if (input.includes('@')) {
                let handle = "";
                if (input.includes('youtube.com/@')) {
                    handle = input.split('youtube.com/@')[1].split(/[?#/]/)[0];
                } else if (input.startsWith('@')) {
                    handle = input.substring(1);
                }
                
                handle = handle.toLowerCase();
                if (handle) {
                    try {
                        const response = await requestUrl({
                            url: `https://www.youtube.com/@${handle}`,
                            method: "GET",
                            headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                            }
                        });
                        
                        if (!response.text) {
                            throw new Error("Empty response from YouTube");
                        }

                        
                        // Try multiple patterns to extract channel ID from YouTube page HTML
                        // Canonical/meta patterns are most reliable — they identify the page owner
                        const patterns = [
                            /<meta[^>]*itemprop="channelId"[^>]*content="(UC[\w-]{22})"[^>]*>/,
                            /<link[^>]*rel="canonical"[^>]*href="[^"]*youtube\.com\/channel\/(UC[\w-]{22})"[^>]*>/,
                            /<meta[^>]*content="[^"]*youtube\.com\/channel\/(UC[\w-]{22})"[^>]*>/,
                            /<link[^>]*href="[^"]*youtube\.com\/channel\/(UC[\w-]{22})"[^>]*>/,
                            /"externalId"\s*:\s*"(UC[\w-]{22})"/,
                            /data-channel-external-id="(UC[\w-]{22})"/,
                            /channelId"?\s*:\s*"(UC[\w-]{22})"/,
                            /channel_id=(UC[\w-]{22})/,
                            /youtube\.com\/channel\/(UC[\w-]{22})/,
                            /browseId"?\s*:\s*"(UC[\w-]{22})"/
                        ];
                        for (const pattern of patterns) {
                            const match = response.text.match(pattern);
                            if (match?.[1]) {
                                channelId = match[1];
                                break;
                            }
                        }
                        if (!channelId) {
                            console.warn('[RSS Dashboard] Could not extract channel ID from YouTube page for handle:', handle);
                        }
                    } catch (error) {
                        console.error('[RSS Dashboard] Error fetching YouTube channel page:', error);
                        new Notice(`Error fetching YouTube channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                }
            }
            
            else if (input.includes('youtube.com/user/')) {
                const match = input.match(/youtube\.com\/user\/([^/?#]+)/);
                if (match?.[1]) {
                    username = match[1];
                }
            }
            
            else if (input.includes('youtube.com/c/')) {
                const match = input.match(/youtube\.com\/c\/([^/?#]+)/);
                if (match?.[1]) {
                    try {
                        const response = await requestUrl({
                            url: `https://www.youtube.com/c/${match[1]}`,
                            method: "GET",
                            headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                            }
                        });
                        
                        if (!response.text) {
                            throw new Error("Empty response from YouTube");
                        }

                        
                        const cPatterns = [
                            /channelId"?\s*:\s*"(UC[\w-]{22})"/,
                            /channel_id=(UC[\w-]{22})/,
                            /"externalId"\s*:\s*"(UC[\w-]{22})"/,
                            /youtube\.com\/channel\/(UC[\w-]{22})/,
                            /browseId"?\s*:\s*"(UC[\w-]{22})"/
                        ];
                        for (const pattern of cPatterns) {
                            const idMatch = response.text.match(pattern);
                            if (idMatch?.[1]) {
                                channelId = idMatch[1];
                                break;
                            }
                        }
                    } catch (error) {
                        
                        new Notice(`Error fetching YouTube channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                }
            }
            
            else if (!/\s/.test(input) && !input.includes('/')) {
                if (!/^UC[\w-]{22}$/.test(input)) {
                    username = input;
                }
            }
            
            
            if (channelId) {
                return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            } else if (username) {
                return `https://www.youtube.com/feeds/videos.xml?user=${username}`;
            }
        } catch (error) {
            
            new Notice(`Error processing YouTube feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        return null;
    }
    
    
    static isPodcastFeed(feed: Feed): boolean {
        if (!feed?.items?.length) return false;

        try {
            const audioExt = /\.(mp3|m4a|aac|ogg|opus|wav|flac)(?:\?|$)/i;
            const itemsToCheck = feed.items.slice(0, Math.min(10, feed.items.length));

            let audioLikeCount = 0;
            for (const item of itemsToCheck) {
                const hasAudioEnclosure = !!(item.enclosure?.type?.startsWith('audio/'));
                const hasAudioUrlInEnclosure = !!(item.enclosure?.url && audioExt.test(item.enclosure.url));
                const audioInDescription = !!(item.description && this.extractPodcastAudio(item.description));
                const audioInLink = !!(item.link && audioExt.test(item.link));

                if (hasAudioEnclosure || hasAudioUrlInEnclosure || audioInDescription || audioInLink) {
                    audioLikeCount++;
                }
            }

            return audioLikeCount > 0;
        } catch {
            return false;
        }
    }
    
    
    static extractYouTubeVideoId(link: string): string | undefined {
        if (!link) return undefined;

        try {
            
            const patterns = [
                /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/e\/|youtube\.com\/user\/[^/]+\/u\/\d+\/videos\/|youtube\.com\/user\/[^/]+\/|youtube\.com\/.*[?&]v=|youtube\.com\/.*[?&]v%3D|youtube\.com\/.+\/|youtube\.com\/(?:user|c)\/[^/]+\/#p\/a\/u\/\d+\/|youtube\.com\/playlist\?list=|youtube\.com\/user\/[^/]+\/videos\/|youtube\.com\/user\/[^/]+\/)([^"&?/\s]{11})/i,
                /(?:youtube\.com\/embed\/|youtube\.com\/v\/|youtu\.be\/)([^"&?/\s]{11})/i
            ];
            
            for (const pattern of patterns) {
                const match = link.match(pattern);
                if (match?.[1]?.length === 11) {
                    return match[1];
                }
            }
        } catch {
            // Regex matching failed, return undefined
        }
        
        return undefined;
    }
    
    
    static extractPodcastAudio(description: string): string | undefined {
        if (!description) return undefined;
        
        try {
            
            const enclosureMatch = description.match(/<enclosure[^>]*url=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i);
            if (enclosureMatch?.[1]) {
                return enclosureMatch[1];
            }
            
            
            const audioMatch = description.match(/<audio[^>]*src=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i);
            if (audioMatch?.[1]) {
                return audioMatch[1];
            }
            
            
            const audioLinkMatch = description.match(/href=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i);
            if (audioLinkMatch?.[1]) {
                return audioLinkMatch[1];
            }
            
            
            const sourceMatch = description.match(/<source[^>]*src=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i);
            if (sourceMatch?.[1]) {
                return sourceMatch[1];
            }
        } catch {
            // Regex matching failed, return undefined
        }
        
        return undefined;
    }
    
    
    static extractPodcastDuration(description: string): string | undefined {
        if (!description) return undefined;
        
        try {
            
            const durationMatch = description.match(/duration[^0-9]*(\d+:\d+(?::\d+)?)/i) || 
                                description.match(/length[^0-9]*(\d+:\d+(?::\d+)?)/i) ||
                                description.match(/time[^0-9]*(\d+:\d+(?::\d+)?)/i) ||
                                description.match(/(\d+:\d+(?::\d+)?)\s*(?:min|minutes|mins)/i);
            
            if (durationMatch?.[1]) {
                return durationMatch[1];
            }
        } catch {
            // Regex matching failed, return undefined
        }
        
        return undefined;
    }
    
    
    static processYouTubeFeed(feed: Feed): Feed {
        feed.mediaType = 'video';
        
        
        const updatedItems = feed.items.map(item => {
            const videoId = this.extractYouTubeVideoId(item.link);
            
            let thumbnail = item.coverImage;
            if (videoId) {
                const thumbnailUrls = [
                    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, 
                    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,     
                    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,     
                    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,     
                    `https://img.youtube.com/vi/${videoId}/default.jpg`        
                ];
                
                thumbnail = thumbnailUrls[1] || item.coverImage; // Use hqdefault — maxresdefault often 404s for Shorts
            }
            
            return {
                ...item,
                mediaType: 'video' as const,
                videoId: videoId,
                coverImage: thumbnail || item.coverImage
            };
        });
        
        
        return {
            ...feed,
            items: updatedItems
        };
    }
    
    
    static processPodcastFeed(feed: Feed): Feed {
        feed.mediaType = 'podcast';
        
        
        const updatedItems = feed.items.map(item => {
            
            const audioUrl = item.enclosure?.url || this.extractPodcastAudio(item.description);
            const duration = item.duration || item.itunes?.duration || this.extractPodcastDuration(item.description);
            
            return {
                ...item,
                mediaType: 'podcast' as const,
                audioUrl: audioUrl,
                duration: duration,
                
                enclosure: item.enclosure
            };
        });
        
        
        return {
            ...feed,
            items: updatedItems
        };
    }
    
    
    static detectAndProcessFeed(feed: Feed): Feed {
        
        if (this.isYouTubeFeed(feed.url)) {
            return this.processYouTubeFeed(feed);
        }

        
        const hasVideo = feed.items.some(item => item.enclosure?.type?.startsWith('video/'));
        if (hasVideo) {
            return {
                ...feed,
                mediaType: 'video',
                items: feed.items.map(item => {
                    if (item.enclosure?.type?.startsWith('video/')) {
                        return {
                            ...item,
                            mediaType: 'video',
                            videoUrl: item.enclosure.url
                        };
                    }
                    return item;
                })
            };
        }

        
        if (this.isPodcastFeed(feed)) {
            return this.processPodcastFeed(feed);
        }

        
        return {
            ...feed,
            mediaType: 'article' as const,
            items: feed.items.map(item => ({
                ...item,
                mediaType: 'article' as const
            }))
        };
    }
    
    
    static getYouTubePlayerHtml(videoId: string, width = 560, height = 315): string {
        return `
            <div class="rss-dashboard-media-player youtube-player">
                <iframe 
                    width="${width}" 
                    height="${height}" 
                    src="https://www.youtube.com/embed/${videoId}" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            </div>
        `;
    }
    
    
    static getAudioPlayerHtml(audioUrl: string, title = ''): string {
        return `
            <div class="rss-dashboard-media-player audio-player">
                <div class="audio-player-title">${title}</div>
                <audio controls preload="metadata">
                    <source src="${audioUrl}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>
        `;
    }
    
    
    /**
     * Extract channel_id from a YouTube RSS feed URL.
     * Returns null for user-based feed URLs.
     */
    static extractChannelIdFromFeedUrl(feedUrl: string): string | null {
        const match = feedUrl.match(/[?&]channel_id=(UC[\w-]{22})/);
        return match?.[1] ?? null;
    }

    /**
     * Convert a YouTube channel ID (UC...) to its uploads playlist ID (UU...).
     */
    static channelIdToUploadsPlaylistId(channelId: string): string {
        return 'UU' + channelId.substring(2);
    }

    /**
     * Fetch videos from a YouTube channel using the Data API v3.
     * Returns FeedItem[] with the same guid format as RSS (yt:video:{videoId}).
     * Falls back to null if the API call fails so the caller can use RSS instead.
     */
    static async fetchYouTubeApiVideos(
        feedUrl: string,
        apiKey: string,
        maxVideos: number,
        feedTitle: string
    ): Promise<FeedItem[] | null> {
        const channelId = this.extractChannelIdFromFeedUrl(feedUrl);
        if (!channelId) {
            return null;
        }

        const playlistId = this.channelIdToUploadsPlaylistId(channelId);
        const items: FeedItem[] = [];
        let pageToken: string | undefined;

        try {
            while (items.length < maxVideos) {
                const maxResults = Math.min(50, maxVideos - items.length);
                let apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${maxResults}&key=${apiKey}`;
                if (pageToken) {
                    apiUrl += `&pageToken=${pageToken}`;
                }

                const response = await requestUrl({ url: apiUrl });
                const data = response.json as {
                    items?: Array<{
                        snippet: {
                            title: string;
                            description: string;
                            publishedAt: string;
                            resourceId: { videoId: string };
                            thumbnails?: Record<string, { url: string }>;
                            channelTitle?: string;
                        };
                    }>;
                    nextPageToken?: string;
                    error?: { message: string };
                };

                if (data.error) {
                    console.error('[RSS Dashboard] YouTube API error:', data.error.message);
                    return null;
                }

                if (!data.items?.length) break;

                for (const apiItem of data.items) {
                    const snippet = apiItem.snippet;
                    const videoId = snippet.resourceId.videoId;
                    const thumbnail =
                        snippet.thumbnails?.maxres?.url ??
                        snippet.thumbnails?.high?.url ??
                        snippet.thumbnails?.medium?.url ??
                        snippet.thumbnails?.default?.url ??
                        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

                    items.push({
                        title: snippet.title,
                        link: `https://www.youtube.com/watch?v=${videoId}`,
                        description: snippet.description,
                        pubDate: snippet.publishedAt,
                        guid: `yt:video:${videoId}`,
                        read: false,
                        starred: false,
                        tags: [],
                        feedTitle: feedTitle,
                        feedUrl: feedUrl,
                        coverImage: thumbnail,
                        mediaType: 'video',
                        videoId: videoId,
                        author: snippet.channelTitle ?? ''
                    });
                }

                pageToken = data.nextPageToken;
                if (!pageToken) break;
            }

            return items;
        } catch (error) {
            console.error('[RSS Dashboard] YouTube API request failed:', error);
            return null;
        }
    }

    static applyMediaTags(feed: Feed, availableTags: Tag[]): Feed {
        if (!feed.mediaType || feed.mediaType === 'article') {
            return feed;
        }

        
        let tagName: string | undefined;
        if (feed.mediaType === 'video') {
            tagName = this.isYouTubeFeed(feed.url) ? 'youtube' : 'video';
        } else if (feed.mediaType === 'podcast') {
            tagName = 'podcast';
        }

        if (!tagName) return feed;

        const mediaTag = availableTags.find(t => t.name.toLowerCase() === tagName);
        if (!mediaTag) return feed;

        const updatedItems = feed.items.map(item => {
            if (!item.tags) item.tags = [];
            if (!item.tags.some(t => t.name.toLowerCase() === tagName)) {
                item.tags.push({ ...mediaTag });
            }
            return item;
        });

        return {
            ...feed,
            items: updatedItems
        };
    }
}
