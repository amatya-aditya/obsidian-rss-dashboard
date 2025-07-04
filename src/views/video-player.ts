import { Notice } from "obsidian";
import { FeedItem } from "../types/types";
import { setIcon } from "obsidian";
import { ensureUtf8Meta } from '../utils/platform-utils';

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
            
            new Notice("Error: No video ID provided");
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
        
        this.container.empty();
        
        
        this.playerEl = this.container.createDiv({
            cls: "rss-video-player",
        });
        
        
        const infoSection = this.playerEl.createDiv({
            cls: "rss-video-info",
        });
        
        
        const videoContainer = this.playerEl.createDiv({
            cls: "rss-video-container",
        });
        
        
        this.iframeEl = document.createElement("iframe");
        this.iframeEl.src = `https://www.youtube.com/embed/${this.currentItem.videoId}?rel=0&autoplay=1`;
        this.iframeEl.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
        this.iframeEl.allowFullscreen = true;
        
        videoContainer.appendChild(this.iframeEl);
        
        
        const details = this.playerEl.createDiv({
            cls: "rss-video-details",
        });
        
        details.createEl("h3", {
            cls: "rss-video-title",
            text: this.currentItem.title,
        });
        
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
        
        
        const youtubeButton = linksContainer.createDiv({
            cls: "rss-video-youtube-button",
        });
        
        setIcon(youtubeButton, "youtube");
        
        youtubeButton.addEventListener("click", () => {
            window.open(`https://www.youtube.com/watch?v=${this.currentItem!.videoId}`, "_blank");
        });
        
        
        const qualityContainer = linksContainer.createDiv({
            cls: "rss-video-quality",
        });
        
        qualityContainer.createDiv({
            cls: "rss-video-quality-label",
            text: "Quality: ",
        });
        
        const qualityOptions = qualityContainer.createDiv({
            cls: "rss-video-quality-options",
        });
        
        
        const qualities = ["SD", "HD", "Full HD"];
        
        qualities.forEach((quality, index) => {
            const qualityButton = qualityOptions.createDiv({
                cls: `rss-video-quality-option ${index === 1 ? "active" : ""}`,
                text: quality,
            });
            
            qualityButton.addEventListener("click", () => {
                
                qualityOptions.querySelectorAll(".rss-video-quality-option").forEach(el => {
                    el.classList.remove("active");
                });
                
                qualityButton.classList.add("active");
                
                
                if (this.iframeEl && this.currentItem) {
                    
                    let quality = "";
                    if (index === 0) quality = "medium"; 
                    else if (index === 1) quality = "hd720"; 
                    else if (index === 2) quality = "hd1080"; 
                    
                    
                    this.iframeEl.src = `https://www.youtube.com/embed/${this.currentItem.videoId}?rel=0&vq=${quality}`;
                }
            });
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
            v.guid !== this.currentItem!.guid && 
            v.videoId && 
            v.feedUrl === this.currentItem!.feedUrl
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
