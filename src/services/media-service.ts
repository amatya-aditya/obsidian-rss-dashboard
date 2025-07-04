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

                        
                        const match = response.text.match(/channelId"?\s*:\s*"(UC[\w-]{22})"/);
                        if (match?.[1]) {
                            channelId = match[1];
                        }
                    } catch (error) {
                        
                        new Notice(`Error fetching YouTube channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                }
            }
            
            else if (input.includes('youtube.com/user/')) {
                const match = input.match(/youtube\.com\/user\/([^\/\?#]+)/);
                if (match?.[1]) {
                    username = match[1];
                }
            }
            
            else if (input.includes('youtube.com/c/')) {
                const match = input.match(/youtube\.com\/c\/([^\/\?#]+)/);
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

                        
                        const idMatch = response.text.match(/channelId"?\s*:\s*"(UC[\w-]{22})"/);
                        if (idMatch?.[1]) {
                            channelId = idMatch[1];
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
            
            for (const item of feed.items.slice(0, 3)) {
                
                if (item.enclosure?.type?.startsWith('audio/')) {
                    return true;
                }
                
                
                if (item.duration || item.itunes?.duration) {
                    return true;
                }
                
                
                if (feed.author && (
                    feed.author.toLowerCase().includes('podcast') ||
                    feed.author.toLowerCase().includes('radio') ||
                    feed.author.toLowerCase().includes('audio')
                )) {
                    return true;
                }

                
                if (!item?.description) continue;

                const description = item.description.toLowerCase();
                
                
                if (this.extractPodcastAudio(item.description)) {
                    return true;
                }
                
                
                if (
                    description.includes('<enclosure') || 
                    description.includes('audio/') ||
                    description.includes('.mp3') ||
                    description.includes('podcast') ||
                    description.includes('episode') ||
                    description.includes('duration') ||
                    description.includes('length')
                ) {
                    return true;
                }
            }
        } catch (error) {
            
        }
        
        return false;
    }
    
    
    static extractYouTubeVideoId(link: string): string | undefined {
        if (!link) return undefined;

        try {
            
            const patterns = [
                /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/e\/|youtube\.com\/user\/[^\/]+\/u\/\d+\/videos\/|youtube\.com\/user\/[^\/]+\/|youtube\.com\/.*[?&]v=|youtube\.com\/.*[?&]v%3D|youtube\.com\/.+\/|youtube\.com\/(?:user|c)\/[^\/]+\/#p\/a\/u\/\d+\/|youtube\.com\/playlist\?list=|youtube\.com\/user\/[^\/]+\/videos\/|youtube\.com\/user\/[^\/]+\/)([^"&?\/\s]{11})/i,
                /(?:youtube\.com\/embed\/|youtube\.com\/v\/|youtu\.be\/)([^"&?\/\s]{11})/i
            ];
            
            for (const pattern of patterns) {
                const match = link.match(pattern);
                if (match?.[1]?.length === 11) {
                    return match[1];
                }
            }
        } catch (error) {
            
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
        } catch (error) {
            
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
        } catch (error) {
            
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
                
                thumbnail = thumbnailUrls[0] || item.coverImage;
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
