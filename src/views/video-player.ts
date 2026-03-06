import { Notice, Setting } from "obsidian";
import { FeedItem } from "../types/types";
import { setIcon } from "obsidian";
import { ensureUtf8Meta } from '../utils/platform-utils';
import { MediaService } from "../services/media-service";

export class VideoPlayer {
    private container: HTMLElement;
    private currentItem: FeedItem | null = null;
    private playerEl: HTMLElement | null = null;
    private iframeEl: HTMLIFrameElement | null = null;
    private onVideoSelect?: (item: FeedItem) => void;
    
    constructor(container: HTMLElement, onVideoSelect?: (item: FeedItem) => void) {
        this.container = container;
        this.onVideoSelect = onVideoSelect;
    }
    
    
    loadVideo(item: FeedItem): void {
        if (!item.videoId) {
            
            new Notice("No video ID provided");
            return;
        }
        
        try {
            this.currentItem = item;
            this.render();
        } catch (error) {
            
            new Notice(`Error loading video: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    
    private render(): void {
        if (!this.currentItem || !this.currentItem.videoId) return;
        const embed = MediaService.buildYouTubeEmbed(this.currentItem.videoId);
        
        this.container.empty();
        
        
        this.playerEl = this.container.createDiv({
            cls: "rss-video-player",
        });
        
        
        
        
        const videoContainer = this.playerEl.createDiv({
            cls: "rss-video-container",
        });
        
        
        this.iframeEl = this.container.createEl("iframe", {
            attr: {
                src: embed.embedUrl,
                allow: embed.allow,
                referrerpolicy: embed.referrerPolicy
            }
        });
        this.iframeEl.allowFullscreen = true;
        
        videoContainer.appendChild(this.iframeEl);
        
        
        const details = this.playerEl.createDiv({
            cls: "rss-video-details",
        });
        
        const titleSetting = new Setting(details).setName(this.currentItem.title).setHeading();
        titleSetting.settingEl.addClass("rss-video-title");
        
        const metaContainer = details.createDiv({
            cls: "rss-video-meta",
        });
        
        
        metaContainer.createDiv({
            cls: "rss-video-channel",
            text: this.currentItem.feedTitle,
        });
        
        
        metaContainer.createDiv({
            cls: "rss-video-date",
            text: new Date(this.currentItem.pubDate).toLocaleDateString(),
        });
        
        
        if (this.currentItem.description) {
            const descriptionContainer = details.createDiv({
                cls: "rss-video-description",
            });
            
            
            const cleanHtml = (html: string): string => {
                const htmlWithMeta = ensureUtf8Meta(html);
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlWithMeta, "text/html");
                
                
                doc.querySelectorAll("script").forEach(el => el.remove());
                
                
                doc.querySelectorAll("a").forEach(link => {
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                });
                
                return new XMLSerializer().serializeToString(doc.body);
            };
            
            descriptionContainer.textContent = cleanHtml(this.currentItem.description);
        }
        
        
        const linksContainer = this.playerEl.createDiv({
            cls: "rss-video-links",
        });
        
        
        const youtubeButton = linksContainer.createEl("a", {
            cls: "rss-video-youtube-button",
            href: embed.watchUrl,
        });
        youtubeButton.target = "_blank";
        youtubeButton.rel = "noopener noreferrer";
        
        const youtubeIcon = youtubeButton.createSpan({
            cls: "rss-video-youtube-button-icon",
        });
        setIcon(youtubeIcon, "youtube");
        youtubeButton.createSpan({
            text: "Watch on YouTube",
        });
        
        
        const relatedContainer = this.playerEl.createDiv({
            cls: "rss-video-related",
        });
        
        relatedContainer.createEl("h4", {
            text: "From the same channel",
        });
        
        
        const relatedVideos = this.findRelatedVideos();
        
        if (relatedVideos.length > 0) {
            const relatedList = relatedContainer.createDiv({
                cls: "rss-video-related-list",
            });
            
            relatedVideos.forEach(video => {
                const videoItem = relatedList.createDiv({
                    cls: "rss-video-related-item",
                });
                
                
                if (video.videoId) {
                    const thumbnail = videoItem.createDiv({
                        cls: "rss-video-related-thumbnail",
                    });
                    
                    thumbnail.createEl("img", {
                        attr: {
                            src: `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
                            alt: video.title,
                        },
                    });
                }
                
                
                const videoInfo = videoItem.createDiv({
                    cls: "rss-video-related-info",
                });
                
                videoInfo.createDiv({
                    cls: "rss-video-related-title",
                    text: video.title,
                });
                
                videoInfo.createDiv({
                    cls: "rss-video-related-date",
                    text: new Date(video.pubDate).toLocaleDateString(),
                });
                
                
                videoItem.addEventListener("click", () => {
                    if (this.onVideoSelect) {
                        this.onVideoSelect(video);
                    } else {
                        this.loadVideo(video);
                    }
                });
            });
        } else {
            relatedContainer.createDiv({
                cls: "rss-video-related-empty",
                text: "No related videos found",
            });
        }
    }
    
    
    private findRelatedVideos(): FeedItem[] {
        if (!this.currentItem) return [];
        
        
        
        
        return []; 
    }
    
    
    setRelatedVideos(videos: FeedItem[]): void {
        if (!this.currentItem) return;
        
        
        const relatedVideos = videos.filter(v => 
            this.currentItem &&
            v.guid !== this.currentItem.guid && 
            v.videoId && 
            v.feedUrl === this.currentItem.feedUrl
        ).slice(0, 5);
        
        
        const relatedContainer = this.playerEl?.querySelector(".rss-video-related");
        if (relatedContainer) {
            
            relatedContainer.empty();
            
            relatedContainer.createEl("h4", {
                text: "From the same channel",
            });
            
            if (relatedVideos.length > 0) {
                const relatedList = relatedContainer.createDiv({
                    cls: "rss-video-related-list",
                });
                
                relatedVideos.forEach(video => {
                    const videoItem = relatedList.createDiv({
                        cls: "rss-video-related-item",
                    });
                    
                    
                    if (video.videoId) {
                        const thumbnail = videoItem.createDiv({
                            cls: "rss-video-related-thumbnail",
                        });
                        
                        thumbnail.createEl("img", {
                            attr: {
                                src: `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
                                alt: video.title,
                            },
                        });
                    }
                    
                    
                    const videoInfo = videoItem.createDiv({
                        cls: "rss-video-related-info",
                    });
                    
                    videoInfo.createDiv({
                        cls: "rss-video-related-title",
                        text: video.title,
                    });
                    
                    videoInfo.createDiv({
                        cls: "rss-video-related-date",
                        text: new Date(video.pubDate).toLocaleDateString(),
                    });
                    
                    
                    videoItem.addEventListener("click", () => {
                        if (this.onVideoSelect) {
                            this.onVideoSelect(video);
                        } else {
                            this.loadVideo(video);
                        }
                    });
                });
            } else {
                relatedContainer.createDiv({
                    cls: "rss-video-related-empty",
                    text: "No related videos found",
                });
            }
        }
    }
    
    
    destroy(): void {
        if (this.iframeEl) {
            this.iframeEl.src = "";
            this.iframeEl.remove();
            this.iframeEl = null;
        }
        
        this.playerEl = null;
    }
}
